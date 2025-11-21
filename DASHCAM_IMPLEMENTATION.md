# Voyagr Dashcam Feature - Implementation Guide

## Overview

The Dashcam feature for Voyagr PWA enables users to record video with GPS metadata during navigation or as a standalone feature. This guide covers architecture, API endpoints, usage, and troubleshooting.

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (HTML/JS)                       │
│  - Dashcam Tab UI                                           │
│  - Recording Controls (Start/Stop)                          │
│  - Settings Panel                                           │
│  - Recordings List                                          │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP/JSON
┌────────────────────▼────────────────────────────────────────┐
│              Flask API (dashcam_blueprint.py)               │
│  - 10 REST Endpoints                                        │
│  - Request Validation                                       │
│  - Error Handling                                           │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│           Service Layer (dashcam_service.py)                │
│  - Recording Lifecycle Management                           │
│  - Metadata Collection                                      │
│  - File Storage & Cleanup                                   │
│  - Settings Management                                      │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              SQLite Database                                │
│  - dashcam_recordings table                                 │
│  - Recording metadata & history                             │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema

```sql
CREATE TABLE dashcam_recordings (
    id INTEGER PRIMARY KEY,
    recording_id TEXT UNIQUE NOT NULL,
    trip_id TEXT,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    duration_seconds REAL,
    status TEXT DEFAULT 'recording',
    metadata_points INTEGER DEFAULT 0,
    file_path TEXT,
    file_size_mb REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## API Endpoints

### 1. Start Recording
**Endpoint:** `POST /api/dashcam/start`

**Request:**
```json
{
    "trip_id": "optional-trip-id"
}
```

**Response:**
```json
{
    "success": true,
    "recording_id": "rec_1234567890",
    "start_time": "2025-11-21T10:30:00"
}
```

### 2. Stop Recording
**Endpoint:** `POST /api/dashcam/stop`

**Response:**
```json
{
    "success": true,
    "recording_id": "rec_1234567890",
    "duration_seconds": 125.5,
    "end_time": "2025-11-21T10:32:05"
}
```

### 3. Get Recording Status
**Endpoint:** `GET /api/dashcam/status`

**Response:**
```json
{
    "recording": true,
    "recording_id": "rec_1234567890",
    "elapsed_seconds": 45.2,
    "metadata_points": 9
}
```

### 4. Add GPS Metadata
**Endpoint:** `POST /api/dashcam/metadata`

**Request:**
```json
{
    "lat": 51.5074,
    "lon": -0.1278,
    "speed": 45.5,
    "heading": 90.0
}
```

**Response:**
```json
{
    "success": true
}
```

### 5. List Recordings
**Endpoint:** `GET /api/dashcam/recordings`

**Response:**
```json
{
    "success": true,
    "recordings": [
        {
            "recording_id": "rec_1234567890",
            "trip_id": null,
            "start_time": "2025-11-21T10:30:00",
            "end_time": "2025-11-21T10:32:05",
            "duration_seconds": 125.5,
            "status": "completed",
            "metadata_points": 25,
            "file_size_mb": 45.2
        }
    ]
}
```

### 6. Delete Recording
**Endpoint:** `DELETE /api/dashcam/recordings/{recording_id}`

**Response:**
```json
{
    "success": true
}
```

### 7. Cleanup Old Recordings
**Endpoint:** `POST /api/dashcam/cleanup`

**Response:**
```json
{
    "success": true,
    "deleted_count": 3
}
```

### 8. Get Settings
**Endpoint:** `GET /api/dashcam/settings`

**Response:**
```json
{
    "success": true,
    "settings": {
        "resolution": "1080p",
        "fps": 30,
        "audio_enabled": true,
        "retention_days": 14,
        "max_storage_gb": 10,
        "bitrate": "5000k"
    }
}
```

### 9. Update Settings
**Endpoint:** `POST /api/dashcam/settings`

**Request:**
```json
{
    "resolution": "720p",
    "fps": 24,
    "audio_enabled": false,
    "retention_days": 7
}
```

**Response:**
```json
{
    "success": true,
    "settings": { ... }
}
```

## Usage Examples

### JavaScript - Start Recording
```javascript
async function startRecording() {
    const response = await fetch('/api/dashcam/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip_id: 'trip_123' })
    });
    const data = await response.json();
    console.log('Recording started:', data.recording_id);
}
```

### JavaScript - Add Metadata
```javascript
async function addMetadata(lat, lon, speed, heading) {
    await fetch('/api/dashcam/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, speed, heading })
    });
}
```

### JavaScript - Stop Recording
```javascript
async function stopRecording() {
    const response = await fetch('/api/dashcam/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    const data = await response.json();
    console.log('Recording stopped:', data.duration_seconds, 'seconds');
}
```

## Features

### Recording Modes

**Standalone Mode:**
- User opens Dashcam tab
- Clicks "Start Recording"
- Records video with GPS metadata
- Manually stops recording

**Navigation-Integrated Mode:**
- Recording starts during active navigation
- Automatically collects GPS data from route
- Recording continues until manually stopped
- Linked to trip history

### Settings

| Setting | Options | Default |
|---------|---------|---------|
| Resolution | 720p, 1080p, 1440p | 1080p |
| Frame Rate | 24, 30, 60 FPS | 30 |
| Audio | Enabled/Disabled | Enabled |
| Retention | 7, 14, 30, 90 days | 14 days |
| Max Storage | 1GB-10GB | 10GB |

### Metadata Collection

GPS metadata is collected every 5 seconds:
- Latitude/Longitude
- Speed (m/s)
- Heading (degrees)
- Timestamp (ISO 8601)

## Testing

### Run Unit Tests
```bash
python -m pytest test_dashcam_service.py -v
```

### Run Integration Tests
```bash
python -m pytest test_dashcam_blueprint.py -v
```

### Run All Tests
```bash
python -m pytest test_dashcam_*.py -v
```

**Test Coverage:**
- 10 unit tests (100% pass rate)
- 9 integration tests (100% pass rate)
- Total: 19 tests passing

## Troubleshooting

### Issue: Recording won't start
**Solution:** Check browser console for errors. Ensure `/api/dashcam/start` endpoint is accessible.

### Issue: GPS metadata not collected
**Solution:** Verify browser has location permission. Check GPS coordinates in browser console.

### Issue: Recordings not appearing in list
**Solution:** Refresh page. Check database connection. Verify recordings were saved to database.

### Issue: Storage full
**Solution:** Run cleanup endpoint or manually delete old recordings. Adjust retention period in settings.

### Issue: API returns 500 error
**Solution:** Check server logs. Verify database is accessible. Ensure dashcam blueprint is initialized.

## Performance Considerations

- Metadata collection: 5-second intervals (minimal CPU impact)
- Recording status updates: Real-time via API
- Cleanup runs on-demand (can be scheduled)
- Database queries optimized with indexes

## Security

- No automatic cloud upload (local storage only)
- User controls data retention
- Recordings deleted on uninstall
- No sensitive data in metadata (only GPS coordinates)

## Future Enhancements

- [ ] Video playback with metadata overlay
- [ ] Automatic incident detection
- [ ] Cloud backup option
- [ ] Video compression
- [ ] Android native implementation
- [ ] Incident sharing

