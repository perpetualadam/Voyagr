# Dashcam API Reference

## Base URL
```
http://localhost:5000/api/dashcam
```

## Authentication
No authentication required (local PWA)

## Content-Type
All requests and responses use `application/json`

---

## Endpoints

### POST /start
Start a new dashcam recording session.

**Parameters:**
- `trip_id` (optional): Link recording to a specific trip

**Example:**
```bash
curl -X POST http://localhost:5000/api/dashcam/start \
  -H "Content-Type: application/json" \
  -d '{"trip_id": "trip_123"}'
```

**Success Response (200):**
```json
{
  "success": true,
  "recording_id": "rec_1234567890",
  "start_time": "2025-11-21T10:30:00"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Error message"
}
```

---

### POST /stop
Stop the current recording session.

**Example:**
```bash
curl -X POST http://localhost:5000/api/dashcam/stop \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Success Response (200):**
```json
{
  "success": true,
  "recording_id": "rec_1234567890",
  "duration_seconds": 125.5,
  "end_time": "2025-11-21T10:32:05"
}
```

---

### GET /status
Get current recording status.

**Example:**
```bash
curl http://localhost:5000/api/dashcam/status
```

**Response (200):**
```json
{
  "recording": true,
  "recording_id": "rec_1234567890",
  "elapsed_seconds": 45.2,
  "metadata_points": 9
}
```

---

### POST /metadata
Add GPS metadata to current recording.

**Parameters:**
- `lat` (float): Latitude
- `lon` (float): Longitude
- `speed` (float): Speed in m/s
- `heading` (float): Heading in degrees

**Example:**
```bash
curl -X POST http://localhost:5000/api/dashcam/metadata \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 51.5074,
    "lon": -0.1278,
    "speed": 45.5,
    "heading": 90.0
  }'
```

**Response (200):**
```json
{
  "success": true
}
```

---

### GET /recordings
List all recordings.

**Query Parameters:**
- `limit` (optional): Max recordings to return (default: 50)

**Example:**
```bash
curl "http://localhost:5000/api/dashcam/recordings?limit=10"
```

**Response (200):**
```json
{
  "success": true,
  "recordings": [
    {
      "id": 1,
      "recording_id": "rec_1234567890",
      "trip_id": "trip_123",
      "start_time": "2025-11-21T10:30:00",
      "end_time": "2025-11-21T10:32:05",
      "duration_seconds": 125.5,
      "status": "completed",
      "metadata_points": 25,
      "file_path": "/dashcam_recordings/rec_1234567890.mp4",
      "file_size_mb": 45.2,
      "created_at": "2025-11-21T10:32:05"
    }
  ]
}
```

---

### DELETE /recordings/{recording_id}
Delete a specific recording.

**Parameters:**
- `recording_id` (path): Recording ID to delete

**Example:**
```bash
curl -X DELETE http://localhost:5000/api/dashcam/recordings/rec_1234567890
```

**Response (200):**
```json
{
  "success": true
}
```

---

### POST /cleanup
Delete recordings older than retention period.

**Example:**
```bash
curl -X POST http://localhost:5000/api/dashcam/cleanup \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response (200):**
```json
{
  "success": true,
  "deleted_count": 3
}
```

---

### GET /settings
Get current dashcam settings.

**Example:**
```bash
curl http://localhost:5000/api/dashcam/settings
```

**Response (200):**
```json
{
  "success": true,
  "settings": {
    "enabled": true,
    "auto_start_with_navigation": false,
    "auto_stop_with_navigation": true,
    "retention_days": 14,
    "max_storage_gb": 10,
    "resolution": "1080p",
    "bitrate": "5000k",
    "fps": 30,
    "audio_enabled": true
  }
}
```

---

### POST /settings
Update dashcam settings.

**Parameters:**
- `resolution` (optional): "720p", "1080p", "1440p"
- `fps` (optional): 24, 30, or 60
- `audio_enabled` (optional): true/false
- `retention_days` (optional): 7, 14, 30, or 90
- `max_storage_gb` (optional): 1-10

**Example:**
```bash
curl -X POST http://localhost:5000/api/dashcam/settings \
  -H "Content-Type: application/json" \
  -d '{
    "resolution": "720p",
    "fps": 24,
    "audio_enabled": false,
    "retention_days": 7
  }'
```

**Response (200):**
```json
{
  "success": true,
  "settings": { ... }
}
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request |
| 415 | Unsupported Media Type (missing Content-Type header) |
| 500 | Server Error |

## Rate Limiting
No rate limiting currently implemented. Metadata collection limited to 5-second intervals client-side.

## Pagination
Use `limit` parameter on `/recordings` endpoint for pagination.

## Timestamps
All timestamps are in ISO 8601 format: `YYYY-MM-DDTHH:MM:SS`

