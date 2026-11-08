// Controlled settings/POI/arrival browser check, without real network/GPS/routing.
const {chromium}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const select=read('templates/index.html').match(/<select id="distanceUnit"[\s\S]*?<\/select>/)?.[0];
  if(!select)throw Error('Production unit selector missing');
  for(const [width,height] of [[390,844],[844,390]]){
   const page=await browser.newPage({viewport:{width,height}});
   await page.route('https://unit-check.invalid/**',route=>route.fulfill({contentType:'text/html',body:select+'<input id="end" value="Town" data-lat="53.5" data-lon="-1.2" data-display-name="Town"><input id="drivingArrival" value="car park"><div id="autocomplete_drivingArrival"></div><div id="popup"></div>'}));
   await page.goto('https://unit-check.invalid/');
   for(const name of ['modules/navigation/units.js','app/units-preferences-orchestration.js','modules/navigation/poi-search.js','modules/navigation/search-autocomplete.js','modules/navigation/journey-plan.js','app/geocoding-orchestration.js'])await page.addScriptTag({content:read('static/js/'+name)});
   await page.evaluate(()=>{
    window.requests=[];window.fetch=async(url)=>{requests.push(url);return {ok:true}};
    const pref=VoyagrUnitsPreferencesOrchestration;
    pref.bind({units:()=>VoyagrUnits,call:{saveAllSettings:()=>{},showStatus:()=>{}}});pref.setDistanceUnitValue('km');
    window.updateDistanceUnit=pref.updateDistanceUnit;
    const format=m=>VoyagrUnits.formatDistanceLabelMeters(m,pref.getDistanceUnitValue());
    const poi={lat:53.5,lon:-1.2,distance_m:1609.344,name:'Station',type:'fuel'};
    document.getElementById('popup').innerHTML=VoyagrPoiSearch.buildPoiMapMarkerPopupHtml(poi,{distanceText:format(poi.distance_m)});
    VoyagrGeocodingOrchestration.bind({searchAutocomplete:()=>VoyagrSearchAutocomplete,call:{formatPoiDistance:format}});
    VoyagrGeocodingOrchestration.displayAutocompleteResults('drivingArrival',[{lat:53.51,lon:-1.2,name:'Car park',type:'parking',class:'amenity'}]);
   });
   const canonical=await page.locator('[data-distance-meters]').evaluateAll(nodes=>nodes.map(n=>n.dataset.distanceMeters));
   await page.selectOption('#distanceUnit','mi');
   if(!(await page.locator('#popup').innerText()).includes('1.0 mi away'))throw Error('Popup stayed metric');
   if(!(await page.locator('#autocomplete_drivingArrival').innerText()).includes('ft from destination'))throw Error('Arrival stayed metric');
   await page.selectOption('#distanceUnit','km');
   if(!(await page.locator('#popup').innerText()).includes('1.6 km away'))throw Error('Popup did not return to metric');
   const result=await page.evaluate(()=>({requests:window.requests,stored:localStorage.getItem('unit_distance'),canonical:[...document.querySelectorAll('[data-distance-meters]')].map(n=>n.dataset.distanceMeters)}));
   if(result.stored!=='km'||result.requests.some(url=>url!=='/api/app-settings')||JSON.stringify(result.canonical)!==JSON.stringify(canonical))throw Error(JSON.stringify(result));
   console.log(width+'x'+height+' settings/POI/arrival unit round-trip passed');await page.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
