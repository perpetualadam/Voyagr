// Shared descriptor/receiver assertions. Browser runner supplies actual MapLibre;
// Jest uses a class double for ECMAScript property semantics only.
const CASES=['inherited','own','global_accessor','method_accessor','readonly_locked','readonly_configurable','nonconfig_writable','nonextensible','proxy_descriptor','proxy_define','proxy_transparent','stage_throw','stage_promise','stage_false','repeat','replacement','frozen_operations','then_accessor','frozen_modes'];
async function exerciseCase({name,source}) {
    const check=(condition,message)=>{if(!condition)throw Error(name+': '+message);};
    const same=(a,b)=>a===undefined||b===undefined?a===b:['value','writable','get','set','enumerable','configurable'].every(k=>a[k]===b[k]);
    const previousMap=Object.getOwnPropertyDescriptor(window,'map'),previousModes=Object.getOwnPropertyDescriptor(window,'VoyagrJourneyModes');
    const MapClass=window.maplibregl?.Map||class MapDouble{isStyleLoaded(){return this.style.loaded();}};
    const backing=Object.create(MapClass.prototype);backing.style={loaded:()=>name!=='stage_false'};
    let observed=backing,reads=0,calls=0,receiver=true,argsPreserved=true,expectedAfter;
    const secret='PRIVATE_COORDINATE_TOKEN_SENTINEL',sentinel=Error(secret),marker={coordinates:[53.3806626,-1.4702278],token:secret};
    const stageArgs=[marker,17],promise=Promise.resolve(marker),thenable={};
    Object.defineProperty(thenable,'then',{get(){reads++;throw sentinel;}});
    if(name==='own')Object.defineProperty(backing,'isStyleLoaded',{value:MapClass.prototype.isStyleLoaded,writable:true,enumerable:false,configurable:true});
    if(['readonly_locked','readonly_configurable','nonconfig_writable'].includes(name))Object.defineProperty(backing,'isStyleLoaded',{value:MapClass.prototype.isStyleLoaded,writable:name==='nonconfig_writable',enumerable:false,configurable:name==='readonly_configurable'});
    if(name==='method_accessor')Object.defineProperty(backing,'isStyleLoaded',{get(){reads++;throw sentinel;},enumerable:false,configurable:true});
    if(name==='nonextensible')Object.preventExtensions(backing);
    if(name==='proxy_descriptor')observed=new Proxy(backing,{getOwnPropertyDescriptor(){throw sentinel;}});
    if(name==='proxy_define')observed=new Proxy(backing,{defineProperty(){throw sentinel;}});
    if(name==='proxy_transparent')observed=new Proxy(backing,{});
    const before=Object.getOwnPropertyDescriptor(backing,'isStyleLoaded');
    Object.defineProperty(window,'map',{value:observed,writable:true,configurable:true});
    if(name==='global_accessor')Object.defineProperty(window,'map',{get(){reads++;throw sentinel;},configurable:true});
    const operations={stage:function(){
        calls++;receiver=receiver&&this===operations;argsPreserved=argsPreserved&&arguments.length===2&&arguments[0]===marker&&arguments[1]===17;
        if(name==='stage_throw')throw sentinel;
        if(name==='stage_promise')return promise;
        if(name==='then_accessor')return thenable;
        if(['global_accessor','method_accessor'].includes(name))return 42;
        const value=observed.isStyleLoaded();
        if(name==='replacement'){
            const replacement=function(){return false;};Object.defineProperty(backing,'isStyleLoaded',{value:replacement,writable:true,enumerable:false,configurable:true});expectedAfter=Object.getOwnPropertyDescriptor(backing,'isStyleLoaded');
        }
        return value;
    }};
    if(name==='frozen_operations')Object.freeze(operations);
    const beforeStage=Object.getOwnPropertyDescriptor(operations,'stage');
    const original=function(_token,_candidate,ops){return Reflect.apply(ops.stage,ops,stageArgs);};
    const modes={intentCurrent:()=>true,isJourneyCommitPending:()=>false,commitPlanning:original};
    if(name==='frozen_modes')Object.freeze(modes);
    Object.defineProperty(window,'VoyagrJourneyModes',{value:modes,writable:true,configurable:true});
    let report=null,rootReplacement=null;
    try{
        const rounds=name==='repeat'?3:1;
        for(let round=0;round<rounds;round++){
            let attachError=null;try{window.eval('('+source+')()');}catch(error){attachError=error;}
            check(!attachError,'observation setup preempted the original call');
            let result,thrown=null;try{result=modes.commitPlanning(0,marker,operations);}catch(error){thrown=error;}
            check(name==='stage_throw'?thrown===sentinel:thrown===null,'exception identity changed');
            if(name==='stage_promise'){check(result===promise,'Promise identity changed');await result;}
            else if(name==='then_accessor')check(result===thenable,'plain-object identity changed');
            else if(name!=='stage_throw')check(result===(['global_accessor','method_accessor'].includes(name)?42:name!=='stage_false'),'result changed');
            check(calls===round+1&&receiver&&argsPreserved,'original execution/receiver/arguments changed');
            const api=window.__voyagrPlanningCommitProbe;
            if(api){
                report=api.report();if(name==='frozen_modes')check(report.available===false,'unsupported root hook was not reported unavailable');const text=JSON.stringify(report);check(!text.includes(secret)&&!text.includes('53.3806626'),'private data exported');check(report.attempts.length<=2&&report.attempts.every(r=>r.events.length<=96),'unbounded report');
                if(name==='replacement'){rootReplacement=function(){return 'replacement';};modes.commitPlanning=rootReplacement;operations.stage=rootReplacement;}
                api.dispose();
            }
            check(modes.commitPlanning===(rootReplacement||original),'root method not restored/replacement overwritten');
            check(name==='replacement'?operations.stage===rootReplacement:same(Object.getOwnPropertyDescriptor(operations,'stage'),beforeStage),'stage descriptor not restored');
            check(same(Object.getOwnPropertyDescriptor(backing,'isStyleLoaded'),expectedAfter||before),'map descriptor/inheritance changed');
        }
        check(reads===0,'unsupported accessor/then getter invoked');
        const unavailable=['global_accessor','method_accessor','readonly_locked','readonly_configurable','nonconfig_writable','nonextensible','proxy_descriptor','proxy_define','frozen_operations','frozen_modes'];
        const events=report?.attempts.flatMap(r=>r.events)||[];
        check(!unavailable.includes(name)||!events.some(e=>e.outcome==='style_check_returned'),'fabricated readiness');
        return {name,passed:true,original_stage_calls:calls,descriptor_preserved:true,private_output_excluded:true};
    }finally{
        window.__voyagrPlanningCommitProbe?.dispose();
        if(previousMap)Object.defineProperty(window,'map',previousMap);else delete window.map;
        if(previousModes)Object.defineProperty(window,'VoyagrJourneyModes',previousModes);else delete window.VoyagrJourneyModes;
    }
}
module.exports={CASES,exerciseCase};
