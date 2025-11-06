# 🚀 Railway.app Setup Instructions

**Status**: Ready to deploy - just need to add Railway token

---

## 📋 What You Need to Do

Your code is ready to deploy to Railway.app! You just need to:

1. Create a Railway.app account
2. Create a project and connect your GitHub repository
3. Generate a Railway API token
4. Add the token to GitHub Secrets
5. Push code to trigger automatic deployment

---

## Step 1: Create Railway Account

1. Go to https://railway.app
2. Click "Start a New Project"
3. Sign up with GitHub (recommended)
4. Authorize Railway to access your GitHub account

---

## Step 2: Create Railway Project

1. In Railway dashboard, click "New Project"
2. Select "Deploy from GitHub"
3. Search for and select "perpetualadam/Voyagr"
4. Click "Deploy"
5. Railway will auto-detect Flask app and start building

---

## Step 3: Generate Railway API Token

1. Go to https://railway.app/account/tokens
2. Click "Create New Token"
3. Give it a name like "GitHub Actions"
4. Copy the token (you'll need it in the next step)

---

## Step 4: Add Token to GitHub Secrets

1. Go to https://github.com/perpetualadam/Voyagr/settings/secrets/actions
2. Click "New repository secret"
3. Name: `RAILWAY_TOKEN`
4. Value: Paste the token from Step 3
5. Click "Add secret"

---

## Step 5: Trigger Deployment

Once the token is added, the next push to main will automatically deploy:

```bash
git push origin main
```

Or manually trigger the workflow:
1. Go to GitHub Actions
2. Select "Deploy to Railway" workflow
3. Click "Run workflow"
4. Select "main" branch
5. Click "Run workflow"

---

## Step 6: Monitor Deployment

1. Go to Railway dashboard
2. Click on your Voyagr project
3. Click "Deployments" tab
4. Watch the deployment progress
5. Check "Logs" for any errors

---

## Step 7: Verify Deployment

Once deployment completes:
1. Go to https://voyagr-production.up.railway.app
2. You should see the Voyagr PWA interface
3. Test route calculation
4. Test settings
5. Verify all features work

---

## 🎯 What Gets Deployed

Once Railway is connected, these features will be live:

✅ **Route Preview Feature** - Review routes before navigation  
✅ **Unified Settings Tab** - All preferences in one place  
✅ **Valhalla Distance Fix** - Correct distance calculations  
✅ **Screen Wake Lock API** - Screen stays on during navigation  
✅ **Geocoding Autocomplete** - Real-time address suggestions  
✅ **All Routing Engines** - GraphHopper, Valhalla, OSRM  

---

## 🔧 Troubleshooting

### Deployment fails with "RAILWAY_TOKEN not found"
- Make sure you added the secret to GitHub
- Secret name must be exactly `RAILWAY_TOKEN`
- Wait a few seconds after adding secret before pushing

### App crashes after deployment
- Check Railway logs for error messages
- Verify environment variables are set in Railway dashboard
- Check if required files exist (voyagr_web.py, manifest.json, etc.)

### App returns 404
- Deployment might still be in progress
- Wait 2-3 minutes and refresh
- Check Railway dashboard for deployment status

### Routes not calculating
- Check if GraphHopper/Valhalla URLs are accessible
- Verify API keys in .env are correct
- Check browser console for error messages

---

## 📊 Environment Variables in Railway

Railway will automatically use variables from your `.env` file:

```
GRAPHHOPPER_URL=http://81.0.246.97:8989
VALHALLA_URL=http://141.147.102.102:8002
USE_OSRM=false
MAPQUEST_API_KEY=...
OPENWEATHERMAP_API_KEY=...
PICOVOICE_ACCESS_KEY=...
```

---

## 🎉 You're Done!

Once the token is added and deployment completes, your Voyagr PWA will be live at:

**https://voyagr-production.up.railway.app**

All recent features will be available! 🚀

---

## 📞 Need Help?

- Railway Docs: https://docs.railway.app
- Railway Support: https://railway.app/support
- GitHub Issues: https://github.com/perpetualadam/Voyagr/issues

