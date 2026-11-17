/** Optional whole-selected-route warning lookup; never grants navigation authority. */
(function(root){
 'use strict';
 function create(win){
  let current=null,epoch=0;
  const TYPES=['traffic_light','railway_crossing','cameras'];
  function mapped(type){return typeof type==='string'&&(type==='traffic_light'||type==='railway_crossing'||type==='camera'||type==='speed_camera'||type==='traffic_light_camera'||type.startsWith('camera_'));}
  function category(type){return type==='traffic_light'||type==='railway_crossing'?type:'cameras';}
  function shape(route){return {geometry:route.geometry||route.polyline,geometry_precision:route.geometry_precision||6};}
  function binding(route){return win.VoyagrAvoidanceIntegrity&&typeof win.VoyagrAvoidanceIntegrity.geometryBinding==='function'?win.VoyagrAvoidanceIntegrity.geometryBinding(shape(route)):null;}
  function paint(){const el=win.document.getElementById('routeHazardDataStatus');if(el&&win.VoyagrHazardAlerts&&typeof win.VoyagrHazardAlerts.describeWarningCoverage==='function')el.textContent=win.VoyagrHazardAlerts.describeWarningCoverage(win.lastCalculatedRoute);}
  function invalidate(){epoch++;if(current&&current.controller)current.controller.abort();current=null;}
  async function run(route,force){
   const nav=win.VoyagrNavigationLifecycleOrchestration;
   if(!route||win.navigator.onLine===false||win.VoyagrOfflineNavigationOrchestration&&win.VoyagrOfflineNavigationOrchestration.getIsOffline&&win.VoyagrOfflineNavigationOrchestration.getIsOffline()||nav&&nav.getNavigationStarting&&nav.getNavigationStarting()||
      win.VoyagrJourneyModes&&win.VoyagrJourneyModes.isSimulating())return false;
   if(current&&current.route===route){if(current.pending)return current.promise;if(!force&&Date.now()<current.next)return false;}
   const key=binding(route);if(!key)return false;
   const existing=route.warning_coverage;
   if(!force&&existing&&TYPES.every(kind=>existing[kind]&&existing[kind].geometry_binding===key&&existing[kind].route_scan==='ALL_SEGMENTS_QUERIED'&&existing[kind].status==='AVAILABLE'&&Number.isFinite(existing[kind].retrieved_at)&&Date.now()/1000-existing[kind].retrieved_at>=0&&Date.now()/1000-existing[kind].retrieved_at<240)){if(current&&current.route===route){current.next=Date.now()+30000;current.error=false;}return false;}
   invalidate();const generation=epoch;
   const record=current={route,pending:true,controller:new win.AbortController(),next:Date.now()+30000,error:false};
   paint();
   record.promise=(async()=>{
    const timer=win.setTimeout(()=>record.controller.abort(),11000);
    try{
     const response=await win.fetch('/api/route-warning-observations',{method:'POST',headers:{'Content-Type':'application/json'},
      credentials:'same-origin',cache:'no-store',signal:record.controller.signal,body:JSON.stringify(shape(route))});
     if(!response.ok)throw Error('Warning lookup unavailable');
     const data=await response.json();
     if(generation!==epoch||win.lastCalculatedRoute!==route||binding(route)!==key||nav&&nav.getNavigationStarting&&nav.getNavigationStarting())return false;
     if(!data||data.success!==true||data.geometry_binding!==key||!Array.isArray(data.hazards)||data.hazards.length>5000||
       !data.warning_coverage||!TYPES.every(kind=>data.warning_coverage[kind]&&data.warning_coverage[kind].geometry_binding===key&&data.warning_coverage[kind].query_scope==='SELECTED_ROUTE_CORRIDOR'&&['AVAILABLE','PARTIAL','STALE','UNKNOWN'].includes(data.warning_coverage[kind].status))||
       data.hazards.some(h=>!h||!mapped(h.type)||!Number.isFinite(h.lat)||!Number.isFinite(h.lon)||Math.abs(h.lat)>90||Math.abs(h.lon)>180))throw Error('Invalid warning response');
     const merged=new Map();
     const full=kind=>data.warning_coverage[kind].status==='AVAILABLE'&&data.warning_coverage[kind].route_scan==='ALL_SEGMENTS_QUERIED';
     const identity=h=>(h.type==='speed_camera'||h.type==='camera'?'camera_speed':h.type==='traffic_light_camera'?'camera_red_light':h.type)+':'+h.lat+':'+h.lon;
     for(const h of route.hazards||[])if(h&&(!mapped(h.type)||!full(category(h.type))))merged.set(identity(h),h);
     for(const h of data.hazards){const old=merged.get(identity(h));
      if(old&&Number.isFinite(old.observed_at_ms)&&(!Number.isFinite(h.observed_at_ms)||old.observed_at_ms>h.observed_at_ms))continue;
      merged.set(identity(h),Object.assign({},h,{route_corridor_observation:true}));
     }
     const rows=Array.from(merged.values());
     if(rows.length>5000){for(const kind of TYPES)Object.assign(data.warning_coverage[kind],{status:'PARTIAL',route_scan:'LIMITED',reason:'result_limit'});}
     route.hazards=rows.slice(0,5000);route.warning_coverage=data.warning_coverage;
     const comparison=win.VoyagrRouteComparisonOrchestration;
     if(comparison&&comparison.getRouteOptions&&comparison.getSelectedRouteIndex){
      const selected=(comparison.getRouteOptions()||[])[comparison.getSelectedRouteIndex()];
      if(selected&&binding(selected)===key){selected.hazards=route.hazards;selected.warning_coverage=route.warning_coverage;}
     }

     record.next=Date.now()+30000;
     if(typeof win.displayHazardMarkers==='function'){try{win.displayHazardMarkers(route.hazards);}catch(_){/* Warning dispatch remains independent of marker rendering. */}}
     if(nav&&nav.getRouteInProgress&&nav.getRouteInProgress()&&win.VoyagrOfflineNavigationOrchestration&&win.VoyagrOfflineNavigationOrchestration.schedulePersistRoute)win.VoyagrOfflineNavigationOrchestration.schedulePersistRoute();
     return true;
    }catch(_){if(generation===epoch)record.error=true;return false;}
    finally{win.clearTimeout(timer);record.pending=false;if(generation===epoch)paint();}
   })();
   return record.promise;
  }
  async function observe(route,force){try{return await run(route,force);}catch(_){return false;}}
  function online(){void observe(win.lastCalculatedRoute,true);}
  win.addEventListener('online',online);
  return {observe,refresh:route=>observe(route,true),invalidate,isPending:route=>!!(current&&current.route===route&&current.pending),
   isUnavailable:route=>!!(current&&current.route===route&&current.error),destroy(){invalidate();win.removeEventListener('online',online);}};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports=create;
 else root.VoyagrRouteWarnings=create(root);
})(typeof window!=='undefined'?window:globalThis);
