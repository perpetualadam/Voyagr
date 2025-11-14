package com.voyagr.navigation.utils

import android.content.Context
import android.net.Uri
import com.voyagr.navigation.data.models.Route
import com.voyagr.navigation.data.models.RouteStep
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.junit.MockitoJUnitRunner
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Unit tests for RouteSharingHelper.
 */
@RunWith(MockitoJUnitRunner::class)
class RouteSharingHelperTest {
    
    @Mock
    private lateinit var context: Context
    
    private lateinit var sharingHelper: RouteSharingHelper
    
    @Before
    fun setUp() {
        sharingHelper = RouteSharingHelper(context)
    }
    
    @Test
    fun testGenerateShareLink() {
        val route = Route(
            distance = 264000.0,  // 264 km
            duration = 14400.0,   // 4 hours
            geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
            steps = listOf(
                RouteStep(0, "Head north", 1000.0, 60.0),
                RouteStep(1, "Turn right", 2000.0, 120.0)
            ),
            engine = "graphhopper"
        )
        
        val shareLink = sharingHelper.generateShareLink(route)
        
        assertTrue(shareLink.startsWith(RouteSharingHelper.SHARE_BASE_URL))
        assertTrue(shareLink.contains("distance="))
        assertTrue(shareLink.contains("duration="))
    }
    
    @Test
    fun testGenerateShareLink_ContainsCoordinates() {
        val route = Route(
            distance = 264000.0,
            duration = 14400.0,
            geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
            steps = listOf(
                RouteStep(0, "Head north", 1000.0, 60.0),
                RouteStep(1, "Turn right", 2000.0, 120.0)
            ),
            engine = "graphhopper"
        )
        
        val shareLink = sharingHelper.generateShareLink(route)
        
        assertTrue(shareLink.contains("start_lat="))
        assertTrue(shareLink.contains("start_lon="))
        assertTrue(shareLink.contains("end_lat="))
        assertTrue(shareLink.contains("end_lon="))
    }
    
    @Test
    fun testGenerateQRCode() {
        val route = Route(
            distance = 264000.0,
            duration = 14400.0,
            geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
            steps = listOf(
                RouteStep(0, "Head north", 1000.0, 60.0),
                RouteStep(1, "Turn right", 2000.0, 120.0)
            ),
            engine = "graphhopper"
        )
        
        val qrCode = sharingHelper.generateQRCode(route)
        
        assertNotNull(qrCode)
        assertEquals(RouteSharingHelper.QR_CODE_SIZE, qrCode.width)
        assertEquals(RouteSharingHelper.QR_CODE_SIZE, qrCode.height)
    }
    
    @Test
    fun testParseSharedRoute() {
        val uri = Uri.parse(
            "https://voyagr.app/route?" +
            "id=test-123&" +
            "start_lat=51.5074&" +
            "start_lon=-0.1278&" +
            "end_lat=53.4808&" +
            "end_lon=-2.2426&" +
            "distance=264000&" +
            "duration=14400"
        )
        
        val sharedRoute = sharingHelper.parseSharedRoute(uri)
        
        assertNotNull(sharedRoute)
        assertEquals("test-123", sharedRoute?.id)
        assertEquals(51.5074, sharedRoute?.startLat)
        assertEquals(-0.1278, sharedRoute?.startLon)
        assertEquals(53.4808, sharedRoute?.endLat)
        assertEquals(-2.2426, sharedRoute?.endLon)
        assertEquals(264000.0, sharedRoute?.distance)
        assertEquals(14400.0, sharedRoute?.duration)
    }
    
    @Test
    fun testParseSharedRoute_MissingId() {
        val uri = Uri.parse(
            "https://voyagr.app/route?" +
            "start_lat=51.5074&" +
            "start_lon=-0.1278&" +
            "end_lat=53.4808&" +
            "end_lon=-2.2426"
        )
        
        val sharedRoute = sharingHelper.parseSharedRoute(uri)
        
        assertEquals(null, sharedRoute)
    }
    
    @Test
    fun testParseSharedRoute_MissingCoordinates() {
        val uri = Uri.parse(
            "https://voyagr.app/route?" +
            "id=test-123&" +
            "start_lat=51.5074"
        )
        
        val sharedRoute = sharingHelper.parseSharedRoute(uri)
        
        assertEquals(null, sharedRoute)
    }
    
    @Test
    fun testCopyShareLinkToClipboard() {
        val route = Route(
            distance = 264000.0,
            duration = 14400.0,
            geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
            steps = listOf(
                RouteStep(0, "Head north", 1000.0, 60.0),
                RouteStep(1, "Turn right", 2000.0, 120.0)
            ),
            engine = "graphhopper"
        )
        
        // Should not throw exception
        sharingHelper.copyShareLinkToClipboard(route)
    }
}

