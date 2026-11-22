const Evidence=require('../../../prototypes/graphhopper11/journey_evidence.js');
const validator=require('../modules/navigation/speed-gps.js');
let clock,identity,route,fix,owner,journey,gps,guard;
beforeEach(()=>{
 clock=100000;identity={owner:'guest',epoch:0};route={route_id:'public_fixture',generation:1,active:true,simulating:false};fix={lat:53,lon:-1,accuracy:20,timestamp:clock};
 owner={capture:()=>({...identity}),current:token=>token.owner===identity.owner&&token.epoch===identity.epoch};
 journey={capture:()=>({...route}),current:token=>Object.keys(token).every(key=>token[key]===route[key])};gps={getAcceptedOriginFix:()=>fix};
 guard=Evidence.create({owner,journey,gps,validator,now:()=>clock});
});
afterEach(()=>guard.close());
test('opaque in-memory capture validates the actual accepted fix without exposing location or enabling navigation',()=>{
 const token=guard.capture();expect(Object.keys(token)).toEqual([]);expect(Object.isFrozen(token)).toBe(true);expect(guard.current(token)).toBe(true);
 expect(guard.current({})).toBe(false);expect(guard.current(null)).toBe(false);expect(JSON.stringify(token)).toBe('{}');
});
test.each([
 ['stale',()=>{fix.timestamp=clock-15001;}],['future',()=>{fix.timestamp=clock+1001;}],['invalid coordinate',()=>{fix.lat=91;}],['missing accuracy',()=>{delete fix.accuracy;}],['invalid accuracy',()=>{fix.accuracy=-1;}],['missing fix',()=>{fix=null;}],
 ['simulation',()=>{route.simulating=true;}],['unknown simulation',()=>{delete route.simulating;}],['stopped',()=>{route.active=false;}],['missing route',()=>{route.route_id='';}],['invalid generation',()=>{route.generation=-1;}]
])('refuses %s evidence',(_name,change)=>{change();expect(()=>guard.capture()).toThrow();});
test.each([
 ['owner epoch',()=>{identity.epoch++;}],['owner',()=>{identity={owner:'sb:other',epoch:1};}],['route generation',()=>{route.generation++;}],['route identity',()=>{route.route_id='replacement';}],['stop',()=>{route.active=false;}],['new fix',()=>{fix={...fix,timestamp:clock+1};}],['expired fix',()=>{clock+=15001;}],['simulation',()=>{route.simulating=true;}]
])('%s change prevents late asynchronous completion',async(_name,change)=>{
 let finish;const pending=guard.run(()=>new Promise(resolve=>{finish=resolve;}));change();finish({preview:'old'});await expect(pending).rejects.toThrow('changed');
});
test('current asynchronous work may complete; no route authority is added',async()=>{const result={navigation_allowed:false};expect(await guard.run(async()=>result)).toBe(result);});
test('regressed accepted timestamps refuse even when individually fresh',()=>{
 guard.capture();fix={...fix,timestamp:clock-1};expect(()=>guard.capture()).toThrow();
});
test('throwing or unconfirmed sources fail closed',()=>{
 const token=guard.capture();owner.current=()=> 'true';expect(guard.current(token)).toBe(false);expect(()=>guard.capture()).toThrow();
 owner.current=()=>{throw Error('identity unavailable');};expect(guard.current(token)).toBe(false);
});
test('closed guard cannot restore evidence and does not mutate input fixes',()=>{
 const before=JSON.stringify(fix),token=guard.capture();guard.close();expect(guard.current(token)).toBe(false);expect(()=>guard.capture()).toThrow();expect(JSON.stringify(fix)).toBe(before);
});
test('validator boundaries match the actual shared module, including uncertain accuracy',()=>{
 fix.timestamp=clock-15000;fix.accuracy=1000;expect(guard.current(guard.capture())).toBe(true);
 // Accepted browser evidence alone does not establish a reliable road match.
 expect(guard.capture().navigation_allowed).toBeUndefined();
});
test('an observed invalidation cannot revive an old token',()=>{
 const token=guard.capture();route.active=false;expect(guard.current(token)).toBe(false);route.active=true;expect(guard.current(token)).toBe(false);
});
test('invalid clock and mutable coordinator captures cannot bypass ownership',()=>{
 clock=NaN;expect(()=>guard.capture()).toThrow();clock=100000;
 owner.capture=()=>identity;journey.capture=()=>route;const token=guard.capture();identity.epoch++;expect(guard.current(token)).toBe(false);
});
