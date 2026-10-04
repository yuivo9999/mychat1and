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
  /** Optional bound workspace. Android runs Python with this directory as cwd. */
  workspaceId?: string;
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
  executePython?: (code: string, timeoutMs?: number, workspaceId?: string) => Promise<unknown> | unknown;
  executeCommand?: (command: string, timeoutMs?: number, workspaceId?: string) => Promise<unknown> | unknown;
  executeNode?: (command: string, timeoutMs?: number, workspaceId?: string) => Promise<unknown> | unknown;
  getWorkspaceNodeRuntimeState?: (workspaceId: string) => Promise<unknown> | unknown;
  markWorkspaceDependenciesInstalled?: (workspaceId: string) => Promise<unknown> | unknown;
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
        request.timeoutMs ?? 20_000,
        request.workspaceId
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

  if ((request.language === 'javascript' || request.language === 'typescript')
      && typeof window !== 'undefined'
      && window.MyChatAndroid?.executeNode) {
    try {
      const nodeCode = request.language === 'typescript'
        ? `const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const source = ${JSON.stringify(request.code)};
const filename = path.join(process.cwd(), '.mychat-ts-runtime.cjs');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
    sourceMap: false,
    inlineSourceMap: false
  },
  fileName: filename,
  reportDiagnostics: true
});
if (transpiled.diagnostics && transpiled.diagnostics.length) {
  const message = ts.formatDiagnosticsWithColorAndContext(transpiled.diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\\n'
  });
  console.error(message);
  process.exitCode = 1;
} else {
  const runtimeModule = new Module(filename, module);
  runtimeModule.filename = filename;
  runtimeModule.paths = Module._nodeModulePaths(process.cwd());
  runtimeModule._compile(transpiled.outputText, filename);
}`
        : request.code;
      const raw = await window.MyChatAndroid.executeNode(
        `node -e ${JSON.stringify(nodeCode)}`,
        request.timeoutMs ?? 20_000,
        request.workspaceId
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

  if (request.language === 'shell' && typeof window !== 'undefined'
      && window.MyChatAndroid?.executeCommand) {
    try {
      const isNodeRuntimeCommand = /^(?:npm|npx|node)(?:\\s|$)/.test(request.code.trim());
      const raw = isNodeRuntimeCommand && window.MyChatAndroid.executeNode
        ? await window.MyChatAndroid.executeNode(
            request.code,
            request.timeoutMs ?? 120_000,
            request.workspaceId
          )
        : await window.MyChatAndroid.executeCommand(
            request.code,
            request.timeoutMs ?? 20_000,
            request.workspaceId
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

  if (request.language === 'shell') {
    try {
      const res = await fetch('/api/execute-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: request.code }),
      });
      const payload = await res.json().catch(() => null);
      return {
        success: !!payload?.success && res.ok,
        stdout: String(payload?.stdout ?? ''),
        stderr: String(payload?.stderr ?? ''),
        exitCode: Number(payload?.exitCode ?? (res.ok ? 0 : -1)),
        error: payload?.error ?? (!res.ok ? `执行后端返回 HTTP ${res.status}` : null),
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

  if (request.language === 'javascript' || request.language === 'typescript') {
    return {
      success: false,
      stdout: '',
      stderr: '',
      exitCode: -1,
      error: `Android Node.js runtime unavailable for ${request.language}; web runtime must provide /api/execute-script.`,
      runtime: 'server',
    };
  }

  if (request.language !== 'python') {
    throw new Error(`不支持的执行语言: ${request.language}`);
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

export interface WorkspaceNodeRuntimeState {
  workspaceId: string;
  workspacePath: string;
  nodeModulesExists: boolean;
  nodeModulesCount: number;
  packageJsonExists: boolean;
  packageLockExists: boolean;
  packageLockModifiedAt: number;
  runtimePersistent: boolean;
  dependencyFingerprint?: string;
  installedDependencyFingerprint?: string;
  dependenciesInSync?: boolean;
  lockfile?: string | null;
}

export async function markWorkspaceDependenciesInstalled(workspaceId: string): Promise<{ ok: boolean; fingerprint?: string; error?: string }> {
  if (typeof window === 'undefined' || !window.MyChatAndroid?.markWorkspaceDependenciesInstalled) {
    return { ok: false, error: 'Android workspace dependency state bridge unavailable' };
  }
  try {
    const raw = await window.MyChatAndroid.markWorkspaceDependenciesInstalled(workspaceId);
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw as any;
    return {
      ok: payload?.ok === true,
      fingerprint: payload?.fingerprint,
      error: payload?.error,
    };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}

export async function getWorkspaceNodeRuntimeState(workspaceId: string): Promise<WorkspaceNodeRuntimeState | null> {
  if (typeof window === 'undefined' || !window.MyChatAndroid?.getWorkspaceNodeRuntimeState) {
    return null;
  }
  try {
    const raw = await window.MyChatAndroid.getWorkspaceNodeRuntimeState(workspaceId);
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw as any;
    if (payload?.ok !== true || !payload?.state) return null;
    return payload.state as WorkspaceNodeRuntimeState;
  } catch {
    return null;
  }
}
