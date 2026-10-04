import JSZip from 'jszip';
import { 
  Workspace, 
  WorkspaceFile, 
  WorkspaceSnapshot, 
  FileDiffItem, 
  WORKSPACE_LIMITS, 
  validateSafeRelativePath 
} from '../types/workspace';
export { saveWorkspace, getWorkspaces, getWorkspace, deleteWorkspace } from './db';
import { saveWorkspace, getWorkspaces, getWorkspace, deleteWorkspace } from './db';

// Helper: detect if a file is likely binary
export function isBinaryFile(path: string, contentSample?: string): boolean {
  const binaryExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svgz',
    '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
    '.mp3', '.mp4', '.wav', '.mov', '.avi',
    '.woff', '.woff2', '.ttf', '.eot',
    '.exe', '.dll', '.bin', '.so', '.dylib', '.class', '.pyc'
  ];
  const lower = path.toLowerCase();
  if (binaryExtensions.some(ext => lower.endsWith(ext))) {
    return true;
  }
  if (contentSample && contentSample.includes('\0')) {
    return true;
  }
  return false;
}

// Create a new empty Workspace
export function createEmptyWorkspace(name = '新工作区'): Workspace {
  const now = Date.now();
  const id = `ws_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const initialFiles: Record<string, WorkspaceFile> = {
    'README.md': {
      path: 'README.md',
      content: `# ${name}\n\n当前工作区已创建。您可以在此上传 ZIP 项目包、查看代码、让 AI 检索和修改文件。\n\n> ⚠️ 注意：AI 仅负责代码分析与修改，严禁也无法在云端执行代码或运行测试，请自行在本地运行和测试。`,
      size: 180,
      updatedAt: now,
    },
  };

  const initialSnapshot: WorkspaceSnapshot = {
    version: 1,
    label: '初始创建',
    timestamp: now,
    files: JSON.parse(JSON.stringify(initialFiles)),
    source: 'user',
  };

  return {
    id,
    name,
    files: initialFiles,
    originalSnapshot: initialSnapshot,
    snapshots: [initialSnapshot],
    currentVersion: 1,
    createdAt: now,
    updatedAt: now,
    metadata: {
      projectName: name,
      rules: [
        'AI 负责分析和修改代码，严禁在工作区执行任何命令或测试',
        '用户在本地自行运行测试并反馈错误信息',
      ],
    },
  };
}

// Safely unpack user uploaded ZIP into a new Workspace with strict security checks
export async function importZipToNewWorkspace(
  zipFile: File, 
  workspaceName?: string
): Promise<{ success: boolean; workspace?: Workspace; error?: string }> {
  // 1. Check ZIP file size
  if (zipFile.size > WORKSPACE_LIMITS.MAX_ZIP_SIZE) {
    return {
      success: false,
      error: `ZIP 文件过大 (${Math.round(zipFile.size / 1024 / 1024)}MB)，最大允许 ${WORKSPACE_LIMITS.MAX_ZIP_SIZE / 1024 / 1024}MB`,
    };
  }

  const name = workspaceName || zipFile.name.replace(/\.zip$/i, '') || '导入的项目';
  const now = Date.now();
  const id = `ws_${now}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(zipFile);

    const extractedFiles: Record<string, WorkspaceFile> = {};
    let totalUncompressedSize = 0;
    let fileCount = 0;

    const entries = Object.entries(loadedZip.files);

    for (const [entryPath, zipEntry] of entries) {
      if (zipEntry.dir) continue;

      // Filter unwanted / hidden / junk entries
      if (
        entryPath.startsWith('__MACOSX') ||
        entryPath.includes('/__MACOSX/') ||
        entryPath.endsWith('.DS_Store') ||
        entryPath.includes('/.git/') ||
        entryPath.startsWith('.git/') ||
        entryPath.includes('/node_modules/') ||
        entryPath.startsWith('node_modules/')
      ) {
        continue;
      }

      // Security Check: Validate safe relative path
      const pathValidation = validateSafeRelativePath(entryPath);
      if (!pathValidation.valid) {
        return {
          success: false,
          error: `ZIP 解压安全拒绝: ${pathValidation.error}`,
        };
      }
      const safePath = pathValidation.normalizedPath;

      // File count limit
      fileCount++;
      if (fileCount > WORKSPACE_LIMITS.MAX_FILE_COUNT) {
        return {
          success: false,
          error: `ZIP 文件过多，超过最大文件数量限制 (${WORKSPACE_LIMITS.MAX_FILE_COUNT} 个)`,
        };
      }

      const binary = isBinaryFile(safePath);

      if (binary) {
        // For binary files, record placeholder
        extractedFiles[safePath] = {
          path: safePath,
          content: '/* [二进制文件] 不在文本中展示内容 */',
          isBinary: true,
          size: 0,
          updatedAt: now,
        };
      } else {
        const textContent = await zipEntry.async('text');
        const fileSize = textContent.length;

        // Check single file size
        if (fileSize > WORKSPACE_LIMITS.MAX_SINGLE_FILE_SIZE) {
          return {
            success: false,
            error: `单文件过大: "${safePath}" (${Math.round(fileSize / 1024 / 1024)}MB)，超过限制`,
          };
        }

        totalUncompressedSize += fileSize;
        // Check total uncompressed size (Zip Bomb protection)
        if (totalUncompressedSize > WORKSPACE_LIMITS.MAX_TOTAL_UNCOMPRESSED_SIZE) {
          return {
            success: false,
            error: `解压总容量超过安全限制 (${WORKSPACE_LIMITS.MAX_TOTAL_UNCOMPRESSED_SIZE / 1024 / 1024}MB)，可能存在压缩包炸弹风险`,
          };
        }

        extractedFiles[safePath] = {
          path: safePath,
          content: textContent,
          isBinary: false,
          size: fileSize,
          updatedAt: now,
        };
      }
    }

    if (Object.keys(extractedFiles).length === 0) {
      return {
        success: false,
        error: 'ZIP 压缩包中未找到有效的项目文件',
      };
    }

    const baselineSnapshot: WorkspaceSnapshot = {
      version: 1,
      label: '原始上传版本 (Original Baseline)',
      timestamp: now,
      files: JSON.parse(JSON.stringify(extractedFiles)),
      source: 'upload',
    };

    const newWorkspace: Workspace = {
      id,
      name,
      files: extractedFiles,
      originalSnapshot: baselineSnapshot,
      snapshots: [baselineSnapshot],
      currentVersion: 1,
      createdAt: now,
      updatedAt: now,
      metadata: {
        projectName: name,
        rules: [
          'AI 负责分析和修改代码，严禁在工作区执行任何命令或测试',
          '用户在本地自行运行测试并反馈错误信息',
        ],
      },
    };

    await saveWorkspace(newWorkspace);
    return { success: true, workspace: newWorkspace };
  } catch (err: any) {
    return {
      success: false,
      error: `ZIP 解压失败: ${err.message || '未知错误'}`,
    };
  }
}

// Compute diff between two snapshots of files
export function computeDiffBetweenFileSnapshots(
  oldFiles: Record<string, WorkspaceFile>,
  newFiles: Record<string, WorkspaceFile>
): FileDiffItem[] {
  const diffs: FileDiffItem[] = [];
  const allPaths = new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)]);

  for (const path of allPaths) {
    const oldF = oldFiles[path];
    const newF = newFiles[path];

    if (!oldF && newF) {
      diffs.push({
        path,
        type: 'added',
        newContent: newF.content,
      });
    } else if (oldF && !newF) {
      diffs.push({
        path,
        type: 'deleted',
        oldContent: oldF.content,
      });
    } else if (oldF && newF) {
      if (oldF.content !== newF.content) {
        diffs.push({
          path,
          type: 'modified',
          oldContent: oldF.content,
          newContent: newF.content,
        });
      }
    }
  }

  return diffs;
}

// Create a new version snapshot after AI or User modifications
export function createWorkspaceSnapshot(
  workspace: Workspace, 
  label: string, 
  source: 'upload' | 'agent' | 'user' = 'agent'
): Workspace {
  const previousSnapshot = workspace.snapshots[workspace.snapshots.length - 1];
  const previousFiles = previousSnapshot ? previousSnapshot.files : workspace.originalSnapshot.files;

  const diffFromPrevious = computeDiffBetweenFileSnapshots(previousFiles, workspace.files);

  // Only create snapshot if there are actual diffs
  if (diffFromPrevious.length === 0) {
    return workspace;
  }

  const nextVersion = workspace.currentVersion + 1;
  const newSnapshot: WorkspaceSnapshot = {
    version: nextVersion,
    label: label || `版本 v${nextVersion}`,
    timestamp: Date.now(),
    files: JSON.parse(JSON.stringify(workspace.files)),
    diffFromPrevious,
    source,
  };

  return {
    ...workspace,
    currentVersion: nextVersion,
    snapshots: [...workspace.snapshots, newSnapshot],
    updatedAt: Date.now(),
  };
}

// Undo recent AI changes by reverting to the previous snapshot
export function revertToPreviousSnapshot(workspace: Workspace): { 
  success: boolean; 
  workspace: Workspace; 
  message: string 
} {
  if (workspace.snapshots.length <= 1) {
    return {
      success: false,
      workspace,
      message: '当前已经是初始版本，无法继续撤销',
    };
  }

  const currentSnapIdx = workspace.snapshots.findIndex(s => s.version === workspace.currentVersion);
  const targetIdx = currentSnapIdx > 0 ? currentSnapIdx - 1 : workspace.snapshots.length - 2;
  const targetSnapshot = workspace.snapshots[targetIdx];

  const revertedWorkspace: Workspace = {
    ...workspace,
    currentVersion: targetSnapshot.version,
    files: JSON.parse(JSON.stringify(targetSnapshot.files)),
    updatedAt: Date.now(),
  };

  return {
    success: true,
    workspace: revertedWorkspace,
    message: `已成功撤销，回退至版本 v${targetSnapshot.version} (${targetSnapshot.label})`,
  };
}

// Restore entire workspace to the original pristine snapshot (v1)
export function restoreOriginalSnapshot(workspace: Workspace): { 
  success: boolean; 
  workspace: Workspace; 
  message: string 
} {
  const pristine = workspace.originalSnapshot;
  const resetWorkspace: Workspace = {
    ...workspace,
    currentVersion: 1,
    files: JSON.parse(JSON.stringify(pristine.files)),
    updatedAt: Date.now(),
  };

  return {
    success: true,
    workspace: resetWorkspace,
    message: '工作区已完全恢复至用户初始上传的基准版本 (v1)',
  };
}

// Package clean project files into a .zip archive (strictly excludes metadata and snapshots!)
export async function packageWorkspaceToZip(workspace: Workspace): Promise<Blob> {
  const zip = new JSZip();

  for (const [path, file] of Object.entries(workspace.files)) {
    // Only package valid user files, never internal files
    if (file.isBinary) {
      continue;
    }
    zip.file(path, file.content);
  }

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

// Search code keywords inside workspace files
export function searchWorkspaceCode(
  workspace: Workspace, 
  query: string
): { path: string; line: number; text: string }[] {
  if (!query) return [];
  const q = query.toLowerCase();
  const matches: { path: string; line: number; text: string }[] = [];

  for (const [path, file] of Object.entries(workspace.files)) {
    if (file.isBinary) continue;
    const lines = file.content.split('\n');
    lines.forEach((lineText, idx) => {
      if (lineText.toLowerCase().includes(q)) {
        matches.push({
          path,
          line: idx + 1,
          text: lineText.trim().slice(0, 160),
        });
      }
    });
  }

  return matches.slice(0, 40); // Safe match limit
}

// Get workspace directory tree overview string
export function getWorkspaceDirectoryTree(workspace: Workspace): string {
  const paths = Object.keys(workspace.files).sort();
  if (paths.length === 0) return '（工作区为空）';

  return paths.map(p => {
    const file = workspace.files[p];
    const sizeKb = Math.round((file.size / 1024) * 10) / 10;
    return `- ${p} (${sizeKb} KB)`;
  }).join('\n');
}

// Compute modified files count comparing to original snapshot
export function getModifiedFilesAgainstOriginal(workspace: Workspace): FileDiffItem[] {
  return computeDiffBetweenFileSnapshots(workspace.originalSnapshot.files, workspace.files);
}

// Add one or multiple files into current active workspace with safe path validation and conflict resolution
export function addFilesToActiveWorkspace(
  workspace: Workspace,
  filesToAdd: { path: string; content: string }[],
  conflictResolution: 'overwrite' | 'rename' | 'skip' = 'overwrite'
): { updatedWorkspace: Workspace; addedCount: number; overwrittenCount: number; skippedCount: number } {
  const updatedFiles = { ...workspace.files };
  let addedCount = 0;
  let overwrittenCount = 0;
  let skippedCount = 0;
  const now = Date.now();

  for (const item of filesToAdd) {
    const valid = validateSafeRelativePath(item.path);
    if (!valid.valid) {
      skippedCount++;
      continue;
    }

    let targetPath = valid.normalizedPath;

    if (updatedFiles[targetPath]) {
      if (conflictResolution === 'skip') {
        skippedCount++;
        continue;
      } else if (conflictResolution === 'rename') {
        const parts = targetPath.split('/');
        const fileName = parts.pop() || targetPath;
        const lastDot = fileName.lastIndexOf('.');
        const baseName = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
        const ext = lastDot > 0 ? fileName.slice(lastDot) : '';
        const dirPrefix = parts.length > 0 ? `${parts.join('/')}/` : '';
        
        let copyIndex = 1;
        let newTarget = `${dirPrefix}${baseName}_copy${ext}`;
        while (updatedFiles[newTarget]) {
          copyIndex++;
          newTarget = `${dirPrefix}${baseName}_copy${copyIndex}${ext}`;
        }
        targetPath = newTarget;
        addedCount++;
      } else {
        overwrittenCount++;
      }
    } else {
      addedCount++;
    }

    updatedFiles[targetPath] = {
      path: targetPath,
      content: item.content,
      size: item.content.length,
      isBinary: isBinaryFile(targetPath, item.content.slice(0, 200)),
      updatedAt: now,
    };
  }

  return {
    updatedWorkspace: {
      ...workspace,
      files: updatedFiles,
      updatedAt: now,
    },
    addedCount,
    overwrittenCount,
    skippedCount,
  };
}

// Delete an entire directory and all files within it
export function deleteFolderFromWorkspace(
  workspace: Workspace,
  folderPath: string
): { updatedWorkspace: Workspace; deletedCount: number } {
  const prefix = folderPath.replace(/^\/+/, '').replace(/\/+$/, '') + '/';
  const updatedFiles = { ...workspace.files };
  let deletedCount = 0;

  for (const p of Object.keys(updatedFiles)) {
    if (p.startsWith(prefix) || p === folderPath.replace(/^\/+/, '').replace(/\/+$/, '')) {
      delete updatedFiles[p];
      deletedCount++;
    }
  }

  return {
    updatedWorkspace: {
      ...workspace,
      files: updatedFiles,
      updatedAt: Date.now(),
    },
    deletedCount,
  };
}

// Rename an entire directory prefix
export function renameFolderInWorkspace(
  workspace: Workspace,
  oldFolderPrefix: string,
  newFolderPrefix: string
): { updatedWorkspace: Workspace; renamedCount: number } {
  const oldP = oldFolderPrefix.replace(/^\/+/, '').replace(/\/+$/, '') + '/';
  const newP = newFolderPrefix.replace(/^\/+/, '').replace(/\/+$/, '') + '/';
  const updatedFiles = { ...workspace.files };
  let renamedCount = 0;

  for (const [p, file] of Object.entries(workspace.files)) {
    if (p.startsWith(oldP)) {
      const rest = p.slice(oldP.length);
      const newPath = `${newP}${rest}`;
      delete updatedFiles[p];
      updatedFiles[newPath] = {
        ...file,
        path: newPath,
        updatedAt: Date.now(),
      };
      renamedCount++;
    }
  }

  return {
    updatedWorkspace: {
      ...workspace,
      files: updatedFiles,
      updatedAt: Date.now(),
    },
    renamedCount,
  };
}
