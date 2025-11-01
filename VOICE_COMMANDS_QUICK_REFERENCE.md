# 🎤 Voice Commands - Quick Reference

**Activation**: Say "Hey SatNav" → Wait for "Report now" → Speak command

---

## 🗺️ NAVIGATION COMMANDS

```
"Navigate to [location]"
"Go to [location]"
"Take me to [location]"
```

**Examples**:
- "Navigate to Manchester"
- "Go to London"
- "Take me to Birmingham"

**Response**: Route calculated with distance, time, and cost

---

## 🔍 SEARCH COMMANDS

```
"Find nearest gas station"
"Find nearest charging station"
"Find nearest [place type]"
```

**Examples**:
- "Find nearest gas station"
- "Find nearest charging station"
- "Find nearest restaurant"
- "Find nearest parking"
- "Find nearest hotel"

**Response**: Location name and distance

---

## 🛣️ ROUTE PREFERENCE COMMANDS

```
"Avoid tolls"
"Include tolls"
"Avoid CAZ"
"Fastest route"
"Cheapest route"
```

**Examples**:
- "Avoid tolls" → Disables toll inclusion
- "Include tolls" → Enables toll inclusion
- "Avoid CAZ" → Enables CAZ avoidance
- "Fastest route" → Selects fastest option
- "Cheapest route" → Selects most economical

**Response**: Preference updated

---

## ℹ️ INFORMATION COMMANDS

```
"What's my ETA?"
"How much will this cost?"
"What's the traffic like?"
```

**Examples**:
- "What's my ETA?" → Announces arrival time
- "How much will this cost?" → Shows cost breakdown
- "What's the traffic like?" → Reports traffic conditions

**Response**: Detailed information with voice announcement

---

## 📊 COMMAND SUMMARY

| Category | Count | Examples |
|----------|-------|----------|
| Navigation | 3 | Navigate to, Go to, Take me to |
| Search | 3+ | Find nearest [place] |
| Preferences | 5 | Avoid tolls, Fastest route, etc. |
| Information | 3 | ETA, Cost, Traffic |
| **Total** | **14+** | **All implemented** |

---

## ⚙️ SETUP

1. **Enable Voice Wake Word**
   - Toggle "Voice Wake" button in UI
   
2. **Configure Picovoice** (if not already done)
   - Add `PICOVOICE_ACCESS_KEY` to `.env` file
   - See `API_INTEGRATION_GUIDE.md` for details

3. **Test**
   - Say "Hey SatNav"
   - Wait for "Report now"
   - Speak a command

---

## 🎯 TIPS

✅ Speak clearly and naturally  
✅ Use complete phrases (e.g., "Navigate to Manchester" not just "Manchester")  
✅ Wait for "Report now" prompt before speaking  
✅ Commands are case-insensitive  
✅ Unrecognized commands fall back to hazard reporting  

---

## 🔧 TROUBLESHOOTING

**"Command not recognized"**
- Speak more clearly
- Use exact command phrases
- Check microphone is working

**"No active route"**
- Calculate a route first before asking for ETA or cost
- Use navigation commands to set destination

**"Location not found"**
- Try different location names
- Use more specific place names
- Check internet connection

---

## 📞 SUPPORT

For detailed information, see:
- `VOICE_COMMAND_SYSTEM_GUIDE.md` - Complete guide
- `API_INTEGRATION_GUIDE.md` - Picovoice setup
- `USAGE_EXAMPLES_AND_API_REFERENCE.md` - API reference

