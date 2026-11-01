'use strict';
/** Real Chromium, loopback-only fixtures; never attaches to a production browser. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const sourcePath=require.resolve(process.env.PLANNING_PROBE_SOURCE||'./planning-commit-diagnostic.cjs');
const {install}=require(sourcePath);
const {CASES,exerciseCase}=require('../../static/js/__tests__/fixtures/planning-probe-properties.cjs');
async function main(){
    const server=http.createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end('<html><body><div id="status"></div><div id="journeyModeStatus"></div></body></html>');});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let browser;const results=[];
    try{
        browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_BINARY?{executablePath:process.env.CHROMIUM_BINARY}:{})});
        for(const name of CASES){
            const context=await browser.newContext();
            try{
                const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
                await page.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,'../../static/vendor/maplibre-gl.js'),'utf8')});
                results.push(await page.evaluate(exerciseCase,{name,source:install.toString()}));
            }catch(_){results.push({name,passed:false});} // Never print arbitrary browser exceptions.
            finally{await context.close();}
        }
    }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
    console.log(JSON.stringify({source_sha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'),browser:'Chromium with bundled MapLibre prototype',passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results},null,2));
    if(results.some(r=>!r.passed))process.exitCode=1;
}
main().catch(()=>{console.error('Isolated Chromium diagnostic tests could not complete.');process.exitCode=1;});
