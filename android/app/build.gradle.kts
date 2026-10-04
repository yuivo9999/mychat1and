plugins {
    id("com.android.application")
    id("com.chaquo.python")
}

import org.gradle.api.tasks.Copy
import org.gradle.api.tasks.Exec

val prepareNodeRuntime = tasks.register<Exec>("prepareNodeRuntime") {\n    workingDir(project.projectDir)\n    commandLine("node", "tools/prepare-node-runtime.cjs")\n}\n\nval syncWebAssets = tasks.register<Exec>("syncWebAssets") {
    workingDir(project.projectDir.parentFile)
    commandLine(if (System.getProperty("os.name").lowercase().contains("win")) "cmd" else "npm")
    if (System.getProperty("os.name").lowercase().contains("win")) {
        args("/c", "npm", "run", "build")
    } else {
        args("run", "build")
    }
}

tasks.named("preBuild").configure {
    dependsOn(syncWebAssets)
}

tasks.register<Copy>("copyWebAssets") {
    dependsOn(syncWebAssets)
    from(rootProject.projectDir.parentFile.resolve("dist"))
    into(layout.projectDirectory.dir("src/main/assets/www"))
}

tasks.named("preBuild").configure {
    dependsOn("copyWebAssets")
}

android {
    namespace = "com.yuivo9999.mychat"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.yuivo9999.mychat"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"

        ndk {
            abiFilters += listOf("arm64-v8a", "x86_64")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}

chaquopy {
    defaultConfig {
        version = "3.13"
    }
}
