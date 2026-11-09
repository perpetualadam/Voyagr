// Real MapLibre, preview/renderer/theme owners and the production core idle binding.
// Basemap tiles and inactive lifecycle flags are fixtures; verified navigation is covered in Jest.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),parser=require('@babel/parser');
const {chromium}=require('@playwright/test');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),core=read('static/js/voyagr-core.js');
const init=parser.parse(core).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='initializeMap');
const binding=init.body.body.filter(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='previewRecoveryMap')||n.type==='ExpressionStatement'&&core.slice(n.start,n.end).includes('owner.restorePreviewAfterStyleLoad(previewRecoveryMap)')).map(n=>core.slice(n.start,n.end)).join('\n');
assert(binding.includes("map.on('idle'"),'Production preview recovery binding missing');
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
for(const [width,height] of [[390,844],[1280,800]]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
 await page.route('**/*',r=>r.request().url()==='https://preview-style.invalid/'?r.fulfill({contentType:'text/html',body:`<style>${read('static/css/voyagr.css')}${read('static/vendor/maplibre-gl.css')}body{margin:0}#map{width:100vw;height:100vh}</style><div id="map"></div>`}):r.request().url().includes('.png')?r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')}):r.abort());
 await page.goto('https://preview-style.invalid/');
 for(const file of ['static/vendor/maplibre-gl.js','static/js/maplibre-helpers.js','static/js/modules/navigation/route-selection.js','static/js/modules/map/map-theme.js','static/js/app/route-comparison-orchestration.js','static/js/app/map-theme-orchestration.js','static/js/modules/navigation/route-traffic-flow.js','static/js/app/traffic-orchestration.js','static/js/modules/map/map-overlay-toggles.js','static/js/modules/ui/toggle-ui.js','static/js/modules/map/camera-map-markers.js','static/js/modules/map/hazard-map-markers.js','static/js/modules/map/osm-map-icons.js','static/js/app/map-overlay-orchestration.js','static/js/app/hazard-map-orchestration.js','static/js/modules/map/map-layer-toggles.js','static/js/modules/map/weather-layer.js','static/js/modules/map/map-recovery.js','static/js/app/map-layers-orchestration.js'])await page.addScriptTag({content:read(file)});
 await page.addScriptTag({content:'window.bindCorePreviewRecovery=function(map){'+binding+'};'});
 await page.evaluate(()=>{
  window.styleFor=theme=>({version:8,name:theme,glyphs:'https://preview-style.invalid/fonts/{fontstack}/{range}.pbf',sources:{labels:{type:'geojson',data:{type:'FeatureCollection',features:[]}},...(theme==='satellite'?{imagery:{type:'raster',tiles:['https://preview-style.invalid/tile.png'],tileSize:256}}:{})},layers:[{id:'background',type:'background',paint:{'background-color':theme==='standard'?'#dce4e8':'#141e2b'}},...(theme==='satellite'?[{id:'imagery',type:'raster',source:'imagery','paint':{'raster-opacity':.2}}]:[]),{id:'road-label',type:'symbol',source:'labels',layout:{'text-field':['get','name']}}]});
  window.map=new maplibregl.Map({container:'map',style:styleFor('standard'),center:[-1,53],zoom:12});
  window.VoyagrNavigationLifecycleOrchestration={getRouteInProgress:()=>false,getNavigationStarting:()=>false,getNavigationFailure:()=>null};
  window.requests=[];const nativeFetch=window.fetch.bind(window);window.fetch=(...args)=>{const url=String(args[0]);if(url.includes('.png'))return nativeFetch(...args);requests.push(args);return Promise.resolve({ok:true,status:200,json:async()=>({success:true,cameras:[{lat:53.004,lon:-1.006,type:'speed'},{lat:53.006,lon:-1.004,type:'red_light'},{lat:53.008,lon:-1.002,type:'average_speed'}],traffic_lights:[{lat:53.005,lon:-1.005}],railway_crossings:[{lat:53.007,lon:-1.003}]})});};window.fitCalls=0;
  const H=MapLibreHelpers,C=VoyagrRouteComparisonOrchestration;
  C.bind({routeSelection:()=>VoyagrRouteSelection,getMap:()=>map,getMapLibreHelpers:()=>({...H,fitMapBounds:(...args)=>{fitCalls++;return H.fitMapBounds(...args);}}),getRouteLayer:()=>null,setRouteLayer:()=>{throw Error('Unexpected guidance mutation');},getShowTrafficEnabled:()=>false,getTrafficLayer:()=>null,setRoutePolyline:()=>{throw Error('Unexpected progress mutation');},call:{showStatus:()=>{},decodePolyline:()=>[],displayAllRouteHazards:()=>{},ensureLabelsOnTop:()=>{},clearHazardMarkers:()=>{},getTrafficSettingsSnapshot:()=>({routeTrafficEnabled:false})}});
  window.routes=[{name:'Route A',polyline:[[53,-1.01],[53.005,-1],[53.01,-.995]]},{name:'Route B',polyline:[[53,-1.01],[53.002,-.995],[53.01,-.995]]}];C.setRouteOptions(routes);C.setSelectedRouteIndex(0);
  window.XMLHttpRequest=class{open(_method,url){this.url=url;}send(){this.status=200;this.responseText=JSON.stringify(styleFor(this.url.includes('/dark/')?'dark':this.url.includes('/satellite/')?'satellite':'standard'));}};
  VoyagrTrafficOrchestration.bind({getMap:()=>map,getRoutePolyline:()=>routes[C.getSelectedRouteIndex()].polyline,routeTrafficFlow:()=>VoyagrRouteTrafficFlow,routeSelection:()=>VoyagrRouteSelection,getMapLibreHelpers:()=>H,getRouteLayer:()=>null,getAllRouteLayers:()=>C.getAllRouteLayers(),applyMapLayerReorderFromPlan:plan=>{for(const id of plan.layerIds||[])if(map.getLayer(id))map.moveLayer(id,plan.beforeId);}});
  VoyagrMapOverlayOrchestration.bind({getMap:()=>map,mapOverlayToggles:()=>VoyagrMapOverlayToggles,toggleUI:()=>VoyagrToggleUI,hazardMapMarkers:()=>VoyagrHazardMapMarkers,cameraMapMarkers:()=>VoyagrCameraMapMarkers,osmMapIcons:()=>VoyagrOsmMapIcons,getMapLibreHelpers:()=>H,call:{saveAllSettings:()=>{}}});
  window.VOYAGR_TOMTOM_TRAFFIC_PROXY=true;window.OPENWEATHERMAP_API_KEY='fixture';
  VoyagrMapLayersOrchestration.bind({getMap:()=>map,mapLayerToggles:()=>VoyagrMapLayerToggles,weatherLayer:()=>VoyagrWeatherLayer,toggleUI:()=>VoyagrToggleUI,routeSelection:()=>VoyagrRouteSelection,getMapLibreHelpers:()=>H,call:{bringRoutesToTop:()=>C.bringRoutesToTop(),scheduleMapRepaintAfterUiChange:()=>{},showStatus:()=>{},saveAllSettings:()=>{}}});
  VoyagrMapLayersOrchestration.setShowWeatherEnabled(true);
  map.on('style.load',()=>window.dispatchEvent(new Event('voyagr-vector-style-ready')));
  VoyagrHazardMapOrchestration.bind({getMap:()=>map,getMapLibreHelpers:()=>H,osmMapIcons:()=>VoyagrOsmMapIcons,hazardMapMarkers:()=>VoyagrHazardMapMarkers,call:{getOsmTrafficLightMarkerPillHTML:()=>VoyagrMapOverlayOrchestration.getOsmTrafficLightMarkerPillHTML()}});
  VoyagrMapThemeOrchestration.bind({mapTheme:()=>VoyagrMapTheme,getMap:()=>map,getBuildings3DEnabled:()=>false,call:{initializeRoadLabels:()=>{},showStatus:()=>{},saveAllSettings:()=>{}}});bindCorePreviewRecovery(map);
 });
 await page.waitForFunction(()=>map.isStyleLoaded());
 for(const mode of ['all','single']){
  await page.evaluate(mode=>{const C=VoyagrRouteComparisonOrchestration;if(mode==='all'){C.setSelectedRouteIndex(0);C.displayAllRoutesOnMap();}else{C.setSelectedRouteIndex(1);C.displaySingleRoute(1);}},mode);
  await page.waitForFunction(()=>map.isStyleLoaded()&&!map.isMoving());
  await page.evaluate(()=>{const T=VoyagrTrafficOrchestration;T.displayRouteTrafficEdges([{start:routes[VoyagrRouteComparisonOrchestration.getSelectedRouteIndex()].polyline[0],end:routes[VoyagrRouteComparisonOrchestration.getSelectedRouteIndex()].polyline[2],traffic_level:'red'}]);if(!window.overlaysInitialized){VoyagrMapOverlayOrchestration.initializeCameraLayer();window.overlaysInitialized=true;}VoyagrHazardMapOrchestration.displayHazardMarkers([{lat:53.009,lon:-1,type:'roadworks'}]);});
  await page.waitForFunction(()=>cameraMarkers.length===3&&osmTrafficLightMarkers.length===1&&osmRailwayCrossingMarkers.length===1);
    const before=await page.evaluate(()=>({routes:JSON.stringify(routes),selected:VoyagrRouteComparisonOrchestration.getSelectedRouteIndex(),camera:[map.getCenter().lng,map.getCenter().lat,map.getZoom(),map.getBearing(),map.getPitch()],fit:fitCalls}));
  for(const theme of ['dark','satellite','standard']){
   const removed=await page.evaluate(theme=>{VoyagrMapThemeOrchestration.setMapTheme(theme);return VoyagrRouteComparisonOrchestration.getAllRouteLayers().every(h=>!map.getLayer(h.id));},theme);assert(removed,'Style replacement must reproduce layer removal');
   await page.waitForFunction(()=>map.isStyleLoaded()&&VoyagrRouteComparisonOrchestration.getAllRouteLayers().length>0&&VoyagrRouteComparisonOrchestration.getAllRouteLayers().every(h=>map.getLayer(h.id)&&map.getSource(h.sourceId||h.id)));
   await page.waitForFunction(()=>!map.isMoving()&&map.queryRenderedFeatures({layers:VoyagrRouteComparisonOrchestration.getAllRouteLayers().map(h=>h.id)}).length>0);
   const restored=await page.evaluate(()=>({count:VoyagrRouteComparisonOrchestration.getAllRouteLayers().length,routes:JSON.stringify(routes),selected:VoyagrRouteComparisonOrchestration.getSelectedRouteIndex(),camera:[map.getCenter().lng,map.getCenter().lat,map.getZoom(),map.getBearing(),map.getPitch()],fit:fitCalls,coords:VoyagrRouteComparisonOrchestration.getAllRouteLayers().map(h=>map.getSource(h.sourceId||h.id)._data.geometry.coordinates),visible:map.queryRenderedFeatures({layers:VoyagrRouteComparisonOrchestration.getAllRouteLayers().map(h=>h.id)}).length}));
   assert.equal(restored.count,mode==='all'?2:1);assert.equal(restored.routes,before.routes);assert.equal(restored.selected,before.selected);assert.deepEqual(restored.camera,before.camera);assert.equal(restored.fit,before.fit);assert(restored.visible>0,'No rendered route features');
   if(mode==='single')assert.deepEqual(restored.coords[0],JSON.parse(before.routes)[1].polyline.map(([lat,lon])=>[lon,lat]));
   await page.waitForFunction(()=>map.getStyle().layers.some(l=>l.type==='line'&&l.paint['line-color']==='#FF0000'));
   assert.deepEqual(await page.evaluate(()=>[cameraMarkers.length,osmTrafficLightMarkers.length,osmRailwayCrossingMarkers.length,hazardMarkers.length]),[3,1,1,1]);
   for(const property of ['cameraMarkers','osmTrafficLightMarkers','osmRailwayCrossingMarkers','hazardMarkers']){
    const result=await page.evaluate(property=>window[property].every(m=>m.getElement().isConnected&&m.getElement().querySelector('svg,div')&&m.getPopup()),property);assert(result,property+' lost marker/icon/popup');
    for(let index=0;index<await page.evaluate(property=>window[property].length,property);index++){
    await page.evaluate(({property,index})=>window[property][index].getElement().click(),{property,index});
    await page.waitForFunction(()=>!!document.querySelector('.maplibregl-popup-content'));
    assert((await page.locator('.maplibregl-popup-content').innerText()).trim().length>0,'Empty marker popup');
    await page.evaluate(({property,index})=>window[property][index].togglePopup(),{property,index});
    }
   }
   assert.equal(await page.evaluate(()=>!!map.getLayer('traffic-layer')&&!!map.getLayer('weather-layer')),true,'Traffic/weather raster overlays missing: '+JSON.stringify(await page.evaluate(()=>({layers:map.getStyle().layers.map(l=>l.id),weather:VoyagrMapLayersOrchestration.getShowWeatherEnabled(),traffic:VoyagrMapLayersOrchestration.getShowTrafficEnabled()}))));
   await page.evaluate(()=>{const O=VoyagrMapOverlayOrchestration;O.toggleShowCameras();O.toggleShowOsmTrafficLights();O.toggleShowOsmRailwayCrossings();});
   assert.equal(await page.evaluate(()=>cameraMarkers.length+osmTrafficLightMarkers.length+osmRailwayCrossingMarkers.length),0,'Disabled overlay markers remain');
   await page.evaluate(()=>{const O=VoyagrMapOverlayOrchestration;O.toggleShowCameras();O.toggleShowOsmTrafficLights();O.toggleShowOsmRailwayCrossings();});
   await page.waitForFunction(()=>cameraMarkers.length===3&&osmTrafficLightMarkers.length===1&&osmRailwayCrossingMarkers.length===1);
   assert.equal(await page.evaluate(()=>map.queryRenderedFeatures({layers:map.getStyle().layers.filter(l=>l.type==='line'&&l.paint['line-color']==='#FF0000').map(l=>l.id)}).length>0),true,'Traffic edges not rendered');
      if(width===390)await page.screenshot({path:`/tmp/voyagr-${mode}-${theme}-restored.png`});
   console.log(`${width}x${height} ${mode} ${theme}: visible polylines/traffic edges and marker popups; selection, geometry and camera preserved`);
  }
 }
 await page.evaluate(()=>{VoyagrTrafficOrchestration.clearRouteTrafficLayers();VoyagrMapThemeOrchestration.setMapTheme('dark');VoyagrMapThemeOrchestration.setMapTheme('satellite');VoyagrMapThemeOrchestration.setMapTheme('dark');});
 await page.waitForFunction(()=>map.isStyleLoaded()&&VoyagrRouteComparisonOrchestration.getAllRouteLayers().length===1&&VoyagrRouteComparisonOrchestration.getAllRouteLayers().every(h=>map.getLayer(h.id)));
 await page.evaluate(()=>{VoyagrMapThemeOrchestration.setMapTheme('satellite');VoyagrRouteComparisonOrchestration.clearComparisonRouteLayers();});await page.waitForFunction(()=>map.isStyleLoaded());
 assert.equal(await page.evaluate(()=>VoyagrRouteComparisonOrchestration.getAllRouteLayers().length),0);
 assert.equal(await page.evaluate(()=>map.getStyle().layers.some(l=>l.id.startsWith('route-layer-')||l.id.startsWith('polyline-'))),false);
 await page.evaluate(()=>map.remove());await page.close();
}
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1);});
