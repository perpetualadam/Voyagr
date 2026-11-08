"""Inactive, bounded DESNZ weekly-average acquisition/cache. No routing side effects.

Instantiate explicitly and refresh from a separate operator/background task. Reading
quotes never performs HTTP. Persistent refresh locks require POSIX (the VPS target).
"""
from contextlib import contextmanager
import csv
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import hashlib
from html.parser import HTMLParser
import io
import json
import math
import os
from pathlib import Path
import re
import tempfile
import threading
import time
from urllib.parse import unquote, urljoin, urlsplit

import requests
from voyagr.utils import request_budget as rb

PUBLICATION_URL = 'https://www.gov.uk/government/statistics/weekly-road-fuel-prices'
DATE_HEADER = 'Date'
PETROL_HEADER = 'ULSP (Ultra low sulphur unleaded petrol) Pump price in pence/litre'
DIESEL_HEADER = 'ULSD (Ultra low sulphur diesel) Pump price in pence/litre'
HTML_LIMIT = 512 * 1024
CSV_LIMIT = 2 * 1024 * 1024
CACHE_LIMIT = 16384
MAX_ROWS = 10000


class PriceDataError(ValueError):
    """Fixed diagnostic codes; provider bodies and exception strings are not logged."""


def _now():
    return datetime.now(timezone.utc)


def _pence(value, minimum=Decimal('50'), maximum=Decimal('500')):
    if not isinstance(value, str) or not re.fullmatch(r'\d{1,4}(?:\.\d{1,4})?', value.strip()):
        raise PriceDataError('INVALID_PRICE')
    number = Decimal(value.strip())
    if not minimum <= number <= maximum:
        raise PriceDataError('PRICE_OUT_OF_RANGE')
    return format(number.normalize(), 'f')


def _allowed_url(url, attachment):
    try:
        parts = urlsplit(url)
        if (len(url) > 2048 or any(ord(c) < 33 for c in url) or parts.scheme != 'https' or
                parts.username is not None or parts.password is not None or parts.port is not None or
                parts.query or parts.fragment or any(ord(c) < 32 for c in unquote(parts.path)) or
                '..' in unquote(parts.path).split('/')):
            return False
        if attachment:
            return (parts.netloc == 'assets.publishing.service.gov.uk' and
                    parts.path.startswith(('/media/', '/government/uploads/system/uploads/attachment_data/file/')) and
                    parts.path.lower().endswith('.csv'))
        return parts.netloc == 'www.gov.uk' and parts.path.rstrip('/') == urlsplit(PUBLICATION_URL).path
    except (ValueError, TypeError):
        return False


class _Attachments(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.current = [dict(attrs).get('href', ''), []]

    def handle_data(self, value):
        if self.current is not None:
            self.current[1].append(value)

    def handle_endtag(self, tag):
        if tag == 'a' and self.current is not None:
            self.links.append((self.current[0], ' '.join(' '.join(self.current[1]).split())))
            self.current = None


def discover_attachment(html):
    if len(html) > HTML_LIMIT:
        raise PriceDataError('PUBLICATION_TOO_LARGE')
    parser = _Attachments()
    parser.feed(html.decode('utf-8-sig'))
    candidates = []
    for href, label in parser.links:
        match = re.fullmatch(r'Weekly road fuel prices \(CSV\) (\d{4}) to (\d{4})', label)
        if not match:
            continue
        first, last = map(int, match.groups())
        url = urljoin(PUBLICATION_URL, href)
        if first > last or not _allowed_url(url, True):
            raise PriceDataError('INVALID_ATTACHMENT')
        candidates.append(((last, first), url))
    if not candidates:
        raise PriceDataError('ATTACHMENT_NOT_FOUND')
    rank = max(item[0] for item in candidates)
    urls = {url for candidate_rank, url in candidates if candidate_rank == rank}
    if len(urls) != 1:
        raise PriceDataError('AMBIGUOUS_ATTACHMENT')
    return urls.pop()


@dataclass(frozen=True)
class WeeklySnapshot:
    observation_date: str
    petrol_pence: str
    diesel_pence: str
    retrieved_at: str
    source_url: str

    @property
    def snapshot_id(self):
        # Retrieval or attachment-URL rotation does not change the observed prices.
        value = [self.observation_date, self.petrol_pence, self.diesel_pence, 'DESNZ_WEEKLY_V1']
        return hashlib.sha256(json.dumps(value, separators=(',', ':')).encode()).hexdigest()[:24]


def parse_weekly_csv(raw, *, retrieved_at, source_url):
    if (not isinstance(retrieved_at, datetime) or retrieved_at.tzinfo is None or
            retrieved_at.utcoffset() != timedelta(0)):
        raise PriceDataError('INVALID_RETRIEVAL_TIME')
    if len(raw) > CSV_LIMIT or not _allowed_url(source_url, True):
        raise PriceDataError('INVALID_CSV_SOURCE')
    reader = csv.reader(io.StringIO(raw.decode('utf-8-sig'), newline=''), strict=True)
    try:
        headers = [' '.join(value.split()) for value in next(reader)]
    except StopIteration as error:
        raise PriceDataError('MISSING_HEADERS') from error
    if len(set(headers)) != len(headers) or not {DATE_HEADER, PETROL_HEADER, DIESEL_HEADER}.issubset(headers):
        raise PriceDataError('INVALID_HEADERS')
    indices = [headers.index(name) for name in (DATE_HEADER, PETROL_HEADER, DIESEL_HEADER)]
    observations = {}
    for count, row in enumerate(reader, 1):
        rb.check_budget()
        if count > MAX_ROWS:
            raise PriceDataError('TOO_MANY_ROWS')
        if not row or all(not value.strip() for value in row):
            continue
        if len(row) != len(headers):
            raise PriceDataError('TRUNCATED_OR_EXTRA_COLUMNS')
        day_text, petrol, diesel = [row[index].strip() for index in indices]
        if not re.fullmatch(r'\d{2}/\d{2}/\d{4}', day_text):
            raise PriceDataError('INVALID_DATE')
        try:
            day = datetime.strptime(day_text, '%d/%m/%Y').date()
        except ValueError as error:
            raise PriceDataError('INVALID_DATE') from error
        if day > retrieved_at.date() or day in observations:
            raise PriceDataError('FUTURE_OR_DUPLICATE_DATE')
        observations[day] = (_pence(petrol), _pence(diesel))
    if not observations:
        raise PriceDataError('NO_OBSERVATIONS')
    day = max(observations)
    petrol, diesel = observations[day]
    return WeeklySnapshot(day.isoformat(), petrol, diesel, retrieved_at.isoformat(), source_url)


def _download(url, *, attachment):
    limit = CSV_LIMIT if attachment else HTML_LIMIT
    types = {'text/csv', 'application/csv', 'application/octet-stream', 'text/plain', 'application/vnd.ms-excel'} if attachment else {'text/html'}
    for _ in range(4):
        rb.check_budget()
        if not _allowed_url(url, attachment):
            raise PriceDataError('DISALLOWED_URL')
        with rb.get(url, stream=True, allow_redirects=False, timeout=(3, 5),
                    headers={'User-Agent': 'Voyagr-weekly-fuel/1.0', 'Accept': 'text/csv' if attachment else 'text/html'}) as response:
            if response.status_code in (301, 302, 303, 307, 308):
                url = urljoin(url, response.headers.get('Location', ''))
                continue
            if response.status_code != 200:
                raise PriceDataError('HTTP_STATUS')
            if response.headers.get('Content-Type', '').split(';')[0].strip().lower() not in types:
                raise PriceDataError('CONTENT_TYPE')
            length = response.headers.get('Content-Length')
            if length is not None and (not isinstance(length, str) or not re.fullmatch(r'[0-9]{1,10}', length) or int(length) > limit):
                raise PriceDataError('BODY_TOO_LARGE')
            body = bytearray()
            for chunk in response.iter_content(8192):
                rb.check_budget()
                body.extend(chunk)
                if len(body) > limit:
                    raise PriceDataError('BODY_TOO_LARGE')
            rb.check_budget()
            if length is not None and not response.headers.get('Content-Encoding') and len(body) != int(length):
                raise PriceDataError('TRUNCATED_BODY')
            return bytes(body), url
    raise PriceDataError('TOO_MANY_REDIRECTS')


class WeeklyFuelPriceCache:
    """Explicitly operated cache; quote reads perform neither HTTP nor file writes.

    Defaults: daily refresh, 14-day maximum observation age, 12-second cooperative
    acquisition budget; failure retry backoff starts at 60s and caps at one hour.
    Successful snapshots alone are persisted. Failures/backoff are process-local;
    run one scheduled refresher, not one job per web worker.
    """
    def __init__(self, cache_path=None, *, clock=_now, monotonic=time.monotonic,
                 refresh_seconds=86400, max_age_days=14, budget_seconds=12):
        for value, maximum in ((refresh_seconds, 604800), (max_age_days, 90), (budget_seconds, 30)):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 < value <= maximum:
                raise ValueError('Invalid weekly fuel-cache policy')
        self.path = Path(cache_path) if cache_path is not None else None
        self.clock, self.monotonic = clock, monotonic
        self.refresh_seconds, self.max_age_days, self.budget_seconds = refresh_seconds, max_age_days, budget_seconds
        self._snapshot = None
        self._state_lock, self._refresh_lock = threading.RLock(), threading.Lock()
        self._next_refresh, self._failures, self._last_error = 0, 0, None
        self._load()

    def _load(self):
        if self.path is None:
            return
        try:
            if not self.path.exists():
                return
            with self.path.open('rb') as source:
                raw = source.read(CACHE_LIMIT + 1)
            if len(raw) > CACHE_LIMIT:
                raise PriceDataError('INVALID_CACHE')
            data = json.loads(raw)
            if type(data.get('version')) is not int or data['version'] != 1 or set(data) != {'version', *WeeklySnapshot.__dataclass_fields__}:
                raise PriceDataError('INVALID_CACHE')
            values = {key: data[key] for key in WeeklySnapshot.__dataclass_fields__}
            if not all(isinstance(value, str) for value in values.values()):
                raise PriceDataError('INVALID_CACHE')
            candidate = WeeklySnapshot(**values)
            day = date.fromisoformat(candidate.observation_date)
            acquired = datetime.fromisoformat(candidate.retrieved_at)
            now = self.clock()
            if (acquired.tzinfo is None or acquired.utcoffset() != timedelta(0) or acquired > now + timedelta(minutes=5) or
                    day.isoformat() != candidate.observation_date or day > acquired.date() or day > now.date() or not _allowed_url(candidate.source_url, True) or
                    _pence(candidate.petrol_pence) != candidate.petrol_pence or _pence(candidate.diesel_pence) != candidate.diesel_pence):
                raise PriceDataError('INVALID_CACHE')
            with self._state_lock:
                if self._snapshot is None or candidate.observation_date >= self._snapshot.observation_date:
                    if candidate != self._snapshot:
                        self._snapshot = candidate
                    remaining = max(0, self.refresh_seconds - (now - acquired).total_seconds())
                    self._next_refresh = max(self._next_refresh, self.monotonic() + remaining)
        except (OSError, ValueError, TypeError, AttributeError, KeyError):
            self._last_error = 'INVALID_CACHE'

    def snapshot(self):
        with self._state_lock:
            return self._snapshot  # frozen value object

    def quote(self, category):
        snapshot = self.snapshot()
        if snapshot is None or category not in ('petrol', 'diesel'):
            return None
        age = (self.clock().date() - date.fromisoformat(snapshot.observation_date)).days
        if not 0 <= age <= self.max_age_days:
            return None
        pence = snapshot.petrol_pence if category == 'petrol' else snapshot.diesel_pence
        return {'version': 1, 'source': 'DESNZ_WEEKLY', 'publication_url': PUBLICATION_URL, 'source_url': snapshot.source_url, 'kind': 'UK_WEEKLY_AVERAGE', 'category': category,
                'currency': 'GBP', 'price_unit': 'GBP/L', 'price_gbp_per_l': format(Decimal(pence) / 100, 'f'),
                'original_unit': 'GBp/L', 'original_price': pence, 'observation_date': snapshot.observation_date,
                'retrieved_at': snapshot.retrieved_at, 'snapshot_id': snapshot.snapshot_id}

    def status(self):
        snapshot = self.snapshot()
        age = None if snapshot is None else (self.clock().date() - date.fromisoformat(snapshot.observation_date)).days
        return {'state': 'EMPTY' if snapshot is None else 'USABLE' if 0 <= age <= self.max_age_days else 'STALE',
                'observation_date': None if snapshot is None else snapshot.observation_date,
                'last_error': self._last_error,
                'retry_after_seconds': max(0, self._next_refresh - self.monotonic())}

    @contextmanager
    def _file_lock(self):
        if self.path is None:
            yield True
            return
        if os.name != 'posix':
            raise PriceDataError('PERSISTENT_LOCK_UNSUPPORTED')
        import fcntl
        descriptor = os.open(str(self.path) + '.lock', os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        try:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                yield False
                return
            try:
                yield True
            finally:
                fcntl.flock(descriptor, fcntl.LOCK_UN)
        finally:
            os.close(descriptor)

    def _publish(self, candidate, budget):
        temporary = None
        try:
            if self.path is not None:
                with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=self.path.parent,
                                                 prefix='.' + self.path.name + '-', delete=False) as target:
                    temporary = target.name
                    json.dump({'version': 1, **asdict(candidate)}, target, sort_keys=True)
                    target.flush()
                    os.fsync(target.fileno())
            with budget.publish_lock, self._state_lock:
                budget.check()
                if self._snapshot is not None and candidate.observation_date < self._snapshot.observation_date:
                    raise PriceDataError('OBSERVATION_ROLLBACK')
                if temporary is not None:
                    os.replace(temporary, self.path)
                    temporary = None
                self._snapshot = candidate
        finally:
            if temporary is not None:
                os.unlink(temporary)

    def refresh(self, *, force=False):
        if not self._refresh_lock.acquire(blocking=False):
            return {'state': 'IN_PROGRESS'}
        parent = rb.current_budget()
        try:
            if not force and self.monotonic() < self._next_refresh:
                return {'state': 'THROTTLED'}
            with self._file_lock() as acquired:
                if not acquired:
                    return {'state': 'IN_PROGRESS'}
                self._load()  # See any newer file published by another refresher.
                if not force and self.monotonic() < self._next_refresh:
                    return {'state': 'THROTTLED'}
                with rb.use_budget(rb.WorkBudget(self.budget_seconds, parent=parent)) as budget:
                    budget.check()
                    html, _ = _download(PUBLICATION_URL, attachment=False)
                    attachment = discover_attachment(html)
                    raw, final_url = _download(attachment, attachment=True)
                    candidate = parse_weekly_csv(raw, retrieved_at=self.clock(), source_url=final_url)
                    previous = self.snapshot()
                    self._publish(candidate, budget)
                self._failures, self._last_error = 0, None
                self._next_refresh = self.monotonic() + self.refresh_seconds
                return {'state': 'REFRESHED' if previous is None or previous.snapshot_id != candidate.snapshot_id else 'UNCHANGED',
                        'snapshot_id': candidate.snapshot_id, 'observation_date': candidate.observation_date}
        except (PriceDataError, OSError, UnicodeError, csv.Error, requests.RequestException) as error:
            self._failures += 1
            self._last_error = 'DEADLINE' if isinstance(error, rb.RoutingDeadlineExceeded) else str(error) if isinstance(error, PriceDataError) else 'ACQUISITION_OR_PERSISTENCE'
            self._next_refresh = self.monotonic() + min(3600, 60 * 2 ** min(self._failures - 1, 6))
            if isinstance(error, rb.RoutingDeadlineExceeded) and parent is not None:
                parent.check()
            return {'state': 'FAILED', 'reason': self._last_error}
        finally:
            self._refresh_lock.release()
