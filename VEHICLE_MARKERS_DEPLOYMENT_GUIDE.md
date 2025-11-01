# Vehicle Markers - Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the vehicle marker feature in Voyagr.

## Pre-Deployment Checklist

- ✅ All code implemented in `satnav.py`
- ✅ All icon files created in `vehicle_icons/` directory
- ✅ All tests passing (14/14)
- ✅ Documentation complete
- ✅ Backward compatibility verified

## Deployment Steps

### Step 1: Verify Files

Ensure all required files are present:

```bash
# Check icon files
ls -la vehicle_icons/
# Should show: car.png, electric.png, motorcycle.png, truck.png, van.png, bicycle.png, pedestrian.png

# Check Python files
ls -la satnav.py
ls -la create_vehicle_icons.py
ls -la test_vehicle_markers.py

# Check documentation
ls -la VEHICLE_MARKERS_*.md
```

### Step 2: Run Tests

Execute the test suite to verify everything works:

```bash
python -m pytest test_vehicle_markers.py -v
```

Expected output:
```
14 passed in 0.07s
```

### Step 3: Verify Icon Assets

Check that all icons are valid PNG files:

```bash
# Check file sizes
du -h vehicle_icons/

# Verify PNG format
file vehicle_icons/*.png
```

Expected output:
```
vehicle_icons/car.png: PNG image data, 64 x 64, 8-bit/color RGBA, non-interlaced
vehicle_icons/electric.png: PNG image data, 64 x 64, 8-bit/color RGBA, non-interlaced
... (and so on for all 7 icons)
```

### Step 4: Test in Development

Run the app in development mode:

```bash
python satnav.py
```

Verify:
- ✅ App starts without errors
- ✅ Vehicle marker appears on map
- ✅ Marker shows correct icon for current vehicle type
- ✅ Marker updates when vehicle type changes
- ✅ Marker updates when routing mode changes
- ✅ Marker position updates with GPS

### Step 5: Build for Android (if applicable)

If deploying to Android via Buildozer:

```bash
# Update buildozer.spec to include vehicle_icons directory
# In buildozer.spec, add to source.include_patterns:
# source.include_patterns = assets/*, vehicle_icons/*

# Build APK
buildozer android debug
```

### Step 6: Deploy to Production

#### Desktop Deployment
```bash
# Copy all files to deployment directory
cp -r satnav.py vehicle_icons/ *.md /path/to/deployment/
```

#### Mobile Deployment (Android)
```bash
# Install APK on device
adb install -r bin/voyagr-*.apk
```

#### Cloud Deployment
```bash
# Push to repository
git add satnav.py vehicle_icons/ test_vehicle_markers.py VEHICLE_MARKERS_*.md
git commit -m "Add vehicle marker feature"
git push origin main
```

## Post-Deployment Verification

### 1. Functional Testing

Test each vehicle type:
- [ ] Petrol/Diesel → Car icon (blue)
- [ ] Electric → Electric icon (green)
- [ ] Motorcycle → Motorcycle icon (orange)
- [ ] Truck → Truck icon (brown)
- [ ] Van → Van icon (light blue)

Test each routing mode:
- [ ] Auto → Vehicle type icon
- [ ] Pedestrian → Pedestrian icon (orange)
- [ ] Bicycle → Bicycle icon (red)

### 2. Performance Testing

Monitor performance metrics:
- [ ] Marker creation time < 10ms
- [ ] Marker update time < 5ms
- [ ] No memory leaks
- [ ] No CPU spikes

### 3. User Acceptance Testing

- [ ] Icons are clearly visible
- [ ] Icons are recognizable
- [ ] Icons update correctly
- [ ] No visual glitches
- [ ] Works on different screen sizes

## Troubleshooting

### Issue: Icons Not Displaying

**Symptoms:** Marker appears but no icon visible

**Solutions:**
1. Verify `vehicle_icons/` directory exists
2. Check all PNG files are present
3. Verify PNG files are valid (not corrupted)
4. Check file permissions (readable)

```bash
# Verify directory
ls -la vehicle_icons/

# Check PNG validity
file vehicle_icons/*.png

# Check permissions
chmod 644 vehicle_icons/*.png
```

### Issue: Wrong Icon Displayed

**Symptoms:** Icon doesn't match vehicle type

**Solutions:**
1. Verify vehicle type setting
2. Check routing mode setting
3. Review icon selection logic in `get_vehicle_icon_path()`

```python
# Debug: Print current settings
print(f"Vehicle Type: {app.vehicle_type}")
print(f"Routing Mode: {app.routing_mode}")
print(f"Icon Path: {app.get_vehicle_icon_path()}")
```

### Issue: Marker Not Updating

**Symptoms:** Marker position or icon doesn't update

**Solutions:**
1. Verify GPS is enabled
2. Check vehicle type/routing mode changes trigger update
3. Review `update_vehicle_marker()` method

```python
# Debug: Check marker object
print(f"Marker: {app.vehicle_marker}")
print(f"Marker Position: {app.vehicle_marker.lat}, {app.vehicle_marker.lon}")
print(f"Marker Icon: {app.vehicle_marker.source}")
```

### Issue: Performance Degradation

**Symptoms:** App slows down after marker updates

**Solutions:**
1. Check for memory leaks
2. Verify old markers are removed
3. Monitor CPU usage

```python
# Debug: Check marker cleanup
print(f"Mapview children: {len(app.mapview.children)}")
print(f"Marker in children: {app.vehicle_marker in app.mapview.children}")
```

## Rollback Procedure

If issues occur, rollback to previous version:

```bash
# Revert satnav.py changes
git checkout HEAD~1 satnav.py

# Remove vehicle marker files
rm -rf vehicle_icons/
rm test_vehicle_markers.py
rm VEHICLE_MARKERS_*.md

# Restart app
python satnav.py
```

## Monitoring

### Key Metrics to Monitor

1. **Performance**
   - Marker creation time
   - Marker update time
   - Memory usage
   - CPU usage

2. **Functionality**
   - Icon display correctness
   - Marker position accuracy
   - Update frequency
   - Error rate

3. **User Experience**
   - Icon visibility
   - Icon recognition
   - Update responsiveness
   - No visual glitches

### Logging

Enable debug logging:

```python
# In satnav.py, add debug prints
import logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# In update_vehicle_marker():
logger.debug(f"Updating marker to {icon_path}")
logger.debug(f"Marker position: {lat}, {lon}")
```

## Support

### Documentation
- `VEHICLE_MARKERS_GUIDE.md` - Full implementation guide
- `VEHICLE_MARKERS_QUICK_REFERENCE.md` - Quick reference
- `VEHICLE_MARKERS_IMPLEMENTATION_SUMMARY.md` - Implementation details

### Testing
- `test_vehicle_markers.py` - Test suite with 14 tests

### Code
- `satnav.py` - Main implementation
- `create_vehicle_icons.py` - Icon generation script

## Success Criteria

Deployment is successful when:

✅ All 14 tests pass
✅ Icons display correctly for all vehicle types
✅ Icons display correctly for all routing modes
✅ Marker updates in real-time
✅ No performance degradation
✅ No memory leaks
✅ No visual glitches
✅ User feedback is positive

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Development | Complete | ✅ |
| Testing | Complete | ✅ |
| Documentation | Complete | ✅ |
| Deployment | 1-2 hours | Ready |
| Monitoring | Ongoing | Ready |

## Sign-Off

- [ ] Development Lead: _______________
- [ ] QA Lead: _______________
- [ ] Product Manager: _______________
- [ ] Deployment Date: _______________

## Notes

- Feature is backward compatible
- No breaking changes
- Graceful fallback to car icon if needed
- Can be disabled by removing `vehicle_icons/` directory
- Future enhancements planned (rotation, animation, effects)

## Contact

For issues or questions:
1. Review documentation files
2. Check test cases
3. Review implementation in satnav.py
4. Check icon files in vehicle_icons/

