const Host=require('../../../prototypes/graphhopper11/host_journey_adapter.js');
const Evidence=require('../../../prototypes/graphhopper11/journey_evidence.js');
const Validator=require('../modules/navigation/speed-gps.js');
const Life=require('../app/navigation-lifecycle-orchestration.js');
let Modes,Gps,host,guard,identity,fix,target,changed,owner;
beforeEach(()=>{
 jest.isolateModules(()=>{Modes=require('../app/journey-modes.js');Gps=require('../app/gps-orchestration.js');});
 Gps.bind({m:{speedGps:()=>Validator}});
 jest.spyOn(Modes,'getState').mockReturnValue('LIVE'); // Synthetic live state; real intent clock/subscriptions.
 identity={owner:'guest',epoch:0};fix={lat:0,lon:0,accuracy:10,timestamp:Date.now()};target=window;changed=jest.fn();
 Gps.acceptOriginPosition({timestamp:fix.timestamp,coords:{latitude:fix.lat,longitude:fix.lon,accuracy:fix.accuracy}});
 owner={capture:()=>({...identity}),current:token=>token.owner===identity.owner&&token.epoch===identity.epoch};
 Life.setRoutePolyline([[0,0],[0,.01]]);Life.setRouteInProgress(true);
 host=Host.create({owner,modes:Modes,lifecycle:Life,gps:Gps,eventTarget:target,onChange:changed});
 guard=Evidence.create({...host,validator:Validator});
});
afterEach(()=>{host.close();guard.close();Life.setRouteInProgress(false);Life.setRoutePolyline(null);jest.restoreAllMocks();delete global.VoyagrJourneyModes;});
test('actual lifecycle geometry and actual intent clock provide only ephemeral context',()=>{
 const token=guard.capture();expect(guard.current(token)).toBe(true);expect(Object.keys(token)).toEqual([]);
 expect(host.journey.capture()).toMatchObject({active:true,simulating:false});
});
test('real lifecycle stop/start notifications invalidate even an unchanged geometry',()=>{
 const token=guard.capture();Life.setRouteInProgress(false);Life.setRouteInProgress(true);
 expect(changed).toHaveBeenCalledTimes(2);expect(guard.current(token)).toBe(false);
});
test('actual intent cancellation invalidates pending evidence',()=>{
 const token=guard.capture(),epoch=Modes.captureIntent();Modes.endpointChanged();
 expect(Modes.intentCurrent(epoch)).toBe(false);expect(changed).toHaveBeenCalled();expect(guard.current(token)).toBe(false);
});
test.each(['replace','mutate'])('%s geometry is detected without a host event',kind=>{
 const token=guard.capture();if(kind==='replace')Life.setRoutePolyline([[0,0],[0,.02]]);else Life.getRoutePolyline()[1][1]=.02;
 expect(guard.current(token)).toBe(false);
});
test.each(['simulation','planning','commit','abandon','starting','failure','unknown'])('refuses %s host state',kind=>{
 const token=guard.capture();
 if(kind==='simulation')jest.spyOn(Modes,'isSimulating').mockReturnValue(true);
 if(kind==='planning')Modes.getState.mockReturnValue('PLANNING');
 if(kind==='commit')jest.spyOn(Modes,'isJourneyCommitPending').mockReturnValue(true);
 if(kind==='abandon')jest.spyOn(Modes,'isAbandoning').mockReturnValue(true);
 if(kind==='starting')jest.spyOn(Life,'getNavigationStarting').mockReturnValue(true);
 if(kind==='failure')jest.spyOn(Life,'getNavigationFailure').mockReturnValue('map_failed');
 if(kind==='unknown')jest.spyOn(Life,'getRouteInProgress').mockReturnValue(undefined);
 expect(guard.current(token)).toBe(false);expect(()=>guard.capture()).toThrow();
});
test('owner changes and GPS changes invalidate without location persistence',()=>{
 const token=guard.capture();identity.epoch++;expect(guard.current(token)).toBe(false);
 const newer=guard.capture();fix={...fix,timestamp:fix.timestamp+1};Gps.acceptOriginPosition({timestamp:fix.timestamp,coords:{latitude:fix.lat,longitude:fix.lon,accuracy:fix.accuracy}});expect(guard.current(newer)).toBe(false);
});
test('explicit refresh notifies the UI, and close unsubscribes without mutating the host',()=>{
 const token=guard.capture();host.refresh();expect(changed).toHaveBeenCalledTimes(1);expect(guard.current(token)).toBe(false);
 const line=Life.getRoutePolyline();host.close();changed.mockClear();Life.setRouteInProgress(true);Modes.endpointChanged();
 expect(changed).not.toHaveBeenCalled();expect(Life.getRoutePolyline()).toBe(line);expect(Life.getRouteInProgress()).toBe(true);expect(()=>guard.capture()).toThrow();
});
test.each([null,[],[[NaN,0],[0,1]],[[91,0],[0,1]],[[0,0,1],[0,1]]])('malformed geometry refuses %j',line=>{Life.setRoutePolyline(line);expect(()=>guard.capture()).toThrow();});
test('a replacement polyline object invalidates even identical coordinates',()=>{
 const token=guard.capture();Life.setRoutePolyline([[0,0],[0,.01]]);expect(guard.current(token)).toBe(false);
});
test('actual GPS acceptance immediately invalidates captured work through the subscribed adapter',async()=>{
 let finish;const pending=guard.run(()=>new Promise(resolve=>{finish=resolve;}));
 expect(Gps.acceptOriginPosition({timestamp:fix.timestamp+1,coords:{latitude:.001,longitude:0,accuracy:10}})).toBe(true);
 expect(changed).toHaveBeenCalledTimes(1);finish('old preview');await expect(pending).rejects.toThrow('changed');
});
test('rejected and identical fixes do not emit refresh notifications',()=>{
 const token=guard.capture();
 expect(Gps.acceptOriginPosition({timestamp:fix.timestamp,coords:{latitude:fix.lat,longitude:fix.lon,accuracy:fix.accuracy}})).toBe(true);
 expect(Gps.acceptOriginPosition({timestamp:Date.now()-16000,coords:{latitude:0,longitude:0,accuracy:10}})).toBe(false);
 expect(changed).not.toHaveBeenCalled();expect(guard.current(token)).toBe(true);
});
test('notification has no coordinates and failing observers cannot interrupt GPS acceptance',()=>{
 const observed=jest.fn(),off=Gps.onAcceptedOriginFix(observed),fail=Gps.onAcceptedOriginFix(()=>{throw Error('optional observer failed');});
 expect(Gps.acceptOriginPosition({timestamp:fix.timestamp+1,coords:{latitude:1,longitude:1,accuracy:5}})).toBe(true);
 expect(observed.mock.calls).toEqual([[]]);expect(Gps.getAcceptedOriginFix()).toMatchObject({lat:1,lon:1});
 off();fail();Gps.acceptOriginPosition({timestamp:fix.timestamp+2,coords:{latitude:2,longitude:1,accuracy:5}});expect(observed).toHaveBeenCalledTimes(1);
});
test('closing unsubscribes actual GPS notifications',()=>{
 host.close();changed.mockClear();Gps.acceptOriginPosition({timestamp:fix.timestamp+1,coords:{latitude:1,longitude:1,accuracy:5}});expect(changed).not.toHaveBeenCalled();
});
