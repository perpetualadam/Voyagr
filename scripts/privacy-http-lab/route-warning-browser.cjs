// Production control, scanner owner and formatter with controlled API transport.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const read=p=>fs.readFileSync(path.join(__dirname,'../..',p),'utf8');
(async()=>{
 const button=read('templates/index.html').match(/<button[^>]+onclick="VoyagrRouteWarnings.refresh\(window.lastCalculatedRoute\)"[^>]*>[\s\S]*?<\/button>/)[0];
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BINARY||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 try{for(const [width,height]of [[320,640],[390,844],[844,390]]){
  const page=await browser.newPage({viewport:{width,height}});let mode='full',requested;
  await page.route('**/*',async r=>{
   const u=new URL(r.request().url());
   if(u.origin!=='https://warning-fixture.invalid')return r.abort();
   if(u.pathname==='/api/route-warning-observations'){
    requested=r.request().postDataJSON();
    if(mode==='failure')return r.fulfill({status:503,body:'Unavailable'});
    const key=await page.evaluate(shape=>VoyagrAvoidanceIntegrity.geometryBinding(shape),requested);
    const coverage={};for(const kind of ['traffic_light','railway_crossing','cameras'])coverage[kind]={geometry_binding:key,query_scope:'SELECTED_ROUTE_CORRIDOR',status:mode==='stale'?'STALE':'AVAILABLE',route_scan:'ALL_SEGMENTS_QUERIED',retrieved_at:Date.now()/1000-(mode==='stale'?301:0),dataset_completeness_verified:false};
    return r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,geometry_binding:key,warning_coverage:coverage,hazards:[{type:'traffic_light',lat:53.15,lon:-.7},{type:'railway_crossing',lat:53.3,lon:-.8}]})});
   }
   return r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+read('static/css/voyagr.css')+'body{display:block;padding:12px;overflow:auto}</style>'+button+'<p id="routeHazardDataStatus"></p>'});
  });
  await page.goto('https://warning-fixture.invalid');
  for(const file of ['modules/navigation/avoidance-integrity.js','modules/navigation/hazard-alerts.js','app/route-warnings.js'])await page.addScriptTag({content:read('static/js/'+file)});
  await page.evaluate(()=>{
   localStorage.setItem('retained-warning-browser-marker','keep');window.markerUpdates=0;
   window.lastCalculatedRoute={geometry:[[53,-1],[53,-.7],[53.3,-.7],[53.3,-1]],geometry_precision:6,hazards:[{type:'accident',lat:53.1,lon:-.7}]};
   window.displayHazardMarkers=()=>markerUpdates++;
  });
  await page.getByRole('button',{name:'Refresh mapped warning data'}).click();
  await page.waitForFunction(()=>document.getElementById('routeHazardDataStatus').textContent.includes('all selected-route sections queried'));
  assert.deepEqual(requested.geometry,[[53,-1],[53,-.7],[53.3,-.7],[53.3,-1]]);
  assert.equal(await page.evaluate(()=>lastCalculatedRoute.hazards.some(h=>h.type==='railway_crossing')),true);
  mode='failure';await page.getByRole('button',{name:'Refresh mapped warning data'}).click();
  await page.waitForFunction(()=>document.getElementById('routeHazardDataStatus').textContent.includes('earlier observations retained'));
  assert.equal(await page.evaluate(()=>lastCalculatedRoute.hazards.length),3);
  mode='stale';await page.getByRole('button',{name:'Refresh mapped warning data'}).click();
  await page.waitForFunction(()=>document.getElementById('routeHazardDataStatus').textContent.includes('stale'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('retained-warning-browser-marker')),'keep');
  for(const scale of [1,2]){
   await page.evaluate(s=>document.documentElement.style.fontSize=16*s+'px',scale);
   assert.ok((await page.getByRole('button',{name:'Refresh mapped warning data'}).boundingBox()).height>=44);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  console.log(width+'x'+height+': actual-route refresh control, complete-query wording, failure retention, stale wording and 200% text passed');
  await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
