# Voyagr PWA: Refresh Mechanisms Implementation Guide
**Date**: 2025-11-02  
**Status**: Ready for Implementation

---

## IMPLEMENTATION ROADMAP

### Phase 1: Traffic & ETA Refresh (Recommended First)

**Goal**: Implement automatic traffic and ETA updates during navigation

**Files to Modify**:
- `voyagr_web.py` - Add traffic refresh endpoint
- HTML/JavaScript - Add refresh intervals

**Estimated Time**: 30-45 minutes

**Code Changes**:

```javascript
// Add to voyagr_web.py JavaScript section (after line 2620)

// ===== LIVE DATA REFRESH SYSTEM =====
let trafficRefreshInterval = null;
let etaRefreshInterval = null;
let weatherRefreshInterval = null;
let hazardRefreshInterval = null;

const REFRESH_INTERVALS = {
    traffic_navigation: 300000,    // 5 minutes during navigation
    traffic_idle: 900000,          // 15 minutes when idle
    eta: 30000,                    // 30 seconds during navigation
    weather_navigation: 1800000,   // 30 minutes during navigation
    weather_idle: 3600000,         // 60 minutes when idle
    hazards_navigation: 300000,    // 5 minutes during navigation
    hazards_idle: 600000           // 10 minutes when idle
};

function startLiveDataRefresh() {
    if (routeInProgress) {
        // Traffic refresh every 5 minutes
        trafficRefreshInterval = setInterval(() => {
            refreshTrafficData();
        }, REFRESH_INTERVALS.traffic_navigation);
        
        // ETA refresh every 30 seconds
        etaRefreshInterval = setInterval(() => {
            updateETACalculation();
        }, REFRESH_INTERVALS.eta);
        
        // Weather refresh every 30 minutes
        weatherRefreshInterval = setInterval(() => {
            refreshWeatherData();
        }, REFRESH_INTERVALS.weather_navigation);
        
        // Hazards refresh every 5 minutes
        hazardRefreshInterval = setInterval(() => {
            checkNearbyHazards(currentLat, currentLon);
        }, REFRESH_INTERVALS.hazards_navigation);
    }
}

function stopLiveDataRefresh() {
    clearInterval(trafficRefreshInterval);
    clearInterval(etaRefreshInterval);
    clearInterval(weatherRefreshInterval);
    clearInterval(hazardRefreshInterval);
}

function refreshTrafficData() {
    if (!routeInProgress || !currentLat || !currentLon) return;
    
    fetch(`/api/traffic-patterns?lat=${currentLat}&lon=${currentLon}`)
        .then(r => r.json())
        .then(data => {
            if (data.success && data.patterns && data.patterns.length > 0) {
                const pattern = data.patterns[0];
                if (pattern.congestion > 2) {
                    sendNotification('🚗 Traffic Update', 
                        `Heavy traffic ahead (Congestion: ${pattern.congestion}/5)`, 
                        'warning');
                }
            }
        })
        .catch(e => console.log('Traffic refresh error:', e));
}

function updateETACalculation() {
    if (!routeInProgress || !routePolyline || currentStepIndex === undefined) return;
    
    // Calculate remaining distance
    let remainingDistance = 0;
    for (let i = currentStepIndex; i < routePolyline.length - 1; i++) {
        remainingDistance += calculateDistance(
            routePolyline[i][0], routePolyline[i][1],
            routePolyline[i+1][0], routePolyline[i+1][1]
        );
    }
    
    // Get average speed from recent tracking history
    let avgSpeed = 40; // Default 40 km/h
    if (trackingHistory.length > 5) {
        const recentSpeeds = trackingHistory.slice(-5).map(t => t.speed * 3.6);
        avgSpeed = recentSpeeds.reduce((a, b) => a + b) / recentSpeeds.length;
    }
    
    // Calculate ETA
    const timeRemaining = (remainingDistance / avgSpeed) * 60; // minutes
    const eta = new Date(Date.now() + timeRemaining * 60000);
    
    // Update display
    const turnInfo = document.getElementById('turnInfo');
    if (turnInfo) {
        turnInfo.innerHTML = `
            <div style="padding: 10px; background: #f0f0f0; border-radius: 8px;">
                <div style="font-size: 12px; color: #666;">ETA</div>
                <div style="font-size: 18px; font-weight: bold; color: #333;">
                    ${eta.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                </div>
                <div style="font-size: 12px; color: #999; margin-top: 5px;">
                    ${(remainingDistance / 1000).toFixed(1)} km remaining
                </div>
            </div>
        `;
    }
}

function refreshWeatherData() {
    if (!currentLat || !currentLon) return;
    
    fetch(`/api/weather?lat=${currentLat}&lon=${currentLon}`)
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                // Check for severe weather
                if (data.description.includes('rain') || 
                    data.description.includes('storm') ||
                    data.description.includes('snow')) {
                    sendNotification('⛈️ Weather Alert', 
                        `${data.description} ahead`, 
                        'warning');
                }
            }
        })
        .catch(e => console.log('Weather refresh error:', e));
}

// Modify startNavigation() to include live data refresh
function startNavigation() {
    // ... existing code ...
    startLiveDataRefresh();
}

// Modify stopTurnByTurnNavigation() to stop live data refresh
function stopTurnByTurnNavigation() {
    // ... existing code ...
    stopLiveDataRefresh();
}
```

---

### Phase 2: Automatic PWA Updates (Non-Intrusive)

**Goal**: Auto-reload PWA when updates available (without interrupting navigation)

**Code Changes**:

```javascript
// Modify service worker update handler (around line 2595)

navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[PWA] New service worker activated');
    
    // Check if navigation is in progress
    if (routeInProgress) {
        // Queue update for after navigation
        window.updatePending = true;
        showStatus('✅ Update available. Will apply after navigation.', 'info');
    } else {
        // Safe to reload immediately
        showStatus('🔄 Applying app update...', 'success');
        // Save state before reload
        saveAppState();
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
});

// Add state preservation functions
function saveAppState() {
    const state = {
        preferences: {
            tolls: localStorage.getItem('pref_tolls'),
            caz: localStorage.getItem('pref_caz'),
            speedCameras: localStorage.getItem('pref_speedCameras'),
            trafficCameras: localStorage.getItem('pref_trafficCameras')
        },
        timestamp: Date.now()
    };
    localStorage.setItem('appState', JSON.stringify(state));
}

function restoreAppState() {
    const saved = localStorage.getItem('appState');
    if (saved) {
        try {
            const state = JSON.parse(saved);
            // Restore preferences
            Object.keys(state.preferences).forEach(key => {
                if (state.preferences[key]) {
                    localStorage.setItem('pref_' + key, state.preferences[key]);
                }
            });
            localStorage.removeItem('appState');
        } catch (e) {
            console.log('State restore error:', e);
        }
    }
}

// Call on page load
window.addEventListener('load', () => {
    restoreAppState();
});

// Check for pending update when navigation ends
function stopTurnByTurnNavigation() {
    // ... existing code ...
    
    if (window.updatePending) {
        showStatus('🔄 Applying pending update...', 'success');
        saveAppState();
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
}
```

---

### Phase 3: Adaptive Refresh Intervals (Battery-Aware)

**Goal**: Adjust refresh intervals based on battery level

**Code Changes**:

```javascript
// Add battery-aware refresh intervals
function getAdaptiveRefreshInterval(baseInterval) {
    if (!('getBattery' in navigator)) {
        return baseInterval; // Use base interval if Battery API unavailable
    }
    
    navigator.getBattery().then(battery => {
        const level = battery.level;
        
        if (level < 0.15) {
            // Critical battery: increase intervals by 3x
            return baseInterval * 3;
        } else if (level < 0.30) {
            // Low battery: increase intervals by 2x
            return baseInterval * 2;
        } else if (level < 0.50) {
            // Medium battery: increase intervals by 1.5x
            return baseInterval * 1.5;
        }
        
        return baseInterval; // Normal intervals
    });
}

// Use adaptive intervals
function startLiveDataRefresh() {
    if (routeInProgress) {
        const trafficInterval = getAdaptiveRefreshInterval(
            REFRESH_INTERVALS.traffic_navigation
        );
        const etaInterval = getAdaptiveRefreshInterval(
            REFRESH_INTERVALS.eta
        );
        
        trafficRefreshInterval = setInterval(refreshTrafficData, trafficInterval);
        etaRefreshInterval = setInterval(updateETACalculation, etaInterval);
    }
}
```

---

## TESTING CHECKLIST

- [ ] Traffic refresh works every 5 minutes during navigation
- [ ] ETA updates every 30 seconds with accurate calculations
- [ ] Weather alerts trigger for severe conditions
- [ ] Hazard checks work on every GPS update
- [ ] PWA auto-reloads after update (when not navigating)
- [ ] App state preserved after reload
- [ ] Refresh intervals adapt to battery level
- [ ] No excessive API calls or battery drain
- [ ] Works on Pixel 6 with mobile network
- [ ] Offline mode still works (uses cached data)

---

## PERFORMANCE METRICS

**Expected Results**:
- Battery drain: +5-10% per hour (during navigation)
- Network usage: ~2-5 MB per hour (during navigation)
- API calls: ~12-15 per hour (during navigation)
- CPU usage: <5% average

**Optimization Tips**:
1. Batch API requests when possible
2. Use request debouncing to prevent duplicates
3. Cache aggressively (10-30 minute cache)
4. Disable updates during battery saving mode
5. Use lower accuracy GPS in idle mode

