// Security and sanity limits for Workspace & ZIP extraction
export const WORKSPACE_LIMITS = {
  MAX_ZIP_SIZE: 200 * 1024 * 1024, // 200MB max ZIP file upload
  MAX_TOTAL_UNCOMPRESSED_SIZE: 400 * 1024 * 1024, // 400MB total extracted size
  MAX_FILE_COUNT: 2200, // Maximum 2200 files in a workspace
  MAX_SINGLE_FILE_SIZE: 200 * 1024 * 1024, // 200MB per single file
  MAX_PATH_DEPTH: 120, // Max directory nesting depth
  BLOCKED_EXTENSIONS: ['.exe', '.dll', '.so', '.dylib', '.bin'],
};

// Workspace File item representing a single file inside a workspace
export interface WorkspaceFile {
  path: string; // Normalized relative path, e.g. "src/App.tsx"
  content: string;
  isBinary?: boolean;
  size: number; // Size in bytes
  updatedAt: number;
}

// Diff representation for a single file between versions
export interface FileDiffItem {
  path: string;
  type: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;
  oldContent?: string;
  newContent?: string;
}

// Workspace snapshot for versioning and rollback (v1, v2, v3...)
export interface WorkspaceSnapshot {
  version: number;
  label: string;
  timestamp: number;
  files: Record<string, WorkspaceFile>; // Map of path -> file snapshot
  diffFromPrevious?: FileDiffItem[];
  source: 'upload' | 'agent' | 'user';
}

// Full Workspace entity
export interface Workspace {
  id: string;
  name: string;
  files: Record<string, WorkspaceFile>; // Current active files: path -> WorkspaceFile
  originalSnapshot: WorkspaceSnapshot; // v1: Baseline pristine snapshot from initial upload/creation
  snapshots: WorkspaceSnapshot[]; // History of versions [v1, v2, ...]
  currentVersion: number;
  createdAt: number;
  updatedAt: number;
  metadata?: {
    projectName?: string;
    description?: string;
    rules?: string[];
  };
}

// Diagnosis session context stored strictly within the single Chat's working context
export interface DiagnosisContext {
  target: string;
  depth: 'target' | 'related' | 'deep';
  checkedFiles: string[];
  checkedFunctions: string[];
  relatedFiles: string[];
  suspectedIssues: string[];
  confirmedIssues: string[];
  ruledOutIssues: string[];
  unresolvedQuestions: string[];
  lastConclusion?: 'confirmed_bug' | 'no_bug_found' | 'unconfirmed' | 'pending';
  lastReportSummary?: string;
  updatedAt: number;
}

// Individual Chat Context & Working Memory (strictly isolated per Chat!)
export interface ChatContext {
  currentTask?: string;
  userRequirements: string[];
  importantDecisions: string[];
  recentChanges: string[];
  lastModifiedFiles: string[];
  diagnosisContext?: DiagnosisContext;
}

// Tool Call Execution representation
export interface ToolCallExecution {
  id: string;
  toolName: string;
  args: Record<string, any>;
  result?: any;
  status: 'running' | 'success' | 'error';
  errorMessage?: string;
  diff?: {
    path: string;
    oldContent?: string;
    newContent?: string;
  };
  timestamp: number;
}

// Safe relative path validation & normalization (defense against Zip Slip & Traversal)
export function validateSafeRelativePath(rawPath: string): { 
  valid: boolean; 
  normalizedPath: string; 
  error?: string 
} {
  if (!rawPath || typeof rawPath !== 'string') {
    return { valid: false, normalizedPath: '', error: '路径不能为空' };
  }

  // Replace backslashes with forward slashes
  let p = rawPath.replace(/\\/g, '/').trim();

  // Remove leading slashes
  p = p.replace(/^\/+/, '');

  // Detect Path Traversal (../ or ..\ or null byte)
  if (p.includes('\0')) {
    return { valid: false, normalizedPath: '', error: '检测到非法空字符' };
  }

  // Check segments
  const segments = p.split('/');
  const cleanSegments: string[] = [];

  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      return { 
        valid: false, 
        normalizedPath: '', 
        error: `检测到非法路径穿越尝试: "${rawPath}"` 
      };
    }
    // Block windows absolute drive paths like "C:"
    if (seg.includes(':')) {
      return { 
        valid: false, 
        normalizedPath: '', 
        error: `检测到非法盘符或绝对路径: "${rawPath}"` 
      };
    }
    cleanSegments.push(seg);
  }

  // Directory depth excludes the final file name segment.
  const directoryDepth = Math.max(0, cleanSegments.length - 1);

  if (directoryDepth > WORKSPACE_LIMITS.MAX_PATH_DEPTH) {
    return { 
      valid: false, 
      normalizedPath: '', 
      error: `路径目录深度超过限制 (${WORKSPACE_LIMITS.MAX_PATH_DEPTH} 层): "${rawPath}"` 
    };
  }

  const normalized = cleanSegments.join('/');
  if (!normalized) {
    return { valid: false, normalizedPath: '', error: '无效空文件名' };
  }

  return { valid: true, normalizedPath: normalized };
}
