// Leaflet shim for MapLibre compatibility
// This file provides minimal stubs for Leaflet functions used in the app, mapping them to MapLibre GL JS equivalents.
// It is NOT a full Leaflet implementation, but enough to prevent runtime errors during migration.

window.L = {};

// No-op for map.eachLayer (used in theme handling)
L.eachLayer = function(callback) { /* No layers to iterate in MapLibre */ };

// TileLayer shim – returns an object with addTo that does nothing (MapLibre uses style URL)
L.tileLayer = function(url, options) {
    return {
        addTo: function(map) { /* MapLibre handles tiles via style */ }
    };
};

// Marker shim – creates a MapLibre marker
L.marker = function(latlng, options) {
    const [lat, lon] = Array.isArray(latlng) ? [latlng[0], latlng[1]] : [latlng.lat, latlng.lng];
    const marker = new maplibregl.Marker(options && options.icon ? { element: options.icon } : {});
    marker.setLngLat([lon, lat]);
    return {
        addTo: function(map) { marker.addTo(map); return marker; },
        setIcon: function(icon) { /* not needed */ },
        bindPopup: function(content) { /* optional */ },
        on: function(event, handler) { marker.on(event, handler); }
    };
};

// CircleMarker shim – uses a simple marker with CSS class
L.circleMarker = function(latlng, options) {
    const [lat, lon] = Array.isArray(latlng) ? [latlng[0], latlng[1]] : [latlng.lat, latlng.lng];
    const el = document.createElement('div');
    el.className = 'circle-marker';
    el.style.width = (options && options.radius ? options.radius * 2 : 10) + 'px';
    el.style.height = (options && options.radius ? options.radius * 2 : 10) + 'px';
    el.style.background = (options && options.color) || '#ff0000';
    el.style.borderRadius = '50%';
    const marker = new maplibregl.Marker(el);
    marker.setLngLat([lon, lat]);
    return {
        addTo: function(map) { marker.addTo(map); return marker; },
        setStyle: function(style) { Object.assign(el.style, style); }
    };
};

// Polyline shim – creates a GeoJSON line source and layer
L.polyline = function(latlngs, options) {
    const coordinates = latlngs.map(function(pt) {
        const [lat, lon] = Array.isArray(pt) ? [pt[0], pt[1]] : [pt.lat, pt.lng];
        return [lon, lat];
    });
    const id = 'polyline-' + Math.random().toString(36).substr(2, 9);
    return {
        addTo: function(map) {
            map.addSource(id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coordinates } } });
            map.addLayer({ id: id, type: 'line', source: id, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': (options && options.color) || '#ff0000', 'line-width': (options && options.weight) || 2 } });
            return this;
        },
        setStyle: function(style) {
            if (style && style.color) { map.setPaintProperty(id, 'line-color', style.color); }
            if (style && style.weight) { map.setPaintProperty(id, 'line-width', style.weight); }
        }
    };
};

// DivIcon shim – creates a simple HTML element
L.divIcon = function(options) {
    const el = document.createElement('div');
    if (options && options.html) el.innerHTML = options.html;
    if (options && options.className) el.className = options.className;
    return el;
};

// Control shim – placeholder for map controls (e.g., navigation)
L.control = {
    scale: function(options) { return { addTo: function(map) {} }; },
    zoom: function(options) { return { addTo: function(map) {} }; }
};

// Export L globally
window.L = L;
