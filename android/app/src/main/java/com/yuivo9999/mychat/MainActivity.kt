package com.yuivo9999.mychat

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import com.chaquo.python.Python
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
