/** @jest-environment node */
const {indexedDB,IDBKeyRange}=require('fake-indexeddb');
global.IDBKeyRange=IDBKeyRange;
const Local=require('../modules/privacy/local-store');
let store;
beforeEach(()=>{store=Local.create(indexedDB,{name:'private-'+crypto.randomUUID()});});
afterEach(()=>store.close());
const source=values=>({getItem:key=>values[key]??null});
test('atomic migration preserves originals, scopes known profiles and quarantines shared records',async()=>{
 const values={voyagr_profiles_v1:JSON.stringify({'sb:A':{savedRoutes:'[{"id":"A"}]',voyagr_all_settings:'{"unit_distance":"mi"}'}}),savedRoutes:'[{"id":"legacy"}]',voyagrLocalTrips:'invalid',token:'never-copy'};
 const before=JSON.stringify(values);await store.migrate(source(values));
 expect(await store.read('sb:A','routes')).toEqual([{id:'A'}]);expect(await store.read('sb:B','routes')).toBeNull();expect(await store.read('guest','history')).toBeNull();
 expect((await store.read('legacy:unassigned','legacy')).token).toBeUndefined();expect(JSON.stringify(values)).toBe(before);
 await store.update('sb:A','routes',()=>[{id:'new'}]);await store.migrate(source(values));expect(await store.read('sb:A','routes')).toEqual([{id:'new'}]);
});
test('legacy recovery aborts all categories if any category is malformed',async()=>{
 await store.migrate(source({savedRoutes:'[{"id":"legacy"}]',voyagrLocalTrips:'bad'}));
 await expect(store.claimLegacy('guest')).rejects.toThrow();expect(await store.read('guest','routes')).toBeNull();
});
test('explicit recovery is idempotent and strips server ownership identifiers',async()=>{
 await store.migrate(source({savedRoutes:'[{"id":"legacy"}]',voyagrLocalTrips:'[{"localId":1,"serverId":22}]'}));
 expect(await store.claimLegacy('guest')).toBe(true);expect(await store.claimLegacy('guest')).toBe(false);
 expect(await store.read('guest','routes')).toHaveLength(1);expect((await store.read('guest','history'))[0]).toMatchObject({serverId:null,localId:expect.any(Number)});
});
test('transactional updates serialize concurrent saves and abort without reporting success',async()=>{
 await Promise.all(Array.from({length:15},(_,id)=>store.update('guest','routes',old=>[...(old||[]),{id}])));
 expect(await store.read('guest','routes')).toHaveLength(15);
 await expect(store.update('guest','routes',()=>{throw Error('quota boundary');})).rejects.toThrow();expect(await store.read('guest','routes')).toHaveLength(15);
 await expect(store.update('sb:B','routes',()=>[{}],()=>false)).rejects.toThrow('owner changed');expect(await store.read('sb:B','routes')).toBeNull();
});
test('device clips survive reopening, remain owner-scoped and delete media plus GPS metadata',async()=>{
 const clip=await store.createClip('sb:A','video/webm');await store.appendChunk('sb:A',clip.id,new Blob(['recorded-video'],{type:'video/webm'}));
 await store.addPoint('sb:A',clip.id,{lat:53,lon:-1});await store.finishClip('sb:A',clip.id);store.close();
 expect(await (await store.clipBlob('sb:A',clip.id)).text()).toBe('recorded-video');expect(await store.listClips('sb:B')).toEqual([]);
 await expect(store.clipBlob('sb:B',clip.id)).rejects.toThrow();await store.deleteClip('sb:B',clip.id);expect(await store.listClips('sb:A')).toHaveLength(1);
 await store.deleteClip('sb:A',clip.id);expect(await store.listClips('sb:A')).toEqual([]);await expect(store.clipBlob('sb:A',clip.id)).rejects.toThrow();
});
test('zero-byte clips never claim completed recording, interrupted committed chunks remain recoverable',async()=>{
 const empty=await store.createClip('guest','video/webm');expect((await store.finishClip('guest',empty.id)).status).toBe('partial');
 const clip=await store.createClip('guest','video/webm');await store.appendChunk('guest',clip.id,new Blob(['partial']));store.close();
 expect((await store.listClips('guest')).find(x=>x.id===clip.id).status).toBe('recording');expect(await (await store.clipBlob('guest',clip.id)).text()).toBe('partial');
});
test('local deletion cannot remove other owner data and migration does not resurrect deleted records',async()=>{
 await store.migrate(source({voyagr_profiles_v1:JSON.stringify({'sb:A':{savedRoutes:'[{"id":1}]'}})}));await store.update('sb:B','routes',()=>[{id:2}]);
 await store.clear('sb:A','routes');await store.migrate(source({savedRoutes:'[{"id":1}]'}));expect(await store.read('sb:A','routes')).toBeNull();expect(await store.read('sb:B','routes')).toEqual([{id:2}]);
});
test('unavailable storage fails visibly and permits a later retry',async()=>{const broken=Local.create(null);await expect(broken.open()).rejects.toThrow();await expect(broken.open()).rejects.toThrow();});
test('explicit guest import is atomic and cannot overwrite an existing account collection',async()=>{
 await store.update('guest','routes',()=>[{id:'guest'}]);await store.update('guest','preferences',()=>({unit_distance:'mi'}));
 await store.update('sb:A','preferences',()=>({unit_distance:'km'}));await expect(store.importGuest('sb:A')).rejects.toThrow();expect(await store.read('sb:A','routes')).toBeNull();
 expect(await store.importGuest('sb:B')).toBe(true);expect(await store.read('sb:B','routes')).toEqual([{id:'guest'}]);expect(await store.read('guest','routes')).toEqual([{id:'guest'}]);
});
