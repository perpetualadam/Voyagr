// Synthetic replay harness. Delegates admission/matching/arrival/reroute to product modules.
const SG=require('../../static/js/modules/navigation/speed-gps.js');
const RG=require('../../static/js/modules/navigation/route-geometry.js');
const RP=require('../../static/js/modules/navigation/route-progress.js');
const RD=require('../../static/js/modules/navigation/reroute-decision.js');
const TI=require('../../static/js/modules/navigation/turn-instructions.js');
function replay(scenario,route,nowBase=1800000000000) {
    let previous=null,lastTimestamp=0,remaining=null,along=null,deviation={},joined=false;
    const rows=[];
    for(const frame of scenario.frames) {
        const now=nowBase+frame.t;
        const position={timestamp:now+(frame.timestampOffsetMs || 0),coords:{latitude:frame.lat,longitude:frame.lon,accuracy:frame.accuracy ?? 5,heading:frame.heading ?? null,speed:frame.speed ?? 0}};
        let evidence={state:'UNKNOWN',reason:'Signal unavailable'},arrival='none',reroute=false,maneuverIndex=null,direction=null;
        const admitted=frame.signal!==false && SG.validateNavigationGpsFix(position,now,lastTimestamp).accepted;
        if(admitted) {
            lastTimestamp=position.timestamp;
            evidence=RG.assessNavigationPosition(position,route,previous,now);
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
        rows.push({t:frame.t,state:evidence.state,reason:evidence.reason,remaining,along,arrival,reroute,maneuverIndex,direction});
    }
    return rows;
}
module.exports={replay};
