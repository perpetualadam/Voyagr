"""Pure package-plan checks; the opt-in Docker smoke is a separate CI job."""
import copy
from pathlib import Path

import pytest

from prototypes.graphhopper11.container.plan import proposal, service_command
from prototypes.graphhopper11.container.stage_vps2 import SOURCE_HASH, merge_registry

IMAGE='sha256:'+'a'*64
ROOT=Path('/opt/voyagr-gh11-app-preview')


def test_service_plan_has_private_socket_nonroot_limits_and_no_public_or_production_mounts():
    command=service_command(IMAGE,ROOT,'voyagr-gh11-app-preview')
    assert command[-1]==IMAGE
    assert '--network=none' in command and '--read-only' in command and '--pull=never' in command
    assert '--user=10001:10001' in command and '--cap-drop=ALL' in command
    assert '--memory=6g' in command and '--memory-swap=6g' in command
    assert '--cpus=1' in command and '--pids-limit=256' in command
    assert not any(arg.startswith(('--publish','--network=host','--privileged','--env=PASSWORD')) for arg in command)
    mounts=[command[i+1] for i,arg in enumerate(command) if arg=='--mount']
    assert len(mounts)==3 and all('src='+str(ROOT)+'/' in item for item in mounts)
    assert any('dst=/inputs,readonly' in item for item in mounts)
    assert any('dst=/run/secrets/gh11-password,readonly' in item for item in mounts)
    assert not any('docker.sock' in item for item in mounts)


@pytest.mark.parametrize('image,root,name',[
    ('mutable:latest',ROOT,'voyagr-gh11-app-preview'),
    (IMAGE,Path('/opt/voyagr'),'voyagr-gh11-app-preview'),
    (IMAGE,ROOT,'voyagr-phone-candidate'),
    (IMAGE,Path('/opt/voyagr-gh11-app-preview/../voyagr'),'voyagr-gh11-app-preview'),
])
def test_plan_refuses_ambiguous_images_or_existing_service_paths(image,root,name):
    with pytest.raises(ValueError): service_command(image,root,name)


def test_plan_is_render_only_and_rollback_targets_just_its_new_container():
    plan=proposal(IMAGE,ROOT,'voyagr-gh11-app-preview')
    assert plan['status']=='PROPOSED_NOT_EXECUTED'
    assert plan['stop']=='docker stop --time=15 voyagr-gh11-app-preview'
    assert plan['remove_container']=='docker rm voyagr-gh11-app-preview'
    assert '127.0.0.1:18511:' in plan['tunnel']
    assert str(ROOT/'run/service.sock') in plan['tunnel']
    assert 'rm -r' not in str(plan)
    assert 'dst=/inputs,readonly' in plan['manifest_prepare']


def fixture():
    return {'source_pbf_sha256':SOURCE_HASH,
            'associations':[{'id':'camera','points':[[0,0],[0,.01]]}],
            'cases':[{'id':'first','blocked_associations':['camera']}]}


def test_registry_merge_keeps_identical_association_and_both_distinct_cases():
    first=fixture(); second=copy.deepcopy(first); second['cases'][0]['id']='second'
    merged=merge_registry(first,second)
    assert len(merged['associations'])==1
    assert [case['id'] for case in merged['cases']]==['first','second']
    assert merged['source_pbf_sha256']==SOURCE_HASH
    assert first['cases'][0]['id']=='first'


@pytest.mark.parametrize('fault',['source','association','case'])
def test_registry_conflicts_abort_before_staging(fault):
    first=fixture(); second=copy.deepcopy(first); second['cases'][0]['id']='second'
    if fault=='source': second['source_pbf_sha256']='0'*64
    if fault=='association': second['associations'][0]['points']=[[1,1],[2,2]]
    if fault=='case': second['cases'][0]['id']='first'
    with pytest.raises(ValueError): merge_registry(first,second)
