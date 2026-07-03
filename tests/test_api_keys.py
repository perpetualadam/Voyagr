"""Tests for production API key loading."""

from pathlib import Path

import pytest

from voyagr.config import api_keys as ak


class TestLoadValidApiKeys:
    def test_explicit_env(self, monkeypatch, tmp_path):
        monkeypatch.setenv('API_KEYS', 'key-a,key-b')
        monkeypatch.delenv('FLASK_ENV', raising=False)
        keys = ak.load_valid_api_keys(tmp_path)
        assert keys == {'key-a', 'key-b'}

    def test_dev_default_when_not_production(self, monkeypatch, tmp_path):
        monkeypatch.delenv('API_KEYS', raising=False)
        monkeypatch.delenv('FLASK_ENV', raising=False)
        monkeypatch.delenv('ENVIRONMENT', raising=False)
        keys = ak.load_valid_api_keys(tmp_path)
        assert keys == {ak.DEV_DEFAULT_API_KEY}

    def test_production_generates_and_persists(self, monkeypatch, tmp_path):
        monkeypatch.delenv('API_KEYS', raising=False)
        monkeypatch.setenv('FLASK_ENV', 'production')
        key_file = tmp_path / '.api_key'
        keys = ak.load_valid_api_keys(tmp_path)
        assert len(keys) == 1
        assert key_file.exists()
        assert list(keys)[0] == key_file.read_text().strip()

    def test_production_reads_existing_file(self, monkeypatch, tmp_path):
        monkeypatch.delenv('API_KEYS', raising=False)
        monkeypatch.setenv('ENVIRONMENT', 'production')
        (tmp_path / '.api_key').write_text('stored-secret-key')
        keys = ak.load_valid_api_keys(tmp_path)
        assert keys == {'stored-secret-key'}

    def test_race_second_worker_reads_file(self, monkeypatch, tmp_path):
        monkeypatch.delenv('API_KEYS', raising=False)
        monkeypatch.setenv('FLASK_ENV', 'production')
        key_file = tmp_path / '.api_key'
        key_file.write_text('winner-key')
        key_file.chmod(0o600)
        keys = ak.load_valid_api_keys(tmp_path)
        assert keys == {'winner-key'}
