/**
 * @file Map UI Module - Handles map display and interactions
 * @module modules/ui/map
 */

/**
 * MapManager class - Manages map display and route visualization
 * @class MapManager
 */
export class MapManager {
    constructor(config = {}) {
        this.mapElement = config.mapElement || 'map';
        this.map = null;
        this.routeLayer = null;
        this.markerLayer = null;
        this.currentZoom = config.initialZoom || 13;
        this.animationDuration = config.animationDuration || 500;
    }

    /**
     * Initialize map
     * @param {number} lat - Initial latitude
     * @param {number} lon - Initial longitude
     * @returns {Object} Map instance
     */
    initializeMap(lat, lon) {
        if (typeof L === 'undefined') {
            console.error('Leaflet library not loaded');
            return null;
        }

        this.map = L.map(this.mapElement).setView([lat, lon], this.currentZoom);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);

        this.routeLayer = L.featureGroup().addTo(this.map);
        this.markerLayer = L.featureGroup().addTo(this.map);

        return this.map;
    }

    /**
     * Draw route on map
     * @param {Array} coordinates - Array of [lat, lon] coordinates
     * @param {Object} options - Drawing options
     */
    drawRoute(coordinates, options = {}) {
        if (!this.map || !this.routeLayer) return;

        this.routeLayer.clearLayers();

        const polyline = L.polyline(coordinates, {
            color: options.color || '#3388ff',
            weight: options.weight || 4,
            opacity: options.opacity || 0.8,
            dashArray: options.dashArray || null
        }).addTo(this.routeLayer);

        return polyline;
    }

    /**
     * Add marker to map
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {Object} options - Marker options
     * @returns {Object} Marker instance
     */
    addMarker(lat, lon, options = {}) {
        if (!this.map || !this.markerLayer) return null;

        const marker = L.marker([lat, lon], {
            title: options.title || '',
            icon: options.icon || L.icon({
                iconUrl: options.iconUrl || 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41]
            })
        }).addTo(this.markerLayer);

        if (options.popup) {
            marker.bindPopup(options.popup);
        }

        return marker;
    }

    /**
     * Fit map to bounds
     * @param {Array} coordinates - Array of [lat, lon] coordinates
     * @param {Object} options - Fit options
     */
    fitToBounds(coordinates, options = {}) {
        if (!this.map || coordinates.length === 0) return;

        const bounds = L.latLngBounds(coordinates);
        this.map.fitBounds(bounds, {
            padding: [50, 50],
            ...options
        });
    }

    /**
     * Animate to location
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {number} zoom - Zoom level
     */
    animateTo(lat, lon, zoom = this.currentZoom) {
        if (!this.map) return;

        this.map.flyTo([lat, lon], zoom, {
            duration: this.animationDuration / 1000,
            easeLinearity: 0.25
        });

        this.currentZoom = zoom;
    }

    /**
     * Clear all layers
     */
    clearLayers() {
        if (this.routeLayer) this.routeLayer.clearLayers();
        if (this.markerLayer) this.markerLayer.clearLayers();
    }

    /**
     * Get current center
     * @returns {Object} Center coordinates
     */
    getCenter() {
        if (!this.map) return null;
        const center = this.map.getCenter();
        return { lat: center.lat, lon: center.lng };
    }

    /**
     * Get current zoom
     * @returns {number} Current zoom level
     */
    getZoom() {
        return this.currentZoom;
    }
}

