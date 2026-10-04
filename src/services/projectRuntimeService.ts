import { Workspace } from '../types/workspace';

export type ProjectKind = 'node' | 'python' | 'rust' | 'go' | 'unknown';

export interface ProjectRuntimeInfo {
  kind: ProjectKind;
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';
  manifest?: string;
  scripts: string[];
  entrypoints: string[];
  dependencyInstallCommand?: string;
  checkCommands: string[];
  checkStrategy: 'shell' | 'python_source' | 'unsupported';
  signals: string[];
}

const has = (workspace: Workspace, path: string) => !!workspace.files[path];

export function inspectProjectRuntime(workspace: Workspace): ProjectRuntimeInfo {
  const paths = Object.keys(workspace.files);
  const packageJson = workspace.files['package.json'];

  if (packageJson && !packageJson.isBinary) {
    let parsed: any = {};
    try {
      parsed = JSON.parse(packageJson.content);
    } catch {
      return {
        kind: 'node',
        manifest: 'package.json',
        scripts: [],
        entrypoints: [],
        signals: ['检测到 package.json，但 JSON 解析失败'],
        checkCommands: [],
        checkStrategy: 'unsupported',
        dependencyInstallCommand: undefined,
      };
    }

    const scripts = Object.keys(parsed.scripts || {});
    const packageManager: ProjectRuntimeInfo['packageManager'] =
      has(workspace, 'pnpm-lock.yaml') ? 'pnpm' :
      has(workspace, 'yarn.lock') ? 'yarn' :
      has(workspace, 'bun.lockb') || has(workspace, 'bun.lock') ? 'bun' : 'npm';

    const checkCommands: string[] = [];
    if (scripts.includes('typecheck')) checkCommands.push('npm run typecheck');
    if (scripts.includes('lint')) checkCommands.push('npm run lint');
    if (scripts.includes('test')) checkCommands.push('npm test');
    if (scripts.includes('build')) checkCommands.push('npm run build');
    if (checkCommands.length === 0) {
      checkCommands.push(`node -e "console.log('Node.js project detected; no build/test script configured.')"`);
    }

    const dependencyInstallCommand = packageManager === 'npm'
      ? (has(workspace, 'package-lock.json') ? 'npm ci --no-audit --no-fund' : 'npm install --no-audit --no-fund')
      : undefined;

    return {
      kind: 'node',
      packageManager,
      manifest: 'package.json',
      scripts,
      entrypoints: ['package.json', ...paths.filter(p => /^(src\/)?(main|index|App)\.(tsx?|jsx?)$/.test(p)).slice(0, 10)],
      dependencyInstallCommand,
      checkCommands,
      checkStrategy: packageManager === 'npm' ? 'shell' : 'unsupported',
      signals: [
        '检测到 package.json',
        packageManager === 'npm'
          ? (has(workspace, 'package-lock.json')
              ? '检测到 package-lock.json：使用 npm ci 固定依赖树，避免安装过程中悄悄漂移 lockfile'
              : '未检测到 package-lock.json：使用 npm install，并允许首次安装生成 lockfile')
          : `检测到 ${packageManager} 锁文件；当前 Android runtime 仅保证 npm，不会错误地用 npm install 替代 ${packageManager}`,
      ],
    };
  }

  if (has(workspace, 'pyproject.toml') || has(workspace, 'requirements.txt') || paths.some(p => p.endsWith('.py'))) {
    return {
      kind: 'python',
      manifest: has(workspace, 'pyproject.toml') ? 'pyproject.toml' : has(workspace, 'requirements.txt') ? 'requirements.txt' : undefined,
      scripts: [],
      entrypoints: paths.filter(p => p.endsWith('.py')).slice(0, 20),
      checkCommands: ['Python compileall'],
      checkStrategy: 'python_source',
      signals: ['检测到 Python 项目文件', '项目检查通过 MyChat 原生 Python runtime 执行'],
    };
  }

  if (has(workspace, 'Cargo.toml')) {
    return {
      kind: 'rust',
      manifest: 'Cargo.toml',
      scripts: [],
      entrypoints: [],
      checkCommands: [],
      checkStrategy: 'unsupported',
      signals: ['检测到 Cargo.toml', 'Android runtime 当前未内置 Rust/Cargo toolchain，禁止伪装成可执行检查'],
    };
  }

  if (has(workspace, 'go.mod')) {
    return {
      kind: 'go',
      manifest: 'go.mod',
      scripts: [],
      entrypoints: [],
      checkCommands: [],
      checkStrategy: 'unsupported',
      signals: ['检测到 go.mod', 'Android runtime 当前未内置 Go toolchain，禁止伪装成可执行检查'],
    };
  }

  return {
    kind: 'unknown',
    scripts: [],
    entrypoints: [],
    checkCommands: [],
    checkStrategy: 'unsupported',
    signals: ['未识别到常见项目清单文件'],
  };
}

export function buildProjectRuntimeReport(workspace: Workspace): string {
  const info = inspectProjectRuntime(workspace);
  return JSON.stringify({
    kind: info.kind,
    packageManager: info.packageManager,
    manifest: info.manifest,
    scripts: info.scripts,
    entrypoints: info.entrypoints,
    dependencyInstallCommand: info.dependencyInstallCommand,
    checkCommands: info.checkCommands,
    checkStrategy: info.checkStrategy,
    signals: info.signals,
  }, null, 2);
}


export interface ProjectRuntimeState {
  supported: boolean;
  running: boolean;
  status: 'starting' | 'running' | 'stopped' | 'error' | 'unknown';
  port?: number;
  command?: string;
  pid?: number;
  stdout?: string;
  stderr?: string;
  startedAt?: number;
}

interface AndroidProjectRuntimeBridge {
  startWorkspaceProject?: (workspaceId: string, command: string, timeoutMs?: number) => string;
  getWorkspaceProjectRuntimeState?: (workspaceId: string) => string;
  stopWorkspaceProject?: (workspaceId: string) => string;
}

function runtimeBridge(): AndroidProjectRuntimeBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as any).MyChatAndroid || null;
}

export function buildProjectStartCommand(workspace: Workspace): string | null {
  const info = inspectProjectRuntime(workspace);
  if (info.kind !== 'node') return null;
  if (info.scripts.includes('dev')) return 'npm run dev -- --host 127.0.0.1';
  if (info.scripts.includes('start')) return 'npm run start -- --host 127.0.0.1';
  if (info.scripts.includes('preview')) return 'npm run preview -- --host 127.0.0.1';
  return null;
}

export function getProjectRuntimeState(workspaceId: string): ProjectRuntimeState {
  const bridge = runtimeBridge();
  if (!bridge?.getWorkspaceProjectRuntimeState) return { supported: false, running: false, status: 'unknown' };
  try {
    const raw = bridge.getWorkspaceProjectRuntimeState(workspaceId);
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      supported: true,
      running: payload?.running === true,
      status: payload?.status || (payload?.running ? 'running' : 'stopped'),
      port: typeof payload?.port === 'number' ? payload.port : undefined,
      command: payload?.command,
      pid: typeof payload?.pid === 'number' ? payload.pid : undefined,
      stdout: payload?.stdout || '',
      stderr: payload?.stderr || '',
      startedAt: payload?.startedAt,
    };
  } catch {
    return { supported: true, running: false, status: 'error' };
  }
}

export function startProjectRuntime(workspace: Workspace): ProjectRuntimeState {
  const bridge = runtimeBridge();
  const command = buildProjectStartCommand(workspace);
  if (!bridge?.startWorkspaceProject || !command) {
    return { supported: false, running: false, status: 'unknown', command: command || undefined };
  }
  try {
    const raw = bridge.startWorkspaceProject(workspace.id, command, 8000);
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      supported: true,
      running: payload?.success === true,
      status: payload?.status || (payload?.success ? 'starting' : 'error'),
      port: typeof payload?.port === 'number' ? payload.port : undefined,
      command,
      pid: typeof payload?.pid === 'number' ? payload.pid : undefined,
    };
  } catch (error: any) {
    return { supported: true, running: false, status: 'error', command, stderr: error?.message || String(error) };
  }
}

export function stopProjectRuntime(workspaceId: string): void {
  try { runtimeBridge()?.stopWorkspaceProject?.(workspaceId); } catch {}
}
