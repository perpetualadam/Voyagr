const flush=async()=>{for(let i=0;i<10;i++) await Promise.resolve();};
let Nav,visible,request,oldWake;
function sentinel(){const lock=new EventTarget();lock.released=false;lock.release=jest.fn(async()=>{lock.released=true;lock.dispatchEvent(new Event('release'));});return lock;}
beforeEach(()=>{
 jest.resetModules();jest.useFakeTimers();visible='visible';
 jest.spyOn(document,'visibilityState','get').mockImplementation(()=>visible);
 oldWake=Object.getOwnPropertyDescriptor(navigator,'wakeLock');request=jest.fn(async()=>sentinel());
 Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request}});
 window.screenWakeLock=null;
 Nav=require('../app/navigation-lifecycle-orchestration');
 Nav.bind({mapControls:()=>require('../modules/map/map-controls'),call:{showStatus:jest.fn()}});Nav.setRouteInProgress(true);
});
afterEach(()=>{Nav.setRouteInProgress(false);jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();delete window.screenWakeLock;if(oldWake)Object.defineProperty(navigator,'wakeLock',oldWake);else delete navigator.wakeLock;});
test('navigation acquires one lock across overlapping foreground requests',async()=>{
 Nav.ensureNavWakeLock();Nav.ensureNavWakeLock();await flush();
 expect(request).toHaveBeenCalledTimes(1);expect(request).toHaveBeenCalledWith('screen');expect(window.screenWakeLock.released).toBe(false);
 Nav.ensureNavWakeLock();await flush();expect(request).toHaveBeenCalledTimes(1);
});
test('released sentinel reference is replaced, and automatic release recovers while visible',async()=>{
 const old=sentinel();old.released=true;window.screenWakeLock=old;
 Nav.ensureNavWakeLock();await flush();const held=window.screenWakeLock;expect(held).not.toBe(old);
 await held.release();await jest.advanceTimersByTimeAsync(1000);await flush();
 expect(request).toHaveBeenCalledTimes(2);expect(window.screenWakeLock.released).toBe(false);
});
test('transient request failure retries without a user action but denial has a finite budget',async()=>{
 request.mockRejectedValue(new DOMException('OS denied','NotAllowedError'));
 Nav.ensureNavWakeLock();await flush();await jest.advanceTimersByTimeAsync(60000);await flush();
 expect(request).toHaveBeenCalledTimes(4);expect(window.screenWakeLock).toBeNull();
 await jest.advanceTimersByTimeAsync(60000);expect(request).toHaveBeenCalledTimes(4);
 request.mockResolvedValue(sentinel());Nav.ensureNavWakeLock();await flush();expect(window.screenWakeLock.released).toBe(false);
});
test('hidden pages do not acquire and stopping cancels a scheduled recovery',async()=>{
 visible='hidden';Nav.ensureNavWakeLock({documentVisible:true});await flush();expect(request).not.toHaveBeenCalled();
 visible='visible';request.mockRejectedValue(Error('temporary'));Nav.ensureNavWakeLock();await flush();Nav.setRouteInProgress(false);
 await jest.advanceTimersByTimeAsync(60000);expect(request).toHaveBeenCalledTimes(1);
});
test('late request is released after stop and cannot overwrite a newer navigation lock',async()=>{
 let resolve;request.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 Nav.ensureNavWakeLock();await flush();Nav.setRouteInProgress(false);Nav.setRouteInProgress(true);
 Nav.ensureNavWakeLock();await flush();const current=window.screenWakeLock,late=sentinel();resolve(late);await flush();
 expect(late.release).toHaveBeenCalledTimes(1);expect(window.screenWakeLock).toBe(current);expect(current.released).toBe(false);
});
test('returning to foreground reacquires after release while hidden',async()=>{
 Nav.ensureNavWakeLock();await flush();visible='hidden';await window.screenWakeLock.release();await jest.advanceTimersByTimeAsync(5000);
 expect(request).toHaveBeenCalledTimes(1);visible='visible';Nav.ensureNavWakeLock({documentVisible:true});await flush();expect(request).toHaveBeenCalledTimes(2);
});

test('summary release finishing late cannot clear a newly acquired lock',async()=>{
 const Summary=require('../app/journey-summary-orchestration');let finish;
 const old=sentinel();old.release.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));window.screenWakeLock=old;
 Summary.bind({eta:()=>require('../modules/navigation/eta'),call:{switchTab:jest.fn(),clearForm:jest.fn()}});
 Summary.closeJourneySummary();const next=sentinel();window.screenWakeLock=next;await flush();finish();await flush();
 expect(old.release).toHaveBeenCalledTimes(1);expect(window.screenWakeLock).toBe(next);
});

test('mobile focus return restores the wake lock without a visibility transition',async()=>{
 const Mobile=require('../app/mobile-pwa-orchestration'),listeners=[];
 const add=window.addEventListener.bind(window),oldMatch=window.matchMedia;
 window.matchMedia=()=>({matches:false});
 jest.spyOn(window,'addEventListener').mockImplementation((name,fn,options)=>{listeners.push([name,fn,options]);add(name,fn,options);});
 Mobile.bind({call:{ensureNavWakeLock:opts=>Nav.ensureNavWakeLock(opts)}});
 try {
  Mobile.initMobileEnhancements();window.dispatchEvent(new Event('focus'));await flush();
  expect(request).toHaveBeenCalledTimes(1);
  visible='hidden';await window.screenWakeLock.release();window.dispatchEvent(new Event('focus'));await flush();expect(request).toHaveBeenCalledTimes(1);
  visible='visible';window.dispatchEvent(new Event('focus'));await flush();expect(request).toHaveBeenCalledTimes(2);
 } finally {listeners.forEach(args=>window.removeEventListener(...args));window.matchMedia=oldMatch;}
});
