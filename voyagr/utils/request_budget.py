"""Cooperative request-local routing budget, including transport and retry waits.

Requests timeouts cannot preempt CPU or guarantee a hard wall-clock deadline for
slow trickle responses. Late results are discarded at the HTTP boundary.
"""
import time
from contextlib import contextmanager
import requests
from flask import g, has_request_context

class RoutingDeadlineExceeded(requests.exceptions.Timeout):
    pass

class RoutingBudget:
    def __init__(self,seconds=30,clock=None):
        self.clock=clock or time.monotonic
        self.started=self.clock();self.deadline=self.started+seconds
        self.calls=0;self.transport_seconds=0
    def remaining(self): return max(0,self.deadline-self.clock())
    def check(self):
        if self.remaining()<=0: raise RoutingDeadlineExceeded('Routing request deadline exceeded')

def current_budget():
    return getattr(g,'routing_budget',None) if has_request_context() else None

def call(method,url,**kwargs):
    budget=current_budget()
    if budget is None: return getattr(requests,method)(url,**kwargs)
    budget.check();remaining=budget.remaining()
    configured=kwargs.get('timeout',10)
    limits=configured if isinstance(configured,tuple) else (configured,configured)
    kwargs['timeout']=(min(3,limits[0] or remaining,remaining),min(limits[1] or remaining,remaining))
    budget.calls+=1;started=budget.clock()
    try: response=getattr(requests,method)(url,**kwargs)
    finally: budget.transport_seconds+=budget.clock()-started
    budget.check()
    return response

def get(url,**kwargs): return call('get',url,**kwargs)
def post(url,**kwargs): return call('post',url,**kwargs)
def retry_wait(seconds):
    budget=current_budget()
    if budget:
        budget.check()
        if seconds>=budget.remaining(): raise RoutingDeadlineExceeded('Insufficient routing retry budget')
    time.sleep(seconds)


def check_budget():
    budget = current_budget()
    if budget:
        budget.check()


@contextmanager
def stage(name):
    """Bounded monotonic stage timing; cooperative checks, never a hard interrupt."""
    if name not in {'metadata', 'hazards', 'custom_model', 'graphhopper', 'valhalla', 'osrm', 'assessment', 'serialization'}:
        raise ValueError('Unknown routing stage')
    budget = current_budget()
    check_budget()
    started = budget.clock() if budget else time.monotonic()
    try:
        yield
    finally:
        elapsed = max(0, ((budget.clock() if budget else time.monotonic()) - started) * 1000)
        if budget:
            if not hasattr(budget, 'stages'): budget.stages = {}
            entry = budget.stages.setdefault(name, {'calls': 0, 'elapsed_ms': 0})
            entry['calls'] += 1
            entry['elapsed_ms'] = round(entry['elapsed_ms'] + elapsed, 3)
        check_budget()


def deadline_response():
    from flask import jsonify
    budget = current_budget()
    elapsed = max(0, (budget.clock() - budget.started) * 1000) if budget else 0
    response = jsonify(success=False, error='Routing request deadline exceeded; current route retained.',
                       error_code='ROUTING_DEADLINE_EXCEEDED', error_origin='application',
                       automatic_selection_allowed=False, elapsed_ms=round(elapsed, 3),
                       stage_timings=getattr(budget, 'stages', {}))
    response.status_code = 504
    response.headers['X-Voyagr-Error-Origin'] = 'application'
    response.headers['Cache-Control'] = 'no-store'
    return response
