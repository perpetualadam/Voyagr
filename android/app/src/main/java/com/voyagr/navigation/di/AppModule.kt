package com.voyagr.navigation.di

import android.content.Context
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.voyagr.navigation.data.database.VoyagrDatabase
import com.voyagr.navigation.data.repository.TripRepository
import com.voyagr.navigation.data.repository.VehicleRepository
import com.voyagr.navigation.network.services.RoutingService
import com.voyagr.navigation.utils.LocationHelper
import com.voyagr.navigation.utils.VoiceHelper
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt dependency injection module.
 * Provides singleton instances of services and repositories.
 */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    
    /**
     * Provide Room database instance.
     */
    @Singleton
    @Provides
    fun provideDatabase(
        @ApplicationContext context: Context
    ): VoyagrDatabase {
        return VoyagrDatabase.getDatabase(context)
    }
    
    /**
     * Provide Trip DAO.
     */
    @Singleton
    @Provides
    fun provideTripDao(database: VoyagrDatabase) = database.tripDao()
    
    /**
     * Provide Vehicle DAO.
     */
    @Singleton
    @Provides
    fun provideVehicleDao(database: VoyagrDatabase) = database.vehicleDao()
    
    /**
     * Provide Settings DAO.
     */
    @Singleton
    @Provides
    fun provideSettingsDao(database: VoyagrDatabase) = database.settingsDao()
    
    /**
     * Provide Trip Repository.
     */
    @Singleton
    @Provides
    fun provideTripRepository(tripDao: com.voyagr.navigation.data.database.TripDao): TripRepository {
        return TripRepository(tripDao)
    }
    
    /**
     * Provide Vehicle Repository.
     */
    @Singleton
    @Provides
    fun provideVehicleRepository(vehicleDao: com.voyagr.navigation.data.database.VehicleDao): VehicleRepository {
        return VehicleRepository(vehicleDao)
    }
    
    /**
     * Provide Routing Service.
     */
    @Singleton
    @Provides
    fun provideRoutingService(): RoutingService {
        return RoutingService()
    }
    
    /**
     * Provide FusedLocationProviderClient.
     */
    @Singleton
    @Provides
    fun provideFusedLocationProviderClient(
        @ApplicationContext context: Context
    ): FusedLocationProviderClient {
        return LocationServices.getFusedLocationProviderClient(context)
    }
    
    /**
     * Provide Location Helper.
     */
    @Singleton
    @Provides
    fun provideLocationHelper(
        @ApplicationContext context: Context,
        fusedLocationClient: FusedLocationProviderClient
    ): LocationHelper {
        return LocationHelper(context, fusedLocationClient)
    }
    
    /**
     * Provide Voice Helper.
     */
    @Singleton
    @Provides
    fun provideVoiceHelper(
        @ApplicationContext context: Context
    ): VoiceHelper {
        return VoiceHelper(context)
    }
}

