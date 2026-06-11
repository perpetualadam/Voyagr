"""
Database models and connection management for Voyagr.

Contains:
- DatabasePool: Connection pool for SQLite
- Database initialization and schema
- Connection management utilities
"""

from voyagr.models.database import (
    DatabasePool,
    init_db,
    get_db_connection,
    return_db_connection,
    db_connection,
    get_pool,
    DB_FILE,
)

__all__ = [
    'DatabasePool',
    'init_db',
    'get_db_connection',
    'return_db_connection',
    'db_connection',
    'get_pool',
    'DB_FILE',
]

