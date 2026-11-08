/**
 * @file Quick POI search, along-route search, and map marker orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var quickSearchGeneration=0;
    var quickSearchController=null;

    function rt() {
        if (!runtime) {
            throw new Error('[PoiSearch] Orchestration runtime not bound');
        }
        return runtime;
    }

    function POI() { return rt().poiSearch(); }

    function quickSearch(type) {
        const candidateSearch=type==='fuel'||type==='food'||type==='charging'||type==='pharmacy'||type==='hospital'||type==='groceries';
        const generation=++quickSearchGeneration;
        if(quickSearchController)quickSearchController.abort();
        quickSearchController=null;
        const price=type==='parking'?(document.getElementById('poiParkingPrice')?.value||document.getElementById('parkingPricePreference')?.value||'any'):'any';
        if(type==='parking'||candidateSearch)closePOIModal();
        if (!navigator.geolocation) {
            rt().call.showStatus('Geolocation not supported', 'error');
            return;
        }

        console.log(`[QuickSearch] Starting search for ${type}`);
        rt().call.showStatus(`🔍 Searching for ${type}...`, 'info');

        const searchWithPosition = async (lat, lon) => {
            if(generation!==quickSearchGeneration)return;
            const controller=new AbortController();quickSearchController=controller;
            console.log(`[QuickSearch] Searching at position: ${lat}, ${lon}`);
            try {
                const response = await fetch('/api/poi-search', {
                    signal:controller.signal,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        lat: lat,
                        lon: lon,
                        type: type,
                        radius: 3000,
                        ...(type==='parking'?{price_pref:price}:{}),
                    }),
                });

                if(response.ok===false)throw Error('Search temporarily unavailable');
                const data = await response.json();
                if(generation!==quickSearchGeneration)return;
                if(!data||data.success!==true||candidateSearch&&!Array.isArray(data.results))throw Error('Search temporarily unavailable');
                if(type==='parking'&&price!=='any'&&(!data.search_context||data.search_context.price_pref!==price||
                    !Array.isArray(data.results)||data.results.some(row=>row.fee_category!==(price==='free_street'?'free':price)||price==='free_street'&&!['street_side','lane','on_street'].includes(row.parking_type))))throw Error('Parking fee-filter response mismatch');
                console.log('[QuickSearch] Response:', data);

                if (!data.success || !data.results || data.results.length === 0) {
                    if(type==='parking'||candidateSearch)displayPOIResults([],type,lat,lon,price);
                    if(candidateSearch){rt().call.showStatus(`No ${type} candidates returned. Coverage may be incomplete.`, 'warning');return;}
                    rt().call.showStatus(`No ${type} found nearby. Try a different location.`, 'warning');
                    return;
                }

                console.log(`[QuickSearch] Displaying ${data.results.length} results`);
                displayPOIResults(data.results, type, lat, lon,price);
                rt().call.showStatus(`✅ Found ${data.results.length} ${type} options`, 'success');
            } catch (error) {
                if(generation!==quickSearchGeneration||error.name==='AbortError')return;
                console.error('[QuickSearch] Error:', error);
                rt().call.showStatus('Error searching for ' + type + ': ' + error.message, 'error');
            }
        };

        const cachedLat=rt().getCurrentLat(),cachedLon=rt().getCurrentLon();
        const validCandidatePosition=candidateSearch&&typeof cachedLat==='number'&&typeof cachedLon==='number'&&Number.isFinite(cachedLat)&&Number.isFinite(cachedLon)&&Math.abs(cachedLat)<=90&&Math.abs(cachedLon)<=180;
        if (validCandidatePosition || !candidateSearch&&cachedLat&&cachedLon) {
            console.log('[QuickSearch] Using cached position');
            return searchWithPosition(rt().getCurrentLat(), rt().getCurrentLon());
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                if(generation!==quickSearchGeneration)return;
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                rt().s('currentLat', lat);
                rt().s('currentLon', lon);
                searchWithPosition(lat, lon);
            },
            (error) => {
                if(generation!==quickSearchGeneration)return;
                console.error('[QuickSearch] GPS Error:', error);
                rt().call.showStatus('Error getting location: ' + error.message, 'error');
            },
            { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }
        );
    }

    function displayPOIResults(results, type, userLat, userLon,price='any') {
        const poi = POI();
        closePOIModal();
        document.body.insertAdjacentHTML('beforeend', poi.buildPoiResultsModalHtml(results, type,
            {...poi.buildPoiResultsModalDisplayOpts(
                results,
                type,
                userLat,
                userLon,
                (distanceM) => rt().call.formatPoiDistance(distanceM)
            ),parkingPricePreference:price}
        ));
    }

    function closePOIModal() {
        const modal = document.getElementById(POI().POI_MODAL_ID);
        if (modal) {
            modal.remove();
        }
    }

    function selectPOI(poiLat, poiLon, poiName, userLat, userLon) {
        if(root.VoyagrLocationOrchestration)root.VoyagrLocationOrchestration.invalidateEndpointRequests();
        closePOIModal();
        ['start','end'].forEach(id=>{const input=document.getElementById(id);delete input.dataset.lat;delete input.dataset.lon;delete input.dataset.displayName;delete input.dataset.journeyOriginalSource;input.dataset.journeySource='coordinates';});
        document.getElementById('start').value = `${userLat},${userLon}`;
        document.getElementById('end').value = `${poiLat},${poiLon}`;
        rt().call.showStatus(POI().getPoiSelectDestinationStatusMessage(poiName), 'success');
        rt().call.calculateRoute();
    }

    function searchAlongRoute() {
        const cats = document.getElementById('alongRouteCategories');
        if (cats) {
            cats.style.display = POI().toggleAlongRouteCategoriesDisplay(cats.style.display);
        }
    }

    function searchAlongRouteByType(type) {
        const poi = POI();
        const polyline = rt().getRoutePolyline();
        if (!poi.canSearchAlongRoute(polyline ? polyline.length : 0)) {
            rt().call.showStatus(poi.getAlongRouteNoRouteMessage(), 'error');
            return;
        }

        rt().call.showStatus(poi.getAlongRouteSearchingMessage(type), 'info');

        const routePoints = polyline.map((p) => [p[0], p[1]]);

        fetch('/api/poi-along-route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(poi.buildAlongRouteSearchBody(routePoints, type)),
        })
            .then((r) => r.json())
            .then((data) => {
                if (data.success && data.results && data.results.length > 0) {
                    displayPOIResults(
                        data.results,
                        type,
                        rt().getCurrentLat() || 51.5074,
                        rt().getCurrentLon() || -0.1278
                    );
                    addPOIMarkersToMap(data.results, type);
                    rt().call.showStatus(poi.getAlongRouteResultsMessage(type, data.results.length), 'success');
                } else {
                    rt().call.showStatus(poi.getAlongRouteNoResultsMessage(type), 'info');
                }
            })
            .catch((err) => {
                console.error('[AlongRoute] Error:', err);
                rt().call.showStatus(poi.getAlongRouteSearchFailedMessage(), 'error');
            });
    }

    function addPOIMarkersToMap(pois, type) {
        clearPOIMarkers();

        const poi = POI();
        const icon = poi.getPoiMapMarkerIcon(type);

        pois.forEach((poiItem) => {
            if (!window.map) return;

            const el = document.createElement('div');
            el.className = 'poi-marker';
            el.style.cssText = poi.getPoiMapMarkerStyleCssText();
            el.textContent = icon;
            el.title = poiItem.name;

            const popupHtml = () => poi.buildPoiMapMarkerPopupHtml(poiItem, {
                distanceText: rt().call.formatPoiDistance(poiItem.distance_m),
            });
            const popup = new maplibregl.Popup({ offset: 25 }).setHTML(popupHtml());
            // Closed popups are detached from the DOM when preferences change.
            if (typeof popup.on === 'function') popup.on('open', () => popup.setHTML(popupHtml()));
            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([poiItem.lon, poiItem.lat])
                .setPopup(popup)
                .addTo(window.map);

            if (!window._poiMarkers) window._poiMarkers = [];
            window._poiMarkers.push(marker);
        });
    }

    function clearPOIMarkers() {
        if (window._poiMarkers) {
            window._poiMarkers.forEach((m) => m.remove());
            window._poiMarkers = [];
        }
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        ENDPOINT_INTENT_PROTOCOL:1,
        endpointIntentReady:function(){return !!runtime;},
        bind: bind,
        quickSearch: quickSearch,
        displayPOIResults: displayPOIResults,
        closePOIModal: closePOIModal,
        selectPOI: selectPOI,
        searchAlongRoute: searchAlongRoute,
        searchAlongRouteByType: searchAlongRouteByType,
        addPOIMarkersToMap: addPOIMarkersToMap,
        clearPOIMarkers: clearPOIMarkers,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPoiSearchOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
