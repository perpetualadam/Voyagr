// Node-only processing workload. No browser, MapLibre rendering or device claim.
const {performance}=require('node:perf_hooks');
const fixture=require('../tests/fixtures/phase5-journey.json');
const codec=require('../static/js/modules/navigation/polyline-codec.js');
const selection=require('../static/js/modules/navigation/route-selection.js');
const geometry=require('../static/js/modules/navigation/route-geometry.js');
const integrity=require('../static/js/modules/navigation/avoidance-integrity.js');
const cases=[];
for (const alternatives of [1,3]) {
    const samples=[];
    for(let i=0;i<200;i++) {
        const started=performance.now();
        const options=selection.buildRouteOptionsFromApiResponse({routes:Array(alternatives).fill(fixture)},codec.decodePolyline);
        const coords=codec.decodePolyline(options[0].geometry,6);
        if(coords.length!==5) throw Error('Journey truncated');
        geometry.computeRemainingDistanceAlongRoute(...coords[1],coords,0);
        if(integrity.geometryBinding(options[0])!==fixture.avoidance_assessment.geometry_binding)throw Error('Geometry binding mismatch');
        samples.push(performance.now()-started);
    }
    samples.sort((a,b)=>a-b);
    cases.push({alternatives,samples:samples.length,median_ms:samples[100],p95_ms:samples[189],max_ms:samples[199]});
}
console.log(JSON.stringify({scope:'Node pure frontend processing, five vertices; excludes browser/rendering/network',cases},null,2));
