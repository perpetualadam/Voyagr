// Browser integration of production GPS-stop acquisition. Position callbacks are
// deterministic device adapters; this does not measure real receiver accuracy.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.setContent('<p id="journeyModeStatus" role="status"></p>');
 for(const file of ['static/js/modules/navigation/journey-plan.js','static/js/app/journey-modes.js'])await page.addScriptTag({content:read(file)});
 await page.evaluate(()=>{
  window.stops=[];window.statuses=[];window.cleared=[];window.watchCount=0;
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:ok=>{window.firstFix=ok;},watchPosition:(ok,error)=>{window.nextFix=ok;window.geoError=error;return ++watchCount;},clearWatch:id=>cleared.push(id)},configurable:true});
  VoyagrJourneyModes.bind({selected:()=>null,isLive:()=>false,showStatus:m=>statuses.push(m),addStop:(...args)=>stops.push(args)});
  window.pos=(accuracy=5)=>({timestamp:Date.now(),coords:{latitude:53,longitude:-1,accuracy}});
 });
 await page.evaluate(()=>{window.pending=VoyagrJourneyModes.addGpsStop();firstFix(pos(100));nextFix({...pos(),timestamp:Date.now()-20000});nextFix(pos(31));});
 assert.deepEqual(await page.evaluate(()=>({stops:stops.length,cleared})),{stops:0,cleared:[]});
 await page.evaluate(()=>nextFix(pos(20)));assert.equal(await page.evaluate(()=>pending),true);
 assert.deepEqual(await page.evaluate(()=>({stops:stops.length,cleared})),{stops:1,cleared:[1]});
 await page.evaluate(()=>{window.pending=VoyagrJourneyModes.addGpsStop();firstFix(pos(90));VoyagrJourneyModes.exit();nextFix(pos());});
 assert.equal(await page.evaluate(()=>pending),false);assert.deepEqual(await page.evaluate(()=>({stops:stops.length,cleared})),{stops:1,cleared:[1,2]});
 await page.evaluate(()=>{window.pending=VoyagrJourneyModes.addGpsStop();firstFix(pos(90));geoError({code:1});});
 assert.equal(await page.evaluate(()=>pending),false);assert.match(await page.locator('#journeyModeStatus').textContent(),/permission denied/);
 await page.evaluate(()=>{window.pending=VoyagrJourneyModes.addGpsStop();firstFix(pos(90));const oldNow=Date.now;Date.now=()=>oldNow()+13000;nextFix(pos());Date.now=oldNow;});
 assert.equal(await page.evaluate(()=>pending),false);
 assert.deepEqual(await page.evaluate(()=>({stops:stops.length,cleared})),{stops:1,cleared:[1,2,3,4]});
 await page.evaluate(()=>{window.pending=VoyagrJourneyModes.addGpsStop();firstFix(pos());});assert.equal(await page.evaluate(()=>pending),true);
 assert.deepEqual(await page.evaluate(()=>({stops:stops.length,watchCount})),{stops:2,watchCount:4});
 console.log('Browser GPS acquisition: improvement, stale/coarse refusal, cancellation, denial, wall-clock expiry, fast path and owned watch cleanup passed');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
