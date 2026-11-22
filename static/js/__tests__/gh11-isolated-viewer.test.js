/** Prototype viewer only; never loads the production app or a live endpoint. */
const fs=require('fs');
const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../../../prototypes/graphhopper11/isolated_viewer.html'),'utf8');
require('../modules/navigation/strict-route-policy.js');
const AI=require('../modules/navigation/avoidance-integrity.js');
const Codec=require('../modules/navigation/polyline-codec.js');
const UX=require('../app/navigation-safety-ux.js');
const mount=require('../../../prototypes/graphhopper11/isolated_viewer.js');
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function candidate(name='A road'){
    return {navigation_allowed:false,geometry:{type:'LineString',coordinates:[[0,0],[.01,.01],[.02,0]]},distance_km:2,
        instruction_details:[{name,distance_m:2000}]};
}
const settings={profile:'car',alternatives:false,no_motorways:false,mandatory_associations:['camera'],both_directions:false};
function reference(){return {schema:1,case_id:'public_case',graph_version:'graph',source_version:'source',policy_version:'policy',selected_settings:settings,request_binding:'a'.repeat(64)};}
function appPreview(reply){return {navigation_allowed:false,routes:(reply.candidates||[]).map((row,i)=>{
const geometry=Codec.encodePolyline(row.geometry.coordinates.map(point=>[point[1],point[0]]),6);
return {id:'preview-'+i,geometry,geometry_precision:6,distance_km:row.distance_km,
maneuvers:row.instruction_details.map(item=>({type:8,instruction:item.name,length:item.distance_m/1000,begin_shape_index:0,end_shape_index:row.geometry.coordinates.length-1})),
avoidance_assessment:{geometry_valid:true,geometry_binding:AI.geometryBinding({geometry,geometry_precision:6}),checked_at:1,status:'UNVERIFIED',requirements:reply.policy_report?reply.policy_report.selected.requirements.map(row=>({...row,status:row.enabled?'UNVERIFIED':'DISABLED'})):[]},
routing_context:{graph_version:reply.graph_version,source_version:reply.source_version,policy_version:reply.policy_version,request_binding:reply.request_binding},gh11_evidence:row,navigation_allowed:false,automatic_selection_allowed:false};
})};}
async function start(routeReply,fixedSettings=settings){
    routeReply={plan_reference:{...reference(),selected_settings:fixedSettings},selected_settings:fixedSettings,request_binding:'a'.repeat(64),...routeReply};
    if(!routeReply.app_preview)routeReply.app_preview=appPreview(routeReply);
    global.VoyagrAvoidanceIntegrity=AI;global.VoyagrNavigationSafetyUX=UX;
    document.body.innerHTML=html.match(/<body>([\s\S]*?)<script/)[1];
    global.fetch=jest.fn(async url=>({ok:true,status:200,json:async()=>
        url.endsWith('/cases')?{cases:['public_case'],policy_categories:['motorways','railway_crossings','tolls'],case_settings:{public_case:fixedSettings},case_bindings:{public_case:'a'.repeat(64)}}:
        url.endsWith('/versions')?{graph_version:'graph',source_version:'source',policy_version:'policy'}:routeReply}));
    // Function scope avoids leaking viewer declarations into the production globals.
    mount(globalThis);
    await settle();
}
afterEach(()=>{UX.reset();AI.invalidate();jest.restoreAllMocks();jest.useRealTimers();delete global.fetch;});
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

test.each(['missing_assessment','wrong_binding','bad_interval','changed_geometry','authority','trace_swap'])('app-format %s response cannot replace the current preview',async fault=>{
    const points=await renderedPreview();
    const reply={...reference(),plan_reference:reference(),success:true,navigation_allowed:false,candidates:[candidate('Changed')]};
    reply.app_preview=appPreview(reply);
    const route=reply.app_preview.routes[0];
    if(fault==='missing_assessment')delete route.avoidance_assessment;
    if(fault==='wrong_binding')route.routing_context.request_binding='b'.repeat(64);
    if(fault==='bad_interval')route.maneuvers[0].end_shape_index=999;
    if(fault==='changed_geometry')route.geometry=Codec.encodePolyline([[1,1],[2,2]],6);
    if(fault==='authority')route.navigation_allowed=true;
    if(fault==='trace_swap')route.gh11_evidence={...route.gh11_evidence,directed_edge_keys:[999]};
    fetch.mockResolvedValueOnce({ok:true,json:async()=>reply});
    document.getElementById('restore').click();await settle();
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
    expect(document.getElementById('instructions').textContent).toContain('A road');
    expect(document.getElementById('status').textContent).toBe('Response contract refused.');
    expect(document.getElementById('strictStart').disabled).toBe(true);
});

function rule(category,enabled,mode='mandatory'){
    const row=document.querySelector('[data-policy-category="'+category+'"]');
    row.querySelector('input').checked=enabled;row.querySelector('input').dispatchEvent(new Event('change',{bubbles:true}));
    row.querySelector('select').value=mode;row.querySelector('select').dispatchEvent(new Event('change',{bubbles:true}));
}
function enablePolicy(){document.getElementById('usePolicy').checked=true;document.getElementById('usePolicy').dispatchEvent(new Event('change'));}
function policyReport(policy,states={motorways:'COMPILED',railway_crossings:'UNVERIFIED',tolls:'UNSUPPORTED'}){
    const rules=policy.requirements.map(row=>({...row,state:row.enabled?states[row.category]:'DISABLED',message:'Synthetic '+row.category+' <b>details</b>'}));
    const blocked=rules.filter(row=>row.enabled&&row.mode==='mandatory'&&row.state!=='COMPILED');
    return {schema:1,selected:policy,navigation_allowed:false,automatic_selection_allowed:false,
        route_preview_allowed:blocked.length===0,profile_supported:true,rules,unresolved_mandatory:blocked,
        preference_warnings:rules.filter(row=>row.enabled&&row.mode==='preference'&&row.state!=='COMPILED')};
}
const policyBinding=policy=>require('node:crypto').createHash('sha256').update(JSON.stringify(policy)).digest('hex');
function policyRoute(policy,fixedSettings=settings){
    const binding=policyBinding(policy),saved={...reference(),schema:2,selected_settings:fixedSettings,request_binding:binding,policy_request:policy};
    const reply={...reference(),case_id:'public_case',selected_settings:fixedSettings,request_binding:binding,
        plan_reference:saved,success:true,navigation_allowed:false,policy_report:policyReport(policy),candidates:[candidate('Policy route')]};
    reply.app_preview=appPreview(reply);return reply;
}
function servePolicies(fixedSettings=settings){
    fetch.mockImplementation(async(url,options)=>{
        const body=JSON.parse(options.body),policy=body.policy_request;
        if(url.endsWith('/policy')){
            const report=policyReport(policy);
            return {ok:report.route_preview_allowed,status:report.route_preview_allowed?200:422,
                json:async()=>({success:report.route_preview_allowed,navigation_allowed:false,request_binding:policyBinding(policy),policy_report:report})};
        }
        return {ok:true,json:async()=>policyRoute(policy,fixedSettings)};
    });
}

test('temporary UI rules use the real augmentation and preserve preference warnings without saving data',async()=>{
    const points=await renderedPreview(),before=JSON.stringify(localStorage);
    enablePolicy();rule('railway_crossings',true,'preference');servePolicies();
    const augmentation=jest.spyOn(AI,'augment');
    document.getElementById('calculate').click();await settle();
    const preflight=fetch.mock.calls.find(([url])=>url.endsWith('/policy'));
    const body=JSON.parse(preflight[1].body);
    expect(body.selected_settings).toBeUndefined();
    expect(body.policy_request.requirements).toContainEqual({category:'railway_crossings',enabled:true,mode:'preference',scope:'route'});
    expect(body.policy_request.requirements).toHaveLength(3);
    expect(augmentation).toHaveBeenCalled();
    const request=fetch.mock.calls.filter(([url])=>url.endsWith('/route')).at(-1);
    expect(JSON.parse(request[1].body).policy_request).toEqual(body.policy_request);
    expect(document.getElementById('status').textContent).toContain('preferences remain unresolved');
    expect(document.getElementById('policyDecisions').textContent).toContain('prefer to avoid');
    expect(document.querySelector('#policyDecisions b')).toBeNull();
    expect(document.getElementById('instructions').textContent).toContain('Policy route');
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
    expect(document.getElementById('strictStart').disabled).toBe(true);
    expect(JSON.stringify(localStorage)).toBe(before);augmentation.mockRestore();
});

test('mandatory refusal is explained before any route request and retains the previous preview and rules',async()=>{
    const points=await renderedPreview();fetch.mockClear();
    enablePolicy();rule('railway_crossings',true);servePolicies();
    document.getElementById('calculate').click();await settle();
    expect(fetch.mock.calls.map(([url])=>url)).toEqual(['/api/prototype/policy']);
    expect(document.getElementById('status').textContent).toContain('Current preview retained');
    expect(document.getElementById('policyDecisions').textContent).toContain('Railway crossings — must avoid');
    expect(document.querySelector('[data-policy-category="railway_crossings"] input').checked).toBe(true);
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
    expect(document.getElementById('instructions').textContent).toContain('A road');
});

test('compiled mandatory motorway rules can produce a preview while Start remains disabled',async()=>{
    const fixed={...settings,no_motorways:true};
    await start({case_id:'public_case',success:true,navigation_allowed:false,graph_version:'graph',source_version:'source',policy_version:'policy',candidates:[candidate()]},fixed);
    enablePolicy();rule('motorways',true);servePolicies(fixed);
    document.getElementById('calculate').click();await settle();
    expect(document.getElementById('instructions').textContent).toContain('Policy route');
    const saved=JSON.parse(document.getElementById('planReference').value);
    expect(saved.schema).toBe(2);
    expect(saved.policy_request.requirements.find(row=>row.category==='motorways').mode).toBe('mandatory');
    expect(document.getElementById('strictStart').disabled).toBe(true);
});

test.each(['preflight','route','programmatic'])('rules changing during %s cannot commit an obsolete response',async phase=>{
    const points=await renderedPreview();fetch.mockClear();enablePolicy();rule('tolls',true,'preference');
    let finish,selected;
    fetch.mockImplementation((url,options)=>{
        const policy=JSON.parse(options.body).policy_request;selected=policy;
        const value={success:true,navigation_allowed:false,request_binding:policyBinding(policy),policy_report:policyReport(policy)};
        if(phase!=='route'||url.endsWith('/route'))return new Promise(resolve=>{finish=()=>resolve({ok:true,json:async()=>url.endsWith('/policy')?value:policyRoute(policy)});});
        return Promise.resolve({ok:true,json:async()=>value});
    });
    document.getElementById('calculate').click();await settle();
    if(phase==='programmatic')document.querySelector('[data-policy-category="tolls"] select').value='mandatory';
    else rule('tolls',true,'mandatory');
    finish();await settle();
    expect(selected.requirements.find(row=>row.category==='tolls').mode).toBe('preference');
    if(phase!=='route')expect(fetch.mock.calls).toHaveLength(1);
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
    expect(document.getElementById('instructions').textContent).toContain('A road');
    expect(document.getElementById('status').textContent).toContain('superseded');
});

test.each(['selected','missing_rule','authority','mandatory_state','warning'])('malformed preflight %s cannot reach routing',async fault=>{
    const points=await renderedPreview();fetch.mockClear();enablePolicy();rule('motorways',true);rule('tolls',true,'preference');
    fetch.mockImplementation(async(_url,options)=>{
        const policy=JSON.parse(options.body).policy_request,report=policyReport(policy);
        if(fault==='selected')report.selected={...policy,requirements:[]};
        if(fault==='missing_rule')report.rules.pop();
        if(fault==='authority')report.navigation_allowed=true;
        if(fault==='mandatory_state')report.rules.find(row=>row.category==='motorways').state='UNVERIFIED';
        if(fault==='warning')report.preference_warnings=[];
        return {ok:true,json:async()=>({success:true,navigation_allowed:false,request_binding:policyBinding(policy),policy_report:report})};
    });
    document.getElementById('calculate').click();await settle();
    expect(fetch.mock.calls).toHaveLength(1);
    expect(document.getElementById('status').textContent).toBe('Policy response refused.');
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
});

test.each(['report','candidate_rules'])('a routed %s downgrade cannot replace the current preview',async fault=>{
    const points=await renderedPreview();enablePolicy();rule('tolls',true,'preference');servePolicies();
    const server=fetch.getMockImplementation();
    fetch.mockImplementation(async(url,options)=>{
        if(url.endsWith('/policy'))return server(url,options);
        const reply=policyRoute(JSON.parse(options.body).policy_request);
        if(fault==='report')reply.policy_report.selected.requirements=[];
        else reply.app_preview.routes[0].avoidance_assessment.requirements=[];
        return {ok:true,json:async()=>reply};
    });
    document.getElementById('calculate').click();await settle();
    expect(document.getElementById('status').textContent).toBe('Response contract refused.');
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
});

test('v2 restoration rechecks saved rules and applies them only after successful validation',async()=>{
    await renderedPreview();enablePolicy();rule('tolls',true,'preference');servePolicies();
    document.getElementById('calculate').click();await settle();
    const saved=document.getElementById('planReference').value,before=JSON.stringify(localStorage);
    rule('tolls',false);document.getElementById('restore').click();await settle();
    expect(document.querySelector('[data-policy-category="tolls"] input').checked).toBe(true);
    expect(document.querySelector('[data-policy-category="tolls"] select').value).toBe('preference');
    expect(document.getElementById('planReference').value).toBe(saved);
    expect(JSON.stringify(localStorage)).toBe(before);
    expect(document.getElementById('strictStart').disabled).toBe(true);
});

test('v1 references cannot silently remove newly selected rules',async()=>{
    const points=await renderedPreview();fetch.mockClear();enablePolicy();rule('railway_crossings',true);
    document.getElementById('restore').click();await settle();
    expect(fetch.mock.calls).toHaveLength(0);
    expect(document.getElementById('status').textContent).toContain('current preview retained');
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
});

test('failed v2 restoration retains current controls and never submits a restore request',async()=>{
    await renderedPreview();enablePolicy();rule('tolls',true,'preference');servePolicies();
    document.getElementById('calculate').click();await settle();
    const saved=JSON.parse(document.getElementById('planReference').value);
    saved.policy_request.requirements.find(row=>row.category==='railway_crossings').enabled=true;
    saved.request_binding=policyBinding(saved.policy_request);
    document.getElementById('planReference').value=JSON.stringify(saved);
    rule('tolls',false);fetch.mockClear();
    document.getElementById('restore').click();await settle();
    expect(fetch.mock.calls.map(([url])=>url)).toEqual(['/api/prototype/policy']);
    expect(document.querySelector('[data-policy-category="railway_crossings"] input').checked).toBe(false);
    expect(document.querySelector('[data-policy-category="tolls"] input').checked).toBe(false);
    expect(document.getElementById('instructions').textContent).toContain('Policy route');
    expect(document.getElementById('status').textContent).toContain('Current preview retained');
});

test('changed saved binding is refused after preflight before restoring',async()=>{
    await renderedPreview();enablePolicy();rule('tolls',true,'preference');servePolicies();
    document.getElementById('calculate').click();await settle();
    const saved=JSON.parse(document.getElementById('planReference').value);saved.request_binding='c'.repeat(64);
    document.getElementById('planReference').value=JSON.stringify(saved);fetch.mockClear();
    document.getElementById('restore').click();await settle();
    expect(fetch.mock.calls.map(([url])=>url)).toEqual(['/api/prototype/policy']);
    expect(document.getElementById('status').textContent).toContain('Plan reference changed');
    expect(document.getElementById('instructions').textContent).toContain('Policy route');
});

test('restoring a partial API policy preserves the same rule set on the next calculation',async()=>{
    await renderedPreview();servePolicies();
    const policy={profile:'car',requirements:[{category:'tolls',enabled:true,mode:'preference',scope:'route'}]};
    document.getElementById('planReference').value=JSON.stringify(policyRoute(policy).plan_reference);
    document.getElementById('restore').click();await settle();
    expect(document.getElementById('usePolicy').checked).toBe(true);
    expect(document.querySelector('[data-policy-category="tolls"] select').value).toBe('preference');
    fetch.mockClear();document.getElementById('calculate').click();await settle();
    const route=fetch.mock.calls.find(([url])=>url.endsWith('/route'));
    expect(JSON.parse(route[1].body).policy_request).toEqual(policy);
    expect(document.getElementById('strictStart').disabled).toBe(true);
});

test('an expired preflight cannot route even if the transport ignores cancellation',async()=>{
    jest.useFakeTimers();
    const points=await renderedPreview();enablePolicy();rule('tolls',true,'preference');fetch.mockClear();
    let finish;
    fetch.mockImplementation((_url,options)=>new Promise(resolve=>{
        const policy=JSON.parse(options.body).policy_request;
        finish=()=>resolve({ok:true,json:async()=>({success:true,navigation_allowed:false,request_binding:policyBinding(policy),policy_report:policyReport(policy)})});
    }));
    document.getElementById('calculate').click();await settle();
    jest.advanceTimersByTime(35001);finish();await settle();
    expect(fetch.mock.calls).toHaveLength(1);
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
    expect(document.getElementById('status').textContent).toContain('expired');
    expect(document.getElementById('strictStart').disabled).toBe(true);
});
