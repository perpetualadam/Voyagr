/** Route limitations are advisory for explicit Start; geometry remains required. */
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
        if (!integrity.prepareGuidanceCandidate(candidate)) {
            return {allowed:false,outcome:'REFUSED',message:'Route geometry or instructions are incomplete. Recalculate before navigation.'};
        }
        if (!result.allowed) return Object.assign({},result,{allowed:true,outcome:'ADVISORY',assessmentOutcome:result.outcome,preferenceWarnings:result.preferenceWarnings||[],message:'Route limitations are informational; follow road signs.'});
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
        // Preserve the committed route information while displaying moving GPS.
        // Presentation alone never starts a journey.
        var details=route===activeRoute && committedDetails && lifecycle && lifecycle.getRouteInProgress() ? committedDetails : result;
        var text = details.outcome==='REFUSED' ? details.message : details.outcome==='ADVISORY' ? 'Route information is advisory.' : details.outcome==='BEST_EFFORT' ? 'Some hazards could not be avoided. '+WARNING : 'Route safety checks passed against available evidence. Avoidance is not guaranteed.';
        if (details.outcome==='BEST_EFFORT' && details.preferenceWarnings.length) {
            text += ' Unresolved preferences: '+details.preferenceWarnings.map(function(row) {return row.category.replace(/_/g,' ');}).join(', ')+'.';
        }
        var planning=document.getElementById('routePlanningNotice');
        if(planning)planning.textContent=root.VoyagrAvoidanceIntegrity&&root.VoyagrAvoidanceIntegrity.planningSummary?root.VoyagrAvoidanceIntegrity.planningSummary(route):'';
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
        const assessment=candidate && candidate.avoidance_assessment;
        const endpointOnly=result.outcome==='ADVISORY' && assessment && assessment.origin_integrity &&
            assessment.origin_integrity.reason==='material_endpoint_relocation' &&
            !(assessment.requirements || []).some(row=>row.enabled && row.status!=='SATISFIED') &&
            !(candidate.provider_limitations || []).length;
        if (endpointOnly) { warningKey=null; dismiss(); return true; }
        if (result.outcome!=='BEST_EFFORT' && result.outcome!=='ADVISORY') { warningKey=null; dismiss(); return true; }
        var key=JSON.stringify([result.outcome,result.preferenceWarnings]);
        if (key===warningKey) return true;
        warningKey=key;
        var warning=document.getElementById('bestEffortWarning');
        if (!warning) return true;
        previousFocus=document.activeElement;
        var info=document.getElementById('routeLimitationsInfo');
        if (info) info.open=false;
        warning.hidden=false;
        var close=document.getElementById('dismissBestEffortWarning');
        if (close) close.onclick=dismiss;
        clearTimeout(warningTimer); warningTimer=setTimeout(function() {
            // Do not remove information while the user is reading it.
            if (!info || !info.open) dismiss();
        },WARNING_MS);
        return true;
    }
    function reset() {
        clearTimeout(refreshTimer); refreshTimer=null; route=null; activeRoute=null; committedDetails=null; warningKey=null; dismiss();
        refresh();
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
