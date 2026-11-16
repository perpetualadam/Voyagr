const install = require('../app/private-access');
let access;
beforeEach(() => {
    jest.useFakeTimers();
    document.documentElement.dataset.personalMode='true';
    document.body.innerHTML='<section id="privateAccessNotice" hidden><a href="/privacy">Unlock</a></section>';
    global.fetch=jest.fn();
});
afterEach(() => {
    access?.destroy(); access=null;
    delete global.fetch;
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
