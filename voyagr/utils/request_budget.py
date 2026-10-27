"""Cooperative request-local routing budget, including transport and retry waits.

Requests timeouts cannot preempt CPU or guarantee a hard wall-clock deadline for
slow trickle responses. Late results are discarded at the HTTP boundary.
"""
import time
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
