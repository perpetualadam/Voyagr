package com.voyagr.navigation.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.voyagr.navigation.utils.MapBoxHelper
import com.voyagr.navigation.utils.OfflineMapManager
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * Offline Map Screen for downloading and managing offline map regions.
 * Allows users to select regions, download tiles, and manage storage.
 */
@Composable
fun OfflineMapScreen(
    modifier: Modifier = Modifier,
    mapBoxHelper: MapBoxHelper? = null,
    offlineMapManager: OfflineMapManager? = null,
    onNavigateBack: () -> Unit = {}
) {
    val scope = rememberCoroutineScope()
    var selectedRegion by remember { mutableStateOf("London") }
    var downloadProgress by remember { mutableStateOf(0) }
    var isDownloading by remember { mutableStateOf(false) }
    var downloadedRegions by remember { mutableStateOf(listOf<String>()) }
    var availableStorage by remember { mutableStateOf(0L) }
    var estimatedSize by remember { mutableStateOf(0L) }
    
    val predefinedRegions = listOf(
        "London" to Pair(51.4, -0.2) to Pair(51.6, 0.0),
        "Manchester" to Pair(53.4, -2.3) to Pair(53.5, -2.2),
        "Birmingham" to Pair(52.5, -1.9) to Pair(52.6, -1.8),
        "Leeds" to Pair(53.8, -1.5) to Pair(53.9, -1.4),
        "Liverpool" to Pair(53.4, -2.9) to Pair(53.5, -2.8)
    )
    
    // Load initial data
    LaunchedEffect(Unit) {
        scope.launch {
            try {
                downloadedRegions = mapBoxHelper?.getDownloadedRegions() ?: emptyList()
                availableStorage = mapBoxHelper?.getAvailableStorage() ?: 0L
            } catch (e: Exception) {
                Timber.e("Error loading offline map data: ${e.message}")
            }
        }
    }
    
    // Update estimated size when region changes
    LaunchedEffect(selectedRegion) {
        scope.launch {
            try {
                val region = predefinedRegions.find { it.first == selectedRegion }
                if (region != null) {
                    val (start, end) = region.second to region.third
                    estimatedSize = mapBoxHelper?.estimateDownloadSize(
                        minLat = start.first,
                        minLon = start.second,
                        maxLat = end.first,
                        maxLon = end.second
                    ) ?: 0L
                }
            } catch (e: Exception) {
                Timber.e("Error estimating download size: ${e.message}")
            }
        }
    }
    
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(16.dp)
    ) {
        // Header
        Text(
            text = "Offline Maps",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 16.dp)
        )
        
        // Region Selector
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Select Region", fontWeight = FontWeight.SemiBold)
                
                // Region dropdown
                var expanded by remember { mutableStateOf(false) }
                ExposedDropdownMenuBox(
                    expanded = expanded,
                    onExpandedChange = { expanded = !expanded },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                ) {
                    TextField(
                        value = selectedRegion,
                        onValueChange = {},
                        readOnly = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor()
                    )
                    
                    ExposedDropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false }
                    ) {
                        predefinedRegions.forEach { (name, _, _) ->
                            DropdownMenuItem(
                                text = { Text(name) },
                                onClick = {
                                    selectedRegion = name
                                    expanded = false
                                }
                            )
                        }
                    }
                }
                
                // Estimated size
                Text(
                    text = "Estimated size: ${estimatedSize / (1024 * 1024)} MB",
                    modifier = Modifier.padding(top = 8.dp),
                    fontSize = 12.sp
                )
            }
        }
        
        // Storage Info
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Storage", fontWeight = FontWeight.SemiBold)
                
                Text(
                    text = "Available: ${availableStorage / (1024 * 1024 * 1024)} GB",
                    modifier = Modifier.padding(top = 8.dp),
                    fontSize = 12.sp
                )
                
                LinearProgressIndicator(
                    progress = { 0.5f },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                )
            }
        }
        
        // Download Progress
        if (isDownloading) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Downloading: $selectedRegion", fontWeight = FontWeight.SemiBold)
                    
                    LinearProgressIndicator(
                        progress = { downloadProgress / 100f },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp)
                    )
                    
                    Text(
                        text = "$downloadProgress%",
                        modifier = Modifier
                            .align(Alignment.End)
                            .padding(top = 8.dp),
                        fontSize = 12.sp
                    )
                }
            }
        }
        
        // Download Button
        Button(
            onClick = {
                isDownloading = true
                scope.launch {
                    try {
                        val region = predefinedRegions.find { it.first == selectedRegion }
                        if (region != null && mapBoxHelper != null) {
                            val (start, end) = region.second to region.third
                            mapBoxHelper.downloadOfflineRegion(
                                regionName = selectedRegion,
                                minLat = start.first,
                                minLon = start.second,
                                maxLat = end.first,
                                maxLon = end.second
                            ).collect { progress ->
                                downloadProgress = progress
                            }
                            
                            // Refresh downloaded regions
                            downloadedRegions = mapBoxHelper.getDownloadedRegions()
                            isDownloading = false
                        }
                    } catch (e: Exception) {
                        Timber.e("Error downloading offline map: ${e.message}")
                        isDownloading = false
                    }
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp),
            enabled = !isDownloading && estimatedSize > 0
        ) {
            Icon(Icons.Default.Download, contentDescription = "Download")
            Spacer(modifier = Modifier.width(8.dp))
            Text("Download $selectedRegion")
        }
        
        // Downloaded Regions List
        Text(
            text = "Downloaded Regions (${downloadedRegions.size})",
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(downloadedRegions) { region ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(region)
                        
                        IconButton(
                            onClick = {
                                scope.launch {
                                    try {
                                        offlineMapManager?.deleteRegion(region)
                                        downloadedRegions = mapBoxHelper?.getDownloadedRegions() ?: emptyList()
                                    } catch (e: Exception) {
                                        Timber.e("Error deleting offline map: ${e.message}")
                                    }
                                }
                            }
                        ) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete")
                        }
                    }
                }
            }
        }
    }
}

