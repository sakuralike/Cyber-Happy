import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    kotlin("kapt")
}

val amapKeyFile = rootProject.file("../sdk/key.txt")
val amapKeyFromFile = if (amapKeyFile.isFile) {
    amapKeyFile.useLines { lines ->
        lines.map(String::trim).firstOrNull { it.matches(Regex("[A-Za-z0-9_-]{32}")) }.orEmpty()
    }
} else {
    ""
}
val amapApiKey = providers.gradleProperty("amapKey").orNull?.trim().orEmpty()
    .ifBlank { System.getenv("AMAP_KEY")?.trim().orEmpty() }
    .ifBlank { amapKeyFromFile }

val needsAsciiBuildDirectory = System.getProperty("os.name").startsWith("Windows") &&
    project.projectDir.path.any { it.code > 127 }
val localProperties = Properties().apply {
    val localPropertiesFile = rootProject.file("local.properties")
    if (localPropertiesFile.isFile) localPropertiesFile.inputStream().use(::load)
}
val appApiBaseUrl = providers.gradleProperty("appApiBaseUrl").orNull?.trim().orEmpty()
    .ifBlank { System.getenv("APP_API_BASE_URL")?.trim().orEmpty() }
    .ifBlank { localProperties.getProperty("appApiBaseUrl")?.trim().orEmpty() }
val appApiToken = providers.gradleProperty("appApiToken").orNull?.trim().orEmpty()
    .ifBlank { System.getenv("APP_API_TOKEN")?.trim().orEmpty() }
    .ifBlank { localProperties.getProperty("appApiToken")?.trim().orEmpty() }
val modelPublicKeys = providers.gradleProperty("modelPublicKeys").orElse("{}").get()

fun buildConfigString(value: String) = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r")}\""

if (needsAsciiBuildDirectory) {
    layout.buildDirectory.set(file("E:/cyberfish-build/${project.name}"))
    val testWorkingDirectory = file("E:/cyberfish-test-tmp").apply { mkdirs() }
    tasks.withType<org.gradle.api.tasks.testing.Test>().configureEach {
        workingDir = testWorkingDirectory
    }
}

android {
    namespace = "com.cyberfish.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.cyberfish.app"
        minSdk = 28
        targetSdk = 34
        versionCode = 131
        versionName = "1.3.1"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("int", "PLANNED_MIN_SDK", "28")
        buildConfigField("int", "PLANNED_TARGET_SDK", "34")
        buildConfigField("String", "APP_API_BASE_URL", buildConfigString(appApiBaseUrl))
        buildConfigField("String", "APP_API_TOKEN", buildConfigString(appApiToken))
        buildConfigField("String", "MODEL_PUBLIC_KEYS", buildConfigString(modelPublicKeys))
        buildConfigField("String", "AMAP_API_KEY", buildConfigString(amapApiKey))
        manifestPlaceholders["amapApiKey"] = amapApiKey
        vectorDrawables { useSupportLibrary = true }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs += "-Xskip-metadata-version-check"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }

    sourceSets {
        getByName("androidTest").assets.srcDir(rootProject.file("YOLO"))
    }
}

dependencies {
    implementation(files("libs/amap-map-search-location-11.2.100.aar"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.core)
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.google.ai.edge.litert)

    kapt(libs.androidx.room.compiler)

    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.json)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
}
