import { Attachment } from '../types';
import { WorkspaceFile, Workspace } from '../types/workspace';
import { packageWorkspaceToZip } from './workspaceService';

function guessMimeType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'txt': return 'text/plain';
    case 'md':
    case 'markdown': return 'text/markdown';
    case 'csv': return 'text/csv';
    case 'tsv': return 'text/tab-separated-values';
    case 'json': return 'application/json';
    case 'js':
    case 'mjs':
    case 'cjs': return 'text/javascript';
    case 'jsx': return 'text/jsx';
    case 'ts': return 'text/typescript';
    case 'tsx': return 'text/tsx';
    case 'html': return 'text/html';
    case 'css': return 'text/css';
    case 'py': return 'text/x-python';
    case 'java': return 'text/x-java';
    case 'c':
    case 'h': return 'text/x-c';
    case 'cpp': return 'text/x-c++';
    case 'go': return 'text/x-go';
    case 'rs': return 'text/x-rust';
    case 'sh': return 'text/x-shellscript';
    case 'yaml':
    case 'yml': return 'application/yaml';
    case 'xml': return 'text/xml';
    case 'sql': return 'application/sql';
    case 'env': return 'text/plain';
    case 'pdf': return 'application/pdf';
    case 'zip': return 'application/zip';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

/**
 * Convert a single WorkspaceFile into an Attachment.
 * Retains file identity (mime type, base64 data, extracted text).
 * Sent via native multimodal parts / attachments without inflating the prompt.
 */
export function workspaceFileToAttachment(file: WorkspaceFile): Attachment {
  const mimeType = guessMimeType(file.path);
  let base64Data: string;

  if (file.isBinary) {
    base64Data = file.content;
  } else {
    try {
      base64Data = btoa(unescape(encodeURIComponent(file.content)));
    } catch {
      base64Data = btoa(file.content.slice(0, 50000));
    }
  }

  const fileName = file.path.split('/').pop() || file.path;

  return {
    id: `ws_att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: fileName,
    size: file.size || (file.content ? file.content.length : 0),
    type: mimeType,
    dataUrl: mimeType.startsWith('image/') ? `data:${mimeType};base64,${base64Data}` : undefined,
    base64Data,
    extractedText: !file.isBinary ? file.content : undefined,
  };
}

/**
 * Package the workspace as a ZIP Attachment for read-only analysis in normal chat.
 */
export async function workspaceZipToAttachment(workspace: Workspace): Promise<Attachment> {
  const blob = await packageWorkspaceToZip(workspace);
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Data = btoa(binary);
  const zipName = `${workspace.name}-v${workspace.currentVersion}.zip`;

  const fileList = Object.keys(workspace.files);
  const manifest = `[工作区 ZIP 压缩包: ${zipName}]\n包含 ${fileList.length} 个文件:\n${fileList.map(f => `- ${f}`).join('\n')}`;

  return {
    id: `ws_zip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: zipName,
    size: blob.size,
    type: 'application/zip',
    base64Data,
    extractedText: manifest,
  };
}

/**
 * Detect if the user explicitly requested reading/analyzing a ZIP file
 */
export function isWorkspaceZipRequested(text: string): boolean {
  const lower = (text || '').toLowerCase();
  return (
    lower.includes('.zip') ||
    lower.includes('这个 zip') ||
    lower.includes('这个zip') ||
    lower.includes('项目 zip') ||
    lower.includes('工作区 zip') ||
    lower.includes('压缩包')
  );
}

/**
 * On-demand workspace file resolver:
 * Matches ONLY the files explicitly mentioned in the user's prompt (e.g. "帮我分析第3章", "看看 App.tsx", "对比 a.js 和 b.js").
 * Strictly limits to a maximum of 5 files to prevent accidental mass attachment.
 */
export function resolveMentionedWorkspaceFiles(
  text: string,
  workspace: Workspace,
  alreadyAttachedNames: Set<string> = new Set()
): WorkspaceFile[] {
  if (!text || !workspace || !workspace.files) return [];

  const matched: WorkspaceFile[] = [];
  const files = Object.values(workspace.files);

  for (const file of files) {
    const fullPath = file.path;
    const fileName = fullPath.split('/').pop() || fullPath;
    const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;

    // Skip if already in attachments
    if (alreadyAttachedNames.has(fileName) || alreadyAttachedNames.has(fullPath)) {
      continue;
    }

    // 1. Exact match on full path (e.g. `src/App.tsx` or "src/App.tsx")
    const hasFullPath = text.includes(fullPath);

    // 2. Exact match on file name (e.g. `App.tsx` or "第3章.txt")
    const hasFileName = text.includes(fileName);

    // 3. Match on base name if it is specific enough (length >= 3, e.g. "第3章", "userController")
    const hasBaseName = baseName.length >= 3 && text.includes(baseName);

    if (hasFullPath || hasFileName || hasBaseName) {
      matched.push(file);
      if (matched.length >= 5) break; // Maximum 5 files per on-demand fetch
    }
  }

  return matched;
}
