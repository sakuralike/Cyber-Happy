package com.cyberfish.app.update

import android.content.Context
import com.cyberfish.app.BuildConfig
import com.cyberfish.app.network.ModelApi
import java.io.File

object ModelRuntime {
    @Volatile
    private var repository: ModelRepository? = null

    fun get(context: Context, modelApi: ModelApi): ModelRepository {
        repository?.let { return it }
        return synchronized(this) {
            repository ?: ModelRepository(
                modelApi = modelApi,
                storageDir = File(context.applicationContext.filesDir, "models"),
                allowInsecureHttp = BuildConfig.DEBUG,
            ).also { repository = it }
        }
    }
}
