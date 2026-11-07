const PWA=require('../modules/ui/pwa-install.js');
const fs=require('fs'),vm=require('vm'),nodeCrypto=require('crypto');
const path=require('path');
const origin='https://app.test';
class Reply{
 constructor(body,options={}){this.bytes=Buffer.from(body);this.status=options.status||200;this.ok=this.status>=200&&this.status<300;this.type='basic';this.headers={get:()=>null};}
 clone(){return new Reply(this.bytes,{status:this.status});}async text(){return this.bytes.toString();}async arrayBuffer(){return this.bytes.buffer.slice(this.bytes.byteOffset,this.bytes.byteOffset+this.bytes.length);}
}
const key=x=>new URL(typeof x==='string'?x:x.url,origin).href;
function bundle(release='1'.repeat(64)){
 const names=['avoidance-integrity.js','journey-plan.js','journey-modes.js','calculate-route-orchestration.js','navigation-lifecycle-orchestration.js','route-selection.js','offline-navigation.js','voyagr-app.js','app.js'];
 const bodies=new Map(),assets=names.map((n,i)=>{const body='// '+release+' '+n;const digest=nodeCrypto.createHash('sha256').update(body).digest('hex');const name=String(i).padStart(3,'0')+'-'+n;const url=`/_voyagr/assets/${release}/${digest}/${name}`;bodies.set(key(url),body);return {url,sha256:digest,name,bytes:Buffer.byteLength(body)};});
 return {assets,bodies,html:'<html><head><script type="application/json" id="voyagr-asset-manifest">'+JSON.stringify({schema:1,release,assets})+'</script></head><body>coherent '+release+'</body></html>'};
}
function worker(){
 const listeners={},stores=new Map(),deleted=[],boundaries={skipWaiting:jest.fn(),claim:jest.fn()};let fetchImpl=async()=>{throw Error('offline');};
 function cache(name){if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);return {put:async(q,r)=>data.set(key(q),r.clone()),match:async q=>data.get(key(q))?.clone(),keys:async()=>[...data.keys()].map(url=>({url})),delete:async q=>data.delete(key(q))};}
 const caches={open:async n=>cache(n),keys:async()=>[...stores.keys()],delete:async n=>{deleted.push(n);return stores.delete(n);},match:async q=>{for(const n of stores.keys()){const found=await cache(n).match(q);if(found)return found;}}};
 const self={location:{origin},addEventListener:(n,f)=>listeners[n]=f,skipWaiting:boundaries.skipWaiting,clients:{claim:boundaries.claim}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../../service-worker.js'),'utf8'),{self,caches,crypto:nodeCrypto.webcrypto,Response:Reply,URL,Uint8Array,setTimeout,clearTimeout,console:{log:()=>{}},fetch:(q,o)=>fetchImpl(q,o),indexedDB:{open:()=>{throw Error('User storage must not be touched');}}});
 return {cache,stores,deleted,boundaries,setFetch:f=>fetchImpl=f,network:b=>fetchImpl=async q=>key(q)===key('/')?new Reply(b.html):b.bodies.has(key(q))?new Reply(b.bodies.get(key(q))):new Reply('missing',{status:404}),
 install:async()=>{let p;listeners.install({waitUntil:x=>p=x});await p;},message:data=>listeners.message({data,source:{postMessage:()=>{}},waitUntil:()=>{throw Error('Legacy reset must not run');}}),activate:async()=>{let p;listeners.activate({waitUntil:x=>p=x});await p;},fetch:async url=>{let p;const tasks=[];listeners.fetch({waitUntil:x=>tasks.push(x),request:{url:key(url),method:'GET',headers:{has:()=>false}},respondWith:x=>p=x});const result=await p;await Promise.all(tasks);return result;}};
}
test('fresh install commits one verified offline release and never forces control',async()=>{
 const w=worker(),b=bundle();w.network(b);await w.install();expect(w.boundaries.skipWaiting).not.toHaveBeenCalled();
 await w.activate();expect(w.boundaries.claim).not.toHaveBeenCalled();w.setFetch(async()=>{throw Error('offline');});
 expect(await (await w.fetch('/')).text()).toBe(b.html);
 for(const a of b.assets)expect(await (await w.fetch(a.url)).text()).toBe(b.bodies.get(key(a.url)));
});
test('v51 upgrade preserves caches and does not interrupt active or concurrent clients',async()=>{
 const w=worker();await w.cache('voyagr-static-v51').put('/old.js',new Reply('old'));
 await w.cache('other-app').put('/other.js',new Reply('other'));w.network(bundle());await w.install();await w.activate();
 w.message({type:'SKIP_WAITING'});w.message({type:'CLEAR_CACHE'});expect(w.deleted).toEqual([]);expect(w.stores.has('voyagr-static-v51')).toBe(true);expect(w.stores.has('other-app')).toBe(true);
 expect(w.boundaries.skipWaiting).not.toHaveBeenCalled();expect(w.boundaries.claim).not.toHaveBeenCalled();
 const waiting=PWA.buildCheckForUpdatesRegistrationOutcomePlan({hasRegistration:true,hasWaiting:true});
 expect(waiting.action).toBe('waiting-for-tabs');expect(waiting.skipWaitingMessageType).toBeUndefined();
});
test('Cloudflare stale successful bytes fail digest verification, not install silently',async()=>{
 const w=worker(),b=bundle();w.setFetch(async q=>new Reply(key(q)===key('/')?b.html:'stale-edge-body'));
 await expect(w.install()).rejects.toThrow(/digest/);expect(w.stores.has('voyagr-coherent-shell-v52')).toBe(false);
});
test('interrupted new release retains the previous coherent shell and exact assets',async()=>{
 const w=worker(),old=bundle(),next=bundle('2'.repeat(64));w.network(old);await w.install();
 next.bodies.delete(key(next.assets[3].url));w.network(next);await expect(w.install()).rejects.toThrow();
 w.setFetch(async()=>{throw Error('offline');});expect(await (await w.fetch('/')).text()).toBe(old.html);
 expect(await (await w.fetch(next.assets[3].url)).status).toBe(503);
 expect(await (await w.fetch(old.assets[3].url)).text()).toBe(old.bodies.get(key(old.assets[3].url)));
});
test('wrong or stale manifest cannot publish an incomplete dependency set',async()=>{
 const w=worker(),b=bundle();const manifest={schema:1,release:'1'.repeat(64),assets:b.assets.slice(1)};
 b.html='<script type="application/json" id="voyagr-asset-manifest">'+JSON.stringify(manifest)+'</script>';w.network(b);
 await expect(w.install()).rejects.toThrow(/Incomplete/);
});
test('offline fallback never borrows another script query version',async()=>{
 const w=worker();await w.cache('voyagr-static-v51').put('/static/js/test.js?v=old',new Reply('old'));
 expect((await w.fetch('/static/js/test.js?v=new')).status).toBe(503);
});
test('corrupted release cache is never used offline',async()=>{
 const w=worker(),b=bundle();w.network(b);await w.install();const a=b.assets[0];
 await w.cache('voyagr-release-v52-'+'1'.repeat(64)).put(a.url,new Reply('wrong-body'));
 w.setFetch(async()=>{throw Error('offline');});expect((await w.fetch(a.url)).status).toBe(503);
});
test('offline-to-online transition stages a complete new release',async()=>{
 const w=worker(),old=bundle(),next=bundle('2'.repeat(64));w.network(old);await w.install();
 w.setFetch(async()=>{throw Error('offline');});expect(await (await w.fetch('/')).text()).toBe(old.html);
 w.network(next);expect(await (await w.fetch('/')).text()).toBe(next.html);
});

let generated;
beforeAll(()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../../../voyagr/asset_release.py'),'utf8');
 const release='a'.repeat(64);
 const guard=/guard = """<script>([\s\S]*?)<\/script>"""/.exec(source)[1].replaceAll('RELEASE',JSON.stringify(release)).replaceAll('ASSETS','[]');
 const prefix=/prefix = f"([^"\n]*(?:\\.[^"\n]*)*)"/.exec(source)[1];
 const suffix=/suffix = f"([^"\n]*(?:\\.[^"\n]*)*)"/.exec(source)[1];
 const expand=(s,i)=>s.replaceAll('{release}',release).replaceAll('{number}',String(i)).replaceAll('\\n','\n');
 generated={html:'<head><script>'+guard+'</script>',scripts:['window.firstExecuted=true;','window.entryExecuted=true;'].map((body,i)=>expand(prefix,i)+body+expand(suffix,i))};
});
function page(){const messages=[];const ctx={messages,document:{body:{prepend:e=>messages.push(e.textContent)},getElementById:()=>null,createElement:()=>({setAttribute:()=>{}}),addEventListener:()=>{}},addEventListener:()=>{}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(/<head>\s*<script>([\s\S]*?)<\/script>/.exec(generated.html)[1],ctx);return ctx;}
test('classic script chain executes in order for a coherent fresh page',()=>{const ctx=page();generated.scripts.forEach(s=>vm.runInContext(s,ctx));expect(ctx.firstExecuted).toBe(true);expect(ctx.entryExecuted).toBe(true);});
test('missing predecessor blocks entry without touching saved state or looping reload',()=>{const ctx=page(),saved={journey:'retained'};ctx.saved=saved;expect(()=>vm.runInContext(generated.scripts[1],ctx)).toThrow(/update required/);expect(ctx.entryExecuted).toBeUndefined();expect(ctx.saved).toBe(saved);expect(ctx.messages.some(m=>m.includes('update is incomplete'))).toBe(true);});
test('asset error stops the chain before later app initialization',()=>{const ctx=page();vm.runInContext(generated.scripts[0],ctx);ctx.VoyagrAssetRelease.fail();expect(()=>vm.runInContext(generated.scripts[1],ctx)).toThrow();expect(ctx.entryExecuted).toBeUndefined();});

test('an excessive release budget rejects before publication',async()=>{
 const w=worker(),b=bundle();b.assets.forEach(a=>{a.bytes=5*1024*1024;});
 b.html='<script type="application/json" id="voyagr-asset-manifest">'+JSON.stringify({schema:1,release:'1'.repeat(64),assets:b.assets})+'</script>';w.network(b);
 await expect(w.install()).rejects.toThrow(/budget/);expect(w.stores.has('voyagr-coherent-shell-v52')).toBe(false);
});

test('immutable HTTP reuse is verified and a stale successful body gets only one bypass retry',async()=>{
 const w=worker(),b=bundle(),asset=b.assets[0],attempts=[];
 w.setFetch(async(q,o)=>{attempts.push(o.cache);return new Reply(o.cache==='reload'?b.bodies.get(key(asset.url)):'stale-http-body');});
 expect(await (await w.fetch(asset.url)).text()).toBe(b.bodies.get(key(asset.url)));expect(attempts).toEqual(['default','reload']);
});

test.each(['v51','v52'])('map data cached by %s survives a verified release upgrade offline',async version=>{
 const w=worker(),b=bundle();const url='/map/data/gb/11/1016/662.pbf';
 await w.cache('voyagr-tiles-'+version).put(url,new Reply('retained '+version));
 w.network(b);await w.install();await w.activate();w.setFetch(async()=>{throw Error('offline');});
 expect(await (await w.fetch(url)).text()).toBe('retained '+version);
 expect(w.deleted).toEqual([]);expect(w.boundaries.claim).not.toHaveBeenCalled();
});

test('empty worker messages cannot throw or force activation/reset',()=>{
 const w=worker();expect(()=>w.message(null)).not.toThrow();expect(()=>w.message(undefined)).not.toThrow();
 expect(w.boundaries.skipWaiting).not.toHaveBeenCalled();expect(w.boundaries.claim).not.toHaveBeenCalled();expect(w.deleted).toEqual([]);
});
