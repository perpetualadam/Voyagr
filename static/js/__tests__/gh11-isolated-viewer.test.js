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
async function start(routeReply,fixedSettings=settings,policyCategories=['motorways','railway_crossings','tolls'],caseRequests={}){
    routeReply={plan_reference:{...reference(),selected_settings:fixedSettings},selected_settings:fixedSettings,request_binding:'a'.repeat(64),...routeReply};
    if(!routeReply.app_preview)routeReply.app_preview=appPreview(routeReply);
    global.VoyagrAvoidanceIntegrity=AI;global.VoyagrNavigationSafetyUX=UX;
    document.body.innerHTML=html.match(/<body>([\s\S]*?)<script/)[1];
    global.fetch=jest.fn(async url=>({ok:true,status:200,json:async()=>
        url.endsWith('/cases')?{case_requests:caseRequests,cases:['public_case'],policy_categories:policyCategories,case_settings:{public_case:fixedSettings},case_bindings:{public_case:'a'.repeat(64)}}:
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

function fullSettings(value={avoid_caz:false,avoid_tolls:true,avoidance_mode:'preference',max_detour:20,prefer_scenic:true}){
    document.getElementById('appSettings').value=JSON.stringify(value);
    document.getElementById('useAppSettings').checked=true;
    document.getElementById('useAppSettings').dispatchEvent(new Event('change'));
    return value;
}
function richPolicy(appSettings){
    return {profile:'car',requirements:['motorways','railway_crossings','tolls'].map(category=>({category,enabled:category==='tolls'&&appSettings.avoid_tolls===true,mode:appSettings.avoidance_mode||'preference',scope:'route'})),app_settings:appSettings};
}
function richReport(policy){
    return {...policyReport(policy),app_settings:policy.app_settings,app_integration_allowed:false,
        supplemental_settings:['prefer_scenic','prefer_quiet','route_optimization','max_detour'].filter(key=>Object.hasOwn(policy.app_settings,key)).map(setting=>({setting,value:policy.app_settings[setting],state:'UNVERIFIED',reason:'app_preference_not_integrated'}))};
}
function serveFullSettings(mutate=()=>{}){
    fetch.mockImplementation(async(url,options)=>{
        const body=JSON.parse(options.body), policy=body.policy_request||richPolicy(body.app_settings);
        const report=richReport(policy);
        if(url.endsWith('/policy')){
            const response={success:report.route_preview_allowed,navigation_allowed:false,request_binding:policyBinding(policy),policy_report:report};mutate(response,url);
            return {ok:report.route_preview_allowed,status:report.route_preview_allowed?200:422,json:async()=>response};
        }
        const response=policyRoute(policy);response.policy_report=report;mutate(response,url);
        return {ok:true,json:async()=>response};
    });
}

test('full settings round trip through preflight route restore and next calculation without storage writes',async()=>{
    await renderedPreview();const before=JSON.stringify(localStorage), supplied=fullSettings();serveFullSettings();
    document.getElementById('calculate').click();await settle();
    const preflight=fetch.mock.calls.filter(([url])=>url.endsWith('/policy')).at(-1);
    expect(JSON.parse(preflight[1].body).app_settings).toEqual(supplied);
    const routed=JSON.parse(fetch.mock.calls.filter(([url])=>url.endsWith('/route')).at(-1)[1].body);
    expect(routed.policy_request.app_settings).toEqual(supplied);
    expect(document.getElementById('policyDecisions').textContent).toContain('Max detour');
    expect(document.getElementById('status').textContent).toContain('preferences remain unresolved');
    const saved=JSON.parse(document.getElementById('planReference').value);
    expect(saved.policy_request.app_settings).toEqual(supplied);
    document.getElementById('appSettings').value=JSON.stringify({avoid_caz:false,max_detour:99});
    document.getElementById('restore').click();await settle();
    expect(JSON.parse(document.getElementById('appSettings').value)).toEqual(supplied);
    expect(document.getElementById('useAppSettings').checked).toBe(true);
    document.getElementById('calculate').click();await settle();
    expect(JSON.parse(fetch.mock.calls.filter(([url])=>url.endsWith('/policy')).at(-1)[1].body).app_settings).toEqual(supplied);
    expect(document.getElementById('strictStart').disabled).toBe(true);
    expect(JSON.stringify(localStorage)).toBe(before);
});

test.each(['dropped_setting','missing_warning','altered_warning','authority','incomplete_rows','weakened_rule','wrong_profile','route_report'])('full settings %s response cannot commit',async fault=>{
    const points=await renderedPreview(), supplied=fullSettings();
    serveFullSettings((response,url)=>{
        if(fault==='route_report'){if(url.endsWith('/route'))delete response.policy_report.app_settings.max_detour;return;}
        if(!url.endsWith('/policy'))return;
        if(fault==='dropped_setting')delete response.policy_report.selected.app_settings.max_detour;
        if(fault==='missing_warning')response.policy_report.supplemental_settings=[];
        if(fault==='altered_warning')response.policy_report.supplemental_settings[0].state='COMPILED';
        if(fault==='authority')response.policy_report.app_integration_allowed=true;
        if(fault==='incomplete_rows')response.policy_report.selected.requirements.pop();
        if(fault==='weakened_rule')response.policy_report=richReport({...response.policy_report.selected,requirements:response.policy_report.selected.requirements.map(row=>({...row,enabled:false}))});
        if(fault==='wrong_profile')response.policy_report.selected.profile='bicycle';
    });
    document.getElementById('calculate').click();await settle();
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
    expect(JSON.parse(document.getElementById('appSettings').value)).toEqual(supplied);
    expect(document.getElementById('strictStart').disabled).toBe(true);
});

test('unsupported full-settings mandatory avoidance stops before route and retains choices',async()=>{
    const points=await renderedPreview(), supplied=fullSettings({avoid_caz:false,avoid_tolls:true,avoidance_mode:'mandatory',max_detour:20});serveFullSettings();
    const before=fetch.mock.calls.filter(([url])=>url.endsWith('/route')).length;
    document.getElementById('calculate').click();await settle();
    expect(fetch.mock.calls.filter(([url])=>url.endsWith('/route'))).toHaveLength(before);
    expect(document.getElementById('status').textContent).toContain('could not be compiled');
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
    expect(JSON.parse(document.getElementById('appSettings').value)).toEqual(supplied);
});

test.each([null,[],{password:'must not send'},{lat:1},{avoid_points:[{lat:1,lon:2}]},{avoid_tolls:1},{max_detour:101}])('malformed or private full settings %j refuse before HTTP',async supplied=>{
    const points=await renderedPreview();fullSettings(supplied);const before=fetch.mock.calls.length;
    document.getElementById('calculate').click();await settle();
    expect(fetch.mock.calls).toHaveLength(before);
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
});

test.each(['input','programmatic'])('editing full settings during preflight %s prevents stale routing',async event=>{
    const points=await renderedPreview();fullSettings();let finish;
    fetch.mockImplementationOnce((_url,options)=>new Promise(resolve=>{finish=()=>{const policy=richPolicy(JSON.parse(options.body).app_settings);resolve({ok:true,json:async()=>({success:true,navigation_allowed:false,request_binding:policyBinding(policy),policy_report:richReport(policy)})});};}));
    const before=fetch.mock.calls.filter(([url])=>url.endsWith('/route')).length;
    document.getElementById('calculate').click();await settle();
    document.getElementById('appSettings').value=JSON.stringify({avoid_caz:false,max_detour:44});
    if(event==='input')document.getElementById('appSettings').dispatchEvent(new Event('input'));
    finish();await settle();
    expect(fetch.mock.calls.filter(([url])=>url.endsWith('/route'))).toHaveLength(before);
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
});

test('failed rich restore retains full settings and legacy references cannot remove them',async()=>{
    const points=await renderedPreview(), supplied=fullSettings();serveFullSettings();
    const saved=policyRoute(richPolicy({avoid_caz:false,max_detour:55})).plan_reference;
    document.getElementById('planReference').value=JSON.stringify(saved);
    fetch.mockRejectedValueOnce(new Error('Offline'));document.getElementById('restore').click();await settle();
    expect(JSON.parse(document.getElementById('appSettings').value)).toEqual(supplied);
    document.getElementById('planReference').value=JSON.stringify(reference());const before=fetch.mock.calls.length;
    document.getElementById('restore').click();await settle();
    expect(fetch.mock.calls).toHaveLength(before);
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
});

const settingsParity=JSON.parse(fs.readFileSync(path.join(__dirname,'../../../prototypes/graphhopper11/app-settings-parity.json'),'utf8'));
test.each(settingsParity)('browser full-settings derivation agrees with compiler-verified fixture %#',async compiled=>{
    const supplied=compiled.policy.app_settings;
    await start({case_id:'public_case',success:true,navigation_allowed:false,graph_version:'graph',source_version:'source',policy_version:'policy',candidates:[candidate()]},settings,compiled.categories);
    fullSettings(supplied);
    fetch.mockImplementation(async(url,options)=>{
        const body=JSON.parse(options.body);
        if(url.endsWith('/policy'))return {ok:compiled.report.route_preview_allowed,status:compiled.report.route_preview_allowed?200:422,json:async()=>({success:compiled.report.route_preview_allowed,navigation_allowed:false,request_binding:policyBinding(compiled.policy),policy_report:compiled.report})};
        expect(body.policy_request).toEqual(compiled.policy);
        const response=policyRoute(compiled.policy);response.policy_report=compiled.report;
        return {ok:true,json:async()=>response};
    });
    document.getElementById('calculate').click();await settle();
    if(compiled.report.route_preview_allowed){
        expect(document.getElementById('status').textContent).toContain('route(s) passed');
        expect(JSON.parse(document.getElementById('planReference').value).policy_request).toEqual(compiled.policy);
    }else{
        expect(document.getElementById('status').textContent).toContain('could not be compiled');
        expect(fetch.mock.calls.filter(([url])=>url.endsWith('/route'))).toHaveLength(0);
    }
    expect(document.getElementById('strictStart').disabled).toBe(true);
});

const completeTemplate={start:'0,0',end:'0,0.02',via_points:[],stops:[],optimize_stop_order:false,round_trip:false,departure_time:null,avoid_caz:false,avoid_tolls:true,avoidance_mode:'preference',max_detour:20};
const completeCosts=['electricity_price','energy_efficiency','fuel_category','fuel_efficiency','fuel_price','fuel_price_mode'];
const journeyKeys=['start','end','via_points','stops','optimize_stop_order','round_trip','departure_time','time_windows','total_stop_time','force_refresh','is_reroute','preserve_stop_order'];
function completeReply(body){
    const selected=richPolicy(Object.fromEntries(Object.entries(body).filter(([key])=>!completeCosts.includes(key)&&!journeyKeys.includes(key))));
    const reply=policyRoute(selected), binding=policyBinding(body);
    reply.request_binding=binding;reply.policy_report=richReport(selected);
    reply.plan_reference={schema:3,case_id:'public_case',graph_version:'graph',source_version:'source',policy_version:'policy',app_request:body,request_binding:binding};
    reply.app_request_context={app_request:body,visits:[body.start.split(',').map(Number),...(body.via_points||[]).map(p=>[p.lat,p.lon]),body.end.split(',').map(Number)],policy_request:selected,is_reroute:body.is_reroute===true,force_refresh:body.force_refresh===true,cost_warnings:completeCosts.filter(key=>key in body).map(setting=>({setting,value:body[setting],state:'UNVERIFIED'}))};
    reply.app_integration_allowed=false;reply.gps_verification='UNVERIFIED';reply.cache_policy='bypass_complete_app_request';
    reply.app_preview=appPreview(reply);return reply;
}
async function completeReady(){
    await start({case_id:'public_case',success:true,navigation_allowed:false,graph_version:'graph',source_version:'source',policy_version:'policy',candidates:[candidate()]},settings,undefined,{public_case:completeTemplate});
    document.getElementById('calculate').click();await settle();
    const points=document.getElementById('line').getAttribute('points');
    document.getElementById('useCompleteRequest').checked=true;document.getElementById('useCompleteRequest').dispatchEvent(new Event('change'));
    return points;
}
function serveComplete(mutate=()=>{}){
    fetch.mockImplementation(async(url,options)=>{
        const envelope=JSON.parse(options.body),reply=completeReply(envelope.app_request);
        mutate(reply,url);
        return {ok:true,status:200,json:async()=>reply};
    });
}

test('complete-request mode preserves flags and costs through calculation restore and next calculation',async()=>{
    await completeReady();const before=JSON.stringify(localStorage);
    const supplied={...completeTemplate,is_reroute:true,force_refresh:true,fuel_price_mode:'manual',fuel_price:1.6};
    document.getElementById('completeRequest').value=JSON.stringify(supplied);serveComplete();
    document.getElementById('calculate').click();await settle();
    expect(document.getElementById('status').textContent).toContain('route(s) passed');
    expect(JSON.parse(fetch.mock.calls.filter(([url])=>url.endsWith('/app-route')).at(-1)[1].body).app_request).toEqual(supplied);
    expect(document.getElementById('policyDecisions').textContent).toContain('unverified cost input');
    const saved=JSON.parse(document.getElementById('planReference').value);expect(saved.schema).toBe(3);
    document.getElementById('completeRequest').value=JSON.stringify({...supplied,fuel_price:1.9});
    document.getElementById('restore').click();await settle();
    expect(JSON.parse(document.getElementById('completeRequest').value)).toEqual(supplied);
    document.getElementById('calculate').click();await settle();
    expect(JSON.parse(fetch.mock.calls.filter(([url])=>url.endsWith('/app-route')).at(-1)[1].body).app_request).toEqual(supplied);
    expect(JSON.stringify(localStorage)).toBe(before);
    expect(document.getElementById('strictStart').disabled).toBe(true);
});

test.each([{start:'1,1'},{end:'1,1'},{password:'must-not-send'},{stops:[{lat:0,lon:0}]},{departure_time:'later'},{fuel_price_mode:'invent'},{is_reroute:1}])('invalid complete input %j refuses before HTTP',async changed=>{
    const points=await completeReady();document.getElementById('completeRequest').value=JSON.stringify({...completeTemplate,...changed});
    const before=fetch.mock.calls.length;document.getElementById('calculate').click();await settle();
    expect(fetch.mock.calls).toHaveLength(before);expect(document.getElementById('line').getAttribute('points')).toBe(points);
});

test.each(['request','context','cost','authority','reference','route_context'])('altered complete %s evidence cannot replace preview',async fault=>{
    const points=await completeReady();const supplied={...completeTemplate,fuel_price:1.6};
    document.getElementById('completeRequest').value=JSON.stringify(supplied);
    serveComplete((reply,url)=>{
        if(fault==='route_context'){if(url.endsWith('/app-route'))reply.app_request_context.force_refresh=true;return;}
        if(!url.endsWith('/app-policy'))return;
        if(fault==='request')reply.app_request_context.app_request={...supplied,max_detour:99};
        if(fault==='context')reply.app_request_context.visits.reverse();
        if(fault==='cost')reply.app_request_context.cost_warnings=[];
        if(fault==='authority')reply.app_integration_allowed=true;
        if(fault==='reference')reply.plan_reference.request_binding='f'.repeat(64);
    });
    document.getElementById('calculate').click();await settle();
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
    expect(JSON.parse(document.getElementById('completeRequest').value)).toEqual(supplied);
});

test('complete mode refuses older references without silently dropping its request',async()=>{
    const points=await completeReady();document.getElementById('planReference').value=JSON.stringify(reference());const before=fetch.mock.calls.length;
    document.getElementById('restore').click();await settle();
    expect(fetch.mock.calls).toHaveLength(before);expect(document.getElementById('line').getAttribute('points')).toBe(points);
});

test('complete routing ignores a late result after a programmatic request edit',async()=>{
    const points=await completeReady();let finish;serveComplete();
    const served=fetch.getMockImplementation();fetch.mockImplementation((url,options)=>url.endsWith('/app-route')?new Promise(resolve=>{finish=async()=>resolve(await served(url,options));}):served(url,options));
    document.getElementById('calculate').click();await settle();
    document.getElementById('completeRequest').value=JSON.stringify({...completeTemplate,max_detour:99});
    await finish();await settle();
    expect(document.getElementById('line').getAttribute('points')).toBe(points);
    expect(JSON.parse(document.getElementById('completeRequest').value).max_detour).toBe(99);
});

function ownerFacade(){
 let owner='guest',epoch=0,notify;const capture=()=>({owner,epoch});
 const current=token=>token.owner===owner&&token.epoch===epoch;
 const session={capture,current,list:jest.fn(async()=>[]),get:jest.fn(),save:jest.fn(async()=>({})),switchOwner(next){owner=next;epoch++;notify();}};
 global.VoyagrLocalStore={};global.VoyagrGH11SavedPlans={create:options=>{notify=options.onOwnerChange;return session;}};
 return session;
}
afterEach(()=>{delete global.VoyagrGH11SavedPlans;delete global.VoyagrLocalStore;delete global.VoyagrGH11SavedSession;});
test('an owner change clears private preview state and rejects a late complete response even if abort is ignored',async()=>{
 const owner=ownerFacade();await completeReady();serveComplete();let finish;
 const served=fetch.getMockImplementation();fetch.mockImplementation((url,options)=>url.endsWith('/app-route')?new Promise(resolve=>{finish=async()=>resolve(await served(url,options));}):served(url,options));
 document.getElementById('calculate').click();await settle();owner.switchOwner('sb:synthetic_b');await finish();await settle();
 expect(document.getElementById('line').getAttribute('points')).toBe('');
 expect(document.getElementById('planReference').value).toBe('');
 expect(document.getElementById('completeRequest').value).toBe('');
 expect(document.getElementById('savedPlanOwner').textContent).toContain('sb:synthetic_b');
 expect(document.getElementById('saveCurrentPlan').disabled).toBe(true);
});
test('only a validated complete preview is offered for an explicit scoped save',async()=>{
 const owner=ownerFacade();await completeReady();serveComplete();
 expect(document.getElementById('saveCurrentPlan').disabled).toBe(true);
 document.getElementById('calculate').click();await settle();
 document.getElementById('saveCurrentPlan').click();await settle();
 expect(owner.save).toHaveBeenCalledWith(JSON.parse(document.getElementById('planReference').value),{owner:'guest',epoch:0},expect.any(Function));
 document.getElementById('completeRequest').dispatchEvent(new Event('input'));
 expect(document.getElementById('saveCurrentPlan').disabled).toBe(true);
});
test('a late saved-selector read cannot start restoration after an owner change',async()=>{
 const owner=ownerFacade();await completeReady();let finish;
 owner.list.mockResolvedValue([{id:'a'.repeat(64),case_id:'public_case',saved_at:1,restorable:true}]);
 document.getElementById('loadSavedPlans').click();await settle();
 owner.get.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));document.getElementById('restoreSavedPlan').click();await settle();
 const before=fetch.mock.calls.length;owner.switchOwner('sb:synthetic_b');finish(completeReply(completeTemplate).plan_reference);await settle();
 expect(fetch.mock.calls).toHaveLength(before);expect(document.getElementById('planReference').value).toBe('');
});

const JourneyEvidence=require('../../../prototypes/graphhopper11/journey_evidence.js');
const SpeedGps=require('../modules/navigation/speed-gps.js');
function bindJourney(){
 let epoch=0,generation=1,active=true,simulating=false,fix={lat:0,lon:0,accuracy:10,timestamp:Date.now()};
 global.VoyagrGH11JourneyEvidence=JourneyEvidence;
 const owner={capture:()=>({owner:'guest',epoch}),current:token=>token.epoch===epoch};
 const journey={capture:()=>({route_id:'public_fixture',generation,active,simulating}),current:token=>token.generation===generation&&token.active===active&&token.simulating===simulating};
 const binding=global.VoyagrGH11JourneyBridge.bind({owner,journey,gps:{getAcceptedOriginFix:()=>fix},validator:SpeedGps});
 return {binding,change:kind=>{if(kind==='owner')epoch++;else if(kind==='stop')active=false;else if(kind==='simulation')simulating=true;else if(kind==='fix')fix={...fix,timestamp:fix.timestamp+1};else generation++;}};
}
afterEach(()=>{delete global.VoyagrGH11JourneyEvidence;delete global.VoyagrGH11JourneyBridge;});
test.each(['owner','route','stop','simulation','fix'])('bound %s changes block delayed complete responses with the real evidence guard',async kind=>{
 await completeReady();serveComplete();const live=bindJourney();let finish;
 const served=fetch.getMockImplementation();fetch.mockImplementation((url,options)=>url.endsWith('/app-route')?new Promise(resolve=>{finish=async()=>resolve(await served(url,options));}):served(url,options));
 document.getElementById('calculate').click();await settle();live.change(kind);await finish();await settle();
 expect(document.getElementById('line').getAttribute('points')).toBe('');expect(document.getElementById('planReference').value).toBe('');expect(document.getElementById('saveCurrentPlan').disabled).toBe(true);
 expect(document.getElementById('strictStart').disabled).toBe(true);expect(document.getElementById('status').textContent).toContain('Journey evidence');
});
test('bound current evidence displays preview; host refresh clears it without replacing settings',async()=>{
 await completeReady();serveComplete();const live=bindJourney();const before=document.getElementById('completeRequest').value;
 document.getElementById('calculate').click();await settle();expect(document.getElementById('line').getAttribute('points')).not.toBe('');
 live.change('route');live.binding.refresh();expect(document.getElementById('line').getAttribute('points')).toBe('');expect(document.getElementById('completeRequest').value).toBe(before);
});
test('alternative selection rechecks context even without host notification',async()=>{
 await completeReady();serveComplete();const live=bindJourney();document.getElementById('calculate').click();await settle();
 live.change('stop');document.getElementById('alternatives').dispatchEvent(new Event('change'));
 expect(document.getElementById('line').getAttribute('points')).toBe('');expect(document.getElementById('instructions').textContent).toBe('');
});
test('stale context refuses before network and closing cannot remove the guard',async()=>{
 await completeReady();serveComplete();const live=bindJourney();live.change('simulation');const before=fetch.mock.calls.length;
 document.getElementById('calculate').click();await settle();expect(fetch.mock.calls).toHaveLength(before);
 live.binding.close();expect(()=>global.VoyagrGH11JourneyBridge.bind({})).toThrow();
 document.getElementById('calculate').click();await settle();expect(fetch.mock.calls).toHaveLength(before);
});
test('save rechecks journey evidence without altering already stored plans',async()=>{
 const owner=ownerFacade();await completeReady();serveComplete();const live=bindJourney();
 document.getElementById('calculate').click();await settle();expect(document.getElementById('saveCurrentPlan').disabled).toBe(false);
 live.change('fix');document.getElementById('saveCurrentPlan').click();await settle();
 expect(owner.save).not.toHaveBeenCalled();expect(document.getElementById('line').getAttribute('points')).toBe('');expect(document.getElementById('saveCurrentPlan').disabled).toBe(true);
});
test('evidence is checked again after candidate preparation immediately before UI commit',async()=>{
 await completeReady();serveComplete();const live=bindJourney();const prepare=AI.preparePlanningCandidate;
 jest.spyOn(AI,'preparePlanningCandidate').mockImplementation(route=>{const result=prepare(route);live.change('route');return result;});
 document.getElementById('calculate').click();await settle();
 expect(document.getElementById('line').getAttribute('points')).toBe('');expect(document.getElementById('planReference').value).toBe('');expect(document.getElementById('alternatives').options).toHaveLength(0);
});
test('a superseded save failure cannot clear a newer journey preview',async()=>{
 const owner=ownerFacade();await completeReady();serveComplete();const live=bindJourney();
 document.getElementById('calculate').click();await settle();let reject;
 owner.save.mockImplementation(()=>new Promise((_resolve,fail)=>{reject=fail;}));
 document.getElementById('saveCurrentPlan').click();await settle();live.change('fix');
 document.getElementById('calculate').click();await settle();const current=document.getElementById('planReference').value;
 expect(document.getElementById('line').getAttribute('points')).not.toBe('');reject(Error('superseded'));await settle();
 expect(document.getElementById('line').getAttribute('points')).not.toBe('');expect(document.getElementById('planReference').value).toBe(current);expect(document.getElementById('saveCurrentPlan').disabled).toBe(false);
});
test('actual accepted GPS notification flows through host adapter to cancel a late viewer response',async()=>{
 const owner=ownerFacade();await completeReady();serveComplete();let Modes,Gps;
 jest.isolateModules(()=>{Modes=require('../app/journey-modes.js');Gps=require('../app/gps-orchestration.js');});
 const Life=require('../app/navigation-lifecycle-orchestration.js'),Host=require('../../../prototypes/graphhopper11/host_journey_adapter.js');
 jest.spyOn(Modes,'getState').mockReturnValue('LIVE');global.VoyagrGH11JourneyEvidence=JourneyEvidence;
 Gps.bind({m:{speedGps:()=>SpeedGps}});const stamp=Date.now();Gps.acceptOriginPosition({timestamp:stamp,coords:{latitude:12.34,longitude:34.56,accuracy:10}});
 Life.setRoutePolyline([[0,0],[0,.02]]);Life.setRouteInProgress(true);let binding=null;
 const host=Host.create({owner,modes:Modes,lifecycle:Life,gps:Gps,eventTarget:window,onChange:()=>binding?.refresh()});
 try{
  binding=global.VoyagrGH11JourneyBridge.bind({...host,validator:SpeedGps});let finish;
  const served=fetch.getMockImplementation();fetch.mockImplementation((url,options)=>url.endsWith('/app-route')?new Promise(resolve=>{finish=async()=>resolve(await served(url,options));}):served(url,options));
  document.getElementById('calculate').click();await settle();
  expect(Gps.acceptOriginPosition({timestamp:stamp+1,coords:{latitude:12.35,longitude:34.56,accuracy:10}})).toBe(true);
  await finish();await settle();
  expect(document.getElementById('line').getAttribute('points')).toBe('');expect(document.getElementById('saveCurrentPlan').disabled).toBe(true);
  for(const [,options] of fetch.mock.calls){if(options?.body){expect(options.body).not.toContain('12.34');expect(options.body).not.toContain('12.35');expect(options.body).not.toContain('34.56');}}
 }finally{host.close();binding?.close();Life.setRouteInProgress(false);Life.setRoutePolyline(null);delete global.VoyagrJourneyModes;delete global.VoyagrGpsOrchestration;}
});
