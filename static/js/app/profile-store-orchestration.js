/**
 * @file Multi-profile local storage orchestration (guest vs signed-in snapshots).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var VOYAGR_PROFILE_STORE_KEY = 'voyagr_profiles_v1';
    var SUPABASE_PROFILE_SNAPSHOTS_TABLE = 'voyagr_profile_snapshots';
    var activeProfileId = 'guest';
    var supabaseProfileSyncTimer = null;
    var supabaseProfileSyncInFlight = false;

    function rt() {
        if (!runtime) {
            throw new Error('[ProfileStore] Orchestration runtime not bound');
        }
        return runtime;
    }

    function getProfileStore() {
        try {
            return JSON.parse(localStorage.getItem(VOYAGR_PROFILE_STORE_KEY) || '{}');
        } catch (_e) {
            return {};
        }
    }

    function setProfileStore(store) {
        localStorage.setItem(VOYAGR_PROFILE_STORE_KEY, JSON.stringify(store));
    }

    function getRuntimeProfileSnapshot() {
        return {
            voyagr_all_settings: localStorage.getItem('voyagr_all_settings') || '',
            savedRoutes: localStorage.getItem('savedRoutes') || '[]',
        };
    }

    function applyRuntimeProfileSnapshot(snapshot) {
        localStorage.setItem('voyagr_all_settings', snapshot?.voyagr_all_settings || '');
        localStorage.setItem('savedRoutes', snapshot?.savedRoutes || '[]');

        rt().call.loadAllSettings();
        rt().call.applySettingsToUI();

        try {
            if (typeof rt().call.loadSavedRoutes === 'function') {
                rt().call.loadSavedRoutes();
            }
        } catch (e) {
            console.log('[Profiles] loadSavedRoutes failed:', e);
        }
    }

    function isAccountProfileId(profileId) {
        return typeof profileId === 'string' && profileId.startsWith('sb:') && profileId.length > 5;
    }

    function getUserIdFromProfileId(profileId) {
        if (!isAccountProfileId(profileId)) return '';
        return profileId.slice(3);
    }

    function scheduleSupabaseProfileSync() {
        if (!rt().getSupabaseClient()) return;
        if (!isAccountProfileId(activeProfileId)) return;

        if (supabaseProfileSyncTimer) {
            clearTimeout(supabaseProfileSyncTimer);
        }

        supabaseProfileSyncTimer = setTimeout(async function () {
            await syncActiveProfileToSupabase();
        }, 1200);
    }

    async function syncActiveProfileToSupabase() {
        const supabaseClient = rt().getSupabaseClient();
        if (!supabaseClient) return;
        if (supabaseProfileSyncInFlight) return;
        if (!isAccountProfileId(activeProfileId)) return;

        const userId = getUserIdFromProfileId(activeProfileId);
        if (!userId) return;

        try {
            supabaseProfileSyncInFlight = true;
            const store = getProfileStore();
            const entry = store[activeProfileId] || {};

            const snapshot = getRuntimeProfileSnapshot();
            const row = {
                user_id: userId,
                profile_id: activeProfileId,
                snapshot: snapshot,
            };

            const { data, error } = await supabaseClient
                .from(SUPABASE_PROFILE_SNAPSHOTS_TABLE)
                .upsert(row, { onConflict: 'user_id,profile_id' })
                .select('updated_at')
                .single();

            if (error) {
                console.warn('[Supabase][Profiles] Sync failed:', error.message || error);
                return;
            }

            const updatedAt = data?.updated_at || '';
            store[activeProfileId] = {
                ...entry,
                ...snapshot,
                supabase_updated_at: updatedAt,
            };
            setProfileStore(store);
            console.log('[Supabase][Profiles] Synced profile snapshot:', activeProfileId);
        } catch (e) {
            console.warn('[Supabase][Profiles] Sync exception:', e);
        } finally {
            supabaseProfileSyncInFlight = false;
        }
    }

    async function pullProfileSnapshotFromSupabase(profileId) {
        const supabaseClient = rt().getSupabaseClient();
        if (!supabaseClient) return false;
        if (!isAccountProfileId(profileId)) return false;

        const userId = getUserIdFromProfileId(profileId);
        if (!userId) return false;

        try {
            const { data, error } = await supabaseClient
                .from(SUPABASE_PROFILE_SNAPSHOTS_TABLE)
                .select('snapshot, updated_at')
                .eq('user_id', userId)
                .eq('profile_id', profileId)
                .maybeSingle();

            if (error) {
                console.warn('[Supabase][Profiles] Pull failed:', error.message || error);
                return false;
            }
            if (!data) {
                return false;
            }

            const remoteUpdatedAt = data.updated_at || '';
            const remoteSnapshot = data.snapshot || {};

            const store = getProfileStore();
            const localEntry = store[profileId] || {};
            const localUpdatedAt = localEntry.supabase_updated_at || '';

            const shouldApplyRemote = !localUpdatedAt || (remoteUpdatedAt && remoteUpdatedAt > localUpdatedAt);
            if (shouldApplyRemote) {
                store[profileId] = {
                    ...localEntry,
                    ...remoteSnapshot,
                    supabase_updated_at: remoteUpdatedAt,
                };
                setProfileStore(store);

                if (activeProfileId === profileId) {
                    applyRuntimeProfileSnapshot(store[profileId]);
                }
                console.log('[Supabase][Profiles] Pulled profile snapshot:', profileId);
            }

            return true;
        } catch (e) {
            console.warn('[Supabase][Profiles] Pull exception:', e);
            return false;
        }
    }

    function persistActiveProfile() {
        const store = getProfileStore();
        store[activeProfileId] = getRuntimeProfileSnapshot();
        setProfileStore(store);
        console.log('[Profiles] Persisted profile:', activeProfileId);
        scheduleSupabaseProfileSync();
    }

    function ensureProfileExists(profileId) {
        const store = getProfileStore();
        if (!store[profileId]) {
            store[profileId] = { voyagr_all_settings: '', savedRoutes: '[]', supabase_updated_at: '' };
            setProfileStore(store);
        }
    }

    function switchActiveProfile(profileId, options) {
        options = options || {};
        if (!profileId) profileId = 'guest';

        persistActiveProfile();

        const store = getProfileStore();
        const fromProfileId = activeProfileId;

        ensureProfileExists(profileId);
        activeProfileId = profileId;

        if (options.importFromProfileId && store[options.importFromProfileId]) {
            store[profileId] = store[options.importFromProfileId];
            setProfileStore(store);
            console.log('[Profiles] Imported profile', options.importFromProfileId, '→', profileId);
        }

        applyRuntimeProfileSnapshot(store[profileId]);
        console.log('[Profiles] Switched profile:', fromProfileId, '→', activeProfileId);
    }

    function getActiveProfileId() {
        return activeProfileId;
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
        ensureProfileExists('guest');
    }

    var api = {
        bind: bind,
        getProfileStore: getProfileStore,
        persistActiveProfile: persistActiveProfile,
        ensureProfileExists: ensureProfileExists,
        switchActiveProfile: switchActiveProfile,
        scheduleSupabaseProfileSync: scheduleSupabaseProfileSync,
        pullProfileSnapshotFromSupabase: pullProfileSnapshotFromSupabase,
        getActiveProfileId: getActiveProfileId,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrProfileStoreOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
