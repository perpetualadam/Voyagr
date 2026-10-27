// Synthetic replay harness. Delegates admission/matching/arrival/reroute to product modules.
const RM=require('../../static/js/modules/navigation/road-matching.js');
const LG=require('../../static/js/modules/navigation/lane-guidance.js');
const HA=require('../../static/js/modules/navigation/hazard-alerts.js');
const SG=require('../../static/js/modules/navigation/speed-gps.js');
const RG=require('../../static/js/modules/navigation/route-geometry.js');
const RP=require('../../static/js/modules/navigation/route-progress.js');
const RD=require('../../static/js/modules/navigation/reroute-decision.js');
const TI=require('../../static/js/modules/navigation/turn-instructions.js');
function replay(scenario,route,nowBase=1800000000000) {
    let previous=null,lastTimestamp=0,remaining=null,along=null,deviation={},joined=false;
    const rows=[];
    const roadIndex=scenario.road_context ? RM.createIndex(scenario.road_context) : null;
    let previousRoad=null;
    for(const frame of scenario.frames) {
        const now=nowBase+frame.t;
        const position={timestamp:now+(frame.timestampOffsetMs || 0),coords:{latitude:frame.lat,longitude:frame.lon,accuracy:frame.accuracy ?? 5,heading:frame.heading ?? null,headingAccuracy:frame.headingAccuracy,speed:frame.speed ?? 0}};
        let evidence={state:'UNKNOWN',reason:'Signal unavailable'},arrival='none',reroute=false,maneuverIndex=null,direction=null;
        const admitted=frame.signal!==false && SG.validateNavigationGpsFix(position,now,lastTimestamp).accepted;
        let roadMatch=null,attributes=null,lane=null,hazardStatus='POSSIBLE',voice=null;
        if(roadIndex){
            roadMatch=RM.matchPosition(position,roadIndex,{now,previous:previousRoad,route_generation:1,vehicle:'car'});
            roadMatch=RM.bindRoute(roadMatch,route,[],roadIndex);roadMatch.context_available=true;
            if(!admitted){roadMatch={...roadMatch,evidence_status:'UNMATCHED',osm_way_id:null,graph_edge_id:null,attributes_allowed:false};previousRoad=null;}
            else if(roadMatch.evidence_status==='PROBABLE')previousRoad=roadMatch;else previousRoad=null;
            attributes=RM.attributes(roadMatch,scenario.road_context,'car',now);
            lane=LG.buildHybridLaneGuidance({apiData:attributes && attributes.lanes.straight,maneuver:'straight',distanceToManeuver:100});
            const hazard=(scenario.hazards||[])[0];
            if(hazard){hazardStatus=RM.hazardAssociation(roadMatch,hazard,now);voice=hazardStatus==='UNRELATED'?null:HA.buildHazardAnnouncementPlan({...hazard,road_match_status:hazardStatus},100,{now,cameraAlertType:'voice'}).spokenMessage;}
        }
        if(admitted) {
            lastTimestamp=position.timestamp;
            evidence=RM.shouldPauseNavigation(roadMatch) ? {state:RM.supportsDeviation(roadMatch,now)?'OFF_ROUTE':'UNKNOWN'} : RG.assessNavigationPosition(position,route,previous,now);
            if(['RELIABLE','REACQUIRING'].includes(evidence.state))previous=evidence;
            if(evidence.state==='RELIABLE') {
                joined=true;remaining=evidence.remainingM;along=evidence.alongM;
                arrival=RP.buildEvidenceNavigationArrivalTickPlan({positionEvidence:evidence,accuracy:frame.accuracy ?? 5,legRanges:scenario.legRanges || [],routeInProgress:true,speedMs:frame.speed || 0,arrivalZoneSince:0,now}).action;
                if (scenario.steps) {maneuverIndex=RP.resolveStepIndexFromSnapIndex(scenario.steps,evidence.snap.index);direction=TI.directionForManeuver(scenario.steps[maneuverIndex]);}
                deviation={};
            } else if(evidence.state==='OFF_ROUTE') {
                const snap=RG.snapToRoutePolylineForDeviation(frame.lat,frame.lon,route);
                const tick=RD.buildRouteDeviationTickPlan({autoRerouteEnabled:true,hasRoute:true,remainingToDest:remaining ?? 1000,
                    minDistance:snap.distance,accuracy:frame.accuracy ?? 5,routeJoinConfirmed:joined,
                    deviationStartTime:deviation.deviationStartTimeCheck,offRouteStreak:deviation.deviationOffRouteStreak,
                    lastRerouteTime:0,lastRerouteAttemptTime:0,now});
                deviation=tick.statePatch || deviation;
                if(tick.triggerReroute)reroute=RD.buildAutomaticRerouteTriggerPlan(now,{offline:frame.network===false,
                    destination:'53.53,-1.13',hasRouteContext:true,startLat:frame.lat,startLon:frame.lon}).action==='fetch';
            }
        }
        rows.push({roadMatch,attributes,lane,hazardStatus,voice,t:frame.t,state:evidence.state,reason:evidence.reason,remaining,along,arrival,reroute,maneuverIndex,direction});
    }
    return rows;
}
module.exports={replay};
