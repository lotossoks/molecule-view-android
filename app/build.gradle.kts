plugins {
 id("com.android.application")
 id("org.jetbrains.kotlin.android")
 id("org.jetbrains.kotlin.plugin.compose")
}
android {
 namespace = "org.lotossoks.palmol"
 compileSdk = 35
 defaultConfig { applicationId = "org.lotossoks.palmol"; minSdk = 31; targetSdk = 35; versionCode = 1; versionName = "0.1.0" }
 signingConfigs {
  create("release") {
   val keyPath = System.getenv("PALMOL_KEYSTORE_PATH")
   if (keyPath != null) {
    storeFile = file(keyPath)
    storePassword = System.getenv("PALMOL_STORE_PASSWORD")
    keyAlias = "palmol"
    keyPassword = System.getenv("PALMOL_STORE_PASSWORD")
   }
  }
 }
 buildTypes { getByName("release") { signingConfig = signingConfigs.getByName("release") } }
 buildFeatures { compose = true }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget = "17" }
}
dependencies {
 implementation(platform("androidx.compose:compose-bom:2025.04.01"))
 implementation("androidx.activity:activity-compose:1.10.1")
 implementation("androidx.compose.material3:material3")
 implementation("androidx.webkit:webkit:1.12.1")
}
