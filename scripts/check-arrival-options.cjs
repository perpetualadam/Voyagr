/* Production arrival markup/CSS and selection handlers; provider calls are fixtures. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),template=read('templates/index.html');
const markup=template.slice(template.indexOf('<details id="arrivalOptions"'),template.indexOf('<!-- VIA-POINTS'));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 for(const [width,height] of [[320,640],[390,844],[844,390],[1280,800]])for(const dark of [false,true])for(const scale of [1,2]){
  const page=await browser.newPage({viewport:{width,height}});await page.route('**/*',r=>r.abort());
  await page.setContent(`<html class="${dark?'dark-mode':''}" style="font-size:${100*scale}%"><head><style>${read('static/css/voyagr.css')}</style></head><body class="${dark?'dark-mode':''}"><main style="padding:16px;max-width:640px;margin:auto"><input id="end" value="Doncaster">${markup}<button id="calculate">Calculate</button></main></body></html>`);
  for(const file of ['static/js/modules/navigation/journey-plan.js','static/js/app/geocoding-orchestration.js'])await page.addScriptTag({content:read(file)});
  await page.evaluate(()=>{
   window.VoyagrLocationOrchestration={invalidateEndpointRequests:()=>{}};
   window.VoyagrGeocodingOrchestration.bind({call:{showStatus:()=>{}}});
   window.showAutocomplete=()=>{};
  });
  const details=page.locator('#arrivalOptions'),summary=details.locator('summary');
  assert.equal(await details.getAttribute('open'),null);assert.equal(await page.locator('#drivingArrival').isVisible(),false);
  assert.equal(await page.locator('#arrivalIntentHelp').isVisible(),false);assert.equal(await page.locator('#drivingArrivalHelp').isVisible(),false);
  const info=page.locator('#navigationArrivalInfo > summary');await info.focus();await page.keyboard.press('Enter');
  assert(await page.locator('#arrivalIntentHelp').isVisible());assert(await page.locator('#drivingArrivalHelp').isVisible());
  await page.keyboard.press('Space');assert.equal(await page.locator('#drivingArrivalHelp').isVisible(),false);
  await summary.focus();await page.keyboard.press('Enter');assert(await page.locator('#drivingArrival').isVisible());
  await page.evaluate(()=>window.VoyagrGeocodingOrchestration.selectAutocompleteResult('drivingArrival',53,-1,'NCP '+('Long parking name ').repeat(12)));
  await page.locator('#arrivalIntent').selectOption('roadside');
  await summary.focus();await page.keyboard.press('Space');
  assert.equal(await details.getAttribute('open'),null);
  assert((await summary.innerText()).includes('Driving arrival: NCP'));assert((await summary.innerText()).includes('Roadside — preview only'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const b=await summary.boundingBox();assert(b.height>=48&&b.width>=48);
  await summary.press('Enter');await details.locator('button').click();await summary.focus();await summary.press('Enter');
  assert.equal(await page.locator('#arrivalOptionsSummary').innerText(),'Use destination');
  await page.close();
 }
 console.log('Arrival options: 16 Chromium viewport/theme/text-scale cases passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
