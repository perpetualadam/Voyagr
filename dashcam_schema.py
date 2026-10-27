"""Additive SQLite dashcam migration. Never infer ownership of existing rows."""


def ensure_dashcam_schema(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS dashcam_recordings (
        id INTEGER PRIMARY KEY, recording_id TEXT UNIQUE NOT NULL, trip_id TEXT,
        start_time DATETIME NOT NULL, end_time DATETIME, duration_seconds REAL,
        status TEXT DEFAULT 'recording', metadata_points INTEGER DEFAULT 0,
        file_path TEXT, file_size_mb REAL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        owner_user_id TEXT
    )''')
    columns = {r[1] for r in conn.execute('PRAGMA table_info(dashcam_recordings)')}
    if 'owner_user_id' not in columns:
        conn.execute('ALTER TABLE dashcam_recordings ADD COLUMN owner_user_id TEXT')
    conn.execute('''CREATE INDEX IF NOT EXISTS dashcam_owner_start
                    ON dashcam_recordings(owner_user_id, start_time)''')
    conn.execute('''CREATE UNIQUE INDEX IF NOT EXISTS dashcam_owner_active
                    ON dashcam_recordings(owner_user_id)
                    WHERE owner_user_id IS NOT NULL AND status = 'recording' ''')
    conn.execute('''CREATE TABLE IF NOT EXISTS dashcam_metadata (
        id INTEGER PRIMARY KEY, recording_id TEXT NOT NULL,
        timestamp TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
        speed REAL NOT NULL, heading REAL NOT NULL,
        FOREIGN KEY(recording_id) REFERENCES dashcam_recordings(recording_id) ON DELETE CASCADE
    )''')
    conn.execute('CREATE INDEX IF NOT EXISTS dashcam_metadata_recording ON dashcam_metadata(recording_id)')
    conn.execute('''CREATE TABLE IF NOT EXISTS dashcam_user_settings (
        owner_user_id TEXT PRIMARY KEY NOT NULL, settings_json TEXT NOT NULL
    )''')
