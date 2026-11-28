const {chromium}=require('playwright');
(async()=>{
const origin=process.argv[2],browser=await chromium.launch({...(process.env.CHROMIUM_BINARY?{executablePath:process.env.CHROMIUM_BINARY}:{}),args:['--no-sandbox'],headless:true});
const context=await browser.newContext(process.env.BLOCK_WORKER?{serviceWorkers:'block'}:{});const diagnostics=[];
try{
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
await context.addInitScript(()=>{let release;Object.defineProperty(window,'VoyagrAssetRelease',{configurable:true,get:()=>release,set(value){release=value;const enter=value.enter,complete=value.complete;let last=-1;value.enter=function(r,i){const ok=enter.call(this,r,i);if(!ok&&!window.__chainFailure)window.__chainFailure={incoming:i,last};return ok;};value.complete=function(r,i){complete.call(this,r,i);last=i;window.__chainLast=i;};}});});
context.on('requestfailed',r=>{if(new URL(r.url()).pathname.startsWith('/_voyagr/assets/'))diagnostics.push({asset:new URL(r.url()).pathname.split('/').pop(),error:r.failure().errorText});});
for(let i=0;i<Number(process.env.PROBE_TABS||20);i++){
 const page=await context.newPage();await page.goto(origin,{waitUntil:'domcontentloaded'});
 const state=await page.evaluate(()=>({failure:window.__chainFailure,last:window.__chainLast,error:!!document.getElementById('voyagr-asset-error'),expected:JSON.parse(document.getElementById('voyagr-asset-manifest').textContent).assets.filter(a=>a.source.endsWith('.js')&&!a.module).length-1}));
 console.log(JSON.stringify({tab:i,...state}));if(state.error||state.last!==state.expected)throw Error('Asset chain refused');
 if(i===0&&!process.env.BLOCK_WORKER)await page.evaluate(async()=>{await navigator.serviceWorker.register('/service-worker.js');await navigator.serviceWorker.ready;});
 if(i>0)await page.close();
}
console.log(JSON.stringify({status:process.env.BLOCK_WORKER?'DIAGNOSTIC_COMPARISON_ONLY':'PASS_ASSET_CHAIN_PROBE',tabs:Number(process.env.PROBE_TABS||20),production_verified:false}));
}finally{console.log(JSON.stringify({diagnostics}));await context.close();await browser.close();}
})().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
