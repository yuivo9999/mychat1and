package com.yuivo9999.mychat

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import com.chaquo.python.Python
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class MainActivity : Activity() {
    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            settings.allowContentAccess = true
            webViewClient = WebViewClient()
            addJavascriptInterface(AndroidBridge(this@MainActivity, this), "MyChatAndroid")
            loadUrl("file:///android_asset/www/index.html")
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

class AndroidBridge(
    private val activity: Activity,
    private val webView: WebView,
) {
    private val executor = Executors.newCachedThreadPool()

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
        return try {
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
    }

    private fun ensureNpmRuntime(): File {
        val root = File(activity.filesDir, "node-runtime")
        val npmCli = File(root, "node_modules/npm/bin/npm-cli.js")
        if (npmCli.isFile) return npmCli

        val archive = File(activity.cacheDir, "npm.tar.gz")
        activity.assets.open("node-runtime/npm.tar.gz").use { input ->
            FileOutputStream(archive).use { output -> input.copyTo(output) }
        }
        root.mkdirs()
        val process = ProcessBuilder("tar", "-xzf", archive.absolutePath, "-C", root.absolutePath)
            .redirectErrorStream(true).start()
        val output = process.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        if (!process.waitFor(60, TimeUnit.SECONDS) || process.exitValue() != 0 || !npmCli.isFile) {
            throw IllegalStateException("npm runtime extraction failed: $output")
        }
        archive.delete()
        return npmCli
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
            val npmCli = if (trimmed == "npm" || trimmed.startsWith("npm ")) ensureNpmRuntime() else null
            val processBuilder = if (npmCli != null) {
                val args = trimmed.removePrefix("npm").trim()
                if (args.isBlank()) ProcessBuilder(nodeBinary.absolutePath, npmCli.absolutePath)
                else ProcessBuilder(listOf(nodeBinary.absolutePath, npmCli.absolutePath) + args.split(Regex("\\s+")))
            } else if (trimmed.startsWith("node -e ")) {
                val encoded = trimmed.removePrefix("node -e ").trim()
                val code = org.json.JSONTokener(encoded).nextValue() as? String
                    ?: throw IllegalArgumentException("node -e 参数不是有效 JSON 字符串")
                ProcessBuilder(nodeBinary.absolutePath, "-e", code)
            } else if (trimmed == "node" || trimmed.startsWith("node --")) {
                val args = trimmed.removePrefix("node").trim()
                if (args.isBlank()) ProcessBuilder(nodeBinary.absolutePath)
                else ProcessBuilder(listOf(nodeBinary.absolutePath) + args.split(Regex("\\s+")))
            } else {
                ProcessBuilder("sh", "-c", trimmed)
            }

            val process = processBuilder
                .directory(File(workspacePath))
                .redirectErrorStream(false)
                .apply {
                    environment()["LD_LIBRARY_PATH"] = activity.applicationInfo.nativeLibraryDir
                    environment()["HOME"] = activity.filesDir.absolutePath
                    environment()["npm_config_cache"] = File(activity.filesDir, "npm-cache").absolutePath
                    environment()["npm_config_prefix"] = File(activity.filesDir, "npm-global").absolutePath
                    environment()["TMPDIR"] = activity.cacheDir.absolutePath
                    environment()["PATH"] = activity.applicationInfo.nativeLibraryDir +
                        File.pathSeparator + (environment()["PATH"] ?: "")
                }
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
