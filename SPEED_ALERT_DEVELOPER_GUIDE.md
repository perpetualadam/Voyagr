# Speed Alert System - Developer Guide
**Quick Reference for Unit Consistency**

---

## 🔧 HELPER METHODS

### Convert Threshold to User's Unit
```python
threshold_user_units = self.get_speed_alert_threshold_in_user_units()
# Returns: 8 (km/h) or 4.97 (mph) depending on self.distance_unit
```

### Convert Any Speed to User's Unit
```python
speed_user_units = self.convert_speed_to_user_units(96)  # 96 km/h
# Returns: 96 (if km/h mode) or 59.65 (if mph mode)
```

### Get Unit Label
```python
unit = self.get_speed_unit_label()
# Returns: 'km/h' or 'mph' depending on self.distance_unit
```

---

## 📝 COMMON PATTERNS

### Pattern 1: Display Speed in User's Unit
```python
speed_kmh = 96
speed_user = self.convert_speed_to_user_units(speed_kmh)
unit = self.get_speed_unit_label()
message = f"Speed: {speed_user:.0f} {unit}"
# Output: "Speed: 96 km/h" or "Speed: 59.65 mph"
```

### Pattern 2: Accept Input in User's Unit
```python
user_input = 10  # User enters this
if self.distance_unit == 'mi':
    value_kmh = user_input * 1.60934  # Convert to km/h
else:
    value_kmh = user_input  # Already in km/h
# Store value_kmh internally
```

### Pattern 3: Update UI When Unit Changes
```python
def set_distance_unit(self, unit):
    self.distance_unit = unit
    
    # Update any UI that shows speeds
    if 'speed_field' in self.inputs:
        display_value = self.convert_speed_to_user_units(self.current_speed_kmh)
        unit_label = self.get_speed_unit_label()
        self.inputs['speed_field'].hint_text = f'Speed ({unit_label})'
        self.inputs['speed_field'].text = f"{display_value:.1f}"
```

### Pattern 4: Validate Input Range
```python
user_input = 15
if self.distance_unit == 'mi':
    # Validate mph (0-31 mph ≈ 0-50 km/h)
    if 0 <= user_input <= 31:
        value_kmh = user_input * 1.60934
    else:
        raise ValueError("Must be 0-31 mph")
else:
    # Validate km/h (0-50 km/h)
    if 0 <= user_input <= 50:
        value_kmh = user_input
    else:
        raise ValueError("Must be 0-50 km/h")
```

---

## 🔄 UNIT CONVERSION FORMULAS

```python
# km/h to mph
mph = kmh / 1.60934

# mph to km/h
kmh = mph * 1.60934

# Common conversions
8 km/h = 4.97 mph
10 mph = 16.09 km/h
50 km/h = 31.07 mph
```

---

## 📊 INTERNAL STORAGE

**All speeds stored internally in km/h**:
- `self.current_vehicle_speed_kmh` - Current speed (km/h)
- `self.current_speed_limit_mph` - Speed limit (mph) - converted to km/h when needed
- `self.speed_alert_threshold_kmh` - Threshold (km/h)

**Convert to user's unit only for display/input**

---

## ✅ CHECKLIST FOR NEW FEATURES

When adding new speed-related features:

- [ ] Store speeds internally in km/h
- [ ] Convert to user's unit before display
- [ ] Accept input in user's unit and convert to km/h
- [ ] Use `get_speed_unit_label()` for UI labels
- [ ] Update UI when `set_distance_unit()` is called
- [ ] Include both km/h and user unit in status methods
- [ ] Validate input ranges based on unit
- [ ] Test with both km/h and mph modes
- [ ] Update error messages to show correct unit

---

## 🐛 DEBUGGING TIPS

### Check Current Unit
```python
print(f"Distance unit: {self.distance_unit}")  # 'km' or 'mi'
print(f"Speed unit: {self.get_speed_unit_label()}")  # 'km/h' or 'mph'
```

### Check Threshold Value
```python
status = self.get_speed_alert_status()
print(f"Threshold: {status['threshold']} {status['unit']}")
print(f"Threshold (km/h): {status['threshold_kmh']}")
```

### Check Speed Conversion
```python
speed_kmh = 96
speed_user = self.convert_speed_to_user_units(speed_kmh)
print(f"{speed_kmh} km/h = {speed_user} {self.get_speed_unit_label()}")
```

---

## 📚 RELATED FILES

- `satnav.py` - Main application (lines 4083-4099 for helper methods)
- `SPEED_ALERT_UNIT_CONSISTENCY_AUDIT.md` - Issue details
- `SPEED_ALERT_UNIT_FIXES_APPLIED.md` - Fix details
- `UNIT_CONSISTENCY_SCENARIOS.md` - Real-world examples

---

## 🎯 KEY PRINCIPLES

1. **Store internally in km/h** - Consistent internal representation
2. **Convert for display** - Show user's preferred unit
3. **Convert for input** - Accept user's preferred unit
4. **Update UI dynamically** - Refresh when unit changes
5. **Validate ranges** - Use correct range for unit
6. **Include both units** - Provide km/h reference in APIs

---

## ✨ BEST PRACTICES

✅ DO:
- Use helper methods for conversions
- Store speeds in km/h internally
- Convert only for display/input
- Update UI when unit changes
- Validate input ranges
- Include unit labels in messages

❌ DON'T:
- Hardcode km/h in messages
- Store speeds in mixed units
- Forget to convert for display
- Ignore unit changes
- Use wrong validation ranges
- Omit unit labels

---

## 📞 QUESTIONS?

Refer to the comprehensive documentation:
1. `SPEED_ALERT_UNIT_CONSISTENCY_AUDIT.md` - What was wrong
2. `SPEED_ALERT_UNIT_FIXES_APPLIED.md` - How it was fixed
3. `UNIT_CONSISTENCY_SCENARIOS.md` - Real examples
4. `UNIT_CONSISTENCY_FINAL_REPORT.md` - Complete summary

