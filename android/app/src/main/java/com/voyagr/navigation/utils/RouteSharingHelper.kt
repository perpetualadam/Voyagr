package com.voyagr.navigation.utils

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import com.voyagr.navigation.data.models.Route
import timber.log.Timber
import java.io.File
import java.io.FileOutputStream
import java.util.*

/**
 * Helper class for route sharing functionality.
 * Handles generating share links, QR codes, and deep links.
 */
class RouteSharingHelper(private val context: Context) {
    
    companion object {
        const val SHARE_BASE_URL = "https://voyagr.app/route"
        const val QR_CODE_SIZE = 512
    }
    
    data class SharedRoute(
        val id: String,
        val startLat: Double,
        val startLon: Double,
        val endLat: Double,
        val endLon: Double,
        val distance: Double,
        val duration: Double,
        val createdAt: Long
    )
    
    /**
     * Generate a shareable route link.
     * 
     * @param route Route to share
     * @return Share URL
     */
    fun generateShareLink(route: Route): String {
        return try {
            val routeId = UUID.randomUUID().toString()
            val params = mapOf(
                "id" to routeId,
                "start_lat" to route.steps.firstOrNull()?.latitude.toString(),
                "start_lon" to route.steps.firstOrNull()?.longitude.toString(),
                "end_lat" to route.steps.lastOrNull()?.latitude.toString(),
                "end_lon" to route.steps.lastOrNull()?.longitude.toString(),
                "distance" to route.distance.toString(),
                "duration" to route.duration.toString()
            )
            
            val queryString = params.entries.joinToString("&") { (k, v) ->
                "$k=${Uri.encode(v)}"
            }
            
            "$SHARE_BASE_URL?$queryString"
        } catch (e: Exception) {
            Timber.e("Error generating share link: ${e.message}")
            ""
        }
    }
    
    /**
     * Generate QR code for route sharing.
     * 
     * @param route Route to share
     * @return QR code bitmap
     */
    fun generateQRCode(route: Route): Bitmap? {
        return try {
            val shareLink = generateShareLink(route)
            val writer = QRCodeWriter()
            val bitMatrix = writer.encode(shareLink, BarcodeFormat.QR_CODE, QR_CODE_SIZE, QR_CODE_SIZE)
            
            val width = bitMatrix.width
            val height = bitMatrix.height
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
            
            for (x in 0 until width) {
                for (y in 0 until height) {
                    bitmap.setPixel(x, y, if (bitMatrix[x, y]) 0xFF000000.toInt() else 0xFFFFFFFF.toInt())
                }
            }
            
            bitmap
        } catch (e: Exception) {
            Timber.e("Error generating QR code: ${e.message}")
            null
        }
    }
    
    /**
     * Save QR code to file.
     * 
     * @param bitmap QR code bitmap
     * @return File path
     */
    fun saveQRCodeToFile(bitmap: Bitmap): String? {
        return try {
            val file = File(context.cacheDir, "qr_code_${System.currentTimeMillis()}.png")
            FileOutputStream(file).use { out ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            }
            file.absolutePath
        } catch (e: Exception) {
            Timber.e("Error saving QR code: ${e.message}")
            null
        }
    }
    
    /**
     * Share route via intent.
     * 
     * @param context Android context
     * @param route Route to share
     * @param method Sharing method (whatsapp, email, sms, etc.)
     */
    fun shareRoute(context: Context, route: Route, method: String = "default") {
        try {
            val shareLink = generateShareLink(route)
            val shareText = "Check out this route: $shareLink\n" +
                    "Distance: ${route.distance / 1000} km\n" +
                    "Duration: ${route.duration / 60} minutes"
            
            val intent = when (method) {
                "whatsapp" -> {
                    Intent().apply {
                        action = Intent.ACTION_SEND
                        type = "text/plain"
                        `package` = "com.whatsapp"
                        putExtra(Intent.EXTRA_TEXT, shareText)
                    }
                }
                "email" -> {
                    Intent().apply {
                        action = Intent.ACTION_SEND
                        type = "message/rfc822"
                        putExtra(Intent.EXTRA_SUBJECT, "Check out this route!")
                        putExtra(Intent.EXTRA_TEXT, shareText)
                    }
                }
                "sms" -> {
                    Intent().apply {
                        action = Intent.ACTION_SENDTO
                        data = Uri.parse("smsto:")
                        putExtra("sms_body", shareText)
                    }
                }
                else -> {
                    Intent().apply {
                        action = Intent.ACTION_SEND
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, shareText)
                    }
                }
            }
            
            context.startActivity(Intent.createChooser(intent, "Share route via"))
        } catch (e: Exception) {
            Timber.e("Error sharing route: ${e.message}")
        }
    }
    
    /**
     * Parse shared route from deep link.
     * 
     * @param uri Deep link URI
     * @return Shared route data
     */
    fun parseSharedRoute(uri: Uri): SharedRoute? {
        return try {
            val id = uri.getQueryParameter("id") ?: return null
            val startLat = uri.getQueryParameter("start_lat")?.toDoubleOrNull() ?: return null
            val startLon = uri.getQueryParameter("start_lon")?.toDoubleOrNull() ?: return null
            val endLat = uri.getQueryParameter("end_lat")?.toDoubleOrNull() ?: return null
            val endLon = uri.getQueryParameter("end_lon")?.toDoubleOrNull() ?: return null
            val distance = uri.getQueryParameter("distance")?.toDoubleOrNull() ?: 0.0
            val duration = uri.getQueryParameter("duration")?.toDoubleOrNull() ?: 0.0
            
            SharedRoute(
                id = id,
                startLat = startLat,
                startLon = startLon,
                endLat = endLat,
                endLon = endLon,
                distance = distance,
                duration = duration,
                createdAt = System.currentTimeMillis()
            )
        } catch (e: Exception) {
            Timber.e("Error parsing shared route: ${e.message}")
            null
        }
    }
    
    /**
     * Copy share link to clipboard.
     * 
     * @param route Route to share
     */
    fun copyShareLinkToClipboard(route: Route) {
        try {
            val shareLink = generateShareLink(route)
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            val clip = android.content.ClipData.newPlainText("Route Link", shareLink)
            clipboard.setPrimaryClip(clip)
            Timber.d("Share link copied to clipboard")
        } catch (e: Exception) {
            Timber.e("Error copying to clipboard: ${e.message}")
        }
    }
}

