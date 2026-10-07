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

import { getUserSettings } from './db';
import { CodeLanguage } from '../types';

async function getEffectiveEndpoint(): Promise<string> {
  try {
    const s = await getUserSettings();
    if (s?.serverlessEndpointUrl && s.serverlessEndpointUrl.trim()) {
      return s.serverlessEndpointUrl.trim();
    }
  } catch (e) {
    // fallback
  }
  return '/api/execute-script';
}

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

export interface AndroidExecutionBridge {
  getRuntimeInfo?: () => Promise<unknown> | unknown;
  executePython?: (code: string, timeoutMs?: number, workspaceId?: string) => Promise<unknown> | unknown;
  executeCommand?: (command: string, timeoutMs?: number, workspaceId?: string) => Promise<unknown> | unknown;
  executeNode?: (command: string, timeoutMs?: number, workspaceId?: string) => Promise<unknown> | unknown;
  getWorkspaceNodeRuntimeState?: (workspaceId: string) => Promise<unknown> | unknown;
  readWorkspaceFile?: (workspaceId: string, relativePath: string) => Promise<unknown> | unknown;
  listWorkspaceFiles?: (workspaceId: string) => Promise<unknown> | unknown;
  writeWorkspaceFile?: (workspaceId: string, relativePath: string, content: string) => Promise<unknown> | unknown;
  deleteWorkspaceFile?: (workspaceId: string, relativePath: string) => Promise<unknown> | unknown;
  markWorkspaceDependenciesInstalled?: (workspaceId: string) => Promise<unknown> | unknown;
  installWorkspaceDependencies?: (workspaceId: string, timeoutMs?: number) => Promise<unknown> | unknown;
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
      const trimmed = request.code.trim();

      // Android does not expose a system "python3" executable. The Python
      // interpreter is embedded by Chaquopy, so translate the common shell
      // forms emitted by models back into source execution before invoking sh.
      if (/^(?:python3?|py)(?:\s|$)/i.test(trimmed)
          && window.MyChatAndroid.executePython) {
        const pythonCommand = trimmed.replace(/^(?:python3?|py)\s*/i, '');

        if (!pythonCommand) {
          return {
            success: false,
            stdout: '',
            stderr: 'Android 原生 Python 已内置，但交互式 python3 Shell 不可用；请直接提供 Python 源代码或使用 python3 -c \'...\'。',
            exitCode: -1,
            error: 'Use Python source or python3 -c instead of an interactive Python shell.',
            runtime: 'android',
          };
        }

        let pythonCode: string | null = null;
        if (/^-c(?:\s|$)/i.test(pythonCommand)) {
          const expression = pythonCommand.replace(/^-c\s*/i, '').trim();
          // Models normally emit a single shell-quoted argument. Decode the
          // surrounding quotes without invoking a shell, keeping Python code
          // such as print("hello") intact.
          if ((expression.startsWith('"') && expression.endsWith('"'))
              || (expression.startsWith("'") && expression.endsWith("'"))) {
            pythonCode = expression.slice(1, -1)
              .replace(/\\([\\"'])/g, '$1')
              .replace(/\\n/g, '\n');
          } else {
            pythonCode = expression;
          }
        } else if (/^(?:-u\s+)?[^\s]+\.py(?:\s|$)/i.test(pythonCommand)) {
          const scriptPath = pythonCommand.replace(/^-u\s+/i, '').split(/\s+/)[0];
          const file = await readWorkspaceFile(request.workspaceId ?? '', scriptPath);
          if (file?.exists && typeof file.content === 'string') {
            pythonCode = file.content;
          } else {
            return {
              success: false,
              stdout: '',
              stderr: file?.error || `Python 脚本不存在: ${scriptPath}`,
              exitCode: -1,
              error: file?.error || `Python script not found: ${scriptPath}`,
              runtime: 'android',
            };
          }
        }

        if (pythonCode !== null) {
          const raw = await window.MyChatAndroid.executePython(
            pythonCode,
            request.timeoutMs ?? 20_000,
            request.workspaceId
          );
          return normalizeAndroidResult(raw);
        }
      }

      const isNodeRuntimeCommand = /^(?:npm|npx|node)(?:\\s|$)/.test(trimmed);
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
      const endpoint = await getEffectiveEndpoint();
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: request.language, command: request.code, code: request.code, workspaceId: request.workspaceId }),
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
    try {
      const endpoint = await getEffectiveEndpoint();
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: request.language, code: request.code, workspaceId: request.workspaceId }),
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

  if (request.language !== 'python') {
    throw new Error(`不支持的执行语言: ${request.language}`);
  }

  // Server fallback: Python execution via Serverless Cloud Function
  try {
    const endpoint = await getEffectiveEndpoint();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'python', code: request.code, command: `python3 -c ${JSON.stringify(request.code)}`, workspaceId: request.workspaceId }),
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

export async function installWorkspaceDependencies(workspaceId: string, timeoutMs = 120_000): Promise<CodeExecutionResult> {
  if (window.MyChatAndroid?.installWorkspaceDependencies) {
    try {
      const raw = await window.MyChatAndroid.installWorkspaceDependencies(workspaceId, timeoutMs);
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return {
        success: parsed?.success === true,
        stdout: parsed?.stdout || '',
        stderr: parsed?.stderr || '',
        exitCode: typeof parsed?.exitCode === 'number' ? parsed.exitCode : (parsed?.success ? 0 : -1),
        error: parsed?.error,
        runtime: 'android',
        failureCategory: parsed?.failureCategory,
        recoveredPreviousDependencies: parsed?.recoveredPreviousDependencies === true,
      } as CodeExecutionResult & { failureCategory?: string; recoveredPreviousDependencies?: boolean };
    } catch (error: any) {
      return { success: false, stdout: '', stderr: '', exitCode: -1, error: error?.message || String(error), runtime: 'android' };
    }
  }
  return executeCode({ language: 'shell', code: 'npm install --no-audit --no-fund', timeoutMs, workspaceId });
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

export async function readWorkspaceFile(workspaceId: string, relativePath: string): Promise<{ ok: boolean; exists: boolean; content?: string; error?: string } | null> {
  if (window.MyChatAndroid?.readWorkspaceFile) {
    try {
      const raw = await window.MyChatAndroid.readWorkspaceFile(workspaceId, relativePath);
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw as any;
      return {
        ok: parsed?.ok === true,
        exists: parsed?.exists === true,
        content: typeof parsed?.content === 'string' ? parsed.content : undefined,
        error: parsed?.error,
      };
    } catch (error: any) {
      return { ok: false, exists: false, error: error?.message || String(error) };
    }
  }
  return null;
}

export interface AndroidWorkspaceFileEntry {
  path: string;
  size: number;
  updatedAt?: number;
}

export async function listWorkspaceFiles(workspaceId: string): Promise<AndroidWorkspaceFileEntry[] | null> {
  if (typeof window === 'undefined' || !window.MyChatAndroid?.listWorkspaceFiles) return null;
  try {
    const raw = await window.MyChatAndroid.listWorkspaceFiles(workspaceId);
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw as any;
    if (payload?.ok !== true || !Array.isArray(payload?.files)) return null;
    return payload.files.filter((item: any) => item && typeof item.path === 'string').map((item: any) => ({ path: item.path, size: Number(item.size ?? 0), updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : undefined }));
  } catch { return null; }
}

export async function writeWorkspaceFile(workspaceId: string, relativePath: string, content: string): Promise<{ ok: boolean; error?: string } | null> {
  if (typeof window === 'undefined' || !window.MyChatAndroid?.writeWorkspaceFile) return null;
  try {
    const raw = await window.MyChatAndroid.writeWorkspaceFile(workspaceId, relativePath, content);
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw as any;
    return { ok: payload?.ok === true, error: payload?.error };
  } catch (error: any) { return { ok: false, error: error?.message || String(error) }; }
}

export async function deleteWorkspaceFile(workspaceId: string, relativePath: string): Promise<{ ok: boolean; error?: string } | null> {
  if (typeof window === 'undefined' || !window.MyChatAndroid?.deleteWorkspaceFile) return null;
  try {
    const raw = await window.MyChatAndroid.deleteWorkspaceFile(workspaceId, relativePath);
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw as any;
    return { ok: payload?.ok === true, error: payload?.error };
  } catch (error: any) { return { ok: false, error: error?.message || String(error) }; }
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
