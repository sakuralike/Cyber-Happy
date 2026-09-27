package com.cyberfish.app.network

import com.cyberfish.app.data.local.FishRecordEntity
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.Request
import org.json.JSONObject
import com.cyberfish.app.update.ModelKeyMaterial
import com.cyberfish.app.update.ModelKeyProvider
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File

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
                """{"code":0,"message":"ok","data":{"hasUpdate":true,"updateType":"OPTIONAL","latest":{"versionName":"1.2.0","versionCode":12,"releaseNotes":"修复识别稳定性","downloadMode":"SERVER","apkUrl":"https://download.example/app.apk","apkSize":1234,"sha256":"${"a".repeat(64)}"}}}""",
            ),
        )

        val result = client().checkForUpdate()

        val success = result as ApiResult.Success
        assertTrue(success.value.hasUpdate)
        assertEquals("1.2.0", success.value.versionName)
        assertEquals(12, success.value.versionCode)
        assertEquals(AppDownloadMode.SERVER, success.value.downloadMode)
        assertEquals("https://download.example/app.apk", success.value.apkUrl)
        assertEquals("a".repeat(64), success.value.apkSha256)
        val request = server.takeRequest()
        assertEquals("/api/v1/app-versions/check", request.requestUrl?.encodedPath)
        assertEquals("test-app-token", request.getHeader("X-App-Token"))
        assertEquals("ANDROID", request.requestUrl?.queryParameter("platform"))
        assertEquals("device-123", request.requestUrl?.queryParameter("deviceId"))
    }

    @Test
    fun `legacy update without mode falls back to external unless a checksum is present`() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"code":0,"message":"ok","data":{"hasUpdate":true,"latest":{"versionName":"1.2.0","versionCode":12,"apkUrl":"https://disk.example/app"}}}""",
            ),
        )
        val external = (client().checkForUpdate() as ApiResult.Success).value
        assertEquals(AppDownloadMode.EXTERNAL, external.downloadMode)

        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"code":0,"message":"ok","data":{"hasUpdate":true,"latest":{"versionName":"1.2.1","versionCode":13,"apkUrl":"https://download.example/app.apk","sha256":"${"b".repeat(64)}"}}}""",
            ),
        )
        val serverUpdate = (client().checkForUpdate() as ApiResult.Success).value
        assertEquals(AppDownloadMode.SERVER, serverUpdate.downloadMode)
    }

    @Test
    fun `misreport upload uses confirmed false positive contract`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(201).setBody("""{"code":0,"message":"ok","data":{"id":"report-123"}}"""))

        val result = client(
            UserSession(
                token = "user-token",
                user = UserAccount(
                    id = "user-123",
                    username = "angler",
                    displayName = "钓友",
                    email = null,
                ),
            ),
        ).submitMisreport(
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
        assertEquals("user-123", payload.getString("userId"))
        assertEquals("FALSE_POSITIVE", payload.getString("reportType"))
        assertEquals(966L, payload.getJSONObject("rawData").getLong("triggerTimestampMillis"))
        assertFalse(payload.has("videoUrl"))
        assertEquals("Bearer user-token", request.getHeader("Authorization"))
    }

    @Test
    fun `misreport without an authenticated session is rejected before network`() = runBlocking {
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

        val failure = result as ApiResult.HttpError
        assertEquals(401, failure.statusCode)
        assertEquals("请先登录后上报误报", failure.message)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `misreport media upload keeps user authorization`() = runBlocking {
        val snapshot = File.createTempFile("misreport-", ".jpg")
        snapshot.writeBytes(byteArrayOf(1, 2, 3))
        try {
            server.enqueue(MockResponse().setResponseCode(201).setBody("""{"code":0,"message":"ok","data":{"id":"asset-snapshot","url":"/files/snapshot.jpg"}}"""))
            server.enqueue(MockResponse().setResponseCode(201).setBody("""{"code":0,"message":"ok","data":{"id":"report-123"}}"""))

            val result = client(testSession()).submitMisreport(
                FishRecordEntity(
                    occurredAtMillis = 1_700_000_000_000L,
                    triggerTimestampMillis = 966L,
                    confidence = 0.94f,
                    verticalDisplacementPx = 19.2f,
                    jitterHz = 3.6f,
                    trajectoryCsv = "0,5,12,19",
                    snapshotPath = snapshot.absolutePath,
                    isFalsePositive = true,
                ),
            )

            assertEquals("report-123", (result as ApiResult.Success).value)
            val upload = server.takeRequest()
            assertEquals("/api/v1/files/upload", upload.requestUrl?.encodedPath)
            assertEquals("IMAGE", upload.requestUrl?.queryParameter("bizType"))
            assertEquals("Bearer user-token", upload.getHeader("Authorization"))
            assertEquals("test-app-token", upload.getHeader("X-App-Token"))
            val report = server.takeRequest()
            assertEquals("Bearer user-token", report.getHeader("Authorization"))
            val payload = JSONObject(report.body.readUtf8())
            assertEquals("asset-snapshot", payload.getJSONArray("snapshotAssetIds").getString(0))
            assertFalse(payload.has("snapshotUrls"))
        } finally {
            snapshot.delete()
        }
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
    fun `user 401 clears the user session once`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"code":40101,"message":"登录已过期","data":null}"""))
        val sessions = RecordingSessionProvider(testSession())

        val result = client(sessionProvider = sessions).fetchPrivacyConsent()

        assertEquals(401, (result as ApiResult.HttpError).statusCode)
        assertEquals(1, sessions.clearCount)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun `device 401 clears token and retries exactly once`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"code":40102,"message":"设备令牌无效","data":null}"""))
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"code":0,"message":"ok","data":{"hasUpdate":false}}"""))
        val deviceAuth = RecordingDeviceAuthenticator()

        val result = client(deviceAuthClient = deviceAuth).checkForUpdate()

        assertTrue(result is ApiResult.Success)
        assertEquals(2, deviceAuth.authorizeCount)
        assertEquals(1, deviceAuth.clearCount)
        assertEquals(2, server.requestCount)
    }

    @Test
    fun `device auth failure does not retry indefinitely`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(403).setBody("""{"code":40302,"message":"设备已撤销","data":null}"""))
        server.enqueue(MockResponse().setResponseCode(403).setBody("""{"code":40302,"message":"设备已撤销","data":null}"""))
        val deviceAuth = RecordingDeviceAuthenticator()

        val result = client(deviceAuthClient = deviceAuth).checkForUpdate()

        assertEquals(403, (result as ApiResult.HttpError).statusCode)
        assertEquals(2, deviceAuth.authorizeCount)
        assertEquals(1, deviceAuth.clearCount)
        assertEquals(2, server.requestCount)
    }

    @Test
    fun `check in duplicate exposes dedicated error code`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(409).setBody("""{"code":40912,"message":"今日已签到","data":{"alreadyCheckedIn":true}}"""))

        val result = client(testSession()).checkIn()

        val failure = result as ApiResult.HttpError
        assertEquals(409, failure.statusCode)
        assertEquals(40912, failure.errorCode)
        assertEquals("今日已签到", failure.message)
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
    fun `user registration sends the invitation code`() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"code":0,"message":"ok","data":{"token":"user-token","user":{"id":"user-123","username":"angler","displayName":"钓友"}}}""",
            ),
        )

        val result = client().register("angler", "checkpass123", "钓友", "", "CF-ABCD-EFGH-JKLM-NPQR")

        assertTrue(result is ApiResult.Success)
        val request = server.takeRequest()
        assertEquals("/api/v1/users/register", request.requestUrl?.encodedPath)
        assertEquals("CF-ABCD-EFGH-JKLM-NPQR", JSONObject(request.body.readUtf8()).getString("inviteCode"))
        assertEquals("test-app-token", request.getHeader("X-App-Token"))
    }

    @Test
    fun `check in overview sends user token and parses calendar state`() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"code":0,"message":"ok","data":{"config":{"enabled":true},"todayCheckedIn":true,"currentStreak":12,"longestStreak":23,"cycleDay":5,"cycleLength":7,"checkedDates":["2026-09-17","2026-09-18"],"canCheckIn":true}}""",
            ),
        )

        val result = client(testSession()).fetchCheckInOverview()

        val overview = (result as ApiResult.Success).value
        assertEquals(12, overview.currentStreak)
        assertTrue(overview.checkedInToday)
        assertEquals(setOf("2026-09-17", "2026-09-18"), overview.checkedDates)
        val request = server.takeRequest()
        assertEquals("/api/v1/check-in/overview", request.requestUrl?.encodedPath)
        assertEquals("Bearer user-token", request.getHeader("Authorization"))
    }

    @Test
    fun `check in posts idempotent action and parses returned status`() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"code":0,"message":"ok","data":{"alreadyCheckedIn":false,"overview":{"config":{"enabled":true},"todayCheckedIn":true,"currentStreak":13,"cycleDay":6,"cycleLength":7,"checkedDates":["2026-09-18"],"canCheckIn":true},"record":{"date":"2026-09-18","streak":13},"rewards":[{"day":7,"type":"MEDAL","name":"铜钩钓士","iconKey":"medal_bronze","milestone":true}]}}""",
            ),
        )

        val result = client(testSession()).checkIn()

        val action = (result as ApiResult.Success).value
        assertTrue(action.overview.checkedInToday)
        assertEquals("2026-09-18", action.record?.date)
        assertEquals("铜钩钓士", action.rewards.single().name)
        assertTrue(action.rewards.single().milestone)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/check-in", request.requestUrl?.encodedPath)
        assertEquals("Bearer user-token", request.getHeader("Authorization"))
        assertEquals("device-123", JSONObject(request.body.readUtf8()).getString("deviceId"))
    }

    @Test
    fun `check in history sends pagination query`() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"code":0,"message":"ok","data":{"page":2,"pageSize":20,"total":41,"records":[{"date":"2026-09-17","occurredAt":"2026-09-17T08:11:00+08:00","streak":12}]}}""",
            ),
        )

        val result = client(testSession()).fetchCheckInHistory(page = 2, pageSize = 20, month = "2026-09")

        val history = (result as ApiResult.Success).value
        assertEquals(2, history.page)
        assertEquals(1, history.records.size)
        assertTrue(history.hasMore)
        val request = server.takeRequest()
        assertEquals("/api/v1/check-in/history", request.requestUrl?.encodedPath)
        assertEquals("2", request.requestUrl?.queryParameter("page"))
        assertEquals("20", request.requestUrl?.queryParameter("pageSize"))
        assertEquals("2026-09", request.requestUrl?.queryParameter("month"))
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
    fun `model check parses NCNN metadata and resolves relative url`() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"code":0,"message":"ok","data":{"hasUpdate":true,"model":{"modelVersion":"yolo26n-fp32-v1","arch":"YOLO26n","quant":"FP32","framework":"NCNN","inputSize":640,"url":"/files/models/yolo26n.bin","size":1234,"sha256":"${"a".repeat(64)}","labels":["fish_float"],"signature":"c2ln","signatureAlgorithm":"ECDSA_P256_SHA256","publicKeyId":"key-1","signatureExpiresAt":"2030-01-01T00:00:00Z"},"dispatchId":"dispatch-1"}}""",
            ),
        )

        val result = client().checkModel()

        val check = (result as ApiResult.Success).value
        assertTrue(check.hasUpdate)
        assertEquals("yolo26n-fp32-v1", check.update?.descriptor?.modelVersion)
        assertEquals("YOLO26n", check.update?.descriptor?.architecture)
        assertEquals("NCNN", check.update?.descriptor?.framework)
        assertEquals("fish_float", check.update?.descriptor?.labels?.single())
        assertEquals("in0", check.update?.descriptor?.inputName)
        assertEquals("out0", check.update?.descriptor?.outputName)
        assertEquals("FIELDS_BY_CANDIDATES", check.update?.descriptor?.outputLayout)
        assertEquals(5, check.update?.descriptor?.valuesPerDetection)
        assertEquals(false, check.update?.descriptor?.coordinatesNormalized)
        assertEquals(1, check.update?.descriptor?.numClasses)
        assertEquals("dispatch-1", check.update?.dispatchId)
        assertTrue(check.update?.downloadUrl?.endsWith("/files/models/yolo26n.bin") == true)
        val request = server.takeRequest()
        assertEquals("/api/v1/models/check", request.requestUrl?.encodedPath)
        assertEquals("device-123", request.requestUrl?.queryParameter("deviceId"))
    }

    @Test
    fun `model check parses explicit dynamic NCNN tensor contract`() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"code":0,"message":"ok","data":{"hasUpdate":true,"model":{"modelVersion":"dynamic-v1","arch":"YOLO26n","quant":"FP32","framework":"NCNN","inputSize":640,"url":"/models/dynamic.bin","sha256":"${"a".repeat(64)}","labels":["float","fish"],"inputName":"images","outputName":"detections","outputLayout":"CANDIDATES_BY_FIELDS","valuesPerDetection":6,"coordinatesNormalized":true,"numClasses":2,"signature":"c2ln","signatureAlgorithm":"ECDSA_P256_SHA256","publicKeyId":"key-1"}}}""",
            ),
        )

        val result = client().checkModel()

        val descriptor = (result as ApiResult.Success).value.update!!.descriptor
        assertEquals("images", descriptor.inputName)
        assertEquals("detections", descriptor.outputName)
        assertEquals("CANDIDATES_BY_FIELDS", descriptor.outputLayout)
        assertEquals(6, descriptor.valuesPerDetection)
        assertEquals(true, descriptor.coordinatesNormalized)
        assertEquals(2, descriptor.numClasses)
    }

    @Test
    fun `model check registers the Keystore public key before requesting an encrypted model`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"code":0,"message":"ok","data":{"keyId":"key-1"}}"""))
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"code":0,"message":"ok","data":{"hasUpdate":false}}"""))
        val provider = object : ModelKeyProvider {
            override fun ensureKey() = ModelKeyMaterial("key-1", "public-key", "TEE")
            override fun decryptWrappedKey(wrappedKey: ByteArray) = error("not used")
        }
        val result = AppApiClient(
            config = ApiConfig(server.url("/").toString(), "test-app-token"),
            identityStore = object : DeviceIdentityProvider {
                override suspend fun get() = DeviceIdentity("device-123", "anonymous-device-123", "Pixel Test", "Android 14")
            },
            modelKeyProvider = provider,
        ).checkModel()

        assertTrue(result is ApiResult.Success)
        val registration = server.takeRequest()
        assertEquals("/api/v1/models/devices/register", registration.requestUrl?.encodedPath)
        assertEquals("TEE", JSONObject(registration.body.readUtf8()).getString("securityLevel"))
        val check = server.takeRequest()
        assertEquals("key-1", check.requestUrl?.queryParameter("keyId"))
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

    private fun testSession() = UserSession(
        token = "user-token",
        user = UserAccount(
            id = "user-123",
            username = "angler",
            displayName = "钓友",
            email = null,
        ),
    )

    private fun client(
        session: UserSession? = null,
        sessionProvider: UserSessionProvider? = null,
        deviceAuthClient: DeviceRequestAuthenticator? = null,
    ) = AppApiClient(
        config = ApiConfig(server.url("/").toString(), "test-app-token"),
        identityStore = object : DeviceIdentityProvider {
            override suspend fun get() = DeviceIdentity(
                deviceId = "device-123",
                userId = "anonymous-device-123",
                deviceModel = "Pixel Test",
                osVersion = "Android 14",
            )
        },
        userSessionProvider = sessionProvider ?: object : UserSessionProvider {
            override suspend fun get() = session
        },
        deviceAuthClient = deviceAuthClient,
    )

    private class RecordingSessionProvider(private var session: UserSession?) : UserSessionProvider {
        var clearCount = 0

        override suspend fun get() = session

        override suspend fun clear() {
            clearCount++
            session = null
        }
    }

    private class RecordingDeviceAuthenticator : DeviceRequestAuthenticator {
        var authorizeCount = 0
        var clearCount = 0

        override suspend fun authorize(request: Request): ApiResult<Request> {
            authorizeCount++
            return ApiResult.Success(request)
        }

        override fun clear() {
            clearCount++
        }
    }
}
