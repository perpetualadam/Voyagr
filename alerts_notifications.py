#!/usr/bin/env python3
"""
Alerts and Notifications Module for Voyagr PWA
Email, webhook, and Slack/Discord integration
"""

import requests
import json
import os
from datetime import datetime
from threading import Thread
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

class AlertManager:
    """Manage alerts and notifications."""
    
    def __init__(self):
        self.email_enabled = bool(os.getenv('ALERT_EMAIL_ENABLED', False))
        self.webhook_enabled = bool(os.getenv('ALERT_WEBHOOK_ENABLED', False))
        self.slack_enabled = bool(os.getenv('ALERT_SLACK_ENABLED', False))
        self.discord_enabled = bool(os.getenv('ALERT_DISCORD_ENABLED', False))
        
        # Configuration
        self.smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', 587))
        self.smtp_user = os.getenv('SMTP_USER', '')
        self.smtp_password = os.getenv('SMTP_PASSWORD', '')
        self.alert_email = os.getenv('ALERT_EMAIL', '')
        
        self.webhook_url = os.getenv('ALERT_WEBHOOK_URL', '')
        self.slack_webhook = os.getenv('SLACK_WEBHOOK_URL', '')
        self.discord_webhook = os.getenv('DISCORD_WEBHOOK_URL', '')
        
        # Alert thresholds
        self.thresholds = {
            'response_time_ms': float(os.getenv('ALERT_RESPONSE_TIME_MS', 5000)),
            'error_rate_percent': float(os.getenv('ALERT_ERROR_RATE_PERCENT', 5)),
            'cache_hit_rate_percent': float(os.getenv('ALERT_CACHE_HIT_RATE_PERCENT', 50)),
            'engine_failure_rate_percent': float(os.getenv('ALERT_ENGINE_FAILURE_RATE_PERCENT', 30))
        }
        
        # Alert history to prevent spam
        self.alert_history = {}
    
    def send_alert(self, alert_type, title, message, severity='warning'):
        """Send alert through all enabled channels."""
        alert_data = {
            'type': alert_type,
            'title': title,
            'message': message,
            'severity': severity,
            'timestamp': datetime.now().isoformat()
        }
        
        # Send asynchronously to avoid blocking
        Thread(target=self._send_alert_async, args=(alert_data,), daemon=True).start()
    
    def _send_alert_async(self, alert_data):
        """Send alert asynchronously."""
        # Check alert history to prevent spam (max 1 alert per type per 5 minutes)
        alert_key = alert_data['type']
        now = datetime.now()
        
        if alert_key in self.alert_history:
            last_alert = self.alert_history[alert_key]
            if (now - last_alert).total_seconds() < 300:  # 5 minutes
                return
        
        self.alert_history[alert_key] = now
        
        # Send through enabled channels
        if self.email_enabled:
            self._send_email_alert(alert_data)
        
        if self.webhook_enabled:
            self._send_webhook_alert(alert_data)
        
        if self.slack_enabled:
            self._send_slack_alert(alert_data)
        
        if self.discord_enabled:
            self._send_discord_alert(alert_data)
    
    def _send_email_alert(self, alert_data):
        """Send email alert."""
        try:
            if not self.smtp_user or not self.smtp_password or not self.alert_email:
                return
            
            msg = MIMEMultipart()
            msg['From'] = self.smtp_user
            msg['To'] = self.alert_email
            msg['Subject'] = f"[{alert_data['severity'].upper()}] {alert_data['title']}"
            
            body = f"""
Voyagr PWA Alert

Type: {alert_data['type']}
Severity: {alert_data['severity']}
Title: {alert_data['title']}
Message: {alert_data['message']}
Timestamp: {alert_data['timestamp']}
            """
            
            msg.attach(MIMEText(body, 'plain'))
            
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
        except Exception as e:
            print(f"[ERROR] Failed to send email alert: {str(e)}")
    
    def _send_webhook_alert(self, alert_data):
        """Send webhook alert."""
        try:
            if not self.webhook_url:
                return
            
            requests.post(self.webhook_url, json=alert_data, timeout=5)
        except Exception as e:
            print(f"[ERROR] Failed to send webhook alert: {str(e)}")
    
    def _send_slack_alert(self, alert_data):
        """Send Slack alert."""
        try:
            if not self.slack_webhook:
                return
            
            color_map = {'critical': 'danger', 'warning': 'warning', 'info': 'good'}
            color = color_map.get(alert_data['severity'], 'warning')
            
            payload = {
                'attachments': [{
                    'color': color,
                    'title': alert_data['title'],
                    'text': alert_data['message'],
                    'fields': [
                        {'title': 'Type', 'value': alert_data['type'], 'short': True},
                        {'title': 'Severity', 'value': alert_data['severity'], 'short': True},
                        {'title': 'Timestamp', 'value': alert_data['timestamp'], 'short': False}
                    ]
                }]
            }
            
            requests.post(self.slack_webhook, json=payload, timeout=5)
        except Exception as e:
            print(f"[ERROR] Failed to send Slack alert: {str(e)}")
    
    def _send_discord_alert(self, alert_data):
        """Send Discord alert."""
        try:
            if not self.discord_webhook:
                return
            
            color_map = {'critical': 15158332, 'warning': 15105570, 'info': 3066993}
            color = color_map.get(alert_data['severity'], 15105570)
            
            payload = {
                'embeds': [{
                    'title': alert_data['title'],
                    'description': alert_data['message'],
                    'color': color,
                    'fields': [
                        {'name': 'Type', 'value': alert_data['type'], 'inline': True},
                        {'name': 'Severity', 'value': alert_data['severity'], 'inline': True},
                        {'name': 'Timestamp', 'value': alert_data['timestamp'], 'inline': False}
                    ]
                }]
            }
            
            requests.post(self.discord_webhook, json=payload, timeout=5)
        except Exception as e:
            print(f"[ERROR] Failed to send Discord alert: {str(e)}")
    
    def check_thresholds(self, metrics):
        """Check metrics against thresholds and send alerts."""
        # Check response time
        if metrics['avg_response_time'] > self.thresholds['response_time_ms']:
            self.send_alert(
                'high_response_time',
                'High Response Time Detected',
                f"Average response time: {metrics['avg_response_time']}ms (threshold: {self.thresholds['response_time_ms']}ms)",
                'warning'
            )
        
        # Check error rate
        if metrics['error_rate'] > self.thresholds['error_rate_percent']:
            self.send_alert(
                'high_error_rate',
                'High Error Rate Detected',
                f"Error rate: {metrics['error_rate']}% (threshold: {self.thresholds['error_rate_percent']}%)",
                'critical'
            )
        
        # Check cache hit rate
        if metrics['cache_hit_rate'] < self.thresholds['cache_hit_rate_percent']:
            self.send_alert(
                'low_cache_hit_rate',
                'Low Cache Hit Rate',
                f"Cache hit rate: {metrics['cache_hit_rate']}% (threshold: {self.thresholds['cache_hit_rate_percent']}%)",
                'warning'
            )
        
        # Check engine health
        for engine, stats in metrics['engine_stats'].items():
            failure_rate = 100 - stats['success_rate']
            if failure_rate > self.thresholds['engine_failure_rate_percent']:
                self.send_alert(
                    f'{engine}_high_failure_rate',
                    f'{engine.capitalize()} High Failure Rate',
                    f"{engine} failure rate: {failure_rate}% (threshold: {self.thresholds['engine_failure_rate_percent']}%)",
                    'critical'
                )

# Global alert manager instance
_alert_manager = None

def get_alert_manager():
    """Get or create global alert manager instance."""
    global _alert_manager
    if _alert_manager is None:
        _alert_manager = AlertManager()
    return _alert_manager

