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
 for(const file of ['vendor/maplibre-gl.js','modules/ui/theme.js','modules/map/map-theme.js','app/dark-mode-orchestration.js','app/map-theme-orchestration.js'])await page.addScriptTag({content:read('static/js/'+file.replace('vendor/maplibre-gl.js','../vendor/maplibre-gl.js'))});
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
  const selectors=['.routing-mode-btn.active','.btn-voice','.btn-voice-secondary','.btn-clear'];
  return {root: getComputedStyle(document.body).backgroundColor,voice:getComputedStyle(document.querySelector('.btn-voice-secondary')).backgroundColor,controls:getComputedStyle(document.querySelector('.maplibregl-ctrl-group')).backgroundColor,canvasFilter:getComputedStyle(document.querySelector('canvas')).filter,canvasOpacity:getComputedStyle(document.querySelector('canvas')).opacity,
   ratios:selectors.map(sel=>{const el=document.querySelector(sel),s=getComputedStyle(el),text=rgb(s.color);let backgrounds=[rgb(s.backgroundColor)];if(s.backgroundImage!=='none')backgrounds=[...s.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(m=>rgb(m[0]));return [sel,Math.min(...backgrounds.map(b=>contrast(text,b[3]<1?b.slice(0,3).map((c,i)=>c*b[3]+[20,24,32][i]*(1-b[3])):b)))];})};
 });
 assert.equal(check.canvasFilter,'none');assert.equal(check.canvasOpacity,'1');
 if(dark){assert.equal(check.voice,'rgba(40, 44, 62, 0.9)');assert.equal(check.controls,'rgb(32, 38, 50)');for(const [sel,ratio] of check.ratios)assert(ratio>=4.5,`${owner} ${sel}: contrast ${ratio}`);}
 else {assert.equal(check.voice,'rgba(255, 255, 255, 0.85)');}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow');
 const zoom=page.getByRole('button',{name:'Zoom in',exact:true});await zoom.focus();if(dark)assert.equal(await zoom.evaluate(n=>getComputedStyle(n).outlineStyle),'solid');const oldZoom=await page.evaluate(()=>testMap.getZoom());await page.keyboard.press('Enter');await page.waitForFunction(old=>testMap.getZoom()>old,oldZoom);
 if(width===390&&owner==='html'){await page.locator('.voice-section').screenshot({path:'/tmp/voyagr-dark-ui-voice.png'});}
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
