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
 * Add a polyline to the map using direct MapLibre API
 * @param {maplibregl.Map} mapInstance - The map instance
 * @param {Array} coords - Array of [lat, lon] coordinates (arrays or objects)
 * @param {Object} options - Style options (color, weight, opacity)
 * @returns {Object} Layer object with id, remove() method
 */
function addPolyline(mapInstance, coords, options = {}) {
    const id = `polyline-${++layerCounter}`;

    // Validate inputs early
    if (!mapInstance) {
        console.error(`[MapLibre] addPolyline: map is null for ${id}`);
        return createErrorLayer(id);
    }

    if (!coords || !Array.isArray(coords) || coords.length < 2) {
        console.error(`[MapLibre] addPolyline: invalid coordinates for ${id}`, coords?.length);
        return createErrorLayer(id);
    }

    // Convert coordinates to [lon, lat] format for MapLibre
    const lngLatCoords = [];
    for (let i = 0; i < coords.length; i++) {
        const c = coords[i];
        let lon, lat;

        if (Array.isArray(c) && c.length >= 2) {
            // [lat, lon] format
            lat = c[0];
            lon = c[1];
        } else if (c && typeof c === 'object') {
            // {lat, lng/lon} format
            lat = c.lat;
            lon = c.lng !== undefined ? c.lng : c.lon;
        } else {
            continue; // Skip invalid coordinate
        }

        // Validate the coordinate values
        if (typeof lat === 'number' && typeof lon === 'number' &&
            isFinite(lat) && isFinite(lon) &&
            lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
            lngLatCoords.push([lon, lat]);
        }
    }

    if (lngLatCoords.length < 2) {
        console.error(`[MapLibre] addPolyline: not enough valid coords for ${id} (${lngLatCoords.length})`);
        return createErrorLayer(id);
    }

    // Check if map style is loaded
    if (!mapInstance.isStyleLoaded()) {
        // Queue for later when style loads
        const layer = createPendingLayer(mapInstance, id, lngLatCoords, options);
        mapInstance.once('style.load', () => addLayerToMap(mapInstance, id, lngLatCoords, options));
        mapInstance.once('load', () => addLayerToMap(mapInstance, id, lngLatCoords, options));
        setTimeout(() => addLayerToMap(mapInstance, id, lngLatCoords, options), 500);
        return layer;
    }

    // Add directly
    const success = addLayerToMap(mapInstance, id, lngLatCoords, options);

    const layer = {
        id: id,
        _coords: lngLatCoords,
        _added: success,
        remove: function() { removeMapLayer(mapInstance, id); },
        getBounds: function() { return computeBounds(lngLatCoords); }
    };

    activeLayers.set(id, layer);
    return layer;
}

/**
 * Actually add the layer to MapLibre
 */
function addLayerToMap(mapInstance, id, lngLatCoords, options) {
    try {
        // Check if already added
        if (mapInstance.getSource(id)) {
            return true;
        }

        mapInstance.addSource(id, {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: lngLatCoords }
            }
        });

        mapInstance.addLayer({
            id: id,
            type: 'line',
            source: id,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
                'line-color': options.color || '#667eea',
                'line-width': options.weight || 4,
                'line-opacity': options.opacity || 0.8
            }
        });

        return true;
    } catch (e) {
        console.error(`[MapLibre] Error adding layer ${id}:`, e.message);
        return false;
    }
}

/**
 * Create an error/noop layer object
 */
function createErrorLayer(id) {
    return {
        id: id,
        _added: false,
        remove: function() {},
        getBounds: function() { return null; }
    };
}

/**
 * Create a pending layer object (for when style isn't loaded)
 */
function createPendingLayer(mapInstance, id, lngLatCoords, options) {
    const layer = {
        id: id,
        _coords: lngLatCoords,
        _added: false,
        remove: function() { removeMapLayer(mapInstance, id); },
        getBounds: function() { return computeBounds(lngLatCoords); }
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
 * Works with OpenFreeMap, OpenMapTiles, MapTiler, and similar vector tile sources
 * @param {maplibregl.Map} mapInstance - Map instance
 * @param {Object} options - Optional configuration (opacity, heightMultiplier)
 */
function add3DBuildings(mapInstance, options = {}) {
    if (!mapInstance) return;

    const opacity = options.opacity || 0.6;
    const heightMultiplier = options.heightMultiplier || 1.0;

    const addBuildingLayer = () => {
        try {
            // Remove existing layer if present
            if (mapInstance.getLayer('3d-buildings')) {
                console.log('[MapLibre] 3D buildings layer already exists');
                return;
            }

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

            // Check if common vector tile sources exist
            const sources = style.sources || {};
            let buildingSource = null;
            let buildingSourceLayer = 'building';

            // OpenFreeMap / OpenMapTiles use 'openmaptiles' source
            if (sources.openmaptiles) {
                buildingSource = 'openmaptiles';
            } else if (sources.composite) {
                buildingSource = 'composite';
            } else if (sources.maptiler) {
                buildingSource = 'maptiler';
            } else {
                // Try to find any source with building data
                for (const sourceName of Object.keys(sources)) {
                    if (sources[sourceName].type === 'vector') {
                        buildingSource = sourceName;
                        console.log(`[MapLibre] Using vector source "${sourceName}" for 3D buildings`);
                        break;
                    }
                }
            }

            if (!buildingSource) {
                console.log('[MapLibre] No compatible vector tile source found for 3D buildings');
                return;
            }

            // Add 3D extrusion layer for buildings
            // Use 'coalesce' to handle null values: try render_height, then height, then default to 10
            mapInstance.addLayer(
                {
                    'id': '3d-buildings',
                    'source': buildingSource,
                    'source-layer': buildingSourceLayer,
                    'type': 'fill-extrusion',
                    'minzoom': 14,
                    'filter': ['all',
                        ['has', 'render_height'],  // Only include features with height data
                        ['>', ['get', 'render_height'], 0]  // Height must be greater than 0
                    ],
                    'paint': {
                        'fill-extrusion-color': [
                            'interpolate',
                            ['linear'],
                            ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
                            0, '#d4d4d4',
                            50, '#b8b8b8',
                            100, '#9c9c9c'
                        ],
                        'fill-extrusion-height': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            14, 0,
                            14.5, ['*', heightMultiplier, ['coalesce', ['get', 'render_height'], ['get', 'height'], 10]]
                        ],
                        'fill-extrusion-base': [
                            'coalesce', ['get', 'render_min_height'], 0
                        ],
                        'fill-extrusion-opacity': opacity
                    }
                },
                labelLayerId
            );
            console.log(`[MapLibre] 3D buildings layer added (source: ${buildingSource})`);
        } catch (error) {
            console.log('[MapLibre] 3D buildings not available:', error.message);
        }
    };

    if (mapInstance.isStyleLoaded()) {
        addBuildingLayer();
    } else {
        mapInstance.once('load', addBuildingLayer);
    }
}

/**
 * Remove 3D buildings layer from the map
 * @param {maplibregl.Map} mapInstance - Map instance
 */
function remove3DBuildings(mapInstance) {
    if (!mapInstance) return;
    try {
        if (mapInstance.getLayer('3d-buildings')) {
            mapInstance.removeLayer('3d-buildings');
            console.log('[MapLibre] 3D buildings layer removed');
        }
    } catch (error) {
        console.log('[MapLibre] Error removing 3D buildings:', error.message);
    }
}

/**
 * Toggle 3D buildings visibility
 * @param {maplibregl.Map} mapInstance - Map instance
 * @param {boolean} visible - Whether buildings should be visible
 */
function toggle3DBuildings(mapInstance, visible) {
    if (!mapInstance) return;
    if (visible) {
        if (!mapInstance.getLayer('3d-buildings')) {
            add3DBuildings(mapInstance);
        } else {
            mapInstance.setLayoutProperty('3d-buildings', 'visibility', 'visible');
        }
    } else {
        if (mapInstance.getLayer('3d-buildings')) {
            mapInstance.setLayoutProperty('3d-buildings', 'visibility', 'none');
        }
    }
}

/**
 * Set 3D building height exaggeration
 * @param {maplibregl.Map} mapInstance - Map instance
 * @param {number} multiplier - Height multiplier (1.0 = normal, 2.0 = double)
 */
function set3DBuildingHeight(mapInstance, multiplier) {
    if (!mapInstance || !mapInstance.getLayer('3d-buildings')) return;
    try {
        // Use coalesce to safely handle null/missing height properties
        mapInstance.setPaintProperty('3d-buildings', 'fill-extrusion-height', [
            'interpolate',
            ['linear'],
            ['zoom'],
            14, 0,
            14.5, ['*', multiplier, ['coalesce', ['get', 'render_height'], ['get', 'height'], 10]]
        ]);
        console.log(`[MapLibre] 3D building height set to ${multiplier}x`);
    } catch (error) {
        console.log('[MapLibre] Error setting building height:', error.message);
    }
}

/**
 * Set 3D building opacity/transparency
 * @param {maplibregl.Map} mapInstance - Map instance
 * @param {number} opacity - Opacity value (0.0 = transparent, 1.0 = opaque)
 */
function set3DBuildingOpacity(mapInstance, opacity) {
    if (!mapInstance || !mapInstance.getLayer('3d-buildings')) return;
    try {
        mapInstance.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', opacity);
        console.log(`[MapLibre] 3D building opacity set to ${opacity}`);
    } catch (error) {
        console.log('[MapLibre] Error setting building opacity:', error.message);
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
    remove3DBuildings,
    toggle3DBuildings,
    set3DBuildingHeight,
    set3DBuildingOpacity,
    featureGroup,
    activeLayers,
    activeMarkers
};
