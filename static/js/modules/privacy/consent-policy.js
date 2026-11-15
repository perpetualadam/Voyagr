/** Explicit local choices only. Not a server permission or a cloud-upload grant. */
(function (root) {
  'use strict';

  const VERSION = '2026-11-14.1';
  const CATEGORIES = ['history', 'analytics', 'cloudSync', 'dashcamBackup', 'diagnostics'];
  const AVAILABLE = ['history', 'analytics'];
  function allowed(record, category) {
    const choice = record?.choices?.[category];
    return AVAILABLE.includes(category) && record?.schema === 1 && record.policyVersion === VERSION && choice?.enabled === true && choice.source === 'explicit' && Number.isFinite(choice.recordedAt) && choice.recordedAt >= 0;
  }
  function choose(record, category, enabled, now = Date.now()) {
    if (!CATEGORIES.includes(category) || typeof enabled !== 'boolean' || !Number.isFinite(now) || now < 0) throw Error('Invalid privacy choice');
    if (enabled && !AVAILABLE.includes(category)) throw Error('This optional service is unavailable');
    const choices = {};
    for (const key of CATEGORIES) {
      const previous = record?.schema === 1 && record.policyVersion === VERSION ? record.choices?.[key] : null;
      const explicit = previous?.source === 'explicit' && typeof previous.enabled === 'boolean' && Number.isFinite(previous.recordedAt) && previous.recordedAt >= 0;
      choices[key] = explicit ? {
        enabled: allowed(record, key),
        recordedAt: previous.recordedAt,
        source: 'explicit'
      } : {
        enabled: false,
        recordedAt: null,
        source: 'default'
      };
    }
    choices[category] = {
      enabled,
      recordedAt: now,
      source: 'explicit'
    };
    return {
      schema: 1,
      policyVersion: VERSION,
      choices
    };
  }
  const api = {
    VERSION,
    CATEGORIES,
    allowed,
    choose
  };
  if (typeof module !== 'undefined') module.exports = api;
  root.VoyagrConsentPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
