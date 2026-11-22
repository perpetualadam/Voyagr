const {IDBFactory}=require('fake-indexeddb');
const Store=require('../modules/privacy/local-store.js');
const Plans=require('../../../prototypes/graphhopper11/saved_plans.js');
const reference=(id='a')=>({schema:3,case_id:'public_case',graph_version:'1'.repeat(64),source_version:'2'.repeat(64),policy_version:'3'.repeat(64),request_binding:id.repeat(64),app_request:{start:'0,0',end:'0,0.02',avoid_caz:false}});
let db,session;
beforeEach(()=>{db=new IDBFactory();session=Plans.create({indexedDB:db,storeModule:Store});});
afterEach(()=>session.close());
test('explicit saves contain selectors only and do not import or modify existing production journeys',async()=>{
 const production=Store.create(db);await production.update('guest','routes',()=>[{id:'legacy',geometry:'untouched'}]);
 const before=JSON.stringify(localStorage);
 expect(await session.list()).toEqual([]);
 await session.save(reference());
 expect(await production.read('guest','routes')).toEqual([{id:'legacy',geometry:'untouched'}]);
 const isolated=Store.create(db,{name:Plans.DB_NAME}),rows=await isolated.read('guest','routes');
 expect(Object.keys(rows[0]).sort()).toEqual(['id','reference','saved_at','schema']);
 expect(await session.get('a'.repeat(64))).toEqual(reference());
 const listed=await session.list();expect(listed).toEqual([{id:'a'.repeat(64),case_id:'public_case',saved_at:rows[0].saved_at,restorable:true}]);
 expect(JSON.stringify(localStorage)).toBe(before);production.close();isolated.close();
});
test('owner scopes and epochs prevent cross-owner reads and stale operations',async()=>{
 const captured=session.capture();await session.save(reference());session.switchOwner('sb:synthetic_b');
 expect(session.current(captured)).toBe(false);expect(await session.list()).toEqual([]);
 await expect(session.get('a'.repeat(64))).rejects.toThrow('unavailable');
 await expect(session.save(reference('c'),captured)).rejects.toThrow('owner changed');
 await session.save(reference('b'));session.switchOwner('guest');
 expect((await session.list()).map(row=>row.id)).toEqual(['a'.repeat(64)]);
 await expect(session.get('b'.repeat(64))).rejects.toThrow('unavailable');
 expect(session.current(captured)).toBe(false);
});
test('owner changes before an asynchronous update cannot write under the next owner',async()=>{
 const pending=session.save(reference());session.switchOwner('sb:synthetic_b');
 await expect(pending).rejects.toThrow();expect(await session.list()).toEqual([]);
 session.switchOwner('guest');expect(await session.list()).toEqual([]);
});
test.each([null,{}, {...reference(),navigation_allowed:true},{...reference(),app_request:{geometry:'untrusted'}}, {...reference(),app_request:{...reference().app_request,avoidance_requirements:[{category:'tolls',enabled:true,mode:'mandatory',proof:true}]}}])('invalid or authority-bearing selector is refused %j',async value=>{
 await expect(session.save(value)).rejects.toThrow();expect(await session.list()).toEqual([]);
});
test('unsupported stored entries are retained and cannot be overwritten by a new save',async()=>{
 const raw=Store.create(db,{name:Plans.DB_NAME});const legacy=[{id:'legacy',geometry:'retained'}];
 await raw.update('guest','routes',()=>legacy);
 expect(await session.list()).toEqual([{id:null,case_id:null,restorable:false}]);
 await expect(session.save(reference())).rejects.toThrow();
 expect(await raw.read('guest','routes')).toEqual(legacy);raw.close();
});
test('storage failure refuses save without falling back to localStorage',async()=>{
 session.close();const before=JSON.stringify(localStorage);session=Plans.create({indexedDB:{open:()=>{throw Error('blocked');}},storeModule:Store});
 await expect(session.save(reference())).rejects.toThrow();expect(JSON.stringify(localStorage)).toBe(before);
});
test('capacity refuses a new entry without trimming existing plans',async()=>{
 for(let i=0;i<20;i++)await session.save({...reference(),request_binding:i.toString(16).padStart(64,'0')});
 await expect(session.save({...reference(),request_binding:'f'.repeat(64)})).rejects.toThrow();
 expect(await session.list()).toHaveLength(20);
});

describe('explicit device-owner coordinator boundary',()=>{
 let identity,target,source;
 beforeEach(()=>{
  identity={owner:'guest',epoch:0};target=new EventTarget();
  source={capture:jest.fn(()=>({...identity})),current:jest.fn(token=>token.owner===identity.owner&&token.epoch===identity.epoch),ready:jest.fn(()=>{throw Error('migration forbidden');}),db:jest.fn(()=>{throw Error('collections forbidden');})};
 });
 const announce=()=>target.dispatchEvent(new Event('voyagr-local-owner-change'));
 test('binds current identity, follows owner epochs and never starts migration or collections',async()=>{
  await session.save(reference());session.bindOwnerCoordinator(source,target);
  const guest=session.capture();expect(await session.list()).toHaveLength(1);
  identity={owner:'sb:test_account',epoch:1};announce();expect(session.current(guest)).toBe(false);
  expect(await session.list()).toEqual([]);await session.save(reference('b'));
  expect(()=>session.switchOwner('guest')).toThrow();
  identity={owner:'guest',epoch:2};announce();expect(session.current(guest)).toBe(false);
  expect(await session.get('a'.repeat(64))).toEqual(reference());
  expect(source.ready).not.toHaveBeenCalled();expect(source.db).not.toHaveBeenCalled();
 });
 test('ignores raw authentication-event payloads and rechecks identity without an event',async()=>{
  session.bindOwnerCoordinator(source,target);const old=session.capture();
  target.dispatchEvent(new CustomEvent('voyagr-auth-changed',{detail:{userId:'forged'}}));
  expect(session.current(old)).toBe(true);
  identity={owner:'sb:changed',epoch:1};await expect(session.save(reference(),old)).rejects.toThrow();
  expect(session.capture().owner).toBe('sb:changed');expect(await session.list()).toEqual([]);
 });
 test.each([null,{owner:'legacy:unassigned',epoch:1},{owner:'sb:bad',epoch:-1},{owner:'invalid',epoch:1}])('unknown identity blocks reads and writes without guest fallback: %j',async value=>{
  session.bindOwnerCoordinator(source,target);const old=session.capture();
  source.capture.mockReturnValue(value);announce();expect(session.current(old)).toBe(false);
  await expect(session.list()).rejects.toThrow();await expect(session.save(reference())).rejects.toThrow();
  source.capture.mockImplementation(()=>({...identity}));announce();expect(await session.list()).toEqual([]);
 });
 test('throwing or unconfirmed identity fails closed and close unsubscribes',async()=>{
  session.bindOwnerCoordinator(source,target);source.current.mockReturnValue('true');announce();
  await expect(session.list()).rejects.toThrow();
  source.capture.mockImplementation(()=>{throw Error('unavailable');});announce();await expect(session.list()).rejects.toThrow();
  session.close();source.capture.mockClear();announce();expect(source.capture).not.toHaveBeenCalled();
 });
 test('owner change while save is pending cannot redirect the write',async()=>{
  session.bindOwnerCoordinator(source,target);const pending=session.save(reference());
  identity={owner:'sb:new',epoch:1};announce();await expect(pending).rejects.toThrow();
  expect(await session.list()).toEqual([]);identity={owner:'guest',epoch:2};announce();expect(await session.list()).toEqual([]);
 });
});
