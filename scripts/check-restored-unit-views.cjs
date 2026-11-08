// Controlled profile/settings restoration. No real routing, GPS, account or rate calls.
const {chromium}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const template=read('templates/index.html');
  const controls=['distanceUnit','currencyUnit','speedUnit','temperatureUnit'].map(id=>template.match(new RegExp('<select id="'+id+'"[\\s\\S]*?<\\/select>'))?.[0]).join('');
  if(!controls.includes('temperatureUnit'))throw Error('Production unit controls missing');
  for(const [width,height] of [[390,844],[844,390]]){
   const page=await browser.newPage({viewport:{width,height}});
   await page.route('https://restore-units.invalid/**',route=>route.fulfill({contentType:'text/html',body:controls+'<input id="end" value="Original destination"><div id="rows"></div><div id="avgSpeed" data-speed-kmh="100">100.0 km/h</div>'}));
   await page.goto('https://restore-units.invalid/');
   for(const name of ['modules/navigation/units.js','modules/navigation/speed-gps.js','modules/navigation/speed-limit-widget.js','modules/navigation/settings-snapshot.js','modules/navigation/route-selection.js','modules/navigation/route-sharing.js','modules/navigation/trip-history.js','app/units-preferences-orchestration.js','app/settings-orchestration.js','app/profile-store-orchestration.js'])await page.addScriptTag({content:read('static/js/'+name)});
   await page.evaluate(()=>{
    window.requests=[];window.widget=[];window.fetch=async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});return {ok:true}};
    const pref=VoyagrUnitsPreferencesOrchestration,settings=VoyagrSettingsOrchestration;
    pref.setDistanceUnitValue('km');pref.setSpeedUnitValue('kmh');
    pref.bind({units:()=>VoyagrUnits,speedGps:()=>VoyagrSpeedGps,speedLimitWidget:()=>VoyagrSpeedLimitWidget,getCurrentSpeedLimitMph:()=>null,getLastDetectedRoadType:()=> 'residential',getLastSpeedLimitRegion:()=> 'uk',getCurrentGpsSpeedMph:()=>30,call:{getCurrentRoadType:()=> 'residential',updateSpeedWidget:(speed,limit)=>widget.push({speed,limit}),saveAllSettings:()=>{},showStatus:()=>{}}});
    settings.bind({settingsSnapshot:()=>VoyagrSettingsSnapshot,getRouteInProgress:()=>false,setDistanceUnit:pref.setDistanceUnitValue,setCurrencyUnit:pref.setCurrencyUnitValue,setSpeedUnit:pref.setSpeedUnitValue,setTemperatureUnit:pref.setTemperatureUnitValue,call:{refreshUnitDisplays:pref.refreshUnitDisplays}});
    window.updateDistanceUnit=pref.updateDistanceUnit;window.updateCurrencyUnit=pref.updateCurrencyUnit;window.updateSpeedUnit=pref.updateSpeedUnit;window.updateTemperatureUnit=pref.updateTemperatureUnit;
    window.routeData={id:1,name:'Test',distance_km:16.09344,duration_minutes:20,fuel_cost:10,toll_cost:2,caz_cost:0,hazard_count:0};
    const fmt={distanceText:'16.09',distUnit:'km',currencySymbol:'£',routeColor:'#765432'};
    document.getElementById('rows').innerHTML=VoyagrRouteSelection.buildRouteComparisonCardHtml(routeData,0,fmt)+VoyagrRouteSharing.buildSavedRouteRowHtml(routeData,fmt);
    window.originalRoute=JSON.stringify(routeData);window.nodes=[...document.querySelectorAll('[data-distance-meters]')];
    const metric={unit_distance:'km',unit_speed:'kmh',unit_currency:'GBP',unit_temperature:'celsius'};
    const imperial={unit_distance:'mi',unit_speed:'mph',unit_currency:'USD',unit_temperature:'fahrenheit'};
    localStorage.setItem('voyagr_all_settings',JSON.stringify(metric));
    localStorage.setItem('voyagr_profiles_v1',JSON.stringify({guest:{voyagr_all_settings:JSON.stringify(metric),savedRoutes:'[]'},imperial:{voyagr_all_settings:JSON.stringify(imperial),savedRoutes:'[]'}}));
    VoyagrProfileStoreOrchestration.bind({getSupabaseClient:()=>null,call:{loadAllSettings:settings.loadAllSettings,applySettingsToUI:()=>{},loadSavedRoutes:()=>{}}});
    VoyagrProfileStoreOrchestration.switchActiveProfile('imperial');
   });
   const initial=await page.evaluate(()=>({labels:nodes.map(n=>n.textContent),speed:document.getElementById('avgSpeed').textContent,requests:requests.length}));
   if(initial.labels.some(t=>t!=='10.00 mi')||initial.speed!=='62.1 mph'||initial.requests!==0)throw Error(JSON.stringify(initial));
   const entry=read('static/js/app.js');const setup=entry.slice(entry.indexOf('function setupEventListeners()'),entry.indexOf('// Initialize app when DOM is ready'));
   await page.addScriptTag({content:setup+';setupEventListeners();'});
   await page.selectOption('#distanceUnit','km');
   const changed=await page.evaluate(()=>({labels:nodes.map(n=>n.textContent),requests}));
   if(changed.labels.some(t=>t!=='16.09 km')||changed.requests.length!==1||changed.requests[0].url!=='/api/app-settings')throw Error(JSON.stringify(changed));
   await page.evaluate(()=>VoyagrProfileStoreOrchestration.switchActiveProfile('guest'));
   const result=await page.evaluate(()=>({labels:nodes.map(n=>n.textContent),sameNodes:nodes.every(n=>n.isConnected),sameRoute:JSON.stringify(routeData)===originalRoute,end:document.getElementById('end').value,speed:document.getElementById('avgSpeed').textContent,widget}));
   if(!result.sameNodes||!result.sameRoute||result.end!=='Original destination'||result.speed!=='100.0 km/h'||result.widget.some(w=>w.limit!==null))throw Error(JSON.stringify(result));
   console.log(width+'x'+height+' profile round-trip, in-place refresh and single unit change passed');await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
