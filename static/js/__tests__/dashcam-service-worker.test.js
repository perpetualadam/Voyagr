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
