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
    function augment(body, storage, fix) {
        var next = Object.assign({},body);
        // Only fresh matching GPS evidence, never a geocoded address or old marker accuracy.
        delete next.origin_accuracy_m;
        if ((!fix || !Number.isFinite(fix.timestamp)) && root.VoyagrGpsOrchestration && root.VoyagrGpsOrchestration.getAcceptedOriginFix) fix=root.VoyagrGpsOrchestration.getAcceptedOriginFix();
        var start=typeof next.start==='string' ? next.start.split(',').map(Number) : [];
        var at=fix && (fix.timestamp || fix.observed_at_ms);
        if (fix && start.length===2 && Number.isFinite(at) && Date.now()-at>=-1000 && Date.now()-at<=15000 &&
            Number.isFinite(fix.accuracy) && fix.accuracy>0 && fix.accuracy<=150 &&
            Number.isFinite(fix.lat) && Number.isFinite(fix.lon) &&
            Math.hypot((start[0]-fix.lat)*111195,(start[1]-fix.lon)*111195*Math.cos(start[0]*Math.PI/180))<=2) {
            next.origin_accuracy_m=fix.accuracy;
        }
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
        var origin=assessment && assessment.origin_integrity;
        if (!origin || origin.navigation_allowed!==true || origin.transition_verified===true ||
            origin.status!=='CONTINUOUS_WITHIN_NUMERICAL_TOLERANCE') {
            return {allowed:false,acceptance:false,message:'Route start or stop continuity is unverified. Recalculate from your actual location; navigation cannot start.'};
        }
        var originAge=Date.now()/1000-origin.checked_at;
        if (!Number.isFinite(originAge) || originAge<0 || originAge>600 || !Number.isFinite(assessment.checked_at) || assessment.checked_at<=0 || options.offline) {
            return {allowed:false,acceptance:false,message:'Route start validation is stale or offline. Recalculate online before navigation.'};
        }
        var gps=root.VoyagrGpsOrchestration;
        var actual=gps && gps.getAcceptedOriginFix && gps.getAcceptedOriginFix();
        var requested=origin.requested_origin;
        if (actual && Number.isFinite(actual.timestamp) && Date.now()-actual.timestamp<=15000 && Date.now()-actual.timestamp>=-1000 &&
            (!Array.isArray(requested) || Math.hypot((requested[0]-actual.lat)*111195,(requested[1]-actual.lon)*111195*Math.cos(actual.lat*Math.PI/180))>2)) {
            return {allowed:false,acceptance:false,message:'Your position changed since route calculation. Recalculate from the actual location.'};
        }
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
        var limits=route && Array.isArray(route.provider_limitations) ? route.provider_limitations : [];
        var limitation=limits.some(function(item) { return item && item.category==='tolls'; }) ? ' Toll avoidance was not applied by this provider.' : limits.length ? ' Some preferences could not be applied by this provider.' : '';
        if (!a || !a.origin_integrity || a.origin_integrity.navigation_allowed!==true) return 'Unverified route start: navigation is unresolved. Recalculate from the actual location.'+limitation;
        if (a.claim==='avoidance_disabled') return 'Avoidance disabled.'+limitation;
        var labels={SATISFIED:'Verified against available data only',VIOLATED:'Known conflict',UNVERIFIED:'Unverified',UNSUPPORTED:'Unsupported'};
        var unresolved=(a.requirements || []).filter(function(r) { return r.enabled && r.status!=='SATISFIED'; });
        return (labels[a.status] || 'Unverified') + (unresolved.length ? ': '+unresolved.map(function(r) { return r.category.replace(/_/g,' '); }).join(', ') : '') +
            '. Map coverage, road association and data age may be limited.'+limitation;
    }
    var api={snapshot:snapshot,begin:begin,current:current,invalidate:invalidate,augment:augment,isLatest:function(ticket) { return !!ticket && ticket.id===sequence; },
        decision:decision,gate:gate,tag:tag,summary:summary,geometryBinding:geometryBinding,fetchOptions:fetchOptions,finish:finish,responseCurrent:function(data,storage) { return data.avoidance_request_sequence===sequence && data.avoidance_request_revision===revision && data.avoidance_preferences_snapshot===snapshot(storage); }};
    if (typeof module!=='undefined' && module.exports) module.exports=api;
    root.VoyagrAvoidanceIntegrity=api;
})(typeof globalThis!=='undefined' ? globalThis : this);
