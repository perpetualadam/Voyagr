/**
 * Traffic Lights Module
 * Manages traffic light markers along routes with state, countdown, and live updates
 * @module modules/traffic-lights
 */

// ===== TRAFFIC LIGHT STATE =====
const trafficLightMarkers = new Map(); // id -> marker
let trafficLightsEnabled = localStorage.getItem('trafficLightsEnabled') !== 'false';
let trafficLightUpdateInterval = null;

// Traffic light states and colors
const TRAFFIC_LIGHT_STATES = {
    'red': { color: '#ef4444', icon: '🔴', label: 'Stop' },
    'yellow': { color: '#f59e0b', icon: '🟡', label: 'Caution' },
    'green': { color: '#22c55e', icon: '🟢', label: 'Go' },
    'unknown': { color: '#6b7280', icon: '⚪', label: 'Unknown' }
};

/**
 * Create a traffic light marker element
 * @param {Object} light - Traffic light data {id, lat, lng, state, duration, lastChanged}
 * @returns {HTMLElement} Marker element
 */
function createTrafficLightElement(light) {
    const stateInfo = TRAFFIC_LIGHT_STATES[light.state] || TRAFFIC_LIGHT_STATES.unknown;

    const el = document.createElement('div');
    el.className = 'traffic-light-marker';
    el.setAttribute('data-light-id', light.id);

    // Calculate countdown if duration is available
    let countdown = '';
    if (light.duration && light.lastChanged) {
        const elapsed = (Date.now() - new Date(light.lastChanged).getTime()) / 1000;
        const remaining = Math.max(0, Math.round(light.duration - elapsed));
        if (remaining > 0) {
            countdown = `<span class="countdown">${remaining}s</span>`;
        }
    }

    el.innerHTML = `
        <div class="traffic-light-container" style="--light-color: ${stateInfo.color}">
            <div class="traffic-light-icon">${stateInfo.icon}</div>
            ${countdown}
        </div>
    `;

    el.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        z-index: 100;
    `;

    return el;
}

/**
 * Add a traffic light marker to the map
 * @param {Object} light - Traffic light data
 */
function addTrafficLight(light) {
    if (!map || !light || !light.id) return;

    // Remove existing marker if present
    removeTrafficLight(light.id);

    const el = createTrafficLightElement(light);

    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([light.lng, light.lat]);

    // Add popup with details
    const stateInfo = TRAFFIC_LIGHT_STATES[light.state] || TRAFFIC_LIGHT_STATES.unknown;
    const popup = new maplibregl.Popup({ offset: 25, closeButton: false })
        .setHTML(`
            <div class="traffic-light-popup">
                <strong>Traffic Light</strong><br>
                State: ${stateInfo.label} ${stateInfo.icon}<br>
                ${light.duration ? `Duration: ${light.duration}s` : ''}
            </div>
        `);
    marker.setPopup(popup);

    marker.addTo(map);

    // Store reference
    trafficLightMarkers.set(light.id, {
        marker: marker,
        data: light
    });

    console.log(`[Traffic Lights] Added light ${light.id} (${light.state})`);
}

/**
 * Update an existing traffic light marker
 * @param {string} id - Traffic light ID
 * @param {Object} updates - Updated properties (state, duration, lastChanged)
 */
function updateTrafficLight(id, updates) {
    const entry = trafficLightMarkers.get(id);
    if (!entry) return;

    // Merge updates
    const updatedLight = { ...entry.data, ...updates };

    // Update marker element
    const el = entry.marker.getElement();
    const stateInfo = TRAFFIC_LIGHT_STATES[updatedLight.state] || TRAFFIC_LIGHT_STATES.unknown;

    // Update icon
    const iconEl = el.querySelector('.traffic-light-icon');
    if (iconEl) {
        iconEl.textContent = stateInfo.icon;
    }

    // Update countdown
    let countdownEl = el.querySelector('.countdown');
    if (updatedLight.duration && updatedLight.lastChanged) {
        const elapsed = (Date.now() - new Date(updatedLight.lastChanged).getTime()) / 1000;
        const remaining = Math.max(0, Math.round(updatedLight.duration - elapsed));
        if (remaining > 0) {
            if (!countdownEl) {
                countdownEl = document.createElement('span');
                countdownEl.className = 'countdown';
                el.querySelector('.traffic-light-container').appendChild(countdownEl);
            }
            countdownEl.textContent = `${remaining}s`;
        } else if (countdownEl) {
            countdownEl.remove();
        }
    }

    // Update container color
    const container = el.querySelector('.traffic-light-container');
    if (container) {
        container.style.setProperty('--light-color', stateInfo.color);
    }

    // Update stored data
    entry.data = updatedLight;
}

/**
 * Remove a traffic light marker from the map
 * @param {string} id - Traffic light ID
 */
function removeTrafficLight(id) {
    const entry = trafficLightMarkers.get(id);
    if (entry) {
        entry.marker.remove();
        trafficLightMarkers.delete(id);
        console.log(`[Traffic Lights] Removed light ${id}`);
    }
}

/**
 * Clear all traffic light markers
 */
function clearAllTrafficLights() {
    trafficLightMarkers.forEach((entry, id) => {
        entry.marker.remove();
    });
    trafficLightMarkers.clear();
    console.log('[Traffic Lights] Cleared all markers');
}

/**
 * Fetch and display traffic lights along a route
 * @param {Array} route - Route coordinates [[lat, lng], ...]
 */
async function plotTrafficLightsOnRoute(route) {
    if (!trafficLightsEnabled || !route || route.length === 0) return;

    try {
        // Convert route to GeoJSON LineString for API
        const routeGeoJSON = {
            type: 'LineString',
            coordinates: route.map(p => [p[1], p[0]]) // [lng, lat]
        };

        const response = await fetch('/api/traffic-lights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ route: routeGeoJSON })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (data.success && data.lights) {
            // Clear existing lights
            clearAllTrafficLights();

            // Add new lights
            data.lights.forEach(light => addTrafficLight(light));

            console.log(`[Traffic Lights] Plotted ${data.lights.length} lights on route`);

            // Start countdown update interval
            startCountdownUpdates();
        }
    } catch (error) {
        console.log('[Traffic Lights] Error fetching lights:', error.message);
    }
}

/**
 * Start interval to update countdowns
 */
function startCountdownUpdates() {
    stopCountdownUpdates();

    trafficLightUpdateInterval = setInterval(() => {
        trafficLightMarkers.forEach((entry, id) => {
            updateTrafficLight(id, {}); // Refresh countdown
        });
    }, 1000);
}

/**
 * Stop countdown update interval
 */
function stopCountdownUpdates() {
    if (trafficLightUpdateInterval) {
        clearInterval(trafficLightUpdateInterval);
        trafficLightUpdateInterval = null;
    }
}

/**
 * Toggle traffic lights display on/off
 */
function toggleTrafficLights() {
    trafficLightsEnabled = !trafficLightsEnabled;
    localStorage.setItem('trafficLightsEnabled', trafficLightsEnabled ? 'true' : 'false');

    const toggle = document.getElementById('trafficLightsToggle');
    if (toggle) {
        toggle.classList.toggle('active', trafficLightsEnabled);
    }

    if (trafficLightsEnabled) {
        // Re-fetch if we have an active route
        if (typeof routePolyline !== 'undefined' && routePolyline && routePolyline.length > 0) {
            plotTrafficLightsOnRoute(routePolyline);
        }
        if (typeof showStatus === 'function') {
            showStatus('🚦 Traffic lights enabled', 'success');
        }
    } else {
        clearAllTrafficLights();
        stopCountdownUpdates();
        if (typeof showStatus === 'function') {
            showStatus('🚦 Traffic lights disabled', 'info');
        }
    }

    if (typeof saveAllSettings === 'function') {
        saveAllSettings();
    }
}

/**
 * Check for nearby traffic lights and announce if approaching
 * @param {number} lat - Current latitude
 * @param {number} lon - Current longitude
 */
function checkNearbyTrafficLights(lat, lon) {
    if (!trafficLightsEnabled) return;

    const ANNOUNCE_DISTANCE = 100; // meters

    trafficLightMarkers.forEach((entry, id) => {
        const light = entry.data;
        const distance = calculateHaversineDistance(lat, lon, light.lat, light.lng) * 1000; // km to m

        if (distance < ANNOUNCE_DISTANCE && light.state === 'red') {
            // Could trigger voice announcement here
            console.log(`[Traffic Lights] Approaching red light in ${Math.round(distance)}m`);
        }
    });
}

/**
 * Simple Haversine distance calculation (km)
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ===== EXPORTS =====
window.TrafficLights = {
    addTrafficLight,
    updateTrafficLight,
    removeTrafficLight,
    clearAllTrafficLights,
    plotTrafficLightsOnRoute,
    toggleTrafficLights,
    checkNearbyTrafficLights,
    isEnabled: () => trafficLightsEnabled
};

// Add CSS styles for traffic light markers
if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = `
        .traffic-light-marker {
            pointer-events: auto;
        }
        
        .traffic-light-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 8px;
            padding: 4px 6px;
            border: 2px solid var(--light-color, #6b7280);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        
        .traffic-light-icon {
            font-size: 18px;
            line-height: 1;
        }
        
        .traffic-light-container .countdown {
            font-size: 10px;
            color: white;
            font-weight: bold;
            margin-top: 2px;
        }
        
        .traffic-light-popup {
            font-size: 12px;
            line-height: 1.4;
        }
    `;
    document.head.appendChild(style);
}
