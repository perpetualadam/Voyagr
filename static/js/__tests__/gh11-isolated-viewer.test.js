/** Prototype viewer only; never loads the production app or a live endpoint. */
const fs=require('fs');
const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../../../prototypes/graphhopper11/isolated_viewer.html'),'utf8');
require('../modules/navigation/strict-route-policy.js');
const AI=require('../modules/navigation/avoidance-integrity.js');
const UX=require('../app/navigation-safety-ux.js');
const mount=require('../../../prototypes/graphhopper11/isolated_viewer.js');
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function candidate(name='A road'){
    return {navigation_allowed:false,geometry:{type:'LineString',coordinates:[[0,0],[.01,.01],[.02,0]]},distance_km:2,
        instruction_details:[{name,distance_m:2000}]};
}
const settings={profile:'car',alternatives:false,no_motorways:false,mandatory_associations:['camera'],both_directions:false};
function reference(){return {schema:1,case_id:'public_case',graph_version:'graph',source_version:'source',policy_version:'policy',selected_settings:settings,request_binding:'a'.repeat(64)};}
async function start(routeReply){
    routeReply={plan_reference:reference(),selected_settings:settings,request_binding:'a'.repeat(64),...routeReply};
    global.VoyagrAvoidanceIntegrity=AI;global.VoyagrNavigationSafetyUX=UX;
    document.body.innerHTML=html.match(/<body>([\s\S]*?)<script/)[1];
    global.fetch=jest.fn(async url=>({ok:true,status:200,json:async()=>
        url.endsWith('/cases')?{cases:['public_case'],case_settings:{public_case:settings},case_bindings:{public_case:'a'.repeat(64)}}:
        url.endsWith('/versions')?{graph_version:'graph',source_version:'source',policy_version:'policy'}:routeReply}));
    // Function scope avoids leaking viewer declarations into the production globals.
    mount(globalThis);
    await settle();
}
afterEach(()=>{UX.reset();AI.invalidate();delete global.fetch;});
test('viewer requests registered identity, plots route and renders instruction names as text',async()=>{
    await start({case_id:'public_case',success:true,navigation_allowed:false,graph_version:'graph',source_version:'source',policy_version:'policy',
        candidates:[candidate('<img src=x onerror=alert(1)>'),candidate('Other road')]});
    expect(document.getElementById('calculate').disabled).toBe(false);
    document.getElementById('calculate').click();await settle();
    const call=fetch.mock.calls.find(([url])=>url.endsWith('/route'));
    expect(JSON.parse(call[1].body)).toEqual({case_id:'public_case',selected_settings:settings,graph_version:'graph',source_version:'source',policy_version:'policy'});
    expect(document.getElementById('line').getAttribute('points').split(' ')).toHaveLength(3);
    expect(document.getElementById('instructions').textContent).toContain('<img');
    expect(document.querySelector('#instructions img')).toBeNull();
    const alternatives=document.getElementById('alternatives');
    expect(alternatives.options).toHaveLength(2);alternatives.value='1';alternatives.dispatchEvent(new Event('change'));
    expect(document.getElementById('instructions').textContent).toContain('Other road');
    expect(document.getElementById('strictStart').disabled).toBe(true);
    expect(document.getElementById('routeAvoidanceNotice').textContent).toContain('preview only');
});
test('viewer refuses navigation authority or a mismatched graph response',async()=>{
    await start({case_id:'public_case',success:true,navigation_allowed:true,graph_version:'other',source_version:'source',policy_version:'policy',candidates:[candidate()]});
    document.getElementById('calculate').click();await settle();
    expect(document.getElementById('status').textContent).toBe('Response contract refused.');
    expect(document.getElementById('line').getAttribute('points')).toBe('');
});


test('changing the selected case discards an older successful response',async()=>{
    let resolveRoute;
    await start({case_id:'public_case',success:true,navigation_allowed:false,graph_version:'graph',source_version:'source',policy_version:'policy',candidates:[candidate()]});
    fetch.mockImplementationOnce(()=>new Promise(resolve=>{resolveRoute=resolve;}));
    document.getElementById('calculate').click();await settle();
    document.getElementById('cases').dispatchEvent(new Event('change'));
    resolveRoute({ok:true,status:200,json:async()=>({case_id:'public_case',success:true,navigation_allowed:false,graph_version:'graph',source_version:'source',policy_version:'policy',candidates:[candidate()]})});
    await settle();
    expect(document.getElementById('line').getAttribute('points')).toBe('');
    expect(document.getElementById('status').textContent).toContain('superseded');
    expect(document.getElementById('strictStart').disabled).toBe(true);
});

 test('viewer refuses settings different from its selected registered policy',async()=>{
    await start({case_id:'public_case',success:true,navigation_allowed:false,graph_version:'graph',source_version:'source',policy_version:'policy',selected_settings:{...settings,mandatory_associations:[]},candidates:[candidate()]});
    document.getElementById('calculate').click();await settle();
    expect(document.getElementById('status').textContent).toBe('Response contract refused.');
    expect(document.getElementById('line').getAttribute('points')).toBe('');
});

 test('viewer refuses a different request binding even with identical settings',async()=>{
    await start({case_id:'public_case',success:true,navigation_allowed:false,graph_version:'graph',source_version:'source',policy_version:'policy',request_binding:'b'.repeat(64),candidates:[candidate()]});
    document.getElementById('calculate').click();await settle();
    expect(document.getElementById('status').textContent).toBe('Response contract refused.');
    expect(document.getElementById('line').getAttribute('points')).toBe('');
});

async function renderedPreview(){
    await start({case_id:'public_case',success:true,navigation_allowed:false,graph_version:'graph',source_version:'source',policy_version:'policy',candidates:[candidate()]});
    document.getElementById('calculate').click();await settle();
    return document.getElementById('line').getAttribute('points');
}
test('reference restore requests revalidation without saving browser data or trusting geometry',async()=>{
    const beforeStorage=JSON.stringify(localStorage);
    const points=await renderedPreview();
    const field=document.getElementById('planReference');
    expect(JSON.parse(field.value)).toEqual(reference());
    expect(field.value).not.toContain('geometry');
    document.getElementById('restore').click();await settle();
    const call=fetch.mock.calls.find(([url])=>url.endsWith('/restore'));
    expect(JSON.parse(call[1].body)).toEqual(reference());
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
    expect(document.getElementById('strictStart').disabled).toBe(true);
    expect(JSON.stringify(localStorage)).toBe(beforeStorage);
});
test.each(['settings','graph','source','policy','binding','authority','malformed'])('refused saved %s reference retains current preview without a request',async fault=>{
    const points=await renderedPreview(), saved=reference();
    if(fault==='settings')saved.selected_settings={...settings,mandatory_associations:[]};
    if(fault==='graph')saved.graph_version='changed';
    if(fault==='source')saved.source_version='changed';
    if(fault==='policy')saved.policy_version='changed';
    if(fault==='binding')saved.request_binding='b'.repeat(64);
    if(fault==='authority')saved.navigation_allowed=true;
    document.getElementById('planReference').value=fault==='malformed'?'not JSON':JSON.stringify(saved);
    const calls=fetch.mock.calls.length;
    document.getElementById('restore').click();await settle();
    expect(fetch.mock.calls).toHaveLength(calls);
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
    expect(document.getElementById('status').textContent).toContain('current preview retained');
});
test.each(['offline','401','422','bad_candidate','obsolete'])('restoration %s retains current route and keeps navigation unavailable',async fault=>{
    const points=await renderedPreview();
    if(fault==='offline')fetch.mockRejectedValueOnce(new Error('Offline'));
    else if(fault==='401'||fault==='422')fetch.mockResolvedValueOnce({ok:false,status:Number(fault)});
    else if(fault==='bad_candidate')fetch.mockResolvedValueOnce({ok:true,json:async()=>({...reference(),plan_reference:reference(),success:true,navigation_allowed:false,candidates:[{...candidate(),geometry:{type:'LineString',coordinates:[]}}]})});
    let finish;
    if(fault==='obsolete')fetch.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    document.getElementById('restore').click();await settle();
    if(fault==='obsolete'){
        document.getElementById('cases').dispatchEvent(new Event('change'));
        finish({ok:true,json:async()=>({...reference(),plan_reference:reference(),success:true,navigation_allowed:false,candidates:[candidate('Late route')]})});await settle();
    }
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
    expect(document.getElementById('instructions').textContent).toContain('A road');
    expect(document.getElementById('strictStart').disabled).toBe(true);
});
