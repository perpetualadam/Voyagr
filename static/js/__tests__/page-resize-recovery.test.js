test('twenty viewport events schedule one padding/resize pass',()=>{
    jest.useFakeTimers();jest.resetModules();
    const log=jest.spyOn(console,'log').mockImplementation(()=>{});
    const owner=require('../app/page-init-orchestration.js');
    window.__voyagrMapResizeAndRepaint=jest.fn();
    owner.bind({getMap:()=>null});owner.registerPageLifecycleListeners();
    for(let i=0;i<20;i++)window.dispatchEvent(new Event('resize'));
    jest.advanceTimersByTime(50);
    expect(window.__voyagrMapResizeAndRepaint).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    delete window.__voyagrMapResizeAndRepaint;log.mockRestore();jest.useRealTimers();
});
