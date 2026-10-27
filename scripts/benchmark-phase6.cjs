// Local CPU microbenchmarks, not device/rendering/network measurements.
const {performance}=require('node:perf_hooks');
const os=require('node:os');
const RG=require('../static/js/modules/navigation/route-geometry.js');
const RP=require('../static/js/modules/navigation/route-progress.js');
const LG=require('../static/js/modules/navigation/lane-guidance.js');
const TI=require('../static/js/modules/navigation/turn-instructions.js');
const VA=require('../static/js/modules/navigation/voice-announcements.js');
const fixtures=require('../tests/fixtures/phase6-gps-replay.json');
const {replay}=require('./lib/navigation-replay.cjs');
function bench(name,fn,n=200){for(let i=0;i<20;i++)fn();let times=[];for(let i=0;i<n;i++){let t=performance.now();fn();times.push(performance.now()-t);}times.sort((a,b)=>a-b);return {name,samples:n,median_ms:times[Math.floor(n*.5)],p95_ms:times[Math.floor(n*.95)],max_ms:times[n-1]};}
const now=1800000000000,p={timestamp:now,coords:{latitude:53.525,longitude:-1.13,accuracy:5,speed:5}};
const results=[100,1000,10000].map(n=>{const line=Array.from({length:n+1},(_,i)=>[53.52+i*.01/n,-1.13]);return bench(`route_matching_${n}_segments`,()=>RG.assessNavigationPosition(p,line,null,now));});
results.push(bench('provider_lane_parsing',()=>LG.extractRoutingLaneGuidance([{active:false},{active:true},{active:true}])));
results.push(bench('manoeuvre_lookup_1000',()=>RP.resolveStepIndexFromSnapIndex(Array.from({length:1000},(_,i)=>({begin_shape_index:i})),500)));
results.push(bench('turn_instruction',()=>TI.directionForManeuver({type:23})));
results.push(bench('persisted_state_JSON',()=>JSON.parse(JSON.stringify(fixtures)) ));
results.push(bench('complete_16_scenario_replay',()=>fixtures.scenarios.forEach(s=>replay(s,fixtures.routes[s.route])),50));
process.stdout.write(JSON.stringify({runtime:process.version,cpu:os.cpus()[0].model,platform:os.platform(),units:'milliseconds',limitations:'Synthetic local CPU only; no API, rendering, IndexedDB IO, battery, audio or device timing.',results},null,2)+'\n');
