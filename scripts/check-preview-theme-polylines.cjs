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
 await page.route('**/*',r=>r.request().url()==='https://preview-style.invalid/'?r.fulfill({contentType:'text/html',body:`<style>${read('static/vendor/maplibre-gl.css')}body{margin:0}#map{width:100vw;height:100vh}</style><div id="map"></div>`}):r.request().url().endsWith('/tile.png')?r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')}):r.abort());
 await page.goto('https://preview-style.invalid/');
 for(const file of ['static/vendor/maplibre-gl.js','static/js/maplibre-helpers.js','static/js/modules/navigation/route-selection.js','static/js/modules/map/map-theme.js','static/js/app/route-comparison-orchestration.js','static/js/app/map-theme-orchestration.js'])await page.addScriptTag({content:read(file)});
 await page.addScriptTag({content:'window.bindCorePreviewRecovery=function(map){'+binding+'};'});
 await page.evaluate(()=>{
  window.styleFor=theme=>({version:8,name:theme,glyphs:'https://preview-style.invalid/fonts/{fontstack}/{range}.pbf',sources:{labels:{type:'geojson',data:{type:'FeatureCollection',features:[]}},...(theme==='satellite'?{imagery:{type:'raster',tiles:['https://preview-style.invalid/tile.png'],tileSize:256}}:{})},layers:[{id:'background',type:'background',paint:{'background-color':theme==='standard'?'#dce4e8':'#141e2b'}},...(theme==='satellite'?[{id:'imagery',type:'raster',source:'imagery','paint':{'raster-opacity':.2}}]:[]),{id:'road-label',type:'symbol',source:'labels',layout:{'text-field':['get','name']}}]});
  window.map=new maplibregl.Map({container:'map',style:styleFor('standard'),center:[-1,53],zoom:12});
  window.VoyagrNavigationLifecycleOrchestration={getRouteInProgress:()=>false,getNavigationStarting:()=>false,getNavigationFailure:()=>null};
  window.requests=[];window.fetch=(...args)=>{requests.push(args);return Promise.resolve({ok:true});};window.fitCalls=0;
  const H=MapLibreHelpers,C=VoyagrRouteComparisonOrchestration;
  C.bind({routeSelection:()=>VoyagrRouteSelection,getMap:()=>map,getMapLibreHelpers:()=>({...H,fitMapBounds:(...args)=>{fitCalls++;return H.fitMapBounds(...args);}}),getRouteLayer:()=>null,setRouteLayer:()=>{throw Error('Unexpected guidance mutation');},getShowTrafficEnabled:()=>false,getTrafficLayer:()=>null,setRoutePolyline:()=>{throw Error('Unexpected progress mutation');},call:{showStatus:()=>{},decodePolyline:()=>[],displayAllRouteHazards:()=>{},ensureLabelsOnTop:()=>{},clearHazardMarkers:()=>{},getTrafficSettingsSnapshot:()=>({routeTrafficEnabled:false})}});
  window.routes=[{name:'Route A',polyline:[[53,-1.01],[53.005,-1],[53.01,-.995]]},{name:'Route B',polyline:[[53,-1.01],[53.002,-.995],[53.01,-.995]]}];C.setRouteOptions(routes);C.setSelectedRouteIndex(0);
  window.XMLHttpRequest=class{open(_method,url){this.url=url;}send(){this.status=200;this.responseText=JSON.stringify(styleFor(this.url.includes('/dark/')?'dark':this.url.includes('/satellite/')?'satellite':'standard'));}};
  VoyagrMapThemeOrchestration.bind({mapTheme:()=>VoyagrMapTheme,getMap:()=>map,getBuildings3DEnabled:()=>false,call:{initializeRoadLabels:()=>{},showStatus:()=>{},saveAllSettings:()=>{}}});bindCorePreviewRecovery(map);
 });
 await page.waitForFunction(()=>map.isStyleLoaded());
 for(const mode of ['all','single']){
  await page.evaluate(mode=>{const C=VoyagrRouteComparisonOrchestration;if(mode==='all'){C.setSelectedRouteIndex(0);C.displayAllRoutesOnMap();}else{C.setSelectedRouteIndex(1);C.displaySingleRoute(1);}},mode);
  await page.waitForFunction(()=>map.isStyleLoaded()&&!map.isMoving());
  const before=await page.evaluate(()=>({routes:JSON.stringify(routes),selected:VoyagrRouteComparisonOrchestration.getSelectedRouteIndex(),camera:[map.getCenter().lng,map.getCenter().lat,map.getZoom(),map.getBearing(),map.getPitch()],fit:fitCalls}));
  for(const theme of ['dark','satellite','standard']){
   const removed=await page.evaluate(theme=>{VoyagrMapThemeOrchestration.setMapTheme(theme);return VoyagrRouteComparisonOrchestration.getAllRouteLayers().every(h=>!map.getLayer(h.id));},theme);assert(removed,'Style replacement must reproduce layer removal');
   await page.waitForFunction(()=>map.isStyleLoaded()&&VoyagrRouteComparisonOrchestration.getAllRouteLayers().length>0&&VoyagrRouteComparisonOrchestration.getAllRouteLayers().every(h=>map.getLayer(h.id)&&map.getSource(h.sourceId||h.id)));
   await page.waitForFunction(()=>!map.isMoving()&&map.queryRenderedFeatures({layers:VoyagrRouteComparisonOrchestration.getAllRouteLayers().map(h=>h.id)}).length>0);
   const restored=await page.evaluate(()=>({count:VoyagrRouteComparisonOrchestration.getAllRouteLayers().length,routes:JSON.stringify(routes),selected:VoyagrRouteComparisonOrchestration.getSelectedRouteIndex(),camera:[map.getCenter().lng,map.getCenter().lat,map.getZoom(),map.getBearing(),map.getPitch()],fit:fitCalls,coords:VoyagrRouteComparisonOrchestration.getAllRouteLayers().map(h=>map.getSource(h.sourceId||h.id)._data.geometry.coordinates),visible:map.queryRenderedFeatures({layers:VoyagrRouteComparisonOrchestration.getAllRouteLayers().map(h=>h.id)}).length}));
   assert.equal(restored.count,mode==='all'?2:1);assert.equal(restored.routes,before.routes);assert.equal(restored.selected,before.selected);assert.deepEqual(restored.camera,before.camera);assert.equal(restored.fit,before.fit);assert(restored.visible>0,'No rendered route features');
   if(mode==='single')assert.deepEqual(restored.coords[0],JSON.parse(before.routes)[1].polyline.map(([lat,lon])=>[lon,lat]));
   if(width===390)await page.screenshot({path:`/tmp/voyagr-${mode}-${theme}-restored.png`});
   console.log(`${width}x${height} ${mode} ${theme}: visible polylines, selection, geometry and camera preserved`);
  }
 }
 await page.evaluate(()=>{VoyagrMapThemeOrchestration.setMapTheme('dark');VoyagrMapThemeOrchestration.setMapTheme('satellite');VoyagrMapThemeOrchestration.setMapTheme('dark');});
 await page.waitForFunction(()=>map.isStyleLoaded()&&VoyagrRouteComparisonOrchestration.getAllRouteLayers().length===1&&VoyagrRouteComparisonOrchestration.getAllRouteLayers().every(h=>map.getLayer(h.id)));
 await page.evaluate(()=>{VoyagrMapThemeOrchestration.setMapTheme('satellite');VoyagrRouteComparisonOrchestration.clearComparisonRouteLayers();});await page.waitForFunction(()=>map.isStyleLoaded());
 assert.equal(await page.evaluate(()=>VoyagrRouteComparisonOrchestration.getAllRouteLayers().length),0);
 assert.equal(await page.evaluate(()=>map.getStyle().layers.some(l=>l.id.startsWith('route-layer-')||l.id.startsWith('polyline-'))),false);
 await page.evaluate(()=>map.remove());await page.close();
}
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1);});
