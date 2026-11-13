// Real Chromium capture and production controls. Fake media hardware and TTS
// boundary fixtures do not establish physical Bluetooth routing or audibility.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
(async()=>{
 const section=read('templates/index.html').match(/<section aria-labelledby="audioDeviceTitle"[\s\S]*?<\/section>/)[0];
 const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+read('static/css/voyagr.css')+'body{display:block;padding:12px}main{max-width:600px;margin:auto}</style><main>'+section+'</main>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  for(const [width,height]of [[390,844],[844,390]]){
   const context=await browser.newContext({viewport:{width,height},permissions:['microphone']});const page=await context.newPage();
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.evaluate(()=>{
    const real=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.captures=[];
    navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await real(constraints);captures.push({constraints,stream});return stream;};
    window.SpeechSynthesisUtterance=function(text){this.text=text;};
    window.spoken=[];Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{name:'UK',lang:'en-GB'}],resume(){},speak(u){spoken.push(u.text);queueMicrotask(()=>u.onend?.());},addEventListener(){}}});
   });
   for(const file of ['modules/navigation/voice-announcements.js','modules/navigation/speech-synthesis.js','app/voice-announcements-orchestration.js','app/audio-device-controls.js','app/audio-recognition.js'])await page.addScriptTag({content:read('static/js/'+file)});
   await page.evaluate(()=>VoyagrVoiceAnnouncementsOrchestration.bind({voiceAnnouncements:()=>VoyagrVoiceAnnouncements}));
   assert.equal(await page.evaluate(()=>captures.length),0);
   await page.click('#audioDeviceCheck');await page.waitForFunction(()=>!document.querySelector('#audioInputDevice').disabled);
   const id=await page.locator('#audioInputDevice option').evaluateAll(options=>options.find(o=>o.value && o.value!=='communications')?.value);
   assert.ok(id,'Browser exposed no selectable microphone');await page.selectOption('#audioInputDevice',id);
   const recording=await page.evaluate(async()=>{
    const r=new VoyagrAudioRecognition.AudioRecognition();await r.start();
    const capture=captures.at(-1);const settings=capture.stream.getAudioTracks()[0].getSettings();r.abort();
    return {selected:VoyagrAudioDevices.getInputDeviceId(),actual:settings.deviceId,requested:capture.constraints.audio.deviceId.exact,states:captures.flatMap(c=>c.stream.getTracks().map(t=>t.readyState))};
   });
   assert.equal(recording.actual,id);assert.equal(recording.requested,id);assert.ok(recording.states.every(state=>state==='ended'));
   await page.click('#audioDeviceTest');assert.match(await page.evaluate(()=>spoken.at(-1)),/^Voyagr audio test/);
   for(const theme of ['light','dark']){
    await page.evaluate(dark=>document.documentElement.classList.toggle('dark-mode',dark),theme==='dark');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    for(const selector of ['#audioDeviceCheck','#audioDeviceTest','#audioInputDevice']){
     const box=await page.locator(selector).boundingBox();assert.ok(box.height>=44,selector+' touch target');
    }
   }
   await page.screenshot({path:'/tmp/voyagr-car-headphone-'+width+'.png',fullPage:true});
   console.log(width+'x'+height+': real microphone selection/capture/release, direction test path, light/dark layout passed');await context.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
