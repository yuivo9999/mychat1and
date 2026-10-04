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
import android.view.WindowInsets
import android.view.WindowManager
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
import java.security.MessageDigest

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
                .put("port", runtime.port ?: JSONObject.NULL).put("command", command).put("pid", process.pid()).toString()
        } catch (e: Throwable) {
            JSONObject().put("success", false).put("error", e.message ?: e.javaClass.simpleName).toString()
        }
    }

    @JavascriptInterface
    fun getWorkspaceProjectRuntimeState(workspaceId: String): String {
        val runtime = runningProjects[workspaceId] ?: return JSONObject().put("ok", true).put("running", false).toString()
        if (!runtime.process.isAlive && runtime.status == "starting") runtime.status = "error"
        return JSONObject().put("ok", true).put("running", runtime.process.isAlive)
            .put("status", runtime.status).put("port", runtime.port ?: JSONObject.NULL)
            .put("command", runtime.command).put("pid", runtime.process.pid())
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
