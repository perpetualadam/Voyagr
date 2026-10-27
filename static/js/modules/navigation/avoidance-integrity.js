/** Evidence-aware navigation gate and shared request ordering (no route guarantees). */
(function (root) {
    'use strict';
    var sequence = 0;
    var revision = 0;
    var activeTicket = null;
    var KEYS = ['routePreferences','pref_avoidance_mode','pref_cameras','pref_caz','pref_trafficLightsAvoid',
        'pref_railwayCrossingsAvoid','pref_avoid_tollRoads','pref_avoid_motorways','pref_avoid_ferries',
        'pref_police','pref_roadworks','pref_accidents','pref_avoidance_requirements'];
    function snapshot(storage) { return JSON.stringify(KEYS.map(function(k) { return [k,storage.getItem(k)]; })); }
    function finish(ticket) { if (ticket && ticket.timer) { clearTimeout(ticket.timer); ticket.timer=null; } }
    function cancel(ticket) { finish(ticket); if (ticket && ticket.controller) ticket.controller.abort(); }
    function begin(storage) {
        cancel(activeTicket);
        activeTicket={id:++sequence,revision:revision,snapshot:snapshot(storage),controller:typeof AbortController!=='undefined' ? new AbortController() : null};
        return activeTicket;
    }
    function fetchOptions(ticket) {
        if (!ticket || !ticket.controller) return {};
        ticket.timer=setTimeout(function() { ticket.controller.abort(); },35000);
        return {signal:ticket.controller.signal};
    }
    function current(ticket, storage) { return !!ticket && ticket.id === sequence && ticket.revision===revision && ticket.snapshot === snapshot(storage); }
    function invalidate() { revision++; cancel(activeTicket); }
    function augment(body, storage) {
        var next = Object.assign({},body);
        var mode = storage.getItem('pref_avoidance_mode') || 'preference';
        next.avoidance_mode = mode; // Invalid values are rejected by server; never silently downgrade.
        var raw = storage.getItem('pref_avoidance_requirements');
        if (raw) {
            try { next.avoidance_requirements=JSON.parse(raw); }
            catch (_) { throw new Error('Invalid saved avoidance requirements; review settings'); }
        }
        if (next.is_reroute && root.lastCalculatedRoute && Array.isArray(root.lastCalculatedRoute.leg_geometry_ranges)) {
            var ranges=root.lastCalculatedRoute.leg_geometry_ranges;
            var lifecycle=root.VoyagrNavigationLifecycleOrchestration;
            var index=lifecycle && lifecycle.getLastSnappedRouteIndex ? lifecycle.getLastSnappedRouteIndex() : 0;
            // Preserve outstanding visits in their existing optimized order; never reoptimize on deviation.
            next.stops=ranges.filter(function(r) { return r.stop && r.waypoint && r.end_shape_index>index; }).map(function(r) {
                return {lat:r.waypoint.lat,lon:r.waypoint.lon,name:r.stop.name,duration:r.stop.duration_minutes || 0,original_index:r.stop.original_index};
            });
            next.optimize_stop_order=false;
            next.preserve_stop_order=true;
        }
        return next;
    }
    function geometryBinding(route) {
        var codec=root.VoyagrPolylineCodec;
        if (!codec && typeof require==='function') codec=require('./polyline-codec.js');
        var geometry=route && route.geometry;
        var points=typeof geometry==='string' && codec ? codec.decodePolyline(geometry,route.geometry_precision || 6) : Array.isArray(geometry) ? geometry : [];
        if (geometry && geometry.type==='LineString') points=geometry.coordinates.map(function(p) {return [p[1],p[0]];});
        if (points.length<2) return null;
        var h=2166136261;
        for (var p of points) {
            if (!Array.isArray(p) || p.length<2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
            var text=Math.round(p[0]*1e6)+','+Math.round(p[1]*1e6)+';';
            for (var i=0;i<text.length;i++) h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;
        }
        return h.toString(16).padStart(8,'0');
    }
    function decision(route, options) {
        options = options || {};
        var assessment = route && route.avoidance_assessment;
        var requirements = assessment && assessment.requirements || route && route.avoidance_requirements || [];
        var mandatory = options.mandatory || requirements.some(function(r) { return r.enabled && r.mode==='mandatory'; });
        if (assessment && assessment.geometry_binding && assessment.geometry_binding!==geometryBinding(route)) return {allowed:false,acceptance:false,message:'Route geometry changed after assessment; recalculate before navigation.'};
        if (assessment && assessment.geometry_valid===false) return { allowed:false, acceptance:false, message:'Route geometry is incomplete; calculate a new route.' };
        if (options.offline && mandatory) return { allowed:false, acceptance:true, message:'Offline: mandatory avoidance cannot be revalidated. Continue with this unverified route?' };
        if (!assessment) return { allowed:!mandatory, acceptance:!!mandatory, message:'Unverified: this route has no current avoidance assessment.' };
        var age = Date.now()/1000 - assessment.checked_at;
        if (mandatory && (!Number.isFinite(age) || age<0 || age>600 || options.preferencesChanged)) {
            return { allowed:false, acceptance:true, message:'Avoidance assessment is stale or preferences changed. Recalculate, or explicitly accept an unverified route.' };
        }
        var mandatoryRows = requirements.filter(function(r) { return r.enabled && r.mode==='mandatory'; });
        var mandatoryUnresolved = mandatoryRows.length ? mandatoryRows.some(function(r) { return r.status!=='SATISFIED'; }) : mandatory && assessment.status!=='SATISFIED';
        if (assessment.requires_acceptance || mandatoryUnresolved) {
            var label = assessment.status==='VIOLATED' ? 'Known conflict' : assessment.status==='UNSUPPORTED' ? 'Unsupported' : 'Unverified';
            return { allowed:false, acceptance:true, message:label+': mandatory avoidance is not established. Continue with this route despite the limitation?' };
        }
        return { allowed:true, acceptance:false, message:assessment.status==='SATISFIED' ?
            (assessment.claim==='avoidance_disabled' ? '' : 'Verified against available data only; mapped coverage is limited.') :
            'Best effort: avoidance preferences are not guaranteed.' };
    }
    function gate(route, options) {
        options = options || {};
        var storage = options.storage || root.localStorage;
        var mandatory = storage.getItem('pref_avoidance_mode')==='mandatory';
        try {
            var explicit = JSON.parse(storage.getItem('pref_avoidance_requirements') || '[]');
            mandatory = mandatory || explicit.some(function(r) { return r.enabled && r.mode==='mandatory'; });
        } catch (_) { mandatory = true; }

        var d = decision(route, Object.assign({}, options, {mandatory:mandatory,
            preferencesChanged:!!(mandatory && (!route || !route.avoidance_preferences_snapshot || route.avoidance_preferences_snapshot!==snapshot(storage)))}));
        if (d.allowed) {
            if (d.message && !options.quiet && options.showStatus) options.showStatus(d.message,'warning');
            return true;
        }
        if (!options.automatic && d.acceptance && typeof options.confirm==='function' && options.confirm(d.message)) return true;
        if (options.showStatus) options.showStatus(d.message,'warning');
        return false;
    }
    function tag(data, ticket) {
        if (!data || typeof data!=='object') return data;
        data.avoidance_preferences_snapshot=ticket.snapshot;
        data.avoidance_request_sequence=ticket.id;
        data.avoidance_request_revision=ticket.revision;
        (data.routes || []).forEach(function(route) { route.avoidance_preferences_snapshot=ticket.snapshot; });
        return data;
    }
    function summary(route) {
        var a=route && route.avoidance_assessment;
        if (!a) return 'Unverified: avoidance has not been checked for this route.';
        if (a.claim==='avoidance_disabled') return 'Avoidance disabled.';
        var labels={SATISFIED:'Verified against available data only',VIOLATED:'Known conflict',UNVERIFIED:'Unverified',UNSUPPORTED:'Unsupported'};
        var unresolved=(a.requirements || []).filter(function(r) { return r.enabled && r.status!=='SATISFIED'; });
        return (labels[a.status] || 'Unverified') + (unresolved.length ? ': '+unresolved.map(function(r) { return r.category.replace(/_/g,' '); }).join(', ') : '') +
            '. Map coverage, road association and data age may be limited.';
    }
    var api={snapshot:snapshot,begin:begin,current:current,invalidate:invalidate,augment:augment,isLatest:function(ticket) { return !!ticket && ticket.id===sequence; },
        decision:decision,gate:gate,tag:tag,summary:summary,geometryBinding:geometryBinding,fetchOptions:fetchOptions,finish:finish,responseCurrent:function(data,storage) { return data.avoidance_request_sequence===sequence && data.avoidance_request_revision===revision && data.avoidance_preferences_snapshot===snapshot(storage); }};
    if (typeof module!=='undefined' && module.exports) module.exports=api;
    root.VoyagrAvoidanceIntegrity=api;
})(typeof globalThis!=='undefined' ? globalThis : this);
