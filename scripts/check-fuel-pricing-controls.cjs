// Controlled browser acceptance: real template controls/modules, no live routes/GPS/prices.
const {chromium}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const controls=read('templates/index.html').match(/<details id="fuelPricingControls"[\s\S]*?<\/details>/)[0];
  for(const [width,height] of [[390,844],[844,390]]){
   const page=await browser.newPage({viewport:{width,height}});
   await page.route('https://fuel-controls.invalid/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+read('static/css/voyagr.css')+'body{display:block;padding:16px;background:#fff}main{max-width:600px;margin:auto}</style></head><body><main>'+controls+'<p id="previewFuelPricingNotice"></p></main></body></html>'}));
   await page.goto('https://fuel-controls.invalid/');
   for(const name of ['modules/navigation/route-prefs.js','modules/navigation/settings-snapshot.js','modules/navigation/route-sharing.js','app/fuel-pricing-controls.js'])await page.addScriptTag({content:read('static/js/'+name)});
   await page.evaluate(()=>{
    window.networkCalls=[];window.fetch=()=>{networkCalls.push('fetch');throw Error('No network expected');};
    window.route={geometry:'original',fuel_cost:12.34,fuel_pricing:{source:'DESNZ_WEEKLY',category:'petrol',currency:'GBP',price_unit:'GBP/L',price_gbp_per_l:'1.7278',observation_date:'2026-11-02'}};
    window.routeBefore=JSON.stringify(route);window.saveCount=0;window.saveAllSettings=()=>{saveCount++;};
    localStorage.setItem('fuelPrice','1.89');document.dispatchEvent(new Event('DOMContentLoaded'));
    VoyagrFuelPricingControls.showQuote(route);
   });
   await page.locator('#fuelPricingControls summary').click();
   if(await page.inputValue('#fuelPriceMode')!=='manual'||await page.inputValue('#manualFuelPrice')!=='1.89')throw Error('Legacy price lost');
   await page.selectOption('#fuelPriceMode','automatic');await page.selectOption('#fuelCategory','diesel');
   const auto=await page.evaluate(()=>VoyagrRoutePrefs.getRouteCostParams('petrol_diesel',localStorage));
   if('fuel_price' in auto||auto.fuel_category!=='diesel'||auto.fuel_price_mode!=='automatic')throw Error('Automatic request still sends fixed price');
   if(await page.locator('#manualFuelPriceGroup').isVisible())throw Error('Manual input not hidden in automatic mode');
   await page.selectOption('#fuelPriceMode','manual');await page.locator('#manualFuelPrice').fill('1.42');await page.locator('#manualFuelPrice').press('Tab');
   const unchanged=await page.evaluate(()=>({route:JSON.stringify(route)===routeBefore,calls:networkCalls.length,saves:saveCount}));
   if(!unchanged.route||unchanged.calls!==0||unchanged.saves<3)throw Error('Settings changed active route or performed network work');
   await page.reload(); // Reinstall real modules to verify persistence, no backend.
   for(const name of ['modules/navigation/route-prefs.js','app/fuel-pricing-controls.js'])await page.addScriptTag({content:read('static/js/'+name)});
   await page.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
   if(await page.inputValue('#manualFuelPrice')!=='1.42')throw Error('Reload lost manual price');
   await page.locator('#fuelPricingControls summary').click();
   const state=await page.evaluate(()=>({params:VoyagrRoutePrefs.getRouteCostParams('petrol_diesel',localStorage),overflow:document.documentElement.scrollWidth>innerWidth}));
   if(state.params.fuel_price!==1.42||state.overflow)throw Error(JSON.stringify(state));
   console.log(width+'x'+height+' legacy/manual/automatic selection, persistence and layout passed');
   if(width===390)await page.screenshot({path:'/tmp/voyagr-fuel-pricing-controls.png',fullPage:true});
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
