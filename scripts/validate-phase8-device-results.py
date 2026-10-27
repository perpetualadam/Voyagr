#!/usr/bin/env python3
"""Validate operator result completeness, never infer physical tests from simulation."""
import argparse,datetime,json,re,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from voyagr.utils.road_evidence import read_bounded


def validate(data):
    template=json.loads(Path(__file__).with_name('fixtures').joinpath('phase8/pwa-device-results-template.json').read_text())
    expected={c['id'] for c in template['cases']};errors=[]
    if not isinstance(data,dict):return {'status':'REAL_DEVICE_ACCEPTANCE_NOT_TESTED','errors':['Expected object']}
    cases=data.get('cases',[])
    if not isinstance(cases,list) or any(not isinstance(c,dict) for c in cases):cases=[]
    ids=[c.get('id') for c in cases]
    if len(ids)!=len(expected) or set(str(i) for i in ids)!=expected:errors.append('Expected each of the 20 cases exactly once')
    if data.get('schema_version')!=1:errors.append('Unsupported results schema')
    if data.get('execution_environment')!='physical-device':errors.append('No physical-device execution attested')
    for field in ('device_model','os_version','browser_version','recorded_at'):
        if not isinstance(data.get(field),str) or not data[field].strip():errors.append('Missing '+field)
    try:
        stamp=datetime.datetime.fromisoformat(data.get('recorded_at','').replace('Z','+00:00'))
        if stamp.tzinfo is None or stamp>datetime.datetime.now(datetime.timezone.utc):raise ValueError()
    except (ValueError,TypeError,AttributeError,OverflowError):
        errors.append('Invalid recorded_at: require a past/present timezone-aware timestamp')
    if not isinstance(data.get('app_commit'),str) or not re.fullmatch('[0-9a-f]{40}',data['app_commit']):errors.append('Exact app commit required')
    if data.get('observation_role') not in ('stationary','passenger'):errors.append('Stationary/passenger observations required')
    if any(c.get('status') not in ('PASS','FAIL','NOT_TESTED','BLOCKED') for c in cases):errors.append('Unknown case outcome')
    if any(c.get('status')=='PASS' and (not isinstance(c.get('evidence_notes'),str) or not c['evidence_notes'].strip()) for c in cases):errors.append('PASS requires observable evidence notes')
    counts={s:sum(c.get('status')==s for c in cases) for s in ('PASS','FAIL','NOT_TESTED','BLOCKED')}
    recorded=not errors and counts['PASS']==20
    return {'status':'OPERATOR_RECORDED_RESULTS_REQUIRE_INDEPENDENT_REVIEW' if recorded else 'REAL_DEVICE_ACCEPTANCE_NOT_TESTED',
            'errors':errors,'counts':counts,'production_release_authorized':False}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('results',type=Path);args=p.parse_args()
    try:result=validate(json.loads(read_bounded(args.results)))
    except (OSError,ValueError) as error:result={'status':'REAL_DEVICE_ACCEPTANCE_NOT_TESTED','errors':[str(error)]}
    print(json.dumps(result,indent=2));sys.exit(0 if result['status']=='OPERATOR_RECORDED_RESULTS_REQUIRE_INDEPENDENT_REVIEW' else 1)
