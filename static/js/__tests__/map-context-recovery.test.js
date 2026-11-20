const Recovery=require('../modules/map/map-context-recovery');
let canvas,map,gl,restore,hooks,visible,owner;
beforeEach(()=>{
 jest.useFakeTimers();visible='visible';jest.spyOn(document,'visibilityState','get').mockImplementation(()=>visible);
 canvas=document.createElement('canvas');map={getCanvas:()=>canvas,on:jest.fn()};restore=jest.fn();gl={getExtension:()=>({restoreContext:restore})};
 hooks={isCurrent:()=>true,lost:jest.fn(),restored:jest.fn(),unavailable:jest.fn(),retrying:jest.fn()};owner=Recovery.install(map,gl,hooks);
});
afterEach(()=>{owner.dispose();jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();});
test('lost context requests a bounded restore and restoration cancels recovery without changing map resources',()=>{
 const event=new Event('webglcontextlost',{cancelable:true});canvas.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
 jest.advanceTimersByTime(1000);expect(restore).toHaveBeenCalledTimes(1);
 canvas.dispatchEvent(new Event('webglcontextrestored'));jest.advanceTimersByTime(60000);expect(restore).toHaveBeenCalledTimes(1);expect(hooks.restored).toHaveBeenCalledTimes(1);expect(map.on).toHaveBeenCalledWith('remove',expect.any(Function));
});
test('blocked browser restoration has three attempts and reports unavailable',()=>{
 canvas.dispatchEvent(new Event('webglcontextlost'));jest.advanceTimersByTime(60000);expect(restore).toHaveBeenCalledTimes(3);expect(hooks.unavailable).toHaveBeenCalledTimes(1);
});
test('hidden pages pause retries, and disposed or replaced maps cannot recover',()=>{
 canvas.dispatchEvent(new Event('webglcontextlost'));visible='hidden';document.dispatchEvent(new Event('visibilitychange'));jest.advanceTimersByTime(10000);expect(restore).not.toHaveBeenCalled();
 visible='visible';document.dispatchEvent(new Event('visibilitychange'));jest.advanceTimersByTime(1000);expect(restore).toHaveBeenCalledTimes(1);
 hooks.isCurrent=()=>false;jest.advanceTimersByTime(60000);expect(restore).toHaveBeenCalledTimes(1);
 owner.dispose();canvas.dispatchEvent(new Event('webglcontextrestored'));expect(hooks.restored).not.toHaveBeenCalled();
});
test('mobile canvas density is bounded without changing desktop defaults',()=>{
 expect(Recovery.renderOptions(3,true)).toEqual({pixelRatio:2});expect(Recovery.renderOptions(1.5,true)).toEqual({pixelRatio:1.5});expect(Recovery.renderOptions(3,false)).toEqual({});
});

test('an exhausted recovery gets one fresh bounded chance after the screen returns',()=>{
 canvas.dispatchEvent(new Event('webglcontextlost'));jest.advanceTimersByTime(60000);
 expect(restore).toHaveBeenCalledTimes(3);
 visible='hidden';document.dispatchEvent(new Event('visibilitychange'));jest.advanceTimersByTime(60000);
 expect(restore).toHaveBeenCalledTimes(3);
 visible='visible';document.dispatchEvent(new Event('visibilitychange'));jest.advanceTimersByTime(1000);
 expect(restore).toHaveBeenCalledTimes(4);
 canvas.dispatchEvent(new Event('webglcontextrestored'));jest.advanceTimersByTime(60000);
 expect(hooks.restored).toHaveBeenCalledTimes(1);expect(restore).toHaveBeenCalledTimes(4);
});


test('duplicate events and repeated unlocks cannot create unbounded GPU retries',()=>{
 canvas.dispatchEvent(new Event('webglcontextlost'));jest.advanceTimersByTime(60000);
 for(let cycle=0;cycle<5;cycle++){
  canvas.dispatchEvent(new Event('webglcontextlost'));
  document.dispatchEvent(new Event('visibilitychange'));
  visible='hidden';document.dispatchEvent(new Event('visibilitychange'));
  visible='visible';document.dispatchEvent(new Event('visibilitychange'));
  jest.advanceTimersByTime(60000);
 }
 expect(restore).toHaveBeenCalledTimes(6);expect(hooks.unavailable).toHaveBeenCalledTimes(2);
 expect(hooks.retrying).toHaveBeenCalledTimes(1);expect(hooks.lost).toHaveBeenCalledTimes(1);
});
test('a visible event without a hidden transition cannot reset an exhausted budget',()=>{
 canvas.dispatchEvent(new Event('webglcontextlost'));jest.advanceTimersByTime(60000);
 for(let i=0;i<20;i++)document.dispatchEvent(new Event('visibilitychange'));
 jest.advanceTimersByTime(60000);expect(restore).toHaveBeenCalledTimes(3);expect(hooks.retrying).not.toHaveBeenCalled();
});
test('successful restoration reacquires extensions and a later genuine loss gets its own budget',()=>{
 const next=jest.fn();gl.getExtension=jest.fn(()=>({restoreContext:next}));
 canvas.dispatchEvent(new Event('webglcontextlost'));jest.advanceTimersByTime(1000);
 canvas.dispatchEvent(new Event('webglcontextrestored'));canvas.dispatchEvent(new Event('webglcontextrestored'));
 expect(gl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');expect(hooks.restored).toHaveBeenCalledTimes(1);
 canvas.dispatchEvent(new Event('webglcontextlost'));jest.advanceTimersByTime(60000);
 expect(next).toHaveBeenCalledTimes(3);expect(hooks.lost).toHaveBeenCalledTimes(2);
});
test.each(['disposed','replaced'])('an exhausted %s map cannot resume work after unlock',mode=>{
 canvas.dispatchEvent(new Event('webglcontextlost'));jest.advanceTimersByTime(60000);
 if(mode==='disposed')owner.dispose();else hooks.isCurrent=()=>false;
 visible='hidden';document.dispatchEvent(new Event('visibilitychange'));
 visible='visible';document.dispatchEvent(new Event('visibilitychange'));jest.advanceTimersByTime(60000);
 expect(restore).toHaveBeenCalledTimes(3);expect(hooks.retrying).not.toHaveBeenCalled();
});
test('an unsupported context reports once and does not create an unlock retry loop',()=>{
 owner.dispose();gl.getExtension=()=>null;owner=Recovery.install(map,gl,hooks);
 canvas.dispatchEvent(new Event('webglcontextlost'));expect(hooks.unavailable).toHaveBeenCalledTimes(1);
 for(let i=0;i<3;i++){
  visible='hidden';document.dispatchEvent(new Event('visibilitychange'));
  visible='visible';document.dispatchEvent(new Event('visibilitychange'));
 }
 jest.advanceTimersByTime(60000);expect(restore).not.toHaveBeenCalled();expect(hooks.unavailable).toHaveBeenCalledTimes(1);
});
