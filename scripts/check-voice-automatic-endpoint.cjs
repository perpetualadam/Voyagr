// Real Chromium audio graph; controlled tones test endpointing, not speech accuracy.
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
(async () => {
 const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Voice endpoint check</title>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try {
 browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.addScriptTag({path:path.resolve('static/js/app/audio-recognition.js')});
  const result = await page.evaluate(async () => {
   const input = new AudioContext();
   const oscillator = input.createOscillator(), gain = input.createGain();
   const output = input.createMediaStreamDestination();
   oscillator.connect(gain);gain.connect(output);gain.gain.value=0;oscillator.start();
   Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>output.stream},configurable:true});
   let uploads=0,transcript='';
   window.fetch=async()=>{uploads++;return {ok:true,json:async()=>({success:true,text:'find nearest parking'})};};
   const r=new VoyagrAudioRecognition.AudioRecognition();
   r.onresult=event=>{transcript=event.results[0][0].transcript;};
   await input.resume();await r.start();
   const analysis=r.endpointContext;
   gain.gain.value=0.12;
   await new Promise(resolve=>setTimeout(resolve,650));
   gain.gain.value=0;
   const started=performance.now();
   while(r.state!=='idle' && performance.now()-started<5000)await new Promise(resolve=>setTimeout(resolve,50));
   const result={uploads,transcript,state:r.state,track:output.stream.getTracks()[0].readyState,analysis:analysis.state,elapsed:performance.now()-started};
   r.abort();oscillator.stop();await input.close();return result;
  });
  assert.equal(result.uploads,1);assert.equal(result.transcript,'find nearest parking');
  assert.equal(result.state,'idle');assert.equal(result.track,'ended');assert.equal(result.analysis,'closed');
  assert.ok(result.elapsed<5000);console.log('PASS real Chromium analyser, automatic submission and cleanup:',result);
 } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
