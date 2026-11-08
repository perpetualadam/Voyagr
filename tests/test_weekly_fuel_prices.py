"""Real discovery/parser/cache/transport-budget checks with fixture HTTP only."""
from dataclasses import FrozenInstanceError
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import threading
from unittest.mock import patch

import pytest
import requests

from voyagr.services import weekly_fuel_prices as fuel
from voyagr.utils import request_budget as rb

NOW = datetime(2026, 11, 8, 12, tzinfo=timezone.utc)
URL = 'https://assets.publishing.service.gov.uk/media/example/weekly.csv'
CSV = (Path(__file__).parent / 'fixtures/fuel_prices/weekly.csv').read_bytes()
HTML = f'<h3><a href="{URL}">Weekly road fuel prices (CSV) <span>2018 to 2026</span></a></h3>'.encode()


class Reply:
    def __init__(self, body=b'', content_type='text/html', status=200, headers=None, chunks=None):
        self.body, self.status_code = body, status
        self.headers = {'Content-Type': content_type, 'Content-Length': str(len(body)), **(headers or {})}
        self.chunks, self.closed = chunks, False

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.closed = True

    def close(self):
        self.closed = True

    def iter_content(self, size):
        yield from self.chunks if self.chunks is not None else [self.body]


def responses(csv=CSV, html=HTML):
    return [Reply(html), Reply(csv, 'text/csv; charset=utf-8')]


def cache(path=None, **kwargs):
    return fuel.WeeklyFuelPriceCache(path, clock=lambda: NOW, monotonic=lambda: 100, **kwargs)


def seed(client, csv=CSV):
    with patch.object(rb.requests, 'get', side_effect=responses(csv)):
        assert client.refresh(force=True)['state'] == 'REFRESHED'


def test_real_transport_discovery_and_prices_preserve_units_dates_and_bounded_options():
    replies = responses()
    with patch.object(rb.requests, 'get', side_effect=replies) as transport:
        client = cache()
        assert client.quote('petrol') is None
        result = client.refresh()
        petrol, diesel = client.quote('petrol'), client.quote('diesel')
        assert result['state'] == 'REFRESHED'
        assert [c.args[0] for c in transport.call_args_list] == [fuel.PUBLICATION_URL, URL]
        assert all(c.kwargs['allow_redirects'] is False and c.kwargs['stream'] is True and
                   c.kwargs['timeout'][0] <= 3 and c.kwargs['timeout'][1] <= 5 for c in transport.call_args_list)
    assert all(r.closed for r in replies)
    assert petrol['price_gbp_per_l'] == '1.7278' and diesel['price_gbp_per_l'] == '1.9858'
    assert petrol['original_unit'] == 'GBp/L' and petrol['original_price'] == '172.78'
    assert petrol['currency'] == 'GBP' and petrol['kind'] == 'UK_WEEKLY_AVERAGE'
    assert petrol['observation_date'] == '2026-11-02' and petrol['retrieved_at'] == NOW.isoformat()
    assert petrol['snapshot_id'] == diesel['snapshot_id'] and client.quote('E10') is None


def test_discovery_selects_newest_series_not_archived_csv_and_rejects_ambiguity():
    old = b'<a href="https://assets.publishing.service.gov.uk/media/old/weekly.csv">Weekly road fuel prices (CSV) 2003 to 2017</a>'
    assert fuel.discover_attachment(old + HTML) == URL
    with pytest.raises(fuel.PriceDataError, match='AMBIGUOUS_ATTACHMENT'):
        fuel.discover_attachment(HTML + HTML.replace(b'example', b'other'))
    with pytest.raises(fuel.PriceDataError, match='ATTACHMENT_NOT_FOUND'):
        fuel.discover_attachment(b'<html>No current CSV</html>')


@pytest.mark.parametrize('bad', ['http://assets.publishing.service.gov.uk/media/x.csv',
    'https://127.0.0.1/media/x.csv', 'https://assets.publishing.service.gov.uk.evil.test/media/x.csv',
    'https://assets.publishing.service.gov.uk@evil.test/media/x.csv',
    'https://assets.publishing.service.gov.uk:443/media/x.csv',
    'https://assets.publishing.service.gov.uk/media/../x.csv',
    'https://assets.publishing.service.gov.uk/media/x.csv?secret=x'])
def test_untrusted_download_links_do_not_make_a_second_request(bad):
    with patch.object(rb.requests, 'get', return_value=Reply(HTML.replace(URL.encode(), bad.encode()))) as transport:
        assert cache().refresh()['state'] == 'FAILED'
    assert transport.call_count == 1


def test_redirect_targets_are_checked_before_access():
    first = Reply(status=302, headers={'Location': 'http://169.254.169.254/latest/meta-data'})
    with patch.object(rb.requests, 'get', return_value=first) as transport:
        assert cache().refresh()['reason'] == 'DISALLOWED_URL'
    assert transport.call_count == 1 and first.closed


def test_valid_attachment_redirect_works_but_redirect_loops_are_bounded():
    new_url = URL.replace('example', 'new')
    with patch.object(rb.requests, 'get', side_effect=[Reply(HTML), Reply(status=302, headers={'Location': new_url}), Reply(CSV, 'text/csv')]):
        client = cache()
        assert client.refresh()['state'] == 'REFRESHED' and client.quote('diesel')['source_url'] == new_url
    with patch.object(rb.requests, 'get', return_value=Reply(status=302, headers={'Location': fuel.PUBLICATION_URL})) as transport:
        assert cache().refresh()['reason'] == 'TOO_MANY_REDIRECTS'
    assert transport.call_count == 4


@pytest.mark.parametrize('raw', [CSV.replace(b'pence/litre', b'pounds/litre', 1),
    b'<html>upstream error</html>', CSV.replace(b'02/11/2026', b'09/11/2026'),
    CSV.replace(b'02/11/2026', b'31/02/2026'), CSV.replace(b'172.78', b'1.7278'),
    CSV.replace(b'172.78', b'NaN'), CSV.replace(b'172.78', b'-100'), CSV.replace(b'172.78', b'501'),
    CSV + CSV.splitlines()[2] + b'\n', CSV[:-8]])
def test_invalid_or_ambiguous_csv_cannot_replace_last_good_snapshot(raw):
    client = cache()
    seed(client)
    previous = client.snapshot()
    with patch.object(rb.requests, 'get', side_effect=responses(raw)):
        assert client.refresh(force=True)['state'] == 'FAILED'
    assert client.snapshot() is previous and client.quote('petrol')['price_gbp_per_l'] == '1.7278'


def test_bom_reordered_columns_and_rows_are_valid_but_duplicates_or_excess_rows_fail(monkeypatch):
    text = CSV.decode()
    lines = [','.join(reversed(line.split(','))) for line in text.splitlines()]
    parsed = fuel.parse_weekly_csv(('\ufeff' + '\n'.join(lines)).encode(), retrieved_at=NOW, source_url=URL)
    assert parsed.petrol_pence == '172.78' and parsed.observation_date == '2026-11-02'
    header, *rows = text.splitlines()
    with pytest.raises(fuel.PriceDataError, match='INVALID_HEADERS'):
        fuel.parse_weekly_csv((header + ',Date\n').encode(), retrieved_at=NOW, source_url=URL)
    monkeypatch.setattr(fuel, 'MAX_ROWS', 2)
    with pytest.raises(fuel.PriceDataError, match='TOO_MANY_ROWS'):
        fuel.parse_weekly_csv(CSV, retrieved_at=NOW, source_url=URL)


@pytest.mark.parametrize('reply', [Reply(status=503), Reply(HTML, 'application/json'),
    Reply(HTML, headers={'Content-Length': str(fuel.HTML_LIMIT + 1)}),
    Reply(HTML, headers={'Content-Length': str(len(HTML) + 1)}),
    Reply(HTML, headers={'Content-Length': ''})])
def test_http_status_type_size_and_truncation_are_not_empty_price_data(reply):
    with patch.object(rb.requests, 'get', return_value=reply):
        client = cache()
        assert client.refresh()['state'] == 'FAILED'
    assert reply.closed and client.quote('petrol') is None


def test_stream_size_limit_applies_without_content_length():
    reply = Reply(chunks=[b'x' * (fuel.HTML_LIMIT + 1)])
    del reply.headers['Content-Length']
    with patch.object(rb.requests, 'get', return_value=reply):
        assert cache().refresh()['reason'] == 'BODY_TOO_LARGE'
    assert reply.closed


def test_daily_cadence_backoff_and_quote_reads_do_not_fetch_or_retimestamp():
    wall, mono = [NOW], [100.0]
    client = fuel.WeeklyFuelPriceCache(clock=lambda: wall[0], monotonic=lambda: mono[0])
    seed(client)
    first = client.quote('petrol')
    with patch.object(rb.requests, 'get', side_effect=requests.Timeout('private provider details')) as transport:
        wall[0] += timedelta(hours=1)
        assert client.refresh()['state'] == 'THROTTLED'
        assert client.quote('petrol') == first
        transport.assert_not_called()
        mono[0] += 86401
        assert client.refresh()['reason'] == 'ACQUISITION_OR_PERSISTENCE'
        assert client.refresh()['state'] == 'THROTTLED' and transport.call_count == 1
        assert client.status()['retry_after_seconds'] == 60
        for _ in range(8):
            client.refresh(force=True)
        assert client.status()['retry_after_seconds'] == 3600
    assert client.quote('petrol') == first


def test_old_or_future_observation_is_not_automatically_usable_and_copy_cannot_mutate_cache():
    wall = [NOW]
    client = fuel.WeeklyFuelPriceCache(clock=lambda: wall[0])
    seed(client)
    quote = client.quote('petrol')
    quote['price_gbp_per_l'] = '0'
    assert client.quote('petrol')['price_gbp_per_l'] == '1.7278'
    with pytest.raises(FrozenInstanceError):
        client.snapshot().petrol_pence = '0'
    wall[0] = NOW.replace(day=16)
    assert client.quote('petrol') is not None
    wall[0] += timedelta(days=1)
    assert client.quote('petrol') is None and client.status()['state'] == 'STALE'
    wall[0] = NOW.replace(day=1)
    assert client.quote('petrol') is None


def test_persistence_restart_and_failed_atomic_replace_preserve_last_good(tmp_path):
    path = tmp_path / 'fuel.json'
    client = cache(path)
    assert not path.exists()
    seed(client)
    original = path.read_bytes()
    restarted = cache(path)
    assert restarted.quote('diesel') == client.quote('diesel')
    assert restarted.refresh()['state'] == 'THROTTLED'
    newer = CSV.replace(b'02/11/2026', b'06/11/2026')
    with patch.object(rb.requests, 'get', side_effect=responses(newer)), patch.object(fuel.os, 'replace', side_effect=OSError('disk failed')):
        assert client.refresh(force=True)['state'] == 'FAILED'
    assert path.read_bytes() == original and client.snapshot() == restarted.snapshot()
    assert not list(tmp_path.glob('.fuel.json-*'))
    with patch.object(rb.requests, 'get', side_effect=responses(CSV.replace(b'02/11/2026', b'25/10/2026'))):
        # Remaining 26 October row becomes latest, still older than 2 November.
        assert client.refresh(force=True)['reason'] == 'OBSERVATION_ROLLBACK'
    assert path.read_bytes() == original


@pytest.mark.parametrize('change', [lambda d: {**d, 'version': True}, lambda d: {**d, 'petrol_pence': '1.7'},
    lambda d: {**d, 'source_url': 'https://evil.test/file.csv'},
    lambda d: {**d, 'observation_date': '20261102'}, lambda d: {**d, 'retrieved_at': '2026-11-08T12:00:00'},
    lambda d: {**d, 'observation_date': '2027-01-01'}, lambda d: []])
def test_invalid_disk_cache_is_not_trusted_as_a_quote(tmp_path, change):
    path = tmp_path / 'fuel.json'
    seed(cache(path))
    path.write_text(json.dumps(change(json.loads(path.read_text()))))
    restored = cache(path)
    assert restored.quote('petrol') is None and restored.status()['last_error'] == 'INVALID_CACHE'


def test_thread_single_flight_keeps_reads_nonblocking():
    client = cache()
    seed(client)
    entered, release = threading.Event(), threading.Event()
    replies = iter(responses(CSV.replace(b'02/11/2026', b'06/11/2026')))

    def slow(*args, **kwargs):
        if not entered.is_set():
            entered.set()
            assert release.wait(5)
        return next(replies)

    with patch.object(rb.requests, 'get', side_effect=slow) as transport:
        worker = threading.Thread(target=lambda: client.refresh(force=True))
        worker.start()
        try:
            assert entered.wait(5)
            assert client.refresh(force=True)['state'] == 'IN_PROGRESS'
            assert client.quote('petrol')['observation_date'] == '2026-11-02'
        finally:
            release.set()
            worker.join(5)
    assert not worker.is_alive() and transport.call_count == 2
    assert client.quote('petrol')['observation_date'] == '2026-11-06'


def test_file_lock_prevents_overlapping_instances_and_second_load_sees_new_snapshot(tmp_path):
    path = tmp_path / 'fuel.json'
    first, second = cache(path), cache(path)
    with first._file_lock() as acquired:
        assert acquired
        with patch.object(rb.requests, 'get') as transport:
            assert second.refresh()['state'] == 'IN_PROGRESS'
        transport.assert_not_called()
    seed(first)
    with patch.object(rb.requests, 'get') as transport:
        assert second.refresh()['state'] == 'THROTTLED'
    transport.assert_not_called()
    assert second.quote('petrol') == first.quote('petrol')


def test_expired_parent_and_late_transport_cannot_publish():
    tick = [0.0]
    parent = rb.RoutingBudget(1, clock=lambda: tick[0])
    tick[0] = 2
    client = cache()
    with rb.use_budget(parent), patch.object(rb.requests, 'get') as transport, pytest.raises(rb.RoutingDeadlineExceeded):
        client.refresh()
    transport.assert_not_called()
    tick[0] = 0

    def late(*args, **kwargs):
        tick[0] = 2
        return Reply(HTML)

    with rb.use_budget(parent), patch.object(rb.requests, 'get', side_effect=late), pytest.raises(rb.RoutingDeadlineExceeded):
        cache().refresh()
    assert client.snapshot() is None


def test_import_and_cache_refresh_do_not_change_current_route_cost_resolution():
    from voyagr.config.rates import resolve_route_cost_params
    before = resolve_route_cost_params({})
    client = cache()
    seed(client)
    assert resolve_route_cost_params({}) == before
    assert resolve_route_cost_params({'fuel_price': 1.23})['fuel_price'] == 1.23
    with patch.object(rb.requests, 'get') as transport:
        assert client.quote('petrol') is not None
    transport.assert_not_called()


def test_own_deadline_discards_late_stream_without_renewing_snapshot(tmp_path):
    client = cache(tmp_path / 'fuel.json')
    seed(client)
    previous = client.snapshot()
    original = client.path.read_bytes()

    def cancelled(*args, **kwargs):
        rb.current_budget().cancel()
        return Reply(HTML)

    with patch.object(rb.requests, 'get', side_effect=cancelled):
        assert client.refresh(force=True)['reason'] == 'DEADLINE'
    assert client.snapshot() is previous and client.path.read_bytes() == original


def test_too_large_or_non_json_disk_cache_stays_unavailable(tmp_path):
    path = tmp_path / 'fuel.json'
    for value in ('<html>not JSON</html>', 'x' * (fuel.CACHE_LIMIT + 1)):
        path.write_text(value)
        restored = cache(path)
        assert restored.quote('diesel') is None and restored.status()['last_error'] == 'INVALID_CACHE'


def test_same_observation_has_stable_identity_and_clock_changes_only_on_actual_fetch():
    wall = [NOW]
    client = fuel.WeeklyFuelPriceCache(clock=lambda: wall[0])
    seed(client)
    original = client.quote('petrol')
    wall[0] += timedelta(hours=1)
    assert client.quote('petrol') == original
    with patch.object(rb.requests, 'get', side_effect=responses()):
        assert client.refresh(force=True)['state'] == 'UNCHANGED'
    latest = client.quote('petrol')
    assert latest['snapshot_id'] == original['snapshot_id'] and latest['observation_date'] == original['observation_date']
    assert latest['retrieved_at'] != original['retrieved_at']


@pytest.mark.parametrize('policy', [{'refresh_seconds': 0}, {'refresh_seconds': float('nan')},
    {'budget_seconds': 31}, {'max_age_days': True}, {'max_age_days': -1}])
def test_invalid_policy_cannot_start_acquisition(policy):
    with patch.object(rb.requests, 'get') as transport, pytest.raises(ValueError):
        cache(**policy)
    transport.assert_not_called()


def test_unknown_or_implausible_source_never_creates_a_quote():
    with pytest.raises(fuel.PriceDataError, match='INVALID_RETRIEVAL_TIME'):
        fuel.parse_weekly_csv(CSV, retrieved_at=NOW.replace(tzinfo=None), source_url=URL)
    with pytest.raises(fuel.PriceDataError, match='INVALID_CSV_SOURCE'):
        fuel.parse_weekly_csv(CSV, retrieved_at=NOW, source_url='https://evil.test/weekly.csv')


def test_operator_command_refreshes_only_explicit_cache_and_reports_route_pricing_disabled(tmp_path, capsys):
    import importlib.util
    script = Path(__file__).parents[1] / 'scripts/refresh-weekly-fuel-prices.py'
    spec = importlib.util.spec_from_file_location('weekly_fuel_operator', script)
    command = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(command)
    path = tmp_path / 'explicit.json'
    original_type = fuel.WeeklyFuelPriceCache
    factory = lambda *args, **kwargs: original_type(*args, clock=lambda: NOW, **kwargs)
    with patch.object(fuel, 'WeeklyFuelPriceCache', side_effect=factory), patch.object(rb.requests, 'get', side_effect=responses()):
        assert command.main(['--cache-file', str(path)]) == 0
    output = json.loads(capsys.readouterr().out)
    assert path.is_file() and output['route_pricing_changed'] is False
    assert output['quotes']['petrol']['original_unit'] == 'GBp/L'
    before = path.read_bytes()
    with patch.object(fuel, 'WeeklyFuelPriceCache', side_effect=factory), patch.object(rb.requests, 'get', return_value=Reply(status=503)):
        assert command.main(['--cache-file', str(path), '--force']) == 1
    assert path.read_bytes() == before


@pytest.mark.parametrize('length', ['9' * 5000, '²', '-1'])
def test_malformed_content_length_is_controlled_failure(length):
    with patch.object(rb.requests, 'get', return_value=Reply(HTML, headers={'Content-Length': length})):
        assert cache().refresh()['state'] == 'FAILED'


def test_disk_write_overrunning_parent_deadline_cannot_commit(tmp_path):
    client = cache(tmp_path / 'fuel.json')
    seed(client)
    original, previous = client.path.read_bytes(), client.snapshot()
    tick = [0.0]
    parent = rb.RoutingBudget(1, clock=lambda: tick[0])

    def slow_sync(descriptor):
        tick[0] = 2

    with rb.use_budget(parent), patch.object(rb.requests, 'get', side_effect=responses()), \
            patch.object(fuel.os, 'fsync', side_effect=slow_sync), pytest.raises(rb.RoutingDeadlineExceeded):
        client.refresh(force=True)
    assert client.path.read_bytes() == original and client.snapshot() is previous
    assert not list(tmp_path.glob('.fuel.json-*'))


def test_persistent_lock_is_observed_by_a_separate_process(tmp_path):
    import subprocess
    import sys
    path = tmp_path / 'fuel.json'
    client = cache(path)
    code = 'import json,sys;from voyagr.services.weekly_fuel_prices import WeeklyFuelPriceCache;print(json.dumps(WeeklyFuelPriceCache(sys.argv[1]).refresh()))'
    with client._file_lock() as acquired:
        assert acquired
        result = subprocess.run([sys.executable, '-c', code, str(path)], capture_output=True, text=True, timeout=15, check=True)
    assert json.loads(result.stdout)['state'] == 'IN_PROGRESS' and not path.exists()
