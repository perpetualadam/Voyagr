// Production fallback/error/idle hooks, theme/preview owners and real MapLibre.
// Raster pixels are generated locally: light background + dark label/road shapes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),parser=require('@babel/parser');
const {chromium}=require('@playwright/test');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),core=read('static/js/voyagr-core.js');
const nodes=parser.parse(core).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='initializeMap').body.body;
const hooks=nodes.filter(n=>n.type==='FunctionDeclaration'&&['voyagrMapRasterFallbackUrl','maybeFallbackToRasterStyle'].includes(n.id.name)||n.type==='VariableDeclaration'&&n.declarations.some(d=>['_mapErrorCount','_MAX_LOGGED_ERRORS','previewRecoveryMap'].includes(d.id.name))||n.type==='ExpressionStatement'&&(core.slice(n.start,n.end).startsWith("map.on('error'")||core.slice(n.start,n.end).includes('owner.restorePreviewAfterStyleLoad(previewRecoveryMap)'))).map(n=>core.slice(n.start,n.end)).join('\n');
const styles=Object.fromEntries(['osm-raster','osm-raster-dark','satellite'].map(name=>{const style=JSON.parse(read(`static/map/styles/${name}/style.json`));Object.values(style.sources).forEach(s=>{if(s.type==='raster')s.tiles=['https://dark-fallback.invalid/tile.png'];});return [name,style];}));
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
for(const initialTheme of ['standard','dark']){
 const page=await browser.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});let tile;
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:`<style>${read('static/vendor/maplibre-gl.css')}body{margin:0}#map{width:512px;height:512px}</style><div id="map"></div>`});
  if(url.pathname==='/tile.png')return route.fulfill({contentType:'image/png',body:tile});
  const name=url.pathname.split('/').at(-2);if(styles[name])return route.fulfill({json:styles[name]});
  return route.abort();
 });
 await page.goto('https://dark-fallback.invalid/');
 tile=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,256,256);g.fillStyle='black';g.fillRect(32,32,80,24);g.font='bold 18px sans-serif';g.fillText('ROAD',32,92);g.fillStyle='#888';g.fillRect(0,180,256,12);return c.toDataURL('image/png').split(',')[1];}),'base64');
 for(const file of ['static/vendor/maplibre-gl.js','static/js/maplibre-helpers.js','static/js/modules/map/map-theme.js','static/js/modules/navigation/route-selection.js','static/js/app/map-theme-orchestration.js','static/js/app/route-comparison-orchestration.js'])await page.addScriptTag({content:read(file)});
 await page.addScriptTag({content:'window.bindFallbackHooks=function(map){const toAbsoluteOriginUrl=url=>new URL(url,location.origin).href;const getMapRenderDiagnostics=()=>({});'+hooks+'};'});
 await page.evaluate(({initialTheme,styles})=>{
  localStorage.setItem('mapTheme',initialTheme);window.styleFixtures=styles;
  window.map=new maplibregl.Map({container:'map',center:[0,0],zoom:0,preserveDrawingBuffer:true,style:{version:8,name:'vector-fixture',sources:{},layers:[{id:'background',type:'background',paint:{'background-color':initialTheme==='dark'?'#141820':'#eee'}}]}});
  window.statuses=[];window.showStatus=(...args)=>statuses.push(args);window.fitCalls=0;
  window.VoyagrNavigationLifecycleOrchestration={getRouteInProgress:()=>false,getNavigationStarting:()=>false,getNavigationFailure:()=>null};
  const C=VoyagrRouteComparisonOrchestration,H=MapLibreHelpers;
  C.bind({routeSelection:()=>VoyagrRouteSelection,getMap:()=>map,getMapLibreHelpers:()=>({...H,fitMapBounds:()=>{fitCalls++;}}),getRouteLayer:()=>null,setRouteLayer:()=>{throw Error('Unexpected guidance mutation');},getShowTrafficEnabled:()=>false,getTrafficLayer:()=>null,call:{showStatus:()=>{},clearHazardMarkers:()=>{},ensureLabelsOnTop:()=>{},getTrafficSettingsSnapshot:()=>({routeTrafficEnabled:false})}});
  window.bindFallbackHooks(map);
  window.XMLHttpRequest=class{open(_method,url){this.url=url;}send(){const name=new URL(this.url,location.origin).pathname.split('/').at(-2);this.status=200;this.responseText=JSON.stringify(styleFixtures[name]);}};
  const nativeFetch=window.fetch.bind(window);window.fetch=(url,...args)=>String(url).includes('/api/app-settings')?Promise.resolve({ok:true}):nativeFetch(url,...args);
  VoyagrMapThemeOrchestration.bind({mapTheme:()=>VoyagrMapTheme,getMap:()=>map,getBuildings3DEnabled:()=>false,call:{initializeRoadLabels:()=>{},showStatus:()=>{},saveAllSettings:()=>{}}});
  window.sample=(x,y)=>{const c=map.getCanvas(),gl=c.getContext('webgl2')||c.getContext('webgl'),pixel=new Uint8Array(4);gl.readPixels(x,c.height-y-1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];};
 },{initialTheme,styles});
 await page.waitForFunction(()=>map.isStyleLoaded());
 await page.evaluate(()=>{
  const points=[[400,250],[400,390]].map(p=>{const geo=map.unproject(p);return [geo.lat,geo.lng];});
  window.route={name:'Preview',polyline:points};VoyagrRouteComparisonOrchestration.setRouteOptions([route]);VoyagrRouteComparisonOrchestration.setSelectedRouteIndex(0);VoyagrRouteComparisonOrchestration.displaySingleRoute(0);
  const geo=map.unproject([400,440]);window.marker=MapLibreHelpers.createMarker(geo.lat,geo.lng,{html:'<div style="width:20px;height:20px;background:rgb(255,0,0);border-radius:50%"></div>',iconSize:[20,20],iconAnchor:[10,10],popup:'Camera fixture'}).addTo(map);
  window.before={route:JSON.stringify(route),camera:[map.getCenter().lng,map.getCenter().lat,map.getZoom()],fit:fitCalls};
  map.fire('error',{error:new Error('Failed to load glyph fixture')});
 });
 for(const theme of [initialTheme,'dark','standard','satellite','dark']){
  await page.evaluate(theme=>VoyagrMapThemeOrchestration.setMapTheme(theme),theme);
  const expected=theme==='dark'?styles['osm-raster-dark'].name:theme==='standard'?styles['osm-raster'].name:styles.satellite.name;
  await page.waitForFunction(expected=>map.isStyleLoaded()&&map.areTilesLoaded()&&map.getStyle().name===expected&&VoyagrRouteComparisonOrchestration.getAllRouteLayers().every(h=>map.getLayer(h.id)),expected);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const state=await page.evaluate(()=>({bg:sample(8,8),label:[sample(64,40),sample(128,80)],line:sample(400,320),route:JSON.stringify(route),camera:[map.getCenter().lng,map.getCenter().lat,map.getZoom()],fit:fitCalls,before,marker:marker.getElement().isConnected,markerColor:getComputedStyle(marker.getElement().firstChild).backgroundColor,canvasFilter:getComputedStyle(map.getCanvas()).filter,stored:localStorage.getItem('mapTheme')}));
  assert.equal(state.route,state.before.route);assert.deepEqual(state.camera,state.before.camera);assert.equal(state.fit,state.before.fit);assert.equal(state.marker,true);assert.equal(state.markerColor,'rgb(255, 0, 0)');assert.equal(state.canvasFilter,'none');assert.equal(state.stored,theme);
  const brightness=p=>(p[0]+p[1]+p[2])/3;
  if(theme==='dark'){assert(brightness(state.bg)<50,'Dark fallback background is light');assert(Math.max(...state.label.map(brightness))>180,'Dark fallback labels did not invert to light');assert(state.line[2]>200&&state.line[1]>100&&state.line[0]<130,'Route colour was filtered/inverted');await page.screenshot({path:'/tmp/voyagr-dark-raster-fallback.png'});}
  if(theme==='standard'){assert(brightness(state.bg)>200);assert(Math.min(...state.label.map(brightness))<50);}
  console.log(`${initialTheme} failure -> ${theme}: correct raster/theme, label pixels, route colour, marker and camera preserved`);
 }
 await page.evaluate(()=>marker.getElement().click());await page.waitForFunction(()=>!!document.querySelector('.maplibregl-popup-content'));assert.equal(await page.locator('.maplibregl-popup-content').evaluate(el=>[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('')),'Camera fixture');
 assert.equal(await page.evaluate(()=>statuses.length),1,'Fallback retried more than once');
 await page.evaluate(()=>map.remove());await page.close();
}
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1);});
