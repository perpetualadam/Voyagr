/**
 * Traffic Lights Module
 * Displays mapped traffic-light locations. OSM does not provide live signal phases.
 * @module modules/traffic-lights
 */

// ===== TRAFFIC LIGHT STATE =====
const trafficLightMarkers = new Map(); // id -> marker
let trafficLightsEnabled = localStorage.getItem('trafficLightsEnabled') !== 'false';
let trafficLightRequestGeneration = 0;
let trafficLightRequestController = null;

// Traffic light states and colors
const TRAFFIC_LIGHT_STATES = {
    'red': { color: '#ef4444', activeLight: 'red', label: 'Stop' },
    'yellow': { color: '#f59e0b', activeLight: 'yellow', label: 'Caution' },
    'green': { color: '#22c55e', activeLight: 'green', label: 'Go' },
    'unknown': { color: '#6b7280', activeLight: 'none', label: 'Unknown' }
};

// Marker dimensions (~20% smaller than original 26×38 pill / 14×32 icon)
const TRAFFIC_LIGHT_PILL_WIDTH = 21;
const TRAFFIC_LIGHT_PILL_HEIGHT = 30;
const TRAFFIC_LIGHT_SVG_WIDTH = 11;
const TRAFFIC_LIGHT_SVG_HEIGHT = 26;
const TRAFFIC_LIGHT_PILL_BORDER_RADIUS = 8;

/**
 * Vertical traffic-light icon (same geometry as OSM map markers — green frame, dark housing).
 * @param {string} activeLight - 'red' | 'yellow' | 'green' | 'none' (all lenses dim)
 * @param {number} width - Rendered width (default 11)
 * @param {number} height - Rendered height (default 26)
 */
function createTrafficLightSVG(activeLight, width = TRAFFIC_LIGHT_SVG_WIDTH, height = TRAFFIC_LIGHT_SVG_HEIGHT) {
    const dimR = '#7f1d1d';
    const dimY = '#713f12';
    const dimG = '#14532d';
    const brightR = '#ef4444';
    const brightY = '#f59e0b';
    const brightG = '#22c55e';
    // Default OSM icon style: all three lenses visible in vertical order.
    let r = brightR;
    let y = brightY;
    let g = brightG;
    // Optional state emphasis mode: only one lens bright.
    if (activeLight === 'red' || activeLight === 'yellow' || activeLight === 'green') {
        r = dimR;
        y = dimY;
        g = dimG;
    }
    if (activeLight === 'red') r = brightR;
    else if (activeLight === 'yellow') y = brightY;
    else if (activeLight === 'green') g = brightG;

    return `<svg viewBox="0 0 16 36" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="display:block;flex-shrink:0;width:${width}px;height:${height}px" aria-hidden="true"><rect x="1.5" y="0.5" width="13" height="35" rx="2" fill="#111827" stroke="#2e7d32" stroke-width="1.2"/><circle cx="8" cy="8.5" r="4.2" fill="${r}"/><circle cx="8" cy="18" r="4.2" fill="${y}"/><circle cx="8" cy="27.5" r="4.2" fill="${g}"/></svg>`;
}

/**
 * Create a traffic light marker element
 * @param {Object} light - Traffic light data {id, lat, lng, state, duration, lastChanged}
 * @returns {HTMLElement} Marker element
 */
function createTrafficLightElement(light) {
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
            <div class="traffic-light-osm-wrap">
                <div class="traffic-light-icon">${createTrafficLightSVG('none')}</div>
            </div>
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
    const popup = new maplibregl.Popup({ offset: 20, closeButton: false })
        .setHTML(`
            <div class="traffic-light-popup">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <div class="traffic-light-osm-wrap traffic-light-osm-wrap--popup">
                        ${createTrafficLightSVG('none', TRAFFIC_LIGHT_SVG_WIDTH, TRAFFIC_LIGHT_SVG_HEIGHT)}
                    </div>
                    <strong>Traffic Light</strong>
                </div>
                State: <span style="color: ${stateInfo.color}; font-weight: bold;">${stateInfo.label}</span><br>
                ${Number.isFinite(light.duration) && light.duration>0 ? `Duration: ${light.duration}s<br>` : ''}
                ${light.name ? `Name: ${String(light.name).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}<br>` : ''}
            </div>
        `);
    marker.setPopup(popup);

    marker.addTo(map);

    // Store reference
    trafficLightMarkers.set(light.id, {
        marker: marker,
        data: light
    });

    // Reduced logging - only log every 50th light to avoid console spam
    const lightCount = trafficLightMarkers.size;
    if (lightCount % 50 === 0 || lightCount === 1) {
        console.log(`[Traffic Lights] Added ${lightCount} lights so far...`);
    }
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
    // Keep route marker icon consistent with OSM style (neutral lenses).
    const iconEl = el.querySelector('.traffic-light-icon');
    if (iconEl) {
        iconEl.innerHTML = createTrafficLightSVG('none');
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
function clearAllTrafficLights(invalidateRequest = true) {
    if(invalidateRequest){trafficLightRequestGeneration++;if(trafficLightRequestController)trafficLightRequestController.abort();trafficLightRequestController=null;}
    if(invalidateRequest)routeTrafficLightStatus('');
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
function describeTrafficLightCoverage(data, count, scope = 'route') {
    const coverage=data&&data.coverage||{};
    if(coverage.reason==='area_too_large')return 'Traffic-light area is too large; zoom in or inspect a shorter route. Coverage is partial.';
    if(!data||data.success!==true||(!count&&['UNKNOWN','UNAVAILABLE'].includes(coverage.status)))return 'Traffic-light data unavailable. Coverage is unknown; an empty overlay does not mean there are no signals.';
    const where=scope==='area'?'in this map area':'near this route';
    const message=count?count+' mapped traffic-light locations shown '+where+'.':'No mapped traffic-light locations returned '+where+'. This does not establish that there are no signals.';
    return message+' Coverage is '+(coverage.status==='STALE'?'stale':coverage.status==='AVAILABLE'?'limited to mapped data':'partial or unverified')+'. Live signal state is unavailable.';
}
function routeTrafficLightStatus(text) {
    const el=document.getElementById('routeTrafficLightStatus');if(el)el.textContent=text;
}
async function plotTrafficLightsOnRoute(route) {
    const generation=++trafficLightRequestGeneration;
    if(trafficLightRequestController)trafficLightRequestController.abort();
    trafficLightRequestController=null;
    clearAllTrafficLights(false);
    if(!trafficLightsEnabled||!Array.isArray(route)||route.length<2){routeTrafficLightStatus(trafficLightsEnabled?'':'Route traffic-light overlay is off.');return;}
    const currentMap=typeof map==='undefined'?null:map;
    if(!currentMap){routeTrafficLightStatus('');return;}
    const controller=typeof AbortController==='function'?new AbortController():null;
    trafficLightRequestController=controller;
    const current=()=>generation===trafficLightRequestGeneration&&trafficLightsEnabled&&currentMap===(typeof map==='undefined'?null:map);
    routeTrafficLightStatus('Loading mapped traffic-light locations…');
    try {
        const response=await fetch('/api/traffic-lights',{
            method:'POST',headers:{'Content-Type':'application/json'},
            ...(controller?{signal:controller.signal}:{}),
            body:JSON.stringify({route:{type:'LineString',coordinates:route.map(p=>[p[1],p[0]])}})
        });
        if(!response.ok)throw Error('Traffic-light request failed');
        const data=await response.json();
        if(!current())return;
        if(!data||data.success!==true||!Array.isArray(data.lights))throw Error('Invalid traffic-light response');
        const shown=new Set();
        data.lights.slice(0,200).forEach(light=>{
            if(!light||!light.id||shown.has(light.id)||!Number.isFinite(light.lat)||!Number.isFinite(light.lng)||Math.abs(light.lat)>90||Math.abs(light.lng)>180)return;
            shown.add(light.id);
            addTrafficLight({...light,state:'unknown',duration:undefined,lastChanged:undefined});
        });
        routeTrafficLightStatus(describeTrafficLightCoverage(data,shown.size));
        // OSM supplies locations, not signal phases or countdowns.
    } catch(error) {
        if(current())routeTrafficLightStatus(describeTrafficLightCoverage(null,0));
    } finally {
        if(generation===trafficLightRequestGeneration)trafficLightRequestController=null;
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
        routeTrafficLightStatus('Route traffic-light overlay is off.');
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
    isEnabled: () => trafficLightsEnabled,
    describeCoverage: describeTrafficLightCoverage,
    /** Shared vertical icon for OSM + route markers (activeLight: red|yellow|green|none) */
    createIconSVG: createTrafficLightSVG
};

// Backward-compatible global alias used by legacy callers.
if (typeof window !== 'undefined') {
    window.plotTrafficLightsOnRoute = plotTrafficLightsOnRoute;
}

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
            background: transparent;
            padding: 0;
        }

        .traffic-light-osm-wrap {
            box-sizing: border-box;
            width: ${TRAFFIC_LIGHT_PILL_WIDTH}px;
            height: ${TRAFFIC_LIGHT_PILL_HEIGHT}px;
            background: #e8f5e9;
            border: 2px solid #2e7d32;
            border-radius: ${TRAFFIC_LIGHT_PILL_BORDER_RADIUS}px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
        }

        .traffic-light-osm-wrap--popup {
            width: ${TRAFFIC_LIGHT_PILL_WIDTH}px;
            height: ${TRAFFIC_LIGHT_PILL_HEIGHT}px;
            flex-shrink: 0;
        }

        .traffic-light-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 0;
        }

        .traffic-light-icon svg {
            width: ${TRAFFIC_LIGHT_SVG_WIDTH}px !important;
            height: ${TRAFFIC_LIGHT_SVG_HEIGHT}px !important;
            min-width: ${TRAFFIC_LIGHT_SVG_WIDTH}px;
            min-height: ${TRAFFIC_LIGHT_SVG_HEIGHT}px;
            flex-shrink: 0;
            filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
        }

        .traffic-light-container .countdown {
            font-size: 8px;
            color: #1a1a1a;
            font-weight: bold;
            margin-top: 1px;
            background: rgba(255, 255, 255, 0.9);
            padding: 0px 3px;
            border-radius: 2px;
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
