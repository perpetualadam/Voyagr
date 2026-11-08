// Controlled preferred-currency check. No real backend/rate/provider requests.
const {chromium}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const template=read('templates/index.html');
  const select=template.match(/<select id="currencyUnit"[\s\S]*?<\/select>/)?.[0];
  const help=template.match(/<p id="costCurrencyHelp"[\s\S]*?<\/p>/)?.[0];
  const preview=template.match(/<details id="previewCostDetails"[\s\S]*?<\/details>/)?.[0];
  if(!select||!help||!preview)throw Error('Production currency controls missing');
  for(const [width,height] of [[390,844],[844,390]]){
   const page=await browser.newPage({viewport:{width,height}});
   await page.route('https://currency-check.invalid/**',route=>route.fulfill({contentType:'text/html',body:select+help+'<span id="fuelCost" data-value="12.40">£12.40</span><span id="tollCost" data-value="3.00">£3.00</span>'+preview+'<div id="comparison"></div>'}));
   await page.goto('https://currency-check.invalid/');
   for(const name of ['modules/navigation/units.js','app/units-preferences-orchestration.js','modules/navigation/route-selection.js'])await page.addScriptTag({content:read('static/js/'+name)});
   await page.evaluate(()=>{
    window.requests=[];window.statuses=[];window.fetch=async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});return {ok:true}};
    const pref=VoyagrUnitsPreferencesOrchestration;
    pref.bind({units:()=>VoyagrUnits,call:{saveAllSettings:()=>{},showStatus:(message,type)=>statuses.push({message,type})}});
    window.updateCurrencyUnit=pref.updateCurrencyUnit;
    window.render=()=>{
     const route={name:'Test route',distance_km:10,duration_minutes:20,fuel_cost:12.4,toll_cost:3,caz_cost:10,hazard_count:0};
     const fmt={currencySymbol:pref.getCurrencySymbol(),distanceText:'6.21',distUnit:'mi',routeColor:'#765432'};
     document.getElementById('comparison').innerHTML=VoyagrRouteSelection.buildRouteComparisonCardHtml(route,0,fmt);
     document.getElementById('previewFuelCost').textContent=VoyagrRouteSelection.buildTripInfoDisplayValues(route,fmt).fuelCostText;
    };render();document.getElementById('previewCostDetails').open=true;
   });
   for(const currency of ['USD','EUR','GBP']){
    await page.selectOption('#currencyUnit',currency);await page.evaluate(()=>render());
    const result=await page.evaluate(()=>({fuel:document.getElementById('fuelCost').textContent,preview:document.getElementById('previewFuelCost').textContent,card:document.getElementById('comparison').textContent,stored:localStorage.getItem('unit_currency'),amount:document.getElementById('fuelCost').dataset.value,requests,statuses}));
    if(result.fuel!=='£12.40'||result.preview!=='£12.40'||!result.card.includes('£25.40')||result.amount!=='12.40'||result.stored!==currency||result.requests.some(r=>r.url!=='/api/app-settings'))throw Error(JSON.stringify(result));
    if(currency!=='GBP'&&!result.statuses.at(-1).message.includes('conversion is unavailable'))throw Error('Missing conversion notice');
   }
   if(!(await page.locator('#costCurrencyHelp').innerText()).includes('GBP'))throw Error('Missing settings provenance');
   if(!(await page.locator('#previewCostCurrencyNotice').innerText()).includes('conversion is currently unavailable'))throw Error('Missing preview provenance');
   console.log(width+'x'+height+' preferred currency/source amount checks passed');await page.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
