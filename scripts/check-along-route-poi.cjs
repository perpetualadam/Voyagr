// Controlled along-route button checks; no live providers, GPS or WebGL.
const {chromium}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const button=read('templates/index.html').match(/<button[^>]+onclick="searchAlongRouteByType\('fuel'\)"[\s\S]*?<\/button>/)[0];
  for(const [width,height] of [[390,844],[844,390]]){
   const page=await browser.newPage({viewport:{width,height}});
   await page.setContent('<meta charset="utf-8"><style>'+read('static/css/voyagr.css')+'body{display:block;padding:10px}</style>'+button+'<input id="start"><input id="end">');
   for(const name of ['modules/navigation/units.js','modules/navigation/poi-search.js','app/poi-search-orchestration.js','app/navigation-lifecycle-orchestration.js'])await page.addScriptTag({content:read('static/js/'+name)});
   await page.evaluate(()=>{
    window.route=[[53.5,-1.2],[53.5,-1.18]];window.mode='data';window.calls=0;window.requests=[];
    window.fetch=async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:mode!=='error',json:async()=>({success:true,type:'fuel',source:'Overpass',results:mode==='empty'?[]:[{type:'fuel',name:'Station <img>',lat:53.5002,lon:-1.19,distance_m:22,distance_kind:'STRAIGHT_LINE_TO_ROUTE'}],search_context:{coverage:'SAMPLED_CANDIDATES_ONLY',distance_kind:'STRAIGHT_LINE_TO_ROUTE'}})}};
    VoyagrPoiSearchOrchestration.bind({poiSearch:()=>VoyagrPoiSearch,getRoutePolyline:()=>route,getCurrentLat:()=>null,getCurrentLon:()=>null,call:{showStatus:()=>{},calculateRoute:()=>calls++,formatPoiDistance:m=>VoyagrUnits.formatPoiDistanceMeters(m,'mi')}});
    window.searchAlongRouteByType=VoyagrPoiSearchOrchestration.searchAlongRouteByType;window.selectPOI=VoyagrPoiSearchOrchestration.selectPOI;window.closePOIModal=VoyagrPoiSearchOrchestration.closePOIModal;
   });
   const search=page.locator('[onclick="searchAlongRouteByType(\'fuel\')"]');await search.click();
   if(await page.locator('#poiModal img').count())throw Error('Unescaped provider text');
   const text=await page.locator('#poiModal').innerText();
   if(!text.includes('not driving detours')||!text.includes('does not add a stop'))throw Error('Missing route context');
   await page.getByRole('button',{name:'Plan route here',exact:true}).click();
   const selected=await page.evaluate(()=>({start:document.getElementById('start').value,end:document.getElementById('end').value,calls}));
   if(selected.start!=='53.5,-1.2'||selected.end!=='53.5002,-1.19'||selected.calls!==1)throw Error(JSON.stringify(selected));
   await search.click();await page.evaluate(()=>route=[[54,-2],[54.1,-2]]);await page.getByRole('button',{name:'Plan route here',exact:true}).click();
   if(await page.evaluate(()=>calls)!==1||await page.locator('#poiModal').count())throw Error('Stale route selectable');
   await search.click();await page.evaluate(()=>{route=[[55,-3],[55.1,-3]];VoyagrNavigationLifecycleOrchestration.setRoutePolyline(route);});
   if(await page.locator('#poiModal').count())throw Error('Route setter retained old results');
   await page.evaluate(()=>mode='empty');await search.click();
   if(!(await page.locator('#poiModal').innerText()).includes('Coverage may be incomplete'))throw Error('Unqualified empty');
   await page.locator('#poiModal button[onclick="closePOIModal()"]').click();await page.evaluate(()=>mode='error');await search.click();
   if(await page.locator('#poiModal').count())throw Error('Stale modal after failure');
   console.log(width+'x'+height+' along-route selection, stale-route refusal, empty/error passed');await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
