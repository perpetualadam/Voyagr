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

        // Find a symbol layer to insert polyline before it - prefer road label layer
        // This ensures polylines render BELOW road/motorway name tags
        const style = mapInstance.getStyle();
        let beforeId = undefined;
        if (style && style.layers) {
            const roadLabelLayer = style.layers.find(layer =>
                layer.type === 'symbol' &&
                layer.layout &&
                layer.layout['text-field'] &&
                (layer.id.includes('road') || layer.id.includes('transportation') ||
                 layer.id.includes('motorway') || layer.id.includes('street') || layer.id.includes('ref'))
            );
            const symbolLayer = roadLabelLayer || style.layers.find(layer =>
                layer.type === 'symbol' &&
                layer.layout &&
                layer.layout['text-field']
            );
            if (symbolLayer) {
                beforeId = symbolLayer.id;
                console.log(`[MapLibre] Inserting polyline ${id} before symbol layer ${beforeId}`);
            }
        }

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
        }, beforeId);  // Insert before symbol layers to keep labels on top

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
            // Prefer using a style-provided building extrusion layer if it exists, BUT:
            // - many community styles contain small schema mistakes (bad minzoom key, unsafe height props, etc.)
            // - those mistakes can result in "no 3D buildings" even though an extrusion layer exists
            // So we try to "harden" an existing layer first; if that fails, we fall back to our own safe layer.
            const style = mapInstance.getStyle();
            const styleLayers = style?.layers || [];
            const existingBuildingExtrusions = styleLayers.filter(layer =>
                layer &&
                layer.type === 'fill-extrusion' &&
                ((layer['source-layer'] || layer.sourceLayer) === 'building')
            );

            // Remove existing layer if present
            if (mapInstance.getLayer('3d-buildings')) {
                console.log('[MapLibre] 3D buildings layer already exists');
                return;
            }

            // Find the first symbol layer to insert buildings below
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

            // Build safe height/base expressions (used both for "harden existing" and our fallback layer).
            // Use numeric coercion to handle null/string values safely.
            // Some tiles can contain null heights (or string heights), which otherwise trigger:
            // "Expected value to be of type number, but found null instead."
            const heightRaw = ['coalesce', ['get', 'render_height'], ['get', 'height'], 0];
            const heightNorm = [
                'case',
                ['any', ['==', heightRaw, ''], ['==', heightRaw, 'null'], ['==', heightRaw, 'None']],
                0,
                heightRaw
            ];
            const baseRaw = ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0];
            const baseNorm = [
                'case',
                ['any', ['==', baseRaw, ''], ['==', baseRaw, 'null'], ['==', baseRaw, 'None']],
                0,
                baseRaw
            ];
            // Use `coalesce(to-number(x), 0)` so the expression cannot evaluate to null,
            // and avoid relying on `to-number(x, fallback)` which is not consistently supported.
            const heightExpr = ['coalesce', ['to-number', heightNorm], 0];
            const baseExpr = ['coalesce', ['to-number', baseNorm], 0];

            // If the style already has a building extrusion layer, try to harden it in-place.
            // This avoids doubled 3D while still fixing common style issues.
            if (existingBuildingExtrusions.length > 0) {
                const preferred = existingBuildingExtrusions[0];
                const preferredId = preferred.id;
                try {
                    // Hide any additional building-extrusion layers to prevent double-rendering.
                    for (let i = 1; i < existingBuildingExtrusions.length; i++) {
                        const otherId = existingBuildingExtrusions[i]?.id;
                        if (!otherId) continue;
                        try {
                            mapInstance.setLayoutProperty(otherId, 'visibility', 'none');
                        } catch (e) {
                            // ignore
                        }
                    }

                    // Ensure the preferred layer is visible and robust against null/string heights.
                    mapInstance.setLayoutProperty(preferredId, 'visibility', 'visible');
                    // Constrain rendering to a sane range (most OMT styles extrude from z14+).
                    if (typeof mapInstance.setLayerZoomRange === 'function') {
                        mapInstance.setLayerZoomRange(preferredId, 14, 24);
                    }

                    mapInstance.setPaintProperty(preferredId, 'fill-extrusion-height', [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        14, 0,
                        14.5, ['*', heightMultiplier, heightExpr]
                    ]);
                    mapInstance.setPaintProperty(preferredId, 'fill-extrusion-base', baseExpr);
                    mapInstance.setPaintProperty(preferredId, 'fill-extrusion-opacity', opacity);

                    // If the style didn't define a color, provide a neutral ramp.
                    try {
                        mapInstance.setPaintProperty(preferredId, 'fill-extrusion-color', [
                            'interpolate',
                            ['linear'],
                            heightExpr,
                            0, '#d4d4d4',
                            50, '#b8b8b8',
                            100, '#9c9c9c'
                        ]);
                    } catch (e) {
                        // Some styles intentionally use match/feature-state; leave as-is.
                    }

                    console.log(`[MapLibre] Hardened existing 3D buildings layer: ${preferredId}`);
                    return;
                } catch (e) {
                    console.warn(`[MapLibre] Existing 3D buildings layer could not be hardened (${preferredId}):`, e.message);
                    // Hide any existing extrusion layers so our fallback doesn't double-render.
                    existingBuildingExtrusions.forEach(layer => {
                        const id = layer?.id;
                        if (!id) return;
                        try {
                            mapInstance.setLayoutProperty(id, 'visibility', 'none');
                        } catch (err) {
                            // ignore
                        }
                    });
                    // Continue to add our own fallback layer below.
                }
            }

            mapInstance.addLayer(
                {
                    'id': '3d-buildings',
                    'source': buildingSource,
                    'source-layer': buildingSourceLayer,
                    'type': 'fill-extrusion',
                    'minzoom': 14,
                    'filter': ['all',
                        // Height must be > 0
                        ['>', heightExpr, 0]
                    ],
                    'paint': {
                        'fill-extrusion-color': [
                            'interpolate',
                            ['linear'],
                            heightExpr,
                            0, '#d4d4d4',
                            50, '#b8b8b8',
                            100, '#9c9c9c'
                        ],
                        'fill-extrusion-height': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            14, 0,
                            14.5, [
                                '*',
                                heightMultiplier,
                                heightExpr
                            ]
                        ],
                        // NOTE: This must be a single expression array (not wrapped in another array),
                        // otherwise style validation fails ("number expected, array found").
                        'fill-extrusion-base': baseExpr,
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
        // Also hide any style-provided building extrusion layers so the toggle works consistently.
        const style = mapInstance.getStyle?.();
        const layers = style?.layers || [];
        const extrusionIds = layers
            .filter(l => l && l.type === 'fill-extrusion' && ((l['source-layer'] || l.sourceLayer) === 'building'))
            .map(l => l.id)
            .filter(Boolean);
        extrusionIds.forEach(id => {
            try {
                mapInstance.setLayoutProperty(id, 'visibility', 'none');
            } catch (e) {
                // ignore
            }
        });
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
    if (!mapInstance) return;
    try {
        const heightRaw = ['coalesce', ['get', 'render_height'], ['get', 'height'], 0];
        const heightNorm = [
            'case',
            ['any', ['==', heightRaw, ''], ['==', heightRaw, 'null'], ['==', heightRaw, 'None']],
            0,
            heightRaw
        ];
        const heightExpr = ['coalesce', ['to-number', heightNorm], 0];
        const heightPaint = [
            'interpolate',
            ['linear'],
            ['zoom'],
            14, 0,
            14.5, [
                '*',
                multiplier,
                heightExpr
            ]
        ];

        // Apply to our fallback layer, if present.
        if (mapInstance.getLayer && mapInstance.getLayer('3d-buildings')) {
            mapInstance.setPaintProperty('3d-buildings', 'fill-extrusion-height', heightPaint);
        }

        // Apply to any style-provided building extrusion layer(s) too.
        const style = mapInstance.getStyle?.();
        const layers = style?.layers || [];
        layers
            .filter(l => l && l.type === 'fill-extrusion' && ((l['source-layer'] || l.sourceLayer) === 'building'))
            .forEach(l => {
                try {
                    mapInstance.setPaintProperty(l.id, 'fill-extrusion-height', heightPaint);
                } catch (e) {
                    // ignore
                }
            });

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
    if (!mapInstance) return;
    try {
        // Apply to our fallback layer, if present.
        if (mapInstance.getLayer && mapInstance.getLayer('3d-buildings')) {
            mapInstance.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', opacity);
        }
        // Apply to any style-provided building extrusion layer(s) too.
        const style = mapInstance.getStyle?.();
        const layers = style?.layers || [];
        layers
            .filter(l => l && l.type === 'fill-extrusion' && ((l['source-layer'] || l.sourceLayer) === 'building'))
            .forEach(l => {
                try {
                    mapInstance.setPaintProperty(l.id, 'fill-extrusion-opacity', opacity);
                } catch (e) {
                    // ignore
                }
            });
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

// ===== ROAD LABEL MANAGEMENT =====

/**
 * Configure road name labels visibility and styling
 * Works with Liberty style from OpenFreeMap which includes road labels
 * @param {maplibregl.Map} mapInstance - The map instance
 * @param {Object} options - Configuration options
 *   - enabled: boolean (default: true)
 *   - minZoom: number (default: 10) - Minimum zoom to show labels
 *   - maxZoom: number (default: 22) - Maximum zoom to show labels
 *   - textColor: string (default: '#000000') - Label text color
 *   - textHaloColor: string (default: '#ffffff') - Text halo/outline color
 *   - textHaloWidth: number (default: 1) - Halo width in pixels
 *   - textSize: number (default: 12) - Base text size
 */
function configureRoadLabels(mapInstance, options = {}) {
    if (!mapInstance) {
        console.error('[MapLibre] configureRoadLabels: map is null');
        return;
    }

    const config = {
        enabled: options.enabled !== false,
        minZoom: options.minZoom || 10,
        maxZoom: options.maxZoom || 22,
        textColor: options.textColor || '#000000',
        textHaloColor: options.textHaloColor || '#ffffff',
        textHaloWidth: options.textHaloWidth || 1,
        textSize: options.textSize || 12
    };

    const applyLabelConfig = () => {
        try {
            const style = mapInstance.getStyle();
            if (!style || !style.layers) {
                console.log('[MapLibre] Style not ready for label configuration');
                return;
            }

            // Find all symbol layers with text (road labels, motorway names, etc.)
            // Liberty/OpenMapTiles uses: road_label, transportation_name, road_ref, etc.
            const labelLayers = style.layers.filter(layer =>
                layer.type === 'symbol' &&
                layer.layout &&
                layer.layout['text-field'] &&
                (layer.id.includes('label') || layer.id.includes('text') ||
                 layer.id.includes('road') || layer.id.includes('transportation') ||
                 layer.id.includes('street') || layer.id.includes('motorway') ||
                 layer.id.includes('trunk') || layer.id.includes('primary') ||
                 layer.id.includes('ref'))
            );

            console.log(`[MapLibre] Found ${labelLayers.length} label layers to configure`);

            labelLayers.forEach(layer => {
                try {
                    // Set visibility
                    mapInstance.setLayoutProperty(
                        layer.id,
                        'visibility',
                        config.enabled ? 'visible' : 'hidden'
                    );

                    // Set text color
                    mapInstance.setPaintProperty(
                        layer.id,
                        'text-color',
                        config.textColor
                    );

                    // Set text halo (outline) for readability
                    mapInstance.setPaintProperty(
                        layer.id,
                        'text-halo-color',
                        config.textHaloColor
                    );

                    mapInstance.setPaintProperty(
                        layer.id,
                        'text-halo-width',
                        config.textHaloWidth
                    );

                    // Optionally adjust text size based on zoom
                    // Use interpolation for smooth scaling
                    mapInstance.setLayoutProperty(
                        layer.id,
                        'text-size',
                        [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            10, config.textSize * 0.8,      // Smaller at zoom 10
                            15, config.textSize,             // Normal at zoom 15
                            20, config.textSize * 1.3        // Larger at zoom 20
                        ]
                    );

                    console.log(`[MapLibre] Configured label layer: ${layer.id}`);
                } catch (e) {
                    console.warn(`[MapLibre] Error configuring label layer ${layer.id}:`, e.message);
                }
            });

            console.log('[MapLibre] Road labels configured successfully');
        } catch (e) {
            console.error('[MapLibre] Error configuring road labels:', e.message);
        }
    };

    // Apply configuration when style is loaded
    if (mapInstance.isStyleLoaded()) {
        applyLabelConfig();
    } else {
        mapInstance.once('style.load', applyLabelConfig);
    }
}

/**
 * Toggle road label visibility on/off
 * @param {maplibregl.Map} mapInstance - The map instance
 * @param {boolean} visible - Whether labels should be visible
 */
function toggleRoadLabels(mapInstance, visible) {
    if (!mapInstance) return;

    const toggleLabels = () => {
        try {
            const style = mapInstance.getStyle();
            if (!style || !style.layers) return;

            // Target road/motorway name layers (not place names, water names, etc.)
            const labelLayers = style.layers.filter(layer =>
                layer.type === 'symbol' &&
                layer.layout &&
                layer.layout['text-field'] &&
                (layer.id.includes('road') || layer.id.includes('transportation') ||
                 layer.id.includes('motorway') || layer.id.includes('street') ||
                 layer.id.includes('trunk') || layer.id.includes('primary') ||
                 layer.id.includes('ref'))
            );

            labelLayers.forEach(layer => {
                try {
                    mapInstance.setLayoutProperty(
                        layer.id,
                        'visibility',
                        visible ? 'visible' : 'hidden'
                    );
                } catch (e) {
                    // Silently skip layers that can't be modified
                }
            });

            console.log(`[MapLibre] Road labels ${visible ? 'shown' : 'hidden'}`);
        } catch (e) {
            console.error('[MapLibre] Error toggling road labels:', e.message);
        }
    };

    if (mapInstance.isStyleLoaded()) {
        toggleLabels();
    } else {
        mapInstance.once('style.load', toggleLabels);
    }
}

/**
 * Set zoom-level-based road label filtering
 * Shows different road types at different zoom levels
 * @param {maplibregl.Map} mapInstance - The map instance
 * @param {Object} options - Zoom level configuration
 *   - motorwayMinZoom: number (default: 5) - Show motorways from this zoom
 *   - mainRoadMinZoom: number (default: 10) - Show A/B roads from this zoom
 *   - streetMinZoom: number (default: 14) - Show all streets from this zoom
 */
function setRoadLabelZoomFilters(mapInstance, options = {}) {
    if (!mapInstance) return;

    const config = {
        motorwayMinZoom: options.motorwayMinZoom || 4,
        mainRoadMinZoom: options.mainRoadMinZoom || 8,
        streetMinZoom: options.streetMinZoom || 10
    };

    const applyFilters = () => {
        try {
            const style = mapInstance.getStyle();
            if (!style || !style.layers) return;

            style.layers.forEach(layer => {
                if (layer.type !== 'symbol' || !layer.layout || !layer.layout['text-field']) return;

                try {
                    // Determine which zoom level applies to this layer
                    let minZoom = config.streetMinZoom;

                    if (layer.id.includes('motorway')) {
                        minZoom = config.motorwayMinZoom;
                    } else if (layer.id.includes('trunk') || layer.id.includes('primary') || layer.id.includes('secondary')) {
                        minZoom = config.mainRoadMinZoom;
                    }

                    // Set min/max zoom for the layer
                    mapInstance.setLayerZoomRange(layer.id, minZoom, 24);
                } catch (e) {
                    // Silently skip layers that don't support zoom ranges
                }
            });

            console.log('[MapLibre] Road label zoom filters applied');
        } catch (e) {
            console.error('[MapLibre] Error setting zoom filters:', e.message);
        }
    };

    if (mapInstance.isStyleLoaded()) {
        applyFilters();
    } else {
        mapInstance.once('style.load', applyFilters);
    }
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
    configureRoadLabels,
    toggleRoadLabels,
    setRoadLabelZoomFilters,
    featureGroup,
    activeLayers,
    activeMarkers
};
