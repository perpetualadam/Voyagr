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
let versions=null, routes=[];
async function get(url,options){const response=await fetch(url,Object.assign({cache:'no-store',credentials:'same-origin'},options));if(!response.ok)throw new Error('Request refused ('+response.status+').');return response.json();}
function showRoute(){const route=routes[Number(alternatives.value)];if(!route)return;const coords=route.geometry.coordinates;
const xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
const scale=Math.min(760/Math.max(maxX-minX,1e-9),320/Math.max(maxY-minY,1e-9));
document.getElementById('line').setAttribute('points',coords.map(p=>[20+(p[0]-minX)*scale,340-(p[1]-minY)*scale].join(',')).join(' '));
document.getElementById('instructions').textContent=route.instruction_details.map((i,n)=>(n+1)+'. '+(i.name||'Unnamed road')+' — '+Math.round(i.distance_m)+' m').join('\n');}
alternatives.addEventListener('change',showRoute);
calculate.addEventListener('click',async()=>{calculate.disabled=true;routes=[];alternatives.replaceChildren();document.getElementById('line').setAttribute('points','');document.getElementById('instructions').textContent='';status.textContent='Calculating…';
try{const result=await get('/api/prototype/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({case_id:cases.value,graph_version:versions.graph_version,source_version:versions.source_version,policy_version:versions.policy_version})});
if(!result.success||result.navigation_allowed!==false||result.graph_version!==versions.graph_version||result.source_version!==versions.source_version||result.policy_version!==versions.policy_version)throw new Error('Response contract refused.');
routes=result.candidates;routes.forEach((route,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent='Route '+(i+1)+' · '+route.distance_km.toFixed(3)+' km';alternatives.append(option);});
status.textContent=routes.length+' route(s) passed selected fixture checks. Navigation remains unavailable.';showRoute();
}catch(error){status.textContent=error.message;}finally{calculate.disabled=false;}});
Promise.all([get('/api/prototype/cases'),get('/api/prototype/versions')]).then(([registry,identity])=>{versions=identity;registry.cases.forEach(id=>{const option=document.createElement('option');option.value=id;option.textContent=id;cases.append(option);});calculate.disabled=false;status.textContent='Select a registered test case.';}).catch(error=>{status.textContent=error.message;});

});
