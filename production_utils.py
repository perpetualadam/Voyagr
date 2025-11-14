#!/usr/bin/env python3
"""
Shared Utilities for Production Modules
Common patterns, error handling, configuration, and logging
"""

import logging
import os
from typing import Optional, Dict, Any, Callable
from functools import wraps
from datetime import datetime
import threading


class ConfigManager:
    """Centralized configuration management with type conversion."""
    
    @staticmethod
    def get_env_bool(key: str, default: bool = False) -> bool:
        """Get boolean environment variable."""
        value = os.getenv(key, str(default)).lower()
        return value in ('true', '1', 'yes', 'on')
    
    @staticmethod
    def get_env_int(key: str, default: int = 0) -> int:
        """Get integer environment variable."""
        try:
            return int(os.getenv(key, default))
        except (ValueError, TypeError):
            return default
    
    @staticmethod
    def get_env_float(key: str, default: float = 0.0) -> float:
        """Get float environment variable."""
        try:
            return float(os.getenv(key, default))
        except (ValueError, TypeError):
            return default
    
    @staticmethod
    def get_env_str(key: str, default: str = '') -> str:
        """Get string environment variable."""
        return os.getenv(key, default)


class LoggerFactory:
    """Factory for creating configured loggers."""
    
    _loggers: Dict[str, logging.Logger] = {}
    _lock = threading.Lock()
    
    @staticmethod
    def get_logger(name: str, log_file: Optional[str] = None, 
                   level: int = logging.DEBUG) -> logging.Logger:
        """Get or create a logger with optional file output."""
        with LoggerFactory._lock:
            if name in LoggerFactory._loggers:
                return LoggerFactory._loggers[name]
            
            logger = logging.getLogger(name)
            logger.setLevel(level)
            
            # Console handler
            ch = logging.StreamHandler()
            ch.setLevel(logging.INFO)
            
            # Formatter
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            ch.setFormatter(formatter)
            logger.addHandler(ch)
            
            # File handler if specified
            if log_file:
                fh = logging.FileHandler(log_file)
                fh.setLevel(level)
                fh.setFormatter(formatter)
                logger.addHandler(fh)
            
            LoggerFactory._loggers[name] = logger
            return logger


class ErrorHandler:
    """Centralized error handling with logging."""
    
    def __init__(self, logger: logging.Logger):
        self.logger = logger
    
    def handle_exception(self, exception: Exception, context: str = '', 
                        reraise: bool = False) -> Optional[Exception]:
        """Handle exception with logging."""
        error_msg = f"{context}: {str(exception)}" if context else str(exception)
        self.logger.error(error_msg, exc_info=True)
        
        if reraise:
            raise
        return exception
    
    def safe_execute(self, func: Callable, *args, **kwargs) -> Optional[Any]:
        """Execute function with error handling."""
        try:
            return func(*args, **kwargs)
        except Exception as e:
            self.handle_exception(e, f"Error executing {func.__name__}")
            return None


def thread_safe(func: Callable) -> Callable:
    """Decorator for thread-safe operations using instance lock."""
    @wraps(func)
    def wrapper(self, *args, **kwargs):
        if hasattr(self, 'lock'):
            with self.lock:
                return func(self, *args, **kwargs)
        return func(self, *args, **kwargs)
    return wrapper


def get_timestamp() -> str:
    """Get current timestamp in ISO format."""
    return datetime.now().isoformat()


def get_timestamp_filename() -> str:
    """Get timestamp suitable for filenames."""
    return datetime.now().strftime('%Y%m%d_%H%M%S')


def calculate_rate(numerator: float, denominator: float, 
                   default: float = 0.0, percentage: bool = False) -> float:
    """Calculate rate with safe division."""
    if denominator == 0:
        return default
    rate = numerator / denominator
    return rate * 100 if percentage else rate


def format_bytes(bytes_value: int) -> str:
    """Format bytes to human-readable format."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_value < 1024:
            return f"{bytes_value:.2f} {unit}"
        bytes_value /= 1024
    return f"{bytes_value:.2f} TB"


def format_duration(seconds: float) -> str:
    """Format seconds to human-readable duration."""
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        return f"{seconds/60:.1f}m"
    else:
        return f"{seconds/3600:.1f}h"

