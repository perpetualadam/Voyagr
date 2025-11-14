package com.voyagr.navigation.data.database

import androidx.room.*
import com.voyagr.navigation.data.models.AppSettings
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object for AppSettings entity.
 * Handles all database operations for app settings and preferences.
 */
@Dao
interface SettingsDao {
    
    /**
     * Insert or update a setting.
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSetting(setting: AppSettings)
    
    /**
     * Get a setting by key.
     */
    @Query("SELECT * FROM settings WHERE key = :key")
    suspend fun getSetting(key: String): AppSettings?
    
    /**
     * Get all settings.
     */
    @Query("SELECT * FROM settings")
    fun getAllSettings(): Flow<List<AppSettings>>
    
    /**
     * Delete a setting by key.
     */
    @Query("DELETE FROM settings WHERE key = :key")
    suspend fun deleteSetting(key: String)
    
    /**
     * Delete all settings.
     */
    @Query("DELETE FROM settings")
    suspend fun deleteAllSettings()
}

