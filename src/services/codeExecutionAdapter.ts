/**
 * Unified code execution adapter.
 *
 * The Agent should describe what it wants to execute, not remember
 * platform-specific invocation details such as "python -c".
 *
 * Runtime priority:
 * 1. Android native bridge (when the APK exposes window.MyChatAndroid)
 * 2. Web/server /api/execute-script fallback
 */

export type CodeLanguage = 'python' | 'shell' | 'javascript' | 'typescript';

export interface CodeExecutionRequest {
  language: CodeLanguage;
  code: string;
  timeoutMs?: number;
}

export interface CodeExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string | null;
  runtime: 'android' | 'server';
}

interface AndroidExecutionBridge {
  executePython?: (code: string, timeoutMs?: number) => Promise<unknown> | unknown;
}

declare global {
  interface Window {
    MyChatAndroid?: AndroidExecutionBridge;
  }
}

function isAndroidBridgeAvailable(): boolean {
  return typeof window !== 'undefined'
    && !!window.MyChatAndroid
    && typeof window.MyChatAndroid.executePython === 'function';
}

function normalizeAndroidResult(raw: unknown): CodeExecutionResult {
  const payload = typeof raw === 'string' ? JSON.parse(raw) : raw as any;
  return {
    success: payload?.success === true && (payload?.exitCode ?? 0) === 0,
    stdout: String(payload?.stdout ?? ''),
    stderr: String(payload?.stderr ?? ''),
    exitCode: Number(payload?.exitCode ?? 0),
    error: payload?.error ?? null,
    runtime: 'android',
  };
}

/**
 * Execute source code rather than a shell command.
 *
 * Python is deliberately passed as source to the Android bridge.
 * The native side owns the Python invocation details.
 */
export async function executeCode(request: CodeExecutionRequest): Promise<CodeExecutionResult> {
  if (request.language === 'python' && isAndroidBridgeAvailable()) {
    try {
      const raw = await window.MyChatAndroid!.executePython!(
        request.code,
        request.timeoutMs ?? 20_000
      );
      return normalizeAndroidResult(raw);
    } catch (error: any) {
      return {
        success: false,
        stdout: '',
        stderr: '',
        exitCode: -1,
        error: error?.message || String(error),
        runtime: 'android',
      };
    }
  }

  if (request.language !== 'python') {
    throw new Error(
      `当前统一执行适配层暂只允许 Python 走 Android 原生运行时；${request.language} 请继续使用 run_command。`
    );
  }

  // Server fallback: write Python source into a shell-safe python -c invocation.
  // The model never needs to know this platform detail.
  const command = `python3 -c ${JSON.stringify(request.code)}`;

  try {
    const res = await fetch('/api/execute-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        success: false,
        stdout: '',
        stderr: '',
        exitCode: -1,
        error: payload?.error || `执行后端返回 HTTP ${res.status}`,
        runtime: 'server',
      };
    }

    return {
      success: !!payload?.success,
      stdout: String(payload?.stdout ?? ''),
      stderr: String(payload?.stderr ?? ''),
      exitCode: Number(payload?.exitCode ?? 0),
      error: payload?.error ?? null,
      runtime: 'server',
    };
  } catch (error: any) {
    return {
      success: false,
      stdout: '',
      stderr: '',
      exitCode: -1,
      error: error?.message || String(error),
      runtime: 'server',
    };
  }
}

/**
 * Compatibility helper for the existing run_command tool.
 * If an Android Python runtime is available and the command is plain Python
 * source, route it through the Python adapter automatically.
 */
export function looksLikePythonSource(command: string): boolean {
  const value = command.trim();
  if (!value || /^python(?:3)?(?:\s|$)/i.test(value)) return false;

  return /^(?:print\s*\(|import\s+\w+|from\s+\w+\s+import\s+|def\s+\w+\s*\(|class\s+\w+\s*[:(]|if\s+__name__\s*==|for\s+\w+\s+in\s+|while\s+.+:)/m.test(value);
}
