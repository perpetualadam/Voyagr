// Production camping controls and POI owners; synthetic providers and no live GPS.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const kinds=['camping','motorhome','drinking_water','toilets','showers','waste_disposal','laundry'];
 const template=read('templates/index.html');
 const controls=template.match(/<details class="camping-poi-search">[\s\S]*?<\/details>/)[0];
 const along=kinds.map(kind=>template.match(new RegExp('<button[^>]+onclick="searchAlongRouteByType\\(\\\''+kind+'\\\'\\)"[\\s\\S]*?<\\/button>'))[0]).join('');
 try{for(const [width,height] of [[320,640],[390,844],[844,390]]){
  const page=await browser.newPage({viewport:{width,height}});
  await page.setContent('<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+read('static/css/voyagr.css')+'body{display:block;padding:8px;overflow:auto}</style>'+controls+along+'<input id="start"><input id="end">');
  for(const name of ['modules/navigation/poi-search.js','app/poi-search-orchestration.js'])await page.addScriptTag({content:read('static/js/'+name)});
  await page.evaluate(()=>{
   window.calls=0;window.requests=[];window.mode='data';window.route=[[53.5,-1.2],[53.5,-1.18]];
   window.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);requests.push({url,body});return {ok:mode!=='failure',json:async()=>({success:true,type:body.type,source:'Overpass',results:mode==='empty'?[]:[{type:body.type,name:'Mapped place <img>',lat:53.5,lon:-1.19,distance_m:100,camping_kind_label:'Mapped service',reported_details:[{label:'Height restriction',value:'2.1 m'},{label:'Seasonal',value:'<script>bad</script>'}]}],search_context:{coverage:'SAMPLED_CANDIDATES_ONLY',distance_kind:'STRAIGHT_LINE_TO_ROUTE'}})}};
   VoyagrPoiSearchOrchestration.bind({poiSearch:()=>VoyagrPoiSearch,getCurrentLat:()=>53.5,getCurrentLon:()=>-1.2,getRoutePolyline:()=>route,call:{showStatus:()=>{},formatPoiDistance:()=> '100 m',calculateRoute:()=>calls++}});
   window.quickSearch=VoyagrPoiSearchOrchestration.quickSearch;window.searchAlongRouteByType=VoyagrPoiSearchOrchestration.searchAlongRouteByType;window.selectPOI=VoyagrPoiSearchOrchestration.selectPOI;window.closePOIModal=VoyagrPoiSearchOrchestration.closePOIModal;
  });
  await page.locator('details > summary').click();
  for(const kind of kinds){
   await page.locator('[onclick="quickSearch(\''+kind+'\')"]').click();
   assert.equal(await page.locator('#poiModal img,#poiModal script').count(),0);
   assert.ok((await page.locator('#poiModal').innerText()).includes('Parking alone does not grant permission'));
   await page.locator('#poiModal details summary').click();
   assert.ok((await page.locator('#poiModal').innerText()).includes('2.1 m'));
   await page.getByRole('button',{name:'Plan route here',exact:true}).click();
   assert.equal(await page.locator('#end').inputValue(),'53.5,-1.19');
   await page.locator('[onclick="searchAlongRouteByType(\''+kind+'\')"]').click();
   assert.ok((await page.locator('#poiModal').innerText()).includes('not driving detours'));
   await page.getByRole('button',{name:'Plan route here',exact:true}).click();
  }
  assert.equal(await page.evaluate(()=>calls),14);
  assert.equal(await page.evaluate(()=>requests.filter(r=>r.url==='/api/poi-along-route'&&r.body.route_points.length===2).length),7);
  await page.evaluate(()=>mode='empty');await page.locator('[onclick="quickSearch(\'camping\')"]').click();
  assert.ok((await page.locator('#poiModal').innerText()).includes('No mapped candidates returned'));
  await page.locator('#poiModal button[onclick="closePOIModal()"]').click();
  await page.evaluate(()=>mode='failure');await page.locator('[onclick="quickSearch(\'camping\')"]').click();
  assert.equal(await page.locator('#poiModal').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log(width+'x'+height+': seven nearby/along-route categories, facilities, planning, escaped text and empty/failure passed');
  await page.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
