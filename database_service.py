"""
Database service layer.
Consolidates all database operations into a single service.
Provides connection pooling and consistent error handling.
"""

import sqlite3
import threading
from typing import Optional, List, Dict, Any
from contextlib import contextmanager


class DatabasePool:
    """Connection pool for SQLite database."""
    
    def __init__(self, db_file: str, pool_size: int = 5):
        """Initialize database pool.
        
        Args:
            db_file: Path to SQLite database
            pool_size: Number of connections to maintain
        """
        self.db_file = db_file
        self.pool_size = pool_size
        self.connections = []
        self.lock = threading.Lock()
        self._initialize_pool()
    
    def _initialize_pool(self):
        """Initialize connection pool."""
        for _ in range(self.pool_size):
            conn = sqlite3.connect(self.db_file, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            self.connections.append(conn)
    
    @contextmanager
    def get_connection(self):
        """Get a connection from the pool.
        
        Yields:
            SQLite connection
        """
        with self.lock:
            if not self.connections:
                conn = sqlite3.connect(self.db_file, check_same_thread=False)
                conn.row_factory = sqlite3.Row
            else:
                conn = self.connections.pop()
        
        try:
            yield conn
        finally:
            with self.lock:
                if len(self.connections) < self.pool_size:
                    self.connections.append(conn)
                else:
                    conn.close()
    
    def close_all(self):
        """Close all connections in the pool."""
        with self.lock:
            for conn in self.connections:
                conn.close()
            self.connections.clear()


class DatabaseService:
    """Service for database operations."""
    
    def __init__(self, db_pool: DatabasePool):
        """Initialize database service.
        
        Args:
            db_pool: DatabasePool instance
        """
        self.pool = db_pool
    
    def execute_query(self, query: str, params: tuple = ()) -> List[Dict]:
        """Execute SELECT query and return results.
        
        Args:
            query: SQL query string
            params: Query parameters
            
        Returns:
            List of result dictionaries
        """
        try:
            with self.pool.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(query, params)
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            print(f"Query error: {e}")
            return []
    
    def execute_update(self, query: str, params: tuple = ()) -> bool:
        """Execute INSERT/UPDATE/DELETE query.
        
        Args:
            query: SQL query string
            params: Query parameters
            
        Returns:
            True if successful, False otherwise
        """
        try:
            with self.pool.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(query, params)
                conn.commit()
                return True
        except Exception as e:
            print(f"Update error: {e}")
            return False
    
    def execute_batch(self, query: str, params_list: List[tuple]) -> bool:
        """Execute batch INSERT/UPDATE/DELETE queries.
        
        Args:
            query: SQL query string
            params_list: List of parameter tuples
            
        Returns:
            True if successful, False otherwise
        """
        try:
            with self.pool.get_connection() as conn:
                cursor = conn.cursor()
                cursor.executemany(query, params_list)
                conn.commit()
                return True
        except Exception as e:
            print(f"Batch error: {e}")
            return False
    
    def get_one(self, query: str, params: tuple = ()) -> Optional[Dict]:
        """Execute query and return single result.
        
        Args:
            query: SQL query string
            params: Query parameters
            
        Returns:
            Result dictionary or None
        """
        results = self.execute_query(query, params)
        return results[0] if results else None
    
    def get_count(self, table: str, where: str = '') -> int:
        """Get count of rows in table.
        
        Args:
            table: Table name
            where: WHERE clause (without WHERE keyword)
            
        Returns:
            Row count
        """
        query = f"SELECT COUNT(*) as count FROM {table}"
        if where:
            query += f" WHERE {where}"
        
        result = self.get_one(query)
        return result['count'] if result else 0
    
    def table_exists(self, table: str) -> bool:
        """Check if table exists.
        
        Args:
            table: Table name
            
        Returns:
            True if table exists, False otherwise
        """
        query = "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
        result = self.get_one(query, (table,))
        return result is not None
    
    def get_columns(self, table: str) -> List[str]:
        """Get column names for a table.
        
        Args:
            table: Table name
            
        Returns:
            List of column names
        """
        try:
            with self.pool.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(f"PRAGMA table_info({table})")
                return [row[1] for row in cursor.fetchall()]
        except Exception as e:
            print(f"Error getting columns: {e}")
            return []


# Global instance (will be initialized in voyagr_web.py)
db_service: Optional[DatabaseService] = None

