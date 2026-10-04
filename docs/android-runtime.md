# MyChat Android Native Runtime

MyChat is moving from a browser-first architecture to an Android-native runtime while keeping the existing React/Vite UI.

## Runtime architecture

```
React/Vite UI
    │
    ├── Capacitor WebView
    │     └── CapacitorHttp → native Android networking
    │
    └── MyChatRuntime plugin
          └── Chaquopy Python 3.13
                └── disposable native workspace
                      └── script output / text-file changes
                            ↓
                      MyChat Workspace state
```

### Why this exists

The Android build must not depend on a browser CORS policy, a browser JavaScript sandbox for workspace execution, or a local Node/Express server being available on the phone.

Capacitor's native HTTP plugin is enabled globally in capacitor.config.ts, so native Android requests can use the Android networking stack instead of browser fetch/XHR restrictions.

The Agent run_command tool is platform-aware:

- Android: python / python3 is executed by Chaquopy in the native app.
- Browser development: the existing /api/execute-script Node endpoint remains available as a development fallback.

## Python workspace contract

Before a Python run, MyChat copies the current text files from the bound Workspace into an Android-private temporary runtime directory.

The script runs with that directory as the current working directory, HOME, and first entry on sys.path.

After execution, MyChat detects changed and deleted UTF-8 text files and synchronizes them back into the Workspace model.

The runtime currently supports python script.py, python -c, and python -m module; limits one execution to 120 seconds; limits the synchronized text workspace to 25 MB; rejects absolute paths and .. traversal; and does not expose arbitrary Android shell commands.

Binary files are intentionally not rewritten by the first runtime implementation.

## Build

Install dependencies, build the web UI, then synchronize Capacitor:

```bash
npm install
npm run build
npx cap sync android
npx cap open android
```

Android Studio should use the JDK supplied by the current Android Studio release. Capacitor 8 targets Android API 24+ and uses compile/target SDK 36.

Chaquopy 17 is configured for Python 3.13 and arm64-v8a / x86_64.

## Future native capabilities

1. persistent workspace directories;
2. Android Storage Access Framework import/export;
3. native ZIP import/export;
4. Python package management for selected packages;
5. long-running background jobs;
6. native process/log streaming;
7. native file preview and media handling.

The architectural rule is: web UI is presentation; Android native code owns privileged execution and device access.