package com.cyberfish.app.network

import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.Signature
import java.util.Base64

class DeviceAuthClientTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() = server.shutdown()

    @Test
    fun `enrolls consumes challenge stores token and signs json request`() = runBlocking {
        val signing = TestSigningKey()
        val keyId = signing.ensureKey().keyId
        server.enqueue(ok("""{"signingKeyId":"$keyId","status":"ACTIVE"}"""))
        server.enqueue(ok("""{"challengeId":"challenge-1","challenge":"abc","expiresAt":"2099-01-01T00:00:00Z"}"""))
        server.enqueue(ok("""{"token":"device-token","tokenType":"Device","expiresAt":"2099-01-01T00:15:00Z","scopes":["model:check","event:write"]}"""))
        val persistence = MemoryTokenPersistence()
        val client = DeviceAuthClient(
            config = ApiConfig(server.url("/").toString(), "legacy-token"),
            identityProvider = TestIdentityProvider,
            signingKeyProvider = signing,
            tokenPersistence = persistence,
            httpClient = OkHttpClient(),
            nowMillis = { 1_700_000_000_000L },
        )

        val request = Request.Builder()
            .url("https://lycwd.com/api/v1/models/check?z=2&a=1".toHttpUrl())
            .post("""{"z":2,"a":1}""".toRequestBodyCompat())
            .build()
        val result = client.authorize(request) as ApiResult.Success

        assertEquals("Device device-token", result.value.header("X-Device-Authorization"))
        assertEquals("device-1", result.value.header("X-Device-Id"))
        assertEquals(keyId, result.value.header("X-Device-Key-Id"))
        assertEquals("1700000000", result.value.header("X-Timestamp"))
        assertNotNull(result.value.header("X-Nonce"))
        assertNotNull(result.value.header("X-Device-Signature"))
        assertEquals(sha256Hex("""{"a":1,"z":2}""".toByteArray()), result.value.header("X-Body-SHA256"))
        assertNotNull(persistence.value)

        assertEquals("/api/v1/devices/enroll", server.takeRequest().path)
        assertEquals("/api/v1/devices/challenges", server.takeRequest().path)
        val tokenRequest = server.takeRequest()
        assertEquals("/api/v1/devices/token", tokenRequest.path)
        assertTrue(tokenRequest.body.readUtf8().contains("\"signature\""))
    }

    @Test
    fun `uses cached token without enrollment`() = runBlocking {
        val signing = TestSigningKey()
        val material = signing.ensureKey()
        val persistence = MemoryTokenPersistence(
            DeviceAccessToken("cached", "device-1", material.keyId, 1_700_000_200_000L, setOf("model:check")),
        )
        val client = DeviceAuthClient(
            config = ApiConfig(server.url("/").toString(), ""),
            identityProvider = TestIdentityProvider,
            signingKeyProvider = signing,
            tokenPersistence = persistence,
            nowMillis = { 1_700_000_000_000L },
        )

        val result = client.authorize(Request.Builder().url("https://lycwd.com/api/v1/models/check".toHttpUrl()).build()) as ApiResult.Success

        assertEquals("Device cached", result.value.header("X-Device-Authorization"))
        assertEquals(0, server.requestCount)
    }

    private fun ok(data: String) = MockResponse().setResponseCode(200).setBody("""{"code":0,"message":"ok","data":$data}""")

    private object TestIdentityProvider : DeviceIdentityProvider {
        override suspend fun get() = DeviceIdentity("device-1", "anonymous-device-1", "test", "Android")
    }

    private class MemoryTokenPersistence(var value: DeviceAccessToken? = null) : DeviceAccessTokenPersistence {
        override fun read() = value
        override fun save(value: DeviceAccessToken) { this.value = value }
        override fun clear() { value = null }
    }

    private class TestSigningKey : DeviceSigningKeyProvider {
        private val pair = KeyPairGenerator.getInstance("EC").apply { initialize(256) }.generateKeyPair()
        private val material = DeviceSigningMaterial(
            keyId = "ec-${sha256Hex(pair.public.encoded).take(32)}",
            publicKey = Base64.getEncoder().encodeToString(pair.public.encoded),
            securityLevel = "SOFTWARE",
        )
        override fun ensureKey() = material
        override fun sign(value: ByteArray): String = Signature.getInstance("SHA256withECDSA").run {
            initSign(pair.private)
            update(value)
            Base64.getEncoder().encodeToString(sign())
        }
    }
}

private fun String.toRequestBodyCompat() = toRequestBody("application/json; charset=utf-8".toMediaType())
