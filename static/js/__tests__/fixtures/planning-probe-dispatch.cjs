// A/B controls assert execution-time dispatch, not just post-disposal descriptors.
const DISPATCH_CASES=['prototype_replacement','prototype_accessor','prototype_throwing_accessor','prototype_nonfunction','prototype_saved_reference','prototype_chain_replacement','prototype_promise','own_prototype_replacement'];
async function exerciseDispatch({name,source,enabled}){
    const check=(condition,message)=>{if(!condition)throw Error(name+': '+message);};
    const same=(a,b)=>a===undefined||b===undefined?a===b:['value','writable','get','set','enumerable','configurable'].every(k=>a[k]===b[k]);
    const previousMap=Object.getOwnPropertyDescriptor(window,'map'),previousModes=Object.getOwnPropertyDescriptor(window,'VoyagrJourneyModes');
    const MapClass=window.maplibregl?.Map||class MapDouble{isStyleLoaded(){return this.style.loaded();}};
    const parent=Object.create(MapClass.prototype),object=Object.create(parent);object.style={loaded:()=>true};
    if(name==='own_prototype_replacement')Object.defineProperty(object,'isStyleLoaded',{value:MapClass.prototype.isStyleLoaded,writable:true,enumerable:false,configurable:true});
    const beforeOwn=Object.getOwnPropertyDescriptor(object,'isStyleLoaded');
    Object.defineProperty(window,'map',{value:object,writable:true,configurable:true});
    const sentinel=Error('PRIVATE_DISPATCH_ERROR'),marker={private:'PRIVATE_DISPATCH_ARGUMENT'},promise=Promise.resolve(false);
    let first,second,savedValue=null,reads=0,calls=0,capturedError=null,expectedParent=parent,expectedDescriptor;
    const operations={stage:function(arg){
        calls++;check(this===operations&&arg===marker,'receiver or argument changed');
        try{
            first=object.isStyleLoaded();const saved=object.isStyleLoaded;
            const descriptor={configurable:true,enumerable:false};
            if(name==='prototype_accessor'||name==='prototype_throwing_accessor')descriptor.get=function(){reads++;if(name==='prototype_throwing_accessor')throw sentinel;return ()=>false;};
            else Object.assign(descriptor,{value:name==='prototype_nonfunction'?17:name==='prototype_promise'?()=>promise:()=>false,writable:true});
            if(name==='prototype_chain_replacement'){expectedParent=Object.create(MapClass.prototype);Object.setPrototypeOf(object,expectedParent);}
            Object.defineProperty(expectedParent,'isStyleLoaded',descriptor);expectedDescriptor=Object.getOwnPropertyDescriptor(expectedParent,'isStyleLoaded');
            second=object.isStyleLoaded();
            if(name==='prototype_saved_reference')savedValue=Reflect.apply(saved,object,[]);
            return second;
        }catch(error){capturedError=error;throw error;}
    }};
    const originalStage=operations.stage;
    const core=function(_token,_candidate,ops){return Reflect.apply(ops.stage,ops,[marker]);};
    const modes={intentCurrent:()=>true,isJourneyCommitPending:()=>false,commitPlanning:core};
    Object.defineProperty(window,'VoyagrJourneyModes',{value:modes,writable:true,configurable:true});
    try{
        if(enabled)window.eval('('+source+')()');
        let value,thrown=null;try{value=modes.commitPlanning(0,marker,operations);}catch(error){thrown=error;}
        if(name==='prototype_throwing_accessor')check(thrown===sentinel&&capturedError===sentinel,'original accessor exception changed');
        else if(name==='prototype_nonfunction')check(thrown instanceof TypeError&&thrown===capturedError,'non-callable replacement exception changed');
        else{
            check(thrown===null,'unexpected staging exception');
            if(name==='prototype_promise'){check(value===promise,'replacement Promise identity changed');check(await value===false,'replacement Promise settlement changed');}
            else check(value===(name==='own_prototype_replacement'),'dynamic stage return changed');
        }
        check(calls===1&&first===true,'original stage execution changed');
        check(reads===(name==='prototype_accessor'||name==='prototype_throwing_accessor'?1:0),'accessor dispatch count changed');
        if(name==='prototype_saved_reference')check(savedValue===true&&second===false,'saved-reference semantics changed');
        const report=window.__voyagrPlanningCommitProbe?.report();
        if(report){const json=JSON.stringify(report);check(!json.includes('PRIVATE_DISPATCH'),'private value exported');if(name!=='own_prototype_replacement')check(!report.attempts.some(r=>r.events.some(e=>e.outcome==='style_check_returned')),'inherited readiness fabricated');else check(report.attempts.flatMap(r=>r.events).filter(e=>e.outcome==='style_check_returned'&&e.detail==='true').length===2,'safe own-data observations missing');}
        window.__voyagrPlanningCommitProbe?.dispose();
        check(same(Object.getOwnPropertyDescriptor(object,'isStyleLoaded'),beforeOwn),'original ownership/descriptor not retained');
        check(Object.getPrototypeOf(object)===expectedParent&&same(Object.getOwnPropertyDescriptor(expectedParent,'isStyleLoaded'),expectedDescriptor),'third-party prototype change overwritten');
        check(modes.commitPlanning===core&&operations.stage===originalStage,'root dispatch changed');
        return {name,enabled,passed:true,stage_calls:calls,first,second:name==='prototype_promise'?'original_promise':thrown?'original_exception':second,saved_value:savedValue,accessor_reads:reads,descriptor_preserved:true};
    }finally{
        window.__voyagrPlanningCommitProbe?.dispose();
        if(previousMap)Object.defineProperty(window,'map',previousMap);else delete window.map;
        if(previousModes)Object.defineProperty(window,'VoyagrJourneyModes',previousModes);else delete window.VoyagrJourneyModes;
    }
}
module.exports={DISPATCH_CASES,exerciseDispatch};
