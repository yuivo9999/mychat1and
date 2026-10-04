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
      checkCommands.push('node -e "console.log(\\'Node.js project detected; no build/test script configured.\\')"');
    }

    const dependencyInstallCommand = packageManager === 'npm' ? 'npm install' : undefined;

    return {
      kind: 'node',
      packageManager,
      manifest: 'package.json',
      scripts,
      entrypoints: ['package.json', ...paths.filter(p => /^(src\\/)?(main|index|App)\\.(tsx?|jsx?)$/.test(p)).slice(0, 10)],
      dependencyInstallCommand,
      checkCommands,
      checkStrategy: packageManager === 'npm' ? 'shell' : 'unsupported',
      signals: [
        '检测到 package.json',
        packageManager === 'npm'
          ? '使用 npm runtime'
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
