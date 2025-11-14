#!/usr/bin/env python3
"""
Automated Database Backup Module for Voyagr PWA
Backup scheduling, retention policy, verification, and cloud upload
"""

import os
import shutil
import sqlite3
import gzip
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
import threading
import time

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    boto3 = None
    ClientError = None

class BackupManager:
    """Manage automated database backups."""
    
    def __init__(self, db_path='voyagr_web.db', backup_dir='backups'):
        self.db_path = db_path
        self.backup_dir = Path(backup_dir)
        self.backup_dir.mkdir(exist_ok=True)
        
        # Retention policy
        self.daily_retention = int(os.getenv('BACKUP_DAILY_RETENTION', 7))
        self.weekly_retention = int(os.getenv('BACKUP_WEEKLY_RETENTION', 4))
        self.monthly_retention = int(os.getenv('BACKUP_MONTHLY_RETENTION', 12))
        
        # Cloud storage
        self.s3_enabled = bool(os.getenv('BACKUP_S3_ENABLED', False))
        self.s3_bucket = os.getenv('BACKUP_S3_BUCKET', '')
        self.s3_region = os.getenv('BACKUP_S3_REGION', 'us-east-1')
        
        # Backup schedule (in seconds)
        self.backup_interval = int(os.getenv('BACKUP_INTERVAL_HOURS', 24)) * 3600
        
        self.s3_client = None
        if self.s3_enabled:
            self._init_s3()
    
    def _init_s3(self):
        """Initialize S3 client."""
        try:
            if not boto3:
                print("[WARNING] boto3 not installed. S3 backups disabled.")
                self.s3_enabled = False
                return

            self.s3_client = boto3.client(
                's3',
                region_name=self.s3_region,
                aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
                aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
            )
        except Exception as e:
            print(f"[ERROR] Failed to initialize S3 client: {str(e)}")
    
    def create_backup(self):
        """Create a backup of the database."""
        try:
            if not os.path.exists(self.db_path):
                print(f"[ERROR] Database not found: {self.db_path}")
                return None
            
            # Create backup filename with timestamp
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_name = f"voyagr_web_{timestamp}.db.gz"
            backup_path = self.backup_dir / backup_name
            
            # Backup database
            print(f"[INFO] Creating backup: {backup_name}")
            
            # Copy database
            temp_db = self.backup_dir / f"temp_{timestamp}.db"
            shutil.copy2(self.db_path, temp_db)
            
            # Verify backup integrity
            if not self._verify_backup(temp_db):
                print(f"[ERROR] Backup verification failed")
                temp_db.unlink()
                return None
            
            # Compress backup
            with open(temp_db, 'rb') as f_in:
                with gzip.open(backup_path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            
            temp_db.unlink()
            
            # Calculate checksum
            checksum = self._calculate_checksum(backup_path)
            
            # Save backup metadata
            metadata = {
                'filename': backup_name,
                'path': str(backup_path),
                'timestamp': datetime.now().isoformat(),
                'size': backup_path.stat().st_size,
                'checksum': checksum
            }
            
            # Upload to S3 if enabled
            if self.s3_enabled:
                self._upload_to_s3(backup_path, backup_name)
            
            print(f"[OK] Backup created: {backup_name} ({metadata['size']} bytes)")
            return metadata
        
        except Exception as e:
            print(f"[ERROR] Backup creation failed: {str(e)}")
            return None
    
    def _verify_backup(self, db_path):
        """Verify backup integrity."""
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")
            table_count = cursor.fetchone()[0]
            conn.close()
            
            return table_count > 0
        except Exception as e:
            print(f"[ERROR] Backup verification failed: {str(e)}")
            return False
    
    def _calculate_checksum(self, file_path):
        """Calculate SHA256 checksum of file."""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    def _upload_to_s3(self, backup_path, backup_name):
        """Upload backup to S3."""
        try:
            if not self.s3_client or not boto3:
                return

            print(f"[INFO] Uploading to S3: {backup_name}")

            self.s3_client.upload_file(
                str(backup_path),
                self.s3_bucket,
                f"backups/{backup_name}",
                ExtraArgs={'ServerSideEncryption': 'AES256'}
            )

            print(f"[OK] Uploaded to S3: {backup_name}")
        except Exception as e:
            print(f"[ERROR] S3 upload failed: {str(e)}")
    
    def cleanup_old_backups(self):
        """Clean up old backups based on retention policy."""
        try:
            backups = sorted(self.backup_dir.glob('voyagr_web_*.db.gz'))
            
            if len(backups) <= self.daily_retention:
                return
            
            # Keep daily backups
            now = datetime.now()
            to_delete = []
            
            for backup in backups[:-self.daily_retention]:
                backup_time = datetime.strptime(
                    backup.stem.split('_')[2] + backup.stem.split('_')[3],
                    '%Y%m%d%H%M%S'
                )
                
                age_days = (now - backup_time).days
                
                # Keep weekly backups for 4 weeks
                if age_days <= 28 and backup_time.weekday() == 0:
                    continue
                
                # Keep monthly backups for 12 months
                if age_days <= 365 and backup_time.day == 1:
                    continue
                
                to_delete.append(backup)
            
            for backup in to_delete:
                backup.unlink()
                print(f"[INFO] Deleted old backup: {backup.name}")
        
        except Exception as e:
            print(f"[ERROR] Cleanup failed: {str(e)}")
    
    def restore_backup(self, backup_name):
        """Restore database from backup."""
        try:
            backup_path = self.backup_dir / backup_name
            
            if not backup_path.exists():
                print(f"[ERROR] Backup not found: {backup_name}")
                return False
            
            print(f"[INFO] Restoring from backup: {backup_name}")
            
            # Decompress backup
            temp_db = self.backup_dir / f"restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
            
            with gzip.open(backup_path, 'rb') as f_in:
                with open(temp_db, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            
            # Verify restored database
            if not self._verify_backup(temp_db):
                print(f"[ERROR] Restored database verification failed")
                temp_db.unlink()
                return False
            
            # Replace current database
            backup_current = self.backup_dir / f"current_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
            shutil.move(self.db_path, backup_current)
            shutil.move(temp_db, self.db_path)
            
            print(f"[OK] Database restored from: {backup_name}")
            return True
        
        except Exception as e:
            print(f"[ERROR] Restore failed: {str(e)}")
            return False
    
    def start_backup_scheduler(self):
        """Start automatic backup scheduler."""
        def scheduler():
            while True:
                try:
                    self.create_backup()
                    self.cleanup_old_backups()
                    time.sleep(self.backup_interval)
                except Exception as e:
                    print(f"[ERROR] Backup scheduler error: {str(e)}")
                    time.sleep(60)
        
        thread = threading.Thread(target=scheduler, daemon=True)
        thread.start()
        print("[OK] Backup scheduler started")

# Global backup manager instance
_backup_manager = None

def get_backup_manager():
    """Get or create global backup manager instance."""
    global _backup_manager
    if _backup_manager is None:
        _backup_manager = BackupManager()
    return _backup_manager

