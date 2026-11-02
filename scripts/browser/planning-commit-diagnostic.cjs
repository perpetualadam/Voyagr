'use strict';
/** Manual laboratory observer; unsupported hooks are skipped, never policy gates. */
function install() {
    const key='__voyagrPlanningCommitProbe';
    if(Object.getOwnPropertyDescriptor(window,key))throw Error('Planning probe already attached');
    const modes=window.VoyagrJourneyModes,records=[],releases=[];
    let closed=false;
    const safely=(action,fallback)=>{try{return action();}catch(_){return fallback;}};
    const codes=[
        [/Map not ready/i,'map_not_ready'],[/Planned map did not mount/i,'map_mount_failed'],
        [/Planned marker did not mount/i,'marker_mount_failed'],[/Planning intent changed|cancelled/i,'intent_changed_or_cancelled'],
        [/unresolved critical checks/i,'previous_journey_critical_checks'],[/continuation could not be saved/i,'previous_continuation_save_failed'],
        [/assessment, geometry or maneuvers are incomplete/i,'candidate_revalidation_failed'],
        [/Planned context did not commit/i,'publish_verification_failed'],[/ownership|cleanup failed/i,'resource_ownership_cleanup_failed'],
        [/persistence|finalization/i,'persistence_or_finalization_failed'],[/progress changed/i,'journey_progress_changed']
    ];
    const code=value=>typeof value==='string'?(codes.find(([re])=>re.test(value))?.[1]||'other_or_unavailable'):'other_or_unavailable';
    const errorCode=error=>safely(()=>code(Object.getOwnPropertyDescriptor(error,'message')?.value),'other_or_unavailable');
    const kind=value=>value===true?'true':value===false?'false':value==null?'empty':typeof value==='object'?'object':'other';
    const warning=()=>safely(()=>code((document.getElementById('journeyModeStatus')?.textContent||'')+' '+(document.getElementById('status')?.textContent||'')),'other_or_unavailable');
    function method(object,name){
        return safely(()=>{
            if(!object||(typeof object!=='object'&&typeof object!=='function'))return null;
            const descriptor=Object.getOwnPropertyDescriptor(object,name);
            // An own shadow cannot preserve arbitrary inherited dispatch (including
            // saved method references). Leave inherited/accessor/locked slots alone.
            if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function'||
                descriptor.writable!==true||descriptor.configurable!==true)return null;
            return {descriptor,fn:descriptor.value};
        },null);
    }
    function patch(object,name,make){
        const found=method(object,name);if(!found)return null;
        let replacement,installed;
        const restore=()=>safely(()=>{
            const current=Object.getOwnPropertyDescriptor(object,name);
            // Preserve unrelated replacements and descriptor changes made during observation.
            if(!current||current.value!==replacement||current.writable!==installed.writable||
                current.enumerable!==installed.enumerable||current.configurable!==installed.configurable)return;
            Object.defineProperty(object,name,found.descriptor);
        });
        try{
            replacement=make(found.fn);
            installed={...found.descriptor,value:replacement};
            if(!Reflect.defineProperty(object,name,installed)){restore();return null;}
            return restore;
        }catch(_){if(installed)restore();return null;}
    }
    function observe(value,fulfilled,rejected){
        // A brand-checked native Promise observer does not read arbitrary then getters.
        return safely(()=>{Promise.prototype.then.call(value,v=>safely(()=>fulfilled(v)),()=>safely(rejected));return true;},false);
    }
    function add(row,operation,outcome,detail){
        safely(()=>{if(!closed&&row.events.length<96)row.events.push({ms:Math.round(performance.now()-row.started),operation,outcome,...(detail?{detail}:{})});});
    }
    function wrap(object,name,row,label,around){
        const release=patch(object,name,old=>function(){
            if(closed)return Reflect.apply(old,this,arguments);
            const record=(outcome,detail)=>add(row,label,outcome,detail);
            record('entered');let value;
            try{value=around?around(old,this,arguments,record):Reflect.apply(old,this,arguments);}
            catch(error){record('threw',errorCode(error));throw error;}
            if(!observe(value,v=>record('fulfilled',kind(v)),()=>record('rejected')))record('returned',kind(value));
            return value;
        });
        if(!release)add(row,label,'observation_unavailable');
        return release;
    }
    function stage(old,receiver,args,record){
        const actualMap=safely(()=>{
            const descriptor=Object.getOwnPropertyDescriptor(window,'map');
            if(descriptor&&!Object.hasOwn(descriptor,'value'))return null;
            return typeof map==='undefined'?null:map;
        },null);
        const release=patch(actualMap,'isStyleLoaded',oldReady=>function(){
            try{const value=Reflect.apply(oldReady,this,arguments);record('style_check_returned',value===true?'true':value===false?'false':'non_boolean');return value;}
            catch(error){record('style_check_threw');throw error;}
        });
        if(!release)record('style_observation_unavailable');
        // Setup/restore failures must never preempt or mask this original call.
        try{return Reflect.apply(old,receiver,args);}finally{if(release)release();}
    }
    const entry=(name,arg)=>safely(()=>{const found=method(modes,name);return found?Reflect.apply(found.fn,modes,arg)===true:null;},null);
    const releaseCommit=patch(modes,'commitPlanning',original=>function(){
        if(closed||records.length>=2)return Reflect.apply(original,this,arguments);
        const row={started:performance.now(),entry_intent_current:entry('intentCurrent',[arguments[0]]),entry_commit_pending:entry('isJourneyCommitPending',[]),outcome:'pending',warning_class:'not_observed',events:[]};
        records.push(row);
        const operations=arguments[2];
        for(const name of ['requestCurrent','stage','publish','verify','removePrevious','restore','cleanup','present']){
            const release=wrap(operations,name,row,name,name==='stage'?stage:null);if(release)releases.push(release);
        }
        const temporary=[];
        for(const [object,name,label] of safely(()=>[[window.VoyagrAvoidanceIntegrity,'prepareNavigationCandidate','candidate_revalidation'],[window.VoyagrJourneyPlan,'inspection','inspection']],[])){
            const release=wrap(object,name,row,label);if(release)temporary.push(release);
        }
        let result;
        try{result=Reflect.apply(original,this,arguments);}
        catch(error){row.outcome='threw';row.warning_class=errorCode(error);throw error;}
        finally{for(const release of temporary.reverse())release();}
        if(!observe(result,value=>{if(!closed){row.outcome=kind(value);row.warning_class=warning();}},()=>{if(!closed){row.outcome='rejected';row.warning_class=warning();}})){
            row.outcome=kind(result);row.warning_class=warning();
        }
        return result;
    });
    const api={
        report(){return {available:!!releaseCommit,attempts:records.map(({started,...row})=>row),limits:{map_check_is_actual_invocation_only:true,unsupported_hooks_are_skipped:true,inherited_methods_are_not_shadowed:true,private_persistence_callbacks_not_instrumented:true,warning_classes_are_diagnostic_evidence_not_authority:true}};},
        dispose(){closed=true;if(releaseCommit)releaseCommit();for(const release of releases.reverse())release();safely(()=>{if(window[key]===api)delete window[key];});}
    };
    try{Object.defineProperty(window,key,{value:api,writable:true,configurable:true});}
    catch(error){closed=true;if(releaseCommit)releaseCommit();throw error;}
}
async function attach(page){
    await page.evaluate(install);
    return {report:()=>page.evaluate(()=>window.__voyagrPlanningCommitProbe?.report()),dispose:()=>page.evaluate(()=>window.__voyagrPlanningCommitProbe?.dispose())};
}
module.exports={attach,install};
