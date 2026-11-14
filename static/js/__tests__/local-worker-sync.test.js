/** @jest-environment node */
test('legacy personal-data sync events preserve old queues and send no requests',async()=>{
 const listeners={},network=jest.fn(),db={open:jest.fn()};
 const previous={self:global.self,indexedDB:global.indexedDB,fetch:global.fetch};
 try{
  global.self={addEventListener:(name,fn)=>{listeners[name]=fn;},location:{origin:'https://fixture.test'},clients:{},registration:{}};
  global.fetch=network;global.indexedDB=db;
  jest.isolateModules(()=>{require('../../../service-worker.js');});
  for(const tag of ['sync-trips','sync-routes']){let pending;listeners.sync({tag,waitUntil:p=>{pending=p;}});expect(await pending).toBe(false);}
  expect(network).not.toHaveBeenCalled();expect(db.open).not.toHaveBeenCalled();
 }finally{Object.assign(global,previous);}
});
