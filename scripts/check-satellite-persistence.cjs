// Exact production early-boot code and theme/settings helpers with real MapLibre.
// Theme restoration is exercised separately from other Settings side effects.
// Raster/styles and settings transport are local fixtures, not live imagery.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),template=read('templates/index.html');
const boot=template.match(/<script>\s*window\.VOYAGR_JOURNEY_PROTOCOL=1;([\s\S]*?)<\/script>/)[1];
const controls=template.slice(template.indexOf('<div class="theme-selector" id="mapThemeSelector">'),template.indexOf('<div class="preference-item">',template.indexOf('id="themeAuto"')));
async function mount(page){
 for(const file of ['static/vendor/maplibre-gl.js','static/js/modules/ui/theme.js','static/js/modules/map/map-theme.js','static/js/modules/navigation/settings-snapshot.js','static/js/app/map-theme-orchestration.js','static/js/app/dark-mode-orchestration.js'])await page.addScriptTag({content:read(file)});
 await page.evaluate(()=>{
  window.styleFor=theme=>({version:8,name:theme,sources:theme==='satellite'?{imagery:{type:'raster',tiles:['https://satellite-persistence.invalid/tile.png'],tileSize:256}}:{},layers:[{id:'background',type:'background',paint:{'background-color':theme==='standard'?'#e0e4ea':'#141e2b'}},...(theme==='satellite'?[{id:'imagery',type:'raster',source:'imagery'}]:[])]});
  const M=VoyagrMapThemeOrchestration,D=VoyagrDarkModeOrchestration;
  window.bootstrapPlan=VoyagrMapTheme.buildMapBootstrapPlan();
  window.map=new maplibregl.Map({container:'map',style:styleFor(bootstrapPlan.mapTheme),center:[-1,53],zoom:10});
  window.styleChanges=0;const setStyle=map.setStyle.bind(map);map.setStyle=(...args)=>{styleChanges++;return setStyle(...args);};
  window.XMLHttpRequest=class{open(_method,url){this.url=url;}send(){this.status=200;this.responseText=JSON.stringify(styleFor(this.url.includes('/satellite/')?'satellite':this.url.includes('/dark/')?'dark':'standard'));}};
  const nativeFetch=window.fetch.bind(window);window.fetch=(url,...args)=>String(url).includes('/api/app-settings')?Promise.resolve({ok:true}):nativeFetch(url,...args);
  const save=()=>localStorage.setItem(VoyagrSettingsSnapshot.SETTINGS_STORAGE_KEY,JSON.stringify(VoyagrSettingsSnapshot.buildSettingsSnapshot({mapTheme:M.getCurrentMapTheme(),uiTheme:localStorage.getItem('ui_theme')})));
  M.bind({mapTheme:()=>VoyagrMapTheme,getMap:()=>map,getBuildings3DEnabled:()=>false,call:{initializeRoadLabels:()=>{},setTheme:value=>D.setTheme(value),saveAllSettings:save,showStatus:()=>{}}});
  D.bind({theme:()=>VoyagrTheme,call:{getCurrentMapTheme:()=>M.getCurrentMapTheme(),setMapTheme:value=>M.setMapTheme(value),saveAllSettings:save,showStatus:()=>{}}});
  window.setMapTheme=value=>M.setMapTheme(value);window.setTheme=value=>D.setTheme(value);
  // Same theme-side-effect order as Settings restoration, followed by page init.
  const stored=JSON.parse(localStorage.getItem(VoyagrSettingsSnapshot.SETTINGS_STORAGE_KEY));
  M.setMapTheme(stored.mapTheme);D.applyTheme(stored.uiTheme);D.initializeDarkMode();D.updateThemeButtons();
 });
 await page.waitForFunction(()=>map.isStyleLoaded());
}
async function snapshot(page){return page.evaluate(()=>({boot:initialMapPreference,bootstrap:bootstrapPlan.mapTheme,stored:localStorage.getItem('mapTheme'),current:VoyagrMapThemeOrchestration.getCurrentMapTheme(),rendered:map.getStyle().name,selected:document.querySelector('#mapThemeSelector .active')?.dataset.theme,ui:localStorage.getItem('ui_theme'),htmlDark:document.documentElement.classList.contains('dark-mode'),bodyDark:document.body.classList.contains('dark-mode'),changes:styleChanges}));}
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
for(const [ui,system] of [['light',false],['dark',true],['auto',false],['auto',true]])for(const link of [false,true]){
 const page=await browser.newPage({viewport:{width:390,height:844},colorScheme:system?'dark':'light'});
 await page.addInitScript(({ui,link})=>{if(!localStorage.getItem('fixtureSeeded')){localStorage.setItem('fixtureSeeded','1');localStorage.setItem('mapTheme','satellite');localStorage.setItem('ui_theme',ui);localStorage.setItem('linkUiMapTheme',String(link));localStorage.setItem('voyagr_all_settings',JSON.stringify({mapTheme:'satellite',uiTheme:ui}));}},{ui,link});
 await page.route('**/*',route=>route.request().url()==='https://satellite-persistence.invalid/'?route.fulfill({contentType:'text/html',body:`<html><head><style>${read('static/vendor/maplibre-gl.css')}body{margin:0}#map{height:350px}</style><script>${boot}</script><script>window.initialMapPreference=localStorage.getItem('mapTheme');</script></head><body><div id="map"></div>${controls}</body></html>`}):route.request().url().endsWith('/tile.png')?route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')}):route.abort());
 await page.goto('https://satellite-persistence.invalid/');await mount(page);
 const initial=await snapshot(page),dark=ui==='dark'||ui==='auto'&&system;
 assert.deepEqual(initial,{boot:'satellite',bootstrap:'satellite',stored:'satellite',current:'satellite',rendered:'satellite',selected:'satellite',ui,htmlDark:dark,bodyDark:dark,changes:0});
 await page.reload();await mount(page);assert.deepEqual(await snapshot(page),initial,'Reopening changed the saved imagery/UI choice');
 if(ui==='auto'){await page.emulateMedia({colorScheme:system?'light':'dark'});await page.waitForFunction(expected=>document.body.classList.contains('dark-mode')===expected,!system);assert.equal((await snapshot(page)).stored,'satellite');await page.emulateMedia({colorScheme:system?'dark':'light'});await page.waitForFunction(expected=>document.body.classList.contains('dark-mode')===expected,system);}
 for(const theme of ['light','dark']){
  await page.locator(theme==='dark'?'#themeDark':'#themeLight').click();
  const expected=link?(theme==='dark'?'dark':'standard'):'satellite';await page.waitForFunction(expected=>map.isStyleLoaded()&&map.getStyle().name===expected,expected);
  assert.equal((await snapshot(page)).current,expected);
 }
 // A fresh explicit Satellite selection is durable too, not just seeded storage.
 await page.locator('#mapThemeSelector [data-theme="satellite"]').click();await page.waitForFunction(()=>map.isStyleLoaded()&&map.getStyle().name==='satellite');
 const chosen=await snapshot(page);assert.equal(chosen.stored,'satellite');
 await page.reload();await mount(page);const reopened=await snapshot(page);assert.equal(reopened.boot,'satellite');assert.equal(reopened.rendered,'satellite');assert.equal(reopened.ui,chosen.ui);assert.equal(reopened.selected,'satellite');assert.equal(reopened.changes,0);
 await page.evaluate(()=>map.remove());await page.close();console.log(`${ui}/${system?'dark':'light'} system/link=${link}: boot, settings restore, two reloads, picker state and explicit UI choices passed`);
}
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1);});
