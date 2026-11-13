let audio,track,stream,devices,listeners,hidden;
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
beforeEach(()=>{
 jest.resetModules();listeners=[];hidden=false;
 Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
 document.body.innerHTML='<button id="audioDeviceCheck"></button><button id="audioDeviceTest"></button><select id="audioInputDevice"></select><p id="audioDeviceStatus"></p>';
 for(const target of [window,document]){
  const add=target.addEventListener.bind(target);jest.spyOn(target,'addEventListener').mockImplementation((name,fn,...rest)=>{listeners.push([target,name,fn]);return add(name,fn,...rest);});
 }
 devices=[{kind:'audioinput',deviceId:'car-mic',label:'Car microphone'},{kind:'audioinput',deviceId:'headset',label:'Headphones'},{kind:'audiooutput',deviceId:'speaker',label:'Car speakers'}];
 track={label:'System microphone',stop:jest.fn()};stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 const media=new EventTarget();media.getUserMedia=jest.fn().mockResolvedValue(stream);media.enumerateDevices=jest.fn(async()=>devices);
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:media});
 Object.defineProperty(global,'isSecureContext',{configurable:true,value:true});
 audio=require('../app/audio-device-controls');audio.init();
});
afterEach(()=>{
 for(const [target,name,fn]of listeners)target.removeEventListener(name,fn);jest.restoreAllMocks();
 for(const key of ['VoyagrAudioDevices','VoyagrVoiceControlOrchestration','VoyagrVoiceAnnouncementsOrchestration','VoyagrPorcupineOrchestration'])delete global[key];
});
test('page startup neither opens the microphone nor enumerates devices',()=>{
 expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();expect(navigator.mediaDevices.enumerateDevices).not.toHaveBeenCalled();
 expect(document.querySelector('#audioInputDevice').disabled).toBe(true);
});
test('explicit check releases capture and lists only available microphones, without claiming a Bluetooth route',async()=>{
 await audio.check();
 expect(track.stop).toHaveBeenCalledTimes(1);expect(document.querySelector('#audioInputDevice').disabled).toBe(false);
 expect(Array.from(document.querySelectorAll('option')).map(el=>el.textContent)).toEqual(['System default (recommended)','Car microphone','Headphones']);
 expect(document.querySelector('#audioDeviceStatus').textContent).toContain('Microphone: System microphone');
 expect(audio.getInputDeviceId()).toBe('');
});
test.each(['car-mic','headset'])('selected %s is used in actual capture constraints',async id=>{
 await audio.check();await audio.selectInput(id);await audio.requestStream();
 expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith({audio:{deviceId:{exact:id},echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
});
test('disconnecting selected microphone falls back to system default and refreshes the selector',async()=>{
 await audio.check();await audio.selectInput('headset');devices=devices.filter(d=>d.deviceId!=='headset');
 navigator.mediaDevices.dispatchEvent(new Event('devicechange'));await settle();
 expect(audio.getInputDeviceId()).toBe('');expect(document.querySelector('#audioInputDevice').value).toBe('');
 expect(document.querySelector('#audioDeviceStatus').textContent).toContain('unavailable');
});
test('an unavailable device at acquisition retries default once, while permission denial never retries',async()=>{
 await audio.check();await audio.selectInput('car-mic');
 navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(Object.assign(new Error(),{name:'OverconstrainedError'}));
 await audio.requestStream();expect(audio.getInputDeviceId()).toBe('');
 expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
 await audio.selectInput('headset');const count=navigator.mediaDevices.getUserMedia.mock.calls.length;
 navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(Object.assign(new Error(),{name:'NotAllowedError'}));
 await expect(audio.requestStream()).rejects.toMatchObject({name:'NotAllowedError'});expect(navigator.mediaDevices.getUserMedia.mock.calls.length).toBe(count+1);
});
test.each(['cancel','hide'])('%s pending permission releases late microphone and leaves device selection disabled',async action=>{
 let complete;navigator.mediaDevices.getUserMedia.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
 const check=audio.check();await settle();
 if(action==='cancel')audio.cancelCheck();else{hidden=true;document.dispatchEvent(new Event('visibilitychange'));}
 complete(stream);await check;
 expect(track.stop).toHaveBeenCalledTimes(1);expect(document.querySelector('#audioInputDevice').disabled).toBe(true);
});
test('active command is not interrupted by an audio check or input selection',async()=>{
 await audio.check();global.VoyagrVoiceControlOrchestration={isVoiceInputActive:()=>true};
 const count=navigator.mediaDevices.getUserMedia.mock.calls.length;await audio.check();await audio.selectInput('headset');
 expect(navigator.mediaDevices.getUserMedia.mock.calls.length).toBe(count);expect(audio.getInputDeviceId()).toBe('');
});
test('permission failure keeps system default and reports an actionable message',async()=>{
 navigator.mediaDevices.getUserMedia.mockRejectedValue(Object.assign(new Error(),{name:'NotAllowedError'}));await audio.check();
 expect(document.querySelector('#audioDeviceStatus').textContent).toContain('permission');expect(audio.getInputDeviceId()).toBe('');
});
test('device labels are rendered as text, not executable markup',async()=>{
 devices=[{kind:'audioinput',deviceId:'safe',label:'<img src=x onerror=alert(1)>'}];await audio.check();
 expect(document.querySelector('option[value="safe"]').textContent).toBe('<img src=x onerror=alert(1)>');expect(document.querySelector('img')).toBeNull();
});
