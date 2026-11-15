/** @jest-environment node */
const {JSDOM}=require('jsdom');
const {indexedDB,IDBKeyRange}=require('fake-indexeddb');
const Local=require('../modules/privacy/local-store');
const DC=require('../modules/navigation/dashcam-capture');
let store,device,dom,owner,epoch,track,recorders,camera;
const scope=()=>({owner,epoch});const current=c=>c.owner===owner&&c.epoch===epoch;
beforeEach(()=>{
 dom=new JSDOM('<div id="dashcamStatusText"></div><div id="dashcamRecordingsList"></div><video id="dashcamPreview"></video><input id="dashcamLocalGps" type="checkbox">');global.document=dom.window.document;global.IDBKeyRange=IDBKeyRange;
 owner='guest';epoch=1;track={stop:jest.fn()};recorders=[];
 store=Local.create(indexedDB,{name:'media-'+crypto.randomUUID()});
 global.VoyagrLocalData={capture:scope,current,ready:async()=>{},db:()=>store,report:jest.fn()};
 global.VoyagrDashcamCapture=DC;global.isSecureContext=true;
 camera=jest.fn(async()=>({getTracks:()=>[track]}));Object.defineProperty(global.navigator,'mediaDevices',{value:{getUserMedia:camera},configurable:true});
 global.MediaRecorder=class{static isTypeSupported(){return true;}constructor(){this.state='inactive';recorders.push(this);}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['video'],{type:'video/webm'})});this.onstop();}};
 jest.resetModules();device=require('../app/device-dashcam');
});
afterEach(async()=>{await device.stop();store.close();dom.window.close();delete global.document;delete global.MediaRecorder;delete global.VoyagrLocalData;delete global.VoyagrDashcamCapture;});
test('guest and signed-in captures commit local media without any network or automatic download',async()=>{
 for(const next of ['guest','sb:A']){owner=next;epoch++;expect(await device.start({resolution:'720p',fps:30,audio_enabled:false})).toBe(true);await device.stop();const rows=await store.listClips(next);expect(rows).toHaveLength(1);expect(rows[0].status).toBe('complete');expect(await(await store.clipBlob(next,rows[0].id)).text()).toBe('video');}
 expect(fetch).not.toHaveBeenCalled();expect(track.stop).toHaveBeenCalledTimes(2);
});
test('account switches during camera permission cancel capture and release tracks',async()=>{
 let release;camera.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const pending=device.start({});while(!release)await new Promise(resolve=>setImmediate(resolve));owner='sb:B';epoch++;release({getTracks:()=>[track]});expect(await pending).toBe(false);expect(track.stop).toHaveBeenCalled();expect(await store.listClips('guest')).toEqual([]);expect(fetch).not.toHaveBeenCalled();
});
test('camera denial and unavailable storage never open a server fallback',async()=>{
 camera.mockRejectedValue(Error('denied'));expect(await device.start({})).toBe(false);expect(fetch).not.toHaveBeenCalled();
 global.VoyagrLocalData.ready=async()=>{throw Error('quota');};expect(await device.start({})).toBe(false);expect(camera).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled();
});
test('chunk failure stops capture and records partial status rather than successful completion',async()=>{
 expect(await device.start({})).toBe(true);jest.spyOn(store,'appendChunk').mockRejectedValue(Error('quota'));await device.stop();expect((await store.listClips('guest'))[0].status).toBe('partial');expect(track.stop).toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
test('GPS metadata is explicit, fresh, local and never starts a second geolocation watch',async()=>{
 let sample;const intervals=jest.spyOn(global,'setInterval').mockImplementation((fn,ms)=>{if(ms===5000)sample=fn;return 0;});
 global.VoyagrLocationOrchestration={getCurrentLat:()=>53,getCurrentLon:()=>-1};global.VoyagrGpsOrchestration={getLastGpsFixAgeMs:()=>NaN};
 document.getElementById('dashcamLocalGps').checked=true;
 try{await device.start({audioEnabled:false});expect(camera.mock.calls[0][0].audio).toBe(false);sample();global.VoyagrGpsOrchestration.getLastGpsFixAgeMs=()=>100;sample();await device.stop();expect((await store.listClips('guest'))[0].points).toEqual([{lat:53,lon:-1,timestamp:expect.any(Number)}]);expect(fetch).not.toHaveBeenCalled();}
 finally{intervals.mockRestore();delete global.VoyagrLocationOrchestration;delete global.VoyagrGpsOrchestration;}
});
