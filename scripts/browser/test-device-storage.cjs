'use strict';
// Real Chromium IndexedDB, synthetic records, loopback-only HTTP; never uses production.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
async function main(){
 const files={'/store.js':'static/js/modules/privacy/local-store.js','/local.js':'static/js/app/local-data.js'};
 const server=http.createServer((req,res)=>{res.setHeader('Cache-Control','no-store');if(files[req.url]){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.resolve(__dirname,'../..',files[req.url])));}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><p id="localDataStatus"></p><script src="/store.js"></script><script src="/local.js"></script>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BINARY||'/usr/bin/chromium',args:['--no-sandbox']});const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',()=>errors.push('pageerror'));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.VoyagrLocalData);
  const created=await page.evaluate(async()=>{const l=VoyagrLocalData;await l.ready();await l.update('routes',()=>[{id:'synthetic-route'}]);const clip=await l.db().createClip('guest','video/webm');await l.db().appendChunk('guest',clip.id,new Blob(['synthetic-media'],{type:'video/webm'}));await l.db().addPoint('guest',clip.id,{lat:53,lon:-1});await l.db().finishClip('guest',clip.id);return clip.id;});
  await page.reload();await context.setOffline(true);
  const result=await page.evaluate(async id=>{const l=VoyagrLocalData;await l.ready();const routes=await l.getRoutes(),blob=await l.db().clipBlob('guest',id);const off=await l.historyEnabled();l.switchOwner('sb:B');const b=await l.getRoutes();let denied=false;try{await l.db().clipBlob('sb:B',id);}catch(_){denied=true;}await l.db().deleteClip('guest',id);return{routes,text:await blob.text(),off,b,denied,remaining:(await l.db().listClips('guest')).length};},created);
  assert.deepEqual(result,{routes:[{id:'synthetic-route'}],text:'synthetic-media',off:false,b:[],denied:true,remaining:0});assert.deepEqual(errors,[]);
  await context.close();console.log('PASS: Chromium IndexedDB survives reload; offline reads, owner isolation, history OFF, media/metadata deletion. Synthetic media; no camera/mobile capture claim.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(()=>{console.error('FAIL: isolated browser device-storage verification');process.exitCode=1;});
