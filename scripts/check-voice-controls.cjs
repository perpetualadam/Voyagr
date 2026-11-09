// Production markup/controllers + real MediaRecorder with generated test audio.
// Browser speech, STT responses and synthesis are boundary fixtures, not accuracy tests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const template=read('templates/index.html');
const section=('<section class="voice-section"'+template.split('<section class="voice-section"')[1].split('</section>')[0]+'</section>').replace(/\{% if not voice_ai_available %\}[\s\S]*?\{% endif %\}/g,'');
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
for(const [width,height] of [[320,640],[390,844],[844,390],[1280,800]])for(const dark of [false,true]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});let uploads=0,commands=0;
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:`<html class="${dark?'dark-mode':''}"><meta charset="utf-8"><style>${read('static/css/voyagr.css')}html,body{height:auto;overflow:auto}main{max-width:640px;margin:auto;padding:12px}</style><main>${section}<button id="voiceFab" onclick="toggleVoiceInput()" aria-label="Map voice"></button></main></html>`});
  if(url.pathname==='/api/voice/transcribe'){
   uploads++;const bytes=route.request().postDataBuffer();assert(bytes.length>4&&bytes.length<1024*1024);assert.equal(bytes.subarray(0,4).toString('hex'),'1a45dfa3');assert.equal(route.request().headers()['x-voyagr-voice'],'1');
   return route.fulfill({json:{success:true,text:'find nearest parking'}});
  }
  if(url.pathname==='/api/voice/command'){commands++;return route.fulfill({json:{success:false,message:'Command received'}});}
  return route.abort();
 });
 await page.goto('https://voice-ui.invalid/');
 for(const file of ['static/js/modules/ui/voice-control.js','static/js/app/audio-recognition.js','static/js/app/voice-control-orchestration.js'])await page.addScriptTag({content:read(file)});
 await page.evaluate(()=>{
  window.contexts=[];window.testStreams=[];window.ttsCalls=0;
  Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{const ctx=new AudioContext(),osc=ctx.createOscillator(),dest=ctx.createMediaStreamDestination();osc.connect(dest);osc.start();contexts.push(ctx);testStreams.push(dest.stream);return dest.stream;}}});
  window.SpeechRecognition=class{constructor(){window.browserRecognition=this;}start(){this.onstart();}stop(){this.onend();}abort(){}};
  window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  Object.defineProperty(window,'speechSynthesis',{value:{cancel:()=>{},speak:u=>{ttsCalls++;u.onstart();u.onend();}}});
  window.VoyagrVoiceAIAvailable=true;
  VoyagrVoiceControlOrchestration.bind({voiceControl:()=>VoyagrVoiceControl,getCurrentLat:()=>53,getCurrentLon:()=>-1,getRouteInProgress:()=>false,call:{maybeResumePorcupineWakeAfterVoice:()=>{},stopPorcupineWakePipeline:async()=>{}}});
  window.toggleVoiceInput=()=>VoyagrVoiceControlOrchestration.toggleVoiceInput();window.speakText=text=>VoyagrVoiceControlOrchestration.speakText(text);
  VoyagrVoiceControlOrchestration.initVoiceRecognition();VoyagrVoiceControlOrchestration.setupVoiceCommandProcessing();
 });
 const listen=page.locator('#voiceBtn');await listen.focus();await page.keyboard.press('Enter');assert.equal(await listen.getAttribute('aria-pressed'),'true');assert(await page.locator('#voiceTestBtn').isDisabled());
 await page.evaluate(()=>browserRecognition.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'find nearest parking'}}]}));
 await page.getByRole('button',{name:'Stop',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('voiceBtn').disabled&&document.getElementById('voiceStatus').textContent==='Command received');assert.equal(commands,1);
 await page.getByRole('button',{name:'Test speech',exact:true}).click();assert.equal(await page.evaluate(()=>ttsCalls),2); // command acknowledgement + test
 await page.getByRole('combobox',{name:'Speech engine'}).selectOption('ai');assert.equal(await page.evaluate(()=>localStorage.getItem('voiceRecognitionProvider')),'ai');assert.equal(uploads,0);
 await listen.click();await page.waitForFunction(()=>VoyagrVoiceControlOrchestration.getVoiceRecognition().state==='recording');await page.waitForTimeout(150);await page.getByRole('button',{name:'Stop',exact:true}).click();
 await page.waitForFunction(()=>!document.getElementById('voiceBtn').disabled&&document.getElementById('voiceStatus').textContent==='Command received');assert.equal(uploads,1);assert.equal(commands,2);assert(await page.evaluate(()=>testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
 // Cancellation while recording releases tracks and does not send another clip.
 await listen.click();await page.waitForFunction(()=>VoyagrVoiceControlOrchestration.getVoiceRecognition().state==='recording');await page.evaluate(()=>VoyagrVoiceControlOrchestration.cancelVoiceInput());assert.equal(uploads,1);assert(await page.evaluate(()=>testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
 const examples=page.locator('.voice-examples summary');await examples.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.voice-examples').getAttribute('open'),'');
 const metrics=await page.evaluate(()=>{
  const buttons=[...document.querySelectorAll('.voice-controls button:not([hidden])')];
  const lum=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),rgb=s=>s.match(/[\d.]+/g).map(Number);
  return {overflow:document.documentElement.scrollWidth>innerWidth,buttons:buttons.map(b=>{const box=b.getBoundingClientRect(),s=getComputedStyle(b),fg=rgb(s.color),bg=rgb(s.backgroundColor);return {w:box.width,h:box.height,ratio:(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05)};})};
 });
 assert.equal(metrics.overflow,false);for(const b of metrics.buttons){assert(b.w>=44&&b.h>=44);assert(b.ratio>=4.5);}
 if(width===390)await page.locator('.voice-section').screenshot({path:`/tmp/voyagr-voice-${dark?'dark':'light'}.png`});
 await page.evaluate(()=>Promise.all(contexts.map(c=>c.close())));await page.close();console.log(`${width}x${height} ${dark?'dark':'light'}: keyboard, browser/AI recording, release/cancel, popups, contrast and layout passed`);
}
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1);});
