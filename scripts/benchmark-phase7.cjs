// Reproducible local CPU/heap observations, not mobile or network measurements.
const {performance}=require('node:perf_hooks');
const os=require('node:os');
const RM=require('../static/js/modules/navigation/road-matching.js');
const RP=require('../static/js/modules/navigation/route-progress.js');
const fixtures=require('../tests/fixtures/phase7/directional-replay-v1.json');
const {replay}=require('./lib/navigation-replay.cjs');
const NOW=1800000000000;
function bench(name,fn,n=300){for(let i=0;i<20;i++)fn();const samples=[];for(let i=0;i<n;i++){const t=performance.now();fn();samples.push(performance.now()-t);}samples.sort((a,b)=>a-b);return {name,samples:n,median_ms:samples[Math.floor(n*.5)],p95_ms:samples[Math.floor(n*.95)],max_ms:samples[n-1]};}
const base=Object.values(fixtures.contexts).find(c=>c.roads.length===1&&!c.roads[0].tags.junction);
const position={timestamp:NOW+1000,coords:{latitude:53.52025,longitude:-1.13,accuracy:5,speed:10,heading:0}};
const results=[],memory=[];
for(const count of [100,1000,10000]){
    const roads=Array.from({length:count/10},(_,i)=>({osm_way_id:String(i),tags:{oneway:'yes'},geometry:Array.from({length:11},(_,j)=>[53.52+Math.floor(i/100)*.001+j*.00005,-1.13+(i%100)*.0005])}));
    const context={...base,roads};const before=process.memoryUsage().heapUsed,index=RM.createIndex(context),after=process.memoryUsage().heapUsed;
    memory.push({segments:count,grid_cells:index.grid.size,heap_delta_bytes:after-before});
    const first=RM.matchPosition({...position,timestamp:NOW},index,{now:NOW,route_generation:1});
    results.push(bench(`candidate_generation_${count}_segments`,()=>RM.nearby(index,[53.52025,-1.13],12)));
    results.push(bench(`directional_matching_${count}_segments`,()=>RM.matchPosition(position,index,{now:NOW+1000,previous:first,route_generation:1})));
    results.push(bench(`index_build_${count}_segments`,()=>RM.createIndex(context),30));
}
const index=RM.createIndex(base),p={timestamp:NOW,coords:{latitude:53.524,longitude:-1.13,accuracy:5,speed:10,heading:0}},first=RM.matchPosition(p,index,{now:NOW,route_generation:1}),match=RM.matchPosition({...p,timestamp:NOW+1000},index,{now:NOW+1000,previous:first,route_generation:1});
results.push(bench('road_attribute_lookup',()=>RM.attributes(match,base,'car',NOW+1000)));
results.push(bench('hazard_association',()=>RM.hazardAssociation(match,{osm_way_id:'100',direction:'forward',observed_at_ms:NOW},NOW+1000)));
results.push(bench('route_progress_lookup',()=>RP.resolveStepIndexFromSnapIndex([{begin_shape_index:0},{begin_shape_index:1}],1)));
results.push(bench('20_scenario_pipeline_replay',()=>fixtures.scenarios.forEach(s=>replay({...s,road_context:fixtures.contexts[s.context]},s.route)),100));
process.stdout.write(JSON.stringify({runtime:process.version,cpu:os.cpus()[0].model,platform:os.platform(),policy:'20 warmups; 300 samples except 30 index builds /100 complete replays. Milliseconds. Heap delta is noisy retained-allocation observation, not peak memory or mobile battery.',results,memory},null,2)+'\n');
