const VC=require('../modules/ui/voice-control');
let owner,recognition,hidden,listeners;
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
beforeEach(()=>{
 jest.resetModules();localStorage.clear();delete window.__voyagrVoiceInitialized;hidden=false;listeners=[];
 Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
 document.body.innerHTML='<button id="voiceBtn"><span id="voiceBtnText"></span></button><button id="voiceFab"></button><button id="voiceTestBtn"></button><button id="voiceCancelBtn" hidden></button><div id="voiceStatus"></div><div id="voiceTranscript"></div><input id="end"><select id="voiceRecognitionProvider"><option value="browser">Browser</option><option value="ai">AI</option></select>';
 const register=(target)=>{const original=target.addEventListener.bind(target);jest.spyOn(target,'addEventListener').mockImplementation((name,fn,...rest)=>{listeners.push([target,name,fn]);return original(name,fn,...rest);});};register(window);register(document);
 window.SpeechRecognition=class{constructor(){recognition=this;this.start=jest.fn(()=>this.onstart());this.stop=jest.fn(()=>this.onend());this.abort=jest.fn();}};
 global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({success:false,message:'No matching command'})});
 jest.spyOn(console,'log').mockImplementation(()=>{});
 owner=require('../app/voice-control-orchestration');owner.bind({voiceControl:()=>VC,getCurrentLat:()=>53,getCurrentLon:()=>-1,getRouteInProgress:()=>false,call:{maybeResumePorcupineWakeAfterVoice:jest.fn(),stopPorcupineWakePipeline:jest.fn(),calculateRoute:jest.fn(),showStatus:jest.fn()}});
});
afterEach(()=>{for(const [target,name,fn] of listeners)target.removeEventListener(name,fn);jest.restoreAllMocks();delete window.SpeechRecognition;delete window.VoyagrAudioRecognition;delete window.VoyagrVoiceAIAvailable;delete window.VoyagrPorcupineOrchestration;delete global.fetch;});
const result=(text,final=true)=>recognition.onresult({resultIndex:0,results:[{isFinal:final,0:{transcript:text}}]});
test('browser speech works without Picovoice, uses UK English and processes once despite repeated setup/end',async()=>{
 owner.initVoiceRecognition();owner.setupVoiceCommandProcessing();owner.setupVoiceCommandProcessing();
 expect(recognition.lang).toBe('en-GB');await owner.toggleVoiceInput();result('find nearest parking');recognition.onend();recognition.onend();await settle();
 expect(fetch).toHaveBeenCalledTimes(1);expect(JSON.parse(fetch.mock.calls[0][1].body).command).toBe('find nearest parking');
 expect(document.getElementById('voiceBtn').getAttribute('aria-pressed')).toBe('false');
});
test('microphone error is preserved and interim text is never executed',async()=>{
 owner.initVoiceRecognition();await owner.toggleVoiceInput();result('navigate to somewhere',false);
 recognition.onerror({error:'not-allowed'});recognition.onend();await settle();expect(fetch).not.toHaveBeenCalled();expect(document.getElementById('voiceStatus').textContent).toContain('Microphone blocked');
});
test('an interim-only successful end is not an actionable command',async()=>{
 owner.initVoiceRecognition();await owner.toggleVoiceInput();result('navigate to somewhere',false);recognition.onend();await settle();expect(fetch).not.toHaveBeenCalled();
});
test('start failure resets listening UI and is caught',async()=>{
 owner.initVoiceRecognition();recognition.start.mockImplementation(()=>{throw Error('InvalidState');});await owner.toggleVoiceInput();
 expect(owner.getIsListening()).toBe(false);expect(document.getElementById('voiceBtn').getAttribute('aria-pressed')).toBe('false');expect(document.getElementById('voiceStatus').textContent).toContain('Could not start');
});
test('provider change invalidates old callbacks and does not silently pick another provider',async()=>{
 owner.initVoiceRecognition();await owner.toggleVoiceInput();const old=recognition;owner.changeProvider('ai');
 expect(old.abort).toHaveBeenCalled();old.onresult({results:[{isFinal:true,0:{transcript:'reroute'}}]});old.onend();await settle();
 expect(fetch).not.toHaveBeenCalled();expect(owner.getVoiceRecognition()).toBeNull();expect(document.getElementById('voiceStatus').textContent).toContain('AI speech is unavailable');
});
test.each(['cancel','hide','provider'])('%s while command is pending prevents late destination/route actions',async action=>{
 const pending=deferred();fetch.mockReturnValue(pending.promise);owner.initVoiceRecognition();await owner.toggleVoiceInput();result('navigate to Sheffield');recognition.onend();
 if(action==='cancel')owner.cancelVoiceInput();if(action==='hide'){hidden=true;document.dispatchEvent(new Event('visibilitychange'));}if(action==='provider')owner.changeProvider('browser');
 recognition.onstart();if(action!=='provider')expect(document.getElementById('voiceBtn').getAttribute('aria-pressed')).toBe('false');
 pending.resolve({ok:true,json:async()=>({success:true,action:'navigate',location:'Sheffield',message:'Routing'})});await settle();expect(document.getElementById('end').value).toBe('');
});
test('cancellation during wake handoff prevents microphone acquisition',async()=>{
 const pending=deferred();window.VoyagrPorcupineOrchestration={isPipelineRunning:()=>true,setResumeAfterVoice:jest.fn()};
 owner.bind({voiceControl:()=>VC,call:{stopPorcupineWakePipeline:()=>pending.promise,maybeResumePorcupineWakeAfterVoice:jest.fn()}});
 owner.initVoiceRecognition();const start=owner.toggleVoiceInput();await owner.toggleVoiceInput();pending.resolve();await start;expect(recognition.start).not.toHaveBeenCalled();
});
test('a rapid second tap cancels the pending start instead of starting twice',async()=>{
 owner.initVoiceRecognition();const first=owner.toggleVoiceInput();await owner.toggleVoiceInput();await first;
 expect(recognition.start).toHaveBeenCalledTimes(1);expect(recognition.abort).toHaveBeenCalledTimes(1);expect(owner.getIsListening()).toBe(false);
});
