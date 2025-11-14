package com.voyagr.navigation.ui.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voyagr.navigation.data.models.Route
import com.voyagr.navigation.data.models.RouteCost
import com.voyagr.navigation.data.models.Vehicle
import com.voyagr.navigation.data.repository.TripRepository
import com.voyagr.navigation.data.repository.VehicleRepository
import com.voyagr.navigation.network.services.RoutingService
import com.voyagr.navigation.utils.CostCalculator
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * ViewModel for main navigation screen.
 * Handles route calculation, cost estimation, and navigation state.
 */
@HiltViewModel
class NavigationViewModel @Inject constructor(
    private val routingService: RoutingService,
    private val tripRepository: TripRepository,
    private val vehicleRepository: VehicleRepository
) : ViewModel() {
    
    // UI State
    private val _uiState = MutableStateFlow<NavigationUiState>(NavigationUiState.Idle)
    val uiState: StateFlow<NavigationUiState> = _uiState.asStateFlow()
    
    // Route State
    private val _currentRoute = MutableStateFlow<Route?>(null)
    val currentRoute: StateFlow<Route?> = _currentRoute.asStateFlow()
    
    // Cost State
    private val _routeCost = MutableStateFlow<RouteCost?>(null)
    val routeCost: StateFlow<RouteCost?> = _routeCost.asStateFlow()
    
    // Vehicle State
    private val _selectedVehicle = MutableStateFlow<Vehicle?>(null)
    val selectedVehicle: StateFlow<Vehicle?> = _selectedVehicle.asStateFlow()

    // Routing Mode State
    private val _routingMode = MutableStateFlow("auto")
    val routingMode: StateFlow<String> = _routingMode.asStateFlow()

    // Location State
    private val _currentLocation = MutableStateFlow<Pair<Double, Double>?>(null)
    val currentLocation: StateFlow<Pair<Double, Double>?> = _currentLocation.asStateFlow()

    // Route Preferences
    private val _includeTolls = MutableStateFlow(true)
    val includeTolls: StateFlow<Boolean> = _includeTolls.asStateFlow()

    private val _includeCaz = MutableStateFlow(true)
    val includeCaz: StateFlow<Boolean> = _includeCaz.asStateFlow()

    /**
     * Update current location from GPS.
     */
    fun updateLocation(lat: Double, lon: Double) {
        _currentLocation.value = Pair(lat, lon)
    }

    /**
     * Set routing mode (auto, pedestrian, bicycle).
     */
    fun setRoutingMode(mode: String) {
        _routingMode.value = mode
    }

    /**
     * Toggle toll inclusion in cost calculation.
     */
    fun setIncludeTolls(include: Boolean) {
        _includeTolls.value = include
        // Recalculate cost
        recalculateCost()
    }

    /**
     * Toggle CAZ inclusion in cost calculation.
     */
    fun setIncludeCaz(include: Boolean) {
        _includeCaz.value = include
        // Recalculate cost
        recalculateCost()
    }

    /**
     * Recalculate cost with current preferences.
     */
    private fun recalculateCost() {
        viewModelScope.launch {
            try {
                _currentRoute.value?.let { route ->
                    _selectedVehicle.value?.let { vehicle ->
                        val cost = CostCalculator.calculateRouteCost(
                            distanceKm = route.distance / 1000.0,
                            vehicle = vehicle,
                            includeTolls = _includeTolls.value,
                            includeCaz = _includeCaz.value
                        )
                        _routeCost.value = cost
                    }
                }
            } catch (e: Exception) {
                Timber.e("Error recalculating cost: ${e.message}")
            }
        }
    }

    /**
     * Calculate route between two points.
     */
    fun calculateRoute(
        startLat: Double,
        startLon: Double,
        endLat: Double,
        endLon: Double,
        routingMode: String? = null
    ) {
        viewModelScope.launch {
            try {
                _uiState.value = NavigationUiState.Loading

                val mode = routingMode ?: _routingMode.value
                Timber.d("Calculating route from ($startLat,$startLon) to ($endLat,$endLon) in $mode mode")

                val route = routingService.calculateRoute(
                    startLat, startLon, endLat, endLon, mode
                )

                if (route != null) {
                    _currentRoute.value = route

                    // Calculate cost if vehicle is selected
                    _selectedVehicle.value?.let { vehicle ->
                        val cost = CostCalculator.calculateRouteCost(
                            distanceKm = route.distance / 1000.0,
                            vehicle = vehicle,
                            includeTolls = _includeTolls.value,
                            includeCaz = _includeCaz.value
                        )
                        _routeCost.value = cost
                    }

                    _uiState.value = NavigationUiState.RouteCalculated
                } else {
                    _uiState.value = NavigationUiState.Error("Failed to calculate route")
                }
            } catch (e: Exception) {
                Timber.e("Error calculating route: ${e.message}")
                _uiState.value = NavigationUiState.Error(e.message ?: "Unknown error")
            }
        }
    }
    
    /**
     * Select a vehicle for cost calculation.
     */
    fun selectVehicle(vehicleId: Long) {
        viewModelScope.launch {
            try {
                val vehicle = vehicleRepository.getVehicleById(vehicleId)
                if (vehicle != null) {
                    _selectedVehicle.value = vehicle
                    
                    // Recalculate cost with new vehicle
                    _currentRoute.value?.let { route ->
                        val cost = CostCalculator.calculateRouteCost(
                            distanceKm = route.distance / 1000.0,
                            vehicle = vehicle
                        )
                        _routeCost.value = cost
                    }
                }
            } catch (e: Exception) {
                Timber.e("Error selecting vehicle: ${e.message}")
            }
        }
    }
    
    /**
     * Start navigation with current route.
     */
    fun startNavigation() {
        _uiState.value = NavigationUiState.NavigationStarted
    }
    
    /**
     * Stop navigation.
     */
    fun stopNavigation() {
        _uiState.value = NavigationUiState.Idle
        _currentRoute.value = null
        _routeCost.value = null
    }
    
    /**
     * Clear current route.
     */
    fun clearRoute() {
        _currentRoute.value = null
        _routeCost.value = null
        _uiState.value = NavigationUiState.Idle
    }
}

/**
 * UI state for navigation screen.
 */
sealed class NavigationUiState {
    object Idle : NavigationUiState()
    object Loading : NavigationUiState()
    object RouteCalculated : NavigationUiState()
    object NavigationStarted : NavigationUiState()
    data class Error(val message: String) : NavigationUiState()
}

