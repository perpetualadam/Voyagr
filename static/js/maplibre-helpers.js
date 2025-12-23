/**
 * MapLibre GL JS Helpers
 * Provides wrapper functions for common map operations, replacing Leaflet APIs
 * @module maplibre-helpers
 */

// Track active layers/sources for cleanup
let layerCounter = 0;
const activeLayers = new Map();
const activeMarkers = new Map();

// ===== POLYLINE FUNCTIONS =====

/**
 * Add a polyline to the map
 * @param {maplibregl.Map} map - The map instance
 * @param {Array<[number, number]>} coords - Array of [lat, lon] coordinates
 * @param {Object} options - Style options (color, weight, opacity)
 * @returns {Object} Layer object with id and remove() method
 */
function addPolyline(mapInstance, coords, options = {}) {
    const id = `polyline-${++layerCounter}`;

    // Convert [lat, lon] to [lon, lat] for MapLibre
    const lngLatCoords = coords.map(c => {
        if (Array.isArray(c)) {
            return [c[1], c[0]]; // [lat, lon] -> [lon, lat]
        }
        return [c.lng || c.lon, c.lat];
    });

    // Wait for map to be ready
    const addLayerFn = () => {
        if (mapInstance.getSource(id)) return; // Already exists

        mapInstance.addSource(id, {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: lngLatCoords }
            }
        });

        const layerConfig = {
            id: id,
            type: 'line',
            source: id,
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': options.color || '#667eea',
                'line-width': options.weight || 4,
                'line-opacity': options.opacity || 0.8
            }
        };

        // Add layer - optionally before a specific layer for z-ordering
        // If 'aboveRoutes' is true, don't specify beforeId to add on top
        if (options.beforeId && mapInstance.getLayer(options.beforeId)) {
            mapInstance.addLayer(layerConfig, options.beforeId);
        } else {
            mapInstance.addLayer(layerConfig);
        }
    };

    if (mapInstance.isStyleLoaded()) {
        addLayerFn();
    } else {
        mapInstance.on('load', addLayerFn);
    }

    const layer = {
        id: id,
        _coords: lngLatCoords,
        addTo: function (m) { return this; },
        remove: function () { removeMapLayer(mapInstance, id); },
        getBounds: function () {
            return computeBounds(lngLatCoords);
        }
    };

    activeLayers.set(id, layer);
    return layer;
}

/**
 * Remove a layer and its source from the map
 * @param {maplibregl.Map} map - The map instance
 * @param {string} layerId - ID of the layer to remove
 */
function removeMapLayer(mapInstance, layerId) {
    try {
        if (mapInstance.getLayer(layerId)) {
            mapInstance.removeLayer(layerId);
        }
        if (mapInstance.getSource(layerId)) {
            mapInstance.removeSource(layerId);
        }
        activeLayers.delete(layerId);
    } catch (e) {
        console.warn('[MapLibre] Error removing layer:', layerId, e);
    }
}

// ===== MARKER FUNCTIONS =====

/**
 * Create a custom marker with HTML content
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {Object} options - Marker options (html, className, popup)
 * @returns {maplibregl.Marker} Marker instance
 */
function createMarker(lat, lon, options = {}) {
    const el = document.createElement('div');
    el.className = options.className || 'maplibre-marker';

    if (options.html) {
        el.innerHTML = options.html;
    }

    if (options.iconSize) {
        el.style.width = options.iconSize[0] + 'px';
        el.style.height = options.iconSize[1] + 'px';
    }

    if (options.iconAnchor) {
        el.style.marginLeft = -options.iconAnchor[0] + 'px';
        el.style.marginTop = -options.iconAnchor[1] + 'px';
    }

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lon, lat]); // [lon, lat] order

    // Add popup if provided
    if (options.popup) {
        const popup = new maplibregl.Popup({ offset: 25 })
            .setHTML(options.popup);
        marker.setPopup(popup);
    }

    // Store reference
    const markerId = `marker-${++layerCounter}`;
    marker._mlId = markerId;
    activeMarkers.set(markerId, marker);

    // Add Leaflet-compatible methods
    marker.bindPopup = function (content) {
        const popup = new maplibregl.Popup({ offset: 25 }).setHTML(content);
        this.setPopup(popup);
        return this;
    };

    marker.openPopup = function () {
        const popup = this.getPopup();
        if (popup && !popup.isOpen()) {
            this.togglePopup();
        }
        return this;
    };

    marker.getLatLng = function () {
        const lngLat = this.getLngLat();
        return { lat: lngLat.lat, lng: lngLat.lng };
    };

    marker.getElement = function () {
        return el;
    };

    return marker;
}

/**
 * Create a circle marker
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {Object} options - Style options (radius, color, fillColor, weight, fillOpacity)
 * @returns {maplibregl.Marker} Marker instance
 */
function createCircleMarker(lat, lon, options = {}) {
    const size = (options.radius || 8) * 2;
    const el = document.createElement('div');
    el.className = 'circle-marker';
    el.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        background: ${options.fillColor || '#667eea'};
        border: ${options.weight || 2}px solid ${options.color || '#fff'};
        border-radius: 50%;
        opacity: ${options.fillOpacity || 0.8};
        cursor: pointer;
    `;

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lon, lat]);

    const markerId = `circle-${++layerCounter}`;
    marker._mlId = markerId;
    activeMarkers.set(markerId, marker);

    // Add Leaflet-compatible methods
    marker.bindPopup = function (content) {
        const popup = new maplibregl.Popup({ offset: 25 }).setHTML(content);
        this.setPopup(popup);
        return this;
    };

    marker.getLatLng = function () {
        const lngLat = this.getLngLat();
        return { lat: lngLat.lat, lng: lngLat.lng };
    };

    return marker;
}

/**
 * Remove a marker from the map
 * @param {maplibregl.Marker} marker - Marker to remove
 */
function removeMarker(marker) {
    if (marker) {
        marker.remove();
        if (marker._mlId) {
            activeMarkers.delete(marker._mlId);
        }
    }
}

// ===== BOUNDS FUNCTIONS =====

/**
 * Compute bounds from coordinates
 * @param {Array<[number, number]>} coords - Array of [lon, lat] coordinates
 * @returns {maplibregl.LngLatBounds} Bounds object
 */
function computeBounds(coords) {
    if (!coords || coords.length === 0) return null;

    const bounds = new maplibregl.LngLatBounds();
    coords.forEach(c => {
        if (Array.isArray(c) && c.length >= 2) {
            bounds.extend([c[0], c[1]]);
        }
    });
    return bounds;
}

/**
 * Compute bounds from [lat, lon] coordinates (Leaflet format)
 * @param {Array<[number, number]>} coords - Array of [lat, lon] coordinates
 * @returns {maplibregl.LngLatBounds} Bounds object
 */
function computeBoundsLatLon(coords) {
    if (!coords || coords.length === 0) return null;

    const bounds = new maplibregl.LngLatBounds();
    coords.forEach(c => {
        if (Array.isArray(c) && c.length >= 2) {
            bounds.extend([c[1], c[0]]); // Convert [lat, lon] to [lon, lat]
        }
    });
    return bounds;
}

/**
 * Fit map to bounds with padding
 * @param {maplibregl.Map} map - Map instance
 * @param {Array<[number, number]>} coords - Array of [lat, lon] coordinates
 * @param {Object} options - Fit options (padding, maxZoom)
 */
function fitMapBounds(mapInstance, coords, options = {}) {
    const bounds = computeBoundsLatLon(coords);
    if (bounds) {
        mapInstance.fitBounds(bounds, {
            padding: options.padding || 50,
            maxZoom: options.maxZoom || 18,
            duration: options.duration || 500
        });
    }
}

// ===== MAP METHOD SHIMS =====

/**
 * Check if map has a specific layer
 * @param {Object} layer - Layer object (must have id property)
 * @returns {boolean}
 */
function hasLayer(layer) {
    if (!layer) return false;
    if (layer._mlId) return activeMarkers.has(layer._mlId);
    if (layer.id) return activeLayers.has(layer.id);
    return false;
}

/**
 * Remove a layer (works with both markers and polylines)
 * @param {maplibregl.Map} map - Map instance
 * @param {Object} layer - Layer or marker to remove
 */
function removeLayer(mapInstance, layer) {
    if (!layer) return;

    // MapLibre Marker
    if (layer instanceof maplibregl.Marker || typeof layer.remove === 'function') {
        layer.remove();
        if (layer._mlId) {
            activeMarkers.delete(layer._mlId);
        }
        return;
    }

    // Polyline layer object
    if (layer.id) {
        removeMapLayer(mapInstance, layer.id);
    }
}

/**
 * Add 3D building extrusion layer to the map (if style supports it)
 * @param {maplibregl.Map} mapInstance - Map instance
 */
function add3DBuildings(mapInstance) {
    if (!mapInstance) return;

    const addBuildingLayer = () => {
        try {
            // Find the first symbol layer to insert buildings below
            const style = mapInstance.getStyle();
            if (!style || !style.layers) {
                console.log('[MapLibre] Style not ready for 3D buildings');
                return;
            }

            const layers = style.layers;
            let labelLayerId;
            for (let i = 0; i < layers.length; i++) {
                if (layers[i].type === 'symbol' && layers[i].layout && layers[i].layout['text-field']) {
                    labelLayerId = layers[i].id;
                    break;
                }
            }

            if (mapInstance.getLayer('3d-buildings')) return;

            // Check if common sources exist
            const sources = style.sources || {};
            let buildingSource = null;
            let buildingSourceLayer = 'building';

            if (sources.composite) {
                buildingSource = 'composite';
            } else if (sources.openmaptiles) {
                buildingSource = 'openmaptiles';
            } else if (sources.carto) {
                buildingSource = 'carto';
            } else {
                // Carto Positron and similar styles don't have building extrusion data
                // This is expected for many vector tile styles
                console.log('[MapLibre] 3D buildings not available for this map style (no compatible source found)');
                return;
            }

            mapInstance.addLayer(
                {
                    'id': '3d-buildings',
                    'source': buildingSource,
                    'source-layer': buildingSourceLayer,
                    'filter': ['==', 'extrude', 'true'],
                    'type': 'fill-extrusion',
                    'minzoom': 15,
                    'paint': {
                        'fill-extrusion-color': '#aaa',
                        'fill-extrusion-height': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            15, 0,
                            15.05, ['get', 'height']
                        ],
                        'fill-extrusion-base': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            15, 0,
                            15.05, ['get', 'min_height']
                        ],
                        'fill-extrusion-opacity': 0.6
                    }
                },
                labelLayerId
            );
            console.log('[MapLibre] 3D buildings layer added');
        } catch (error) {
            // Silently handle errors - 3D buildings are a nice-to-have feature
            console.log('[MapLibre] 3D buildings not available:', error.message);
        }
    };

    if (mapInstance.isStyleLoaded()) {
        addBuildingLayer();
    } else {
        mapInstance.on('load', addBuildingLayer);
    }
}

// ===== FEATURE GROUP SHIM =====

/**
 * Create a feature group from layers
 * @param {Array} layers - Array of layer objects
 * @returns {Object} Feature group with getBounds() method
 */
function featureGroup(layers) {
    return {
        getBounds: function () {
            const bounds = new maplibregl.LngLatBounds();
            layers.forEach(layer => {
                if (layer._coords) {
                    layer._coords.forEach(c => bounds.extend(c));
                } else if (layer.getLngLat) {
                    bounds.extend(layer.getLngLat());
                }
            });
            return bounds;
        },
        pad: function (factor) {
            // Return bounds extended by factor
            const b = this.getBounds();
            const sw = b.getSouthWest();
            const ne = b.getNorthEast();
            const latPad = (ne.lat - sw.lat) * factor;
            const lngPad = (ne.lng - sw.lng) * factor;
            return new maplibregl.LngLatBounds(
                [sw.lng - lngPad, sw.lat - latPad],
                [ne.lng + lngPad, ne.lat + latPad]
            );
        }
    };
}

// ===== EXPORTS (global scope) =====
window.MapLibreHelpers = {
    addPolyline,
    removeMapLayer,
    createMarker,
    createCircleMarker,
    removeMarker,
    computeBounds,
    computeBoundsLatLon,
    fitMapBounds,
    hasLayer,
    removeLayer,
    add3DBuildings,
    featureGroup,
    activeLayers,
    activeMarkers
};
