// Read-only synthetic probes of the production reroute pipeline. No live service,
// driving session or persisted journey is contacted. Output describes observations,
// not assertions that the current defects should remain supported behavior.
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<input id="end">',{url:'https://reroute.invalid/'});
global.window=dom.window;global.document=dom.window.document;global.localStorage=dom.window.localStorage;
Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
const AI=require('../static/js/modules/navigation/avoidance-integrity');
const RD=require('../static/js/modules/navigation/reroute-decision');
const RR=require('../static/js/modules/navigation/routing-request');
const MapOwner=require('../static/js/app/reroute-map-orchestration');
const GPS=require('../static/js/app/gps-orchestration');
const {makeRoute}=require('../static/js/__tests__/fixtures/navigation-transition.cjs');
global.VoyagrAvoidanceIntegrity=AI;
const previous=makeRoute('previous');previous.name='Optimised';previous.source='GraphHopper';
previous.journey_context={version:1,purpose:'planning',origin:{kind:'gps',coordinates:[53,-1]},destination:{kind:'searched',coordinates:[53.01,-1]},ordered_stops:[{coordinates:[53.005,-1],name:'Remaining stop',kind:'map'}]};
window.lastCalculatedRoute=previous;
MapOwner.bind({routingRequest:()=>RR,getCurrentRoutingMode:()=> 'auto',getCurrentVehicleType:()=> 'petrol_diesel',call:{getRouteCostParams:()=>({}),isAvoidTollsEnabled:()=>false,getRoutePreferences:()=>({})}});
const body=MapOwner.buildRouteRequest(53,-1,'53.01,-1');
const first=makeRoute('blocked');first.name='Fastest';first.source='Valhalla';
Object.assign(first.avoidance_assessment,{automatic_selection_allowed:false,status:'VIOLATED',requires_acceptance:true});first.avoidance_assessment.requirements[0].status='VIOLATED';
const gh=makeRoute('eligible-gh');gh.name='Optimised';gh.source='GraphHopper';gh.avoidance_assessment.automatic_selection_allowed=true;
const state={routeInProgress:true,rerouteInProgress:false,lastRerouteAttemptTime:0,postRerouteGraceUntil:0,currentLat:53,currentLon:-1};
let mapUpdates=0;
GPS.bind({g:k=>state[k],s:(k,v)=>{state[k]=v;},m:{rerouteDecision:()=>RD},call:{resolveNavigationDestination:()=> '53.01,-1',buildRouteRequest:()=>body,showStatus:()=>{},updateRouteOnMap:()=>{mapUpdates++;return {ok:true};}}});
global.fetch=async()=>({json:async()=>({success:true,routes:[first,gh]})});
(async()=>{
 await GPS.triggerAutomaticRerouteWithHazardHandling(53,-1);
 const alternativeGh={...gh,name:'Scenic'},sameNameValhalla={...gh,source:'Valhalla'};
 const picked=RD.pickRerouteRouteFromResponse([sameNameValhalla,alternativeGh],{previousRouteName:'Optimised',previousRouteSource:'GraphHopper'});
 console.log(JSON.stringify({first_candidate_probe:{graphhopper_independently_allowed:AI.gate(gh,{storage:localStorage,quiet:true}),picker_would_choose:RD.pickRerouteRouteFromResponse([first,gh],{previousRouteName:'Optimised',previousRouteSource:'GraphHopper'}).source,actual_map_updates:mapUpdates,in_progress_after:state.rerouteInProgress},request_probe:{remaining_stops_in_active_context:previous.journey_context.ordered_stops.length,stops_in_request:body.stops??null,via_points_in_request:body.via_points??null,journey_context_in_request:body.journey_context??null,force_refresh:body.force_refresh,is_reroute:body.is_reroute},engine_probe:{previous:'GraphHopper',same_name_other_engine_and_different_name_graphhopper_available:true,picked:picked.source}},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
