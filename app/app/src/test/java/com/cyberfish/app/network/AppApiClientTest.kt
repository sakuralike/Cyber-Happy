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
import java.io.ByteArrayOutputStream

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
    fun `user login sends app token and parses session`() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"code":0,"message":"ok","data":{"token":"user-token","user":{"id":"user-123","username":"angler","displayName":"钓友","email":"angler@example.test"}}}""",
            ),
        )

        val result = client().login("angler", "checkpass123")

        val session = (result as ApiResult.Success).value
        assertEquals("user-token", session.token)
        assertEquals("user-123", session.user.id)
        val request = server.takeRequest()
        assertEquals("/api/v1/users/login", request.requestUrl?.encodedPath)
        assertEquals("test-app-token", request.getHeader("X-App-Token"))
    }

    @Test
    fun `support content reads published user page settings`() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"code":0,"message":"ok","data":{"scopes":{"USER_PAGE":{"support.feedback.title":"反馈中心","support.help.title":"帮助中心","support.help.content":"帮助内容","about.title":"关于","about.content":"产品介绍","about.privacy":"隐私内容"}}}}""",
            ),
        )

        val result = client().fetchSupportContent()

        val content = (result as ApiResult.Success).value
        assertEquals("反馈中心", content.feedbackTitle)
        assertEquals("帮助中心", content.helpTitle)
        assertEquals("隐私内容", content.privacyContent)
        assertEquals("/api/v1/public/config/all", server.takeRequest().requestUrl?.encodedPath)
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

    @Test
    fun `model check parses LiteRT metadata and resolves relative url`() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"code":0,"message":"ok","data":{"hasUpdate":true,"model":{"modelVersion":"yolo26n-w8a32-v1","arch":"YOLO26n","quant":"W8A32","framework":"LiteRT","inputSize":640,"url":"/files/models/yolo26n.tflite","size":1234,"sha256":"${"a".repeat(64)}","labels":["fish_float"],"signature":"c2ln","signatureAlgorithm":"ECDSA_P256_SHA256","publicKeyId":"key-1","signatureExpiresAt":"2030-01-01T00:00:00Z"},"dispatchId":"dispatch-1"}}""",
            ),
        )

        val result = client().checkModel()

        val check = (result as ApiResult.Success).value
        assertTrue(check.hasUpdate)
        assertEquals("yolo26n-w8a32-v1", check.update?.descriptor?.modelVersion)
        assertEquals("YOLO26n", check.update?.descriptor?.architecture)
        assertEquals("LiteRT", check.update?.descriptor?.framework)
        assertEquals("fish_float", check.update?.descriptor?.labels?.single())
        assertFalse(check.update?.descriptor?.coordinatesNormalized ?: true)
        assertEquals("dispatch-1", check.update?.dispatchId)
        assertTrue(check.update?.downloadUrl?.endsWith("/files/models/yolo26n.tflite") == true)
        val request = server.takeRequest()
        assertEquals("/api/v1/models/check", request.requestUrl?.encodedPath)
        assertEquals("device-123", request.requestUrl?.queryParameter("deviceId"))
    }

    @Test
    fun `model report sends device status and progress`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"code":0,"message":"ok","data":{}}"""))

        val result = client().reportModelDispatch("dispatch-1", ModelDispatchStatus.DOWNLOADING, 45, "", "")

        assertTrue(result is ApiResult.Success)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/models/dispatches/dispatch-1/report", request.requestUrl?.encodedPath)
        val payload = JSONObject(request.body.readUtf8())
        assertEquals("device-123", payload.getString("deviceId"))
        assertEquals("DOWNLOADING", payload.getString("status"))
        assertEquals(45, payload.getInt("progress"))
    }

    @Test
    fun `model download streams bytes and reports progress`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(200).setBody("model-bytes"))
        val output = ByteArrayOutputStream()
        val progress = mutableListOf<Long>()

        val result = client().downloadModel(server.url("/model.tflite").toString(), output) { downloaded, _ -> progress += downloaded }

        assertEquals(11L, (result as ApiResult.Success).value)
        assertEquals("model-bytes", output.toString(Charsets.UTF_8.name()))
        assertEquals(listOf(11L), progress)
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
