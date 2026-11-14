/** @jest-environment node */
const {JSDOM}=require('jsdom');const fs=require('fs');const {indexedDB,IDBKeyRange}=require('fake-indexeddb');
global.IDBKeyRange=IDBKeyRange;const Store=require('../modules/privacy/local-store');
let dom,w,local,store;
beforeEach(async()=>{
 dom=new JSDOM('<p id="localDataStatus"></p><input id="localRecordHistory" type="checkbox"><div id="savedRoutesList"></div>',{url:'https://device.test',runScripts:'outside-only'});w=dom.window;w.crypto.randomUUID=()=>crypto.randomUUID();
 store=Store.create(indexedDB,{name:'coordinator-'+crypto.randomUUID()});w.VoyagrLocalStore={...Store,create:()=>store};w.fetch=jest.fn(()=>{throw Error('Unexpected cloud request');});
 w.eval(fs.readFileSync(require.resolve('../app/local-data'),'utf8'));local=w.VoyagrLocalData;await local.ready();await new Promise(resolve=>setImmediate(resolve));
});
afterEach(()=>{store.close();dom.window.close();});
test('fresh history defaults OFF, optional preference writes remain local and login never grants cloud',async()=>{
 expect(await local.historyEnabled()).toBe(false);await local.recordDestination('Private place',53,-1,'search');expect(await local.getDestinations()).toEqual([]);
 await local.preferenceRequest({body:'{"distance_unit":"mi"}'});expect(await local.read('apiPreferences')).toEqual({distance_unit:'mi'});
 local.switchOwner('sb:A');expect(await local.historyEnabled()).toBe(false);expect(w.fetch).not.toHaveBeenCalled();
});
test('explicit history is scoped to owner; stale reads and writes cannot move private data between accounts',async()=>{
 await local.update('localOptions',()=>({recordHistory:true}));await local.recordDestination('Private A',53,-1,'search');expect(await local.getDestinations()).toHaveLength(1);
 const a=local.capture();local.switchOwner('sb:B');expect(await local.getDestinations()).toEqual([]);
 await expect(local.update('routes',()=>[{id:'A'}],a)).rejects.toThrow();await expect(local.read('destinations',a)).rejects.toThrow();expect(await local.getRoutes()).toEqual([]);
 expect(w.fetch).not.toHaveBeenCalled();
});
test('account switching during history permission lookup cannot save a destination to the new owner',async()=>{
 await local.update('localOptions',()=>({recordHistory:true}));const pending=local.recordDestination('A only',53,-1);local.switchOwner('sb:B');await expect(pending).rejects.toThrow();expect(await local.getDestinations()).toEqual([]);
});
test('export has versioned current-owner data without credentials, media metadata is separate and deletion persists',async()=>{
 await local.update('routes',()=>[{id:'A'}]);local.switchOwner('sb:B');await local.update('routes',()=>[{id:'B'}]);w.localStorage.setItem('sb-token','secret');
 const exported=await local.exportData('all');expect(exported.version).toBe(1);expect(exported.records.routes).toEqual([{id:'B'}]);expect(JSON.stringify(exported)).not.toContain('secret');
 await store.clear('sb:B','routes');expect((await local.exportData('all')).records.routes).toBeNull();expect(await store.read('guest','routes')).toEqual([{id:'A'}]);
});
test('profile hydration and outgoing saves cannot install A after a later B switch; optional transports stay disabled',async()=>{
 w.VoyagrSettingsSnapshot=require('../modules/navigation/settings-snapshot');
 w.eval(fs.readFileSync(require.resolve('../app/profile-store-orchestration'),'utf8'));const profile=w.VoyagrProfileStoreOrchestration;
 profile.bind({call:{loadAllSettings:jest.fn(),applySettingsToUI:jest.fn(),loadSavedRoutes:jest.fn()}});
 await store.update('sb:A','preferences',()=>({unit_distance:'km'}));await store.update('sb:B','preferences',()=>({unit_distance:'mi'}));
 const read=store.read.bind(store);let release;store.read=async(owner,category)=>{if(owner==='sb:A'&&category==='preferences')return new Promise(resolve=>{release=resolve;});return read(owner,category);};
 const a=profile.switchActiveProfile('sb:A');while(!release)await new Promise(resolve=>setImmediate(resolve));expect(await profile.switchActiveProfile('sb:B')).toBe(true);release({unit_distance:'km'});expect(await a).toBe(false);
 expect(JSON.parse(w.localStorage.getItem('voyagr_all_settings')).unit_distance).toBe('mi');expect(profile.scheduleSupabaseProfileSync()).toBe(false);expect(await profile.pullProfileSnapshotFromSupabase()).toBe(false);expect(w.fetch).not.toHaveBeenCalled();
});
test('another tab runtime projection cannot poison outgoing preference saves',async()=>{
 w.eval(fs.readFileSync(require.resolve('../app/profile-store-orchestration'),'utf8'));const profile=w.VoyagrProfileStoreOrchestration;
 profile.bind({call:{loadAllSettings:jest.fn(),applySettingsToUI:jest.fn(),loadSavedRoutes:jest.fn()}});
 await store.update('sb:A','preferences',()=>({unit_distance:'mi'}));await profile.switchActiveProfile('sb:A');
 w.localStorage.setItem('voyagr_all_settings','{"unit_distance":"km","privateOtherTabValue":"B"}');await profile.persistActiveProfile();
 expect(await store.read('sb:A','preferences')).toMatchObject({unit_distance:'mi'});expect((await store.read('sb:A','preferences')).privateOtherTabValue).toBeUndefined();
});
test('saved places commit to the selected owner without cloud calls and retain selected coordinates',async()=>{
 w.document.body.insertAdjacentHTML('beforeend','<input id="end" value="Chosen place" data-lat="53.5" data-lon="-1.3">');
 w.eval(fs.readFileSync(require.resolve('../app/search-favorites-orchestration'),'utf8'));const favorites=w.VoyagrSearchFavoritesOrchestration;
 favorites.bind({call:{showStatus:jest.fn()},getCurrentLat:()=>55,getCurrentLon:()=>-2});w.prompt=jest.fn().mockReturnValueOnce('Home').mockReturnValueOnce('home');
 await favorites.addCurrentToFavorites();expect(await local.read('favourites')).toEqual([expect.objectContaining({name:'Home',lat:53.5,lon:-1.3,address:'Chosen place'})]);expect(w.fetch).not.toHaveBeenCalled();
 local.switchOwner('sb:B');expect(await local.read('favourites')).toBeNull();
});
test('history OFF does not archive a completed route; enabled history writes only the current device profile',async()=>{
 w.document.body.insertAdjacentHTML('beforeend','<input id="start" value="Start"><input id="end" value="Finish">');
 w.eval(fs.readFileSync(require.resolve('../app/trip-history-orchestration'),'utf8'));const history=w.VoyagrTripHistoryOrchestration;
 history.bind({tripHistory:()=>require('../modules/navigation/trip-history'),getRoutePolyline:()=>[[53,-1],[53.1,-1]],getCurrentRoutingMode:()=> 'auto'});
 const route={distance_km:10,duration_minutes:20,fuel_cost:2};await history.persistCompletedTrip(route);expect(await local.read('history')).toBeNull();
 await local.update('localOptions',()=>({recordHistory:true}));await history.persistCompletedTrip(route);expect(await local.read('history')).toEqual([expect.objectContaining({start_address:'Start',end_address:'Finish',serverId:null})]);expect(w.fetch).not.toHaveBeenCalled();
});
