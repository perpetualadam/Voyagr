"""
Connection pooling for SQLite database
Manages multiple connections for concurrent access
"""
import sqlite3
import threading
from typing import Optional
from queue import Queue

class ConnectionPool:
    """Thread-safe connection pool for SQLite."""
    
    def __init__(self, db_file: str, pool_size: int = 5):
        """Initialize connection pool.
        
        Args:
            db_file: Path to SQLite database
            pool_size: Number of connections to maintain (default 5)
        """
        self.db_file = db_file
        self.pool_size = pool_size
        self.connections = Queue(maxsize=pool_size)
        self.lock = threading.Lock()
        
        # Create initial connections
        for _ in range(pool_size):
            conn = sqlite3.connect(db_file, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            self.connections.put(conn)
        
        print(f"[ConnectionPool] Initialized with {pool_size} connections")
    
    def get_connection(self, timeout: float = 5.0) -> sqlite3.Connection:
        """Get a connection from the pool.
        
        Args:
            timeout: Timeout in seconds (default 5)
            
        Returns:
            SQLite connection
        """
        try:
            conn = self.connections.get(timeout=timeout)
            return conn
        except:
            # Create new connection if pool is exhausted
            print("[ConnectionPool] Pool exhausted, creating new connection")
            conn = sqlite3.connect(self.db_file, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            return conn
    
    def return_connection(self, conn: sqlite3.Connection):
        """Return a connection to the pool.
        
        Args:
            conn: SQLite connection to return
        """
        try:
            self.connections.put_nowait(conn)
        except:
            # Pool is full, close connection
            conn.close()
    
    def close_all(self):
        """Close all connections in the pool."""
        while not self.connections.empty():
            try:
                conn = self.connections.get_nowait()
                conn.close()
            except:
                pass
        print("[ConnectionPool] All connections closed")
    
    def get_stats(self) -> dict:
        """Get pool statistics."""
        return {
            'pool_size': self.pool_size,
            'available': self.connections.qsize(),
            'in_use': self.pool_size - self.connections.qsize()
        }

class PooledConnection:
    """Context manager for pooled connections."""
    
    def __init__(self, pool: ConnectionPool):
        """Initialize pooled connection context.
        
        Args:
            pool: ConnectionPool instance
        """
        self.pool = pool
        self.conn = None
    
    def __enter__(self) -> sqlite3.Connection:
        """Get connection from pool."""
        self.conn = self.pool.get_connection()
        return self.conn
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Return connection to pool."""
        if self.conn:
            self.pool.return_connection(self.conn)
        return False

# Global pool instance
_pool = None

def get_connection_pool(db_file: str = 'data/uk_router.db', 
                       pool_size: int = 5) -> ConnectionPool:
    """Get or create connection pool."""
    global _pool
    if _pool is None:
        _pool = ConnectionPool(db_file, pool_size)
    return _pool

def get_pooled_connection(db_file: str = 'data/uk_router.db') -> PooledConnection:
    """Get a pooled connection context manager."""
    pool = get_connection_pool(db_file)
    return PooledConnection(pool)

