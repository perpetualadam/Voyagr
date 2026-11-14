/** @jest-environment node */
const {JSDOM} = require('jsdom');
const fs = require('node:fs');
const ConsentPolicy = require('../modules/privacy/consent-policy');
const KEY = 'voyagr_public_auth_config_v1';
const config = {supabase_url: 'https://project.test', supabase_anon_key: 'public-test-key'};
const windows = [];
function page({saved, fetch}) {
  const dom = new JSDOM('<p id="accountStatus"></p>', {url: 'https://device.test', runScripts: 'outside-only'});
  windows.push(dom.window);
  const w = dom.window;
  if (saved) w.localStorage.setItem(KEY, saved);
  w.fetch = fetch;
  const client = {auth: {getSession: jest.fn().mockResolvedValue({data: {session: {user: {id: 'cached-account'}}}}), onAuthStateChange: jest.fn()}};
  w.supabase = {createClient: jest.fn(() => client)};
  w.eval(fs.readFileSync(require.resolve('../app/supabase-auth-orchestration'), 'utf8'));
  const calls = {ensureProfileExists: jest.fn(), switchActiveProfile: jest.fn().mockResolvedValue(true), pullProfileSnapshotFromSupabase: jest.fn().mockResolvedValue(false), scheduleSupabaseProfileSync: jest.fn().mockReturnValue(false)};
  w.VoyagrSupabaseAuthOrchestration.bind({call: calls});
  return {w, calls, init: () => w.VoyagrSupabaseAuthOrchestration.initSupabaseAuth()};
}
afterEach(() => { windows.splice(0).forEach(w => w.close()); });
const receipt = changes => JSON.stringify({version: 1, origin: 'https://device.test', fetchedAt: Date.now(), config, ...changes});

test('only public bootstrap is cached; existing SDK session restores its owner after network failure', async () => {
  const optionalGrant = ConsentPolicy.choose(null, 'history', true);
  expect(ConsentPolicy.allowed(optionalGrant, 'history')).toBe(true);
  const online = page({fetch: jest.fn().mockResolvedValue({ok: true, json: async () => ({...config, private_token: 'must-not-copy', history: true, privacy: optionalGrant})})});
  await online.init();
  const saved = online.w.localStorage.getItem(KEY);
  expect(JSON.parse(saved).config).toEqual(config);
  expect(saved).not.toContain('must-not-copy');expect(saved).not.toContain('history');
  expect(saved).not.toContain('cached-account');expect(saved).not.toContain('access_token');
  expect(ConsentPolicy.allowed(JSON.parse(saved).config.privacy, 'history')).toBe(false);
  const offline = page({saved, fetch: jest.fn().mockRejectedValue(new TypeError('Network unavailable'))});
  await offline.init();
  expect(offline.w.supabase.createClient).toHaveBeenCalledWith(config.supabase_url, config.supabase_anon_key, expect.any(Object));
  expect(offline.calls.switchActiveProfile).toHaveBeenCalledWith('sb:cached-account');
});
test('the actual worker offline response can use public bootstrap without caching the response', async () => {
  const saved = receipt();
  const offline = page({saved, fetch: jest.fn().mockResolvedValue({ok: false, status: 503, json: async () => ({offline: true})})});
  await offline.init();
  expect(offline.calls.switchActiveProfile).toHaveBeenCalledWith('sb:cached-account');
  expect(offline.w.localStorage.getItem(KEY)).toBe(saved);
});
test.each([
  ['invalid JSON', '{'],
  ['unknown schema', receipt({version: 2})],
  ['different origin', receipt({origin: 'https://other.test'})],
  ['expired', receipt({fetchedAt: Date.now() - 25 * 60 * 60 * 1000})],
  ['future timestamp', receipt({fetchedAt: Date.now() + 60000})],
  ['credential URL', receipt({config: {...config, supabase_url: 'https://user:password@project.test'}})],
  ['secret key', receipt({config: {...config, supabase_anon_key: 'sb_secret_not-a-public-key'}})],
])('%s cannot bootstrap an offline account', async (_, saved) => {
  const offline = page({saved, fetch: jest.fn().mockRejectedValue(new TypeError('Network unavailable'))});
  await offline.init();
  expect(offline.w.supabase.createClient).not.toHaveBeenCalled();
  expect(offline.calls.switchActiveProfile).not.toHaveBeenCalled();
});
test('explicit online account disable clears the old bootstrap instead of restoring it', async () => {
  const online = page({saved: receipt(), fetch: jest.fn().mockResolvedValue({ok: true, json: async () => ({})})});
  await online.init();
  expect(online.w.localStorage.getItem(KEY)).toBeNull();
  expect(online.w.supabase.createClient).not.toHaveBeenCalled();
});
test.each([401, 403, 500, 503])('online HTTP %s does not fall back to cached account configuration', async status => {
  const online = page({saved: receipt(), fetch: jest.fn().mockResolvedValue({ok: false, status, json: async () => ({})})});
  await online.init();
  expect(online.w.supabase.createClient).not.toHaveBeenCalled();
  expect(online.calls.switchActiveProfile).not.toHaveBeenCalled();
});
test('public bootstrap alone cannot restore an account without an existing SDK session', async () => {
  const offline = page({saved: receipt(), fetch: jest.fn().mockRejectedValue(new TypeError('Network unavailable'))});
  offline.w.supabase.createClient().auth.getSession.mockResolvedValue({data: {session: null}});
  await offline.init();
  expect(offline.calls.switchActiveProfile).toHaveBeenCalledWith('guest');
  expect(offline.calls.switchActiveProfile).not.toHaveBeenCalledWith('sb:cached-account');
});
test('a failed public-bootstrap write does not break online account initialization', async () => {
  const online = page({fetch: jest.fn().mockResolvedValue({ok: true, json: async () => config})});
  jest.spyOn(online.w.Storage.prototype, 'setItem').mockImplementation(() => {throw Error('Storage unavailable');});
  await online.init();
  expect(online.calls.switchActiveProfile).toHaveBeenCalledWith('sb:cached-account');
  expect(online.w.localStorage.getItem(KEY)).toBeNull();
});
