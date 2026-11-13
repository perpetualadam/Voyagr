// Real browser requests against the rendered privacy page. Google is intercepted;
// this verifies consent gating, not a live Google property's retention settings.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {spawnSync}=require('node:child_process');const {chromium}=require('playwright');
(async()=>{
 const temp=fs.mkdtempSync('/tmp/voyagr-privacy-check-');let browser,server;
 try{
  const render=spawnSync('.venv/bin/python',['-c',"from voyagr_web import app; from pathlib import Path; import sys; r=app.test_client().get('/privacy'); assert r.status_code==200; Path(sys.argv[1]).write_bytes(r.data)",path.join(temp,'privacy.html')],{cwd:path.join(__dirname,'..'),env:{...process.env,GOOGLE_ANALYTICS_MEASUREMENT_ID:'G-TEST123',GOOGLE_ANALYTICS_DISABLED:'0'},encoding:'utf8'});
  assert.equal(render.status,0,render.stderr);
  server=http.createServer((req,res)=>{
   res.setHeader('Content-Type',req.url.startsWith('/static/')?'application/javascript; charset=utf-8':'text/html; charset=utf-8');
   res.end(req.url.startsWith('/static/js/app/analytics-consent.js')?fs.readFileSync(path.join(__dirname,'../static/js/app/analytics-consent.js')):fs.readFileSync(path.join(temp,'privacy.html')));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  for(const width of [390,1280]){
   const context=await browser.newContext({viewport:{width,height:844}});const page=await context.newPage();const remote=[];
   await context.route('https://www.googletagmanager.com/**',route=>{remote.push(route.request().url());return route.fulfill({contentType:'application/javascript',body:"document.cookie='_ga=test-cookie; Path=/';"});});
   await page.goto('http://127.0.0.1:'+server.address().port+'/privacy?destination=private-sentinel#53.5,-1');
   assert.equal(remote.length,0);assert.equal(await page.evaluate(()=>document.cookie.includes('_ga')),false);
   await page.click('#analyticsAllow');await page.waitForFunction(()=>document.cookie.includes('_ga='));assert.equal(remote.length,1);
   const queue=await page.evaluate(()=>dataLayer.map(args=>Array.from(args)));assert.ok(!JSON.stringify(queue).includes('private-sentinel'));assert.ok(!JSON.stringify(queue).includes('53.5'));
   await Promise.all([page.waitForNavigation(),page.click('#analyticsDecline')]);
   assert.equal(remote.length,1);assert.equal(await page.evaluate(()=>document.cookie.includes('_ga')),false);
   await page.reload();assert.equal(remote.length,1);assert.match(await page.textContent('#analyticsConsentStatus'),/off/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   for(const selector of ['#analyticsAllow','#analyticsDecline'])assert.ok((await page.locator(selector).boundingBox()).height>=44);
   console.log(width+'px: no initial Google request, explicit allow, sanitised page view, withdrawal/reload and persistent decline passed');await context.close();
  }
 }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
