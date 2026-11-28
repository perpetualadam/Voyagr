/* Explicit loopback-only test connector. Never discovers or boots the UK runtime. */
(function(root){
'use strict';
const connected=new WeakSet();
function connect({hostWindow,previewWindow}){
    let sourceOrigin,targetOrigin;
    try{sourceOrigin=new URL(hostWindow.location.origin);targetOrigin=new URL(previewWindow.location.origin);}catch(_){throw Error('Isolated host origin unavailable.');}
    if(!['http:','https:'].includes(sourceOrigin.protocol)||!['127.0.0.1','localhost','[::1]'].includes(sourceOrigin.hostname)||sourceOrigin.origin!==targetOrigin.origin)throw Error('Same-origin loopback host required.');
    if(connected.has(previewWindow))throw Error('Host already connected.');
    const sources={owner:hostWindow.VoyagrLocalData,modes:hostWindow.VoyagrJourneyModes,lifecycle:hostWindow.VoyagrNavigationLifecycleOrchestration,gps:hostWindow.VoyagrGpsOrchestration};
    const names={owner:'VoyagrLocalData',modes:'VoyagrJourneyModes',lifecycle:'VoyagrNavigationLifecycleOrchestration',gps:'VoyagrGpsOrchestration'};
    const intact=()=>Object.entries(names).every(([key,name])=>hostWindow[name]===sources[key]);
    const session=previewWindow.VoyagrGH11SavedSession,bridge=previewWindow.VoyagrGH11JourneyBridge,factory=previewWindow.VoyagrGH11HostJourney;
    if(sources.modes?.PROTOCOL!==1||sources.lifecycle?.DURABLE_OWNERSHIP_PROTOCOL!==1||typeof sources.lifecycle.endpointIntentReady!=='function'||sources.lifecycle.endpointIntentReady()!==true||!session||typeof session.bindOwnerCoordinator!=='function'||typeof session.close!=='function'||typeof bridge?.bind!=='function'||typeof factory?.create!=='function'||previewWindow.document?.getElementById('calculate')?.disabled!==false)throw Error('Host/preview contracts not ready.');
    if(typeof sources.owner?.capture!=='function'||typeof sources.owner.current!=='function')throw Error('Host owner unavailable.');
    const owner={capture(){if(!intact())throw Error('Host modules changed.');return sources.owner.capture();},current(token){return intact()&&sources.owner.current(token)===true;}};
    let adapter=null,binding=null,closed=false;
    function close(){if(closed)return;closed=true;try{binding?.close();}finally{try{adapter?.close();}finally{session.close();}}}
    // A failed or closed connection cannot silently resume an unbound preview.
    connected.add(previewWindow);
    try{
        adapter=factory.create({...sources,owner,eventTarget:hostWindow,onChange:()=>binding?.refresh()});
        const token=session.bindOwnerCoordinator(owner,hostWindow);
        if(!session.current(token))throw Error('Host owner unconfirmed.');
        binding=bridge.bind({...adapter,validator:previewWindow.VoyagrSpeedGps});
    }catch(error){close();throw error;}
    return {navigation_allowed:false,scope:'isolated_loopback_uk_host',refresh(){if(closed)throw Error('Host connection closed.');adapter.refresh();},close};
}
const api={connect};root.VoyagrGH11UKHostBoot=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
