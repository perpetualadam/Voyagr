"""Bounded correlation metadata only; no queries, URLs, coordinates or cancellation policy."""
import contextvars
from contextlib import contextmanager
import logging
import os
import threading
import time
import uuid

from flask import g, has_request_context, request

logger = logging.getLogger(__name__)
_trace = contextvars.ContextVar('overpass_audit_trace', default=None)


def trace():
    if has_request_context():
        return getattr(g, 'overpass_audit_trace', None)
    return _trace.get()


def emit(event, **fields):
    """Callers supply only fixed event names, numeric counts and fixed categories."""
    current = trace()
    record = dict(event=event, request_id=current['id'] if current else 'none',
                  pid=os.getpid(), thread=threading.get_ident())
    if current:
        record['elapsed_ms'] = round(max(0, time.monotonic() - current['started']) * 1000, 3)
    record.update(fields)
    logger.info('overpass_audit %s', record)


@contextmanager
def bind_trace(current):
    """Propagate diagnostic identity only, never Flask context or routing budget."""
    token = _trace.set(current)
    try:
        yield
    finally:
        _trace.reset(token)


def register(app):
    @app.before_request
    def start():
        if not request.path.startswith('/api/'):
            return
        # Ignore untrusted client IDs. Endpoint names are application identifiers.
        g.overpass_audit_trace = {'id': uuid.uuid4().hex, 'started': time.monotonic()}
        emit('request_started', endpoint=request.endpoint or 'unmatched')

    @app.after_request
    def ready(response):
        current = trace()
        if current:
            response.headers['X-Voyagr-Request-ID'] = current['id']
            # Response ready is not proof of delivery or a worker becoming idle.
            emit('response_ready', status=response.status_code)
        return response
