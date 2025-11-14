# ProGuard rules for Voyagr Navigation App

# Keep all Voyagr classes
-keep class com.voyagr.navigation.** { *; }

# Keep data models
-keep class com.voyagr.navigation.data.models.** { *; }

# Keep database entities
-keep class com.voyagr.navigation.data.database.** { *; }

# Keep repositories
-keep class com.voyagr.navigation.data.repository.** { *; }

# Keep network services
-keep class com.voyagr.navigation.network.** { *; }

# Keep utilities
-keep class com.voyagr.navigation.utils.** { *; }

# Keep ViewModels
-keep class com.voyagr.navigation.ui.** { *; }

# Retrofit
-keepattributes Signature
-keepattributes *Annotation*
-keep class retrofit2.** { *; }
-keep interface retrofit2.** { *; }
-dontwarn retrofit2.**

# OkHttp
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**

# Gson
-keep class com.google.gson.** { *; }
-keep interface com.google.gson.** { *; }
-dontwarn com.google.gson.**

# Room Database
-keep class androidx.room.** { *; }
-keep interface androidx.room.** { *; }
-dontwarn androidx.room.**

# Hilt
-keep class dagger.hilt.** { *; }
-keep interface dagger.hilt.** { *; }
-dontwarn dagger.hilt.**

# Kotlin
-keep class kotlin.** { *; }
-keep interface kotlin.** { *; }
-dontwarn kotlin.**

# Coroutines
-keep class kotlinx.coroutines.** { *; }
-keep interface kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# Google Play Services
-keep class com.google.android.gms.** { *; }
-keep interface com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# Timber Logging
-keep class timber.log.** { *; }
-dontwarn timber.log.**

# Remove logging in release builds
-assumenosideeffects class timber.log.Timber {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

# Optimization
-optimizationpasses 5
-dontusemixedcaseclassnames
-verbose

# Renaming
-allowaccessmodification
-repackageclasses

