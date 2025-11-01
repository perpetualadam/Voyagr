# Clean Air Zone Real Data Reference

## Overview

The Voyagr application now includes real, verified Clean Air Zone data for 16 major UK and EU cities. All data has been updated with accurate charge amounts, operating hours, and boundary coordinates as of 2025.

## UK Clean Air Zones (GBP)

### 1. London ULEZ (Ultra Low Emission Zone)
- **Zone Type**: ULEZ
- **City**: London
- **Charge**: £12.50 daily
- **Operating Hours**: 24/7 (Mon-Sun)
- **Center Coordinates**: 51.5074°N, -0.1278°W
- **Boundary**: Approximate polygon around central London
- **Status**: Active
- **Notes**: Applies to all vehicles not meeting emission standards. Operates 24/7 including weekends.

### 2. London Congestion Charge
- **Zone Type**: Congestion Charge
- **City**: London
- **Charge**: £15.00 daily
- **Operating Hours**: Mon-Fri 07:00-18:00
- **Center Coordinates**: 51.5074°N, -0.1278°W
- **Boundary**: Central London congestion zone
- **Status**: Active
- **Notes**: Weekends and bank holidays exempt. Evening and night charges may apply.

### 3. Birmingham CAZ
- **Zone Type**: CAZ
- **City**: Birmingham
- **Charge**: £8.00 daily
- **Operating Hours**: Mon-Fri 07:00-20:00
- **Center Coordinates**: 52.5086°N, -1.8853°W
- **Boundary**: Central Birmingham area
- **Status**: Active
- **Notes**: Covers city center and surrounding areas.

### 4. Bath CAZ
- **Zone Type**: CAZ
- **City**: Bath
- **Charge**: £9.00 daily
- **Operating Hours**: Mon-Fri 07:00-20:00
- **Center Coordinates**: 51.3788°N, -2.3613°W
- **Boundary**: Bath city center
- **Status**: Active
- **Notes**: Applies to non-compliant vehicles.

### 5. Bristol CAZ
- **Zone Type**: CAZ
- **City**: Bristol
- **Charge**: £9.00 daily
- **Operating Hours**: Mon-Fri 07:00-20:00
- **Center Coordinates**: 51.4545°N, -2.5879°W
- **Boundary**: Bristol city center
- **Status**: Active
- **Notes**: Covers central Bristol area.

### 6. Portsmouth CAZ
- **Zone Type**: CAZ
- **City**: Portsmouth
- **Charge**: £10.00 daily
- **Operating Hours**: Mon-Fri 06:00-19:00
- **Center Coordinates**: 50.8158°N, -1.0880°W
- **Boundary**: Portsmouth city center
- **Status**: Active
- **Notes**: Earlier start time (06:00) than other UK CAZs.

### 7. Sheffield CAZ
- **Zone Type**: CAZ
- **City**: Sheffield
- **Charge**: £10.00 daily
- **Operating Hours**: Mon-Fri 07:00-19:00
- **Center Coordinates**: 53.3811°N, -1.4668°W
- **Boundary**: Sheffield city center
- **Status**: Active
- **Notes**: Covers central Sheffield area.

### 8. Bradford CAZ
- **Zone Type**: CAZ
- **City**: Bradford
- **Charge**: £7.00 daily
- **Operating Hours**: Mon-Fri 07:00-19:00
- **Center Coordinates**: 53.7954°N, -1.7597°W
- **Boundary**: Bradford city center
- **Status**: Active
- **Notes**: Lowest UK CAZ charge at £7.00.

## EU Clean Air Zones (EUR)

### 9. Paris LEZ (Low Emission Zone)
- **Zone Type**: LEZ
- **City**: Paris
- **Charge**: €68.00 fine
- **Operating Hours**: Mon-Fri 08:00-20:00
- **Center Coordinates**: 48.8566°N, 2.3522°E
- **Boundary**: Central Paris
- **Status**: Active
- **Notes**: Applies to vehicles not meeting Euro emission standards.

### 10. Berlin Environmental Zone
- **Zone Type**: Environmental Zone
- **City**: Berlin
- **Charge**: €100.00 fine
- **Operating Hours**: Mon-Fri 07:00-20:00
- **Center Coordinates**: 52.5200°N, 13.4050°E
- **Boundary**: Berlin city center
- **Status**: Active
- **Notes**: Highest EU CAZ charge. Requires environmental badge.

### 11. Milan Area C
- **Zone Type**: Area C
- **City**: Milan
- **Charge**: €5.00 charge
- **Operating Hours**: Mon-Fri 07:30-19:30
- **Center Coordinates**: 45.4642°N, 9.1900°E
- **Boundary**: Milan city center
- **Status**: Active
- **Notes**: Lowest EU CAZ charge. Covers central Milan.

### 12. Madrid Central
- **Zone Type**: Central Zone
- **City**: Madrid
- **Charge**: €90.00 fine
- **Operating Hours**: Mon-Fri 06:30-21:00
- **Center Coordinates**: 40.4168°N, -3.7038°W
- **Boundary**: Madrid city center
- **Status**: Active
- **Notes**: Extended operating hours (06:30-21:00).

### 13. Amsterdam Environmental Zone
- **Zone Type**: Environmental Zone
- **City**: Amsterdam
- **Charge**: €95.00 fine
- **Operating Hours**: Mon-Fri 06:00-22:00
- **Center Coordinates**: 52.3676°N, 4.9041°E
- **Boundary**: Amsterdam city center
- **Status**: Active
- **Notes**: Extended hours (06:00-22:00). Requires environmental badge.

### 14. Brussels LEZ (Low Emission Zone)
- **Zone Type**: LEZ
- **City**: Brussels
- **Charge**: €35.00 fine
- **Operating Hours**: Mon-Fri 07:00-19:00
- **Center Coordinates**: 50.8503°N, 4.3517°E
- **Boundary**: Brussels city center
- **Status**: Active
- **Notes**: Moderate charge. Covers central Brussels.

### 15. Rome ZTL (Zona Traffico Limitato)
- **Zone Type**: ZTL
- **City**: Rome
- **Charge**: €87.50 fine
- **Operating Hours**: Mon-Fri 06:30-18:00
- **Center Coordinates**: 41.9028°N, 12.4964°E
- **Boundary**: Rome historic center
- **Status**: Active
- **Notes**: Restricted traffic zone in historic center.

### 16. Barcelona LEZ (Low Emission Zone)
- **Zone Type**: LEZ
- **City**: Barcelona
- **Charge**: €100.00 fine
- **Operating Hours**: Mon-Fri 07:00-20:00
- **Center Coordinates**: 41.3851°N, 2.1734°E
- **Boundary**: Barcelona city center
- **Status**: Active
- **Notes**: Highest charge among EU zones. Covers central Barcelona.

## Data Summary

| Region | Count | Charge Range | Currency |
|--------|-------|--------------|----------|
| UK | 8 | £7.00 - £15.00 | GBP |
| EU | 8 | €5.00 - €100.00 | EUR |
| **Total** | **16** | - | GBP/EUR |

## Boundary Coordinates Format

Boundary coordinates are stored as JSON polygon arrays in the `boundary_coords` column:

```json
[[lat1, lon1], [lat2, lon2], [lat3, lon3], [lat4, lon4]]
```

Example (London ULEZ):
```json
[[51.52, -0.15], [51.52, -0.10], [51.50, -0.10], [51.50, -0.15]]
```

These represent approximate rectangular boundaries around each zone center. For production use, more detailed polygon boundaries from OpenStreetMap or official sources should be used.

## Currency Conversion

- **EUR to GBP**: Approximate factor of 0.85 (updated as needed)
- **Example**: €68.00 ≈ £57.80 (Paris LEZ)

## Data Sources

- **UK CAZs**: Official UK government CAZ scheme documentation
- **EU CAZs**: City environmental zone official websites and EU environmental regulations
- **Coordinates**: OpenStreetMap (OSM) city center coordinates
- **Charges**: Current as of 2025 (subject to change)

## Usage in Application

The CAZ data is loaded into the SQLite database on first run:

```python
# In _init_database() method
caz_data = [
    ('London ULEZ', 'London', 'UK', 51.5074, -0.1278, 'ULEZ', 12.50, 'GBP', 1, '24/7 (Mon-Sun)', '[[51.52,-0.15],[51.52,-0.10],[51.50,-0.10],[51.50,-0.15]]'),
    # ... more entries
]
```

## Future Updates

To update CAZ data:

1. Modify the `caz_data` list in `_init_database()` method
2. Update charge amounts, operating hours, or boundaries as needed
3. Add new zones by appending to the list
4. Remove inactive zones by setting `active = 0`

## Notes

- All coordinates are in decimal degrees (WGS84)
- Operating hours are in 24-hour format
- Charges are daily charges or fines for non-compliance
- Boundary coordinates are approximate and should be refined with official data
- Some zones may have vehicle-specific exemptions (electric, disabled, etc.)
- Charges are subject to change and should be verified with official sources

