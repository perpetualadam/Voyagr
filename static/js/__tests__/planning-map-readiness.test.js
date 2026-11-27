'use strict';
const {waitForPlanningMapReady}=require('../app/calculate-route-orchestration');
describe('bounded planning map readiness',()=>{
    beforeEach(()=>jest.useFakeTimers());
    afterEach(()=>jest.useRealTimers());
    test('temporary style loading waits and resolves when the renderer is ready',async()=>{
        let ready=false;
        const result=waitForPlanningMapReady({isStyleLoaded:()=>ready},()=>true);
        let settled=false;result.then(()=>{settled=true;});
        await jest.advanceTimersByTimeAsync(100);
        expect(settled).toBe(false);
        ready=true;await jest.advanceTimersByTimeAsync(25);
        expect(await result).toBe(true);expect(jest.getTimerCount()).toBe(0);
    });
    test('an invalidated planning intent cancels the wait without further polling',async()=>{
        let current=true;
        const inspect=jest.fn(()=>false);
        const result=waitForPlanningMapReady({isStyleLoaded:inspect},()=>current);
        current=false;await jest.advanceTimersByTimeAsync(25);
        expect(await result).toBe(false);
        const calls=inspect.mock.calls.length;
        await jest.advanceTimersByTimeAsync(5000);
        expect(inspect).toHaveBeenCalledTimes(calls);expect(jest.getTimerCount()).toBe(0);
    });
    test('a permanently unavailable style refuses within the commit budget',async()=>{
        const result=waitForPlanningMapReady({isStyleLoaded:()=>false},()=>true);
        await jest.advanceTimersByTimeAsync(4000);
        expect(await result).toBe(false);expect(jest.getTimerCount()).toBe(0);
    });
    test('a broken current-intent check during polling fails closed',async()=>{
        let broken=false;
        const result=waitForPlanningMapReady({isStyleLoaded:()=>false},()=>{if(broken)throw Error('Modules changed');return true;});
        broken=true;await jest.advanceTimersByTimeAsync(25);
        expect(await result).toBe(false);expect(jest.getTimerCount()).toBe(0);
    });
});
