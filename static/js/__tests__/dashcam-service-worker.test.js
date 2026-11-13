test.each(['GET', 'POST', 'DELETE'])('dashcam %s bypasses cache and offline replay', async method => {
    const listeners = {};
    const originalSelf = Object.getOwnPropertyDescriptor(global, 'self');
    const originalCaches = global.caches;
    const originalFetch = global.fetch;
    const originalResponse = global.Response;
    class Reply { constructor(body, options) { this.body=body; Object.assign(this, options); } }
    const refuseCache = () => { throw new Error('Private media must never touch cache storage'); };
    Object.defineProperty(global, 'self', { configurable: true, value: {
        addEventListener:(name, fn)=>{ listeners[name]=fn; }, location:{origin:'https://app.test'},
    } });
    global.caches = { match:refuseCache, open:refuseCache };
    global.fetch = async () => { throw new Error('offline'); };
    global.Response = Reply;
    try {
        // Load the actual service worker with only browser/network boundaries replaced.
        jest.isolateModules(() => require('../../../service-worker.js'));
        const request = { url:'https://app.test/api/dashcam/recordings/secret/video', method, headers:{has:()=>false} };
        let pending;
        listeners.fetch({ request, respondWith:value=>{pending=value;} });
        const response = await pending;
        expect(response.status).toBe(503);
        expect(response.body).not.toContain('queued');
        expect(response.body).toContain('Private recordings unavailable offline');
    } finally {
        Object.defineProperty(global, 'self', originalSelf);
        global.caches=originalCaches; global.fetch=originalFetch; global.Response=originalResponse;
    }
});

test.each(['/api/cache-statistics', '/api/alternative-route-cache-info', '/api/ml-predictions'])('%s never replays cached historical locations', async path => {
    const listeners = {};
    const originalSelf = Object.getOwnPropertyDescriptor(global, 'self');
    const originals = {caches: global.caches, fetch: global.fetch, Response: global.Response};
    class Reply { constructor(body, options) { this.body = body; Object.assign(this, options); } }
    const cacheRead = jest.fn(() => { throw Error('Historical location cache must not be read'); });
    Object.defineProperty(global, 'self', {configurable: true, value: {
        addEventListener: (name, fn) => { listeners[name] = fn; }, location: {origin: 'https://app.test'},
    }});
    global.caches = {match: cacheRead, open: cacheRead};
    global.fetch = async () => { throw Error('offline'); };
    global.Response = Reply;
    try {
        jest.isolateModules(() => require('../../../service-worker.js'));
        let pending;
        listeners.fetch({request: {url: 'https://app.test' + path, method: 'GET', headers: {has: () => false}}, respondWith: value => { pending = value; }});
        const response = await pending;
        expect(response.status).toBe(503);
        expect(response.body).toContain('not cached for privacy');
        expect(cacheRead).not.toHaveBeenCalled();
    } finally {
        Object.defineProperty(global, 'self', originalSelf);
        Object.assign(global, originals);
    }
});
