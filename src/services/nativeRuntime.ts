import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativeWorkspaceFile {
  path: string;
  content: string;
  isBinary?: boolean;
}

export interface NativeChangedFile {
  path: string;
  content?: string;
  deleted?: boolean;
  isBinary?: boolean;
}

export interface NativePythonResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
  changedFiles: NativeChangedFile[];
  binaryFiles?: string[];
  durationMs?: number;
}

export interface MyChatRuntimePlugin {
  runPython(options: {
    command: string;
    files: NativeWorkspaceFile[];
    timeoutMs?: number;
  }): Promise<NativePythonResult>;
  getRuntimeInfo(): Promise<{
    platform: string;
    python: boolean;
    pythonVersion?: string;
    workspaceRoot?: string;
  }>;
}

const MyChatRuntime = registerPlugin<MyChatRuntimePlugin>('MyChatRuntime');

export function isAndroidRuntime(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('MyChatRuntime');
}

export async function runPythonInWorkspace(
  command: string,
  files: NativeWorkspaceFile[],
  timeoutMs = 30_000,
): Promise<NativePythonResult> {
  if (!isAndroidRuntime()) {
    throw new Error('原生 Python 工作区运行时仅在 Android App 中可用。');
  }

  return MyChatRuntime.runPython({
    command,
    files,
    timeoutMs,
  });
}

export async function getNativeRuntimeInfo() {
  if (!isAndroidRuntime()) {
    return { platform: Capacitor.getPlatform(), python: false };
  }
  return MyChatRuntime.getRuntimeInfo();
}
