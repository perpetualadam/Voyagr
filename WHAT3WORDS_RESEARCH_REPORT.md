# What3Words Integration Feasibility Report for Voyagr PWA
**Date:** January 23, 2026  
**Prepared for:** Voyagr Navigation Application  
**Status:** Research Complete - Awaiting Decision

---

## Executive Summary

**Recommendation: DO NOT INTEGRATE What3Words at this time**

After comprehensive research into What3Words integration for the Voyagr PWA navigation application, I recommend **against integration** based on the following critical factors:

### Key Findings:
- ✅ **Free Tier Available**: 0 convert-to-coordinates requests (AutoSuggest only, 10 req/sec limit)
- ❌ **Paid Tier Required**: £7.99/month minimum for coordinate conversion (1,000 requests/month)
- ❌ **Vendor Lock-in**: Proprietary algorithm, no open-source alternative
- ❌ **Limited Value Proposition**: Voyagr users primarily need traditional addresses/coordinates
- ✅ **Better Alternative**: Google Plus Codes (open-source, free, no API required)

### Cost Analysis:
- **Free tier**: Insufficient for navigation (no coordinate conversion)
- **Basic tier**: £7.99/month (1,000 conversions) - likely insufficient for active users
- **Standard tier**: £35/month (10,000 conversions) - more realistic for growing user base
- **Break-even**: ~10-20 active users using What3Words addresses monthly

### Recommendation:
**Implement Google Plus Codes instead** - provides similar functionality with zero cost, no vendor lock-in, and open-source algorithm. Reserve What3Words integration for future consideration if user demand emerges.

---

## 1. API & Licensing Analysis

### 1.1 What3Words API Capabilities

What3Words provides a REST API (v3) with the following core functions:

1. **convert-to-coordinates**: Converts a 3-word address (e.g., `///filled.count.soap`) to lat/lon coordinates
2. **convert-to-3wa**: Converts coordinates to a 3-word address
3. **autosuggest**: Validates and autocorrects user input with intelligent suggestions
4. **grid-section**: Returns the 3m x 3m grid for a bounding box (for map overlays)
5. **available-languages**: Lists supported languages (54+ languages including English, Spanish, French, etc.)

**Key Features:**
- 3-meter square precision globally
- Multi-language support (54+ languages)
- AutoSuggest with geographic clipping (country, bounding box, circle, polygon)
- Focus parameter for proximity-based ranking
- Voice input support (Cerence VoCon Hybrid, NMDP-ASR, Generic Voice)
- GeoJSON output format support

