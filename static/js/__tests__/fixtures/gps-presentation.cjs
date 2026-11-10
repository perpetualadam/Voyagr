// Real GPS planners; only device/rendering and unrelated service boundaries are doubled.
function completeGpsRuntime(runtime) {
 const GPS=require('../../app/gps-orchestration.js');
 const noop=()=>{};
 global._turnInstructions=()=>require('../../modules/navigation/turn-instructions.js');
 global.updateLaneGuidance=jest.fn();
 global.VoyagrSmartZoomOrchestration={getSmartZoomEnabled:()=>false,getLastDistanceToNextTurn:()=>null,getLastZoomLevel:()=>16,computeSmartZoomLevel:()=>16,setLastDistanceToNextTurn:noop};
 if(!global.VoyagrNavigationLifecycleOrchestration)global.VoyagrNavigationLifecycleOrchestration=require('../../app/navigation-lifecycle-orchestration.js');
 const marker={setLngLat:jest.fn(),getElement:()=>null,addTo:jest.fn(function(map){this._map=map;return this;}),remove:jest.fn()};
 const call={updateRoadReportFabVisibility:noop,smoothGpsSpeedMph:x=>x,createVehicleMarker:()=>marker,isActiveNavigationFollow:()=>false,shouldTiltDrivingCamera:()=>false,shouldUsePitchedDrivingCamera:()=>false,detectUpcomingTurn:()=>null,getFollowingManeuver:()=>null,effectiveRoundaboutExitCount:()=>null,updateTurnWidgetFromPosition:jest.fn(),fetchRoadNameThrottled:noop,convertDistance:String,getCurrentRoadType:()=> 'unknown',speakMessage:jest.fn(),clearInitialETAAnnouncement:noop,updateRecenterButtonVisibility:noop,updateJourneySummaryBar:jest.fn(),...runtime.call};
 return {...runtime,getIsOffline:()=>true,consts:{HAZARD_WARNING_DISTANCE:500,TURN_ANNOUNCEMENT_DISTANCES:[],EXIT_ANNOUNCEMENT_DISTANCES:[],KEEP_ANNOUNCEMENT_DISTANCES:[],...runtime.consts},m:{cameraPitch:()=>require('../../modules/navigation/camera-pitch.js'),routeProgress:()=>require('../../modules/navigation/route-progress.js'),voiceAnnouncements:()=>require('../../modules/navigation/voice-announcements.js'),hazardAlerts:()=>require('../../modules/navigation/hazard-alerts.js'),speedLimitWidget:()=>null,...runtime.m},call,marker,GPS};
}
module.exports={completeGpsRuntime};
