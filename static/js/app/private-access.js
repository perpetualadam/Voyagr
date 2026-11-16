/** Private website access recovery; independent of app accounts and device storage. */
(function (root) {
    'use strict';
    function install(win) {
        const doc = win.document;
        if (doc.documentElement.dataset.personalMode !== 'true') return null;
        const card = doc.getElementById('privateAccessNotice');
        if (!card) return null;
        let pending = null;
        let stopped = false;
        let controller = null;
        function render(locked) {
            card.hidden = !locked;
            doc.documentElement.toggleAttribute('data-private-access-locked', locked);
            if (locked) {
                card.querySelector('a').href = '/privacy?private-login=' + Date.now();
            }
        }
        async function probe() {
            controller = new win.AbortController();
            const timeout = win.setTimeout(() => controller.abort(), 8000);
            try {
                const response = await win.fetch('/api/config', {
                    cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
                });
                if (!stopped) {
                    if (response.status === 401 || response.status === 403) render(true);
                    else if (response.ok) render(false);
                }
            } catch (_) {
                // Offline/timeouts/server failures are not proof of an expired login.
            } finally {
                win.clearTimeout(timeout);
                controller = null;
            }
        }
        function check() {
            if (stopped || doc.visibilityState === 'hidden') return Promise.resolve();
            if (!pending) pending = probe().finally(() => { pending = null; });
            return pending;
        }
        win.addEventListener('focus', check);
        win.addEventListener('online', check);
        doc.addEventListener('visibilitychange', check);
        const interval = win.setInterval(check, 30000);
        check();
        return { check, destroy() {
            stopped = true;
            if (controller) controller.abort();
            win.clearInterval(interval);
            win.removeEventListener('focus', check);
            win.removeEventListener('online', check);
            doc.removeEventListener('visibilitychange', check);
        } };
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = install;
    else if (root.document.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', () => install(root), {once: true});
    } else install(root);
})(typeof window !== 'undefined' ? window : globalThis);
