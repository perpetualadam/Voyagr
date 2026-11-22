/* Isolated viewer: module export for tests, automatic mount in its own page. */
(function(root,factory){
    if(typeof module==='object' && module.exports) module.exports=factory;
    else factory(root);
})(globalThis,function(root){
const document=root.document;
const fetch=(...args)=>root.fetch(...args);

'use strict';
const status=document.getElementById('status'), calculate=document.getElementById('calculate');
const cases=document.getElementById('cases'), alternatives=document.getElementById('alternatives');
const restore=document.getElementById('restore'), planText=document.getElementById('planReference');
let versions=null, routes=[], registeredSettings={}, registeredBindings={};
if(!root.VoyagrStrictRoutePolicyModule||!root.VoyagrNavigationSafetyUX||!root.VoyagrAvoidanceIntegrity){status.textContent='Strict verification unavailable.';return;}
if(root.VOYAGR_STRICT_ROUTING!==true)Object.defineProperty(root,'VOYAGR_STRICT_ROUTING',{value:true,writable:false,configurable:false});
root.VoyagrStrictRoutePolicy=root.VoyagrStrictRoutePolicyModule.create({navigation_authorized:false,scope:'selected_fixture_graph_checks_only'});
const start=document.getElementById('strictStart');
start.addEventListener('click',()=>{const row=routes[Number(alternatives.value)];root.VoyagrNavigationSafetyUX.present(row);status.textContent='This experiment supports preview only. Navigation is unavailable.';});
async function get(url,options){const response=await fetch(url,Object.assign({cache:'no-store',credentials:'same-origin'},options));if(!response.ok)throw new Error('Request refused ('+response.status+').');return response.json();}
function showRoute(){const route=routes[Number(alternatives.value)];if(!route)return;root.VoyagrNavigationSafetyUX.present(route);const coords=route.polyline.map(point=>[point[1],point[0]]);
const xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
const scale=Math.min(760/Math.max(maxX-minX,1e-9),320/Math.max(maxY-minY,1e-9));
document.getElementById('line').setAttribute('points',coords.map(p=>[20+(p[0]-minX)*scale,340-(p[1]-minY)*scale].join(',')).join(' '));
document.getElementById('instructions').textContent=route.maneuvers.map((i,n)=>(n+1)+'. '+i.instruction+' — '+Math.round(i.length*1000)+' m').join('\n');}
alternatives.addEventListener('change',showRoute);
function showSettings(){document.getElementById('selectedSettings').textContent=JSON.stringify(registeredSettings[cases.value]||{},null,2);}
cases.addEventListener('change',()=>{root.VoyagrAvoidanceIntegrity.invalidate();showSettings();});
function stable(value){return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}
function reference(caseId){return {schema:1,case_id:caseId,graph_version:versions.graph_version,source_version:versions.source_version,policy_version:versions.policy_version,selected_settings:registeredSettings[caseId],request_binding:registeredBindings[caseId]};}
function clearPreview(){routes=[];alternatives.replaceChildren();document.getElementById('line').setAttribute('points','');document.getElementById('instructions').textContent='';}
async function calculateCase(saved){
const selectedCase=saved?saved.case_id:cases.value;
const selectedSettings=registeredSettings[selectedCase], selectedBinding=registeredBindings[selectedCase];
const ticket=root.VoyagrAvoidanceIntegrity.begin(root.localStorage);
calculate.disabled=true;restore.disabled=true;
if(!saved){root.VoyagrNavigationSafetyUX.reset();clearPreview();}
status.textContent=saved?'Restoring and checking…':'Calculating…';
try{
const body=saved||{case_id:selectedCase,selected_settings:selectedSettings,graph_version:versions.graph_version,source_version:versions.source_version,policy_version:versions.policy_version};
const result=await get(saved?'/api/prototype/restore':'/api/prototype/route',Object.assign(root.VoyagrAvoidanceIntegrity.fetchOptions(ticket),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
if(!root.VoyagrAvoidanceIntegrity.current(ticket,root.localStorage)){status.textContent='Request superseded; calculate the selected case.';return;}
if(result.request_binding!==selectedBinding||stable(result.selected_settings)!==stable(selectedSettings)||stable(result.plan_reference)!==stable(reference(selectedCase))||result.case_id!==selectedCase||!result.success||result.navigation_allowed!==false||result.graph_version!==versions.graph_version||result.source_version!==versions.source_version||result.policy_version!==versions.policy_version)throw new Error('Response contract refused.');
// Build replacement controls before replacing the current preview.
const preview=result.app_preview;
if(!preview||preview.navigation_allowed!==false||!Array.isArray(preview.routes)||!Array.isArray(result.candidates)||preview.routes.length!==result.candidates.length||!preview.routes.length||preview.routes.length>3)throw new Error('Response contract refused.');
const identities=new Set();
const prepared=preview.routes.map((route,index)=>{
if(route.geometry_precision!==6||identities.has(route.id)||route.navigation_allowed!==false||route.automatic_selection_allowed!==false||!route.routing_context||['graph_version','source_version','policy_version','request_binding'].some(key=>route.routing_context[key]!==result[key])||stable(route.gh11_evidence)!==stable(result.candidates[index]))throw new Error('Response contract refused.');
const candidate=root.VoyagrAvoidanceIntegrity.preparePlanningCandidate(route);
if(!candidate)throw new Error('Response contract refused.');
identities.add(candidate.id);return candidate;
});
const options=prepared.map((route,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent='Route '+(i+1)+' · '+route.distance_km.toFixed(3)+' km';return option;});
routes=prepared;alternatives.replaceChildren(...options);cases.value=selectedCase;showSettings();
planText.value=JSON.stringify(result.plan_reference);
status.textContent=routes.length+' route(s) passed selected fixture checks. Navigation remains unavailable.';showRoute();
}catch(error){status.textContent=root.VoyagrAvoidanceIntegrity.current(ticket,root.localStorage)?error.message:'Request superseded; calculate the selected case.';}
finally{root.VoyagrAvoidanceIntegrity.finish(ticket);calculate.disabled=false;restore.disabled=false;}
}
calculate.addEventListener('click',()=>calculateCase(null));
restore.addEventListener('click',()=>{
try{
if(planText.value.length>1024)throw new Error('Plan reference refused; current preview retained.');
const saved=JSON.parse(planText.value);
if(!saved||!Object.prototype.hasOwnProperty.call(registeredSettings,saved.case_id)||stable(saved)!==stable(reference(saved.case_id)))throw new Error('Plan reference changed; current preview retained.');
calculateCase(saved);
}catch(_){status.textContent='Plan reference refused; current preview retained.';}
});
Promise.all([get('/api/prototype/cases'),get('/api/prototype/versions')]).then(([registry,identity])=>{versions=identity;registeredSettings=registry.case_settings||{};registeredBindings=registry.case_bindings||{};if(registry.cases.some(id=>!registeredSettings[id]||!/^[a-f0-9]{64}$/.test(registeredBindings[id])))throw new Error('Registered settings unavailable.');registry.cases.forEach(id=>{const option=document.createElement('option');option.value=id;option.textContent=id;cases.append(option);});showSettings();calculate.disabled=false;restore.disabled=false;status.textContent='Select a registered test case.';}).catch(error=>{status.textContent=error.message;});

});
