# Persistent Settings - Quick Start Guide

## 🎯 What Is This?

Your Voyagr PWA now remembers all your preferences! When you change any setting, it's automatically saved. When you come back to the app, all your settings are restored.

## ✨ What Gets Saved?

Everything in the Settings tab:
- **Units**: Distance (km/mi), Currency (£/$/ €), Speed (km/h/mph), Temperature (°C/°F)
- **Vehicle**: Car type (petrol/electric/motorcycle/truck/van)
- **Routing**: Mode (auto/walk/bike)
- **Route Preferences**: Avoid highways, scenic routes, quiet roads, unpaved roads, optimization type, max detour
- **Hazards**: Tolls, CAZ, speed cameras, traffic cameras, variable speed alerts
- **Display**: Map theme (standard/satellite/dark), smart zoom on/off

## 🚀 How to Use

### Automatic Saving
1. Open Settings tab (⚙️)
2. Change any preference (e.g., select "Miles" for distance)
3. **That's it!** Settings are automatically saved
4. Reload the page or close/reopen the app
5. Your settings are restored automatically ✅

### Manual Backup (Export)
1. Open Settings tab
2. Scroll to bottom
3. Click "Export Settings" button
4. A JSON file downloads with your settings
5. Save it somewhere safe

### Restore from Backup (Import)
1. Open Settings tab
2. Scroll to bottom
3. Click "Import Settings" button
4. Select your previously exported JSON file
5. Settings are restored instantly ✅

### Reset to Defaults
1. Open Settings tab
2. Scroll to bottom
3. Click "Reset Settings" button
4. Confirm the action
5. Page reloads with default settings

## 💡 Tips

- **First time using the app?** Default settings are sensible for most users
- **Switching devices?** Export settings on one device, import on another
- **Want to try different settings?** Export current settings first, then experiment
- **Settings not loading?** Check browser console (F12) for errors
- **Using private/incognito mode?** Settings won't persist (browser limitation)

## 🔍 Where Are Settings Stored?

Settings are stored in your browser's localStorage:
- **Location**: Browser storage (not on any server)
- **Size**: ~1KB (very small)
- **Privacy**: Only you can access them
- **Persistence**: Until you clear browser data or reset settings

## ⚙️ Technical Details

### Settings Structure
```javascript
{
  "unit_distance": "km",
  "unit_currency": "GBP",
  "unit_speed": "kmh",
  "unit_temperature": "celsius",
  "vehicleType": "petrol_diesel",
  "routingMode": "auto",
  "routePreferences": { ... },
  "hazardPreferences": { ... },
  "mapTheme": "standard",
  "smartZoomEnabled": true,
  "lastSaved": "2025-11-06T10:30:00Z"
}
```

### Default Settings
```javascript
{
  "unit_distance": "km",
  "unit_currency": "GBP",
  "unit_speed": "kmh",
  "unit_temperature": "celsius",
  "vehicleType": "petrol_diesel",
  "routingMode": "auto",
  "mapTheme": "standard",
  "smartZoomEnabled": true
}
```

## 🐛 Troubleshooting

### Settings not saving?
- ✅ Check localStorage is enabled in browser
- ✅ Check you're not in private/incognito mode
- ✅ Check browser storage quota not exceeded
- ✅ Check browser console (F12) for errors

### Settings not loading on page load?
- ✅ Try refreshing the page (Ctrl+F5)
- ✅ Check browser console for errors
- ✅ Try exporting settings to verify they exist
- ✅ Try resetting and reconfiguring

### Can't export/import settings?
- ✅ Check browser allows file downloads
- ✅ Check file is valid JSON format
- ✅ Check browser console for errors

## 📱 Browser Support

Works on:
- ✅ Chrome/Chromium 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## 🔐 Privacy & Security

- ✅ Settings stored locally in your browser only
- ✅ No data sent to any server
- ✅ You have full control
- ✅ Can clear anytime via "Reset Settings"
- ✅ Settings not encrypted (stored as plain JSON)

## 🎓 Examples

### Example 1: Metric to Imperial
1. Open Settings
2. Change Distance to "Miles"
3. Change Speed to "mph"
4. Change Temperature to "Fahrenheit"
5. Close app
6. Reopen app
7. All settings restored ✅

### Example 2: Eco-Friendly Routing
1. Open Settings
2. Set Route Optimization to "Eco-Friendly"
3. Enable "Prefer Scenic"
4. Enable "Prefer Quiet"
5. Set Vehicle to "Electric"
6. Close app
7. Reopen app
8. All eco settings restored ✅

### Example 3: Backup & Restore
1. Export settings (creates JSON file)
2. Share file with friend
3. Friend imports file
4. Friend has same settings ✅

## ❓ FAQ

**Q: Will my settings sync across devices?**
A: Not automatically. Export on one device, import on another.

**Q: What if I clear browser data?**
A: Settings will be cleared too. Export first if you want to keep them.

**Q: Can I share settings with others?**
A: Yes! Export your settings, share the JSON file, they can import it.

**Q: Are settings encrypted?**
A: No, they're stored as plain JSON. Don't share sensitive info.

**Q: How much storage do settings use?**
A: About 1KB. Browsers typically allow 5-10MB per site.

**Q: Can I edit the JSON file manually?**
A: Yes, but be careful with the format. Invalid JSON won't import.

## 📞 Need Help?

- Check the full guide: `PERSISTENT_SETTINGS_GUIDE.md`
- Check browser console (F12) for error messages
- Try resetting settings and reconfiguring
- Check browser localStorage is enabled

---

**Enjoy your personalized Voyagr experience!** 🗺️✨

