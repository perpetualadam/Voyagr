const originalSelf = Object.getOwnPropertyDescriptor(global, 'self');
const originalCaches = global.caches;
const originalFetch = global.fetch;
const originalResponse = global.Response;

// Execute the actual worker; replace only the browser cache, event and network boundaries.
class Reply {
    constructor(body, options = {}) { this.body = body; this.status = options.status || 200; this.ok = this.status >= 200 && this.status < 300; }
    clone() { return new Reply(this.body, {status:this.status}); }
}
function setup() {
    const listeners = {};
    const cache = {match:jest.fn(async()=>undefined),put:jest.fn(async()=>{}),keys:jest.fn(async()=>[]),add:jest.fn(async()=>{}),delete:jest.fn(async()=>true)};
    const caches = {open:jest.fn(async()=>cache),keys:jest.fn(async()=>[]),delete:jest.fn(async()=>true)};
    const networkReply = new Reply('vector tile bytes');
    const fetch = jest.fn(async()=>networkReply);
    const self = {addEventListener:(name, handler)=>{listeners[name]=handler;},skipWaiting:jest.fn(),clients:{claim:jest.fn(async()=>{})},location:{origin:'https://app.test'}};
    Object.defineProperty(global, 'self', {configurable:true,value:self});
    global.caches=caches;global.fetch=fetch;global.Response=Reply;
    jest.isolateModules(()=>require('../../../service-worker.js'));
    function dispatch(name, request) {
        const tasks = [];
        let response;
        listeners[name]({request,waitUntil:task=>tasks.push(task),respondWith:task=>{response=task;}});
        return {response,settle:async()=>{while(tasks.length)await Promise.all(tasks.splice(0));}};
    }
    function request(url='/map/data/gb/11/1016/662.pbf', cacheMode='default') {
        return {url:'https://app.test'+url,method:'GET',cache:cacheMode,headers:{has:()=>false}};
    }
    return {cache,caches,fetch,self,networkReply,dispatch,request};
}
afterEach(()=>{
    Object.defineProperty(global,'self',originalSelf);
    global.caches=originalCaches;global.fetch=originalFetch;global.Response=originalResponse;
    jest.useRealTimers();
});

test.each(['open','match'])('a rejected cache %s cannot block a healthy vector tile',async operation=>{
    const env=setup();
    (operation==='open'?env.caches.open:env.cache.match).mockRejectedValue(new Error('Unexpected internal error'));
    const event=env.dispatch('fetch',env.request());
    expect(await event.response).toBe(env.networkReply);
    await event.settle();
    expect(env.fetch).toHaveBeenCalledTimes(1);
});
test('a stalled cache read cannot delay a healthy tile response',async()=>{
    jest.useFakeTimers();
    const env=setup();env.cache.match.mockImplementation(()=>new Promise(()=>{}));
    const event=env.dispatch('fetch',env.request());
    expect(await event.response).toBe(env.networkReply);
    await event.settle();
    await jest.runAllTimersAsync();
});
test.each(['put','keys'])('a failed cache %s after download is contained in event lifetime',async operation=>{
    const env=setup();env.cache[operation].mockRejectedValue(new Error('Entry was not found'));
    const event=env.dispatch('fetch',env.request());
    expect(await event.response).toBe(env.networkReply);
    await expect(event.settle()).resolves.toBeUndefined();
});
test.each(['/map/styles/liberty/style.json','/styles/liberty/sprite.json','/styles/liberty/sprite.png','/fonts/font/0-255.pbf','/map/fonts/font/0-255.pbf','/glyphs/font/0-255.pbf','/sprites/map.png','/static/map/styles/osm-raster/style.json'])(
    '%s reaches network despite broken cache storage',async url=>{
        const env=setup();env.caches.open.mockRejectedValue(new Error('cache unavailable'));
        const event=env.dispatch('fetch',env.request(url));
        expect(await event.response).toBe(env.networkReply);
        await event.settle();expect(env.fetch).toHaveBeenCalledTimes(1);
    });
test.each(['/map/data/gb/11/1016/662.pbf','/styles/liberty/sprite.json'])(
    '%s returns cached resource offline',async url=>{
        const env=setup(),cached=new Reply('offline map data');
        env.cache.match.mockResolvedValue(cached);env.fetch.mockRejectedValue(new Error('offline'));
        const event=env.dispatch('fetch',env.request(url));
        expect(await event.response).toBe(cached);await event.settle();
    });
test.each(['/map/data/gb/11/1016/662.pbf','/styles/liberty/sprite.png'])(
    '%s returns explicit 503 when both network and cache fail',async url=>{
        const env=setup();env.caches.open.mockRejectedValue(new Error('cache failure'));env.fetch.mockRejectedValue(new Error('offline'));
        const event=env.dispatch('fetch',env.request(url));
        expect((await event.response).status).toBe(503);await event.settle();
    });
test('stalled cache operations time out instead of hanging an offline request',async()=>{
    jest.useFakeTimers();
    const env=setup();env.caches.open.mockImplementation(()=>new Promise(()=>{}));env.fetch.mockRejectedValue(new Error('offline'));
    const event=env.dispatch('fetch',env.request());
    await jest.advanceTimersByTimeAsync(1000);
    expect((await event.response).status).toBe(503);await event.settle();
});
test('a cached tile is served immediately while its refresh remains tracked',async()=>{
    const env=setup(),cached=new Reply('cached tile');let complete;
    env.cache.match.mockResolvedValue(cached);env.fetch.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
    const event=env.dispatch('fetch',env.request());
    expect(await event.response).toBe(cached);expect(env.fetch).toHaveBeenCalledTimes(1);
    complete(env.networkReply);await event.settle();
    expect(env.cache.put).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({body:'vector tile bytes'}));
});
test('no-store tile probes bypass cache reads and writes',async()=>{
    const env=setup();const event=env.dispatch('fetch',env.request(undefined,'no-store'));
    expect(await event.response).toBe(env.networkReply);await event.settle();
    expect(env.caches.open).not.toHaveBeenCalled();
});
test('failed HTTP responses are not cached',async()=>{
    const env=setup();env.fetch.mockResolvedValue(new Reply('unavailable',{status:502}));
    const event=env.dispatch('fetch',env.request());
    expect((await event.response).status).toBe(502);await event.settle();
    expect(env.cache.put).not.toHaveBeenCalled();
});
test.each(['rejected','stalled'])('natural activation does not force control or touch %s cache storage',async mode=>{
    const env=setup();
    for(const method of ['open','keys'])env.caches[method].mockImplementation(()=>mode==='rejected'?Promise.reject(new Error('cache unavailable')):new Promise(()=>{}));
    await env.dispatch('activate').settle();
    expect(env.self.skipWaiting).not.toHaveBeenCalled();
    expect(env.self.clients.claim).not.toHaveBeenCalled();
    expect(env.caches.open).not.toHaveBeenCalled();expect(env.caches.keys).not.toHaveBeenCalled();expect(env.caches.delete).not.toHaveBeenCalled();
});

test('a stalled cache write cannot hold the response or worker event forever',async()=>{
    jest.useFakeTimers();
    const env=setup();env.cache.put.mockImplementation(()=>new Promise(()=>{}));
    const event=env.dispatch('fetch',env.request());
    expect(await event.response).toBe(env.networkReply);
    await jest.advanceTimersByTimeAsync(1000);await event.settle();
});
test('a synchronous cache-storage error falls back to the tile network',async()=>{
    const env=setup();env.caches.open.mockImplementation(()=>{throw new Error('cache unavailable');});
    const event=env.dispatch('fetch',env.request());
    expect(await event.response).toBe(env.networkReply);await event.settle();
});
test('activation retains old caches and leaves existing clients with their controller',async()=>{
    const env=setup();env.caches.keys.mockResolvedValue(['voyagr-tiles-v51']);
    env.caches.delete.mockRejectedValue(new Error('cache unavailable'));
    await env.dispatch('activate').settle();
    expect(env.caches.delete).not.toHaveBeenCalled();
    expect(env.self.clients.claim).not.toHaveBeenCalled();
});
