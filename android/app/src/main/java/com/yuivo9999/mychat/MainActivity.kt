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
        return JSONObject()
            .put("platform", "android")
            .put("python", Python.getInstance().getModule("sys").get("version").toString())
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

    @JavascriptInterface
    fun executePython(code: String, timeoutMs: Int): String {
        val future = executor.submit(Callable {
            Python.getInstance()
                .getModule("runner")
                .callAttr("execute", code)
                .toJava(Map::class.java)
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
