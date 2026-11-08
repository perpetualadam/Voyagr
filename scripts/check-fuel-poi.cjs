// Controlled Fuel button/browser check; no live provider or GPS calls.
const {chromium}=require('@playwright/test');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const [width,height] of [[390,844],[844,390]]){
  const page=await browser.newPage({viewport:{width,height}});
  await page.setContent('<button onclick="VoyagrPoiSearchOrchestration.quickSearch(\'fuel\')">Fuel</button><input id="start"><input id="end">');
  for(const path of ['static/js/modules/navigation/poi-search.js','static/js/app/poi-search-orchestration.js'])await page.addScriptTag({content:fs.readFileSync(require('path').join(__dirname,'..',path),'utf8')});
  await page.evaluate(()=>{
   window.calls=0;window.fetch=async()=>({ok:true,json:async()=>({success:true,results:[{type:'fuel',name:'Station <img>',lat:53.5,lon:-1.2,distance_m:100,opening_hours:'24/7',reported_fuels:['Diesel']}]})});
   VoyagrPoiSearchOrchestration.bind({poiSearch:()=>VoyagrPoiSearch,getCurrentLat:()=>53.5,getCurrentLon:()=>-1.2,call:{showStatus:()=>{},formatPoiDistance:()=> '100 m',calculateRoute:()=>window.calls++}});
   window.selectPOI=VoyagrPoiSearchOrchestration.selectPOI;window.closePOIModal=VoyagrPoiSearchOrchestration.closePOIModal;
  });
  await page.getByRole('button',{name:'Fuel',exact:true}).click();
  await page.getByRole('button',{name:'Plan route here'}).click();
  const state=await page.evaluate(()=>({calls:window.calls,end:document.getElementById('end').value,overflow:document.documentElement.scrollWidth>innerWidth}));
  if(state.calls!==1||state.end!=='53.5,-1.2'||state.overflow)throw Error(JSON.stringify(state));
  console.log(width+'x'+height+' Fuel selection passed');await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
