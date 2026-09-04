package com.cyberfish.app.network

import com.cyberfish.app.data.local.FishRecordEntity
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AppApiClientTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `version check sends app token and parses update response`() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"code":0,"message":"ok","data":{"hasUpdate":true,"updateType":"OPTIONAL","latest":{"versionName":"1.2.0","versionCode":12,"releaseNotes":"修复识别稳定性"}}}""",
            ),
        )

        val result = client().checkForUpdate()

        val success = result as ApiResult.Success
        assertTrue(success.value.hasUpdate)
        assertEquals("1.2.0", success.value.versionName)
        assertEquals(12, success.value.versionCode)
        val request = server.takeRequest()
        assertEquals("/api/v1/app-versions/check", request.requestUrl?.encodedPath)
        assertEquals("test-app-token", request.getHeader("X-App-Token"))
        assertEquals("ANDROID", request.requestUrl?.queryParameter("platform"))
        assertEquals("device-123", request.requestUrl?.queryParameter("deviceId"))
    }

    @Test
    fun `misreport upload uses confirmed false positive contract`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(201).setBody("""{"code":0,"message":"ok","data":{"id":"report-123"}}"""))

        val result = client().submitMisreport(
            FishRecordEntity(
                occurredAtMillis = 1_700_000_000_000L,
                triggerTimestampMillis = 966L,
                confidence = 0.94f,
                verticalDisplacementPx = 19.2f,
                jitterHz = 3.6f,
                trajectoryCsv = "0,5,12,19",
                isFalsePositive = true,
            ),
        )

        assertEquals("report-123", (result as ApiResult.Success).value)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/misreports", request.requestUrl?.encodedPath)
        assertEquals("test-app-token", request.getHeader("X-App-Token"))
        val payload = JSONObject(request.body.readUtf8())
        assertEquals("device-123", payload.getString("deviceId"))
        assertEquals("anonymous-device-123", payload.getString("userId"))
        assertEquals("FALSE_POSITIVE", payload.getString("reportType"))
        assertEquals(966L, payload.getJSONObject("rawData").getLong("triggerTimestampMillis"))
        assertFalse(payload.has("videoUrl"))
    }

    @Test
    fun `server rejection exposes its response message`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"code":40101,"message":"APP token 无效","data":null}"""))

        val result = client().checkForUpdate()

        val failure = result as ApiResult.HttpError
        assertEquals(401, failure.statusCode)
        assertEquals("APP token 无效", failure.message)
    }

    @Test
    fun `invalid base url returns parse error without throwing`() = runBlocking {
        val result = AppApiClient(
            config = ApiConfig("not a url", "test-app-token"),
            identityStore = object : DeviceIdentityProvider {
                override suspend fun get() = DeviceIdentity("device-123", "anonymous-device-123", "Pixel Test", "Android 14")
            },
        ).checkForUpdate()

        assertTrue(result is ApiResult.ParseError)
    }

    private fun client() = AppApiClient(
        config = ApiConfig(server.url("/").toString(), "test-app-token"),
        identityStore = object : DeviceIdentityProvider {
            override suspend fun get() = DeviceIdentity(
                deviceId = "device-123",
                userId = "anonymous-device-123",
                deviceModel = "Pixel Test",
                osVersion = "Android 14",
            )
        },
    )
}
