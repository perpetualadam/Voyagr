# Voyagr PWA - Production Deployment & Operations Guide

## Overview

This guide covers production deployment, monitoring, alerting, backups, and security configuration for Voyagr PWA on Railway.app.

## Table of Contents

1. [Production Monitoring](#production-monitoring)
2. [Alerts and Notifications](#alerts-and-notifications)
3. [Automated Backups](#automated-backups)
4. [SSL/TLS Security](#ssltls-security)
5. [Deployment Checklist](#deployment-checklist)
6. [Troubleshooting](#troubleshooting)

---

## Production Monitoring

### Metrics Dashboard

Access real-time metrics at:
```
GET /api/production/metrics
```

Returns:
- Total requests and errors
- Average response time
- Cache hit rate
- Engine performance (GraphHopper, Valhalla, OSRM)
- Error breakdown by type
- Recent errors

### Health Check Endpoint

For external monitoring services (UptimeRobot, Datadog, etc.):
```
GET /api/production/health
```

Returns:
- Health status: `healthy`, `degraded`, or `unhealthy`
- List of issues detected
- Full metrics snapshot

### Logging

Logs are written to `voyagr_production.log`:
- All API requests with response times
- Routing engine performance
- Database query performance (slow queries > 1s)
- Errors with full context

Configure log level in `.env.production`:
```
LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR
```

---

## Alerts and Notifications

### Configuration

Set in `.env.production`:

```env
# Email Alerts
ALERT_EMAIL_ENABLED=true
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
ALERT_EMAIL=admin@example.com

# Slack Integration
ALERT_SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Discord Integration
ALERT_DISCORD_ENABLED=true
DISCORD_WEBHOOK_URL=https://discordapp.com/api/webhooks/YOUR/WEBHOOK/URL

# Webhook Alerts
ALERT_WEBHOOK_ENABLED=true
ALERT_WEBHOOK_URL=https://your-endpoint.com/alerts
```

### Alert Thresholds

Configure thresholds in `.env.production`:

```env
ALERT_RESPONSE_TIME_MS=5000          # Alert if avg response > 5s
ALERT_ERROR_RATE_PERCENT=5           # Alert if error rate > 5%
ALERT_CACHE_HIT_RATE_PERCENT=50      # Alert if cache hit rate < 50%
ALERT_ENGINE_FAILURE_RATE_PERCENT=30 # Alert if engine failure > 30%
```

### Email Setup (Gmail)

1. Enable 2-factor authentication on Gmail
2. Generate app-specific password:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Windows Computer"
   - Copy generated password
3. Set `SMTP_PASSWORD` to generated password

### Slack Setup

1. Go to your Slack workspace
2. Create incoming webhook:
   - Settings → Apps & integrations → Manage
   - Search "Incoming Webhooks"
   - Click "Add to Slack"
   - Choose channel
   - Copy webhook URL
3. Set `SLACK_WEBHOOK_URL` in `.env.production`

### Discord Setup

1. Go to your Discord server
2. Create webhook:
   - Server Settings → Integrations → Webhooks
   - Click "New Webhook"
   - Copy webhook URL
3. Set `DISCORD_WEBHOOK_URL` in `.env.production`

---

## Automated Backups

### Backup Endpoints

List backups:
```
GET /api/production/backups
```

Create manual backup:
```
POST /api/production/backup/create
```

Restore from backup:
```
POST /api/production/backup/restore/{backup_name}
```

### Configuration

Set in `.env.production`:

```env
# Backup Schedule
BACKUP_INTERVAL_HOURS=24

# Retention Policy
BACKUP_DAILY_RETENTION=7      # Keep 7 daily backups
BACKUP_WEEKLY_RETENTION=4     # Keep 4 weekly backups
BACKUP_MONTHLY_RETENTION=12   # Keep 12 monthly backups

# S3 Cloud Storage (Optional)
BACKUP_S3_ENABLED=true
BACKUP_S3_BUCKET=voyagr-backups
BACKUP_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
```

### S3 Setup

1. Create AWS S3 bucket:
   - Go to https://console.aws.amazon.com/s3
   - Click "Create bucket"
   - Name: `voyagr-backups`
   - Enable versioning

2. Create IAM user with S3 access:
   - Go to IAM → Users
   - Create user: `voyagr-backup`
   - Attach policy: `AmazonS3FullAccess`
   - Generate access key
   - Copy access key and secret

3. Set AWS credentials in `.env.production`

### Backup Verification

Backups are automatically verified:
- Database integrity checked before compression
- Checksums calculated and stored
- Corrupted backups are rejected

### Restore Procedure

1. List available backups:
   ```bash
   curl http://localhost:5000/api/production/backups
   ```

2. Restore from backup:
   ```bash
   curl -X POST http://localhost:5000/api/production/backup/restore/voyagr_web_20231115_120000.db.gz
   ```

3. Verify restoration:
   - Check application logs
   - Verify data integrity
   - Test critical endpoints

---

## SSL/TLS Security

### Railway.app Automatic SSL

Railway.app automatically provides SSL certificates:
1. Go to project settings
2. Click "Domains"
3. Add custom domain
4. SSL certificate auto-generated

### Security Headers

Automatically added to all responses:
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy` (CSP)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

### HTTPS Enforcement

Set in `.env.production`:
```env
ENFORCE_HTTPS=true
```

All HTTP requests automatically redirect to HTTPS.

### Secure Cookies

Automatically configured:
- `Secure` flag (HTTPS only)
- `HttpOnly` flag (no JavaScript access)
- `SameSite=Lax` (CSRF protection)

### Rate Limiting

Configure in `.env.production`:
```env
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
```

Limits: 100 requests per 60 seconds per IP address.

---

## Deployment Checklist

### Pre-Deployment

- [ ] All code committed to GitHub
- [ ] `.env.production` configured with all secrets
- [ ] Database backups tested
- [ ] Monitoring alerts configured
- [ ] SSL certificates ready
- [ ] Rate limiting configured
- [ ] CORS settings verified

### Deployment

- [ ] Deploy to Railway.app
- [ ] Verify all endpoints responding
- [ ] Check production logs
- [ ] Monitor metrics dashboard
- [ ] Test backup/restore procedure
- [ ] Verify alerts working

### Post-Deployment

- [ ] Monitor for 24 hours
- [ ] Check error rates
- [ ] Verify cache hit rates
- [ ] Test all routing engines
- [ ] Verify backup scheduler running
- [ ] Check alert notifications

---

## Troubleshooting

### High Response Times

1. Check routing engine connectivity
2. Monitor database query performance
3. Check cache hit rate
4. Review error logs

### High Error Rate

1. Check routing engine health
2. Verify database connectivity
3. Review error logs for patterns
4. Check rate limiting

### Backup Failures

1. Verify disk space available
2. Check S3 credentials
3. Review backup logs
4. Test manual backup creation

### Alert Not Sending

1. Verify alert configuration
2. Check SMTP/webhook credentials
3. Review alert logs
4. Test manual alert trigger

---

## Production Monitoring Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/production/metrics` | GET | Get comprehensive metrics |
| `/api/production/health` | GET | Get health status |
| `/api/production/backups` | GET | List available backups |
| `/api/production/backup/create` | POST | Create manual backup |
| `/api/production/backup/restore/{name}` | POST | Restore from backup |

---

**Status**: Production-ready ✅
**Last Updated**: November 14, 2025

