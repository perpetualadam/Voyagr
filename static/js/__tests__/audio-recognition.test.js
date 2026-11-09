let Recognition,recorder,stream;
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
beforeEach(()=>{
 jest.resetModules();jest.useFakeTimers();
 stream={getTracks:()=>[track]};const track={stop:jest.fn()};
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:jest.fn().mockResolvedValue(stream)}});
 global.MediaRecorder=class{
  static isTypeSupported(mime){return mime.startsWith('audio/webm');}
  constructor(){recorder=this;this.state='inactive';}
  start(){this.state='recording';}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'])});Promise.resolve().then(()=>this.onstop?.());}
 };
 global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({success:true,text:'find nearest parking'})});
 Recognition=require('../app/audio-recognition').AudioRecognition;
});
afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();delete global.MediaRecorder;delete global.fetch;});
test('records only after start and sends a bounded clip to the same-origin proxy, never a model endpoint',async()=>{
 const r=new Recognition();r.onresult=jest.fn();r.onend=jest.fn();
 expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();await r.start();
 expect(fetch).not.toHaveBeenCalled();r.stop();await settle();
 expect(stream.getTracks()[0].stop).toHaveBeenCalled();
 expect(fetch).toHaveBeenCalledWith('/api/voice/transcribe',expect.objectContaining({headers:{'Content-Type':'audio/webm;codecs=opus','X-Voyagr-Voice':'1'},body:expect.any(Blob),signal:expect.any(AbortSignal)}));
 expect(r.onresult).toHaveBeenCalledWith(expect.objectContaining({results:[{isFinal:true,0:{transcript:'find nearest parking'}}]}));expect(r.onend).toHaveBeenCalledTimes(1);expect(r.state).toBe('idle');
});
test('cancelling pending microphone permission releases the late stream without recording',async()=>{
 const pending=deferred();navigator.mediaDevices.getUserMedia.mockReturnValue(pending.promise);
 const r=new Recognition();r.onstart=jest.fn();const start=r.start();r.abort();pending.resolve(stream);await start;
 expect(stream.getTracks()[0].stop).toHaveBeenCalled();expect(r.onstart).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
test('15-second limit ends capture and releases tracks',async()=>{
 const r=new Recognition();await r.start();jest.advanceTimersByTime(15000);await settle();
 expect(stream.getTracks()[0].stop).toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(1);expect(r.state).toBe('idle');
});
test('abort during upload suppresses a late transcript',async()=>{
 const pending=deferred();fetch.mockReturnValue(pending.promise);const r=new Recognition();r.onresult=jest.fn();
 await r.start();r.stop();await settle();r.abort();expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
 pending.resolve({ok:true,json:async()=>({success:true,text:'navigate to Sheffield'})});await settle();expect(r.onresult).not.toHaveBeenCalled();
});
test('oversize recording releases the microphone and never uploads',async()=>{
 const r=new Recognition();r.onerror=jest.fn();await r.start();recorder.ondataavailable({data:new Blob(['x'.repeat(1024*1024+1)])});await settle();
 expect(r.onerror).toHaveBeenCalledWith({error:'recording-too-large'});expect(fetch).not.toHaveBeenCalled();expect(stream.getTracks()[0].stop).toHaveBeenCalled();
});
test.each(['permission','network','malformed','format'])('%s failure ends input without a command transcript',async kind=>{
 if(kind==='permission')navigator.mediaDevices.getUserMedia.mockRejectedValue(Object.assign(new Error(),{name:'NotAllowedError'}));
 if(kind==='network')fetch.mockRejectedValue(new Error('offline'));
 if(kind==='malformed')fetch.mockResolvedValue({ok:true,json:async()=>({success:true,text:[]})});
 if(kind==='format')MediaRecorder.isTypeSupported=()=>false;
 const r=new Recognition();r.onerror=jest.fn();r.onresult=jest.fn();await r.start();r.stop();await settle();
 expect(r.onerror).toHaveBeenCalledTimes(1);expect(r.onresult).not.toHaveBeenCalled();expect(r.state).toBe('idle');
});
test('upload timeout aborts the request, resets state and leaves no microphone running',async()=>{
 fetch.mockImplementation((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))));
 const r=new Recognition();r.onerror=jest.fn();await r.start();r.stop();await settle();
 jest.advanceTimersByTime(25000);await settle();
 expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);expect(r.onerror).toHaveBeenCalledWith({error:'network'});expect(r.state).toBe('idle');expect(stream.getTracks()[0].stop).toHaveBeenCalled();
});
