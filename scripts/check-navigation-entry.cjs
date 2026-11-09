// Real renderer + production journey entry owner. GPS/network/collapse hooks are
// deterministic adapters; this does not assert live GPS/provider availability.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const card=read('templates/index.html').match(/<section id="navigationEntry"[\s\S]*?<\/section>/)[0];
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 for(const dark of [false,true])for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>${read('static/vendor/maplibre-gl.css')}${read('static/css/voyagr.css')}body{margin:0}#map{height:844px;width:100vw}#planner{position:absolute;inset:0;background:white}</style><body class="${dark?'dark-mode':''}"><div id="map"></div><div id="planner">Route preview</div>${card}</body>`}));
  await page.goto('https://entry.invalid/');
  for(const file of ['static/vendor/maplibre-gl.js','static/js/maplibre-helpers.js','static/js/modules/navigation/journey-plan.js','static/js/modules/navigation/avoidance-integrity.js','static/js/app/journey-modes.js'])await page.addScriptTag({content:read(file)});
  await page.evaluate(dark=>{
   window.map=new maplibregl.Map({container:'map',center:[-1,53],zoom:13,style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':dark?'#141820':'#eee'}}]}});
   window.route={id:'selected',geometry:[[53,-1],[53.01,-1]],destination:'53.01,-1',maneuvers:[{instruction:'Head north',begin_shape_index:0}],duration_minutes:5};window.gpsCount=0;window.positionMarkers=[];
   Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:ok=>{gpsCount++;window.deliverFix=ok;}}});
   VoyagrJourneyModes.bind({selected:()=>route,isLive:()=>false,map:()=>map,helpers:()=>MapLibreHelpers,getFix:()=>null,showStatus:()=>{},showNavigationMap:()=>{document.getElementById('planner').hidden=true;},acceptPosition:()=>true,buildRequest:()=>({}),fetch:()=>new Promise(resolve=>{window.reply=resolve;}),
    entryMarker:point=>{const el=document.createElement('div');el.className='navigation-entry-position';const m=new maplibregl.Marker({element:el}).setLngLat([point[1],point[0]]).addTo(map);positionMarkers.push(m);return m;}});
  },dark);
  await page.waitForFunction(()=>map.isStyleLoaded());
  const initial=await page.evaluate(()=>{window.line=MapLibreHelpers.addPolyline(map,route.geometry,{color:'#2563eb',weight:6});window.pending=VoyagrJourneyModes.startNavigation();const same=VoyagrJourneyModes.startNavigation()===pending;return {same,card:!document.getElementById('navigationEntry').hidden,planner:document.getElementById('planner').hidden,gps:gpsCount};});
  assert.deepEqual(initial,{same:true,card:true,planner:true,gps:0});
  await page.waitForFunction(()=>gpsCount===1);assert.equal(await page.locator('.navigation-entry-position').count(),0);
  await page.evaluate(()=>deliverFix({timestamp:Date.now(),coords:{latitude:53,longitude:-1,accuracy:5}}));await page.waitForFunction(()=>!!window.reply);
  assert.equal(await page.locator('.navigation-entry-position').count(),1);assert.equal(await page.locator('#navigationEntryRetry').isVisible(),false);
  const bounds=await page.locator('#navigationEntry').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y>=0&&bounds.y+bounds.height<=844);
  await page.getByRole('button',{name:'Cancel navigation startup'}).focus();await page.screenshot({path:`/tmp/voyagr-navigation-entry-${width}-${dark}.png`});await page.keyboard.press('Enter');
  await page.evaluate(()=>reply({ok:false}));assert.equal(await page.evaluate(()=>pending),false);
  assert.equal(await page.locator('#navigationEntry').isHidden(),true);assert.equal(await page.locator('.navigation-entry-position').count(),0);
  assert(await page.evaluate(()=>!!map.getLayer(line.id)),'Selected route removed by startup cancellation');
  console.log(`${width}px dark=${dark}: immediate map, one background GPS request, observed marker, keyboard cancel, route preservation passed`);
  await page.evaluate(()=>map.remove());await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
