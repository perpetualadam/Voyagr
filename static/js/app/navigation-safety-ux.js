/** Navigation presentation only: the production integrity gate owns permission. */
(function (root) {
    'use strict';
    var route = null, refreshTimer = null, warningTimer = null, warningKey = null, previousFocus = null;
    var activeRoute = null, committedDetails = null;
    var WARNING_MS = 6000;
    var WARNING = 'This route may include hazards or restrictions that Voyagr could not avoid or fully verify. Follow road signs and traffic laws. Avoidance is not guaranteed.';

    function classify(candidate) {
        var lifecycle=root.VoyagrNavigationLifecycleOrchestration;
        if (lifecycle && lifecycle.getNavigationFailure && lifecycle.getNavigationFailure()) {
            return {allowed:false,outcome:'REFUSED',message:'Navigation stopped after an initialization or map failure. Recover the map and recalculate.'};
        }
        var integrity = root.VoyagrAvoidanceIntegrity;
        if (!integrity || typeof integrity.currentDecision!=='function') {
            return {allowed:false,outcome:'REFUSED',message:'Safety verification unavailable. Reload and recalculate before navigation.'};
        }
        var result = integrity.currentDecision(candidate,{offline:root.navigator.onLine===false},root.localStorage);
        if (result.allowed && !integrity.prepareNavigationCandidate(candidate)) {
            return {allowed:false,outcome:'REFUSED',message:'Route geometry or instructions are incomplete. Recalculate before navigation.'};
        }
        return result;
    }
    function dismiss() {
        clearTimeout(warningTimer); warningTimer=null;
        var warning = document.getElementById('bestEffortWarning');
        if (!warning) return;
        var focused = warning.contains(document.activeElement);
        warning.hidden=true;
        if (focused) {
            var target = previousFocus && previousFocus.isConnected && !previousFocus.disabled && previousFocus.getClientRects().length ? previousFocus : document.querySelector('#map canvas') || document.getElementById('routeAvoidanceNotice');
            if (target) target.focus();
        }
    }
    function refresh() {
        clearTimeout(refreshTimer); refreshTimer=null;
        var result;
        try { result=classify(route); }
        catch (_) { result={allowed:false,outcome:'REFUSED',message:'Safety verification unavailable. Recalculate before navigation.'}; }
        var lifecycle=root.VoyagrNavigationLifecycleOrchestration;
        // Movement/age can refuse a NEW start, without erasing the warning for
        // already committed guidance. This presentation snapshot grants no permission.
        var details=route===activeRoute && committedDetails && lifecycle && lifecycle.getRouteInProgress() ? committedDetails : result;
        var text = details.outcome==='REFUSED' ? details.message : details.outcome==='BEST_EFFORT' ? 'Some hazards could not be avoided. '+WARNING : 'Route safety checks passed against available evidence. Avoidance is not guaranteed.';
        if (details.outcome==='BEST_EFFORT') {
            text += ' Unresolved preferences: '+details.preferenceWarnings.map(function(row) {return row.category.replace(/_/g,' ');}).join(', ')+'.';
        }
        ['routeAvoidanceNotice','navigationStartExplanation'].forEach(function(id) {
            var el=document.getElementById(id);
            if (el && el.textContent!==text) el.textContent=text;
        });
        document.querySelectorAll('[data-navigation-start]').forEach(function(button) {
            button.disabled=!result.allowed;
            button.setAttribute('aria-disabled',String(!result.allowed));
            button.setAttribute('aria-describedby','routeAvoidanceNotice navigationStartExplanation');
            button.dataset.navigationOutcome=result.outcome;
        });
        if (route) refreshTimer=setTimeout(refresh,1000);
        return result;
    }
    function present(candidate) { route=candidate; return refresh(); }
    function committed(candidate) {
        var result=classify(candidate);
        // Called only after the production start/replacement transaction commits.
        // REFUSED candidates cannot alter the warning for existing protected guidance.
        if (!result.allowed) return false;
        activeRoute=candidate; committedDetails=result;
        present(candidate);
        if (result.outcome!=='BEST_EFFORT') { warningKey=null; dismiss(); return true; }
        var key=JSON.stringify(result.preferenceWarnings);
        if (key===warningKey) return true;
        warningKey=key;
        var warning=document.getElementById('bestEffortWarning');
        if (!warning) return true;
        previousFocus=document.activeElement;
        warning.hidden=false;
        var close=document.getElementById('dismissBestEffortWarning');
        if (close) close.onclick=dismiss;
        clearTimeout(warningTimer); warningTimer=setTimeout(dismiss,WARNING_MS);
        return true;
    }
    function reset() {
        clearTimeout(refreshTimer); refreshTimer=null; route=null; activeRoute=null; committedDetails=null; warningKey=null; dismiss();
    }
    if (typeof window!=='undefined') {
        window.addEventListener('online',function() { if (route) refresh(); });
        window.addEventListener('offline',function() { if (route) refresh(); });
        window.addEventListener('storage',function() { if (route) refresh(); });
    }
    var api={present:present,refresh:refresh,committed:committed,reset:reset,dismiss:dismiss};
    if (typeof module!=='undefined' && module.exports) module.exports=api;
    root.VoyagrNavigationSafetyUX=api;
})(typeof globalThis!=='undefined' ? globalThis : this);
