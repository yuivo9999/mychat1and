/**
 * MyChat Agent Runtime
 *
 * One platform-neutral execution contract for the Agent.
 * The Agent asks for an intent (python/node/shell/install/check); this layer
 * decides whether execution is Android-native or server-backed and owns all
 * platform-specific invocation details.
 */

export type AgentRuntimeKind = 'android' | 'server';
export type AgentRuntimeLanguage = 'python' | 'node' | 'shell';

export interface AgentRuntimeCapabilities {
  runtime: AgentRuntimeKind;
  platform: 'android' | 'server';
  python: boolean;
  node: boolean;
  shell: boolean;
  npm: boolean;
  persistentWorkspace: boolean;
  workspaceScoped: boolean;
}

export interface AgentRuntimeRequest {
  language: AgentRuntimeLanguage;
  sourceOrCommand: string;
  timeoutMs?: number;
  workspaceId?: string;
}

export interface AgentRuntimeResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string | null;
  runtime: AgentRuntimeKind;
  command?: string;
}

interface AndroidAgentBridge {
  getRuntimeInfo?: () => Promise<unknown> | unknown;
  executePython?: (code: string, timeoutMs?: number, workspaceId?: string) => Promise<unknown> | unknown;
  executeNode?: (command: string, timeoutMs?: number, workspaceId?: string) => Promise<unknown> | unknown;
  executeCommand?: (command: string, timeoutMs?: number, workspaceId?: string) => Promise<unknown> | unknown;
  installWorkspaceDependencies?: (workspaceId: string, timeoutMs?: number) => Promise<unknown> | unknown;
  getWorkspaceNodeRuntimeState?: (workspaceId: string) => Promise<unknown> | unknown;
}

declare global {
  interface Window {
    MyChatAndroid?: AndroidAgentBridge;
  }
}

function bridge(): AndroidAgentBridge | null {
  return typeof window !== 'undefined' ? window.MyChatAndroid || null : null;
}

function normalize(raw: unknown, runtime: AgentRuntimeKind, command?: string): AgentRuntimeResult {
  const payload = typeof raw === 'string' ? JSON.parse(raw) : (raw as any);
  return {
    success: payload?.success === true && Number(payload?.exitCode ?? 0) === 0,
    stdout: String(payload?.stdout ?? ''),
    stderr: String(payload?.stderr ?? ''),
    exitCode: Number(payload?.exitCode ?? 0),
    error: payload?.error ?? null,
    runtime,
    command,
  };
}

function androidAvailable(): boolean {
  const b = bridge();
  return !!b && typeof b.executeCommand === 'function'
    && typeof b.executePython === 'function';
}

function isNodeCommand(value: string): boolean {
  return /^(?:node|npm|npx)(?:\s|$)/i.test(value.trim());
}

/**
 * Returns what the current Agent Runtime can actually execute.
 * This is factual capability discovery; it never guesses from the host OS.
 */
export async function getAgentRuntimeCapabilities(): Promise<AgentRuntimeCapabilities> {
  const b = bridge();
  if (b && typeof b.getRuntimeInfo === 'function') {
    try {
      const raw = await b.getRuntimeInfo();
      const info = typeof raw === 'string' ? JSON.parse(raw) : (raw as any);
      return {
        runtime: 'android',
        platform: 'android',
        python: info?.python !== 'unavailable',
        node: info?.node !== 'unavailable',
        shell: true,
        npm: info?.node !== 'unavailable',
        persistentWorkspace: true,
        workspaceScoped: true,
      };
    } catch {
      // Fall through to capability probing.
    }
  }

  if (androidAvailable()) {
    return {
      runtime: 'android',
      platform: 'android',
      python: true,
      node: typeof b?.executeNode === 'function',
      shell: true,
      npm: typeof b?.executeNode === 'function',
      persistentWorkspace: true,
      workspaceScoped: true,
    };
  }

  return {
    runtime: 'server',
    platform: 'server',
    python: true,
    node: true,
    shell: true,
    npm: true,
    persistentWorkspace: false,
    workspaceScoped: false,
  };
}

/**
 * The single execution entry point used by Agent-facing code.
 * Never expose python3/python -c/node path/Android-specific details to the model.
 */
export async function executeAgentRuntime(request: AgentRuntimeRequest): Promise<AgentRuntimeResult> {
  const code = request.sourceOrCommand;
  const timeoutMs = request.timeoutMs ?? 20_000;
  const b = bridge();

  if (b) {
    try {
      if (request.language === 'python' && typeof b.executePython === 'function') {
        return normalize(
          await b.executePython(code, timeoutMs, request.workspaceId),
          'android'
        );
      }

      if (request.language === 'node' && typeof b.executeNode === 'function') {
        return normalize(
          await b.executeNode(code, timeoutMs, request.workspaceId),
          'android',
          code
        );
      }

      if (request.language === 'shell' && typeof b.executeCommand === 'function') {
        // The native runtime owns the shell and all PATH/runtime adaptation.
        // Node/npm commands are routed through the native Node bridge when available.
        if (isNodeCommand(code) && typeof b.executeNode === 'function') {
          return normalize(
            await b.executeNode(code, timeoutMs, request.workspaceId),
            'android',
            code
          );
        }
        return normalize(
          await b.executeCommand(code, timeoutMs, request.workspaceId),
          'android',
          code
        );
      }
    } catch (error: any) {
      return {
        success: false,
        stdout: '',
        stderr: '',
        exitCode: -1,
        error: error?.message || String(error),
        runtime: 'android',
        command: code,
      };
    }
  }

  // Non-Android fallback. The model still sees exactly the same Agent Runtime API.
  try {
    const command = request.language === 'python'
      ? `python3 -c ${JSON.stringify(code)}`
      : request.language === 'node'
        ? `node -e ${JSON.stringify(code)}`
        : code;

    const response = await fetch('/api/execute-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        success: false,
        stdout: String(payload?.stdout ?? ''),
        stderr: String(payload?.stderr ?? ''),
        exitCode: Number(payload?.exitCode ?? -1),
        error: payload?.error || `执行后端返回 HTTP ${response.status}`,
        runtime: 'server',
        command,
      };
    }
    return normalize(payload, 'server', command);
  } catch (error: any) {
    return {
      success: false,
      stdout: '',
      stderr: '',
      exitCode: -1,
      error: error?.message || String(error),
      runtime: 'server',
      command: request.sourceOrCommand,
    };
  }
}

/**
 * Dependency installation is also part of the same runtime contract.
 * npm/Node details stay inside the runtime implementation.
 */
export async function installAgentDependencies(
  workspaceId: string,
  timeoutMs = 120_000,
): Promise<AgentRuntimeResult & { failureCategory?: string; recoveredPreviousDependencies?: boolean }> {
  const b = bridge();
  if (b?.installWorkspaceDependencies) {
    try {
      const raw = await b.installWorkspaceDependencies(workspaceId, timeoutMs);
      const result = normalize(raw, 'android', 'dependency-install');
      const payload = typeof raw === 'string' ? JSON.parse(raw) : (raw as any);
      return {
        ...result,
        failureCategory: payload?.failureCategory,
        recoveredPreviousDependencies: payload?.recoveredPreviousDependencies === true,
      };
    } catch (error: any) {
      return {
        success: false,
        stdout: '',
        stderr: '',
        exitCode: -1,
        error: error?.message || String(error),
        runtime: 'android',
        command: 'dependency-install',
      };
    }
  }

  return executeAgentRuntime({
    language: 'shell',
    sourceOrCommand: 'npm install --no-audit --no-fund',
    timeoutMs,
    workspaceId,
  }) as Promise<AgentRuntimeResult & { failureCategory?: string; recoveredPreviousDependencies?: boolean }>;
}
