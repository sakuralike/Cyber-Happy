plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

val needsAsciiBuildDirectory = System.getProperty("os.name").startsWith("Windows") &&
    project.projectDir.path.any { it.code > 127 }

if (needsAsciiBuildDirectory) {
    layout.buildDirectory.set(file("${System.getProperty("java.io.tmpdir")}/cyberfish-build/${project.name}"))
    tasks.withType<org.gradle.api.tasks.testing.Test>().configureEach {
        workingDir = file(System.getProperty("java.io.tmpdir"))
    }
}

android {
    namespace = "com.cyberfish.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.cyberfish.app"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("int", "PLANNED_MIN_SDK", "28")
        buildConfigField("int", "PLANNED_TARGET_SDK", "34")
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

    kotlinOptions { jvmTarget = "17" }

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
}

dependencies {
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

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
}
