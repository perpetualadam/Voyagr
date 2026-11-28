const Boot=require('../../../prototypes/graphhopper11/uk_host_boot.js');
const Host=require('../../../prototypes/graphhopper11/host_journey_adapter.js');
const Evidence=require('../../../prototypes/graphhopper11/journey_evidence.js');
const Validator=require('../modules/navigation/speed-gps.js');
const Store=require('../modules/privacy/local-store.js');
const Plans=require('../../../prototypes/graphhopper11/saved_plans.js');
const {IDBFactory}=require('fake-indexeddb');
let host,preview,session,connection,guard,owner,identity,fix,notify;
beforeEach(()=>{
 notify=undefined;guard=undefined;
 identity={owner:'sb:synthetic_a',epoch:0};fix={lat:0,lon:0,accuracy:10,timestamp:Date.now()};
 owner={capture:jest.fn(()=>({...identity})),current:token=>token.owner===identity.owner&&token.epoch===identity.epoch,ready:jest.fn(()=>{throw Error('migration forbidden');}),db:jest.fn(()=>{throw Error('private records forbidden');})};
 host=new EventTarget();host.location={origin:'http://127.0.0.1:18511'};host.VoyagrLocalData=owner;
 host.VoyagrJourneyModes={PROTOCOL:1,captureIntent:()=>0,intentCurrent:value=>value===0,onIntentCancelled:()=>()=>{},getState:()=> 'LIVE',isSimulating:()=>false,isJourneyCommitPending:()=>false,isAbandoning:()=>false};
 const line=[[0,0],[0,.01]];
 host.VoyagrNavigationLifecycleOrchestration={DURABLE_OWNERSHIP_PROTOCOL:1,endpointIntentReady:()=>true,getRouteInProgress:()=>true,getRoutePolyline:()=>line,getNavigationStarting:()=>false,getNavigationFailure:()=>null};
 host.VoyagrGpsOrchestration={getAcceptedOriginFix:()=>fix,onAcceptedOriginFix:listener=>{notify=listener;return ()=>{notify=null;};}};
 session=Plans.create({indexedDB:new IDBFactory(),storeModule:Store});
 preview={location:{origin:host.location.origin},document:{getElementById:()=>({disabled:false})},VoyagrGH11SavedSession:session,VoyagrGH11HostJourney:Host,VoyagrSpeedGps:Validator,VoyagrGH11JourneyBridge:{bind:jest.fn(options=>{guard=Evidence.create(options);return {refresh:jest.fn(),close:()=>guard.close()};})}};
});
afterEach(()=>{connection?.close();connection=null;session.close();});
test('explicitly connects owner, lifecycle and GPS without migrations or navigation grants',()=>{
 connection=Boot.connect({hostWindow:host,previewWindow:preview});expect(connection.navigation_allowed).toBe(false);
 expect(session.capture().owner).toBe('sb:synthetic_a');expect(guard.current(guard.capture())).toBe(true);
 expect(owner.ready).not.toHaveBeenCalled();expect(owner.db).not.toHaveBeenCalled();
});
test.each(['https://vibevoyager.org','http://example.com','file:///tmp/host'])('refuses non-loopback host %s before reading identity',origin=>{
 host.location.origin=origin;preview.location.origin=origin;expect(()=>Boot.connect({hostWindow:host,previewWindow:preview})).toThrow();expect(owner.capture).not.toHaveBeenCalled();expect(notify).toBeUndefined();
});
test('cross-origin preview and not-ready contracts refuse before subscription',()=>{
 preview.location.origin='http://127.0.0.1:9999';expect(()=>Boot.connect({hostWindow:host,previewWindow:preview})).toThrow();
 preview.location.origin=host.location.origin;host.VoyagrJourneyModes.PROTOCOL=2;expect(()=>Boot.connect({hostWindow:host,previewWindow:preview})).toThrow();expect(notify).toBeUndefined();
});
test('replaced runtime modules fail closed even without an event',()=>{
 connection=Boot.connect({hostWindow:host,previewWindow:preview});const token=guard.capture();
 host.VoyagrGpsOrchestration={...host.VoyagrGpsOrchestration};expect(guard.current(token)).toBe(false);expect(()=>guard.capture()).toThrow();
});
test('owner changes propagate through the actual saved-session scope',()=>{
 connection=Boot.connect({hostWindow:host,previewWindow:preview});const captured=session.capture();identity={owner:'guest',epoch:1};host.dispatchEvent(new Event('voyagr-local-owner-change'));
 expect(session.current(captured)).toBe(false);expect(session.capture().owner).toBe('guest');
});
test('close removes subscriptions and cannot reconnect or resume an unbound session',()=>{
 connection=Boot.connect({hostWindow:host,previewWindow:preview});const token=guard.capture();connection.close();expect(notify).toBeNull();expect(guard.current(token)).toBe(false);expect(session.current(session.capture())).toBe(false);
 expect(()=>Boot.connect({hostWindow:host,previewWindow:preview})).toThrow();expect(()=>connection.refresh()).toThrow();
});
test('partial bridge failure closes the bound owner session and subscriptions',()=>{
 preview.VoyagrGH11JourneyBridge.bind.mockImplementation(()=>{throw Error('bridge refused');});expect(()=>Boot.connect({hostWindow:host,previewWindow:preview})).toThrow('bridge refused');
 expect(session.current(session.capture())).toBe(false);expect(notify).toBeNull();expect(()=>Boot.connect({hostWindow:host,previewWindow:preview})).toThrow();
});
