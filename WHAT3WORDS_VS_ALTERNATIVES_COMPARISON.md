# What3Words vs Alternatives - Detailed Comparison

**Date**: 2026-01-23  
**Purpose**: Help decide on location addressing system for Voyagr

---

## 📊 Feature Comparison Matrix

| Feature | What3Words | Google Plus Codes | OpenLocationCode | Traditional Address |
|---------|-----------|------------------|------------------|-------------------|
| **Cost** | £7.99-£235/mo | FREE | FREE | FREE |
| **Memorable** | ✅ Yes (3 words) | ⚠️ Partial (10 chars) | ⚠️ Partial (10 chars) | ❌ No (long) |
| **Global Coverage** | ✅ Yes (54+ languages) | ✅ Yes | ✅ Yes | ⚠️ Varies by region |
| **Precision** | ✅ 3m x 3m | ✅ 3m x 3m | ✅ 3m x 3m | ⚠️ Varies |
| **API Required** | ✅ Yes | ✅ Yes | ❌ No (offline) | ✅ Yes |
| **Vendor Lock-in** | ❌ High | ⚠️ Medium | ✅ None (open) | ✅ None |
| **Emergency Services** | ✅ Integrated | ❌ No | ❌ No | ✅ Yes |
| **Offline Support** | ❌ No | ❌ No | ✅ Yes | ❌ No |
| **Implementation** | Medium | Medium | Easy | Easy |

---

## 🔍 Detailed Analysis

### What3Words
**Pros**:
- ✅ Most memorable format (3 words)
- ✅ Emergency services partnerships (UK, US, etc.)
- ✅ 54+ language support
- ✅ Professional branding

**Cons**:
- ❌ Monthly cost (£7.99-£235)
- ❌ Proprietary algorithm (vendor lock-in)
- ❌ Requires API calls
- ❌ Free tier insufficient (AutoSuggest only)

**Best For**: Emergency services, delivery companies, premium apps

---

### Google Plus Codes
**Pros**:
- ✅ Completely FREE
- ✅ Google backing (reliable)
- ✅ Works offline (with local data)
- ✅ 10-character code (memorable enough)
- ✅ No vendor lock-in

**Cons**:
- ⚠️ Less memorable than What3Words
- ⚠️ Requires Google Maps API for full features
- ⚠️ Less emergency services integration

**Best For**: Budget-conscious apps, offline-first apps

---

### OpenLocationCode (OLC)
**Pros**:
- ✅ Completely FREE
- ✅ Open-source algorithm
- ✅ Works offline (no API needed)
- ✅ No vendor lock-in
- ✅ Lightweight implementation

**Cons**:
- ⚠️ Less memorable (10 characters)
- ⚠️ Less brand recognition
- ⚠️ Smaller community

**Best For**: Open-source projects, privacy-focused apps

---

### Traditional Addresses
**Pros**:
- ✅ Familiar to users
- ✅ Works with emergency services
- ✅ Widely supported

**Cons**:
- ❌ Long and hard to remember
- ❌ Varies by country
- ❌ Ambiguous in some regions

**Best For**: General navigation (already implemented in Voyagr)

---

## 💰 Cost-Benefit Analysis

### Scenario 1: Small User Base (1-10 users)
**Recommendation**: Skip What3Words
- Cost: £7.99/month minimum
- Benefit: Minimal (few users)
- ROI: Negative

**Alternative**: Use Google Plus Codes (free)

### Scenario 2: Growing App (10-50 users)
**Recommendation**: Consider What3Words Basic
- Cost: £7.99/month (1,000 conversions)
- Benefit: Professional feature, emergency integration
- ROI: Positive if users value it

**Alternative**: Google Plus Codes still viable

### Scenario 3: Large User Base (50+ users)
**Recommendation**: What3Words Standard
- Cost: £35/month (10,000 conversions)
- Benefit: Premium feature, emergency services
- ROI: Positive with active users

**Alternative**: Hybrid approach (What3Words + Plus Codes)

---

## 🎯 Recommendation for Voyagr

### Current Status
- ✅ Traditional address search: Working
- ✅ Coordinate input: Working
- ❌ What3Words: Not implemented
- ❌ Plus Codes: Not implemented

### Recommended Path

**Phase 1 (Now)**: Implement Google Plus Codes
- Cost: FREE
- Effort: 4-6 hours
- Benefit: Memorable addresses without cost
- No vendor lock-in

**Phase 2 (Later)**: Add What3Words if needed
- Cost: £35/month (Standard plan)
- Effort: 4-6 hours
- Benefit: Emergency services integration
- Only if user demand exists

**Phase 3 (Optional)**: Hybrid approach
- Support both Plus Codes and What3Words
- Let users choose preference
- Best of both worlds

---

## 📋 Implementation Priority

| Priority | Feature | Effort | Cost | Impact |
|----------|---------|--------|------|--------|
| 1 | Keep Traditional Addresses | Done | FREE | High |
| 2 | Add Google Plus Codes | 4-6h | FREE | Medium |
| 3 | Add What3Words | 4-6h | £35/mo | Medium |
| 4 | Emergency Integration | 2-4h | Varies | High |

---

## ✅ Decision Framework

**Choose What3Words if**:
- ✅ Emergency services integration is critical
- ✅ Budget allows £35+/month
- ✅ Users specifically request it
- ✅ Premium positioning important

**Choose Google Plus Codes if**:
- ✅ Budget is limited
- ✅ Offline support needed
- ✅ Open-source preference
- ✅ Sufficient for user needs

**Choose Both if**:
- ✅ Resources available
- ✅ Want maximum flexibility
- ✅ Premium + budget-conscious users

---

## 🚀 Next Steps

1. **Decide**: What3Words, Plus Codes, or both?
2. **Implement**: Start with chosen solution
3. **Test**: Verify with sample locations
4. **Monitor**: Track usage and costs
5. **Iterate**: Add more features based on feedback

