/** Device-only data coordinator. Optional cloud transports remain disabled until consent enforcement exists. */
(function (root) {
  'use strict';

  let owner = 'guest',
    epoch = 0,
    store = null,
    migration = null;
  const blockedHistory = new Set();
  let privacyChannel = null;
  try {
    if (root.BroadcastChannel) privacyChannel = new root.BroadcastChannel('voyagr-privacy-v1');
  } catch (_) {}
  function policy() {
    return root.VoyagrConsentPolicy;
  }
  const privacyKey = who => 'voyagrHistoryOffV1:' + who;
  function historyBlocked(who) {
    if (blockedHistory.has(who)) return true;
    try {
      return root.localStorage.getItem(privacyKey(who)) !== null;
    } catch (_) {
      return true;
    }
  }
  function db() {
    if (!store) store = root.VoyagrLocalStore.create(root.indexedDB);
    return store;
  }
  function capture() {
    return {
      owner,
      epoch
    };
  }
  function current(c) {
    return c.owner === owner && c.epoch === epoch;
  }
  function ready() {
    if (!migration) migration = db().migrate(root.localStorage).catch(e => {
      migration = null;
      throw e;
    });
    return migration;
  }
  function report() {
    const el = root.document?.getElementById('localDataStatus');
    if (el) el.textContent = 'Device storage unavailable. Existing data is retained; navigation can continue.';
  }
  async function read(category, c = capture()) {
    await ready();
    if (!current(c)) throw Error('Device owner changed');
    const result = await db().read(c.owner, category);
    if (!current(c)) throw Error('Device owner changed');
    return result;
  }
  async function update(category, fn, c = capture()) {
    await ready();
    if (!current(c)) throw Error('Device owner changed');
    return db().update(c.owner, category, fn, () => current(c));
  }
  function switchOwner(next) {
    if (!root.VoyagrLocalStore.validOwner(next) || next === 'legacy:unassigned') throw Error('Invalid local owner');
    owner = next;
    epoch++;
    root.dispatchEvent?.(new CustomEvent('voyagr-local-owner-change'));
    return capture();
  }
  function preferenceRequest(options) {
    let patch = {};
    try {
      patch = JSON.parse(options.body || '{}');
    } catch (_) {
      return Promise.reject(Error('Invalid preferences'));
    }
    return update('apiPreferences', value => Object.assign({}, value || {}, patch)).then(() => ({
      ok: true,
      json: async () => ({
        success: true
      })
    }));
  }
  async function getRoutes(c) {
    return (await read('routes', c)) || [];
  }
  async function getDestinations(c) {
    return (await read('destinations', c)) || [];
  }
  async function recordDestination(label, lat, lon, kind) {
    const context = capture();
    if (!(await historyEnabled(context))) return;
    if (!label || !Number.isFinite(+lat) || !Number.isFinite(+lon) || Math.abs(+lat) > 90 || Math.abs(+lon) > 180) return;
    return record('destinations', old => [{
      label: String(label).slice(0, 500),
      lat: +lat,
      lon: +lon,
      kind: kind || 'search',
      ts: Date.now()
    }, ...(old || []).filter(x => x.label !== label || x.lat !== +lat || x.lon !== +lon)].slice(0, 15), context);
  }
  async function exportData(category) {
    const c = capture();
    await ready();
    const categories = category === 'all' ? root.VoyagrLocalStore.CATEGORIES.filter(x => !['legacy', 'localOptions'].includes(x)) : [category];
    const records = {};
    for (const name of categories) {
      if (!root.VoyagrLocalStore.CATEGORIES.includes(name)) throw Error('Unknown data category');
      records[name] = await read(name, c);
    }
    const clips = await db().listClips(c.owner);
    if (!current(c)) throw Error('Device owner changed');
    return {
      format: 'voyagr-device-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      records,
      recordings: clips.map(x => {
        delete x.owner;
        return x;
      }),
      note: 'Recording media is downloaded separately. This export is not encrypted.'
    };
  }
  async function exportLegacy() {
    const c = capture();
    await ready();
    const data = await db().read('legacy:unassigned', 'legacy');
    if (!current(c)) throw Error('Device owner changed');
    return {
      format: 'voyagr-legacy-recovery',
      version: 1,
      data
    };
  }
  function download(value, name, type = 'application/json') {
    const blob = value instanceof Blob ? value : new Blob([JSON.stringify(value, null, 2)], {
      type
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function refresh() {
    const c = capture();
    try {
      await ready();
      if (!current(c)) return;
      const enabled = await historyEnabled(c);
      if (!current(c)) return;
      const toggle = document.getElementById('localRecordHistory');
      if (toggle) toggle.checked = enabled;
      const s = document.getElementById('localDataStatus');
      if (s) s.textContent = 'Data stays on this device. Cloud sync is unavailable until its separate privacy checks are implemented.';
    } catch (_) {
      report();
    }
  }
  async function historyEnabled(c = capture()) {
    return !historyBlocked(c.owner) && policy()?.allowed((await read('localOptions', c))?.privacy, 'history') === true;
  }
  async function record(category, mutate, c = capture()) {
    await ready();
    if (!current(c)) throw Error('Device owner changed');
    if (historyBlocked(c.owner)) return false;
    try {
      return await db().recordWithPermission(c.owner, category, mutate, options => !historyBlocked(c.owner) && policy()?.allowed(options?.privacy, 'history') === true, () => current(c) && !historyBlocked(c.owner));
    } catch (error) {
      if (current(c) && historyBlocked(c.owner)) return false;
      throw error;
    }
  }
  async function setPrivacyChoice(category, enabled, c = capture()) {
    if (!policy()) throw Error('Privacy policy unavailable');
    // Withdrawal takes effect in this page before any asynchronous storage work.
    if (category === 'history') blockedHistory.add(c.owner);
    if (category === 'history' && !enabled) {
      blockedHistory.add(c.owner);
      try {
        root.localStorage.setItem(privacyKey(c.owner), JSON.stringify({
          policyVersion: policy().VERSION,
          at: Date.now(),
          nonce: root.crypto?.randomUUID?.() || String(Math.random())
        }));
      } catch (_) {}
      privacyChannel?.postMessage({
        owner: c.owner,
        category: 'history',
        enabled: false
      });
    }
    let marker;
    try {
      marker = root.localStorage.getItem(privacyKey(c.owner));
    } catch (_) {
      if (enabled) throw Error('Privacy choice storage unavailable');
    }
    await ready();
    const unchanged = () => {
      try {
        return current(c) && (category !== 'history' || !enabled || root.localStorage.getItem(privacyKey(c.owner)) === marker);
      } catch (_) {
        return false;
      }
    };
    await db().update(c.owner, 'localOptions', old => ({
      ...old,
      privacy: policy().choose(old?.privacy, category, enabled)
    }), unchanged);
    if (!current(c)) throw Error('Device owner changed');
    if (category === 'history' && enabled) {
      // A withdrawal in another tab while enabling must win over this old callback.
      if (root.localStorage.getItem(privacyKey(c.owner)) !== marker) throw Error('Privacy choice changed in another tab');
      root.localStorage.removeItem(privacyKey(c.owner));
      blockedHistory.delete(c.owner);
    }
    privacyChannel?.postMessage({
      owner: c.owner,
      category,
      enabled
    });
    root.dispatchEvent?.(new CustomEvent('voyagr-privacy-changed'));
    return enabled;
  }
  async function recoverLegacy() {
    if (!confirm('Copy unassigned legacy routes and history into this device profile? Nothing will be uploaded. Original data is retained.')) return;
    const c = capture();
    await ready();
    await db().claimLegacy(c.owner, () => current(c));
    root.dispatchEvent(new CustomEvent('voyagr-local-data-changed'));
  }
  function init() {
    document.getElementById('localExport')?.addEventListener('click', () => exportData(document.getElementById('localDataCategory').value).then(x => download(x, 'voyagr-device-data.json')).catch(report));
    document.getElementById('localDelete')?.addEventListener('click', async () => {
      const category = document.getElementById('localDataCategory').value;
      if (category === 'all') {
        alert('Select a category to delete.');
        return;
      }
      if (!confirm('Delete this category from the current device profile? Cloud and legacy recovery copies are unchanged.')) return;
      const c = capture();
      try {
        await ready();
        if (!current(c)) return;
        await db().clear(c.owner, category);
        if (!current(c)) return;
        if (category === 'preferences') root.VoyagrProfileStoreOrchestration?.resetLocalPreferences();
        root.dispatchEvent(new CustomEvent('voyagr-local-data-changed'));
        await refresh();
      } catch (_) {
        report();
      }
    });
    document.getElementById('localRecordHistory')?.addEventListener('change', async event => {
      const toggle = event.target,
        c = capture(),
        enabled = toggle.checked;
      toggle.disabled = true;
      let failed = false;
      try {
        await setPrivacyChoice('history', enabled, c);
      } catch (_) {
        if (current(c)) {
          toggle.checked = false;
          failed = true;
        }
      } finally {
        if (current(c)) {
          toggle.disabled = false;
          await refresh();
          if (failed && current(c)) {
            const status = document.getElementById('localDataStatus');
            if (status) status.textContent = 'Recording is off on this page. Could not save the privacy choice; retry.';
          }
        }
      }
    });
    document.getElementById('localExportLegacy')?.addEventListener('click', () => exportLegacy().then(x => download(x, 'voyagr-legacy-recovery.json')).catch(report));
    document.getElementById('localDeleteLegacy')?.addEventListener('click', async () => {
      if (!confirm('Permanently remove legacy recovery copies from this browser? Export anything you need first. Current device profiles and cloud copies are unchanged.')) return;
      const c = capture();
      try {
        await ready();
        if (!current(c)) return;
        await db().clear('legacy:unassigned', 'legacy');
        if (!current(c)) return;
        for (const key of ['voyagr_profiles_v1', 'savedRoutes', 'voyagrLocalTrips', 'voyagrRecentDestinations', 'voyagr_geocoding_cache']) root.localStorage.removeItem(key);
        root.document.getElementById('localDataStatus').textContent = 'Legacy recovery copies removed from this browser.';
      } catch (_) {
        report();
      }
    });
    document.getElementById('localRecoverLegacy')?.addEventListener('click', () => recoverLegacy().then(() => root.location.reload()).catch(report));
    root.addEventListener('voyagr-local-owner-change', () => {
      const toggle = document.getElementById('localRecordHistory');
      if (toggle) {
        toggle.checked = false;
        toggle.disabled = false;
      }
      void refresh();
    });
    root.addEventListener('voyagr-privacy-changed', refresh);
    root.addEventListener('storage', event => {
      if (event.key === null || event.key?.startsWith('voyagrHistoryOffV1:')) void refresh();
    });
    if (privacyChannel) privacyChannel.onmessage = event => {
      const message = event.data;
      if (!message || message.category !== 'history' || !root.VoyagrLocalStore.validOwner(message.owner)) return;
      if (message.enabled === false) blockedHistory.add(message.owner);else if (message.enabled === true) blockedHistory.delete(message.owner);
      void refresh();
    };
    void refresh();
    void ready().then(() => root.VoyagrProfileStoreOrchestration?.switchActiveProfile(root.VoyagrProfileStoreOrchestration.getActiveProfileId())).catch(report);
  }
  const api = {
    db,
    ready,
    read,
    update,
    capture,
    current,
    switchOwner,
    getOwner: () => owner,
    getRoutes,
    getDestinations,
    recordDestination,
    preferenceRequest,
    exportData,
    exportLegacy,
    recoverLegacy,
    historyEnabled,
    record,
    setPrivacyChoice,
    download,
    report,
    refresh,
    init
  };
  if (typeof module !== 'undefined') module.exports = api;
  root.VoyagrLocalData = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {
      once: true
    });else init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
