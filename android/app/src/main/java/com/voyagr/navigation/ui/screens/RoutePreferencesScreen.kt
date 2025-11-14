package com.voyagr.navigation.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import timber.log.Timber

/**
 * Route preferences screen for advanced route options.
 * Allows users to customize route calculation preferences.
 */
@Composable
fun RoutePreferencesScreen(
    modifier: Modifier = Modifier,
    onPreferencesChanged: (RoutePreferences) -> Unit = {}
) {
    var avoidHighways by remember { mutableStateOf(false) }
    var avoidTolls by remember { mutableStateOf(false) }
    var avoidFerries by remember { mutableStateOf(false) }
    var avoidUnpavedRoads by remember { mutableStateOf(false) }
    var preferScenicRoutes by remember { mutableStateOf(false) }
    var preferQuietRoads by remember { mutableStateOf(false) }
    var routeOptimization by remember { mutableStateOf(0.5f) }  // 0 = shortest, 1 = fastest
    var selectedPreset by remember { mutableStateOf("fastest") }
    
    val scrollState = rememberScrollState()
    
    LaunchedEffect(
        avoidHighways, avoidTolls, avoidFerries, avoidUnpavedRoads,
        preferScenicRoutes, preferQuietRoads, routeOptimization
    ) {
        val preferences = RoutePreferences(
            avoidHighways = avoidHighways,
            avoidTolls = avoidTolls,
            avoidFerries = avoidFerries,
            avoidUnpavedRoads = avoidUnpavedRoads,
            preferScenicRoutes = preferScenicRoutes,
            preferQuietRoads = preferQuietRoads,
            routeOptimization = routeOptimization,
            preset = selectedPreset
        )
        onPreferencesChanged(preferences)
    }
    
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp)
    ) {
        // Title
        Text(
            text = "Route Preferences",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(bottom = 16.dp)
        )
        
        // Preset buttons
        Text(
            text = "Quick Presets",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            PresetButton(
                label = "Fastest",
                selected = selectedPreset == "fastest",
                onClick = {
                    selectedPreset = "fastest"
                    avoidHighways = false
                    avoidTolls = false
                    avoidFerries = false
                    avoidUnpavedRoads = false
                    preferScenicRoutes = false
                    preferQuietRoads = false
                    routeOptimization = 1.0f
                },
                modifier = Modifier.weight(1f)
            )
            
            PresetButton(
                label = "Shortest",
                selected = selectedPreset == "shortest",
                onClick = {
                    selectedPreset = "shortest"
                    routeOptimization = 0.0f
                },
                modifier = Modifier.weight(1f)
            )
            
            PresetButton(
                label = "Scenic",
                selected = selectedPreset == "scenic",
                onClick = {
                    selectedPreset = "scenic"
                    preferScenicRoutes = true
                    preferQuietRoads = true
                    routeOptimization = 0.5f
                },
                modifier = Modifier.weight(1f)
            )
        }
        
        Divider(modifier = Modifier.padding(vertical = 16.dp))
        
        // Route optimization slider
        Text(
            text = "Route Optimization",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text("Shortest", style = MaterialTheme.typography.labelSmall)
            Slider(
                value = routeOptimization,
                onValueChange = {
                    routeOptimization = it
                    selectedPreset = "custom"
                },
                modifier = Modifier.weight(1f)
            )
            Text("Fastest", style = MaterialTheme.typography.labelSmall)
        }
        
        Divider(modifier = Modifier.padding(vertical = 16.dp))
        
        // Avoidance options
        Text(
            text = "Avoid",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        
        PreferenceToggle(
            label = "Highways/Motorways",
            checked = avoidHighways,
            onCheckedChange = {
                avoidHighways = it
                selectedPreset = "custom"
            }
        )
        
        PreferenceToggle(
            label = "Toll Roads",
            checked = avoidTolls,
            onCheckedChange = {
                avoidTolls = it
                selectedPreset = "custom"
            }
        )
        
        PreferenceToggle(
            label = "Ferries",
            checked = avoidFerries,
            onCheckedChange = {
                avoidFerries = it
                selectedPreset = "custom"
            }
        )
        
        PreferenceToggle(
            label = "Unpaved Roads",
            checked = avoidUnpavedRoads,
            onCheckedChange = {
                avoidUnpavedRoads = it
                selectedPreset = "custom"
            }
        )
        
        Divider(modifier = Modifier.padding(vertical = 16.dp))
        
        // Preference options
        Text(
            text = "Prefer",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        
        PreferenceToggle(
            label = "Scenic Routes",
            checked = preferScenicRoutes,
            onCheckedChange = {
                preferScenicRoutes = it
                selectedPreset = "custom"
            }
        )
        
        PreferenceToggle(
            label = "Quiet Roads (Low Traffic)",
            checked = preferQuietRoads,
            onCheckedChange = {
                preferQuietRoads = it
                selectedPreset = "custom"
            }
        )
    }
}

@Composable
private fun PresetButton(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Button(
        onClick = onClick,
        modifier = modifier.height(40.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (selected) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun PreferenceToggle(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange
        )
    }
}

/**
 * Data class for route preferences.
 */
data class RoutePreferences(
    val avoidHighways: Boolean = false,
    val avoidTolls: Boolean = false,
    val avoidFerries: Boolean = false,
    val avoidUnpavedRoads: Boolean = false,
    val preferScenicRoutes: Boolean = false,
    val preferQuietRoads: Boolean = false,
    val routeOptimization: Float = 1.0f,  // 0 = shortest, 1 = fastest
    val preset: String = "fastest"
)

