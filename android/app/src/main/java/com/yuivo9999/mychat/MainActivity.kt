package com.yuivo9999.mychat

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import android.webkit.WebChromeClient
import android.webkit.ConsoleMessage
import android.util.Log
import android.util.Base64
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.view.WindowInsets
import android.view.WindowManager
import android.view.MotionEvent
import android.view.KeyEvent
import android.os.SystemClock
import android.content.ClipData
import android.content.ClipboardManager
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import com.chaquo.python.Python
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicReference
import java.security.MessageDigest
import java.io.ByteArrayOutputStream

class MainActivity : Activity() {
    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Hide the Android status bar so the Web UI header is never overlapped by system chrome.
        window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            // Fullscreen mode removes the status-bar inset, so explicitly apply the IME
            // inset to the WebView content when the Android keyboard is visible.
            setOnApplyWindowInsetsListener { view, insets ->
                val imeBottom = if (android.os.Build.VERSION.SDK_INT >= 30) {
                    insets.getInsets(WindowInsets.Type.ime()).bottom
                } else {
                    @Suppress("DEPRECATION")
                    insets.systemWindowInsetBottom
                }
                view.setPadding(0, 0, 0, imeBottom)
                insets
            }
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            settings.allowContentAccess = true
            // The web app owns its complete theme palette. Do not let Android/WebView
            // algorithmically darken custom themes and change their colors.
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false)
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: android.webkit.WebResourceRequest,
                ): android.webkit.WebResourceResponse? {
                    return assetLoader.shouldInterceptRequest(request.url)
                }

                @Suppress("DEPRECATION")
                override fun shouldInterceptRequest(
                    view: WebView,
                    url: String,
                ): android.webkit.WebResourceResponse? {
                    return assetLoader.shouldInterceptRequest(android.net.Uri.parse(url))
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                    Log.i("MyChatSmoke", consoleMessage.message())
                    return true
                }
            }
            addJavascriptInterface(AndroidBridge(this@MainActivity, this), "MyChatAndroid")
            val smokeTest = intent.getBooleanExtra("mychat_smoke_test", false)
            loadUrl(
                if (smokeTest) "https://appassets.androidplatform.net/assets/smoke-test.html"
                else "https://appassets.androidplatform.net/assets/www/index.html"
            )
        }

        setContentView(webView)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}

private data class RunningProject(
    val workspaceId: String,
    val process: Process,
    val command: String,
    var port: Int? = null,
    var status: String = "starting",
    var stdout: String = "",
    var stderr: String = "",
    val startedAt: Long = System.currentTimeMillis(),
)

class AndroidBridge(
    private val activity: Activity,
    private val webView: WebView,
) {
    private val executor = Executors.newCachedThreadPool()
    private val runningProjects = java.util.concurrent.ConcurrentHashMap<String, RunningProject>()

    @JavascriptInterface
    fun getRuntimeInfo(): String {
        val nodeBinary = File(activity.applicationInfo.nativeLibraryDir, "libnode.so")
        return JSONObject()
            .put("platform", "android")
            .put("python", Python.getInstance().getModule("sys").get("version").toString())
            .put("node", if (nodeBinary.exists()) "bundled" else "unavailable")
            .toString()
    }

    /**
     * Persist a single text workspace file in the APK's private app storage.
     * This deliberately does not request storage permissions: the workspace is
     * app-private and can later be exported through the Android Storage Access Framework.
     */
    @JavascriptInterface
    fun syncWorkspaceManifest(workspaceId: String, manifestJson: String): String {
        return try {
            val root = workspaceRoot(workspaceId)
            val manifest = JSONObject(manifestJson)
            val expected = mutableSetOf<String>()
            val files = manifest.optJSONArray("files") ?: org.json.JSONArray()
            for (i in 0 until files.length()) {
                val relativePath = files.getString(i)
                workspaceFile(workspaceId, relativePath)
                expected.add(relativePath)
            }
            var deletedCount = 0
            root.walkTopDown().filter { it.isFile }.forEach { file ->
                val relative = root.toPath().relativize(file.toPath()).toString().replace(File.separatorChar, '/')
                if (relative.startsWith("node_modules/") ||
                    relative == ".mychat-runtime" ||
                    relative.startsWith(".mychat-runtime/")) return@forEach
                if (!expected.contains(relative)) {
                    if (file.delete()) deletedCount++
                }
            }
            JSONObject().put("ok", true).put("deletedCount", deletedCount).toString()
        } catch (e: Throwable) {
            JSONObject().put("ok", false).put("error", e.message ?: e.javaClass.simpleName).toString()
        }
    }

    @JavascriptInterface
    fun readWorkspaceFile(workspaceId: String, relativePath: String): String {
        return try {
            val file = workspaceFile(workspaceId, relativePath)
            if (!file.isFile) {
                JSONObject().put("ok", false).put("exists", false).toString()
            } else {
                JSONObject()
                    .put("ok", true)
                    .put("exists", true)
                    .put("path", relativePath)
                    .put("content", file.readText(Charsets.UTF_8))
                    .toString()
            }
        } catch (e: Throwable) {
            JSONObject().put("ok", false).put("exists", false).put("error", e.message ?: e.javaClass.simpleName).toString()
        }
    }

    @JavascriptInterface
    fun writeWorkspaceFile(workspaceId: String, relativePath: String, content: String): String {
        return try {
            val file = workspaceFile(workspaceId, relativePath)
            file.parentFile?.mkdirs()
            file.writeText(content, Charsets.UTF_8)
            JSONObject().put("ok", true).put("path", file.absolutePath).toString()
        } catch (e: Throwable) {
            JSONObject().put("ok", false).put("error", e.message ?: e.javaClass.simpleName).toString()
        }
    }

    @JavascriptInterface
    fun deleteWorkspaceFile(workspaceId: String, relativePath: String): String {
        return try {
            val file = workspaceFile(workspaceId, relativePath)
            val deleted = !file.exists() || file.delete()
            JSONObject().put("ok", deleted).toString()
        } catch (e: Throwable) {
            JSONObject().put("ok", false).put("error", e.message ?: e.javaClass.simpleName).toString()
        }
    }

    @JavascriptInterface
    fun deleteWorkspaceStorage(workspaceId: String): String {
        return try {
            val root = workspaceRoot(workspaceId)
            val deleted = !root.exists() || root.deleteRecursively()
            JSONObject().put("ok", deleted).toString()
        } catch (e: Throwable) {
            JSONObject().put("ok", false).put("error", e.message ?: e.javaClass.simpleName).toString()
        }
    }

    private fun workspaceRoot(workspaceId: String): File {
        require(workspaceId.matches(Regex("[A-Za-z0-9_-]{1,100}"))) { "非法工作区 ID" }
        val root = File(activity.filesDir, "workspaces/$workspaceId").canonicalFile
        val base = File(activity.filesDir, "workspaces").canonicalFile
        require(root.path.startsWith(base.path + File.separator)) { "非法工作区路径" }
        root.mkdirs()
        return root
    }

    private fun workspaceFile(workspaceId: String, relativePath: String): File {
        val normalized = relativePath.replace('\\', '/').trimStart('/')
        require(normalized.isNotEmpty()) { "工作区文件路径不能为空" }
        require(!normalized.split('/').any { it.isEmpty() || it == "." || it == ".." || it.contains(':') }) {
            "非法工作区文件路径"
        }
        val root = workspaceRoot(workspaceId)
        val file = File(root, normalized).canonicalFile
        require(file.path.startsWith(root.path + File.separator)) { "非法工作区文件路径" }
        return file
    }

    @JavascriptInterface
    fun getWorkspaceNodeRuntimeState(workspaceId: String): String {
        return try {
            val root = workspaceRoot(workspaceId)
            val nodeModules = File(root, "node_modules")
            val packageJson = File(root, "package.json")
            val packageLock = File(root, "package-lock.json")
            val yarnLock = File(root, "yarn.lock")
            val pnpmLock = File(root, "pnpm-lock.yaml")
            val bunLock = File(root, "bun.lockb")
            val bunLockText = File(root, "bun.lock")
            val stateFile = dependencyStateFile(root)
            val installedFingerprint = if (stateFile.isFile) {
                try { JSONObject(stateFile.readText(Charsets.UTF_8)).optString("fingerprint", "") } catch (_: Throwable) { "" }
            } else ""
            val fingerprint = dependencyFingerprint(root)
            val state = JSONObject()
                .put("workspaceId", workspaceId)
                .put("workspacePath", root.absolutePath)
                .put("nodeModulesExists", nodeModules.isDirectory)
                .put("nodeModulesCount", if (nodeModules.isDirectory) {
                    nodeModules.listFiles()?.count { it.name != ".package-lock.json" } ?: 0
                } else 0)
                .put("packageJsonExists", packageJson.isFile)
                .put("packageLockExists", packageLock.isFile)
                .put("packageLockModifiedAt", if (packageLock.isFile) packageLock.lastModified() else 0)
                .put("runtimePersistent", nodeModules.isDirectory)
                .put("dependencyFingerprint", fingerprint)
                .put("installedDependencyFingerprint", installedFingerprint)
                .put("dependenciesInSync", nodeModules.isDirectory && fingerprint.isNotEmpty() && fingerprint == installedFingerprint)
                .put("lockfile", when {
                    packageLock.isFile -> "package-lock.json"
                    pnpmLock.isFile -> "pnpm-lock.yaml"
                    yarnLock.isFile -> "yarn.lock"
                    bunLock.isFile -> "bun.lockb"
                    bunLockText.isFile -> "bun.lock"
                    else -> null
                })
            JSONObject().put("ok", true).put("state", state).toString()
        } catch (e: Throwable) {
            JSONObject().put("ok", false).put("error", e.message ?: e.javaClass.simpleName).toString()
        }
    }

    @JavascriptInterface
    fun markWorkspaceDependenciesInstalled(workspaceId: String): String {
        return try {
            val root = workspaceRoot(workspaceId)
            val fingerprint = dependencyFingerprint(root)
            require(fingerprint.isNotEmpty()) { "当前工作区没有 package.json，无法记录依赖指纹" }
            val stateFile = dependencyStateFile(root)
            stateFile.parentFile?.mkdirs()
            stateFile.writeText(
                JSONObject()
                    .put("version", 1)
                    .put("fingerprint", fingerprint)
                    .put("installedAt", System.currentTimeMillis())
                    .toString(),
                Charsets.UTF_8
            )
            JSONObject().put("ok", true).put("fingerprint", fingerprint).toString()
        } catch (e: Throwable) {
            JSONObject().put("ok", false).put("error", e.message ?: e.javaClass.simpleName).toString()
        }
    }

    private fun dependencyStateFile(root: File): File = File(root, ".mychat-runtime/dependency-state.json")

    private fun dependencyFingerprint(root: File): String {
        val packageJson = File(root, "package.json")
        if (!packageJson.isFile) return ""
        val lockCandidates = listOf("package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock")
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update("mychat-deps-v1\n".toByteArray(Charsets.UTF_8))
        for (name in listOf("package.json") + lockCandidates) {
            val file = File(root, name)
            digest.update(name.toByteArray(Charsets.UTF_8))
            digest.update(byteArrayOf(0))
            if (file.isFile) digest.update(file.readBytes())
            digest.update(byteArrayOf(0))
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    /**
     * Native HTTP transport for the file:// WebView runtime.
     */
    @JavascriptInterface
    fun httpRequest(
        url: String,
        method: String,
        headersJson: String,
        body: String,
        timeoutMs: Int,
    ): String {
        // JavascriptInterface calls execute on the WebView/UI thread. Network I/O must
        // happen off that thread or Android can reject it with NetworkOnMainThreadException.
        val future = executor.submit(Callable {
            try {
                val headers = JSONObject(headersJson.ifBlank { "{}" })
                val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = method.uppercase()
                    connectTimeout = timeoutMs.coerceIn(1000, 30000)
                    readTimeout = timeoutMs.coerceIn(1000, 30000)
                    instanceFollowRedirects = true
                    useCaches = false
                    doInput = true
                    if (requestMethod !in setOf("GET", "HEAD")) doOutput = true

                    val keys = headers.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        setRequestProperty(key, headers.optString(key))
                    }
                }

                if (connection.requestMethod !in setOf("GET", "HEAD") && body.isNotEmpty()) {
                    connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                }

                val status = connection.responseCode
                val stream = if (status >= 400) connection.errorStream else connection.inputStream
                val responseBody = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
                val responseHeaders = JSONObject()
                connection.headerFields.forEach { (key, values) ->
                    if (key != null && !values.isNullOrEmpty()) {
                        responseHeaders.put(key, values.joinToString(", "))
                    }
                }
                connection.disconnect()

                JSONObject()
                    .put("ok", status in 200..299)
                    .put("status", status)
                    .put("body", responseBody)
                    .put("headers", responseHeaders)
                    .toString()
            } catch (e: Throwable) {
                JSONObject()
                    .put("ok", false)
                    .put("status", 0)
                    .put("body", "")
                    .put("headers", JSONObject())
                    .put("error", e.message ?: e.javaClass.simpleName)
                    .toString()
            }
        })

        return try {
            future.get(timeoutMs.coerceIn(1000, 30000).toLong() + 1000L, TimeUnit.MILLISECONDS)
        } catch (e: java.util.concurrent.TimeoutException) {
            future.cancel(true)
            JSONObject()
                .put("ok", false)
                .put("status", 0)
                .put("body", "")
                .put("headers", JSONObject())
                .put("error", "Native HTTP request timed out")
                .toString()
        } catch (e: Throwable) {
            JSONObject()
                .put("ok", false)
                .put("status", 0)
                .put("body", "")
                .put("headers", JSONObject())
                .put("error", e.message ?: e.javaClass.simpleName)
                .toString()
        }
    }

    private fun ensureNodeLauncher(): File {
        val binDir = File(activity.filesDir, "node-bin")
        binDir.mkdirs()
        val launcher = File(binDir, "node")
        val nodeBinary = File(activity.applicationInfo.nativeLibraryDir, "libnode.so")
        val script = "#!/system/bin/sh\nexec \"${nodeBinary.absolutePath}\" \"${'$'}@\"\n"
        if (!launcher.isFile || launcher.readText() != script) {
            launcher.writeText(script, Charsets.UTF_8)
            check(launcher.setExecutable(true, false)) { "无法创建 Node launcher 可执行权限" }
        }
        return launcher
    }
    private fun ensureNpmRuntime(): File {
        val bundledRoot = File(activity.filesDir, "node-runtime")
        val npmCli = File(bundledRoot, "node_modules/npm/bin/npm-cli.js")
        if (npmCli.isFile) return npmCli

        val sourceRoot = File(activity.filesDir, "node-runtime-staging")
        if (sourceRoot.exists()) sourceRoot.deleteRecursively()
        sourceRoot.mkdirs()
        copyAssetTree("node-runtime", sourceRoot)
        val stagedNpm = File(sourceRoot, "node_modules/npm")
        if (!stagedNpm.isDirectory) throw IllegalStateException("bundled npm runtime is missing")
        bundledRoot.mkdirs()
        val targetModules = File(bundledRoot, "node_modules")
        targetModules.deleteRecursively()
        copyDirectory(stagedNpm, File(targetModules, "npm"))
        sourceRoot.deleteRecursively()
        return npmCli
    }

    private fun copyAssetTree(assetPath: String, destination: File) {
        val entries = activity.assets.list(assetPath) ?: emptyArray()
        if (entries.isEmpty()) {
            destination.parentFile?.mkdirs()
            activity.assets.open(assetPath).use { input ->
                FileOutputStream(destination).use { output -> input.copyTo(output) }
            }
            return
        }
        destination.mkdirs()
        for (entry in entries) {
            copyAssetTree("$assetPath/$entry", File(destination, entry))
        }
    }

    private fun copyDirectory(source: File, destination: File) {
        if (source.isDirectory) {
            destination.mkdirs()
            source.listFiles()?.forEach { copyDirectory(it, File(destination, it.name)) }
        } else {
            destination.parentFile?.mkdirs()
            source.inputStream().use { input -> FileOutputStream(destination).use { output -> input.copyTo(output) } }
        }
    }

    /**
     * Split npm/npx arguments without destroying quoted values.
     *
     * This is intentionally a small shell-like tokenizer, not a full shell parser:
     * npm commands are launched directly through ProcessBuilder, so shell operators
     * such as pipes and redirects are not interpreted here.
     */
    private fun splitCommandArgs(input: String): List<String> {
        val args = mutableListOf<String>()
        val current = StringBuilder()
        var quote: Char? = null
        var escaping = false

        fun flush() {
            if (current.isNotEmpty()) {
                args.add(current.toString())
                current.setLength(0)
            }
        }

        for (ch in input) {
            when (quote) {
                '\'' -> {
                    if (ch == '\'') {
                        quote = null
                    } else {
                        current.append(ch)
                    }
                }
                '"' -> {
                    if (escaping) {
                        current.append(ch)
                        escaping = false
                    } else if (ch == '\\') {
                        escaping = true
                    } else if (ch == '"') {
                        quote = null
                    } else {
                        current.append(ch)
                    }
                }
                else -> {
                    if (escaping) {
                        current.append(ch)
                        escaping = false
                    } else {
                        when {
                            ch == '\\' -> escaping = true
                            ch == '\'' || ch == '"' -> quote = ch
                            ch.isWhitespace() -> flush()
                            else -> current.append(ch)
                        }
                    }
                }
            }
        }

        if (escaping) current.append('\\')
        require(quote == null) { "命令参数引号未闭合" }
        flush()
        return args
    }
    private fun classifyNpmFailure(stderr: String, stdout: String, error: String): String {
        val text = (stderr + "\n" + stdout + "\n" + error).lowercase()
        return when {
            "eacces" in text || "permission denied" in text -> "permission"
            "getaddrinfo" in text || "fetch failed" in text || "network" in text -> "network"
            "etimedout" in text || "timed out" in text || "timeout" in text -> "timeout"
            "e404" in text || "not found" in text -> "package-not-found"
            "eresolve" in text || "peer dep" in text || "conflicting peer" in text -> "dependency-conflict"
            "node-gyp" in text || "gyp err" in text || "prebuild" in text -> "native-module"
            "enoent" in text -> "missing-runtime-file"
            else -> "unknown"
        }
    }

    private fun runNodeCommandInternal(command: String, timeoutMs: Int, workspaceId: String): Map<String, Any?> {
        val nodeBinary = File(activity.applicationInfo.nativeLibraryDir, "libnode.so")
        require(nodeBinary.isFile) { "Android Node.js runtime is not bundled" }
        val workspacePath = if (workspaceId.isBlank()) activity.filesDir.absolutePath else workspaceRoot(workspaceId).absolutePath
        val trimmed = command.trim()
        val npmCli = if (trimmed == "npm" || trimmed.startsWith("npm ") || trimmed == "npx" || trimmed.startsWith("npx ")) ensureNpmRuntime() else null
        val processBuilder = if (npmCli != null) {
            val isNpx = trimmed == "npx" || trimmed.startsWith("npx ")
            val rawArgs = if (isNpx) trimmed.removePrefix("npx").trim() else trimmed.removePrefix("npm").trim()
            val parsedArgs = splitCommandArgs(rawArgs)
            val args = if (isNpx) listOf("exec", "--") + parsedArgs else parsedArgs
            ProcessBuilder(listOf(nodeBinary.absolutePath, npmCli.absolutePath) + args)
        } else {
            ProcessBuilder("sh", "-c", trimmed)
        }
        processBuilder.directory(File(workspacePath))
        processBuilder.redirectErrorStream(false)
        processBuilder.environment()["LD_LIBRARY_PATH"] = activity.applicationInfo.nativeLibraryDir
        processBuilder.environment()["HOME"] = activity.filesDir.absolutePath
        processBuilder.environment()["npm_config_cache"] = File(activity.filesDir, "npm-cache").absolutePath
        processBuilder.environment()["npm_config_prefix"] = File(activity.filesDir, "npm-global").absolutePath
        processBuilder.environment()["npm_config_audit"] = "false"
        processBuilder.environment()["npm_config_fund"] = "false"
        processBuilder.environment()["TMPDIR"] = activity.cacheDir.absolutePath
        val nodeLauncher = ensureNodeLauncher()
        processBuilder.environment()["PATH"] = nodeLauncher.parentFile!!.absolutePath + File.pathSeparator +
            activity.applicationInfo.nativeLibraryDir + File.pathSeparator + (processBuilder.environment()["PATH"] ?: "")
        processBuilder.environment()["npm_node_execpath"] = nodeBinary.absolutePath
        processBuilder.environment()["npm_execpath"] = npmCli?.absolutePath ?: (processBuilder.environment()["npm_execpath"] ?: "")
        val process = processBuilder.start()
        val stdoutFuture = executor.submit(Callable { process.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() } })
        val stderrFuture = executor.submit(Callable { process.errorStream.bufferedReader(Charsets.UTF_8).use { it.readText() } })
        val completed = process.waitFor(timeoutMs.coerceIn(1000, 120000).toLong(), TimeUnit.MILLISECONDS)
        if (!completed) {
            process.destroyForcibly()
            return mapOf("success" to false, "stdout" to "", "stderr" to "Node command execution timed out", "exitCode" to -1, "error" to "Node command execution timed out")
        }
        return mapOf(
            "success" to (process.exitValue() == 0),
            "stdout" to stdoutFuture.get(1000, TimeUnit.MILLISECONDS),
            "stderr" to stderrFuture.get(1000, TimeUnit.MILLISECONDS),
            "exitCode" to process.exitValue(),
            "error" to null
        )
    }

    @JavascriptInterface
    fun installWorkspaceDependencies(workspaceId: String, timeoutMs: Int = 120000): String {
        return try {
            val root = workspaceRoot(workspaceId)
            val packageJson = File(root, "package.json")
            require(packageJson.isFile) { "当前工作区没有 package.json" }
            val packageLock = File(root, "package-lock.json")
            val hadExistingLockfile = packageLock.isFile
            val command = if (hadExistingLockfile) "npm ci --no-audit --no-fund" else "npm install --no-audit --no-fund"
            val nodeModules = File(root, "node_modules")
            val backup = File(root, ".mychat-runtime/node_modules.backup")
            backup.parentFile?.mkdirs()
            if (backup.exists()) backup.deleteRecursively()
            var hadExisting = nodeModules.isDirectory
            if (hadExisting) check(nodeModules.renameTo(backup)) { "无法保护现有 node_modules" }
            val result = try {
                runNodeCommandInternal(command, timeoutMs, workspaceId)
            } catch (e: Throwable) {
                mapOf<String, Any?>("success" to false, "stdout" to "", "stderr" to "", "exitCode" to -1, "error" to (e.message ?: e.javaClass.simpleName))
            }
            val success = result["success"] == true
            if (success) {
                if (backup.exists()) backup.deleteRecursively()
            } else {
                if (nodeModules.exists()) nodeModules.deleteRecursively()
                if (hadExisting && backup.exists()) check(backup.renameTo(nodeModules)) { "依赖安装失败，且旧 node_modules 恢复失败" }
                if (!hadExistingLockfile && packageLock.exists()) {
                    check(packageLock.delete()) { "依赖安装失败，且新生成的 package-lock.json 清理失败" }
                }
            }
            JSONObject().apply {
                put("success", success)
                put("command", command)
                put("stdout", result["stdout"]?.toString() ?: "")
                put("stderr", result["stderr"]?.toString() ?: "")
                put("exitCode", (result["exitCode"] as? Number)?.toInt() ?: -1)
                if (result["error"] != null) put("error", result["error"].toString())
                put("recoveredPreviousDependencies", !success && hadExisting && nodeModules.isDirectory)
                put("generatedLockfileRolledBack", !success && !hadExistingLockfile)
                put("failureCategory", if (success) JSONObject.NULL else classifyNpmFailure(result["stderr"]?.toString() ?: "", result["stdout"]?.toString() ?: "", result["error"]?.toString() ?: ""))
            }.toString()
        } catch (e: Throwable) {
            JSONObject().put("success", false).put("error", e.message ?: e.javaClass.simpleName).toString()
        }
    }


    @JavascriptInterface
    fun startWorkspaceProject(workspaceId: String, command: String, timeoutMs: Int = 8000): String {
        return try {
            stopWorkspaceProject(workspaceId)
            val root = workspaceRoot(workspaceId)
            require(File(root, "package.json").isFile) { "当前工作区没有 package.json" }
            val nodeBinary = File(activity.applicationInfo.nativeLibraryDir, "libnode.so")
            require(nodeBinary.isFile) { "Android Node.js runtime is not bundled" }
            val npmCli = if (command.trim().startsWith("npm ") || command.trim() == "npm" || command.trim().startsWith("npx ") || command.trim() == "npx") ensureNpmRuntime() else null
            val trimmed = command.trim()
            val processBuilder = if (npmCli != null) {
                val isNpx = trimmed == "npx" || trimmed.startsWith("npx ")
                val rawArgs = if (isNpx) trimmed.removePrefix("npx").trim() else trimmed.removePrefix("npm").trim()
                val parsedArgs = splitCommandArgs(rawArgs)
                val args = if (isNpx) listOf("exec", "--") + parsedArgs else parsedArgs
                ProcessBuilder(listOf(nodeBinary.absolutePath, npmCli.absolutePath) + args)
            } else if (trimmed.startsWith("node -e ")) {
                val encoded = trimmed.removePrefix("node -e ").trim()
                val code = org.json.JSONTokener(encoded).nextValue() as? String ?: throw IllegalArgumentException("node -e 参数不是有效 JSON 字符串")
                ProcessBuilder(nodeBinary.absolutePath, "-e", code)
            } else {
                ProcessBuilder("sh", "-c", trimmed)
            }
            configureNodeEnvironment(processBuilder, nodeBinary, npmCli)
            val process = processBuilder.directory(root).redirectErrorStream(false).start()
            val runtime = RunningProject(workspaceId, process, command)
            runningProjects[workspaceId] = runtime
            executor.submit {
                try {
                    process.inputStream.bufferedReader(Charsets.UTF_8).forEachLine { line ->
                        runtime.stdout = (runtime.stdout + line + "\\n").takeLast(20000)
                        val match = Regex("""(?:localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0):([0-9]{2,5})""").find(line)
                        if (match != null) runtime.port = match.groupValues[1].toIntOrNull()
                    }
                } catch (_: Throwable) {}
            }
            executor.submit {
                try {
                    process.errorStream.bufferedReader(Charsets.UTF_8).forEachLine { line -> runtime.stderr = (runtime.stderr + line + "\\n").takeLast(20000) }
                } catch (_: Throwable) {}
            }
            executor.submit {
                try {
                    val code = process.waitFor()
                    runtime.status = if (code == 0) "stopped" else "error"
                } catch (_: Throwable) { runtime.status = "error" }
            }
            val deadline = System.currentTimeMillis() + timeoutMs.coerceIn(1000, 15000)
            while (runtime.port == null && runtime.status == "starting" && System.currentTimeMillis() < deadline) Thread.sleep(100)
            JSONObject().put("success", true).put("workspaceId", workspaceId).put("status", runtime.status)
                .put("port", runtime.port ?: JSONObject.NULL).put("command", command).put("pid", JSONObject.NULL).toString()
        } catch (e: Throwable) {
            JSONObject().put("success", false).put("error", e.message ?: e.javaClass.simpleName).toString()
        }
    }

    @JavascriptInterface
    fun captureProjectRuntimeScreenshot(workspaceId: String, quality: Int = 72, viewport: String = "mobile"): String {
        val result = AtomicReference<JSONObject?>(null)
        val latch = CountDownLatch(1)
        activity.runOnUiThread {
            try {
                val script = """
                    (() => {
                      const iframe = document.querySelector('iframe[title="Workspace Preview"]');
                      if (!iframe) return '';
                      const r = iframe.getBoundingClientRect();
                      return JSON.stringify({left:r.left, top:r.top, width:r.width, height:r.height, dpr:window.devicePixelRatio || 1});
                    })()
                """.trimIndent()
                webView.evaluateJavascript(script) { rawBounds ->
                    try {
                        val jsonText = try {
                            (org.json.JSONTokener(rawBounds ?: "").nextValue() as? String) ?: ""
                        } catch (_: Throwable) {
                            ""
                        }
                        if (jsonText.isBlank()) {
                            result.set(JSONObject().put("success", false).put("error", "当前预览区没有可截图的项目 iframe"))
                            latch.countDown()
                            return@evaluateJavascript
                        }
                        val bounds = JSONObject(jsonText)
                        val dpr = bounds.optDouble("dpr", 1.0).coerceIn(1.0, 3.0)
                        val left = (bounds.optDouble("left") * dpr).toInt().coerceAtLeast(0)
                        val top = (bounds.optDouble("top") * dpr).toInt().coerceAtLeast(0)
                        val right = ((bounds.optDouble("left") + bounds.optDouble("width")) * dpr).toInt().coerceAtMost(webView.width)
                        val bottom = ((bounds.optDouble("top") + bounds.optDouble("height")) * dpr).toInt().coerceAtMost(webView.height)
                        if (right <= left || bottom <= top) {
                            result.set(JSONObject().put("success", false).put("error", "预览区截图范围无效"))
                            latch.countDown()
                            return@evaluateJavascript
                        }
                        val full = Bitmap.createBitmap(webView.width.coerceAtLeast(1), webView.height.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                        webView.draw(Canvas(full))
                        val cropped = Bitmap.createBitmap(full, left, top, right - left, bottom - top)
                        full.recycle()
                        val maxWidth = 1280
                        val finalBitmap = if (cropped.width > maxWidth) {
                            val scaledHeight = (cropped.height.toFloat() * maxWidth / cropped.width).toInt().coerceAtLeast(1)
                            Bitmap.createScaledBitmap(cropped, maxWidth, scaledHeight, true).also { cropped.recycle() }
                        } else cropped
                        val output = ByteArrayOutputStream()
                        finalBitmap.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(45, 90), output)
                        finalBitmap.recycle()
                        val dataUrl = "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
                        result.set(JSONObject()
                            .put("success", true)
                            .put("workspaceId", workspaceId)
                            .put("width", right - left)
                            .put("height", bottom - top)
                            .put("viewport", viewport)
                            .put("dataUrl", dataUrl))
                    } catch (e: Throwable) {
                        result.set(JSONObject().put("success", false).put("error", e.message ?: e.javaClass.simpleName))
                    } finally {
                        latch.countDown()
                    }
                }
            } catch (e: Throwable) {
                result.set(JSONObject().put("success", false).put("error", e.message ?: e.javaClass.simpleName))
                latch.countDown()
            }
        }
        if (!latch.await(4, TimeUnit.SECONDS)) {
            return JSONObject().put("success", false).put("error", "项目预览截图超时").toString()
        }
        return (result.get() ?: JSONObject().put("success", false).put("error", "项目预览截图失败")).toString()
    }

    @JavascriptInterface
    fun discoverProjectPreviewElements(workspaceId: String): String {
        val started = SystemClock.uptimeMillis()
        val result = AtomicReference<JSONObject?>(null)
        val latch = CountDownLatch(1)
        activity.runOnUiThread {
            try {
                val script = """
                    (() => {
                      try {
                        const iframe = document.querySelector('iframe[title="Workspace Preview"]');
                        if (!iframe) return JSON.stringify({success:false,error:"当前没有可发现的手机项目 iframe"});
                        const doc = iframe.contentDocument;
                        if (!doc) return JSON.stringify({success:false,crossOrigin:true,error:"iframe DOM 不可访问（跨域）"});
                        const selectors = 'button,a,input,textarea,select,[role="button"],[role="link"],[role="textbox"],[tabindex]:not([tabindex="-1"])';
                        const nodes = Array.from(doc.querySelectorAll(selectors)).slice(0,60);
                        const elements = nodes.map((el, index) => {
                          const r = el.getBoundingClientRect();
                          const rawValue = 'value' in el ? String(el.value || '') : '';
                          const text = String(el.innerText || rawValue || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\\s+/g,' ').slice(0,120);
                          const id = el.id ? '#' + CSS.escape(el.id) : '';
                          const testId = el.getAttribute('data-testid');
                          const selector = id || (testId ? '[data-testid="' + CSS.escape(testId) + '"]' : '');
                          return {index,tag:el.tagName.toLowerCase(),role:el.getAttribute('role')||'',type:el.getAttribute('type')||'',text,aria:el.getAttribute('aria-label')||'',title:el.getAttribute('title')||'',value:rawValue.slice(0,160),focused:doc.activeElement===el,disabled:!!el.disabled,visible:r.width>0&&r.height>0,x:Math.round(r.left),y:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height),selector};
                        }).filter(e => e.visible);
                        const active = doc.activeElement;
                        const scrollRoot = doc.scrollingElement || doc.documentElement;
                        return JSON.stringify({success:true,crossOrigin:false,workspaceId,viewport:"mobile-390x780",count:elements.length,elements,activeTag:active?.tagName?.toLowerCase()||"",activeText:String(active?.value||active?.innerText||active?.getAttribute?.("aria-label")||"").slice(0,160),scrollTop:Math.round(scrollRoot?.scrollTop||0),scrollHeight:Math.round(scrollRoot?.scrollHeight||0),clientHeight:Math.round(scrollRoot?.clientHeight||0),durationMs:Date.now()});
                      } catch (e) { return JSON.stringify({success:false,crossOrigin:true,error:"无法读取 iframe DOM：" + (e?.message || e)}); }
                    })()
                """.trimIndent()
                webView.evaluateJavascript(script) { raw ->
                    try {
                        val text = (org.json.JSONTokener(raw ?: "").nextValue() as? String) ?: ""
                        result.set(if (text.isNotBlank()) JSONObject(text) else JSONObject().put("success", false).put("error", "预览元素发现无返回"))
                    } catch (e: Throwable) { result.set(JSONObject().put("success", false).put("error", e.message ?: "预览元素发现失败")) }
                    latch.countDown()
                }
            } catch (e: Throwable) {
                result.set(JSONObject().put("success", false).put("error", e.message ?: e.javaClass.simpleName))
                latch.countDown()
            }
        }
        if (!latch.await(3, TimeUnit.SECONDS)) return JSONObject().put("success", false).put("error", "预览元素发现超时").toString()
        return (result.get() ?: JSONObject().put("success", false).put("error", "预览元素发现失败")).put("durationMs", SystemClock.uptimeMillis() - started).toString()
    }

    @JavascriptInterface
    fun interactProjectPreview(
        workspaceId: String,
        action: String,
        target: String = "",
        value: String = "",
        x: Int = -1,
        y: Int = -1,
    ): String {
        val started = SystemClock.uptimeMillis()
        val normalized = action.trim().lowercase()
        if (normalized !in setOf("tap", "type", "scroll", "back", "wait")) {
            return JSONObject().put("success", false).put("error", "不支持的交互动作: $action").toString()
        }
        fun finish(success: Boolean, message: String? = null, error: String? = null): String =
            JSONObject().put("success", success).put("action", normalized).put("workspaceId", workspaceId)
                .put("message", message ?: JSONObject.NULL).put("error", error ?: JSONObject.NULL)
                .put("durationMs", SystemClock.uptimeMillis() - started).toString()
        if (normalized == "wait") {
            val delay = value.toLongOrNull()?.coerceIn(0L, 5000L) ?: 500L
            Thread.sleep(delay)
            return finish(true, "已等待 ${delay}ms")
        }
        val result = AtomicReference<JSONObject?>(null)
        val latch = CountDownLatch(1)
        activity.runOnUiThread {
            try {
                val boundsScript = """
                    (() => {
                      const iframe = document.querySelector('iframe[title="Workspace Preview"]');
                      if (!iframe) return '';
                      const r = iframe.getBoundingClientRect();
                      return JSON.stringify({left:r.left, top:r.top, width:r.width, height:r.height, dpr:window.devicePixelRatio || 1});
                    })()
                """.trimIndent()
                webView.evaluateJavascript(boundsScript) { rawBounds ->
                    try {
                        val jsonText = try { (org.json.JSONTokener(rawBounds ?: "").nextValue() as? String) ?: "" } catch (_: Throwable) { "" }
                        if (jsonText.isBlank()) {
                            result.set(JSONObject().put("success", false).put("error", "当前没有可交互的手机项目 iframe"))
                            latch.countDown()
                            return@evaluateJavascript
                        }
                        val bounds = JSONObject(jsonText)
                        val dpr = bounds.optDouble("dpr", 1.0).coerceIn(1.0, 3.0)
                        val left = bounds.optDouble("left")
                        val top = bounds.optDouble("top")
                        val width = bounds.optDouble("width")
                        val height = bounds.optDouble("height")
                        fun nativePoint(px: Int, py: Int): Pair<Float, Float> {
                            val cx = px.coerceIn(0, width.toInt().coerceAtLeast(1))
                            val cy = py.coerceIn(0, height.toInt().coerceAtLeast(1))
                            return Pair(((left + cx) * dpr).toFloat(), ((top + cy) * dpr).toFloat())
                        }
                        fun dispatchTap(px: Int, py: Int) {
                            val (tx, ty) = nativePoint(px, py)
                            val t = SystemClock.uptimeMillis()
                            webView.dispatchTouchEvent(MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, tx, ty, 0))
                            webView.dispatchTouchEvent(MotionEvent.obtain(t, t + 45, MotionEvent.ACTION_UP, tx, ty, 0))
                        }
                        when (normalized) {
                            "tap" -> {
                                if (target.isNotBlank()) {
                                    val script = """
                                        (() => {
                                          try {
                                            const iframe = document.querySelector('iframe[title="Workspace Preview"]');
                                            const doc = iframe?.contentDocument;
                                            const el = doc?.querySelector(${JSONObject.quote(target)});
                                            if (!el) return JSON.stringify({success:false,error:"未找到 selector"});
                                            el.scrollIntoView({block:"center",inline:"center"});
                                            el.click();
                                            return JSON.stringify({success:true,message:"selector click"});
                                          } catch (e) {
                                            return JSON.stringify({success:false,error:"iframe DOM 不可访问，请改用坐标点击"});
                                          }
                                        })()
                                    """.trimIndent()
                                    webView.evaluateJavascript(script) { raw ->
                                        val text = try { (org.json.JSONTokener(raw ?: "").nextValue() as? String) ?: "" } catch (_: Throwable) { "" }
                                        result.set(if (text.isNotBlank()) JSONObject(text) else JSONObject().put("success", false).put("error", "selector 点击无返回"))
                                        latch.countDown()
                                    }
                                    return@evaluateJavascript
                                }
                                if (x < 0 || y < 0) result.set(JSONObject().put("success", false).put("error", "tap 需要 target 或 x/y"))
                                else { dispatchTap(x, y); result.set(JSONObject().put("success", true).put("message", "已执行手机坐标点击 (${x},${y})")) }
                            }
                            "type" -> {
                                if (target.isNotBlank()) {
                                    val script = """
                                        (() => {
                                          try {
                                            const iframe = document.querySelector('iframe[title="Workspace Preview"]');
                                            const doc = iframe?.contentDocument;
                                            const el = doc?.querySelector(${JSONObject.quote(target)});
                                            if (!el) return JSON.stringify({success:false,error:"未找到输入 selector"});
                                            el.focus();
                                            return JSON.stringify({success:true,message:"input focused"});
                                          } catch (e) {
                                            return JSON.stringify({success:false,error:"iframe DOM 不可访问，请先坐标点击输入框"});
                                          }
                                        })()
                                    """.trimIndent()
                                    webView.evaluateJavascript(script) { raw ->
                                        val text = try { (org.json.JSONTokener(raw ?: "").nextValue() as? String) ?: "" } catch (_: Throwable) { "" }
                                        val p = if (text.isNotBlank()) JSONObject(text) else JSONObject().put("success", false).put("error", "输入框 focus 无返回")
                                        if (p.optBoolean("success", false)) { pasteTextIntoFocusedField(value); result.set(JSONObject().put("success", true).put("message", "已向输入框粘贴文本")) }
                                        else result.set(p)
                                        latch.countDown()
                                    }
                                    return@evaluateJavascript
                                }
                                if (value.isBlank()) result.set(JSONObject().put("success", false).put("error", "type 需要输入 value"))
                                else { pasteTextIntoFocusedField(value); result.set(JSONObject().put("success", true).put("message", "已向当前焦点输入文本")) }
                            }
                            "scroll" -> {
                                val distance = value.toIntOrNull()?.coerceIn(-1200, 1200) ?: 520
                                val script = """
                                    (() => {
                                      try {
                                        const iframe = document.querySelector('iframe[title="Workspace Preview"]');
                                        const win = iframe?.contentWindow;
                                        if (!win) return JSON.stringify({success:false,error:"未找到预览 iframe"});
                                        win.scrollBy({top:$distance,left:0,behavior:"instant"});
                                        return JSON.stringify({success:true,message:"iframe scroll"});
                                      } catch (e) {
                                        return JSON.stringify({success:false,error:"iframe DOM 不可访问，将使用原生滑动"});
                                      }
                                    })()
                                """.trimIndent()
                                webView.evaluateJavascript(script) { raw ->
                                    val text = try { (org.json.JSONTokener(raw ?: "").nextValue() as? String) ?: "" } catch (_: Throwable) { "" }
                                    val p = if (text.isNotBlank()) JSONObject(text) else JSONObject().put("success", false)
                                    if (p.optBoolean("success", false)) { result.set(p); latch.countDown() }
                                    else {
                                        val fromY = if (distance > 0) height * 0.72 else height * 0.28
                                        val toY = if (distance > 0) height * 0.28 else height * 0.72
                                        val (fx, fy) = nativePoint((width / 2).toInt(), fromY.toInt())
                                        val (_, ty) = nativePoint((width / 2).toInt(), toY.toInt())
                                        val t = SystemClock.uptimeMillis()
                                        webView.dispatchTouchEvent(MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, fx, fy, 0))
                                        webView.dispatchTouchEvent(MotionEvent.obtain(t, t + 280, MotionEvent.ACTION_MOVE, fx, ty, 0))
                                        webView.dispatchTouchEvent(MotionEvent.obtain(t, t + 320, MotionEvent.ACTION_UP, fx, ty, 0))
                                        result.set(JSONObject().put("success", true).put("message", "已执行手机原生滑动")); latch.countDown()
                                    }
                                }
                                return@evaluateJavascript
                            }
                            "back" -> {
                                val script = """
                                    (() => {
                                      try {
                                        const iframe = document.querySelector('iframe[title="Workspace Preview"]');
                                        if (!iframe?.contentWindow) return JSON.stringify({success:false,error:"未找到预览 iframe"});
                                        iframe.contentWindow.history.back();
                                        return JSON.stringify({success:true,message:"已执行预览页面返回"});
                                      } catch (e) {
                                        return JSON.stringify({success:false,error:"live iframe 跨源无法执行 history.back"});
                                      }
                                    })()
                                """.trimIndent()
                                webView.evaluateJavascript(script) { raw ->
                                    val text = try { (org.json.JSONTokener(raw ?: "").nextValue() as? String) ?: "" } catch (_: Throwable) { "" }
                                    result.set(if (text.isNotBlank()) JSONObject(text) else JSONObject().put("success", false).put("error", "返回操作无结果"))
                                    latch.countDown()
                                }
                                return@evaluateJavascript
                            }
                        }
                    } catch (e: Throwable) {
                        result.set(JSONObject().put("success", false).put("error", e.message ?: e.javaClass.simpleName)); latch.countDown()
                    }
                }
            } catch (e: Throwable) {
                result.set(JSONObject().put("success", false).put("error", e.message ?: e.javaClass.simpleName)); latch.countDown()
            }
        }
        if (!latch.await(5, TimeUnit.SECONDS)) return finish(false, error = "手机项目交互超时")
        val payload = result.get() ?: return finish(false, error = "手机项目交互失败")
        payload.put("action", normalized).put("workspaceId", workspaceId).put("durationMs", SystemClock.uptimeMillis() - started)
        return payload.toString()
    }

    private fun pasteTextIntoFocusedField(text: String) {
        val clipboard = activity.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as ClipboardManager
        val previous = clipboard.primaryClip
        clipboard.setPrimaryClip(ClipData.newPlainText("MyChat Agent input", text))
        webView.dispatchKeyEvent(KeyEvent(SystemClock.uptimeMillis(), SystemClock.uptimeMillis(), KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_V, 0, KeyEvent.META_CTRL_ON))
        webView.dispatchKeyEvent(KeyEvent(SystemClock.uptimeMillis(), SystemClock.uptimeMillis(), KeyEvent.ACTION_UP, KeyEvent.KEYCODE_V, 0, KeyEvent.META_CTRL_ON))
        if (previous != null) clipboard.setPrimaryClip(previous)
    }


    @JavascriptInterface
    fun getWorkspaceProjectRuntimeState(workspaceId: String): String {
        val runtime = runningProjects[workspaceId] ?: return JSONObject().put("ok", true).put("running", false).toString()
        if (!runtime.process.isAlive && runtime.status == "starting") runtime.status = "error"
        return JSONObject().put("ok", true).put("running", runtime.process.isAlive)
            .put("status", runtime.status).put("port", runtime.port ?: JSONObject.NULL)
            .put("command", runtime.command).put("pid", JSONObject.NULL)
            .put("stdout", runtime.stdout.takeLast(12000)).put("stderr", runtime.stderr.takeLast(12000))
            .put("startedAt", runtime.startedAt).toString()
    }

    @JavascriptInterface
    fun stopWorkspaceProject(workspaceId: String): String {
        val runtime = runningProjects.remove(workspaceId) ?: return JSONObject().put("success", true).put("running", false).toString()
        return try {
            runtime.process.destroy()
            if (!runtime.process.waitFor(1500, TimeUnit.MILLISECONDS)) runtime.process.destroyForcibly()
            JSONObject().put("success", true).put("running", false).toString()
        } catch (e: Throwable) {
            JSONObject().put("success", false).put("error", e.message ?: e.javaClass.simpleName).toString()
        }
    }

    @JavascriptInterface
    fun executeNode(command: String, timeoutMs: Int, workspaceId: String = ""): String {
        val nodeBinary = File(activity.applicationInfo.nativeLibraryDir, "libnode.so")
        if (!nodeBinary.isFile) {
            return JSONObject()
                .put("success", false)
                .put("stdout", "")
                .put("stderr", "Android Node.js runtime is not bundled")
                .put("exitCode", -1)
                .put("error", "Node.js runtime unavailable. Build the APK after preparing the bundled runtime.")
                .toString()
        }

        val workspacePath = if (workspaceId.isBlank()) {
            activity.filesDir.absolutePath
        } else {
            workspaceRoot(workspaceId).absolutePath
        }

        val future = executor.submit(Callable {
            val trimmed = command.trim()
            val npmCli = if (
                trimmed == "npm" || trimmed.startsWith("npm ") ||
                trimmed == "npx" || trimmed.startsWith("npx ")
            ) ensureNpmRuntime() else null

            val processBuilder = if (npmCli != null) {
                val isNpx = trimmed == "npx" || trimmed.startsWith("npx ")
                val rawArgs = if (isNpx) trimmed.removePrefix("npx").trim() else trimmed.removePrefix("npm").trim()
                val parsedArgs = splitCommandArgs(rawArgs)
                val args = if (isNpx) listOf("exec", "--") + parsedArgs else parsedArgs
                ProcessBuilder(listOf(nodeBinary.absolutePath, npmCli.absolutePath) + args)
            } else if (trimmed.startsWith("node -e ")) {
                val encoded = trimmed.removePrefix("node -e ").trim()
                val code = org.json.JSONTokener(encoded).nextValue() as? String
                    ?: throw IllegalArgumentException("node -e 参数不是有效 JSON 字符串")
                ProcessBuilder(nodeBinary.absolutePath, "-e", code)
            } else if (trimmed == "node" || trimmed.startsWith("node ")) {
                val rawArgs = trimmed.removePrefix("node").trim()
                val args = splitCommandArgs(rawArgs)
                ProcessBuilder(listOf(nodeBinary.absolutePath) + args)
            } else {
                ProcessBuilder("sh", "-c", trimmed)
            }

            configureNodeEnvironment(processBuilder, nodeBinary, npmCli)

            val process = processBuilder
                .directory(File(workspacePath))
                .redirectErrorStream(false)
                .start()

            val stdoutFuture = executor.submit(Callable {
                process.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            })
            val stderrFuture = executor.submit(Callable {
                process.errorStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            })

            val completed = process.waitFor(
                timeoutMs.coerceIn(1000, 120000).toLong(),
                TimeUnit.MILLISECONDS
            )

            if (!completed) {
                process.destroyForcibly()
                return@Callable mapOf(
                    "success" to false,
                    "stdout" to stdoutFuture.get(1000, TimeUnit.MILLISECONDS),
                    "stderr" to (stderrFuture.get(1000, TimeUnit.MILLISECONDS) + "\nNode command execution timed out"),
                    "exitCode" to -1,
                    "error" to "Node command execution timed out"
                )
            }

            mapOf(
                "success" to (process.exitValue() == 0),
                "stdout" to stdoutFuture.get(1000, TimeUnit.MILLISECONDS),
                "stderr" to stderrFuture.get(1000, TimeUnit.MILLISECONDS),
                "exitCode" to process.exitValue(),
                "error" to null
            )
        })

        return try {
            val result = future.get(timeoutMs.coerceIn(1000, 120000).toLong() + 2000, TimeUnit.MILLISECONDS)
            val map = result as Map<*, *>
            JSONObject().apply {
                put("success", map["success"] == true)
                put("stdout", map["stdout"]?.toString() ?: "")
                put("stderr", map["stderr"]?.toString() ?: "")
                put("exitCode", (map["exitCode"] as? Number)?.toInt() ?: 1)
                put("error", map["error"]?.toString())
            }.toString()
        } catch (e: java.util.concurrent.TimeoutException) {
            future.cancel(true)
            JSONObject()
                .put("success", false)
                .put("stdout", "")
                .put("stderr", "Node 命令执行超时")
                .put("exitCode", -1)
                .put("error", "Node command execution timed out")
                .toString()
        } catch (e: Throwable) {
            future.cancel(true)
            JSONObject()
                .put("success", false)
                .put("stdout", "")
                .put("stderr", e.stackTraceToString())
                .put("exitCode", -1)
                .put("error", e.message ?: e.javaClass.simpleName)
                .toString()
        }
    }


    private fun configureNodeEnvironment(
        processBuilder: ProcessBuilder,
        nodeBinary: File,
        npmCli: File?,
    ) {
        processBuilder.environment()["LD_LIBRARY_PATH"] = activity.applicationInfo.nativeLibraryDir
        processBuilder.environment()["HOME"] = activity.filesDir.absolutePath
        processBuilder.environment()["npm_config_cache"] = File(activity.filesDir, "npm-cache").absolutePath
        processBuilder.environment()["npm_config_prefix"] = File(activity.filesDir, "npm-global").absolutePath
        processBuilder.environment()["npm_config_audit"] = "false"
        processBuilder.environment()["npm_config_fund"] = "false"
        processBuilder.environment()["TMPDIR"] = activity.cacheDir.absolutePath
        val nodeLauncher = ensureNodeLauncher()
        processBuilder.environment()["PATH"] = nodeLauncher.parentFile!!.absolutePath +
            File.pathSeparator + activity.applicationInfo.nativeLibraryDir +
            File.pathSeparator + (processBuilder.environment()["PATH"] ?: "")
        processBuilder.environment()["npm_node_execpath"] = nodeBinary.absolutePath
        processBuilder.environment()["npm_execpath"] =
            npmCli?.absolutePath ?: (processBuilder.environment()["npm_execpath"] ?: "")
    }

    @JavascriptInterface
    fun executeCommand(command: String, timeoutMs: Int, workspaceId: String = ""): String {
        val workspacePath = if (workspaceId.isBlank()) {
            activity.filesDir.absolutePath
        } else {
            workspaceRoot(workspaceId).absolutePath
        }

        val future = executor.submit(Callable {
            val process = ProcessBuilder("sh", "-c", command)
                .directory(File(workspacePath))
                .redirectErrorStream(false)
                .start()

            val stdoutFuture = executor.submit(Callable {
                process.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            })
            val stderrFuture = executor.submit(Callable {
                process.errorStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            })

            val completed = process.waitFor(
                timeoutMs.coerceIn(1000, 120000).toLong(),
                TimeUnit.MILLISECONDS
            )

            if (!completed) {
                process.destroyForcibly()
                return@Callable mapOf(
                    "success" to false,
                    "stdout" to stdoutFuture.get(1000, TimeUnit.MILLISECONDS),
                    "stderr" to (stderrFuture.get(1000, TimeUnit.MILLISECONDS) + "\nCommand execution timed out"),
                    "exitCode" to -1,
                    "error" to "Command execution timed out"
                )
            }

            mapOf(
                "success" to (process.exitValue() == 0),
                "stdout" to stdoutFuture.get(1000, TimeUnit.MILLISECONDS),
                "stderr" to stderrFuture.get(1000, TimeUnit.MILLISECONDS),
                "exitCode" to process.exitValue(),
                "error" to null
            )
        })

        return try {
            val result = future.get(timeoutMs.coerceIn(1000, 120000).toLong() + 2000, TimeUnit.MILLISECONDS)
            val map = result as Map<*, *>
            JSONObject().apply {
                put("success", map["success"] == true)
                put("stdout", map["stdout"]?.toString() ?: "")
                put("stderr", map["stderr"]?.toString() ?: "")
                put("exitCode", (map["exitCode"] as? Number)?.toInt() ?: 1)
                put("error", map["error"]?.toString())
            }.toString()
        } catch (e: java.util.concurrent.TimeoutException) {
            future.cancel(true)
            JSONObject()
                .put("success", false)
                .put("stdout", "")
                .put("stderr", "命令执行超时")
                .put("exitCode", -1)
                .put("error", "Command execution timed out")
                .toString()
        } catch (e: Throwable) {
            JSONObject()
                .put("success", false)
                .put("stdout", "")
                .put("stderr", e.stackTraceToString())
                .put("exitCode", -1)
                .put("error", e.message ?: e.javaClass.simpleName)
                .toString()
        }
    }

    @JavascriptInterface
    fun executePython(code: String, timeoutMs: Int, workspaceId: String = ""): String {
        val workspacePath = if (workspaceId.isBlank()) {
            null
        } else {
            workspaceRoot(workspaceId).absolutePath
        }

        val future = executor.submit(Callable {
            val runner = Python.getInstance().getModule("runner")
            val result = if (workspacePath == null) {
                runner.callAttr("execute", code)
            } else {
                runner.callAttr("execute", code, workspacePath)
            }
            result.toJava(Map::class.java)
        })

        return try {
            val result = future.get(timeoutMs.coerceIn(1000, 120000).toLong(), TimeUnit.MILLISECONDS)
            val map = result as Map<*, *>
            JSONObject().apply {
                put("success", map["success"] == true)
                put("stdout", map["stdout"]?.toString() ?: "")
                put("stderr", map["stderr"]?.toString() ?: "")
                put("exitCode", (map["exitCode"] as? Number)?.toInt() ?: 1)
                put("error", map["error"]?.toString())
            }.toString()
        } catch (e: java.util.concurrent.TimeoutException) {
            future.cancel(true)
            JSONObject()
                .put("success", false)
                .put("stdout", "")
                .put("stderr", "Python 执行超时")
                .put("exitCode", -1)
                .put("error", "Python execution timed out")
                .toString()
        } catch (e: Throwable) {
            JSONObject()
                .put("success", false)
                .put("stdout", "")
                .put("stderr", e.stackTraceToString())
                .put("exitCode", -1)
                .put("error", e.message ?: e.javaClass.simpleName)
                .toString()
        }
    }
}
