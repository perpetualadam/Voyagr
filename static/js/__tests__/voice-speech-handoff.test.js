const PW=require('../modules/navigation/porcupine-wake');
const VA=require('../modules/navigation/voice-announcements');
const VC=require('../modules/ui/voice-control');
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
let wake,announcements,control,detection,hidden,listeners,utterances,worker;
beforeEach(()=>{
 jest.resetModules();localStorage.clear();hidden=false;listeners=[];utterances=[];
 Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
 for(const target of [window,document]){
  const add=target.addEventListener.bind(target);
  jest.spyOn(target,'addEventListener').mockImplementation((name,fn,...rest)=>{listeners.push([target,name,fn]);return add(name,fn,...rest);});
 }
 localStorage.setItem(PW.VOYAGR_PORCUPINE_WAKE_STORAGE_KEY,'true');
 global.VoyagrPicovoiceWebAssetsOk=true;global.PICOVOICE_ACCESS_KEY='test-key';
 worker={frameLength:512,sampleRate:16000,release:jest.fn().mockResolvedValue(),terminate:jest.fn(),process:jest.fn()};
 global.PorcupineWeb={BuiltInKeyword:{Porcupine:'Porcupine'},PorcupineWorker:{create:jest.fn(async(_key,_keywords,cb)=>{detection=cb;return worker;})}};
 global.WebVoiceProcessor={setOptions:jest.fn(),subscribe:jest.fn().mockResolvedValue(),unsubscribe:jest.fn().mockResolvedValue()};
 global.SpeechSynthesisUtterance=function(text){this.text=text;};
 global.speechSynthesis={cancel:jest.fn(),resume:jest.fn(),getVoices:()=>[{name:'UK',lang:'en-GB'}],speak:jest.fn(u=>utterances.push(u)),addEventListener:jest.fn()};
 global.VoyagrSpeechSynthesis=require('../modules/navigation/speech-synthesis');
 global.SpeechRecognition=class{constructor(){this.start=jest.fn();this.abort=jest.fn();}};
 delete window.__voyagrVoiceInitialized;
 document.body.innerHTML='<button id="voiceBtn"></button><button id="voiceFab"></button><div id="voiceStatus"></div><div id="voiceTranscript"></div>';
 wake=require('../app/porcupine-orchestration');
 control=require('../app/voice-control-orchestration');
 control.bind({voiceControl:()=>VC,call:{maybeResumePorcupineWakeAfterVoice:()=>wake.maybeResumePorcupineWakeAfterVoice(),stopPorcupineWakePipeline:()=>wake.stopPorcupineWakePipeline()}});
 wake.bind({porcupineWake:()=>PW,getIsListening:()=>control.getIsListening(),showStatus:jest.fn()});
 announcements=require('../app/voice-announcements-orchestration');
 announcements.bind({voiceAnnouncements:()=>VA});
 jest.spyOn(console,'log').mockImplementation(()=>{});jest.spyOn(console,'info').mockImplementation(()=>{});
});
afterEach(()=>{
 for(const [target,name,fn]of listeners)target.removeEventListener(name,fn);
 jest.restoreAllMocks();
 for(const key of ['VoyagrPorcupineOrchestration','VoyagrVoiceControlOrchestration','VoyagrVoiceAnnouncementsOrchestration','VoyagrSpeechSynthesis','speechSynthesis','SpeechSynthesisUtterance','SpeechRecognition','PorcupineWeb','WebVoiceProcessor','VoyagrPicovoiceWebAssetsOk','PICOVOICE_ACCESS_KEY'])delete global[key];
});
test.each(['onend','onerror'])('navigation speech pauses wake detection until %s',async event=>{
 await wake.startPorcupineWakePipeline();expect(wake.isPipelineRunning()).toBe(true);
 announcements.speakMessage('Turn left','high');await settle();
 expect(wake.isPipelineRunning()).toBe(false);expect(worker.release).toHaveBeenCalled();
 wake.maybeResumePorcupineWakeAfterVoice();await settle();expect(PorcupineWeb.PorcupineWorker.create).toHaveBeenCalledTimes(1);
 utterances[0][event]({error:'synthesis-failed'});await settle();expect(wake.isPipelineRunning()).toBe(true);
});
test('overlapping queued speech holds wake until all utterances finish',async()=>{
 await wake.startPorcupineWakePipeline();announcements.speakMessage('First','high');announcements.speakMessage('Second','high');await settle();
 utterances[0].onend();await settle();expect(wake.isPipelineRunning()).toBe(false);
 utterances[1].onend();await settle();expect(wake.isPipelineRunning()).toBe(true);
});
test('wake prompt completion starts the normal controller once, without a fixed delay',async()=>{
 await wake.startPorcupineWakePipeline();detection({label:'Porcupine'});await settle();
 expect(utterances[0].text).toBe('Say your command');expect(control.getVoiceRecognition()).toBeNull();
 expect(wake.isPipelineRunning()).toBe(false);
 utterances[0].onend();await settle();expect(control.getVoiceRecognition().start).toHaveBeenCalledTimes(1);
 expect(control.getIsListening()).toBe(true);expect(wake.isPipelineRunning()).toBe(false);
});
test.each(['cancel','hide'])('%s during prompt prevents a late microphone start',async action=>{
 await wake.startPorcupineWakePipeline();detection({label:'Porcupine'});await settle();
 if(action==='cancel')control.cancelVoiceInput();else{hidden=true;document.dispatchEvent(new Event('visibilitychange'));}
 utterances[0].onend();await settle();expect(control.getVoiceRecognition()).toBeNull();
 if(action==='hide')expect(wake.isPipelineRunning()).toBe(false);
});
test('explicit speech cancellation releases holds even if the browser omits end events',async()=>{
 await wake.startPorcupineWakePipeline();announcements.speakMessage('Turn left','high');await settle();
 announcements.cancelNavigationSpeech();await settle();expect(wake.isPipelineRunning()).toBe(true);
});
test('command response does not resume wake while its spoken response is pending',async()=>{
 await wake.startPorcupineWakePipeline();control.speakText('No matching command');await settle();
 wake.maybeResumePorcupineWakeAfterVoice();await settle();expect(wake.isPipelineRunning()).toBe(false);
 utterances[0].onend();await settle();expect(wake.isPipelineRunning()).toBe(true);
});
test('directions wait until recording ends and only the latest queued direction speaks',async()=>{
 control.initVoiceRecognition();await control.toggleVoiceInput();
 announcements.speakMessage('Old direction','high');announcements.speakMessage('Current direction','high');await settle();
 expect(utterances).toHaveLength(0);
 control.getVoiceRecognition().onend();await settle();
 expect(utterances).toHaveLength(1);expect(utterances[0].text).toBe('Current direction');
});
test('cancelling navigation speech discards deferred directions',async()=>{
 control.initVoiceRecognition();await control.toggleVoiceInput();announcements.speakMessage('Old direction','high');
 announcements.cancelNavigationSpeech();control.getVoiceRecognition().onend();await settle();expect(utterances).toHaveLength(0);
});
test('speech finishing while wake creation is pending does not lose the resume request',async()=>{
 let complete;
 PorcupineWeb.PorcupineWorker.create.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
 const start=wake.startPorcupineWakePipeline();await settle();
 const hold=wake.beginSpeechOutput();await hold.ready;hold.finish();await settle();
 complete(worker);await start;await settle();expect(wake.isPipelineRunning()).toBe(true);
});
test('a synchronous synthesis failure releases the wake hold',async()=>{
 await wake.startPorcupineWakePipeline();speechSynthesis.speak.mockImplementation(()=>{throw new Error('unavailable');});
 announcements.speakMessage('Turn left','high');await settle();expect(wake.isPipelineRunning()).toBe(true);
});
test('cancellation during wake cleanup suppresses both the prompt and recording',async()=>{
 await wake.startPorcupineWakePipeline();let complete;
 WebVoiceProcessor.unsubscribe.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
 detection({label:'Porcupine'});control.cancelVoiceInput();complete();await settle();
 expect(utterances).toHaveLength(0);expect(control.getVoiceRecognition()).toBeNull();
});
