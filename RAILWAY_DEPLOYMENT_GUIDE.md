# 🚀 Railway.app Deployment Guide for Voyagr PWA

## ✅ Pre-Deployment Checklist

- [x] App is compliant with Railway.app terms
- [x] No prohibited content (crypto, torrents, VNC, etc.)
- [x] Procfile created
- [x] requirements-railway.txt created
- [x] .env.example created

---

## 📋 Step 1: Create Railway Account

1. Go to https://railway.app
2. Click "Start a New Project"
3. Sign up with GitHub (recommended)
4. Authorize Railway to access your GitHub account

---

## 🔗 Step 2: Connect Your Repository

1. Click "Deploy from GitHub"
2. Select your Voyagr repository
3. Click "Deploy"
4. Railway will auto-detect Flask app

---

## ⚙️ Step 3: Configure Environment Variables

1. Go to your Railway project dashboard
2. Click "Variables" tab
3. Add the following variables:

```
GRAPHHOPPER_URL=http://localhost:8989
VALHALLA_URL=http://localhost:8002
USE_OSRM=false
FLASK_ENV=production
FLASK_DEBUG=false
```

**Note**: If you don't have local GraphHopper/Valhalla running, the app will use fallback APIs.

---

## 🚀 Step 4: Deploy

1. Railway will automatically deploy when you push to GitHub
2. Wait 2-3 minutes for deployment
3. You'll get a public URL like: `https://voyagr-production.up.railway.app`

---

## 📱 Step 5: Access Your App

### On Desktop:
```
https://voyagr-production.up.railway.app
```

### On Pixel 6:
```
https://voyagr-production.up.railway.app
```

---

## 🧪 Step 6: Test the App

1. Open the URL in Chrome
2. Try calculating a route
3. Test geocoding (enter an address)
4. Check browser console (F12) for logs

---

## 📊 Monitoring

1. Go to Railway dashboard
2. Click "Logs" to see real-time logs
3. Click "Metrics" to see CPU/Memory usage
4. Click "Deployments" to see deployment history

---

## 💾 Database

- **Default**: SQLite (voyagr_web.db)
- **Limitation**: SQLite on Railway is ephemeral (resets on redeploy)
- **Solution**: Use PostgreSQL for persistent data

### To Add PostgreSQL:

1. In Railway dashboard, click "Add Service"
2. Select "PostgreSQL"
3. Railway will auto-create connection string
4. Update your app to use PostgreSQL

---

## 🔄 Auto-Deploy from GitHub

1. Every push to `main` branch triggers deployment
2. Deployment takes 2-3 minutes
3. Old deployments are kept for rollback

---

## 🆘 Troubleshooting

### App won't start
- Check logs: Railway dashboard → Logs
- Verify Procfile exists
- Verify requirements-railway.txt is correct

### Routes not calculating
- Check if GraphHopper/Valhalla URLs are correct
- Try using public APIs instead
- Check logs for error messages

### Database not persisting
- SQLite is ephemeral on Railway
- Use PostgreSQL for persistent data
- Or use external database service

### Slow performance
- Check Railway metrics
- Upgrade to paid plan if needed
- Optimize database queries

---

## 💰 Pricing

- **Free tier**: $5/month credit
- **Included**: 500 hours/month compute
- **Enough for**: Small app with moderate traffic
- **Pay-as-you-go**: After free credit runs out

---

## 🎉 You're Live!

Your Voyagr PWA is now deployed on Railway.app and accessible worldwide! 🚀

---

## 📞 Support

- Railway docs: https://docs.railway.app
- Railway support: https://railway.app/support
- GitHub issues: https://github.com/perpetualadam/Voyagr/issues

