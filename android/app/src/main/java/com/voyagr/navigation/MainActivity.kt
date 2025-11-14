package com.voyagr.navigation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.voyagr.navigation.ui.navigation.NavigationScreen
import com.voyagr.navigation.ui.theme.VoyagrTheme
import dagger.hilt.android.AndroidEntryPoint
import timber.log.Timber

/**
 * Main activity for Voyagr navigation app.
 * Entry point for the application.
 *
 * Features:
 * - Route calculation with multiple routing engines (Valhalla, GraphHopper, OSRM)
 * - Cost estimation (fuel, toll, CAZ)
 * - Vehicle profile management
 * - Turn-by-turn navigation
 * - Trip history and analytics
 * - Offline support
 * - Multiple routing modes (auto, pedestrian, bicycle)
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize Timber logging
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }

        Timber.d("MainActivity created - Voyagr Navigation App starting")

        setContent {
            VoyagrTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    // Main navigation screen with all features
                    NavigationScreen()
                }
            }
        }
    }
}

