const RM=require('../modules/navigation/road-matching');
const SL=require('../modules/navigation/speed-limit-widget');
const SG=require('../modules/navigation/speed-gps');
const NOW=1800000000000;
let owner,widget,release,fix,position,now,fetchMock,clock,tracking,route;
const observation=()=>({status:'AVAILABLE',observation:{source:'TomTom',evidence_state:'MAPPED_OBSERVATION',applicable:false,speed_limit_mph:30,position_uncertain:true,acquired_at_ms:now}});
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
beforeEach(()=>{
 jest.resetModules();now=NOW;clock=jest.spyOn(Date,'now').mockImplementation(()=>now);tracking=true;
 fix={lat:53.524,lon:-1.13,accuracy:10,timestamp:NOW};
 position={timestamp:NOW,coords:{latitude:fix.lat,longitude:fix.lon,accuracy:10,heading:0,speed:0}};
 document.body.innerHTML='<select id="vehicleType"><option value="petrol_diesel">Car</option></select><div id="speedWidget"><span id="speedValue"></span><div id="speedLimitCircle"><span id="speedLimitValue"></span><span id="speedLimitUnit"></span><span id="speedLimitMappedLabel"></span></div></div>';
 fetchMock=jest.fn(url=>url==='/api/speed-limit/observation'?new Promise(resolve=>{release=resolve;}):Promise.resolve({ok:true,json:async()=>({context:null})}));
 global.fetch=fetchMock;global.VoyagrRoadMatching=RM;
 global.VoyagrGpsOrchestration={getAcceptedOriginFix:()=>fix,getNavigationPositionEvidence:()=>null,getRouteSpeedObservation:()=>({evidence_state:'ROUTE_OBSERVATION',applicable:false,speed_limit_mph:40})};
 widget=require('../app/speed-widget-orchestration');
 widget.bind({speedGps:()=>SG,speedLimitWidget:()=>SL,getSpeedUnit:()=> 'mph',getIsTrackingActive:()=>tracking,getRouteInProgress:()=>false,getCurrentRouteSteps:()=>[],call:{getSpeedUnit:()=> 'mph'}});
 owner=require('../app/road-match-orchestration');route={id:'test'};owner.observe(position,null,route);
});
afterEach(()=>{owner.invalidate('test cleanup');clock.mockRestore();delete global.VoyagrRoadMatching;delete global.VoyagrRoadMatchOrchestration;delete global.VoyagrGpsOrchestration;delete global.VoyagrSpeedWidgetOrchestration;delete global.fetch;});
function render(){widget.fetchSpeedLimitThrottled(fix.lat,fix.lon,0,'residential',40,null);}
function value(){return document.getElementById('speedLimitValue').textContent;}
test('real owner request asynchronously promotes primary over Overpass and route, without a new GPS tick or legal alerts',async()=>{
 const mapped=jest.spyOn(owner,'getSpeedObservation').mockReturnValue({evidence_state:'MAPPED_OBSERVATION',applicable:false,speed_limit_mph:20});
 render();expect(value()).toBe('20');
 release({ok:true,json:async()=>observation()});await settle();
 expect(value()).toBe('30');expect(document.getElementById('speedLimitMappedLabel').textContent).toBe('Provider est.');
 expect(widget.getCurrentSpeedLimitMph()).toBeNull();
 expect(document.getElementById('speedLimitMappedLabel').title).toBe('Provider map estimate; road/direction uncertain. Check road signs');
 expect(fetchMock.mock.calls.filter(([url])=>url==='/api/speed-limit/observation')).toHaveLength(1);
 mapped.mockRestore();
});
test.each(['http','unavailable'])('primary %s leaves Overpass and then route usable',async mode=>{
 release({ok:mode!=='http',json:async()=>({status:'UNAVAILABLE',observation:null})});await settle();
 const mapped=jest.spyOn(owner,'getSpeedObservation').mockReturnValue({evidence_state:'MAPPED_OBSERVATION',applicable:false,speed_limit_mph:20});
 render();expect(value()).toBe('20');mapped.mockReturnValue(null);render();expect(value()).toBe('40');expect(widget.getCurrentSpeedLimitMph()).toBeNull();
});
test.each(['stale','moved','heading','invalidated','new route','stopped'])('late primary response cannot publish after %s',async kind=>{
 const oldRelease=release;
 if(kind==='stale'){now+=16000;fix.timestamp=NOW;}
 if(kind==='moved'){position.coords.longitude+=.01;fix.lon+=.01;}
 if(kind==='heading'){position.coords.heading=180;position.coords.speed=10;}
 if(kind==='invalidated')owner.invalidate('GPS ended');
 if(kind==='new route')owner.observe(position,null,{id:'replacement'});
 if(kind==='stopped'){tracking=false;owner.invalidate('GPS ended');}
 oldRelease({ok:true,json:async()=>observation()});await settle();
 expect(owner.getPrimarySpeedObservation()).toBeNull();expect(value()).not.toBe('30');
});
test('fresh primary expires and route fallback replaces it',async()=>{
 release({ok:true,json:async()=>observation()});await settle();expect(value()).toBe('30');
 now+=10001;position.timestamp=now;fix.timestamp=now;render();expect(value()).toBe('40');
});
test('client local-road plausibility still rejects a primary motorway estimate',async()=>{
 const data=observation();data.observation.speed_limit_mph=70;
 release({ok:true,json:async()=>data});await settle();render();expect(value()).toBe('40');
});

test('simulation cannot read a cached primary estimate',async()=>{
 release({ok:true,json:async()=>observation()});await settle();
 global.VoyagrJourneyModes={isSimulating:()=>true};
 try{expect(owner.getPrimarySpeedObservation()).toBeNull();}finally{delete global.VoyagrJourneyModes;}
});
test('vehicle change rejects a cached primary value before another GPS sample',async()=>{
 release({ok:true,json:async()=>observation()});await settle();
 document.getElementById('vehicleType').innerHTML='<option value="truck">Truck</option>';
 expect(owner.getPrimarySpeedObservation()).toBeNull();
});

test('native-style inherited GPS getters produce a complete request and a usable snapshot',async()=>{
 owner.invalidate('replace fixture with native coordinates');
 const prototype={};
 for(const [key,value]of Object.entries({latitude:53.524,longitude:-1.13,accuracy:10,heading:0,speed:0})){
   Object.defineProperty(prototype,key,{get:()=>value,enumerable:true});
 }
 const coords=Object.create(prototype);
 expect(Object.keys(coords)).toEqual([]);
 position={timestamp:now,coords};owner.observe(position,null,route);
 const requests=fetchMock.mock.calls.filter(([url])=>url==='/api/speed-limit/observation');
 const body=JSON.parse(requests[requests.length-1][1].body);
 expect(body).toMatchObject({lat:53.524,lon:-1.13,accuracy:10,heading:0,vehicle_type:'car'});
 release({ok:true,json:async()=>observation()});await settle();
 expect(value()).toBe('30');expect(owner.getPrimarySpeedObservation()).toMatchObject({speed_limit_mph:30,applicable:false});
 expect(widget.getCurrentSpeedLimitMph()).toBeNull();
});

test('stationary heading jitter does not discard a fresh primary observation',async()=>{
 release({ok:true,json:async()=>observation()});await settle();
 position.coords.heading=180;render();expect(value()).toBe('30');
 expect(widget.getCurrentSpeedLimitMph()).toBeNull();
});
test('refresh begins before expiry and the valid estimate stays visible while it completes',async()=>{
 release({ok:true,json:async()=>observation()});await settle();
 now+=6000;position.timestamp=now;fix.timestamp=now;owner.observe(position,null,route);render();
 expect(fetchMock.mock.calls.filter(([url])=>url==='/api/speed-limit/observation')).toHaveLength(2);
 expect(value()).toBe('30');
 now+=3000;position.timestamp=now;fix.timestamp=now;owner.observe(position,null,route);render();expect(value()).toBe('30');
 release({ok:true,json:async()=>observation()});await settle();expect(value()).toBe('30');
});
test('a pending refresh cannot extend expired data',async()=>{
 release({ok:true,json:async()=>observation()});await settle();
 now+=6000;position.timestamp=now;fix.timestamp=now;owner.observe(position,null,route);
 now+=4001;position.timestamp=now;fix.timestamp=now;render();expect(value()).toBe('40');
});
