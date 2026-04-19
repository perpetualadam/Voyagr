#!/usr/bin/env python3
"""
Load multiple SCDB GB export CSVs (SCDB_Speed_*.csv, SCDB_Redlight*.csv, etc.)
into voyagr_web.db cameras table.

Each file's basename selects the Voyagr `cameras.type` label so
normalize_camera_hazard_bucket() maps to camera_speed / camera_red_light /
camera_average_speed / camera_other.

CSV format (per SCDB): longitude, latitude, description, reference — no header.

Usage:
    python3 load_scdb_gb_folder.py "/opt/voyagr/SCDB_csv (1)" voyagr_web.db --clear
"""

from __future__ import annotations

import argparse
import csv
import sqlite3
import sys
from pathlib import Path


def type_from_scdb_filename(name: str) -> str:
    """Return cameras.type string compatible with voyagr_web.normalize_camera_hazard_bucket."""
    u = name.upper()
    if "REDLIGHT" in u:
        return "red_light"
    if "SECTION" in u:
        return "average_speed"
    if "TUNNEL" in u:
        return "speed"
    if "SPEED" in u:
        return "speed"
    return "speed"


def detect_encoding(path: Path) -> str | None:
    for enc in ("utf-8", "utf-8-sig", "latin-1", "iso-8859-1", "cp1252"):
        try:
            path.read_text(encoding=enc)
            return enc
        except (UnicodeDecodeError, UnicodeError):
            continue
    return None


def load_one_csv(cursor: sqlite3.Cursor, path: Path, cam_type: str, enc: str) -> tuple[int, int]:
    loaded = 0
    skipped = 0
    with path.open("r", encoding=enc, newline="") as f:
        reader = csv.reader(f)
        for row in reader:
            try:
                if len(row) < 2:
                    skipped += 1
                    continue
                lon = float(row[0].strip())
                lat = float(row[1].strip())
                description = row[2].strip() if len(row) > 2 else ""
                if lat == 0 or lon == 0 or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    skipped += 1
                    continue
                cursor.execute(
                    """
                    INSERT INTO cameras (lat, lon, type, description, severity)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (lat, lon, cam_type, description, "high"),
                )
                loaded += 1
            except (ValueError, IndexError):
                skipped += 1
                continue
    return loaded, skipped


def main() -> int:
    ap = argparse.ArgumentParser(description="Load SCDB GB multi-file export into Voyagr SQLite.")
    ap.add_argument("folder", type=Path, help="Directory containing SCDB_*.csv files")
    ap.add_argument("db_file", type=Path, nargs="?", default=Path("voyagr_web.db"))
    ap.add_argument("--clear", action="store_true", help="Delete existing cameras before import")
    args = ap.parse_args()

    folder = args.folder.expanduser()
    if not folder.is_dir():
        print(f"[ERROR] Not a directory: {folder}", file=sys.stderr)
        return 1

    csv_paths = sorted(folder.glob("*.csv"))
    if not csv_paths:
        print(f"[ERROR] No *.csv files in {folder}", file=sys.stderr)
        return 1

    db_file = args.db_file.expanduser()
    conn = sqlite3.connect(str(db_file))
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS cameras (
            id INTEGER PRIMARY KEY,
            lat REAL, lon REAL, type TEXT,
            description TEXT, severity TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cameras_lat_lon ON cameras (lat, lon)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cameras_type ON cameras (type)")

    cursor.execute("SELECT COUNT(*) FROM cameras")
    existing = cursor.fetchone()[0]
    print(f"[INFO] Existing cameras: {existing}")

    if existing > 0:
        if args.clear:
            cursor.execute("DELETE FROM cameras")
            conn.commit()
            print("[OK] Cleared cameras (--clear)")
        else:
            print("[ERROR] Database already has cameras. Re-run with --clear or empty the table.", file=sys.stderr)
            conn.close()
            return 1

    total_loaded = 0
    total_skipped = 0

    for csv_path in csv_paths:
        cam_type = type_from_scdb_filename(csv_path.name)
        enc = detect_encoding(csv_path)
        if enc is None:
            print(f"[WARN] Skip (encoding): {csv_path.name}")
            continue
        file_loaded, file_skipped = load_one_csv(cursor, csv_path, cam_type, enc)
        conn.commit()
        total_loaded += file_loaded
        total_skipped += file_skipped
        print(f"[OK] {csv_path.name}  type={cam_type!r}  encoding={enc}  +{file_loaded} rows  skipped={file_skipped}")

    cursor.execute("SELECT COUNT(*) FROM cameras")
    final_count = cursor.fetchone()[0]
    print(f"\n[OK] Total rows inserted: {total_loaded}")
    print(f"[INFO] Total cameras in DB: {final_count}")
    print(f"[INFO] Rows skipped (invalid): {total_skipped}")

    cursor.execute("SELECT type, COUNT(*) FROM cameras GROUP BY type ORDER BY COUNT(*) DESC")
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]}")

    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
