const AI = require('../../modules/navigation/avoidance-integrity.js');
const RS = require('../../modules/navigation/route-selection.js');
const RD = require('../../modules/navigation/reroute-decision.js');
const VA = require('../../modules/navigation/voice-announcements.js');
const Life = require('../../app/navigation-lifecycle-orchestration.js');
const Compare = require('../../app/route-comparison-orchestration.js');
const Reroute = require('../../app/reroute-map-orchestration.js');
const codec = require('polyline');
function makeRoute(id='A', points=[[53,-1],[53.01,-1]]) {
    const now=Date.now()/1000;
    const r={id,name:id,destination:'53.01,-1',destinationName:'Synthetic destination',
        geometry:codec.encode(points,6),geometry_precision:6,polyline:points,
        maneuvers:[{type:1,instruction:'Synthetic '+id,begin_shape_index:0,end_shape_index:points.length-1}],
        avoidance_preferences_snapshot:AI.snapshot(localStorage),
        avoidance_assessment:{checked_at:now,status:'SATISFIED',geometry_valid:true,requires_acceptance:false,
            requirements:[{category:'tolls',enabled:true,mode:'mandatory',status:'SATISFIED'}],
            origin_integrity:{checked_at:now,navigation_allowed:true,transition_verified:false,
                status:'CONTINUOUS_WITHIN_NUMERICAL_TOLERANCE',requested_origin:[53,-1]}}};
    r.avoidance_assessment.geometry_binding=AI.geometryBinding(r);return r;
}
function bindTransition(options={}) {
    global.VoyagrAvoidanceIntegrity=AI; global.VoyagrNavigationLifecycleOrchestration=Life;
    global.VoyagrRerouteMapOrchestration=Reroute;
    const status=options.status || jest.fn(),noop=jest.fn();
    require('../../maplibre-helpers.js');
    const helpers=window.MapLibreHelpers;
    const layers=new Set(),mapMutation=jest.fn(),sources={},mapLayers={};
    const map=options.map || {isStyleLoaded:()=>true,
        getStyle:()=>({layers:Object.values(mapLayers),sources}),
        getLayer:id=>mapLayers[id],getSource:id=>sources[id],
        addSource:(id,data)=>{mapMutation();sources[id]=data;layers.add(id);},
        addLayer:data=>{mapMutation();mapLayers[data.id]=data;},
        removeLayer:id=>{mapMutation();delete mapLayers[id];},
        removeSource:id=>{mapMutation();if(Object.values(mapLayers).some(x=>x.source===id))throw new Error('Source still in use');delete sources[id];layers.delete(id);},easeTo:noop};
    let layer=options.layer || (map.isStyleLoaded() ? helpers.addPolyline(map,Life.getRoutePolyline() || [[53,-1],[53.01,-1]],{}) : null);
    const oldLayer=layer;
    mapMutation.mockClear();
    const addPolyline=options.addPolyline || jest.fn((...args)=>helpers.addPolyline(...args));
    const mapHelpers={...helpers,addPolyline,fitMapBounds:noop};
    const runtime={rerouteDecision:()=>RD,routeSelection:()=>RS,voiceAnnouncements:()=>VA,speedLimitWidget:()=>null,
        getRouteInProgress:Life.getRouteInProgress,getCurrentLat:()=>options.gps ? 53 : null,getCurrentLon:()=>options.gps ? -1 : null,
        getLastCalculatedRoute:()=>window.lastCalculatedRoute,setLastCalculatedRoute:x=>{window.lastCalculatedRoute=x;},
        getRouteOptions:Compare.getRouteOptions,setRouteOptions:Compare.setRouteOptions,
        getSelectedRouteIndex:Compare.getSelectedRouteIndex,setSelectedRouteIndex:Compare.setSelectedRouteIndex,
        getRoutePolyline:Life.getRoutePolyline,setRoutePolyline:Life.setRoutePolyline,
        getCurrentRouteSteps:Life.getCurrentRouteSteps,setCurrentRouteSteps:Life.setCurrentRouteSteps,
        getCurrentStepIndex:Life.getCurrentStepIndex,setCurrentStepIndex:Life.setCurrentStepIndex,
        getLastSnappedRouteIndex:Life.getLastSnappedRouteIndex,setLastSnappedRouteIndex:Life.setLastSnappedRouteIndex,
        getLastTurnDetectRouteVertexIndex:Life.getLastTurnDetectRouteVertexIndex,setLastTurnDetectRouteVertexIndex:Life.setLastTurnDetectRouteVertexIndex,
        getNextManeuverDistance:Life.getNextManeuverDistance,setNextManeuverDistance:Life.setNextManeuverDistance,
        getNavigationArrivalTriggered:Life.getNavigationArrivalTriggered,setNavigationArrivalTriggered:Life.setNavigationArrivalTriggered,
        getNavigationArrivalZoneSince:Life.getNavigationArrivalZoneSince,setNavigationArrivalZoneSince:Life.setNavigationArrivalZoneSince,
        getRouteLayer:()=>layer,setRouteLayer:x=>{layer=x;},getMap:()=>map,getMapLibreHelpers:()=>mapHelpers,
        getAnnouncedTurnThresholds:()=>new Set(),getAnnouncedExitThresholds:()=>new Set(),getAnnouncedKeepThresholds:()=>new Set(),
        setLastETAAnnouncementTime:noop,setLastAnnouncedETA:noop,setLastDestinationAnnouncementDistance:noop,
        setInitialETAMovementRetries:noop,setVoiceAnnouncedForManeuverIndex:noop,setVoiceAnnouncedCategory:noop,
        call:{showStatus:status,navActiveRouteColor:()=> '#3388ff',convertDistance:String,getDistanceUnit:()=> 'km',
            clearAllRouteLayerHandles:()=>Compare.clearComparisonRouteLayers(),bringNavRouteAboveTrafficEdges:noop,clearRouteTrafficLayers:noop,
            fetchAndDisplayRouteTraffic:noop,resetVehicleMarkerDisplayState:noop,resetNavigationArrivalState:noop,
            resetRoadNameState:noop,clearRerouteFailureRetries:noop,updateTurnWidgetFromPosition:noop,
            fetchRoadNameThrottled:noop,updateTripInfo:noop,clearInitialETAAnnouncement:noop,setLastLaneVoiceKey:noop,
            primeVehicleMarkerOnRoute:noop,applySpeedLimitFetchResetFromPlan:noop}};
    Reroute.bind(runtime);
    const compareRuntime={routeSelection:()=>RS,getMap:()=>map,getMapLibreHelpers:()=>mapHelpers,
        getRouteLayer:()=>layer,setRouteLayer:x=>{layer=x;},getShowTrafficEnabled:()=>false,getTrafficLayer:()=>null,
        setRoutePolyline:x=>{mapMutation();Life.setRoutePolyline(x);},call:{showStatus:status,
            getTrafficSettingsSnapshot:()=>({routeTrafficEnabled:options.traffic!==false}),
            convertDistance:String,getDistanceUnit:()=> 'km',getCurrencySymbol:()=> 'GBP',
            fetchAndDisplayRouteTraffic:noop,displayAllRouteHazards:noop,clearHazardMarkers:noop,showRoutePreview:noop}};
    Compare.bind(compareRuntime);
    function snapshot(){return JSON.stringify({last:window.lastCalculatedRoute,api:window.lastRouteApiResponse,
        options:Compare.getRouteOptions(),index:Compare.getSelectedRouteIndex(),polyline:Life.getRoutePolyline(),
        steps:Life.getCurrentRouteSteps(),step:Life.getCurrentStepIndex(),snap:Life.getLastSnappedRouteIndex(),
        next:Life.getNextManeuverDistance(),arrived:Life.getNavigationArrivalTriggered(),arrivalSince:Life.getNavigationArrivalZoneSince(),
        turn:Life.getLastTurnDetectRouteVertexIndex(),active:Life.getRouteInProgress(),layer:layer&&layer.id,layers:[...layers]});}
    return {runtime,compareRuntime,status,addPolyline,mapMutation,snapshot,layers,map,mapHelpers,oldLayer};
}
module.exports={makeRoute,bindTransition};

// Full production lifecycle, planners, renderer and recovery contract; only
// device/services and the MapLibre API boundary are doubled.
function bindStart(context, overrides={}) {
    const noop=jest.fn();
    global.VoyagrMapControls=require('../../modules/map/map-controls.js');
    global.VoyagrDeviceEnvironment=require('../../modules/ui/device-environment.js');
    const calls={...context.runtime.call,
        persistActiveRoute:jest.fn(()=>true),precacheRouteTiles:noop,resetNavETASnapshot:noop,
        resetVoiceAnnouncementStateForNewRoute:()=>Reroute.resetVoiceAnnouncementStateForNewRoute(),
        clearPersistedRoute:noop,startGPSTracking:noop,stopGPSTracking:noop,
        startLiveDataRefresh:noop,stopLiveDataRefresh:noop,updateETACalculation:noop,
        scheduleInitialETAAnnouncement:noop,startAutoTrafficUpdates:noop,stopAutoTrafficUpdates:noop,
        startRouteTrafficUpdates:noop,stopRouteTrafficUpdates:noop,showTurnInstructionWidget:noop,
        hideTurnInstructionWidget:noop,updateTurnInstructionDisplay:noop,showJourneySummaryBar:noop,
        hideJourneySummaryBar:noop,updateNavigationFabVisibility:noop,voyagrShowMapIconHint:noop,
        showVolumeHintForNavigation:noop,applyZoomFollowButtonUi:noop,updateRoadReportFabVisibility:noop,
        updateRecenterButtonVisibility:noop,updateSpeedWidgetVisibility:noop,
        shouldUsePitchedDrivingCamera:()=>false,applyDriverPerspective:noop,sendNotification:jest.fn(),speakMessage:noop,
        getTrafficSettingsSnapshot:()=>({autoTrafficUpdateEnabled:false,routeTrafficEnabled:false}),
        hideRoadNameBar:noop,buildTraveledJourneyRoute:noop,persistCompletedTrip:noop,showJourneySummary:noop,
        stopARMode:noop,saveAppState:noop,
        ...overrides.call};
    const runtime={...context.runtime,mapControls:()=>global.VoyagrMapControls,routeSelection:()=>RS,
        routeGeometry:()=>require('../../modules/navigation/route-geometry.js'),
        turnInstructions:()=>require('../../modules/navigation/turn-instructions.js'),
        deviceEnvironment:()=>global.VoyagrDeviceEnvironment,toggleUI:()=>({applyToggleButton:noop}),eta:()=>({}),
        getIsTrackingActive:()=>true,getZoomAndFollowEnabled:()=>true,getMapFollowingActive:()=>false,
        setMapFollowingActive:noop,setJourneyOverviewActive:noop,setSavedMapState:noop,
        setLastNavTrafficFetchAt:noop,clearLastDistanceToNextTurn:jest.fn(),
        getDriverPerspectiveEnabled:()=>false,getArModeActive:()=>false,getUpdatePending:()=>false,
        ...overrides,call:calls};
    Life.bind(runtime);return runtime;
}
module.exports.bindStart=bindStart;
