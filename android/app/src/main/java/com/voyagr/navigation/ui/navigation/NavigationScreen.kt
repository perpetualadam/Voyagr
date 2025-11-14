package com.voyagr.navigation.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.voyagr.navigation.data.models.Route
import com.voyagr.navigation.data.models.RouteCost
import com.voyagr.navigation.data.models.Vehicle
import kotlinx.coroutines.flow.StateFlow

/**
 * Main navigation screen with Google Maps integration.
 * Displays route calculation, cost breakdown, and turn-by-turn navigation.
 */
@Composable
fun NavigationScreen(
    viewModel: NavigationViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val currentRoute by viewModel.currentRoute.collectAsState()
    val routeCost by viewModel.routeCost.collectAsState()
    val selectedVehicle by viewModel.selectedVehicle.collectAsState()
    val routingMode by viewModel.routingMode.collectAsState()
    val includeTolls by viewModel.includeTolls.collectAsState()
    val includeCaz by viewModel.includeCaz.collectAsState()
    
    var startLocation by remember { mutableStateOf("") }
    var endLocation by remember { mutableStateOf("") }
    var showVehicleSelector by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }
    
    Box(modifier = Modifier.fillMaxSize()) {
        // Map placeholder (would be replaced with actual Google Maps)
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFFE8F5E9)),
            color = Color(0xFFE8F5E9)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Search Bar
                SearchBar(
                    startLocation = startLocation,
                    endLocation = endLocation,
                    onStartLocationChange = { startLocation = it },
                    onEndLocationChange = { endLocation = it },
                    onCalculateRoute = {
                        // TODO: Implement geocoding and route calculation
                        viewModel.calculateRoute(51.5074, -0.1278, 51.5174, -0.1178)
                    }
                )
                
                // Routing Mode Selector
                RoutingModeSelector(
                    currentMode = routingMode,
                    onModeSelected = { viewModel.setRoutingMode(it) }
                )
                
                // Route Information
                if (currentRoute != null) {
                    RouteInfoCard(
                        route = currentRoute!!,
                        cost = routeCost
                    )
                }
                
                // Cost Breakdown
                if (routeCost != null) {
                    CostBreakdownCard(
                        cost = routeCost!!,
                        includeTolls = includeTolls,
                        includeCaz = includeCaz,
                        onToggleTolls = { viewModel.setIncludeTolls(it) },
                        onToggleCaz = { viewModel.setIncludeCaz(it) }
                    )
                }
                
                // Vehicle Selector
                VehicleSelectorButton(
                    selectedVehicle = selectedVehicle,
                    onClick = { showVehicleSelector = true }
                )
                
                // Action Buttons
                if (currentRoute != null) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = { viewModel.startNavigation() },
                            modifier = Modifier
                                .weight(1f)
                                .height(48.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF4CAF50)
                            )
                        ) {
                            Icon(Icons.Default.Navigation, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Start")
                        }
                        
                        Button(
                            onClick = { showSettings = true },
                            modifier = Modifier
                                .weight(1f)
                                .height(48.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF2196F3)
                            )
                        ) {
                            Icon(Icons.Default.Settings, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Options")
                        }
                    }
                }
                
                // Error Message
                if (uiState is NavigationUiState.Error) {
                    ErrorCard(message = (uiState as NavigationUiState.Error).message)
                }
                
                // Loading Indicator
                if (uiState is NavigationUiState.Loading) {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.CenterHorizontally)
                    )
                }
            }
        }
    }
    
    // Vehicle Selector Dialog
    if (showVehicleSelector) {
        VehicleSelectorDialog(
            onDismiss = { showVehicleSelector = false },
            onVehicleSelected = { vehicleId ->
                viewModel.selectVehicle(vehicleId)
                showVehicleSelector = false
            }
        )
    }
}

@Composable
fun SearchBar(
    startLocation: String,
    endLocation: String,
    onStartLocationChange: (String) -> Unit,
    onEndLocationChange: (String) -> Unit,
    onCalculateRoute: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            OutlinedTextField(
                value = startLocation,
                onValueChange = onStartLocationChange,
                label = { Text("From") },
                leadingIcon = { Icon(Icons.Default.LocationOn, contentDescription = null) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            OutlinedTextField(
                value = endLocation,
                onValueChange = onEndLocationChange,
                label = { Text("To") },
                leadingIcon = { Icon(Icons.Default.LocationOn, contentDescription = null) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Button(
                onClick = onCalculateRoute,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(40.dp)
            ) {
                Text("Calculate Route")
            }
        }
    }
}

@Composable
fun RoutingModeSelector(
    currentMode: String,
    onModeSelected: (String) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        listOf("auto", "pedestrian", "bicycle").forEach { mode ->
            FilterChip(
                selected = currentMode == mode,
                onClick = { onModeSelected(mode) },
                label = { Text(mode.capitalize()) },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
fun RouteInfoCard(
    route: Route,
    cost: RouteCost?
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Route Information", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Spacer(modifier = Modifier.height(8.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("Distance: ${String.format("%.1f", route.distance / 1000)} km")
                Text("Duration: ${String.format("%.0f", route.duration / 60)} min")
            }
            
            if (cost != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Text("Total Cost: £${String.format("%.2f", cost.totalCost)}", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun CostBreakdownCard(
    cost: RouteCost,
    includeTolls: Boolean,
    includeCaz: Boolean,
    onToggleTolls: (Boolean) -> Unit,
    onToggleCaz: (Boolean) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Cost Breakdown", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Spacer(modifier = Modifier.height(8.dp))
            
            CostRow("Fuel", cost.fuelCost)
            
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Tolls: £${String.format("%.2f", cost.tollCost)}")
                Checkbox(checked = includeTolls, onCheckedChange = onToggleTolls)
            }
            
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("CAZ: £${String.format("%.2f", cost.cazCost)}")
                Checkbox(checked = includeCaz, onCheckedChange = onToggleCaz)
            }
        }
    }
}

@Composable
fun CostRow(label: String, amount: Double) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label)
        Text("£${String.format("%.2f", amount)}")
    }
}

@Composable
fun VehicleSelectorButton(
    selectedVehicle: Vehicle?,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color(0xFFFF9800)
        )
    ) {
        Icon(Icons.Default.DirectionsCar, contentDescription = null)
        Spacer(modifier = Modifier.width(8.dp))
        Text(selectedVehicle?.name ?: "Select Vehicle")
    }
}

@Composable
fun ErrorCard(message: String) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFEBEE))
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Default.Error, contentDescription = null, tint = Color(0xFFC62828))
            Text(message, color = Color(0xFFC62828))
        }
    }
}

@Composable
fun VehicleSelectorDialog(
    onDismiss: () -> Unit,
    onVehicleSelected: (Long) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Select Vehicle") },
        text = { Text("Choose a vehicle for cost calculation") },
        confirmButton = {
            Button(onClick = onDismiss) {
                Text("Close")
            }
        }
    )
}

