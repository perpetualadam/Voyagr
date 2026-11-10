// Production decision plans with synthetic clocks; no GPS, network or persistence.
const RD=require('../static/js/modules/navigation/reroute-decision');
const AI=require('../static/js/modules/navigation/avoidance-integrity');
const base=1000000;
function initial(extra={}){return {autoRerouteEnabled:true,hasRoute:true,remainingToDest:5000,accuracy:5,minDistance:200,routeJoinConfirmed:true,deviationStartTime:null,offRouteStreak:0,lastRerouteTime:0,lastRerouteAttemptTime:0,rerouteInProgress:false,postRerouteGraceUntil:0,...extra};}
function apply(state,tick){const applied=RD.buildRouteDeviationStateApplyPlan(RD.buildRouteDeviationApplyPlan(tick,{}));if(applied.action!=='apply')return;const p=applied.statePatch;state.routeJoinConfirmed=p.routeJoinConfirmedForDeviation;state.deviationStartTime=p.deviationStartTimeCheck;state.offRouteStreak=p.deviationOffRouteStreak;if(p.postRerouteGraceUntil===0)state.postRerouteGraceUntil=0;}
function replay(interval,extra={}){
 const state=initial(extra),suppressed=[];
 for(let elapsed=0;elapsed<=120000;elapsed+=interval){const tick=RD.buildRouteDeviationTickPlan({...state,now:base+elapsed});apply(state,tick);if(tick.action==='grace-suppressed')suppressed.push(elapsed/1000);if(tick.triggerReroute)return {first_trigger_seconds:elapsed/1000,grace_suppressed_at_seconds:suppressed};}
 return {first_trigger_seconds:null,grace_suppressed_at_seconds:suppressed};
}
const gap=initial();for(const elapsed of [0,1000,2000]){const tick=RD.buildRouteDeviationTickPlan({...gap,now:base+elapsed});apply(gap,tick);}
const uncertain=RD.buildRouteDeviationTickPlan({...gap,accuracy:100,now:base+20000});apply(gap,uncertain);
const restored=RD.buildRouteDeviationTickPlan({...gap,now:base+21000});
const retries=RD.REROUTE_FAILURE_RETRY_DELAYS_MS.map((delay,i)=>{const plan=RD.buildRerouteFailureRetryPlan({routeInProgress:true,autoRerouteOnDeviationEnabled:true,rerouteInProgress:false,postRerouteGraceUntil:0,rerouteFailureRetryCount:i,now:base});return {delay_ms:delay,trigger:RD.buildAutomaticRerouteTriggerPlan(base+delay,{rerouteInProgress:false,lastRerouteAttemptTime:base,postRerouteGraceUntil:0,offline:false,destination:'53.01,-1',hasRouteContext:true,startLat:53,startLon:-1}).action,scheduled:plan.schedule};});
(async()=>{
 // Capture the real timeout value, accelerating just this timer so the probe
 // does not block for 35 seconds. Restore the native scheduler immediately.
 const native=global.setTimeout;let timeoutMs=null;const ticket=AI.begin({getItem:()=>null});let options;
 try{global.setTimeout=(callback,delay)=>{timeoutMs=delay;return native(callback,0);};options=AI.fetchOptions(ticket);}finally{global.setTimeout=native;}
 await new Promise(resolve=>native(resolve,5));const aborted=options.signal.aborted;AI.finish(ticket);
 console.log(JSON.stringify({thresholds_m:[5,20,65].map(accuracy=>({accuracy,threshold:RD.effectiveDeviationThreshold(accuracy)})),first_deviation:{one_hz:replay(1000),five_second_updates:replay(5000)},after_success:replay(1000,{lastRerouteTime:base,lastRerouteAttemptTime:base,postRerouteGraceUntil:base+RD.POST_REROUTE_GRACE_MS}),uncertainty_gap:{untrusted_action:uncertain.action,saved_streak:gap.offRouteStreak,saved_start_ms:gap.deviationStartTime,first_restored_action:restored.action},retry_plans:retries,fetch_timeout:{milliseconds:timeoutMs,signal_aborted:aborted},near_destination:RD.buildRouteDeviationTickPlan({...initial(),remainingToDest:90,now:base}).action,initial_far_from_route:RD.buildRouteDeviationTickPlan({...initial(),routeJoinConfirmed:false,now:base}).action},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
