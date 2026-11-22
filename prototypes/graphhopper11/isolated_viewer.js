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
let versions=null, routes=[], registeredSettings={}, registeredBindings={};
if(!root.VoyagrStrictRoutePolicyModule||!root.VoyagrNavigationSafetyUX||!root.VoyagrAvoidanceIntegrity){status.textContent='Strict verification unavailable.';return;}
if(root.VOYAGR_STRICT_ROUTING!==true)Object.defineProperty(root,'VOYAGR_STRICT_ROUTING',{value:true,writable:false,configurable:false});
root.VoyagrStrictRoutePolicy=root.VoyagrStrictRoutePolicyModule.create({navigation_authorized:false,scope:'selected_fixture_graph_checks_only'});
const start=document.getElementById('strictStart');
start.addEventListener('click',()=>{const row=routes[Number(alternatives.value)];root.VoyagrNavigationSafetyUX.present(row);status.textContent='This experiment supports preview only. Navigation is unavailable.';});
async function get(url,options){const response=await fetch(url,Object.assign({cache:'no-store',credentials:'same-origin'},options));if(!response.ok)throw new Error('Request refused ('+response.status+').');return response.json();}
function showRoute(){const route=routes[Number(alternatives.value)];if(!route)return;root.VoyagrNavigationSafetyUX.present(route);const coords=route.geometry.coordinates;
const xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
const scale=Math.min(760/Math.max(maxX-minX,1e-9),320/Math.max(maxY-minY,1e-9));
document.getElementById('line').setAttribute('points',coords.map(p=>[20+(p[0]-minX)*scale,340-(p[1]-minY)*scale].join(',')).join(' '));
document.getElementById('instructions').textContent=route.instruction_details.map((i,n)=>(n+1)+'. '+(i.name||'Unnamed road')+' — '+Math.round(i.distance_m)+' m').join('\n');}
alternatives.addEventListener('change',showRoute);
function showSettings(){document.getElementById('selectedSettings').textContent=JSON.stringify(registeredSettings[cases.value]||{},null,2);}
cases.addEventListener('change',()=>{root.VoyagrAvoidanceIntegrity.invalidate();showSettings();});
calculate.addEventListener('click',async()=>{const selectedCase=cases.value;const selectedSettings=registeredSettings[selectedCase];const selectedBinding=registeredBindings[selectedCase];const ticket=root.VoyagrAvoidanceIntegrity.begin(root.localStorage);calculate.disabled=true;root.VoyagrNavigationSafetyUX.reset();routes=[];alternatives.replaceChildren();document.getElementById('line').setAttribute('points','');document.getElementById('instructions').textContent='';status.textContent='Calculating…';
try{const result=await get('/api/prototype/route',Object.assign(root.VoyagrAvoidanceIntegrity.fetchOptions(ticket),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({case_id:selectedCase,selected_settings:selectedSettings,graph_version:versions.graph_version,source_version:versions.source_version,policy_version:versions.policy_version})}));
if(!root.VoyagrAvoidanceIntegrity.current(ticket,root.localStorage)){status.textContent='Request superseded; calculate the selected case.';return;}
if(result.request_binding!==selectedBinding||JSON.stringify(result.selected_settings)!==JSON.stringify(selectedSettings)||result.case_id!==selectedCase||!result.success||result.navigation_allowed!==false||result.graph_version!==versions.graph_version||result.source_version!==versions.source_version||result.policy_version!==versions.policy_version)throw new Error('Response contract refused.');
routes=result.candidates;routes.forEach((route,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent='Route '+(i+1)+' · '+route.distance_km.toFixed(3)+' km';alternatives.append(option);});
status.textContent=routes.length+' route(s) passed selected fixture checks. Navigation remains unavailable.';showRoute();
}catch(error){status.textContent=root.VoyagrAvoidanceIntegrity.current(ticket,root.localStorage)?error.message:'Request superseded; calculate the selected case.';}finally{root.VoyagrAvoidanceIntegrity.finish(ticket);calculate.disabled=false;}});
Promise.all([get('/api/prototype/cases'),get('/api/prototype/versions')]).then(([registry,identity])=>{versions=identity;registeredSettings=registry.case_settings||{};registeredBindings=registry.case_bindings||{};if(registry.cases.some(id=>!registeredSettings[id]||!/^[a-f0-9]{64}$/.test(registeredBindings[id])))throw new Error('Registered settings unavailable.');registry.cases.forEach(id=>{const option=document.createElement('option');option.value=id;option.textContent=id;cases.append(option);});showSettings();calculate.disabled=false;status.textContent='Select a registered test case.';}).catch(error=>{status.textContent=error.message;});

});
