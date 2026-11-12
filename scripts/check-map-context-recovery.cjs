// Real MapLibre + production context-recovery wiring; synthetic GPU loss, not a phone acceptance test.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('@playwright/test'),parser=require('@babel/parser');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),core=read('static/js/voyagr-core.js');
const nodes=parser.parse(core).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='initializeMap').body.body;
const block=nodes.find(n=>n.type==='IfStatement'&&core.slice(n.test.start,n.test.end)==='window.VoyagrMapContextRecovery');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:width===390?3:1});
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0}#map{height:700px;width:100vw}</style><div id="map"></div><div id="mapLoadingOverlay"></div>'}));
  await page.goto('https://fixture.test/');
  await page.addScriptTag({content:read('static/vendor/maplibre-gl.js')});await page.addScriptTag({content:read('static/js/modules/map/map-context-recovery.js')});
  await page.evaluate(async mobile=>{
   window.map=new maplibregl.Map({container:'map',...VoyagrMapContextRecovery.renderOptions(devicePixelRatio,mobile),style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#203b61'}}]},center:[-1,53],zoom:12});
   await new Promise(done=>map.once('load',done));
   map.addSource('selected-route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:[[-1,53],[-1,53.01]]}}});
   map.addLayer({id:'selected-route',type:'line',source:'selected-route',paint:{'line-color':'#2266ff','line-width':6}});
   window.journey={active:true,remaining:500};window.recoveries=0;
   window.getMapWebGLContext=()=>map.getCanvas().getContext('webgl2')||map.getCanvas().getContext('webgl');
   window.showMapLoadingOverlay=()=>document.getElementById('mapLoadingOverlay').hidden=false;
   window.hideMapLoadingOverlay=()=>document.getElementById('mapLoadingOverlay').hidden=true;
   window.voyagrMapResizeAndRepaint=()=>{map.resize();map.triggerRepaint();};
   window.voyagrMapRecoverAfterNetworkEvent=()=>window.recoveries++;
   window.__voyagrRedrawNavigationOverlays=()=>{};
  },width===390);
  await page.addScriptTag({content:core.slice(block.start,block.end)});
  await page.evaluate(()=>{getMapWebGLContext().getExtension('WEBGL_lose_context').loseContext();journey.remaining=400;});
  await page.waitForFunction(()=>recoveries>0&&!getMapWebGLContext().isContextLost()&&map.loaded(),{},{timeout:20000});
  const state=await page.evaluate(()=>({active:journey.active,remaining:journey.remaining,route:!!map.getLayer('selected-route'),overlay:document.getElementById('mapLoadingOverlay').hidden,ratio:map.getCanvas().width/map.getContainer().clientWidth}));
  assert.equal(state.active,true);assert.equal(state.remaining,400);assert.equal(state.route,true);assert.equal(state.overlay,true);if(width===390)assert.equal(state.ratio,2);
  console.log(`PASS ${width}px: real WebGL loss restored; route and journey retained; density ${state.ratio}`);await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
