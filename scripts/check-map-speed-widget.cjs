// Production HUD/controller with controlled GPS/evidence boundaries; no live GPS.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{chromium}=require('playwright');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
(async()=>{
 const doc=new JSDOM(read('templates/index.html')).window.document;
 const hud=doc.getElementById('navigationOverlayLayout').outerHTML;
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  for(const [width,height]of [[320,640],[390,844],[844,390]])for(const dark of [false,true]){
   const page=await browser.newPage({viewport:{width,height}});
   await page.route('https://speed-widget.invalid/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>'+read('static/css/voyagr.css')+'</style>'+hud}));
   await page.goto('https://speed-widget.invalid');
   for(const file of ['modules/navigation/speed-gps.js','modules/navigation/speed-limit-widget.js','app/speed-widget-orchestration.js'])await page.addScriptTag({content:read('static/js/'+file)});
   await page.evaluate(dark=>{
    document.documentElement.classList.toggle('dark-mode',dark);window.tracking=false;window.starts=0;
    window.VoyagrGpsOrchestration={startGPSTracking(){tracking=true;starts++;}};
    VoyagrSpeedWidgetOrchestration.bind({speedGps:()=>VoyagrSpeedGps,speedLimitWidget:()=>VoyagrSpeedLimitWidget,getSpeedUnit:()=> 'mph',getIsTrackingActive:()=>tracking,getRouteInProgress:()=>false,call:{getSpeedUnit:()=> 'mph'}});
    VoyagrSpeedWidgetOrchestration.updateSpeedWidgetVisibility();
   },dark);
   assert.equal(await page.locator('#speedWidget').isVisible(),true);assert.equal(await page.textContent('#speedWidgetState'),'GPS off');
   const box=await page.locator('#speedWidgetUseGps').boundingBox();assert.ok(box.height>=44 && box.x>=0 && box.x+box.width<=width);
   await page.click('#speedWidgetUseGps');assert.equal(await page.evaluate(()=>starts),1);
   await page.evaluate(()=>VoyagrSpeedWidgetOrchestration.updateSpeedWidget(0,30,{applicable:true,evidence_state:'MAPPED_POSTED'}));
   assert.equal(await page.textContent('#speedLimitValue'),'30');assert.equal(await page.locator('#speedWidgetUseGps').isVisible(),false);
   await page.evaluate(()=>{tracking=false;VoyagrSpeedWidgetOrchestration.updateSpeedWidgetVisibility();});
   assert.equal(await page.textContent('#speedLimitValue'),'—');
   await page.evaluate(()=>{VoyagrSpeedWidgetOrchestration.setSpeedWidgetEnabled(false);VoyagrSpeedWidgetOrchestration.updateSpeedWidgetVisibility();});
   assert.equal(await page.locator('#speedWidget').isVisible(),false);
   console.log(width+'x'+height+' '+(dark?'dark':'light')+': idle, GPS action, mapped limit, stopped state and preference passed');await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
