'use strict';
// Real candidate page + Chromium/IndexedDB. Synthetic records only. No production URL input.
for (const proxy of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete process.env[proxy];
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const {randomUUID, randomBytes} = require('node:crypto');
const origin = 'http://127.0.0.1:5000';

async function waitFor(page, predicate, argument) {
  // Await each result explicitly: a Promise object itself is truthy and must not
  // satisfy a polling condition before its asynchronous operation completes.
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      if (await page.evaluate(predicate, argument)) return true;
    } catch (error) {
      // Startup/account hydration intentionally invalidates captured old-owner
      // reads. Retry that transition; propagate every other storage error.
      if (!/Device owner changed|Execution context was destroyed/.test(error.message)) throw error;
    }
    if (Date.now() > deadline) throw Error('Asynchronous browser condition timed out');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

async function settleOwner(page) {
  // Initial auth and profile hydration can legitimately cancel old-owner writes.
  // Wait for a stable owner generation before simulating a user's control change.
  const deadline = Date.now() + 10000;
  let previous = '', stableSince = Date.now();
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.VoyagrLocalData && JSON.stringify(VoyagrLocalData.capture()));
    if (state !== previous) { previous = state; stableSince = Date.now(); }
    if (state && Date.now() - stableSince >= 300) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error('Device profile did not settle');
}

async function main() {
  let browser;
  let context;
  let page;
  const configStatuses = [];
  const assetFailures = [];
  const pageErrorTypes = [];
  let checks = 0;
  let phase = 'candidate startup';
  const check = (name, condition) => {
    assert.ok(condition, name);
    checks++;
    console.log('PASS: ' + name);
  };
  try {
    const options = {headless: true, acceptDownloads: true, executablePath: process.env.CHROMIUM_BINARY || undefined,
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']};
    context = await chromium.launchPersistentContext('/tmp/privacy-browser-profile', options);
    browser = context.browser();
    console.log('INFO: Chromium ' + browser.version() + '; Node ' + process.version);
    // No geolocation/microphone/camera permission and no location fixture is needed.
    page = context.pages()[0] || await context.newPage();
    const errors = [];
    const uploads = [];
    const external = [];
    const noteError = error => { errors.push(error.name); pageErrorTypes.push(error.name + ':' + error.message.slice(0, 160)); };
    context.on('page', p => p.on('pageerror', noteError));
    page.on('pageerror', noteError);
    await context.addInitScript(() => {
      let release;
      Object.defineProperty(window, 'VoyagrAssetRelease', {configurable: true,
        get: () => release,
        set(value) {
          release = value;
          const enter = value.enter, complete = value.complete;
          let last = -1;
          value.enter = function(r, i) {
            const accepted = enter.call(this, r, i);
            if (!accepted && !window.__labAssetFailure) window.__labAssetFailure = {incoming: i, completed: last};
            return accepted;
          };
          value.complete = function(r, i) { complete.call(this, r, i); last = i; };
        }
      });
    });
    context.on('request', request => {
      const url = new URL(request.url());
      if (url.protocol.startsWith('http') && !['127.0.0.1', 'gateway'].includes(url.hostname)) external.push(url.hostname);
      if (['POST', 'PUT', 'PATCH'].includes(request.method()) &&
          (/\/api\/(trip-history|favorites|search-history|app-settings|traffic-patterns|ml-predictions|dashcam)/.test(url.pathname) ||
           /\/rest\/v1\/voyagr_profile_snapshots/.test(url.pathname))) uploads.push(url.pathname);
    });
    context.on('response', response => {
      if (new URL(response.url()).pathname === '/api/config') configStatuses.push(response.status());
      if (new URL(response.url()).pathname.startsWith('/_voyagr/assets/') && response.status() !== 200)
        assetFailures.push(new URL(response.url()).pathname.split('/').pop() + ':' + response.status());
    });
    const deadline = Date.now() + 90000;
    while (true) {
      try {
        const response = await context.request.get(origin, {timeout: 5000});
        if (response.status() === 200) break;
      } catch (_) {}
      if (Date.now() > deadline) throw Error('Candidate startup timed out');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    await page.goto(origin, {waitUntil: 'domcontentloaded'});
    phase = 'full candidate bootstrap';
    await page.waitForFunction(() => window.VoyagrLocalData && window.VoyagrSupabaseAuthOrchestration?.getSupabaseClient(), {timeout: 30000});
    await page.evaluate(() => VoyagrLocalData.ready());
    await settleOwner(page);
    if (await page.locator('#safetyNoticeOverlay').isVisible()) {
      await page.locator('#safetyNoticeAgree').check();
      await page.locator('#safetyNoticeContinue').click();
      await page.locator('#safetyNoticeOverlay').waitFor({state: 'hidden'});
    }
    check('Full candidate bootstraps local storage and real auth client', await page.evaluate(() => VoyagrLocalData.getOwner() === 'guest'));
    for (const id of ['privacyCloudSync', 'privacyDashcamBackup', 'privacyDiagnostics', 'privacyAnalytics']) {
      check(id + ' starts OFF', !(await page.locator('#' + id).isChecked()));
    }
    check('History starts OFF', !(await page.evaluate(() => VoyagrLocalData.historyEnabled())));
    await page.evaluate(async () => {
      await VoyagrLocalData.recordDestination('must-not-save', 0, 0);
    });
    check('History OFF prevents a recent-search record', (await page.evaluate(() => VoyagrLocalData.getDestinations())).length === 0);
    // Open the actual Settings tab, retaining its normal handlers and collapsed groups.
    phase = 'settings history checkbox';
    await page.evaluate(() => { expandBottomSheet(); switchTab('settings'); });
    await page.locator('#localDataControls').evaluate(element => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
      element.scrollIntoView();
    });
    await page.locator('#distanceUnit').selectOption('km');
    await waitFor(page, async () => (await VoyagrLocalData.read('preferences'))?.unit_distance === 'km');
    check('Actual distance setting saves to the local profile', true);
    const history = page.locator('#localRecordHistory');
    await history.check();
    await waitFor(page, () => VoyagrLocalData.historyEnabled());
    check('Actual history checkbox enables device recording', await history.isChecked());
    await page.evaluate(() => VoyagrLocalData.recordDestination('synthetic-local-search', 0, 0));
    check('Explicit history choice records locally', (await page.evaluate(() => VoyagrLocalData.getDestinations())).length === 1);
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.VoyagrLocalData);
    await settleOwner(page);
    await waitFor(page, async () => window.VoyagrLocalData && await VoyagrLocalData.historyEnabled() &&
      (await VoyagrLocalData.getDestinations()).length === 1 && document.getElementById('localRecordHistory').checked);
    check('Consent and local records survive full-page reload', true);
    check('Selected distance units survive reload', await page.locator('#distanceUnit').inputValue() === 'km');
    const peer = await context.newPage();
    phase = 'cross-tab history withdrawal';
    await peer.goto(origin, {waitUntil: 'domcontentloaded'});
    await peer.waitForFunction(() => window.VoyagrLocalData && window.VoyagrSupabaseAuthOrchestration?.getSupabaseClient());
    await settleOwner(peer);
    await peer.evaluate(() => VoyagrLocalData.setPrivacyChoice('history', false));
    await page.waitForFunction(() => !document.getElementById('localRecordHistory').checked);
    await page.evaluate(() => VoyagrLocalData.recordDestination('blocked-after-withdrawal', 0, 0));
    check('Withdrawal in another real tab stops new recording', (await page.evaluate(() => VoyagrLocalData.getDestinations())).length === 1);
    await peer.close();
    await page.evaluate(() => VoyagrLocalData.update('favourites', () => [{name: 'synthetic-guest-place', lat: 0, lon: 0}]));
    // Real signup/session callbacks, not a direct switchOwner call.
    const credentials = () => ({email: 'browser-lab-' + randomUUID() + '@example.com', password: randomBytes(24).toString('hex')});
    const accountA = credentials();
    const accountB = credentials();
    const signUp = async account => {
      phase = 'real browser signup';
      const result = await page.evaluate(async value => {
        const response = await VoyagrSupabaseAuthOrchestration.getSupabaseClient().auth.signUp(value);
        return {ok: !response.error, owner: response.data?.user?.id};
      }, account);
      assert.ok(result.ok, 'Synthetic browser signup');
      await page.waitForFunction(owner => VoyagrLocalData.getOwner() === 'sb:' + owner, result.owner);
      await settleOwner(page);
      return result.owner;
    };
    const logout = async () => {
      phase = 'real browser logout';
      await page.evaluate(async () => {
        const response = await VoyagrSupabaseAuthOrchestration.getSupabaseClient().auth.signOut();
        if (response.error) throw Error('Synthetic browser logout failed');
      });
      await page.waitForFunction(() => VoyagrLocalData.getOwner() === 'guest');
      await settleOwner(page);
    };
    const a = await signUp(accountA);
    check('Real login does not inherit guest history permission', !(await page.evaluate(() => VoyagrLocalData.historyEnabled())));
    check('Real login does not copy guest favourites automatically', (await page.evaluate(async () => (await VoyagrLocalData.read('favourites')) || [])).length === 0);
    await page.evaluate(() => VoyagrLocalData.update('favourites', () => [{name: 'synthetic-A-place', lat: 0, lon: 0}]));
    await logout();
    const b = await signUp(accountB);
    check('Second account cannot see first account favourites', (await page.evaluate(async () => (await VoyagrLocalData.read('favourites')) || [])).length === 0);
    check('Account B starts with history OFF', !(await page.evaluate(() => VoyagrLocalData.historyEnabled())));
    await logout();
    await page.evaluate(async account => {
      const response = await VoyagrSupabaseAuthOrchestration.getSupabaseClient().auth.signInWithPassword(account);
      if (response.error) throw Error('Synthetic browser sign-in failed');
    }, accountA);
    await page.waitForFunction(owner => VoyagrLocalData.getOwner() === 'sb:' + owner, a);
    await settleOwner(page);
    check('Signing back in restores only account A local favourites', (await page.evaluate(() => VoyagrLocalData.read('favourites')))[0].name === 'synthetic-A-place');
    for (const id of ['privacyCloudSync', 'privacyDashcamBackup', 'privacyDiagnostics']) check(id + ' remains OFF after account changes', !(await page.locator('#' + id).isChecked()));
    phase = 'export and delete controls';
    await page.evaluate(() => { expandBottomSheet(); switchTab('settings'); });
    await page.locator('#localDataControls').evaluate(element => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
      element.scrollIntoView();
    });
    await page.locator('#localDataCategory').selectOption('all');
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.locator('#localExport').click(),
    ]);
    const stream = await download.createReadStream();
    let text = '';
    for await (const chunk of stream) text += chunk;
    const exported = JSON.parse(text);
    check('Actual Export button downloads current-owner data', exported.format === 'voyagr-device-export' && exported.records.favourites[0].name === 'synthetic-A-place');
    check('Export omits login tokens', !text.includes('access_token') && !text.includes('refresh_token') && !/eyJ[\w-]+\.[\w-]+\.[\w-]+/.test(text));
    await page.locator('#localDataCategory').selectOption('favourites');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#localDelete').click();
    await waitFor(page, async () => !(await VoyagrLocalData.read('favourites'))?.length);
    check('Actual Delete button removes selected local category', true);
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForFunction(owner => window.VoyagrLocalData?.getOwner() === 'sb:' + owner, a);
    await settleOwner(page);
    check('Local deletion survives reload', !(await page.evaluate(() => VoyagrLocalData.read('favourites')))?.length);
    phase = 'offline storage and reload';
    await context.setOffline(true);
    await page.evaluate(() => VoyagrLocalData.update('routes', () => [{id: 'synthetic-offline-route'}]));
    check('Local routes can be saved and read offline', (await page.evaluate(() => VoyagrLocalData.getRoutes()))[0].id === 'synthetic-offline-route');
    check('History stays OFF offline', !(await page.evaluate(() => VoyagrLocalData.historyEnabled())));
    await context.setOffline(false);
    await waitFor(page, async () => !!(await navigator.serviceWorker.getRegistration())?.active);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.VoyagrLocalData);
    await settleOwner(page);
    await context.setOffline(true);
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.VoyagrLocalData);
    await settleOwner(page);
    check('Real service worker restores the application shell offline', await page.locator('#localDataControls').count() === 1);
    check('Offline reload retains the saved route', (await page.evaluate(() => VoyagrLocalData.getRoutes()))[0].id === 'synthetic-offline-route');
    await context.setOffline(false);
    await page.evaluate(async () => {
      const response = await fetch('/__lab__/worker-revision', {method: 'POST'});
      if (!response.ok) throw Error('Worker revision fixture failed');
      await (await navigator.serviceWorker.getRegistration()).update();
    });
    await waitFor(page, async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);
    check('Changed service worker waits while the candidate is open', await page.evaluate(() => !!navigator.serviceWorker.controller));
    check('Worker update does not enable history', !(await page.evaluate(() => VoyagrLocalData.historyEnabled())));
    // Closing all tabs allows the real waiting worker to activate normally.
    await page.close();
    page = await context.newPage();
    await page.goto(origin, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(owner => window.VoyagrLocalData?.getOwner() === 'sb:' + owner, a);
    await settleOwner(page);
    check('Reopening after worker update retains private local routes', (await page.evaluate(() => VoyagrLocalData.getRoutes()))[0].id === 'synthetic-offline-route');
    check('Worker update leaves cloud OFF', !(await page.locator('#privacyCloudSync').isChecked()));
    check('No optional private upload requests were initiated', uploads.length === 0);
    // External map/provider requests may be attempted but cannot leave the internal network.
    console.log('INFO: External provider attempts observed: ' + external.length + ' (isolated network; not a real map-data test).');
    check('No uncaught page JavaScript exceptions', errors.length === 0);
    await context.close();
    context = await chromium.launchPersistentContext('/tmp/privacy-browser-profile', options);
    browser = context.browser();
    page = context.pages()[0] || await context.newPage();
    await page.goto(origin, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(owner => window.VoyagrLocalData?.getOwner() === 'sb:' + owner, a);
    await settleOwner(page);
    check('Browser restart retains local routes', (await page.evaluate(() => VoyagrLocalData.getRoutes()))[0].id === 'synthetic-offline-route');
    check('Browser restart preserves history OFF', !(await page.evaluate(() => VoyagrLocalData.historyEnabled())));
    check('Browser restart preserves cloud OFF', !(await page.locator('#privacyCloudSync').isChecked()));
    await context.close();
    context = await chromium.launchPersistentContext('/tmp/privacy-browser-failure-profile', options);
    const broken = context;
    await broken.addInitScript(() => {
      Object.defineProperty(indexedDB, 'open', {value: () => { throw new DOMException('Synthetic storage failure', 'QuotaExceededError'); }});
    });
    const unavailable = await broken.newPage();
    await unavailable.goto(origin, {waitUntil: 'domcontentloaded'});
    await unavailable.waitForFunction(() => document.getElementById('localDataStatus')?.textContent.includes('Device storage unavailable'));
    check('Simulated IndexedDB failure produces a truthful status', true);
    const validation = await unavailable.evaluate(async () => (await fetch('/api/route', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({start: 'invalid', end: 'invalid'}),
    })).status);
    check('Routing validation remains reachable when browser storage fails', validation === 400);
    await broken.close();
    console.log(checks + ' full-candidate Chromium checks passed. Synthetic data; not phone or production verification.');
  } catch (error) {
    error.testPhase = phase;
    console.log('INFO: Failed assertion phase: ' + phase);
    console.log('INFO: Public config response statuses: ' + configStatuses.join(','));
    console.log('INFO: Asset failures: ' + assetFailures.join(','));
    console.log('INFO: First page exceptions: ' + pageErrorTypes.slice(0, 5).join(','));
    if (context) for (const tab of context.pages()) {
      console.log('INFO: Tab bootstrap state ' + JSON.stringify(await Promise.race([tab.evaluate(() => ({
        ready: document.readyState,
        local: !!window.VoyagrLocalData,
        authModule: !!window.VoyagrSupabaseAuthOrchestration,
        authClient: !!window.VoyagrSupabaseAuthOrchestration?.getSupabaseClient(),
        assetGuard: !!window.VoyagrAssetRelease,
        assetError: !!document.getElementById('voyagr-asset-error'),
        assetSequenceFailure: window.__labAssetFailure,
        accountStatus: document.getElementById('accountStatus')?.textContent,
      })), new Promise(resolve => setTimeout(() => resolve({unavailable: true}), 1000))]).catch(() => ({unavailable: true}))));
    }
    if (page && !page.isClosed()) {
      console.log('INFO: Failure UI state ' + JSON.stringify(await Promise.race([page.evaluate(() => ({
        historyVisible: !!document.getElementById('localRecordHistory')?.getClientRects().length,
        historyDisabled: document.getElementById('localRecordHistory')?.disabled,
        historyChecked: document.getElementById('localRecordHistory')?.checked,
        historyOffMarker: !!localStorage.getItem('voyagrHistoryOffV1:' + window.VoyagrLocalData?.getOwner()),
        safetyVisible: getComputedStyle(document.getElementById('safetyNoticeOverlay')).display !== 'none',
        authGateVisible: getComputedStyle(document.getElementById('authRequiredGate')).display !== 'none',
      })), new Promise(resolve => setTimeout(() => resolve({unavailable: true}), 1000))]).catch(() => ({unavailable: true}))));
    }
    throw error;
  } finally {
    if (context) await context.close();
  }
}

main().catch(error => {
  // Print assertion labels only; never browser console, auth responses or storage content.
  const detail = error.message.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
    .replace(/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}/g, '[test UUID]')
    .replace(/[\w.+-]+@[\w.-]+/g, '[test email]').slice(0, 700);
  console.log('FAIL: ' + detail + ' during ' + error.testPhase);
  process.exitCode = 1;
});
