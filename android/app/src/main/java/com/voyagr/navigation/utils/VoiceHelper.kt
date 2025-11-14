package com.voyagr.navigation.utils

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.TextToSpeech.OnInitListener
import timber.log.Timber
import java.util.*

/**
 * Helper for Text-to-Speech voice announcements.
 * Ported from satnav.py voice system.
 */
class VoiceHelper(private val context: Context) : OnInitListener {
    
    private var textToSpeech: TextToSpeech? = null
    private var isInitialized = false
    
    init {
        initializeTextToSpeech()
    }
    
    /**
     * Initialize TextToSpeech engine.
     */
    private fun initializeTextToSpeech() {
        textToSpeech = TextToSpeech(context, this)
    }
    
    /**
     * Called when TextToSpeech engine is initialized.
     */
    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            isInitialized = true
            textToSpeech?.language = Locale.UK
            Timber.d("TextToSpeech initialized successfully")
        } else {
            Timber.e("TextToSpeech initialization failed")
        }
    }
    
    /**
     * Speak text using TextToSpeech.
     * 
     * @param text Text to speak
     * @param queueMode Whether to queue or interrupt current speech
     */
    fun speak(text: String, queueMode: Boolean = false) {
        if (!isInitialized) {
            Timber.w("TextToSpeech not initialized")
            return
        }
        
        try {
            val mode = if (queueMode) {
                TextToSpeech.QUEUE_ADD
            } else {
                TextToSpeech.QUEUE_FLUSH
            }
            
            textToSpeech?.speak(text, mode, null)
            Timber.d("Speaking: $text")
        } catch (e: Exception) {
            Timber.e("Error speaking: ${e.message}")
        }
    }
    
    /**
     * Announce turn direction.
     * 
     * @param direction Turn direction (left, right, sharp_left, etc.)
     * @param distance Distance to turn in meters
     */
    fun announceTurn(direction: String, distance: Int) {
        val directionText = when (direction) {
            "left" -> "Turn left"
            "right" -> "Turn right"
            "sharp_left" -> "Turn sharp left"
            "sharp_right" -> "Turn sharp right"
            "slight_left" -> "Turn slightly left"
            "slight_right" -> "Turn slightly right"
            "u_turn" -> "Make a U-turn"
            else -> "Continue straight"
        }
        
        val distanceText = when {
            distance < 100 -> "immediately"
            distance < 500 -> "in ${distance / 100 * 100} meters"
            else -> "in ${distance / 1000} kilometers"
        }
        
        speak("$directionText $distanceText")
    }
    
    /**
     * Announce ETA.
     * 
     * @param minutes Minutes until arrival
     * @param arrivalTime Formatted arrival time (e.g., "3:45 PM")
     */
    fun announceEta(minutes: Int, arrivalTime: String) {
        val text = "You will arrive in $minutes minutes at $arrivalTime"
        speak(text)
    }
    
    /**
     * Announce speed limit.
     * 
     * @param speedLimit Speed limit in km/h
     */
    fun announceSpeedLimit(speedLimit: Int) {
        speak("Speed limit $speedLimit kilometers per hour")
    }
    
    /**
     * Announce hazard.
     * 
     * @param hazardType Type of hazard (camera, accident, roadwork, etc.)
     * @param distance Distance to hazard in meters
     */
    fun announceHazard(hazardType: String, distance: Int) {
        val hazardText = when (hazardType) {
            "speed_camera" -> "Speed camera ahead"
            "traffic_camera" -> "Traffic camera ahead"
            "accident" -> "Accident ahead"
            "roadwork" -> "Roadwork ahead"
            "police" -> "Police ahead"
            else -> "Hazard ahead"
        }
        
        val distanceText = when {
            distance < 500 -> "in ${distance} meters"
            else -> "in ${distance / 1000} kilometers"
        }
        
        speak("$hazardText $distanceText")
    }
    
    /**
     * Stop current speech.
     */
    fun stop() {
        try {
            textToSpeech?.stop()
        } catch (e: Exception) {
            Timber.e("Error stopping speech: ${e.message}")
        }
    }
    
    /**
     * Release TextToSpeech resources.
     */
    fun release() {
        try {
            textToSpeech?.stop()
            textToSpeech?.shutdown()
            isInitialized = false
        } catch (e: Exception) {
            Timber.e("Error releasing TextToSpeech: ${e.message}")
        }
    }
}

