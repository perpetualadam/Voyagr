/**
 * @file Search history persistence and favorites grid orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[SearchFavorites] Orchestration runtime not bound');
        }
        return runtime;
    }

    function FAV() { return rt().favorites(); }

    function addToSearchHistory(query, resultName, lat, lon) {
        if(query&&lat!=null&&lon!=null)rt().call.recordRecentDestination(resultName||query,lat,lon,'search');
    }

    function mountFavoriteGridItem(grid, fav, handlers) {
        const favMod = FAV();
        const spec = favMod.buildFavoriteGridItemSpec(fav, { escapeHtml: rt().call.escapeHtml });
        const container = document.createElement('div');
        container.className = spec.container.className;
        container.style.cssText = spec.container.style;

        const btn = document.createElement('button');
        btn.className = spec.mainButton.className;
        btn.style.cssText = spec.mainButton.style;
        btn.innerHTML = spec.mainButton.html;
        btn.onclick = () => handlers.onSelect(fav);

        const editBtn = document.createElement('button');
        editBtn.innerHTML = spec.editButton.html;
        editBtn.title = spec.editButton.title;
        editBtn.style.cssText = spec.editButton.style;
        editBtn.onclick = (e) => {
            e.stopPropagation();
            handlers.onEdit(fav);
        };

        const delBtn = document.createElement('button');
        delBtn.innerHTML = spec.deleteButton.html;
        delBtn.title = spec.deleteButton.title;
        delBtn.style.cssText = spec.deleteButton.style;
        delBtn.onclick = (e) => {
            e.stopPropagation();
            handlers.onDelete(fav);
        };

        container.appendChild(btn);
        container.appendChild(editBtn);
        container.appendChild(delBtn);
        grid.appendChild(container);
    }

    async function loadFavorites() {
        const local=root.VoyagrLocalData;if(!local)return;
        const c=local.capture(),grid=document.getElementById('favoritesGrid'),section=document.getElementById('favoritesSection');
        if(!grid||!section)return;grid.textContent='';
        try{const favourites=await local.read('favourites',c)||[];if(!local.current(c))return;
            for(const fav of favourites)mountFavoriteGridItem(grid,fav,{
                onSelect:item=>{if(!local.current(c))return;const input=document.getElementById('end');
                    root.VoyagrLocationOrchestration?.invalidateEndpointRequests('end');
                    input.value=item.name;input.dataset.journeySource='saved';input.dataset.lat=item.lat;input.dataset.lon=item.lon;input.dataset.displayName=item.name;
                    delete input.dataset.journeyOriginalSource;rt().call.expandBottomSheet();},
                onEdit:editFavorite,onDelete:deleteFavorite});
            section.style.display=favourites.length?'block':'none';
        }catch(_){local.report();section.style.display='none';}
    }

    async function editFavorite(fav) {
        const local=root.VoyagrLocalData;if(!local)return;const c=local.capture();
        const name=prompt('Edit name:',fav.name);if(!name)return;
        const category=prompt('Edit category:',fav.category)||'location';
        try{await local.update('favourites',rows=>(rows||[]).map(x=>x.id===fav.id?{...x,name:name.slice(0,200),category:category.slice(0,50)}:x),c);if(local.current(c))await loadFavorites();}catch(_){local.report();}
    }

    async function deleteFavorite(fav) {
        const local=root.VoyagrLocalData;if(!local)return;const c=local.capture();
        if(!confirm('Delete this saved place from this device profile?'))return;
        try{await local.update('favourites',rows=>(rows||[]).filter(x=>x.id!==fav.id),c);if(local.current(c))await loadFavorites();}catch(_){local.report();}
    }

    async function addCurrentToFavorites() {
        const local=root.VoyagrLocalData;if(!local)return;const c=local.capture();
        const name=prompt('Name for this saved place:');if(!name)return;
        const category=prompt('Category:','location')||'location',input=document.getElementById('end');
        // Prefer the selected destination; do not silently save GPS as a different place.
        let lat=Number(input?.dataset.lat),lon=Number(input?.dataset.lon),address=input?.value||'';
        if(!input?.dataset.lat||!input?.dataset.lon){lat=rt().getCurrentLat?.();lon=rt().getCurrentLon?.();address='';if(!Number.isFinite(lat)||!Number.isFinite(lon)||!confirm('No destination is selected. Save your current location instead?'))return;}
        if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){rt().call.showStatus('Choose a destination on the map or in search first.','warning');return;}
        const record={id:root.crypto.randomUUID(),name:name.slice(0,200),category:category.slice(0,50),address:address.slice(0,500),lat,lon};
        try{await local.update('favourites',rows=>[...(rows||[]),record],c);if(local.current(c)){rt().call.showStatus('Place saved on this device','success');await loadFavorites();}}catch(_){local.report();rt().call.showStatus('Place was not saved. Device storage is unavailable.','error');}
    }

    if(typeof window!=='undefined'){window.addEventListener('voyagr-local-owner-change',()=>{const el=document.getElementById('favoritesGrid');if(el)el.textContent='';});window.addEventListener('voyagr-local-data-changed',()=>{if(runtime)void loadFavorites();});}
    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        ENDPOINT_INTENT_PROTOCOL:1,
        endpointIntentReady:function(){return !!runtime;},
        bind: bind,
        addToSearchHistory: addToSearchHistory,
        loadFavorites: loadFavorites,
        editFavorite: editFavorite,
        deleteFavorite: deleteFavorite,
        addCurrentToFavorites: addCurrentToFavorites,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSearchFavoritesOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
