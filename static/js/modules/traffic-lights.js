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
    'red': { color: '#ef4444', activeLight: 'red', label: 'Stop' },
    'yellow': { color: '#f59e0b', activeLight: 'yellow', label: 'Caution' },
    'green': { color: '#22c55e', activeLight: 'green', label: 'Go' },
    'unknown': { color: '#6b7280', activeLight: 'none', label: 'Unknown' }
};

/**
 * Create SVG traffic light icon
 * @param {string} activeLight - Which light is active: 'red', 'yellow', 'green', or 'none'
 * @returns {string} SVG HTML string
 */
function createTrafficLightSVG(activeLight) {
    return `
        <svg width="24" height="48" viewBox="0 0 24 48" xmlns="http://www.w3.org/2000/svg">
            <!-- Traffic light housing -->
            <rect x="2" y="0" width="20" height="48" rx="3" fill="#1a1a1a" stroke="#333" stroke-width="1"/>

            <!-- Red light -->
            <circle cx="12" cy="10" r="6"
                fill="${activeLight === 'red' ? '#ef4444' : '#4a1a1a'}"
                stroke="#666" stroke-width="0.5"
                opacity="${activeLight === 'red' ? '1' : '0.4'}"/>
            ${activeLight === 'red' ? '<circle cx="12" cy="10" r="6" fill="url(#redGlow)"/>' : ''}

            <!-- Yellow light -->
            <circle cx="12" cy="24" r="6"
                fill="${activeLight === 'yellow' ? '#f59e0b' : '#4a3a1a'}"
                stroke="#666" stroke-width="0.5"
                opacity="${activeLight === 'yellow' ? '1' : '0.4'}"/>
            ${activeLight === 'yellow' ? '<circle cx="12" cy="24" r="6" fill="url(#yellowGlow)"/>' : ''}

            <!-- Green light -->
            <circle cx="12" cy="38" r="6"
                fill="${activeLight === 'green' ? '#22c55e' : '#1a4a2a'}"
                stroke="#666" stroke-width="0.5"
                opacity="${activeLight === 'green' ? '1' : '0.4'}"/>
            ${activeLight === 'green' ? '<circle cx="12" cy="38" r="6" fill="url(#greenGlow)"/>' : ''}

            <!-- Glow effects -->
            <defs>
                <radialGradient id="redGlow">
                    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.6"/>
                    <stop offset="50%" stop-color="#ef4444" stop-opacity="0.8"/>
                    <stop offset="100%" stop-color="#ef4444" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="yellowGlow">
                    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.6"/>
                    <stop offset="50%" stop-color="#f59e0b" stop-opacity="0.8"/>
                    <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="greenGlow">
                    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.6"/>
                    <stop offset="50%" stop-color="#22c55e" stop-opacity="0.8"/>
                    <stop offset="100%" stop-color="#22c55e" stop-opacity="0"/>
                </radialGradient>
            </defs>
        </svg>
    `;
}

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
        <div class="traffic-light-container">
            <div class="traffic-light-icon">${createTrafficLightSVG(stateInfo.activeLight)}</div>
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
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <div style="width: 20px; height: 40px;">
                        ${createTrafficLightSVG(stateInfo.activeLight)}
                    </div>
                    <strong>Traffic Light</strong>
                </div>
                State: <span style="color: ${stateInfo.color}; font-weight: bold;">${stateInfo.label}</span><br>
                ${light.duration ? `Duration: ${light.duration}s<br>` : ''}
                ${light.name ? `Name: ${light.name}<br>` : ''}
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

    // Update icon with new SVG
    const iconEl = el.querySelector('.traffic-light-icon');
    if (iconEl) {
        iconEl.innerHTML = createTrafficLightSVG(stateInfo.activeLight);
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

    // Container styling is now handled by CSS (no dynamic color needed)

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
            background: rgba(255, 255, 255, 0.95);
            border-radius: 6px;
            padding: 4px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), 0 0 0 2px rgba(0, 0, 0, 0.2);
        }

        .traffic-light-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 0;
        }

        .traffic-light-icon svg {
            filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.3));
        }

        .traffic-light-container .countdown {
            font-size: 9px;
            color: #1a1a1a;
            font-weight: bold;
            margin-top: 2px;
            background: rgba(255, 255, 255, 0.9);
            padding: 1px 4px;
            border-radius: 3px;
        }

        .traffic-light-popup {
            font-size: 12px;
            line-height: 1.6;
        }

        .traffic-light-popup svg {
            filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
        }
    `;
    document.head.appendChild(style);
}
