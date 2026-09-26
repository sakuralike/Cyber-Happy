package com.cyberfish.app.update

import android.content.Context
import com.cyberfish.app.BuildConfig
import com.cyberfish.app.inference.DetectorSlot
import com.cyberfish.app.inference.UnavailableDetector
import com.cyberfish.app.network.ModelApi
import java.io.File

object ModelRuntime {
    @Volatile
    private var repository: ModelRepository? = null

    fun get(context: Context, modelApi: ModelApi, keyProvider: ModelKeyProvider? = null): ModelRepository {
        repository?.let { return it }
        return synchronized(this) {
            repository ?: ModelRepository(
                modelApi = modelApi,
                storageDir = File(context.applicationContext.filesDir, "models"),
                detectorSlot = DetectorSlot(UnavailableDetector()),
                signatureVerifier = PublicKeyModelSignatureVerifier(ModelPublicKeys.fromBuildConfig()),
                modelKeyProvider = keyProvider,
                allowInsecureHttp = BuildConfig.DEBUG,
            ).also { repository = it }
        }
    }
}
