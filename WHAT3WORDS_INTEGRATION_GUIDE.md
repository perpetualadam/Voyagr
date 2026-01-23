# What3Words Integration Guide for Voyagr PWA

**Date**: 2026-01-23  
**Status**: Ready for Implementation  
**Complexity**: Medium  
**Estimated Effort**: 8-12 hours

---

## 📋 Executive Summary

What3Words converts GPS coordinates into memorable 3-word addresses (e.g., `///filled.count.soap`). This guide covers implementation for Voyagr's navigation PWA.

### Current Pricing (2026)
- **Free Tier**: AutoSuggest only (10 req/sec limit) - NO coordinate conversion
- **Basic**: £7.99/month - 1,000 conversions/month
- **Standard**: £35/month - 10,000 conversions/month (Most Popular)
- **Plus**: £99/month - 30,000 conversions/month
- **Premium**: £235/month - 75,000 conversions/month

---

## 🎯 Integration Points for Voyagr

### 1. **Destination Search** (Primary Use Case)
Allow users to enter What3Words addresses instead of traditional addresses:
```
User Input: "filled.count.soap"
↓ (API Call)
Coordinates: 51.5074, -0.1278
↓ (Route Calculation)
Navigation starts
```

### 2. **Destination Sharing** (Secondary Use Case)
Convert route destination to What3Words for easy sharing:
```
Destination: 51.5174, -0.1278
↓ (API Call)
What3Words: "///happy.trees.forever"
↓ (Share via SMS/Email)
"Meet me at ///happy.trees.forever"
```

### 3. **Emergency Location Sharing** (Safety Feature)
Quick share current location as What3Words:
```
Current GPS: 51.5100, -0.1250
↓ (API Call)
What3Words: "///urgent.help.here"
↓ (Emergency Contact)
Send to emergency services
```

---

## 🔧 Implementation Steps

### Step 1: Get API Key
1. Go to https://accounts.what3words.com/select-plan
2. Choose plan (recommend **Standard** for production)
3. Create account and get API key
4. Add to `.env`:
```
WHAT3WORDS_API_KEY=your_api_key_here
```

### Step 2: Create What3Words Service Module
**File**: `static/js/modules/services/what3words-service.js`

```javascript
class What3WordsService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.what3words.com/v3';
    }

    // Convert 3-word address to coordinates
    async convertToCoordinates(words) {
        const url = `${this.baseUrl}/convert-to-coordinates`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'X-API-Key': this.apiKey },
            body: JSON.stringify({ words })
        });
        return response.json();
    }

    // Convert coordinates to 3-word address
    async convertToWords(lat, lon) {
        const url = `${this.baseUrl}/convert-to-3wa`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'X-API-Key': this.apiKey },
            body: JSON.stringify({ coordinates: `${lat},${lon}` })
        });
        return response.json();
    }

    // AutoSuggest for user input validation
    async autoSuggest(input, options = {}) {
        const url = `${this.baseUrl}/autosuggest`;
        const params = new URLSearchParams({
            input,
            key: this.apiKey,
            ...options
        });
        const response = await fetch(`${url}?${params}`);
        return response.json();
    }
}
```

### Step 3: Add UI Components
**File**: `static/js/modules/ui/what3words-input.js`

```javascript
class What3WordsInput {
    constructor(service) {
        this.service = service;
        this.setupInputField();
    }

    setupInputField() {
        // Create input with autocomplete
        const input = document.createElement('input');
        input.placeholder = 'Enter what3words address (e.g., ///filled.count.soap)';
        input.addEventListener('input', (e) => this.handleInput(e));
    }

    async handleInput(event) {
        const value = event.target.value;
        if (value.length < 3) return;

        // Get suggestions
        const suggestions = await this.service.autoSuggest(value);
        this.displaySuggestions(suggestions);
    }

    async selectAddress(words) {
        // Convert to coordinates
        const result = await this.service.convertToCoordinates(words);
        return {
            lat: result.coordinates.lat,
            lon: result.coordinates.lng,
            address: words
        };
    }
}
```

### Step 4: Integrate with Route Calculation
**File**: `voyagr_web.py` - Add endpoint:

```python
@app.route('/api/what3words/convert', methods=['POST'])
def convert_what3words():
    data = request.json
    words = data.get('words')
    
    # Call What3Words API
    response = requests.get(
        'https://api.what3words.com/v3/convert-to-coordinates',
        params={'words': words, 'key': os.getenv('WHAT3WORDS_API_KEY')}
    )
    
    if response.ok:
        coords = response.json()['coordinates']
        return {
            'success': True,
            'lat': coords['lat'],
            'lon': coords['lng']
        }
    return {'success': False, 'error': 'Invalid address'}
```

### Step 5: Add to Settings Panel
**File**: `voyagr_web.py` - Add toggle:

```html
<div class="settings-section">
    <label>
        <input type="checkbox" id="what3wordsToggle" class="toggle-switch">
        <span>🌍 What3Words Search</span>
    </label>
</div>
```

---

## 📊 Cost Analysis

### Monthly Costs (Estimated)
| Users | Conversions/Month | Plan | Cost |
|-------|------------------|------|------|
| 1-10 | 100-500 | Basic | £7.99 |
| 10-50 | 500-5,000 | Standard | £35 |
| 50-200 | 5,000-20,000 | Plus | £99 |
| 200+ | 20,000+ | Premium | £235 |

### Break-Even Analysis
- **Free tier**: Only AutoSuggest (no conversions) - insufficient
- **Basic tier**: ~10-20 active users needed to justify cost
- **Standard tier**: Recommended for production (most popular)

---

## ⚠️ Considerations

### Pros ✅
- Memorable addresses (better than coordinates)
- Global coverage (54+ languages)
- Emergency services integration
- Easy sharing

### Cons ❌
- Monthly cost (£7.99-£235)
- Vendor lock-in (proprietary algorithm)
- Requires API calls (latency)
- Limited free tier

### Alternatives 🔄
- **Google Plus Codes**: Free, open-source, no API needed
- **OpenLocationCode**: Free, similar to Plus Codes
- **Traditional Addresses**: Already supported

---

## 🚀 Deployment Checklist

- [ ] Get API key from What3Words
- [ ] Add to `.env` file
- [ ] Create What3WordsService module
- [ ] Add UI input component
- [ ] Integrate with route calculation
- [ ] Add settings toggle
- [ ] Test with sample addresses
- [ ] Add error handling
- [ ] Monitor API usage
- [ ] Set up billing alerts

---

## 📚 Resources

- **API Docs**: https://developer.what3words.com/public-api
- **Pricing**: https://accounts.what3words.com/select-plan
- **Support**: https://support.what3words.com
- **JavaScript SDK**: https://github.com/what3words/w3w-javascript-wrapper

---

## 🎯 Recommendation

**Implement if**:
- Users request What3Words support
- You have budget for £35+/month
- Emergency services integration is priority

**Skip if**:
- Budget is limited
- Users prefer traditional addresses
- Google Plus Codes sufficient

