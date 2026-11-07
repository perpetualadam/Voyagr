/* Production disclosure, CSS, waypoint plans and owner. Map/GPS/provider boundaries are fixtures. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),html=read('templates/index.html');
const markup=html.slice(html.indexOf('<details id="waypointOptions"'),html.indexOf('<!-- Vehicle Type Selector -->'));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 for(const [width,height] of [[320,640],[390,844],[844,390],[1280,800]])for(const dark of [false,true])for(const scale of [1,2]){
  const page=await browser.newPage({viewport:{width,height}});await page.route('**/*',r=>r.abort());
  await page.setContent(`<html class="${dark?'dark-mode':''}" style="font-size:${scale*100}%"><head><style>${read('static/css/voyagr.css')}</style></head><body class="${dark?'dark-mode':''}"><main style="max-width:640px;margin:auto;padding:16px">${markup}<button id="calculate">Calculate route</button></main></body></html>`);
  for(const file of ['static/js/modules/navigation/waypoints.js','static/js/modules/ui/dom-helpers.js','static/js/app/waypoints-orchestration.js'])await page.addScriptTag({content:read(file)});
  await page.evaluate(()=>{
   const o=window.VoyagrWaypointsOrchestration;window.showAutocomplete=()=>{};
   window.VoyagrLocationOrchestration={invalidateEndpointRequests:()=>{}};
   o.bind({waypoints:()=>window.VoyagrWaypoints,domHelpers:()=>window.VoyagrDomHelpers,getMap:()=>null,getRoutePolyline:()=>[],getMapLibreHelpers:()=>({createMarker:()=>({addTo(){return this;},remove(){}})}),call:{showStatus:()=>{},getAutocompleteDropdown:()=>null}});
   for(const name of ['addViaPointFromAddress','addStopFromAddress','removeViaPoint','removeStop','clearAllWaypoints','moveWaypoint','toggleAddViaPoint','toggleAddStop','toggleRouteEditing','onWaypointDragStart','onWaypointDragOver','onWaypointDrop'])window[name]=(...args)=>o[name](...args);
   window.gpsStopCalls=0;window.VoyagrJourneyModes={addGpsStop:()=>{window.gpsStopCalls++;}};
  });
  const details=page.locator('#waypointOptions'),summary=details.locator('summary');
  assert.equal(await details.getAttribute('open'),null);assert.equal(await page.locator('#viaPointAddress').isVisible(),false);
  await summary.focus();await summary.press('Enter');
  await page.evaluate(()=>{const el=document.getElementById('viaPointAddress');el.value='Via '+('LongName').repeat(24);Object.assign(el.dataset,{lat:'53',lon:'-1',displayName:el.value});});
  await details.locator('.btn-waypoint--via').click();
  await page.evaluate(()=>{window.VoyagrWaypointsOrchestration.addStop(54,-2,'Stop '+('Long place ').repeat(16),20);window.VoyagrWaypointsOrchestration.addStop(55,-3,'Second stop',30);});
  assert((await summary.innerText()).includes('2 stops · 1 via-point · 50 min stop time'));
  await details.locator('[data-type="stop"]').nth(1).getByRole('button',{name:'Move waypoint up',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.VoyagrWaypointsOrchestration.getStops()[0].name),'Second stop');
  await details.getByRole('button',{name:'Add current GPS stop',exact:true}).click();assert.equal(await page.evaluate(()=>window.gpsStopCalls),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const button of await details.locator('button').all()){
   await button.focus();const b=await button.boundingBox();assert(b.width>=48&&b.height>=48,JSON.stringify(b));
   assert(b.x>=0&&b.x+b.width<=width+1,'Control extends outside viewport');
  }
  await summary.focus();await summary.press('Space');assert.equal(await details.getAttribute('open'),null);
  assert((await summary.innerText()).includes('50 min stop time'));
  await summary.press('Enter');await details.locator('[data-type="via"] [aria-label="Remove waypoint"]').click();assert((await summary.innerText()).includes('2 stops · 50 min stop time'));
  await details.getByRole('button',{name:'Clear all',exact:true}).click();assert((await summary.innerText()).includes('No via-points or stops'));
  await page.locator('#addViaPointBtn').click();await summary.focus();await summary.press('Enter');
  assert((await summary.innerText()).includes('Choosing a via-point on the map'));assert.equal(await page.evaluate(()=>window.VoyagrWaypointsOrchestration.getAddingViaPoint()),true);
  await page.close();
 }
 console.log('Waypoint options: 16 Chromium viewport/theme/text-scale cases passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
