// Controlled Charging button/browser check; no live provider or GPS calls.
const {chromium}=require('@playwright/test');
const fs=require('fs');
const path=require('path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const button=read('templates/index.html').match(/<button[^>]+onclick="quickSearch\('charging'\)"[\s\S]*?<\/button>/)?.[0];
  if(!button)throw Error('Production Charging button missing');
  for(const [width,height] of [[390,844],[844,390]]){
   const page=await browser.newPage({viewport:{width,height}});
   await page.setContent('<style>svg{width:24px;height:24px}</style>'+button+'<input id="start"><input id="end">');
   for(const name of ['static/js/modules/navigation/poi-search.js','static/js/app/poi-search-orchestration.js'])await page.addScriptTag({content:read(name)});
   await page.evaluate(()=>{
    window.calls=0;window.mode='data';window.fetch=async()=>({ok:mode!=='failure',json:async()=>({success:true,results:mode==='empty'?[]:[{type:'charging',name:'Charger <img>',lat:53.5,lon:-1.2,distance_m:100,opening_hours:'24/7',operator:'Operator',reported_connectors:[{type:'type2_combo',count:'2',output:'150 kW'}]}]})});
    VoyagrPoiSearchOrchestration.bind({poiSearch:()=>VoyagrPoiSearch,getCurrentLat:()=>53.5,getCurrentLon:()=>-1.2,call:{showStatus:()=>{},formatPoiDistance:()=> '100 m',calculateRoute:()=>window.calls++}});
    window.quickSearch=VoyagrPoiSearchOrchestration.quickSearch;window.selectPOI=VoyagrPoiSearchOrchestration.selectPOI;window.closePOIModal=VoyagrPoiSearchOrchestration.closePOIModal;
   });
   await page.getByRole('button',{name:'EV Charge',exact:true}).click();
   if(await page.locator('#poiModal img').count())throw Error('Unescaped provider markup');
   if(!(await page.locator('#poiModal').innerText()).includes('Reported connector: CCS2'))throw Error('Missing reported facts');
   await page.getByRole('button',{name:'Plan route here'}).click();
   const state=await page.evaluate(()=>({calls:window.calls,end:document.getElementById('end').value,overflow:document.documentElement.scrollWidth>innerWidth}));
   if(state.calls!==1||state.end!=='53.5,-1.2'||state.overflow)throw Error(JSON.stringify(state));
   await page.evaluate(()=>window.mode='empty');await page.getByRole('button',{name:'EV Charge',exact:true}).click();
   if(!(await page.locator('#poiModal').innerText()).includes('Coverage may be incomplete'))throw Error('Unqualified empty state');
   await page.locator('#poiModal button[onclick="closePOIModal()"]').click();
   await page.evaluate(()=>window.mode='failure');await page.getByRole('button',{name:'EV Charge',exact:true}).click();
   if(await page.locator('#poiModal').count())throw Error('Stale Charging modal');
   console.log(width+'x'+height+' Charging selection/empty/error passed');await page.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
