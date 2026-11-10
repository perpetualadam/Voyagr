/** Public routing labels only. Provider identities in route data remain unchanged. */
(function(root){
    'use strict';
    function sourceLabel(source) {
        var key=String(source || '').toLowerCase();
        if (/graph[\s_-]*hopper/.test(key)) return 'Route source A';
        if (key.includes('valhalla')) return 'Route source B';
        if (key.includes('osrm')) return 'Route source C';
        return 'Routing service';
    }
    // Apply only to system-generated routing text, never destinations, road names,
    // spoken directions, stored records or the raw provider diagnostic payload.
    function systemText(text) {
        return String(text == null ? '' : text).replace(/\b(?:graph[\s_-]*hopper|valhalla|osrm)\b/gi,sourceLabel);
    }
    var api={sourceLabel:sourceLabel,systemText:systemText};
    if(typeof module!=='undefined' && module.exports)module.exports=api;
    root.VoyagrRoutingPresentation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
