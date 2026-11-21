/** Real worker dispatch; fixtures provide only browser/network boundaries. */
test.each(['/robots.txt','/sitemap.xml','/llms.txt','/llms-full.txt'].flatMap(path=>
 ['withdrawn','denied','offline'].map(mode=>[path,mode])))('%s %s never replays cached discovery',async(path,mode)=>{
 const listeners={};const originalSelf=Object.getOwnPropertyDescriptor(global,'self');
 const originals={caches:global.caches,fetch:global.fetch,Response:global.Response};
 const cache=jest.fn(()=>{throw Error('Discovery must not read/write caches');});
 const network={status:mode==='denied'?403:410,body:'withdrawn'};
 class Reply {constructor(body,options){this.body=body;Object.assign(this,options);}}
 Object.defineProperty(global,'self',{configurable:true,value:{location:{origin:'https://private.test'},addEventListener:(name,fn)=>{listeners[name]=fn;}}});
 global.caches={match:cache,open:cache};global.Response=Reply;
 global.fetch=jest.fn(async()=>{if(mode==='offline')throw Error('offline');return network;});
 try{
  jest.isolateModules(()=>require('../../../service-worker.js'));
  const request={method:'GET',url:'https://private.test'+path};let pending;
  listeners.fetch({request,respondWith:result=>{pending=result;}});
  const result=await pending;
  expect(global.fetch).toHaveBeenCalledWith(request,{cache:'no-store'});
  expect(cache).not.toHaveBeenCalled();
  if(mode==='offline'){
   expect(result.status).toBe(503);expect(result.body).not.toContain('##');
   expect(result.headers['Cache-Control']).toBe('no-store');
   expect(result.headers['X-Robots-Tag']).toContain('noindex');
  }else expect(result).toBe(network);
 }finally{Object.defineProperty(global,'self',originalSelf);Object.assign(global,originals);}
});
