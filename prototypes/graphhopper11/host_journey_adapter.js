/* Explicit read-only host bindings. Does not import or start the UK runtime. */
(function(root){
'use strict';
function create({owner,modes,lifecycle,gps,eventTarget=root,onChange=()=>{}}){
    for(const [service,methods] of [[owner,['capture','current']],[modes,['captureIntent','intentCurrent','onIntentCancelled','getState','isSimulating','isJourneyCommitPending','isAbandoning']],[lifecycle,['getRouteInProgress','getRoutePolyline','getNavigationStarting','getNavigationFailure']],[gps,['getAcceptedOriginFix','onAcceptedOriginFix']]]){
        if(!service||methods.some(name=>typeof service[name]!=='function'))throw Error('Host journey contract unavailable.');
    }
    if(typeof eventTarget.addEventListener!=='function'||typeof eventTarget.removeEventListener!=='function'||typeof onChange!=='function')throw Error('Host notifications unavailable.');
    let closed=false,generation=0,last=null,lineIdentity=null,intent=null,unsubscribe=null;
    function invalidate(){if(closed)return;generation++;last=null;onChange();}
    const events=['voyagr:journey-state-change','voyagr-local-owner-change'];
    for(const name of events)eventTarget.addEventListener(name,invalidate);
    let unsubscribeGps;
    try{
        unsubscribeGps=gps.onAcceptedOriginFix(invalidate);
        if(typeof unsubscribeGps!=='function')throw Error('Accepted-position subscription unavailable.');
    }catch(error){closed=true;for(const name of events)eventTarget.removeEventListener(name,invalidate);throw error;}
    function state(){
        if(closed)throw Error('Host journey closed.');
        const epoch=modes.captureIntent();
        if(!Number.isSafeInteger(epoch)||epoch<0||modes.intentCurrent(epoch)!==true)throw Error('Host intent unavailable.');
        if(epoch!==intent){if(typeof unsubscribe==='function')unsubscribe();intent=epoch;unsubscribe=modes.onIntentCancelled(epoch,invalidate);if(typeof unsubscribe!=='function')throw Error('Host intent subscription unavailable.');}
        if(modes.getState()!=='LIVE'||modes.isSimulating()!==false||modes.isJourneyCommitPending()!==false||modes.isAbandoning()!==false||lifecycle.getRouteInProgress()!==true||lifecycle.getNavigationStarting()!==false||lifecycle.getNavigationFailure()!=null)throw Error('Live host journey unavailable.');
        const who={...owner.capture()},line=lifecycle.getRoutePolyline();
        if(owner.current(who)!==true||!Array.isArray(line)||line.length<2||line.length>100000||line.some(point=>!Array.isArray(point)||point.length!==2||!Number.isFinite(point[0])||!Number.isFinite(point[1])||Math.abs(point[0])>90||Math.abs(point[1])>180))throw Error('Host route unavailable.');
        // Exact, transient geometry equality detects in-place mutations as well as replacement.
        const geometry=JSON.stringify(line),signature=JSON.stringify([who.owner,who.epoch,epoch,geometry]);
        if(last!==signature||lineIdentity!==line){generation++;last=signature;lineIdentity=line;}
        return {route_id:'host-route-'+generation,generation,active:true,simulating:false};
    }
    const journey={capture:state,current(token){try{const live=state();return !!token&&token.route_id===live.route_id&&token.generation===live.generation&&token.active===true&&token.simulating===false;}catch(_){return false;}}};
    return {
        owner,journey,
        gps:{getAcceptedOriginFix(){if(closed)throw Error('Host journey closed.');return gps.getAcceptedOriginFix();}},
        // Host calls this after accepted-position updates, geometry changes or uncertain transitions.
        refresh:invalidate,
        close(){if(closed)return;closed=true;generation++;last=null;lineIdentity=null;for(const name of events)eventTarget.removeEventListener(name,invalidate);unsubscribeGps();if(typeof unsubscribe==='function')unsubscribe();onChange();}
    };
}
const api={create};root.VoyagrGH11HostJourney=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
