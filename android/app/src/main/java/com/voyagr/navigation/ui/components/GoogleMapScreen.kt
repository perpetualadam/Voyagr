package com.voyagr.navigation.ui.components

import android.location.Location
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MarkerOptions
import com.google.maps.android.compose.*
import com.voyagr.navigation.data.models.Route
import com.voyagr.navigation.utils.MapHelper
import com.voyagr.navigation.utils.TrafficHelper
import timber.log.Timber

/**
 * Google Maps composable for displaying routes and navigation.
 * Handles map rendering, polylines, markers, and camera updates.
 */
@Composable
fun GoogleMapScreen(
    modifier: Modifier = Modifier,
    currentLocation: Location? = null,
    route: Route? = null,
    startLat: Double? = null,
    startLon: Double? = null,
    endLat: Double? = null,
    endLon: Double? = null,
    trafficSegments: List<TrafficHelper.TrafficSegment> = emptyList(),
    trafficIncidents: List<TrafficHelper.TrafficIncident> = emptyList(),
    onMapReady: () -> Unit = {},
    onMarkerClick: (String) -> Unit = {}
) {
    val mapHelper = remember { MapHelper() }
    var showTraffic by remember { mutableStateOf(true) }
    var mapProperties by remember {
        mutableStateOf(
            MapProperties(
                isMyLocationEnabled = true,
                mapType = com.google.android.gms.maps.model.MapType.NORMAL
            )
        )
    }
    
    var cameraPositionState by remember {
        mutableStateOf(
            CameraPositionState(
                position = CameraPosition.Builder()
                    .target(LatLng(51.5074, -0.1278))  // Default: London
                    .zoom(15f)
                    .build()
            )
        )
    }
    
    // Update camera when current location changes
    LaunchedEffect(currentLocation) {
        currentLocation?.let {
            val newPosition = CameraPosition.Builder()
                .target(LatLng(it.latitude, it.longitude))
                .zoom(MapHelper.DEFAULT_ZOOM)
                .bearing(it.bearing)
                .build()
            cameraPositionState.animate(newPosition)
        }
    }
    
    // Update camera when route is calculated
    LaunchedEffect(route) {
        if (route != null && startLat != null && startLon != null && endLat != null && endLon != null) {
            try {
                val bounds = mapHelper.calculateRouteBounds(startLat, startLon, endLat, endLon)
                val cameraUpdate = CameraUpdateFactory.newLatLngBounds(bounds, 100)
                cameraPositionState.animate(cameraUpdate)
            } catch (e: Exception) {
                Timber.e("Error updating camera for route: ${e.message}")
            }
        }
    }
    
    Box(modifier = modifier.fillMaxSize()) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = mapProperties,
            onMapLoaded = onMapReady,
            uiSettings = MapUiSettings(
                zoomControlsEnabled = true,
                myLocationButtonEnabled = true,
                compassEnabled = true,
                mapToolbarEnabled = true,
                rotationGesturesEnabled = true,
                scrollGesturesEnabled = true,
                tiltGesturesEnabled = true,
                zoomGesturesEnabled = true
            )
        ) {
            // Render route polyline
            route?.let { r ->
                try {
                    val polylineOptions = mapHelper.createRoutePolyline(r.geometry)
                    Polyline(
                        points = polylineOptions.points,
                        color = polylineOptions.color,
                        width = polylineOptions.width,
                        clickable = true,
                        onClick = { onMarkerClick("route") }
                    )
                } catch (e: Exception) {
                    Timber.e("Error rendering route polyline: ${e.message}")
                }
            }

            // Render traffic segments if enabled
            if (showTraffic && trafficSegments.isNotEmpty()) {
                trafficSegments.forEach { segment ->
                    try {
                        val trafficHelper = TrafficHelper(null)
                        val color = trafficHelper.getTrafficLevelColor(segment.level)
                        Polyline(
                            points = listOf(
                                LatLng(segment.startLat, segment.startLon),
                                LatLng(segment.endLat, segment.endLon)
                            ),
                            color = color,
                            width = 8f,
                            clickable = true,
                            onClick = { onMarkerClick("traffic") }
                        )
                    } catch (e: Exception) {
                        Timber.e("Error rendering traffic segment: ${e.message}")
                    }
                }
            }

            // Render traffic incident markers if enabled
            if (showTraffic && trafficIncidents.isNotEmpty()) {
                trafficIncidents.forEach { incident ->
                    Marker(
                        state = MarkerState(position = LatLng(incident.latitude, incident.longitude)),
                        title = incident.type.replaceFirstChar { it.uppercase() },
                        snippet = incident.description,
                        onClick = { onMarkerClick("incident"); false }
                    )
                }
            }

            // Start marker
            if (startLat != null && startLon != null) {
                Marker(
                    state = MarkerState(position = LatLng(startLat, startLon)),
                    title = "Start",
                    snippet = "Route start point",
                    onClick = { onMarkerClick("start"); false }
                )
            }

            // End marker
            if (endLat != null && endLon != null) {
                Marker(
                    state = MarkerState(position = LatLng(endLat, endLon)),
                    title = "Destination",
                    snippet = "Route end point",
                    onClick = { onMarkerClick("end"); false }
                )
            }

            // Current location marker
            currentLocation?.let {
                Marker(
                    state = MarkerState(position = LatLng(it.latitude, it.longitude)),
                    title = "Current Location",
                    snippet = "Your current position",
                    onClick = { onMarkerClick("current"); false }
                )
            }
        }

        // Traffic toggle button
        IconButton(
            onClick = { showTraffic = !showTraffic },
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(16.dp)
        ) {
            Icon(
                imageVector = if (showTraffic) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                contentDescription = if (showTraffic) "Hide traffic" else "Show traffic"
            )
        }

        // Loading indicator
        if (route == null && startLat != null) {
            CircularProgressIndicator(
                modifier = Modifier.align(Alignment.Center)
            )
        }
    }
}

/**
 * Map style selector for switching between map types.
 */
@Composable
fun MapStyleSelector(
    currentStyle: Int,
    onStyleChange: (Int) -> Unit
) {
    val styles = listOf("Standard", "Satellite", "Terrain")
    
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        styles.forEachIndexed { index, style ->
            FilterChip(
                selected = currentStyle == index,
                onClick = { onStyleChange(index) },
                label = { Text(style) }
            )
        }
    }
}

/**
 * Camera animation helper for smooth transitions.
 */
suspend fun CameraPositionState.animate(cameraPosition: CameraPosition) {
    try {
        animate(
            update = CameraUpdateFactory.newCameraPosition(cameraPosition),
            durationMs = MapHelper.CAMERA_ANIMATION_DURATION
        )
    } catch (e: Exception) {
        Timber.e("Error animating camera: ${e.message}")
    }
}

/**
 * Camera animation helper for bounds.
 */
suspend fun CameraPositionState.animate(cameraUpdate: com.google.android.gms.maps.CameraUpdate) {
    try {
        animate(
            update = cameraUpdate,
            durationMs = MapHelper.CAMERA_ANIMATION_DURATION
        )
    } catch (e: Exception) {
        Timber.e("Error animating camera to bounds: ${e.message}")
    }
}

