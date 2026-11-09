const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const section=read('templates/index.html').match(/<section id="journeyModeChooser"[\s\S]*?<\/section>/)[0].replace(' hidden>','>');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 for(const dark of [false,true])for(const large of [false,true])for(const width of [360,1280]){
  const page=await browser.newPage({viewport:{width,height:640}});
  await page.setContent(`<style>${read('static/css/voyagr.css')}html{font-size:${large?24:16}px}</style><body class="${dark?'dark-mode':''}"><button id="opener">Journey options</button>${section}</body>`);
  await page.evaluate(()=>{window.actions=[];window.VoyagrJourneyModes=Object.fromEntries(['exit','startSimulation','navigateFromGPS','startHere','abandonJourney'].map(name=>[name,()=>actions.push(name)]));document.getElementById('journeyModeStatus').textContent='GPS accuracy is insufficient (30 m or better required). Move to a clearer location and retry.';});
  const panel=page.locator('#journeyModeChooser');
  const bounds=await panel.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y>=0&&bounds.y+bounds.height<=640);
  assert(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth),'Chooser overflows horizontally');
  for(const name of ['Play preview','Navigate from my location','End previous journey']){
   const button=page.getByRole('button',{name,exact:true});await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();assert(box.height>=44);
   await button.click();
  }
  assert.deepEqual(await page.evaluate(()=>actions),['startSimulation','navigateFromGPS','abandonJourney']);
  assert(await page.locator('#startVerifiedHere').isHidden());
  await page.getByRole('button',{name:'Close journey controls',exact:true}).focus();
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Close journey controls');
  await page.screenshot({path:`/tmp/voyagr-chooser-${width}-${dark}-${large}.png`});
  await page.keyboard.press('Enter');assert(await panel.isHidden());
  console.log(`${width}px dark=${dark} large-text=${large}: bounds, scroll, actions, hidden verified start and keyboard close passed`);await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
