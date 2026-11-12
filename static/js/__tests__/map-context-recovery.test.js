const Recovery=require('../modules/map/map-context-recovery');
let canvas,map,gl,restore,hooks,visible,owner;
beforeEach(()=>{
 jest.useFakeTimers();visible='visible';jest.spyOn(document,'visibilityState','get').mockImplementation(()=>visible);
 canvas=document.createElement('canvas');map={getCanvas:()=>canvas,on:jest.fn()};restore=jest.fn();gl={getExtension:()=>({restoreContext:restore})};
 hooks={isCurrent:()=>true,lost:jest.fn(),restored:jest.fn(),unavailable:jest.fn()};owner=Recovery.install(map,gl,hooks);
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
