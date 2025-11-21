# Voyagr Dashcam - User Guide

## Getting Started

### Accessing Dashcam

1. Open Voyagr PWA in your browser
2. Look for the **📹 Dashcam** button in the bottom sheet menu
3. Click to open the Dashcam tab

## Recording Modes

### Standalone Recording

Perfect for recording trips without navigation:

1. **Open Dashcam Tab** - Click 📹 button
2. **Click "🔴 Start Recording"** - Recording begins immediately
3. **Watch the Timer** - Live duration display shows recording time
4. **Click "⏹️ Stop Recording"** - Stops recording and saves file
5. **View in List** - Recording appears in "Recent Recordings" section

### Navigation-Integrated Recording

Record video while using turn-by-turn navigation:

1. **Start Navigation** - Calculate and start a route
2. **Open Dashcam Tab** - Click 📹 button
3. **Click "🔴 Start Recording"** - Recording begins with GPS metadata
4. **See Indicator** - Blinking 🔴 shows recording is active
5. **Navigate Normally** - GPS data collected automatically
6. **Stop Recording** - Click "⏹️ Stop Recording" when done

## Recording Settings

### Video Quality

**Resolution Options:**
- **720p (HD)** - Lower quality, smaller file size
- **1080p (Full HD)** - Balanced quality and size (recommended)
- **1440p (2K)** - Highest quality, larger file size

**Frame Rate:**
- **24 FPS** - Smooth, lower file size
- **30 FPS** - Standard, balanced (recommended)
- **60 FPS** - Ultra-smooth, larger file size

### Audio Recording

Toggle audio on/off:
- **ON** - Records audio from microphone
- **OFF** - Video only, no audio

### Storage Management

**Retention Period:**
- **7 Days** - Auto-delete after 1 week
- **14 Days** - Auto-delete after 2 weeks (recommended)
- **30 Days** - Auto-delete after 1 month
- **90 Days** - Auto-delete after 3 months

## Managing Recordings

### View Recordings

1. Open Dashcam tab
2. Scroll to "Recent Recordings" section
3. See list with:
   - Recording date/time
   - Duration
   - File size

### Delete Recording

1. Find recording in list
2. Click **🗑️ Delete** button
3. Confirm deletion

### Cleanup Old Recordings

Automatically delete recordings older than retention period:

1. Click **🗑️ Cleanup Old Recordings** button
2. Confirm action
3. Old recordings deleted

## Storage Information

The Storage Information panel shows:

- **Total Recordings** - Number of saved videos
- **Total Size** - Combined file size in MB
- **Oldest Recording** - Date of oldest video

## Tips & Best Practices

### For Best Results

✅ **DO:**
- Enable audio for better context
- Use 1080p for good quality/size balance
- Set 14-day retention for regular use
- Cleanup old recordings monthly
- Record during daylight for better video

❌ **DON'T:**
- Record at 4K if storage is limited
- Keep 90-day retention if storage is small
- Record in very low light conditions
- Leave recordings indefinitely

### Storage Tips

- **1 hour of 1080p @ 30fps ≈ 1.5-2 GB**
- **Adjust resolution if running low on space**
- **Use cleanup feature regularly**
- **Delete unwanted recordings manually**

### GPS Metadata

Metadata collected every 5 seconds includes:
- Your location (latitude/longitude)
- Current speed
- Direction heading
- Timestamp

This data helps with:
- Route analysis
- Speed tracking
- Incident documentation

## Troubleshooting

### Recording Won't Start

**Problem:** "Start Recording" button doesn't work

**Solutions:**
1. Refresh the page
2. Check browser console for errors (F12)
3. Ensure database is initialized
4. Try a different browser

### GPS Not Recording

**Problem:** No GPS metadata collected

**Solutions:**
1. Check location permission in browser
2. Ensure GPS is enabled on device
3. Wait for GPS lock (may take 30 seconds)
4. Try recording outdoors

### Recordings Not Showing

**Problem:** Recordings don't appear in list

**Solutions:**
1. Refresh the page
2. Check storage information panel
3. Verify recording actually stopped
4. Check browser storage quota

### Storage Full

**Problem:** Can't record new videos

**Solutions:**
1. Delete old recordings manually
2. Run cleanup to remove expired videos
3. Reduce video resolution
4. Reduce retention period
5. Clear browser cache

### Video Quality Poor

**Problem:** Recording looks blurry or pixelated

**Solutions:**
1. Increase resolution setting
2. Increase frame rate to 60 FPS
3. Increase bitrate (if available)
4. Ensure good lighting
5. Clean camera lens

## Privacy & Data

### Your Data is Private

- ✅ Recordings stored locally only
- ✅ No automatic cloud upload
- ✅ No tracking or analytics
- ✅ You control retention
- ✅ Deleted on app uninstall

### Data Deletion

To permanently delete all recordings:
1. Open Dashcam tab
2. Delete each recording individually, OR
3. Click "Cleanup Old Recordings" with 0-day retention

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Dashcam | Click 📹 button |
| Start Recording | Click 🔴 button |
| Stop Recording | Click ⏹️ button |
| Delete Recording | Click 🗑️ button |

## FAQ

**Q: Can I record while navigating?**
A: Yes! Recording works during navigation with automatic GPS metadata collection.

**Q: How much storage do I need?**
A: ~1.5-2 GB per hour at 1080p/30fps. Adjust based on your device.

**Q: Can I share recordings?**
A: Currently recordings are local only. Future versions may add sharing.

**Q: Does recording drain battery?**
A: Minimal impact. GPS collection every 5 seconds uses very little power.

**Q: Can I edit recordings?**
A: Not in-app. Export and use external video editor.

**Q: What formats are supported?**
A: MP4 format with H.264 codec.

## Support

For issues or feature requests:
1. Check troubleshooting section above
2. Review browser console for errors
3. Try clearing browser cache
4. Report issues on GitHub

