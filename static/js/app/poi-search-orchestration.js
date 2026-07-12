/**
 * @file Quick POI search, along-route search, and map marker orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[PoiSearch] Orchestration runtime not bound');
        }
        return runtime;
    }

    function POI() { return rt().poiSearch(); }

    function quickSearch(type) {
        if (!navigator.geolocation) {
            rt().call.showStatus('Geolocation not supported', 'error');
            return;
        }

        console.log(`[QuickSearch] Starting search for ${type}`);
        rt().call.showStatus(`🔍 Searching for ${type}...`, 'info');

        const searchWithPosition = async (lat, lon) => {
            console.log(`[QuickSearch] Searching at position: ${lat}, ${lon}`);
            try {
                const response = await fetch('/api/poi-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        lat: lat,
                        lon: lon,
                        type: type,
                        radius: 3000,
                    }),
                });

                const data = await response.json();
                console.log('[QuickSearch] Response:', data);

                if (!data.success || !data.results || data.results.length === 0) {
                    rt().call.showStatus(`No ${type} found nearby. Try a different location.`, 'warning');
                    return;
                }

                console.log(`[QuickSearch] Displaying ${data.results.length} results`);
                displayPOIResults(data.results, type, lat, lon);
                rt().call.showStatus(`✅ Found ${data.results.length} ${type} options`, 'success');
            } catch (error) {
                console.error('[QuickSearch] Error:', error);
                rt().call.showStatus('Error searching for ' + type + ': ' + error.message, 'error');
            }
        };

        if (rt().getCurrentLat() && rt().getCurrentLon()) {
            console.log('[QuickSearch] Using cached position');
            searchWithPosition(rt().getCurrentLat(), rt().getCurrentLon());
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                rt().s('currentLat', lat);
                rt().s('currentLon', lon);
                searchWithPosition(lat, lon);
            },
            (error) => {
                console.error('[QuickSearch] GPS Error:', error);
                rt().call.showStatus('Error getting location: ' + error.message, 'error');
            },
            { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }
        );
    }

    function displayPOIResults(results, type, userLat, userLon) {
        const poi = POI();
        closePOIModal();
        document.body.insertAdjacentHTML('beforeend', poi.buildPoiResultsModalHtml(results, type,
            poi.buildPoiResultsModalDisplayOpts(
                results,
                type,
                userLat,
                userLon,
                (distanceM) => rt().call.formatPoiDistance(distanceM)
            )
        ));
    }

    function closePOIModal() {
        const modal = document.getElementById(POI().POI_MODAL_ID);
        if (modal) {
            modal.remove();
        }
    }

    function selectPOI(poiLat, poiLon, poiName, userLat, userLon) {
        closePOIModal();
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

            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([poiItem.lon, poiItem.lat])
                .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(poi.buildPoiMapMarkerPopupHtml(poiItem)))
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
