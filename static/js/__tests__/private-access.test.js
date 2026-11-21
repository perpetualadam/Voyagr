const install = require('../app/private-access');
let access;
beforeEach(() => {
    jest.useFakeTimers();
    document.documentElement.dataset.personalMode='true';
    document.body.innerHTML='<section id="privateAccessNotice" hidden><a href="/privacy">Unlock</a></section><p id="privateAccessStatus"></p><a id="privateAccessUnlock" target="_blank" rel="noopener" hidden></a>';
    global.fetch=jest.fn();
});
afterEach(() => {
    access?.destroy(); access=null;
    delete global.fetch;
    delete window.VoyagrNavigationLifecycleOrchestration;
    delete document.documentElement.dataset.personalMode;
    document.documentElement.removeAttribute('data-private-access-locked');
    jest.useRealTimers();
});
test.each([401,403])('denial %s offers fresh same-origin login without navigation or storage changes',async status => {
    localStorage.setItem('private-access-retained','keep');
    fetch.mockResolvedValue({status,ok:false});
    access=install(window); await access.check();
    const card=document.getElementById('privateAccessNotice');
    expect(card.hidden).toBe(false);
    expect(card.querySelector('a').getAttribute('href')).toMatch(/^\/privacy\?private-login=\d+$/);
    expect(localStorage.getItem('private-access-retained')).toBe('keep');
    expect(document.activeElement).toBe(document.body);
    expect(location.pathname).toBe('/');
    expect(fetch).toHaveBeenCalledWith('/api/config',expect.objectContaining({cache:'no-store',credentials:'same-origin'}));
});
test('successful recheck removes the notice; unrelated errors do not claim expired login',async()=>{
    fetch.mockResolvedValue({status:503,ok:false});
    access=install(window);await access.check();
    expect(document.getElementById('privateAccessNotice').hidden).toBe(true);
    fetch.mockRejectedValue(new Error('offline'));await access.check();
    expect(document.getElementById('privateAccessNotice').hidden).toBe(true);
    fetch.mockResolvedValue({status:403,ok:false});await access.check();
    fetch.mockResolvedValue({status:200,ok:true});await access.check();
    expect(document.documentElement.hasAttribute('data-private-access-locked')).toBe(false);
});
test('overlapping checks share one bounded request and stop after teardown',async()=>{
    let resolve;
    fetch.mockImplementation(()=>new Promise(r=>{resolve=r;}));
    access=install(window);
    const first=access.check(),second=access.check();
    expect(first).toBe(second);expect(fetch).toHaveBeenCalledTimes(1);
    access.destroy(); resolve({status:403,ok:false});await first;
    expect(document.getElementById('privateAccessNotice').hidden).toBe(true);
});
test('public mode does not probe private access',()=>{
    delete document.documentElement.dataset.personalMode;
    expect(install(window)).toBeNull();expect(fetch).not.toHaveBeenCalled();
});
test('the probe times out instead of accumulating background requests',async()=>{
    fetch.mockImplementation((_url,options)=>new Promise((_resolve,reject)=>{
        options.signal.addEventListener('abort',()=>reject(new Error('aborted')));
    }));
    access=install(window);const request=access.check();
    jest.advanceTimersByTime(8000);await request;
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(document.getElementById('privateAccessNotice').hidden).toBe(true);
});


test.each([401,403])('denial %s during navigation waits through Stop summary until Done without erasing data',async status=>{
 let active=true;
 window.VoyagrNavigationLifecycleOrchestration={getRouteInProgress:()=>active,getNavigationStarting:()=>false};
 document.body.insertAdjacentHTML('beforeend','<div id="journeySummaryModal" style="display:none"></div><button id="stop">Stop</button>');
 localStorage.setItem('journey-retained','keep');
 fetch.mockResolvedValue({status,ok:false});access=install(window);await access.check();
 const card=document.getElementById('privateAccessNotice'),summary=document.getElementById('journeySummaryModal');
 expect(card.hidden).toBe(true);expect(document.documentElement.hasAttribute('data-private-access-locked')).toBe(false);
 document.getElementById('stop').focus();
 active=false;window.dispatchEvent(new Event('voyagr:journey-state-change'));summary.style.display='block';
 await Promise.resolve();jest.advanceTimersByTime(0);
 expect(card.hidden).toBe(true);expect(document.activeElement.id).toBe('stop');
 summary.style.display='none';await Promise.resolve();jest.advanceTimersByTime(0);
 expect(card.hidden).toBe(false);expect(localStorage.getItem('journey-retained')).toBe('keep');
 expect(location.pathname).toBe('/');
});
test('Stop without a summary exposes the deferred action, and a new journey hides it',async()=>{
 let active=true;
 window.VoyagrNavigationLifecycleOrchestration={getRouteInProgress:()=>active};
 fetch.mockResolvedValue({status:403,ok:false});access=install(window);await access.check();
 active=false;window.dispatchEvent(new Event('voyagr:journey-state-change'));jest.advanceTimersByTime(0);
 expect(document.getElementById('privateAccessNotice').hidden).toBe(false);
 active=true;window.dispatchEvent(new Event('voyagr:journey-state-change'));jest.advanceTimersByTime(0);
 expect(document.getElementById('privateAccessNotice').hidden).toBe(true);
 fetch.mockResolvedValue({status:200,ok:true});await access.check();
 active=false;window.dispatchEvent(new Event('voyagr:journey-state-change'));jest.advanceTimersByTime(0);
 expect(document.getElementById('privateAccessNotice').hidden).toBe(true);
});
test('navigation startup and delayed denial response cannot interrupt the journey',async()=>{
 let starting=true,active=false,resolve;
 window.VoyagrNavigationLifecycleOrchestration={getRouteInProgress:()=>active,getNavigationStarting:()=>starting};
 fetch.mockImplementation(()=>new Promise(r=>{resolve=r;}));access=install(window);const p=access.check();
 starting=false;active=true;resolve({status:401,ok:false});await p;
 expect(document.getElementById('privateAccessNotice').hidden).toBe(true);
});

test('real navigation state setter schedules presentation after the synchronous summary is built',async()=>{
 jest.resetModules();
 const lifecycle=require('../app/navigation-lifecycle-orchestration');
 lifecycle.setRouteInProgress(true);
 document.body.insertAdjacentHTML('beforeend','<div id="journeySummaryModal" style="display:none"></div>');
 fetch.mockResolvedValue({status:403,ok:false});access=install(window);await access.check();
 expect(document.getElementById('privateAccessNotice').hidden).toBe(true);
 lifecycle.setRouteInProgress(false);document.getElementById('journeySummaryModal').style.display='block';
 await Promise.resolve();jest.advanceTimersByTime(0);
 expect(document.getElementById('privateAccessNotice').hidden).toBe(true);
 document.getElementById('journeySummaryModal').style.display='none';await Promise.resolve();jest.advanceTimersByTime(0);
 expect(document.getElementById('privateAccessNotice').hidden).toBe(false);
});


test('Info separates confirmed website denial from unavailable provider data and offers explicit stationary recovery',async()=>{
 fetch.mockResolvedValue({status:403,ok:false});access=install(window);await access.check();
 expect(document.getElementById('privateAccessStatus').textContent).toContain('owner login required');
 const link=document.getElementById('privateAccessUnlock');expect(link.hidden).toBe(false);
 expect(link.getAttribute('href')).toMatch(/^\/privacy\?private-login=\d+$/);
 expect(link.target).toBe('_blank');expect(link.rel).toBe('noopener');expect(location.pathname).toBe('/');
 fetch.mockResolvedValue({status:200,ok:true});await access.check();
 expect(link.hidden).toBe(true);expect(document.getElementById('privateAccessStatus').textContent).toContain('last check passed');
});
test('navigation defers both unlock actions while Info gives a passive reason, and Stop makes recovery available',async()=>{
 let active=true;window.VoyagrNavigationLifecycleOrchestration={getRouteInProgress:()=>active};
 fetch.mockResolvedValue({status:403,ok:false});access=install(window);await access.check();
 expect(document.getElementById('privateAccessNotice').hidden).toBe(true);expect(document.getElementById('privateAccessUnlock').hidden).toBe(true);
 expect(document.getElementById('privateAccessStatus').textContent).toContain('until navigation stops');
 expect(document.activeElement).toBe(document.body);
 active=false;window.dispatchEvent(new Event('voyagr:journey-state-change'));jest.advanceTimersByTime(0);
 expect(document.getElementById('privateAccessUnlock').hidden).toBe(false);
});
test('a pending summary defers only the overlay, with an explicit Info recovery link and no automatic navigation',async()=>{
 document.body.insertAdjacentHTML('beforeend','<div id="journeySummaryModal" style="display:block"></div>');
 fetch.mockResolvedValue({status:401,ok:false});access=install(window);await access.check();
 expect(document.getElementById('privateAccessNotice').hidden).toBe(true);
 expect(document.getElementById('privateAccessStatus').textContent).toContain('until the journey summary closes');
 expect(document.getElementById('privateAccessUnlock').hidden).toBe(false);expect(location.pathname).toBe('/');
});
test('offline and server errors never manufacture denial or success, and a previous denial remains explicit',async()=>{
 fetch.mockRejectedValue(new Error('offline'));access=install(window);await access.check();
 expect(document.getElementById('privateAccessStatus').textContent).toContain('not yet verified');
 expect(document.getElementById('privateAccessUnlock').hidden).toBe(true);
 fetch.mockResolvedValue({status:403,ok:false});await access.check();
 fetch.mockResolvedValue({status:503,ok:false});await access.check();
 expect(document.getElementById('privateAccessStatus').textContent).toContain('owner login required');
 expect(document.getElementById('privateAccessStatus').textContent).toContain('could not complete');
 expect(document.getElementById('privateAccessUnlock').hidden).toBe(false);
});
