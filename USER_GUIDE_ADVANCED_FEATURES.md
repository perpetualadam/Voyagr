# Voyagr Advanced Features - User Guide

## Table of Contents
1. Machine Learning Features
2. Vehicle Management
3. EV Charging Integration
4. Maintenance Tracking
5. Tips & Best Practices

---

## 1. Machine Learning Features

### What is Machine Learning in Voyagr?

Voyagr now learns from your driving patterns to provide:
- **Personalized route recommendations** based on your preferences
- **Accurate cost predictions** for your trips
- **Traffic forecasts** to help you plan departures
- **Efficiency insights** to optimize fuel/energy consumption

### Getting Started with ML

#### Step 1: Enable ML Features
```
Settings → Advanced → Machine Learning → Enable
```

#### Step 2: Build Your Profile
- Drive at least 10 trips for route learning
- Drive at least 15 trips for efficiency learning
- Drive at least 20 trips for traffic learning

#### Step 3: Train Models
```
Settings → Advanced → Machine Learning → Train Models
```

This takes 1-2 minutes and happens automatically weekly.

---

### Feature 1: Route Prediction

**What it does**: Learns your preferred routes and recommends the best option

**How to use**:
1. Enter start and end locations
2. Tap "Get ML Recommendation"
3. View recommended route with reason (e.g., "Time-conscious choice")

**Example**:
- You usually prefer faster routes
- ML learns this pattern
- Next time, it recommends the fastest route first

**Tips**:
- More trips = better recommendations
- Preferences are learned from your actual choices
- You can override recommendations anytime

---

### Feature 2: Cost Prediction

**What it does**: Predicts trip costs and identifies savings opportunities

**How to use**:
1. Enter trip details (distance, duration)
2. Tap "Predict Cost"
3. View predicted cost with confidence level

**Example**:
- Trip: 100 km, 2 hours
- Prediction: £25.50 (±£2.30)
- Confidence: 82%

**Budget Tracking**:
```
Settings → Budget → Set Monthly Budget (e.g., £500)
```

View budget status:
- Spent: £320
- Remaining: £180
- Status: On track ✓

**Savings Opportunities**:
- ML identifies routes that save >5%
- Suggests off-peak travel times
- Recommends alternative routes

---

### Feature 3: Traffic Prediction

**What it does**: Predicts traffic conditions 1-2 hours ahead

**How to use**:
1. Enter location and time
2. Tap "Check Traffic Forecast"
3. View predicted congestion level

**Congestion Levels**:
- 🟢 Light: >40 km/h average speed
- 🟡 Moderate: 20-40 km/h average speed
- 🔴 Heavy: <20 km/h average speed

**Departure Time Recommendation**:
- ML analyzes historical patterns
- Suggests optimal departure time
- Example: "Leave at 7:30 AM for light traffic"

**Incident Hotspots**:
- View high-risk areas for accidents
- Avoid problematic locations
- Plan alternative routes

---

### Feature 4: Efficiency Prediction

**What it does**: Predicts fuel/energy consumption and detects problems

**How to use**:
1. Enter trip details
2. Tap "Predict Efficiency"
3. View predicted consumption

**Example (Petrol Car)**:
- Trip: 100 km
- Predicted: 7.5 L/100km
- Confidence: 82%

**Example (Electric Car)**:
- Trip: 100 km
- Predicted: 18 kWh/100km
- Confidence: 85%

**Efficiency Degradation**:
- ML detects if efficiency drops >10%
- Alerts you to potential issues
- Suggests maintenance checks

**Cost Forecasting**:
- Weekly cost forecast
- Monthly cost forecast
- Fuel price impact analysis

---

## 2. Vehicle Management

### Adding a Vehicle

**Step 1**: Open Settings
```
Settings → Vehicles → Add Vehicle
```

**Step 2**: Enter Vehicle Details
- Name: "Tesla Model 3"
- Type: Electric
- Efficiency: 20 kWh/100km
- Electricity Price: £0.25/kWh

**Step 3**: Save
```
Tap "Create Vehicle"
```

### Supported Vehicle Types

| Type | Efficiency Unit | Example |
|------|-----------------|---------|
| Petrol/Diesel | L/100km | 7.5 L/100km |
| Electric | kWh/100km | 18 kWh/100km |
| Hybrid | L/100km | 5.0 L/100km |
| Motorcycle | L/100km | 3.5 L/100km |
| Truck | L/100km | 25 L/100km |
| Van | L/100km | 12 L/100km |

### Switching Vehicles

**Quick Switch**:
```
Main Screen → Vehicle Selector → Choose Vehicle
```

**Settings**:
```
Settings → Vehicles → Select Vehicle → Switch
```

### Vehicle Statistics

View per-vehicle statistics:
```
Settings → Vehicles → Select Vehicle → Statistics
```

Shows:
- Total trips
- Total distance
- Total cost
- Average efficiency
- Average trip duration

---

## 3. EV Charging Integration

### Finding Charging Stations

**Step 1**: Tap "Find Charging"
```
Main Screen → Charging → Find Nearby
```

**Step 2**: View Nearby Stations
- Distance to station
- Connector types available
- Power rating (kW)
- Cost per kWh
- Availability

**Step 3**: Navigate to Station
```
Tap Station → Navigate
```

### Recording Charging Sessions

**Step 1**: Start Charging
```
Charging → Record Session
```

**Step 2**: Enter Details
- Station name
- kWh charged: 50
- Cost: £15.00

**Step 3**: Save
```
Tap "Record"
```

### Charging Statistics

View charging history:
```
Settings → Vehicles → Select Vehicle → Charging History
```

Shows:
- Total sessions
- Total kWh charged
- Total cost
- Average cost per kWh
- Last charging date

### Charging Time Calculator

**Calculate charging time**:
```
Charging → Calculate Time
```

Enter:
- Current battery: 20%
- Target battery: 80%
- Charger power: 50 kW
- Battery capacity: 75 kWh

Result:
- Charging time: 54 minutes
- Cost estimate: £15.00

---

## 4. Maintenance Tracking

### Adding Maintenance Records

**Step 1**: Open Maintenance
```
Settings → Vehicles → Select Vehicle → Maintenance
```

**Step 2**: Add Record
```
Tap "Add Record"
```

**Step 3**: Enter Details
- Service type: Oil Change
- Date: Today
- Mileage: 50,000 km
- Cost: £45.00
- Notes: Regular oil change

**Step 4**: Save
```
Tap "Save"
```

### Service Types & Intervals

| Service | Time | Mileage | Cost |
|---------|------|---------|------|
| Oil Change | 6 months | 10,000 km | £40-60 |
| Tire Rotation | 12 months | 20,000 km | £50-80 |
| Air Filter | 12 months | 20,000 km | £30-50 |
| Cabin Filter | 12 months | 20,000 km | £25-40 |
| Brake Inspection | 12 months | 30,000 km | £60-100 |
| Battery Check | 12 months | 40,000 km | £50-80 |
| Coolant Flush | 24 months | 40,000 km | £80-120 |
| Transmission Fluid | 24 months | 60,000 km | £100-150 |
| Spark Plugs | 24 months | 60,000 km | £80-120 |
| Suspension Inspection | 24 months | 80,000 km | £100-150 |

### Maintenance Reminders

**View Pending Reminders**:
```
Settings → Vehicles → Select Vehicle → Reminders
```

Shows:
- Service type
- Due date
- Due mileage
- Status (pending/completed)

**Complete Reminder**:
```
Tap Reminder → Mark Complete
```

**Generate Reminders**:
```
Settings → Vehicles → Select Vehicle → Generate Reminders
```

Automatically creates reminders based on:
- Current mileage
- Last service date
- Standard intervals

### Maintenance Costs

View maintenance costs:
```
Settings → Vehicles → Select Vehicle → Costs
```

Shows:
- Total maintenance cost
- Cost by service type
- Average cost per service
- Cost trends

---

## 5. Tips & Best Practices

### Maximizing ML Accuracy

1. **Drive Regularly**: More trips = better predictions
2. **Consistent Patterns**: ML learns from your habits
3. **Update Prices**: Keep fuel/electricity prices current
4. **Train Monthly**: Retrain models monthly for best results
5. **Provide Feedback**: Rate recommendations to improve learning

### Optimizing Costs

1. **Check Predictions**: Review cost forecasts before trips
2. **Use Savings Tips**: Follow ML recommendations
3. **Track Budget**: Monitor spending against budget
4. **Off-Peak Travel**: Travel during light traffic times
5. **Efficient Routes**: Choose recommended routes

### EV Charging Tips

1. **Plan Ahead**: Check charging stations before long trips
2. **Charge Off-Peak**: Charge during low-demand hours
3. **Track Sessions**: Record all charging for accurate costs
4. **Compare Prices**: Use nearby stations with lower costs
5. **Battery Health**: Avoid frequent fast charging

### Vehicle Maintenance

1. **Regular Checks**: Follow recommended intervals
2. **Keep Records**: Document all maintenance
3. **Monitor Efficiency**: Track fuel/energy consumption
4. **Address Issues**: Fix problems early
5. **Plan Ahead**: Schedule maintenance before due dates

### Privacy & Data

- All ML models train locally on your device
- No personal data sent to external servers
- You control what data is stored
- Delete data anytime in Settings

---

## Troubleshooting

### ML Features Not Working

**Problem**: "Insufficient data for predictions"
- **Solution**: Complete at least 10-20 trips first

**Problem**: "Model training failed"
- **Solution**: Check database integrity, restart app

**Problem**: "Predictions seem inaccurate"
- **Solution**: Retrain models, provide more trip data

### Vehicle Issues

**Problem**: "Can't switch vehicles"
- **Solution**: Ensure vehicle exists, check database

**Problem**: "Charging stations not found"
- **Solution**: Check internet connection, try different location

**Problem**: "Maintenance reminders not showing"
- **Solution**: Generate reminders, check vehicle mileage

---

## Support

For issues or questions:
1. Check this guide
2. Review ADVANCED_QUICK_REFERENCE.md
3. Check app logs for errors
4. Contact support with error details

---

## Next Steps

1. ✓ Add your vehicles
2. ✓ Complete 10+ trips for ML training
3. ✓ Train ML models
4. ✓ Set budget and track costs
5. ✓ Record maintenance and charging
6. ✓ Review recommendations and statistics

Enjoy smarter navigation with Voyagr! 🚗

