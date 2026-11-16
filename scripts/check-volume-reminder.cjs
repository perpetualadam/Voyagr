// Actual reminder owner and production markup/CSS, controlled speech boundaries.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{chromium}=require('playwright');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
(async()=>{
 const doc=new JSDOM(read('templates/index.html')).window.document;
 const b=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const [width,height]of [[320,640],[390,844],[844,390],[1280,800]])for(const dark of [false,true])for(const scale of [1,2]){
  const page=await b.newPage({viewport:{width,height}});
  await page.route('https://volume.invalid/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>'+read('static/css/voyagr.css')+'</style>'+doc.getElementById('reviewVolumeReminder').outerHTML+doc.getElementById('previewRouteInfo').outerHTML}));
  await page.goto('https://volume.invalid');
  for(const f of ['modules/ui/device-environment.js','app/notifications-orchestration.js'])await page.addScriptTag({content:read('static/js/'+f)});
  await page.evaluate(({dark,scale})=>{
   document.documentElement.classList.toggle('dark-mode',dark);document.documentElement.style.fontSize=16*scale+'px';
   VoyagrNotificationsOrchestration.bind({deviceEnvironment:()=>VoyagrDeviceEnvironment,getVoiceAnnouncementsEnabled:()=>false,call:{}});
  },{dark,scale});
  assert.equal(await page.locator('#previewRouteInfo').getAttribute('open'),null,'Diagnostics must start collapsed');
  assert.equal(await page.locator('#routeSpeedDataStatus').isVisible(),false);
  await page.locator('#previewRouteInfo > summary').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#routeSpeedDataStatus').isVisible(),true);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#routeSpeedDataStatus').isVisible(),false);
  await page.click('#reviewVolumeReminder');await page.waitForTimeout(400);
  const card=page.locator('#volumeHintBanner'),box=await card.boundingBox();
  assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=height);
  if(scale===1)assert.ok(box.height<=72,'Closed reminder must be compact');
  for(const selector of ['#volumeHintDismiss','.voyagr-volume-hint__info > summary']){
   const rect=await page.locator(selector).boundingBox();assert.ok(rect.height>=44,'Touch target too short');
  }
  await page.locator('.voyagr-volume-hint__info > summary').focus();await page.keyboard.press('Enter');
  assert.ok(await page.locator('#volumeHintOk').isVisible());
  assert.equal(await card.evaluate(el=>el.scrollWidth>el.clientWidth),false,'Reminder overflow');
  await page.click('#volumeHintOk');await page.waitForTimeout(350);
  assert.equal(await page.locator('#volumeHintBanner').count(),0);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'reviewVolumeReminder');
  await page.click('#reviewVolumeReminder');assert.equal(await page.locator('#volumeHintBanner').count(),1);
  console.log(`${width}x${height} ${dark?'dark':'light'} ${scale}x: compact, bounded, keyboard, dismiss/reopen and collapsed diagnostics passed`);
  await page.close();
 }}finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
