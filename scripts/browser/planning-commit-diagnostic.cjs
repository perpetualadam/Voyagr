'use strict';
/** Manual, isolated-laboratory observer. Never loaded by the application. */
function install() {
    const key='__voyagrPlanningCommitProbe';
    if(window[key])throw Error('Planning probe already attached');
    const modes=window.VoyagrJourneyModes;
    if(!modes||typeof modes.commitPlanning!=='function')throw Error('Planning modules unavailable');
    const original=modes.commitPlanning,records=[],restores=[];
    let closed=false;
    const codes=[
        [/Map not ready/i,'map_not_ready'],[/Planned map did not mount/i,'map_mount_failed'],
        [/Planned marker did not mount/i,'marker_mount_failed'],[/Planning intent changed|cancelled/i,'intent_changed_or_cancelled'],
        [/unresolved critical checks/i,'previous_journey_critical_checks'],[/continuation could not be saved/i,'previous_continuation_save_failed'],
        [/assessment, geometry or maneuvers are incomplete/i,'candidate_revalidation_failed'],
        [/Planned context did not commit/i,'publish_verification_failed'],[/ownership|cleanup failed/i,'resource_ownership_cleanup_failed'],
        [/persistence|finalization/i,'persistence_or_finalization_failed'],[/progress changed/i,'journey_progress_changed']
    ];
    const code=value=>{const text=typeof value==='string'?value:'';return codes.find(([re])=>re.test(text))?.[1]||'other_or_unavailable';};
    const kind=value=>value===true?'true':value===false?'false':value==null?'empty':typeof value==='object'?'object':'other';
    function warning(){return code((document.getElementById('journeyModeStatus')?.textContent||'')+' '+(document.getElementById('status')?.textContent||''));}
    function wrap(object,name,row,label,around) {
        if(!object||typeof object[name]!=='function')return;
        const old=object[name];
        function traced(){
            if(closed)return old.apply(this,arguments);
            const add=(outcome,detail)=>{if(row.events.length<96)row.events.push({ms:Math.round(performance.now()-row.started),operation:label,outcome,...(detail?{detail}:{})});};
            add('entered');let value;
            try{value=around?around(old,this,arguments,add):old.apply(this,arguments);}
            catch(error){add('threw',code(error&&error.message));throw error;}
            if(value&&typeof value.then==='function')value.then(v=>{if(!closed)add('fulfilled',kind(v));},()=>{if(!closed)add('rejected');});
            else add('returned',kind(value));
            return value;
        }
        object[name]=traced;
        restores.push(()=>{if(object[name]===traced)object[name]=old;});
    }
    function stage(old,receiver,args,add){
        let actualMap=null;
        try{actualMap=typeof map==='undefined'?null:map;}catch(_){}
        const oldReady=actualMap&&actualMap.isStyleLoaded;
        let tracedReady;
        if(typeof oldReady==='function'){
            tracedReady=function(){
                try{const value=oldReady.apply(this,arguments);add('style_check_returned',value===true?'true':value===false?'false':'non_boolean');return value;}
                catch(error){add('style_check_threw');throw error;}
            };
            try{actualMap.isStyleLoaded=tracedReady;}catch(_){tracedReady=null;}
        }
        try{return old.apply(receiver,args);}
        finally{try{if(tracedReady&&actualMap.isStyleLoaded===tracedReady)actualMap.isStyleLoaded=oldReady;}catch(_){/* Never mask the original stage result. */}}
    }
    function tracedCommit(){
        if(closed||records.length>=2)return original.apply(this,arguments);
        const row={started:performance.now(),entry_intent_current:null,entry_commit_pending:null,outcome:'pending',warning_class:'not_observed',events:[]};
        try{row.entry_intent_current=modes.intentCurrent(arguments[0])===true;row.entry_commit_pending=modes.isJourneyCommitPending()===true;}catch(_){}
        records.push(row);
        const operations=arguments[2];
        for(const name of ['requestCurrent','stage','publish','verify','removePrevious','restore','cleanup','present'])wrap(operations,name,row,name,name==='stage'?stage:null);
        // These checks occur synchronously before the coordinator's first await.
        const temporaryStart=restores.length;
        wrap(window.VoyagrAvoidanceIntegrity,'prepareNavigationCandidate',row,'candidate_revalidation');
        wrap(window.VoyagrJourneyPlan,'inspection',row,'inspection');
        let result;
        try{result=original.apply(this,arguments);}
        catch(error){row.outcome='threw';row.warning_class=code(error&&error.message);throw error;}
        finally{for(const restore of restores.splice(temporaryStart).reverse())restore();}
        if(result&&typeof result.then==='function')result.then(value=>{if(!closed){row.outcome=kind(value);row.warning_class=warning();}},()=>{if(!closed){row.outcome='rejected';row.warning_class=warning();}});
        else{row.outcome=kind(result);row.warning_class=warning();}
        return result;
    }
    modes.commitPlanning=tracedCommit;
    window[key]={
        report(){return {attempts:records.map(({started,...row})=>row),limits:{map_check_is_actual_invocation_only:true,unobserved_map_binding_is_not_a_false_result:true,private_persistence_callbacks_not_instrumented:true,warning_classes_are_diagnostic_evidence_not_authority:true}};},
        dispose(){closed=true;if(modes.commitPlanning===tracedCommit)modes.commitPlanning=original;for(const restore of restores.reverse())restore();delete window[key];}
    };
}
async function attach(page){
    await page.evaluate(install);
    return {report:()=>page.evaluate(()=>window.__voyagrPlanningCommitProbe?.report()),dispose:()=>page.evaluate(()=>window.__voyagrPlanningCommitProbe?.dispose())};
}
module.exports={attach,install};
