# MyChat Android project

This directory is the native Android source of MyChat.

The Capacitor CLI generates integration files during synchronization, including capacitor.settings.gradle, capacitor.build.gradle, web assets and plugin metadata. Do not hand-maintain those generated files.

From the repository root:

```bash
npm install
npm run build
npx cap sync android
npx cap open android
```

The custom native runtime lives in:

- app/src/main/java/com/yuivo9999/mychat/MainActivity.java
- app/src/main/java/com/yuivo9999/mychat/MyChatRuntimePlugin.java
- app/src/main/python/workspace_runner.py

Chaquopy embeds Python 3.13 into the APK. The Android app supports arm64-v8a and x86_64 in this first native-runtime milestone.