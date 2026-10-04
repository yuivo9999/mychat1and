package com.yuivo9999.mychat;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "MyChatRuntime")
public class MyChatRuntimePlugin extends Plugin {
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private static final long MAX_WORKSPACE_BYTES = 25L * 1024L * 1024L;

    @PluginMethod
    public void getRuntimeInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("platform", "android");
        ret.put("python", Python.isStarted());
        if (Python.isStarted()) {
            ret.put("pythonVersion", Python.getInstance().getModule("sys").get("version").toString());
        }
        ret.put("workspaceRoot", new File(getContext().getFilesDir(), "mychat-workspaces").getAbsolutePath());
        call.resolve(ret);
    }

    @PluginMethod
    public void runPython(PluginCall call) {
        final String command = call.getString("command", "").trim();
        final JSONArray files = call.getArray("files");
        final int timeoutMs = Math.max(1000, Math.min(call.getInt("timeoutMs", 30000), 120000));

        if (command.isEmpty()) {
            call.reject("Python 命令为空。");
            return;
        }
        if (files == null) {
            call.reject("缺少工作区文件。");
            return;
        }

        executor.execute(() -> {
            File workspace = new File(getContext().getFilesDir(), "mychat-workspaces/runtime");
            try {
                prepareWorkspace(workspace, files);

                if (!Python.isStarted()) {
                    call.reject("Python 运行时尚未启动。");
                    return;
                }

                Future<String> future = executor.submit(() -> {
                    PyObject runner = Python.getInstance().getModule("workspace_runner");
                    return runner.callAttr("run", command, workspace.getAbsolutePath()).toString();
                });

                String json;
                try {
                    json = future.get(timeoutMs, TimeUnit.MILLISECONDS);
                } catch (Exception timeout) {
                    future.cancel(true);
                    JSObject timeoutResult = new JSObject();
                    timeoutResult.put("success", false);
                    timeoutResult.put("stdout", "");
                    timeoutResult.put("stderr", "");
                    timeoutResult.put("exitCode", -1);
                    timeoutResult.put("error", "Python 执行超时，已请求停止。");
                    timeoutResult.put("changedFiles", new JSONArray());
                    call.resolve(timeoutResult);
                    return;
                }

                JSONObject parsed = new JSONObject(json);
                JSObject result = new JSObject();
                result.put("success", parsed.optBoolean("success", false));
                result.put("stdout", parsed.optString("stdout", ""));
                result.put("stderr", parsed.optString("stderr", ""));
                result.put("exitCode", parsed.optInt("exitCode", 1));
                result.put("error", parsed.optString("error", JSONObject.NULL));
                result.put("changedFiles", parsed.optJSONArray("changedFiles") != null
                        ? parsed.optJSONArray("changedFiles") : new JSONArray());
                result.put("binaryFiles", parsed.optJSONArray("binaryFiles") != null
                        ? parsed.optJSONArray("binaryFiles") : new JSONArray());
                result.put("durationMs", parsed.optLong("durationMs", 0));
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Android Python 执行失败: " + (e.getMessage() == null ? e.toString() : e.getMessage()), e);
            } finally {
                // The workspace is intentionally disposable: the authoritative copy remains in MyChat's JS workspace.
                deleteRecursively(workspace);
            }
        });
    }

    private void prepareWorkspace(File root, JSONArray files) throws Exception {
        deleteRecursively(root);
        if (!root.mkdirs() && !root.isDirectory()) {
            throw new IllegalStateException("无法创建 Android 工作区目录");
        }

        long total = 0;
        for (int i = 0; i < files.length(); i++) {
            JSONObject item = files.getJSONObject(i);
            String relative = item.optString("path", "").replace('\\', '/');
            if (!isSafeRelativePath(relative)) {
                throw new SecurityException("工作区路径非法: " + relative);
            }
            if (item.optBoolean("isBinary", false)) {
                continue;
            }

            String content = item.optString("content", "");
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            total += bytes.length;
            if (total > MAX_WORKSPACE_BYTES) {
                throw new IllegalArgumentException("工作区文本总容量超过 25 MB。");
            }

            File target = new File(root, relative);
            File parent = target.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) {
                throw new IllegalStateException("无法创建目录: " + parent);
            }
            try (FileOutputStream out = new FileOutputStream(target)) {
                out.write(bytes);
            }
        }
    }

    private boolean isSafeRelativePath(String path) {
        if (path.isEmpty() || path.startsWith("/") || path.startsWith("\") || path.contains(":")) {
            return false;
        }
        String normalized = path.replace('\\', '/');
        String[] parts = normalized.split("/");
        for (String part : parts) {
            if (part.isEmpty() || part.equals(".") || part.equals("..")) {
                return false;
            }
        }
        return true;
    }

    private void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) deleteRecursively(child);
            }
        }
        file.delete();
    }
}
