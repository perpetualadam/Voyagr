// Synthetic in-memory restore CPU timing; excludes IndexedDB/browser/network/device.
const {performance}=require('node:perf_hooks');
const codec=require('../static/js/modules/navigation/polyline-codec.js');
const selection=require('../static/js/modules/navigation/route-selection.js');
const integrity=require('../static/js/modules/navigation/avoidance-integrity.js');
global.window={VoyagrAvoidanceIntegrity:integrity};
const line=[[53.52,-1.13],[53.521,-1.13],[53.522,-1.13]];
const saved={navigation_schema_version:3,polyline:line,routeData:{id:'synthetic-selected',geometry:codec.encodePolyline(line,6),geometry_precision:6,leg_geometry_ranges:[{stop:{name:'synthetic-remaining-stop'},end_shape_index:1}],avoidance_assessment:{status:'SATISFIED',checked_at:Date.now()/1000,requirements:[{enabled:true,mode:'mandatory',status:'SATISFIED'}]}}};
function restore(){
    const route=selection.buildRoutePayloadFromPersisted(saved,codec.encodePolyline);
    if(!route||route.avoidance_assessment.status!=='UNVERIFIED'||!route.navigation_resume_requires_fresh_gps||integrity.decision(route).allowed)throw Error('Unsafe synthetic restore');
}
for(let i=0;i<20;i++)restore();
const samples=[];
for(let i=0;i<200;i++){const start=performance.now();restore();samples.push(performance.now()-start);}
samples.sort((a,b)=>a-b);
console.log(JSON.stringify({kind:'SYNTHETIC_LOCAL_CPU',runtime:process.version,operation:'in_memory_offline_restore',samples:samples.length,median_ms:samples[100],p95_ms:samples[189],max_ms:samples[199],limitations:'No physical device, IndexedDB, service-worker, rendering, network or battery measurement.'},null,2));
