// Controlled unit/table checks; no real routing, weather, price or GPS requests.
const {chromium}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const template=read('templates/index.html');
  const controls=['distanceUnit','temperatureUnit'].map(id=>template.match(new RegExp('<select id="'+id+'"[\\s\\S]*?<\\/select>'))?.[0]).join('');
  const help=template.match(/<p id="temperatureUnitHelp"[\s\S]*?<\/p>/)?.[0];
  if(!help)throw Error('Temperature overlay explanation missing');
  for(const [width,height] of [[390,844],[844,390]]){
   const page=await browser.newPage({viewport:{width,height}});
   await page.route('https://rate-units.invalid/**',route=>route.fulfill({contentType:'text/html',body:controls+help+'<div id="report"></div>'}));
   await page.goto('https://rate-units.invalid/');
   for(const name of ['modules/navigation/units.js','modules/navigation/route-selection.js','modules/navigation/route-prefs.js','modules/map/weather-layer.js','app/units-preferences-orchestration.js'])await page.addScriptTag({content:read('static/js/'+name)});
   await page.evaluate(()=>{
    window.requests=[];window.fetch=async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});return {ok:true}};
    const pref=VoyagrUnitsPreferencesOrchestration;
    pref.bind({units:()=>VoyagrUnits,call:{saveAllSettings:()=>{},showStatus:()=>{}}});pref.setDistanceUnitValue('mi');
    window.updateDistanceUnit=pref.updateDistanceUnit;window.updateTemperatureUnit=pref.updateTemperatureUnit;
    document.getElementById('distanceUnit').value='mi';
    localStorage.setItem('fuelEfficiency','6.5');localStorage.setItem('fuelPrice','1.6');
    window.paramsBefore=JSON.stringify(VoyagrRoutePrefs.getRouteCostParams('petrol_diesel',localStorage));
    window.routeData={route_id:1,distance_km:100,duration_minutes:90,total_cost:20,cost_per_km:0.2};window.originalRoute=JSON.stringify(routeData);
    document.getElementById('report').innerHTML=VoyagrRouteSelection.buildRouteComparisonTableHtml([routeData],{distUnit:'mi',distanceText:'62.14',currencySymbol:pref.getCurrencySymbol()});
    window.cell=document.querySelector('[data-cost-per-km]');window.weatherUrl=VoyagrWeatherLayer.buildWeatherTileUrl('temp_new','fixture-only');
   });
   if(await page.locator('[data-cost-distance-unit]').innerText()!=='Cost/mi'||await page.locator('[data-cost-per-km]').innerText()!=='£0.32')throw Error('Initial imperial cost rate incorrect');
   await page.selectOption('#distanceUnit','km');
   if(await page.locator('[data-cost-distance-unit]').innerText()!=='Cost/km'||await page.locator('[data-cost-per-km]').innerText()!=='£0.20')throw Error('Metric refresh incorrect');
   await page.selectOption('#distanceUnit','mi');await page.selectOption('#temperatureUnit','fahrenheit');
   const state=await page.evaluate(()=>({rate:cell.textContent,sameCell:cell.isConnected,canonical:cell.dataset.costPerKm,sameRoute:JSON.stringify(routeData)===originalRoute,sameParams:JSON.stringify(VoyagrRoutePrefs.getRouteCostParams('petrol_diesel',localStorage))===paramsBefore,mpg:VoyagrUnitsPreferencesOrchestration.getFuelEfficiencyInUnits(6.5),label:VoyagrUnitsPreferencesOrchestration.getFuelEfficiencyLabel(),temp:VoyagrUnitsPreferencesOrchestration.convertTemperature(0),missing:VoyagrUnitsPreferencesOrchestration.convertTemperature(null),sameWeather:VoyagrWeatherLayer.buildWeatherTileUrl('temp_new','fixture-only')===weatherUrl,requests}));
   if(state.rate!=='£0.32'||!state.sameCell||state.canonical!=='0.2'||!state.sameRoute||!state.sameParams||state.label!=='MPG (US)'||state.mpg!=='36.2'||state.temp!=='32.0'||state.missing!=='—'||!state.sameWeather||state.requests.some(r=>r.url!=='/api/app-settings'))throw Error(JSON.stringify(state));
   console.log(width+'x'+height+' cost-rate round-trip and consumption/temperature helper checks passed');await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
