# 🚀 Railway.app Quick Start - 5 Minutes to Live!

## ✅ What's Ready

- ✅ `Procfile` - Tells Railway how to run your app
- ✅ `requirements-railway.txt` - Optimized dependencies
- ✅ `.env.example` - Environment variables template
- ✅ `voyagr_web.py` - Updated to support Railway's PORT
- ✅ Syntax verified ✓

---

## 🎯 5-Minute Setup

### Step 1: Create Railway Account (1 min)
```
1. Go to https://railway.app
2. Click "Start a New Project"
3. Sign up with GitHub
4. Authorize Railway
```

### Step 2: Deploy from GitHub (2 min)
```
1. Click "Deploy from GitHub"
2. Select: perpetualadam/Voyagr
3. Click "Deploy"
4. Wait for deployment to complete
```

### Step 3: Get Your URL (1 min)
```
1. Go to Railway dashboard
2. Click your project
3. Copy the public URL
4. Example: https://voyagr-production.up.railway.app
```

### Step 4: Test It (1 min)
```
1. Open URL in Chrome
2. Try calculating a route
3. Test geocoding
4. Done! 🎉
```

---

## 📱 Access on Pixel 6

```
https://voyagr-production.up.railway.app
```

(Replace with your actual Railway URL)

---

## 🔧 Environment Variables (Optional)

If you have local GraphHopper/Valhalla:

1. Go to Railway dashboard
2. Click "Variables"
3. Add:
   ```
   GRAPHHOPPER_URL=http://localhost:8989
   VALHALLA_URL=http://localhost:8002
   ```

---

## 📊 Monitor Your App

1. **Logs**: Railway dashboard → Logs
2. **Metrics**: Railway dashboard → Metrics
3. **Deployments**: Railway dashboard → Deployments

---

## 🆘 Troubleshooting

**App won't start?**
- Check logs: Railway dashboard → Logs
- Look for error messages

**Routes not calculating?**
- Check if APIs are accessible
- Try using public APIs

**Slow performance?**
- Check Railway metrics
- Upgrade plan if needed

---

## 💰 Cost

- **Free tier**: $5/month credit
- **Enough for**: Small app with moderate traffic
- **After credit**: Pay-as-you-go

---

## 🎉 You're Live!

Your Voyagr PWA is now deployed and accessible worldwide! 🚀

---

## 📚 Full Guide

See `RAILWAY_DEPLOYMENT_GUIDE.md` for detailed instructions.

