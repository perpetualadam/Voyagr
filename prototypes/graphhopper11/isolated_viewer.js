/* Isolated viewer: module export for tests, automatic mount in its own page. */
(function(root,factory){
    if(typeof module==='object' && module.exports) module.exports=factory;
    else factory(root);
})(globalThis,function(root){
'use strict';
const document=root.document, fetch=(...args)=>root.fetch(...args);
const byId=id=>document.getElementById(id);
const status=byId('status'), calculate=byId('calculate'), restore=byId('restore');
const cases=byId('cases'), alternatives=byId('alternatives'), planText=byId('planReference');
const usePolicy=byId('usePolicy'), controls=byId('policyControls');
const useAppSettings=byId('useAppSettings'), appSettings=byId('appSettings');
let versions=null, routes=[], registeredSettings={}, registeredBindings={}, categories=[], operation=0;
if(!root.VoyagrStrictRoutePolicyModule||!root.VoyagrNavigationSafetyUX||!root.VoyagrAvoidanceIntegrity){status.textContent='Strict verification unavailable.';return;}
const integrity=root.VoyagrAvoidanceIntegrity;
if(root.VOYAGR_STRICT_ROUTING!==true)Object.defineProperty(root,'VOYAGR_STRICT_ROUTING',{value:true,writable:false,configurable:false});
root.VoyagrStrictRoutePolicy=root.VoyagrStrictRoutePolicyModule.create({navigation_authorized:false,scope:'selected_fixture_graph_checks_only'});
byId('strictStart').addEventListener('click',()=>{root.VoyagrNavigationSafetyUX.present(routes[Number(alternatives.value)]);status.textContent='This experiment supports preview only. Navigation is unavailable.';});
function stable(value){return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const label=category=>({caz:'Clean air zones',congestion_charging:'Congestion charging'}[category]||category.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase()));
function normalizePolicy(policy){
    if(!policy||![stable(['profile','requirements']),stable(['app_settings','profile','requirements'])].includes(stable(Object.keys(policy).sort()))||typeof policy.profile!=='string'||!Array.isArray(policy.requirements)||policy.requirements.length>categories.length)throw Error('Policy contract refused.');
    const seen=new Set();
    const rows=policy.requirements.map(row=>{
        if(!row||stable(Object.keys(row).sort())!==stable(['category','enabled','mode','scope'])||!categories.includes(row.category)||seen.has(row.category)||typeof row.enabled!=='boolean'||!['mandatory','preference'].includes(row.mode)||row.scope!=='route')throw Error('Policy contract refused.');
        seen.add(row.category);return {...row};
    });
    const normalized={profile:policy.profile,requirements:rows.sort((a,b)=>a.category.localeCompare(b.category))};
    if(Object.prototype.hasOwnProperty.call(policy,'app_settings')){
        normalized.app_settings=readAppSettings(JSON.stringify(policy.app_settings));
        const derived=settingsPolicy(normalized.app_settings);
        if(stable({profile:normalized.profile,requirements:normalized.requirements})!==stable(derived))throw Error('Full settings rules disagree.');
    }
    return normalized;
}
function readAppSettings(text=appSettings.value){
    if(typeof text!=='string'||text.length>2500)throw Error('Full settings refused.');
    const value=JSON.parse(text);
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Full settings refused.');
    const booleans=['enable_hazard_avoidance','avoid_cameras','avoid_traffic_lights','avoid_railway_crossings','avoid_tolls','avoid_caz','avoid_motorways','avoid_ferries','avoid_unpaved','caz_exempt','include_tolls','include_caz','prefer_scenic','prefer_quiet'];
    const enums={routing_mode:['auto','pedestrian','bicycle'],vehicle_type:['petrol_diesel','electric','hybrid','pedestrian','bicycle'],avoidance_mode:['mandatory','preference'],route_optimization:['fastest','scenic','quiet','cheapest','eco','balanced']};
    const allowed=[...booleans,...Object.keys(enums),'max_detour','avoid_points','avoidance_requirements'];
    if(Object.keys(value).some(key=>!allowed.includes(key)||booleans.includes(key)&&typeof value[key]!=='boolean'||Object.prototype.hasOwnProperty.call(enums,key)&&!enums[key].includes(value[key])))throw Error('Full settings refused.');
    if('max_detour' in value&&(!Number.isInteger(value.max_detour)||value.max_detour<0||value.max_detour>100))throw Error('Full settings refused.');
    if('avoid_points' in value&&(!Array.isArray(value.avoid_points)||value.avoid_points.length))throw Error('Private avoid points are unavailable in this experiment.');
    if('avoidance_requirements' in value){
        const seen=new Set(), rows=value.avoidance_requirements;
        if(!Array.isArray(rows)||rows.length>categories.length)throw Error('Full settings refused.');
        for(const row of rows){
            if(!row||typeof row!=='object'||Object.keys(row).some(key=>!['category','enabled','mode','scope'].includes(key))||!categories.includes(row.category)||seen.has(row.category)||typeof row.enabled!=='boolean'||!['mandatory','preference'].includes(row.mode)||('scope' in row&&row.scope!=='route'))throw Error('Full settings refused.');
            seen.add(row.category);
        }
    }
    const mode=value.routing_mode||'auto', vehicle=value.vehicle_type||'petrol_diesel';
    if(mode==='auto'&&['pedestrian','bicycle'].includes(vehicle)||mode!=='auto'&&vehicle!==mode)throw Error('Full settings profile conflict.');
    return value;
}
function settingsPolicy(value){
    const master=value.enable_hazard_avoidance===true, mode=value.avoidance_mode||'preference';
    const charge=value.avoid_caz!==false&&value.caz_exempt!==true&&value.vehicle_type!=='electric';
    const enabled={speed_cameras:master&&value.avoid_cameras!==false,red_light_cameras:master&&value.avoid_cameras!==false,other_cameras:master&&value.avoid_cameras!==false,
        traffic_lights:master&&value.avoid_traffic_lights!==false,railway_crossings:master&&value.avoid_railway_crossings!==false,other_hazards:master,avoid_points:false,
        caz:charge,congestion_charging:charge,tolls:value.avoid_tolls===true,motorways:value.avoid_motorways===true,ferries:value.avoid_ferries===true,unpaved:value.avoid_unpaved===true};
    const requirements=categories.map(category=>{
        if(!Object.prototype.hasOwnProperty.call(enabled,category))throw Error('Full settings categories unavailable.');
        const explicit=(value.avoidance_requirements||[]).find(row=>row.category===category);
        return explicit?{...explicit,scope:'route'}:{category,enabled:enabled[category],mode,scope:'route'};
    }).sort((a,b)=>a.category.localeCompare(b.category));
    return {profile:!value.routing_mode||value.routing_mode==='auto'?'car':value.routing_mode,requirements};
}
function selection(caseId){return useAppSettings.checked?{app_settings:readAppSettings()}:readPolicy(caseId);}
const policyRows=()=>Array.from(byId('policyRules').children);
function readPolicy(caseId){
    if(!usePolicy.checked)return null;
    const rows=policyRows().filter(row=>row.dataset.present==='true'||row.querySelector('input').checked).map(row=>({category:row.dataset.policyCategory,enabled:row.querySelector('input').checked,mode:row.querySelector('select').value,scope:'route'}));
    // Use the real application's canonical request augmentation, with an
    // ephemeral facade. Never read/write the UK origin's stored preferences.
    const storage={getItem:key=>key==='pref_avoidance_requirements'?JSON.stringify(rows):key==='pref_avoidance_mode'?'mandatory':null};
    const forwarded=integrity.augment({},storage);
    return normalizePolicy({profile:registeredSettings[caseId].profile,requirements:forwarded.avoidance_requirements});
}
function showSettings(){byId('selectedSettings').textContent=JSON.stringify(registeredSettings[cases.value]||{},null,2);}
function changed(){
    operation++;integrity.invalidate();calculate.disabled=!versions;restore.disabled=!versions;
    byId('policyResult').hidden=true;
    status.textContent='Request superseded; selection or rules changed. Calculate to apply them; earlier preview is unchanged.';
}
function syncControls(){controls.hidden=!usePolicy.checked;controls.disabled=!usePolicy.checked||useAppSettings.checked;usePolicy.disabled=useAppSettings.checked;appSettings.disabled=!useAppSettings.checked;}
useAppSettings.addEventListener('change',()=>{syncControls();changed();});
appSettings.addEventListener('input',changed);
usePolicy.addEventListener('change',()=>{syncControls();changed();});
controls.addEventListener('change',event=>{
    const row=event.target.closest('[data-policy-category]');
    if(row){row.dataset.present='true';row.querySelector('select').disabled=!row.querySelector('input').checked;}
    changed();
});
cases.addEventListener('change',()=>{showSettings();changed();});
function mountPolicyRows(){
    for(const category of categories){
        const row=document.createElement('div');row.className='policy-row';row.dataset.policyCategory=category;row.dataset.present='true';
        const name=document.createElement('label'), enabled=document.createElement('input');enabled.type='checkbox';enabled.id='policy-'+category;
        name.append(enabled,document.createTextNode(' '+label(category)));
        const mode=document.createElement('select');mode.setAttribute('aria-label',label(category)+' avoidance mode');mode.disabled=true;
        for(const [value,text] of [['mandatory','Must avoid'],['preference','Prefer to avoid']]){const option=document.createElement('option');option.value=value;option.textContent=text;mode.append(option);}
        row.append(name,mode);byId('policyRules').append(row);
    }
    usePolicy.disabled=categories.length===0;useAppSettings.disabled=categories.length===0;
}
function applyRestoredPolicy(policy){
    usePolicy.checked=policy!==null;
    useAppSettings.checked=!!policy&&Object.prototype.hasOwnProperty.call(policy,'app_settings');
    if(useAppSettings.checked)appSettings.value=JSON.stringify(policy.app_settings);
    for(const row of policyRows()){
        const selected=policy&&policy.requirements.find(rule=>rule.category===row.dataset.policyCategory);
        row.dataset.present=selected?'true':'false';row.querySelector('input').checked=!!selected&&selected.enabled;
        row.querySelector('select').value=selected?selected.mode:'mandatory';row.querySelector('select').disabled=!selected||!selected.enabled;
    }
    syncControls();
}
function reportMatches(report,policy,allowed){
    if(!report||report.navigation_allowed!==false||report.automatic_selection_allowed!==false||stable(report.selected)!==stable(policy)||!Array.isArray(report.rules)||report.rules.length!==policy.requirements.length)return false;
    if(stable(report.rules.map(({category,enabled,mode,scope})=>({category,enabled,mode,scope})))!==stable(policy.requirements))return false;
    if(!report.rules.every(row=>typeof row.message==='string'&&row.message.length<=2000&&['DISABLED','COMPILED','UNVERIFIED','UNSUPPORTED'].includes(row.state)))return false;
    if(Object.prototype.hasOwnProperty.call(policy,'app_settings')){
        const supplemental=['prefer_scenic','prefer_quiet','route_optimization','max_detour'].filter(key=>Object.prototype.hasOwnProperty.call(policy.app_settings,key)).map(key=>({setting:key,value:policy.app_settings[key],state:'UNVERIFIED',reason:'app_preference_not_integrated'}));
        if(report.app_integration_allowed!==false||stable(report.app_settings)!==stable(policy.app_settings)||stable(report.supplemental_settings)!==stable(supplemental))return false;
    }
    if(!allowed)return true;
    if(report.route_preview_allowed!==true||report.profile_supported!==true||!Array.isArray(report.unresolved_mandatory)||report.unresolved_mandatory.length)return false;
    if(report.rules.some(row=>!row.enabled?row.state!=='DISABLED':row.mode==='mandatory'&&row.state!=='COMPILED'))return false;
    const warned=report.rules.filter(row=>row.enabled&&row.mode==='preference'&&row.state!=='COMPILED').map(row=>row.category);
    return Array.isArray(report.preference_warnings)&&stable(report.preference_warnings.map(row=>row.category))===stable(warned);
}
function renderPolicy(report){
    const list=byId('policyDecisions');list.replaceChildren();
    for(const row of report.rules.filter(rule=>rule.enabled)){
        const item=document.createElement('li');item.textContent=label(row.category)+' — '+(row.mode==='mandatory'?'must avoid':'prefer to avoid')+': '+row.message;list.append(item);
    }
    for(const row of report.supplemental_settings||[]){const item=document.createElement('li');item.textContent=label(row.setting)+' — '+JSON.stringify(row.value)+': unverified in this experiment.';list.append(item);}
    if(!list.children.length){const item=document.createElement('li');item.textContent='No enabled custom rules. Fixed registered-case constraints still apply.';list.append(item);}
    byId('policyResult').hidden=false;
}
async function get(url,options){
    const response=await fetch(url,Object.assign({cache:'no-store',credentials:'same-origin'},options));
    if(!response.ok){const error=Error('Request refused ('+response.status+').');try{error.policyReport=(await response.json()).policy_report;}catch(_){/* HTML authentication/network errors carry no policy evidence. */}throw error;}
    return response.json();
}
const post=(url,body,options)=>get(url,Object.assign({},options,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
function reference(caseId,policy=null,binding=registeredBindings[caseId]){
    const saved={schema:policy?2:1,case_id:caseId,graph_version:versions.graph_version,source_version:versions.source_version,policy_version:versions.policy_version,selected_settings:registeredSettings[caseId],request_binding:binding};
    if(policy)saved.policy_request=policy;
    return saved;
}
function showRoute(){
    const route=routes[Number(alternatives.value)];if(!route)return;
    root.VoyagrNavigationSafetyUX.present(route);
    const coords=route.polyline.map(point=>[point[1],point[0]]),xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const scale=Math.min(760/Math.max(maxX-minX,1e-9),320/Math.max(maxY-minY,1e-9));
    byId('line').setAttribute('points',coords.map(p=>[20+(p[0]-minX)*scale,340-(p[1]-minY)*scale].join(',')).join(' '));
    byId('instructions').textContent=route.maneuvers.map((i,n)=>(n+1)+'. '+i.instruction+' — '+Math.round(i.length*1000)+' m').join('\n');
}
alternatives.addEventListener('change',showRoute);
function clearPreview(){routes=[];alternatives.replaceChildren();byId('line').setAttribute('points','');byId('instructions').textContent='';}
async function calculateCase(saved){
    const selectedCase=saved?saved.case_id:cases.value, ownerCase=cases.value;
    const ownerPolicy=stable(selection(ownerCase)), requested=saved?(saved.schema===2?normalizePolicy(saved.policy_request):null):selection(selectedCase);
    let policy=requested&&Object.prototype.hasOwnProperty.call(requested,'profile')?requested:null;
    const ticket=integrity.begin(root.localStorage), owned=++operation, fetchOptions=integrity.fetchOptions(ticket);
    const current=()=>{try{return owned===operation&&(!ticket.controller||!ticket.controller.signal.aborted)&&integrity.current(ticket,root.localStorage)&&cases.value===ownerCase&&stable(selection(ownerCase))===ownerPolicy;}catch(_){return false;}};
    const selectedSettings=registeredSettings[selectedCase];let selectedBinding=registeredBindings[selectedCase], approved=null;
    calculate.disabled=true;restore.disabled=true;
    if(!saved&&!requested){root.VoyagrNavigationSafetyUX.reset();clearPreview();byId('policyResult').hidden=true;}
    status.textContent=saved?'Restoring and checking…':'Calculating…';
    try{
        if(requested){
            const preflight=await post('/api/prototype/policy',{case_id:selectedCase,graph_version:versions.graph_version,source_version:versions.source_version,policy_version:versions.policy_version,...(policy?{policy_request:policy}:requested)},fetchOptions);
            if(!current()){if(owned===operation)status.textContent='Request expired or superseded. Calculate again.';return;}
            if(!policy){
                policy=normalizePolicy(preflight.policy_report&&preflight.policy_report.selected);
                if(stable(policy.app_settings)!==stable(requested.app_settings))throw Error('Full settings response refused.');
            }
            if(preflight.success!==true||preflight.navigation_allowed!==false||!hash(preflight.request_binding)||!reportMatches(preflight.policy_report,policy,true))throw Error('Policy response refused.');
            approved=preflight.policy_report;selectedBinding=preflight.request_binding;renderPolicy(approved);
        }
        if(saved&&stable(saved)!==stable(reference(selectedCase,policy,selectedBinding)))throw Error('Plan reference changed; current preview retained.');
        const body=saved||{case_id:selectedCase,selected_settings:selectedSettings,graph_version:versions.graph_version,source_version:versions.source_version,policy_version:versions.policy_version,...(policy?{policy_request:policy}:{})};
        const result=await post(saved?'/api/prototype/restore':'/api/prototype/route',body,fetchOptions);
        if(!current()){if(owned===operation)status.textContent='Request expired or superseded. Calculate again.';return;}
        if(result.request_binding!==selectedBinding||stable(result.selected_settings)!==stable(selectedSettings)||stable(result.plan_reference)!==stable(reference(selectedCase,policy,selectedBinding))||result.case_id!==selectedCase||!result.success||result.navigation_allowed!==false||result.graph_version!==versions.graph_version||result.source_version!==versions.source_version||result.policy_version!==versions.policy_version||(policy&&stable(result.policy_report)!==stable(approved)))throw Error('Response contract refused.');
        const preview=result.app_preview;
        if(!preview||preview.navigation_allowed!==false||!Array.isArray(preview.routes)||!Array.isArray(result.candidates)||preview.routes.length!==result.candidates.length||!preview.routes.length||preview.routes.length>3)throw Error('Response contract refused.');
        const identities=new Set();
        const prepared=preview.routes.map((route,index)=>{
            if(route.geometry_precision!==6||identities.has(route.id)||route.navigation_allowed!==false||route.automatic_selection_allowed!==false||!route.routing_context||['graph_version','source_version','policy_version','request_binding'].some(key=>route.routing_context[key]!==result[key])||stable(route.gh11_evidence)!==stable(result.candidates[index]))throw Error('Response contract refused.');
            if(policy&&stable((route.avoidance_assessment&&route.avoidance_assessment.requirements||[]).map(({category,enabled,mode,scope})=>({category,enabled,mode,scope})))!==stable(policy.requirements))throw Error('Response contract refused.');
            const candidate=integrity.preparePlanningCandidate(route);if(!candidate)throw Error('Response contract refused.');
            identities.add(candidate.id);return candidate;
        });
        const options=prepared.map((route,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent='Route '+(i+1)+' · '+route.distance_km.toFixed(3)+' km';return option;});
        routes=prepared;alternatives.replaceChildren(...options);cases.value=selectedCase;if(saved)applyRestoredPolicy(policy);showSettings();
        planText.value=JSON.stringify(result.plan_reference);
        status.textContent=routes.length+' route(s) passed selected fixture checks. '+(approved&&(approved.preference_warnings.length||(approved.supplemental_settings||[]).length)?'Some preferences remain unresolved; see Rule check details. ':'')+'Navigation remains unavailable.';showRoute();
    }catch(error){
        if(current()){
            if(!policy&&requested&&error.policyReport){
                try{const returned=normalizePolicy(error.policyReport.selected);if(stable(returned.app_settings)===stable(requested.app_settings))policy=returned;}catch(_){/* Untrusted refusal must not change choices. */}
            }
            const reported=policy&&reportMatches(error.policyReport,policy,false);
            if(reported)renderPolicy(error.policyReport);
            status.textContent=reported?'Selected rules could not be compiled or verified. Current preview retained; see Rule check details.':error.message;
        }
    }finally{integrity.finish(ticket);if(owned===operation){calculate.disabled=false;restore.disabled=false;}}
}
function run(saved){calculateCase(saved).catch(()=>{status.textContent='Settings unavailable; current preview retained.';});}
calculate.addEventListener('click',()=>run(null));
restore.addEventListener('click',()=>{
    try{
        if(planText.value.length>4096)throw Error('Plan reference refused.');
        const saved=JSON.parse(planText.value);
        if(!saved||!Object.prototype.hasOwnProperty.call(registeredSettings,saved.case_id))throw Error('Plan reference refused.');
        const policy=saved.schema===2?normalizePolicy(saved.policy_request):null;
        if(!policy&&(usePolicy.checked||useAppSettings.checked))throw Error('Legacy references cannot silently remove selected rules.');
        if(policy&&(!hash(saved.request_binding)||policy.profile!==registeredSettings[saved.case_id].profile))throw Error('Plan reference refused.');
        if(stable(saved)!==stable(reference(saved.case_id,policy,saved.schema===2?saved.request_binding:registeredBindings[saved.case_id])))throw Error('Plan reference refused.');
        run(saved);
    }catch(_){status.textContent='Plan reference refused; current preview retained.';}
});
Promise.all([get('/api/prototype/cases'),get('/api/prototype/versions')]).then(([registry,identity])=>{
    registeredSettings=registry.case_settings||{};registeredBindings=registry.case_bindings||{};categories=registry.policy_categories||[];
    if(!Array.isArray(categories)||categories.length>13||new Set(categories).size!==categories.length||categories.some(category=>typeof category!=='string'||!/^[a-z_]{1,32}$/.test(category)))throw Error('Policy categories unavailable.');
    if(registry.cases.some(id=>!registeredSettings[id]||!hash(registeredBindings[id])))throw Error('Registered settings unavailable.');
    registry.cases.forEach(id=>{const option=document.createElement('option');option.value=id;option.textContent=id;cases.append(option);});
    if(['graph_version','source_version','policy_version'].some(key=>typeof identity[key]!=='string'||!identity[key]))throw Error('Version identity unavailable.');
    versions=identity;mountPolicyRows();showSettings();calculate.disabled=false;restore.disabled=false;status.textContent='Select a registered test case.';
}).catch(error=>{status.textContent=error.message;});
});
