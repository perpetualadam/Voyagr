// Real cached-worker restart and native Basic login; synthetic loopback fixtures only.
'use strict';
// Playwright needs worker network inspection to supply fixture Basic credentials.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS='1';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'voyagr-private-access-'));
 const markup=read('templates/index.html').match(/<section id="privateAccessNotice"[\s\S]*?<\/section>/)[0];
 const shell='<!doctype html><html data-personal-mode="true"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="mapLoadingOverlay">Loading map…</div>'+markup+'<button id="fixtureStop">Stop</button><div id="journeySummaryModal" style="display:none"><button id="fixtureDone">Done</button></div><script>window.fixtureActive=false;window.VoyagrNavigationLifecycleOrchestration={getRouteInProgress:()=>window.fixtureActive};document.getElementById("fixtureStop").onclick=()=>{window.fixtureActive=false;window.dispatchEvent(new Event("voyagr:journey-state-change"));document.getElementById("journeySummaryModal").style.display="block";};document.getElementById("fixtureDone").onclick=()=>{document.getElementById("journeySummaryModal").style.display="none";};</script><script src="/access.js"></script><script>navigator.serviceWorker.register("/worker.js")</script></body></html>';
 const worker=`self.addEventListener('install',e=>e.waitUntil(caches.open('fixture').then(c=>c.addAll(['/','/style.css','/access.js']))));self.addEventListener('activate',e=>e.waitUntil(clients.claim()));self.addEventListener('fetch',e=>{const p=new URL(e.request.url).pathname;if(p==='/')e.respondWith(fetch(e.request).then(r=>{if(!r.ok)throw Error('denied');return r}).catch(()=>caches.match('/')));else if(p==='/access.js'||p==='/style.css')e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));else e.respondWith(fetch(e.request));});`;
 let locked=false,context;
 const credentials='Basic '+Buffer.from('owner:synthetic-password').toString('base64');
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://fixture');res.setHeader('Cache-Control','no-store');
  if(locked&&req.headers.authorization!==credentials){
   const background=['cors','no-cors','same-origin'].includes(req.headers['sec-fetch-mode']);
   res.statusCode=background?403:401;if(!background)res.setHeader('WWW-Authenticate','Basic realm="Voyagr private"');res.end('Private');return;
  }
  if(url.pathname==='/worker.js'){res.setHeader('Content-Type','text/javascript');res.end(worker);}
  else if(url.pathname==='/access.js'){res.setHeader('Content-Type','text/javascript');res.end(read('static/js/app/private-access.js'));}
  else if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');res.end(read('static/css/voyagr.css'));}
  else if(url.pathname==='/api/config'){res.setHeader('Content-Type','application/json');res.end('{"success":true,"personal_mode":true}');}
  else if(url.pathname==='/privacy'){res.setHeader('Content-Type','text/html');res.end('<a href="/">Return to Voyagr</a>');}
  else {res.setHeader('Content-Type','text/html');res.end(shell);}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const launch=()=>chromium.launchPersistentContext(profile,{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,viewport:{width:390,height:844},args:['--no-sandbox']});
 try{
  context=await launch();let page=await context.newPage();await page.goto(origin);
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
  await page.evaluate(()=>localStorage.setItem('retained-device-fixture','keep'));
  await context.close();context=null;locked=true;
  context=await launch();page=await context.newPage();await page.goto(origin);
  await page.locator('#privateAccessNotice').waitFor({state:'visible'});
  assert.equal(new URL(page.url()).pathname,'/','Must not automatically navigate');
  assert.equal(await page.locator('#mapLoadingOverlay').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.activeElement===document.body),true);
  console.log('PASS: cached worker restart exposes unlock action instead of loading map; no redirect or focus theft');
  for(const width of [320,390,844])for(const scale of [1,2]){
   await page.setViewportSize({width,height:844});await page.evaluate(s=>document.documentElement.style.fontSize=16*s+'px',scale);
   const box=await page.locator('#privateAccessNotice').boundingBox();
   assert.ok(box.x>=0&&box.x+box.width<=width&&box.y+box.height<=844);
   assert.equal(await page.locator('#privateAccessNotice').evaluate(e=>e.scrollWidth>e.clientWidth),false);
   assert.ok((await page.locator('#privateAccessNotice a').boundingBox()).height>=44);
  }
  console.log('PASS: unlock card fits three handset widths and 200% text with a usable touch target');
  await page.evaluate(()=>{window.fixtureActive=true;window.dispatchEvent(new Event('voyagr:journey-state-change'));});
  await page.locator('#privateAccessNotice').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#privateAccessNotice').isVisible(),false);
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.locator('#privateAccessNotice').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>localStorage.getItem('retained-device-fixture')),'keep');
  console.log('PASS: deferred authentication card leaves Stop and Done usable and appears only after summary dismissal');
  await context.setHTTPCredentials({username:'owner',password:'synthetic-password'});
  await page.locator('#privateAccessNotice a').click();await page.waitForURL(u=>u.pathname==='/privacy'&&u.searchParams.has('private-login'),{waitUntil:'domcontentloaded',timeout:10000});
  await page.getByText('Return to Voyagr').click();await page.waitForURL(origin+'/');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#privateAccessNotice').isVisible(),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('retained-device-fixture')),'keep');
  const status=await page.evaluate(async()=> (await fetch('/api/config',{cache:'no-store'})).status);assert.equal(status,200);
  console.log('PASS: explicit fresh navigation completes Basic login; app requests recover and saved device marker survives');
 }finally{if(context)await context.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
