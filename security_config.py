#!/usr/bin/env python3
"""
Security Configuration Module for Voyagr PWA
SSL/TLS, security headers, secure cookies, and HTTPS enforcement
"""

import os
from functools import wraps
from flask import request, redirect, url_for

class SecurityConfig:
    """Security configuration for Flask app."""
    
    def __init__(self, app=None):
        self.app = app
        self.production = os.getenv('ENVIRONMENT', 'development') == 'production'
        self.enforce_https = os.getenv('ENFORCE_HTTPS', 'true').lower() == 'true'
        
        if app:
            self.init_app(app)
    
    def init_app(self, app):
        """Initialize security configuration for Flask app."""
        self.app = app
        
        # Configure secure cookies
        app.config['SESSION_COOKIE_SECURE'] = self.production
        app.config['SESSION_COOKIE_HTTPONLY'] = True
        app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
        
        # Add security headers middleware
        @app.after_request
        def add_security_headers(response):
            return self._add_security_headers(response)
        
        # Add HTTPS redirect middleware
        if self.production and self.enforce_https:
            @app.before_request
            def enforce_https():
                return self._enforce_https()
        
        print("[OK] Security configuration initialized")
    
    def _add_security_headers(self, response):
        """Add security headers to response."""
        # Strict-Transport-Security (HSTS)
        if self.production:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
        
        # Content Security Policy
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' https:; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )
        
        # X-Content-Type-Options
        response.headers['X-Content-Type-Options'] = 'nosniff'
        
        # X-Frame-Options
        response.headers['X-Frame-Options'] = 'DENY'
        
        # X-XSS-Protection
        response.headers['X-XSS-Protection'] = '1; mode=block'
        
        # Referrer-Policy
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        
        # Permissions-Policy
        response.headers['Permissions-Policy'] = (
            'geolocation=(self), '
            'microphone=(), '
            'camera=(), '
            'payment=()'
        )
        
        # Remove server header
        response.headers.pop('Server', None)
        
        return response
    
    def _enforce_https(self):
        """Enforce HTTPS in production."""
        if request.scheme != 'https' and not request.host.startswith('localhost'):
            url = request.url.replace('http://', 'https://', 1)
            return redirect(url, code=301)
    
    @staticmethod
    def require_https(f):
        """Decorator to require HTTPS for specific endpoints."""
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if request.scheme != 'https' and os.getenv('ENVIRONMENT') == 'production':
                return {'error': 'HTTPS required'}, 403
            return f(*args, **kwargs)
        return decorated_function

class SSLConfig:
    """SSL/TLS configuration."""
    
    @staticmethod
    def get_ssl_context():
        """Get SSL context for Flask app."""
        import ssl
        
        cert_file = os.getenv('SSL_CERT_FILE', '')
        key_file = os.getenv('SSL_KEY_FILE', '')
        
        if cert_file and key_file and os.path.exists(cert_file) and os.path.exists(key_file):
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(cert_file, key_file)
            return context
        
        return None
    
    @staticmethod
    def setup_ssl_redirect(app):
        """Setup SSL redirect middleware."""
        @app.before_request
        def redirect_to_https():
            if request.scheme == 'http' and os.getenv('ENVIRONMENT') == 'production':
                url = request.url.replace('http://', 'https://', 1)
                return redirect(url, code=301)

class RateLimiter:
    """Simple rate limiter for API endpoints."""
    
    def __init__(self, max_requests=100, window_seconds=60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = {}
    
    def is_allowed(self, identifier):
        """Check if request is allowed."""
        import time
        
        now = time.time()
        
        if identifier not in self.requests:
            self.requests[identifier] = []
        
        # Remove old requests outside window
        self.requests[identifier] = [
            req_time for req_time in self.requests[identifier]
            if now - req_time < self.window_seconds
        ]
        
        # Check limit
        if len(self.requests[identifier]) >= self.max_requests:
            return False
        
        # Add current request
        self.requests[identifier].append(now)
        return True

# Global rate limiter instance
_rate_limiter = None

def get_rate_limiter():
    """Get or create global rate limiter instance."""
    global _rate_limiter
    if _rate_limiter is None:
        max_requests = int(os.getenv('RATE_LIMIT_REQUESTS', 100))
        window_seconds = int(os.getenv('RATE_LIMIT_WINDOW_SECONDS', 60))
        _rate_limiter = RateLimiter(max_requests, window_seconds)
    return _rate_limiter

