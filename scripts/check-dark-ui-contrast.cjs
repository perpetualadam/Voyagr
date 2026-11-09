// Production Navigation markup/CSS, native MapLibre controls and theme controllers.
// Basemap styles are empty local fixtures; this does not establish live tile/route rendering.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const nav='<div id="navigationTab">'+read('templates/index.html').split('<div id="navigationTab">')[1].split('<!-- UNIFIED SETTINGS TAB')[0];
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
for(const [width,height] of [[320,640],[390,844],[844,390],[1280,800]])for(const owner of ['html','body','both','light']){
 const dark=owner!=='light',page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
 const shell=`<html class="${owner==='html'||owner==='both'?'dark-mode':''}"><head><meta charset="utf-8"><style>${read('static/vendor/maplibre-gl.css')}\n${read('static/css/voyagr.css')}\nhtml,body{height:auto;overflow:auto}#map{position:relative;width:100%;height:230px}main.bottom-sheet-content{max-width:640px;margin:auto;padding:12px;max-height:none;overflow:visible}</style></head><body class="${owner==='body'||owner==='both'?'dark-mode':''}"><div id="map"></div><main class="bottom-sheet-content">${nav}</main></body></html>`;
 await page.route('**/*',r=>r.request().url()==='https://dark-ui.invalid/'?r.fulfill({contentType:'text/html',body:shell}):r.abort());await page.goto('https://dark-ui.invalid/');
 for(const file of ['vendor/maplibre-gl.js','modules/ui/theme.js','modules/map/map-theme.js','app/dark-mode-orchestration.js','app/map-theme-orchestration.js','app/vehicle-routing-orchestration.js','modules/navigation/favorites.js','app/search-favorites-orchestration.js'])await page.addScriptTag({content:read('static/js/'+file.replace('vendor/maplibre-gl.js','../vendor/maplibre-gl.js'))});
 await page.evaluate(()=>{
  window.fixtureStyle=name=>({version:8,name,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':name==='dark'?'#141820':'#f0f0f0'}}]});
  window.testMap=new maplibregl.Map({container:'map',style:fixtureStyle('standard'),center:[0,0],zoom:4,attributionControl:false});
  testMap.addControl(new maplibregl.NavigationControl(),'top-left');testMap.addControl(new maplibregl.AttributionControl({compact:false,customAttribution:'Map data fixture'}),'bottom-right');
 });
 await page.waitForFunction(()=>testMap.isStyleLoaded());
 const check=await page.evaluate(()=>{
  const rgb=text=>(text.match(/[\d.]+/g)||[]).map(Number);
  const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const selectors=['.navigation-save-button','.navigation-route-controls .btn-calculate--primary','.navigation-route-controls .routing-mode-btn:not(.active)','.routing-mode-btn.active','.btn-voice','.btn-voice-secondary','.btn-clear'];
  return {root: getComputedStyle(document.body).backgroundColor,voice:getComputedStyle(document.querySelector('.btn-voice-secondary')).backgroundColor,controls:getComputedStyle(document.querySelector('.maplibregl-ctrl-group')).backgroundColor,canvasFilter:getComputedStyle(document.querySelector('canvas')).filter,canvasOpacity:getComputedStyle(document.querySelector('canvas')).opacity,
   ratios:selectors.map(sel=>{const el=document.querySelector(sel),s=getComputedStyle(el),text=rgb(s.color);let backgrounds=[rgb(s.backgroundColor)];if(s.backgroundImage!=='none')backgrounds=[...s.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(m=>rgb(m[0]));return [sel,Math.min(...backgrounds.map(b=>contrast(text,b[3]<1?b.slice(0,3).map((c,i)=>c*b[3]+[20,24,32][i]*(1-b[3])):b)))];})};
 });
 const startOrder=await page.evaluate(()=>{
  const gps=document.getElementById('autoGpsToggle'),mode=document.getElementById('routingAuto'),calculate=document.querySelector('.btn-calculate');
  const box=gps.closest('.form-group').getBoundingClientRect(),modeBox=mode.getBoundingClientRect();
  return {beforeMode:!!(gps.compareDocumentPosition(mode)&Node.DOCUMENT_POSITION_FOLLOWING),beforeCalculate:!!(gps.compareDocumentPosition(calculate)&Node.DOCUMENT_POSITION_FOLLOWING),visuallyBefore:box.bottom<=modeBox.top,handler:gps.getAttribute('onchange'),label:document.querySelector('label[for="autoGpsToggle"]').textContent,count:document.querySelectorAll('#autoGpsToggle').length};
 });
 assert.deepEqual(startOrder,{beforeMode:true,beforeCalculate:true,visuallyBefore:true,handler:'toggleAutoGpsLocation()',label:'Use current GPS as start',count:1});
 assert.equal(check.canvasFilter,'none');assert.equal(check.canvasOpacity,'1');
 if(dark){assert.equal(check.voice,'rgba(40, 44, 62, 0.9)');assert.equal(check.controls,'rgb(32, 38, 50)');for(const [sel,ratio] of check.ratios)assert(ratio>=4.5,`${owner} ${sel}: contrast ${ratio}`);}
 else {assert.equal(check.voice,'rgba(255, 255, 255, 0.85)');for(const [sel,ratio] of check.ratios.filter(([sel])=>sel.startsWith('.navigation-route-controls')||sel==='.navigation-save-button'))assert(ratio>=4.5,`${sel}: contrast ${ratio}`);}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow');
 const zoom=page.getByRole('button',{name:'Zoom in',exact:true});await zoom.focus();if(dark)assert.equal(await zoom.evaluate(n=>getComputedStyle(n).outlineStyle),'solid');const oldZoom=await page.evaluate(()=>testMap.getZoom());await page.keyboard.press('Enter');await page.waitForFunction(old=>testMap.getZoom()>old,oldZoom);
 if(width===390&&owner==='html'){await page.locator('#autoGpsToggle').locator('xpath=..').screenshot({path:'/tmp/voyagr-gps-start-order.png'});await page.locator('.voice-section').screenshot({path:'/tmp/voyagr-dark-ui-voice.png'});}
 // Exercise production mode handlers with native keyboard buttons and persisted state.
 await page.evaluate(()=>{
  window.routingEffects={saved:0,calculated:0};
  VoyagrVehicleRoutingOrchestration.bind({setCurrentUserMarkerIcon:()=>{},call:{saveAllSettings:()=>routingEffects.saved++,showStatus:()=>{}}});
  window.setRoutingMode=mode=>VoyagrVehicleRoutingOrchestration.setRoutingMode(mode);
  window.calculateRoute=()=>routingEffects.calculated++;
 });
 for(const [name,value,id] of [['Walk','pedestrian','routingPedestrian'],['Bike','bicycle','routingBicycle'],['Auto','auto','routingAuto']]){
  const button=page.getByRole('button',{name,exact:true});await button.focus();assert.equal(await button.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(()=>({stored:localStorage.getItem('routingMode'),selected:[...document.querySelectorAll('.navigation-route-controls [aria-pressed="true"]')].map(n=>n.id),active:[...document.querySelectorAll('.navigation-route-controls .active')].map(n=>n.id)})),{stored:value,selected:[id],active:[id]});
  const box=await button.boundingBox();assert(box.width>=44&&box.height>=44,'Mode hit target too small');
 }
 const calculate=page.getByRole('button',{name:'Calculate route',exact:true});await calculate.focus();await page.keyboard.press('Space');
 assert.deepEqual(await page.evaluate(()=>routingEffects),{saved:3,calculated:1});
 assert.equal(await calculate.evaluate(el=>el.getBoundingClientRect().width<el.parentElement.getBoundingClientRect().width),true,'Calculate action still spans the panel');
 if(width===390&&(owner==='html'||owner==='light'))await page.locator('.navigation-route-controls').screenshot({path:`/tmp/voyagr-routing-${owner}.png`});
 const clear=page.getByRole('button',{name:'Clear All',exact:true});
 await page.evaluate(()=>{window.clearInvocations=0;window.clearForm=()=>clearInvocations++;});
 await clear.focus();assert.equal(await clear.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>clearInvocations),1);
 const clearBox=await clear.boundingBox();assert(clearBox.width>=44&&clearBox.height>=44);assert.equal(await clear.evaluate(el=>el.getBoundingClientRect().width<el.parentElement.getBoundingClientRect().width),true,'Clear All still spans the panel');
 if(width===390&&owner==='html')await clear.screenshot({path:'/tmp/voyagr-clear-all.png'});
 // Production favourites owner with only identity, position and transport boundaries.
 await page.evaluate(()=>{
  window.savedRequests=[];window.savedStatuses=[];window.favoriteRefreshes=0;
  window.promptAnswers=['Example place','location'];window.prompt=()=>promptAnswers.shift()??null;
  window.fetch=(url,options)=>{savedRequests.push({url,options});return Promise.resolve({json:async()=>({success:true})});};
  document.getElementById('end').value='Example address';
  VoyagrSearchFavoritesOrchestration.bind({favorites:()=>VoyagrFavorites,getCurrentLat:()=>53.38,getCurrentLon:()=>-1.47,call:{getSupabaseAccessToken:async()=> 'fixture-token',showStatus:(...args)=>savedStatuses.push(args),escapeHtml:s=>s,fetchJsonWithAuth:async()=>{favoriteRefreshes++;return {res:{status:200},data:{success:true,favorites:[{id:1,name:'Example place',address:'Example address',lat:53.38,lon:-1.47,category:'location'}]}};}}});
  window.addCurrentToFavorites=()=>VoyagrSearchFavoritesOrchestration.addCurrentToFavorites();
 });
 const save=page.getByRole('button',{name:'Save Location',exact:true});await save.focus();assert.equal(await save.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.getElementById('favoritesGrid').textContent.includes('Example place'));
 assert.deepEqual(await page.evaluate(()=>({count:savedRequests.length,url:savedRequests[0].url,method:savedRequests[0].options.method,auth:savedRequests[0].options.headers.Authorization,body:JSON.parse(savedRequests[0].options.body),refreshes:favoriteRefreshes})),{count:1,url:'/api/favorites',method:'POST',auth:'Bearer fixture-token',body:{name:'Example place',address:'Example address',lat:53.38,lon:-1.47,category:'location'},refreshes:1});
 await page.evaluate(()=>{promptAnswers=[null];});await save.focus();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>savedRequests.length),1,'Cancelled prompt submitted a favourite');
 const saveBox=await save.boundingBox();assert(saveBox.width>=44&&saveBox.height>=44);assert.equal(await save.evaluate(el=>el.getBoundingClientRect().width<el.parentElement.getBoundingClientRect().width),true,'Save Location still spans the panel');
 if(width===390&&owner==='html')await save.screenshot({path:'/tmp/voyagr-save-location.png'});
 // Confirm existing default pairing with real controllers and map style replacement.
 await page.evaluate(()=>{
  localStorage.removeItem('linkUiMapTheme');window.fetch=()=>Promise.resolve({ok:true});
  window.XMLHttpRequest=class{open(_method,url){this.url=url;}send(){this.status=200;this.responseText=JSON.stringify(fixtureStyle(this.url.includes('/dark/')?'dark':'standard'));}};
  VoyagrMapThemeOrchestration.bind({mapTheme:()=>VoyagrMapTheme,getMap:()=>testMap,getBuildings3DEnabled:()=>false,call:{initializeRoadLabels:()=>{},showStatus:()=>{},saveAllSettings:()=>{},setTheme:theme=>VoyagrDarkModeOrchestration.setTheme(theme)}});
  VoyagrDarkModeOrchestration.bind({theme:()=>VoyagrTheme,call:{getCurrentMapTheme:()=>VoyagrMapThemeOrchestration.getCurrentMapTheme(),setMapTheme:theme=>VoyagrMapThemeOrchestration.setMapTheme(theme),saveAllSettings:()=>{},showStatus:()=>{}}});
  VoyagrDarkModeOrchestration.setTheme('dark');
 });
 await page.waitForFunction(()=>testMap.isStyleLoaded()&&testMap.getStyle().name==='dark');
 if(width===390&&owner==='html')await page.locator('#map').screenshot({path:'/tmp/voyagr-dark-ui-map-controls.png'});
 assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('ui_theme'),localStorage.getItem('mapTheme'),document.documentElement.classList.contains('dark-mode'),document.body.classList.contains('dark-mode')]),['dark','dark',true,true]);
 await page.evaluate(()=>{VoyagrMapThemeOrchestration.setMapTheme('standard');});await page.waitForFunction(()=>testMap.isStyleLoaded()&&testMap.getStyle().name==='standard');assert.equal(await page.evaluate(()=>localStorage.getItem('ui_theme')),'light');
 await page.evaluate(()=>testMap.remove());console.log(`${width}x${height} ${owner}: Navigation contrast, native map controls and linked themes passed`);await page.close();
}
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1);});
