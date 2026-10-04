import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  X, 
  Folder, 
  FolderOpen,
  FileCode, 
  Upload, 
  Download, 
  Plus, 
  Trash2, 
  Search, 
  AlertTriangle,
  Edit2,
  Edit3,
  MoreHorizontal,
  FileText, 
  File, 
  Code2, 
  Check, 
  Archive, 
  MessageSquarePlus,
  FolderInput,
  ChevronRight,
  ChevronDown,
  FolderPlus,
  FilePlus,
  Layers,
  FileSpreadsheet,
  ChevronDown as DropdownIcon
} from 'lucide-react';
import { Workspace, WorkspaceFile } from '../types/workspace';
import { Attachment } from '../types';
import { workspaceFileToAttachment, workspaceZipToAttachment } from '../services/workspaceFileAttachment';
import { FileEditorModal } from './FileEditorModal';
import { ExcelEditorModal } from './ExcelEditorModal';
import { 
  importZipToNewWorkspace, 
  createEmptyWorkspace, 
  packageWorkspaceToZip,
  addFilesToActiveWorkspace,
  deleteFolderFromWorkspace,
  renameFolderInWorkspace
} from '../services/workspaceService';
import { downloadWorkspaceFile, decodeTextFile } from '../services/fileParser';

interface WorkspaceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  activeWorkspaceId?: string;
  onSelectWorkspace: (id: string) => void;
  onSaveWorkspace: (ws: Workspace) => void;
  onDeleteWorkspace: (id: string) => void;
  onSendAiMessage?: (prompt: string, attachments?: Attachment[]) => void;
  aiStatusText?: string;
}

// Hierarchical File Tree Node
interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children?: TreeNode[];
  file?: WorkspaceFile;
}

// Build nested tree from flat file map
function buildFileTree(files: Record<string, WorkspaceFile>, searchQuery = ''): TreeNode[] {
  const rootNodes: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();

  const q = searchQuery.toLowerCase().trim();
  const sortedPaths = Object.keys(files).sort();

  for (const path of sortedPaths) {
    if (q && !path.toLowerCase().includes(q)) {
      continue;
    }

    const segments = path.split('/');
    let currentPath = '';

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;
      const prevPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;

      if (isLast) {
        // File node
        const fileNode: TreeNode = {
          name: segment,
          path: currentPath,
          isFolder: false,
          file: files[path],
        };

        if (prevPath && folderMap.has(prevPath)) {
          folderMap.get(prevPath)!.children!.push(fileNode);
        } else {
          rootNodes.push(fileNode);
        }
      } else {
        // Folder node
        if (!folderMap.has(currentPath)) {
          const folderNode: TreeNode = {
            name: segment,
            path: currentPath,
            isFolder: true,
            children: [],
          };
          folderMap.set(currentPath, folderNode);

          if (prevPath && folderMap.has(prevPath)) {
            folderMap.get(prevPath)!.children!.push(folderNode);
          } else {
            rootNodes.push(folderNode);
          }
        }
      }
    }
  }

  // Sort nodes: folders first, then files alphabetically
  function sortTreeNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isFolder === b.isFolder) {
        return a.name.localeCompare(b.name);
      }
      return a.isFolder ? -1 : 1;
    });
    for (const node of nodes) {
      if (node.children) {
        sortTreeNodes(node.children);
      }
    }
  }

  sortTreeNodes(rootNodes);
  return rootNodes;
}

// Format relative timestamp like "修改于 16 秒前", "修改于 45 分钟前", "修改于 1 小时前", etc. (Exact to user image)
function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return '修改于 刚刚';
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);
  if (diffSec < 15) return '修改于 刚刚';
  if (diffSec < 60) return `修改于 ${diffSec} 秒前`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `修改于 ${diffMin} 分钟前`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `修改于 ${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '修改于 昨天';
  if (diffDays < 7) return `修改于 ${diffDays} 天前`;
  const date = new Date(timestamp);
  return `修改于 ${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Helper to choose appropriate file icon based on extension with rounded box
function renderFileIcon(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.zip') || lower.endsWith('.tar') || lower.endsWith('.gz')) {
    return (
      <div className="w-10 h-10 rounded-xl border border-amber-200/70 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 shadow-2xs">
        <Archive className="w-5 h-5" />
      </div>
    );
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv') || lower.endsWith('.tsv')) {
    return (
      <div className="w-10 h-10 rounded-xl border border-emerald-200/70 dark:border-emerald-800/50 bg-emerald-50/80 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 shadow-2xs">
        <FileSpreadsheet className="w-5 h-5" />
      </div>
    );
  }
  if (lower.endsWith('.tsx') || lower.endsWith('.jsx') || lower.endsWith('.ts') || lower.endsWith('.js')) {
    return (
      <div className="w-10 h-10 rounded-xl border border-blue-200/70 dark:border-blue-800/50 bg-blue-50/80 dark:bg-blue-950/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 shadow-2xs">
        <Code2 className="w-5 h-5" />
      </div>
    );
  }
  if (lower.endsWith('.json') || lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.endsWith('.xml') || lower.endsWith('.sql')) {
    return (
      <div className="w-10 h-10 rounded-xl border border-amber-200/70 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 shadow-2xs">
        <FileCode className="w-5 h-5" />
      </div>
    );
  }
  if (lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.doc') || lower.endsWith('.docx') || lower.endsWith('.pdf')) {
    return (
      <div className="w-10 h-10 rounded-xl border border-sky-200/70 dark:border-sky-800/50 bg-sky-50/80 dark:bg-sky-950/40 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0 shadow-2xs">
        <FileText className="w-5 h-5" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl border border-neutral-200/70 dark:border-neutral-700/50 bg-neutral-50 dark:bg-neutral-800/60 flex items-center justify-center text-neutral-500 shrink-0 shadow-2xs">
      <File className="w-5 h-5" />
    </div>
  );
}

export const WorkspaceDrawer: React.FC<WorkspaceDrawerProps> = ({
  isOpen,
  onClose,
  workspaces = [],
  activeWorkspaceId,
  onSelectWorkspace,
  onSaveWorkspace,
  onDeleteWorkspace,
  onSendAiMessage,
  aiStatusText,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuPath, setActiveMenuPath] = useState<string | null>(null);
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [isUploadDropdownOpen, setIsUploadDropdownOpen] = useState(false);
  const [isNewDropdownOpen, setIsNewDropdownOpen] = useState(false);

  // Folder Expansion Set
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src', 'components', 'services']));

  // Modals
  const [createType, setCreateType] = useState<'file' | 'folder' | null>(null);
  const [createTargetParent, setCreateTargetParent] = useState<string>('');
  const [newPathInput, setNewPathInput] = useState('');

  const [renamingItem, setRenamingItem] = useState<{ path: string; isFolder: boolean } | null>(null);
  const [renameInput, setRenameInput] = useState('');

  const [movingFile, setMovingFile] = useState<WorkspaceFile | null>(null);
  const [selectedTargetFolder, setSelectedTargetFolder] = useState<string>('');
  const [customNewFolder, setCustomNewFolder] = useState<string>('');

  // Editable File Modal State
  const [editingFile, setEditingFile] = useState<WorkspaceFile | null>(null);

  // File Upload Conflict Dialog
  const [pendingUploadFiles, setPendingUploadFiles] = useState<{ path: string; content: string }[] | null>(null);
  const [conflictFilesList, setConflictFilesList] = useState<string[]>([]);

  // Input Refs for Uploads
  const zipInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Close popup menus when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (activeMenuPath && !(e.target as HTMLElement).closest('.file-action-menu')) {
        setActiveMenuPath(null);
      }
      if (isWorkspaceDropdownOpen && !(e.target as HTMLElement).closest('.workspace-dropdown')) {
        setIsWorkspaceDropdownOpen(false);
      }
      if (isUploadDropdownOpen && !(e.target as HTMLElement).closest('.upload-dropdown')) {
        setIsUploadDropdownOpen(false);
      }
      if (isNewDropdownOpen && !(e.target as HTMLElement).closest('.new-dropdown')) {
        setIsNewDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenuPath, isWorkspaceDropdownOpen, isUploadDropdownOpen, isNewDropdownOpen]);

  // Workspace management state (Rename & Add)
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingWorkspaceName, setEditingWorkspaceName] = useState('');

  const handleSaveWorkspaceRename = (workspaceId: string) => {
    const trimmed = editingWorkspaceName.trim();
    if (!trimmed) {
      setEditingWorkspaceId(null);
      return;
    }
    const ws = workspaces.find(w => w.id === workspaceId);
    if (ws) {
      onSaveWorkspace({ ...ws, name: trimmed, updatedAt: Date.now() });
    }
    setEditingWorkspaceId(null);
  };

  const handleCreateNewWorkspace = () => {
    const nextNum = workspaces.length + 1;
    const newWs = createEmptyWorkspace(`工作区 ${nextNum}`);
    onSaveWorkspace(newWs);
    onSelectWorkspace(newWs.id);
    // Enter rename mode directly so user can type custom name immediately
    setEditingWorkspaceId(newWs.id);
    setEditingWorkspaceName(newWs.name);
  };

  const handleDeleteWorkspaceItem = (e: React.MouseEvent, workspaceId: string, workspaceName: string) => {
    e.stopPropagation();
    if (workspaces.length <= 1) {
      alert('至少需要保留一个工作区，无法删除最后一个工作区。');
      return;
    }
    onDeleteWorkspace(workspaceId);
  };

  // Active workspace
  const currentWorkspace = useMemo(() => {
    return workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0] || null;
  }, [workspaces, activeWorkspaceId]);

  // Build Hierarchical File Tree
  const fileTree = useMemo(() => {
    if (!currentWorkspace) return [];
    return buildFileTree(currentWorkspace.files, searchQuery);
  }, [currentWorkspace, searchQuery]);

  // Total file count
  const fileCount = useMemo(() => {
    if (!currentWorkspace?.files) return 0;
    return Object.keys(currentWorkspace.files).length;
  }, [currentWorkspace]);

  // All available folders for "添加到文件夹"
  const availableFolders = useMemo(() => {
    if (!currentWorkspace?.files) return [];
    const folderSet = new Set<string>();
    for (const path of Object.keys(currentWorkspace.files)) {
      const parts = path.split('/');
      if (parts.length > 1) {
        let acc = '';
        for (let i = 0; i < parts.length - 1; i++) {
          acc = acc ? `${acc}/${parts[i]}` : parts[i];
          folderSet.add(acc);
        }
      }
    }
    return Array.from(folderSet).sort();
  }, [currentWorkspace]);

  // Toggle folder expand/collapse
  const toggleFolder = (folderPath: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  // Open File Editor Modal
  const handleOpenFileEditor = (file: WorkspaceFile) => {
    setEditingFile(file);
    setActiveMenuPath(null);
  };

  // Save File Content Edits
  const handleSaveFileContent = (filePath: string, newContent: string) => {
    if (!currentWorkspace) return;
    const ws = { ...currentWorkspace, files: { ...currentWorkspace.files } };
    const fileData = ws.files[filePath];
    if (fileData) {
      ws.files[filePath] = {
        ...fileData,
        content: newContent,
        size: new Blob([newContent]).size,
        updatedAt: Date.now(),
      };
      ws.updatedAt = Date.now();
      onSaveWorkspace(ws);
      setEditingFile(prev => prev && prev.path === filePath ? { ...ws.files[filePath] } : prev);
    }
  };

  // 1. Action: 围绕此文件展开对话 (Starts AI chat focused on this file)
  const handleChatAroundFile = (file: WorkspaceFile) => {
    const att = workspaceFileToAttachment(file);
    onSendAiMessage?.(`围绕此文件 \`${file.path}\` 展开对话与分析：`, [att]);
    setActiveMenuPath(null);
    onClose();
  };

  // 2. Action: 下载单个文件 (Preserves exact file extension and MIME format)
  const handleDownloadSingleFile = (file: WorkspaceFile) => {
    try {
      downloadWorkspaceFile(file.path, file.content);
    } catch (e: any) {
      alert(`下载失败: ${e.message || '未知错误'}`);
    }
    setActiveMenuPath(null);
  };

  // 3. Action: 重命名
  const handleSaveRename = () => {
    if (!renamingItem || !currentWorkspace) return;
    const nextPath = renameInput.trim();
    if (!nextPath || nextPath === renamingItem.path) {
      setRenamingItem(null);
      return;
    }

    if (renamingItem.isFolder) {
      const res = renameFolderInWorkspace(currentWorkspace, renamingItem.path, nextPath);
      onSaveWorkspace(res.updatedWorkspace);
    } else {
      const ws = { ...currentWorkspace, files: { ...currentWorkspace.files } };
      const fileData = ws.files[renamingItem.path];
      if (fileData) {
        delete ws.files[renamingItem.path];
        ws.files[nextPath] = {
          ...fileData,
          path: nextPath,
          updatedAt: Date.now(),
        };
        ws.updatedAt = Date.now();
        onSaveWorkspace(ws);
      }
    }
    setRenamingItem(null);
    setRenameInput('');
  };

  // 4. Action: 添加到文件夹 / 移动到文件夹
  const handleMoveFileToFolder = () => {
    if (!movingFile || !currentWorkspace) return;
    const targetDir = customNewFolder.trim() || selectedTargetFolder.trim();
    const fileName = movingFile.path.split('/').pop() || movingFile.path;
    const newPath = targetDir ? `${targetDir.replace(/^\/+|\/+$/g, '')}/${fileName}` : fileName;

    if (newPath === movingFile.path) {
      setMovingFile(null);
      return;
    }

    const ws = { ...currentWorkspace, files: { ...currentWorkspace.files } };
    delete ws.files[movingFile.path];
    ws.files[newPath] = {
      ...movingFile,
      path: newPath,
      updatedAt: Date.now(),
    };
    ws.updatedAt = Date.now();
    onSaveWorkspace(ws);

    if (targetDir) {
      setExpandedFolders(prev => new Set(prev).add(targetDir));
    }

    setMovingFile(null);
    setSelectedTargetFolder('');
    setCustomNewFolder('');
  };

  // 5. Action: 删除文件
  const handleDeleteFile = (filePath: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentWorkspace) return;
    if (confirm(`确认删除文件 "${filePath}"？`)) {
      const ws = { ...currentWorkspace, files: { ...currentWorkspace.files } };
      delete ws.files[filePath];
      ws.updatedAt = Date.now();
      onSaveWorkspace(ws);
      setActiveMenuPath(null);
    }
  };

  // 6. Action: 删除文件夹
  const handleDeleteFolder = (folderPath: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentWorkspace) return;
    if (confirm(`确认删除文件夹 "${folderPath}" 及其包含的所有文件？`)) {
      const res = deleteFolderFromWorkspace(currentWorkspace, folderPath);
      onSaveWorkspace(res.updatedWorkspace);
      setActiveMenuPath(null);
    }
  };

  // 7. Action: 创建新文件 / 文件夹
  const handleCreateSubmit = () => {
    if (!createType || !currentWorkspace) return;
    let rawPath = newPathInput.trim().replace(/^\/+/, '');
    if (!rawPath) {
      setCreateType(null);
      return;
    }

    const fullPath = createTargetParent ? `${createTargetParent}/${rawPath}` : rawPath;

    if (createType === 'file') {
      const ws = { ...currentWorkspace, files: { ...currentWorkspace.files } };
      if (ws.files[fullPath]) {
        alert(`文件 "${fullPath}" 已存在！`);
        return;
      }
      ws.files[fullPath] = {
        path: fullPath,
        content: '',
        size: 0,
        updatedAt: Date.now(),
      };
      ws.updatedAt = Date.now();
      onSaveWorkspace(ws);
    } else {
      const placeholder = `${fullPath}/.gitkeep`;
      const ws = { ...currentWorkspace, files: { ...currentWorkspace.files } };
      ws.files[placeholder] = {
        path: placeholder,
        content: '',
        size: 0,
        updatedAt: Date.now(),
      };
      ws.updatedAt = Date.now();
      onSaveWorkspace(ws);
      setExpandedFolders(prev => new Set(prev).add(fullPath));
    }

    setCreateType(null);
    setNewPathInput('');
  };

  // 8. Action: 上传单文件/多文件
  const handleUploadFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !currentWorkspace) return;

    const filesToUpload: { path: string; content: string }[] = [];
    const conflicts: string[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const relPath = (f as any).webkitRelativePath || f.name;
      const cleanPath = relPath.replace(/^\/+/, '');
      
      let fileContent = '';
      const isBinary = /\.(xlsx|xls|pdf|png|jpg|jpeg|gif|webp|ico|bmp|zip)$/i.test(cleanPath);
      if (isBinary) {
        fileContent = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(f);
        });
      } else {
        const buffer = await f.arrayBuffer();
        fileContent = decodeTextFile(buffer);
      }

      if (currentWorkspace.files[cleanPath]) {
        conflicts.push(cleanPath);
      }
      filesToUpload.push({ path: cleanPath, content: fileContent });
    }

    if (conflicts.length > 0) {
      setConflictFilesList(conflicts);
      setPendingUploadFiles(filesToUpload);
    } else {
      const res = addFilesToActiveWorkspace(currentWorkspace, filesToUpload, 'overwrite');
      onSaveWorkspace(res.updatedWorkspace);
    }
    e.target.value = '';
    setIsUploadDropdownOpen(false);
  };

  // 9. Action: 上传 ZIP 导入为新工作区
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const res = await importZipToNewWorkspace(file);
      if (res.success && res.workspace) {
        onSaveWorkspace(res.workspace);
        onSelectWorkspace(res.workspace.id);
      } else {
        alert(`导入 ZIP 失败: ${res.error || '未知错误'}`);
      }
    } catch (err: any) {
      alert(`导入 ZIP 失败: ${err.message || '未知错误'}`);
    }
    e.target.value = '';
    setIsUploadDropdownOpen(false);
  };

  // 10. Action: 解决同名冲突
  const handleResolveConflict = (strategy: 'overwrite' | 'rename') => {
    if (!pendingUploadFiles || !currentWorkspace) return;
    const res = addFilesToActiveWorkspace(currentWorkspace, pendingUploadFiles, strategy);
    onSaveWorkspace(res.updatedWorkspace);
    setPendingUploadFiles(null);
    setConflictFilesList([]);
  };

  // 11. Action: 打包下载整工作区 ZIP
  const handleDownloadZip = async () => {
    if (!currentWorkspace || Object.keys(currentWorkspace.files).length === 0) {
      alert('当前工作区没有可下载的文件');
      return;
    }
    try {
      const blob = await packageWorkspaceToZip(currentWorkspace);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentWorkspace.name}-v${currentWorkspace.currentVersion}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`打包下载失败: ${e.message || '未知错误'}`);
    }
  };

  if (!isOpen) return null;

  // Recursive Tree Node Renderer (Clean, List View as pictured in IMG_20260928_231518.jpg)
  const renderTreeNode = (node: TreeNode, depth = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isMenuOpen = activeMenuPath === node.path;

    if (node.isFolder) {
      const childCount = node.children ? node.children.length : 0;
      return (
        <div key={node.path} className="select-none">
          <div
            onClick={() => toggleFolder(node.path)}
            style={{ paddingLeft: `${depth * 18 + 16}px` }}
            className="group flex items-center justify-between py-2.5 pr-4 rounded-xl cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800/60 text-neutral-800 dark:text-neutral-200 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl border border-amber-200/70 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 shadow-2xs">
                {isExpanded ? <FolderOpen className="w-5 h-5" /> : <Folder className="w-5 h-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-medium text-sm text-neutral-800 dark:text-neutral-200">
                  <span className="truncate">{node.name}</span>
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-neutral-400" /> : <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />}
                </div>
                <div className="text-xs text-neutral-400 dark:text-neutral-500 font-normal">
                  {childCount} 个项目
                </div>
              </div>
            </div>

            {/* Folder Actions Menu */}
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenuPath(isMenuOpen ? null : node.path);
                }}
                className="p-1.5 rounded-lg border border-neutral-200/80 dark:border-neutral-700/80 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition cursor-pointer"
                title="文件夹操作"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {/* Folder Menu Popup */}
              {isMenuOpen && (
                <div className="file-action-menu absolute right-0 top-8 z-50 w-44 bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-700 py-1.5 text-xs animate-in fade-in zoom-in-95">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCreateTargetParent(node.path);
                      setCreateType('file');
                      setActiveMenuPath(null);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-200 font-medium"
                  >
                    <FilePlus className="w-4 h-4 text-neutral-500" />
                    <span>新建子文件</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCreateTargetParent(node.path);
                      setCreateType('folder');
                      setActiveMenuPath(null);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-200 font-medium"
                  >
                    <FolderPlus className="w-4 h-4 text-neutral-500" />
                    <span>新建子文件夹</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingItem({ path: node.path, isFolder: true });
                      setRenameInput(node.path);
                      setActiveMenuPath(null);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-200 font-medium"
                  >
                    <Edit3 className="w-4 h-4 text-neutral-500" />
                    <span>重命名</span>
                  </button>
                  <div className="my-1 border-t border-neutral-100 dark:border-neutral-700" />
                  <button
                    type="button"
                    onClick={(e) => handleDeleteFolder(node.path, e)}
                    className="w-full text-left px-3.5 py-2 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 font-medium flex items-center gap-2.5"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                    <span>删除文件夹</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Children container */}
          {isExpanded && node.children && (
            <div className="space-y-0.5">
              {node.children.map(child => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // Single File Row (Matching IMG_20260928_231518.jpg)
    return (
      <div
        key={node.path}
        style={{ paddingLeft: `${depth * 18 + 16}px` }}
        className="group flex items-center justify-between py-2.5 pr-4 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800/60 transition-colors"
      >
        {/* Left: Icon and Name/Time info */}
        <div 
          onClick={() => node.file && handleOpenFileEditor(node.file)}
          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
        >
          {renderFileIcon(node.name)}
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm text-neutral-800 dark:text-neutral-200 truncate group-hover:text-lime-500 transition-colors">
              {node.name}
            </div>
            <div className="text-xs text-neutral-400 dark:text-neutral-500 font-normal mt-0.5">
              {formatRelativeTime(node.file?.updatedAt)}
            </div>
          </div>
        </div>

        {/* Right: Three Dots Button `...` (Matching Image) */}
        <div className="relative flex items-center ml-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenuPath(isMenuOpen ? null : node.path);
            }}
            className="p-1.5 rounded-lg border border-neutral-200/80 dark:border-neutral-700/80 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition cursor-pointer"
            title="更多操作"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {/* Popup Menu */}
          {isMenuOpen && node.file && (
            <div className="file-action-menu absolute right-0 top-8 z-50 w-52 bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-700 py-2 text-xs animate-in fade-in zoom-in-95">
              {/* 编辑文件内容 */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenFileEditor(node.file!);
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-3 text-lime-600 dark:text-lime-400 font-medium transition-colors"
              >
                <Edit3 className="w-4 h-4 text-lime-500" />
                <span>编辑文件内容</span>
              </button>

              {/* 围绕此内容展开对话 */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleChatAroundFile(node.file!);
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-3 text-neutral-800 dark:text-neutral-200 font-medium transition-colors"
              >
                <MessageSquarePlus className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                <span>围绕此内容展开对话</span>
              </button>

              {/* 2. 下载 */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownloadSingleFile(node.file!);
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-3 text-neutral-800 dark:text-neutral-200 font-medium transition-colors"
              >
                <Download className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                <span>下载</span>
              </button>

              {/* 3. 重命名 */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingItem({ path: node.path, isFolder: false });
                  setRenameInput(node.path);
                  setActiveMenuPath(null);
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-3 text-neutral-800 dark:text-neutral-200 font-medium transition-colors"
              >
                <Edit3 className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                <span>重命名</span>
              </button>

              {/* 4. 添加到文件夹 */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMovingFile(node.file!);
                  setSelectedTargetFolder('');
                  setCustomNewFolder('');
                  setActiveMenuPath(null);
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-3 text-neutral-800 dark:text-neutral-200 font-medium transition-colors"
              >
                <FolderInput className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                <span>添加到文件夹</span>
              </button>

              <div className="my-1 border-t border-neutral-100 dark:border-neutral-700" />

              {/* 5. 删除 */}
              <button
                type="button"
                onClick={(e) => handleDeleteFile(node.path, e)}
                className="w-full text-left px-4 py-2.5 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 font-medium flex items-center gap-3 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span>删除</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Hidden File Inputs for Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUploadFilesSelected}
        multiple
        className="hidden"
      />
      <input
        type="file"
        ref={folderInputRef}
        onChange={handleUploadFilesSelected}
        {...({ webkitdirectory: '', directory: '' } as any)}
        className="hidden"
      />
      <input
        type="file"
        ref={zipInputRef}
        onChange={handleZipUpload}
        accept=".zip"
        className="hidden"
      />

      {/* Main Modal Backdrop */}
      <div 
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in"
        onClick={onClose}
      >
        {/* File Manager Card Panel (Pure file list area, no code editor pane) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="workspace-drawer w-full max-w-2xl h-[680px] max-h-[90vh] bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-800 flex flex-col overflow-hidden animate-in zoom-in-95"
        >
          {/* Header Bar */}
          <div className="px-4 sm:px-5 py-3 border-b border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center shrink-0 bg-neutral-50/50 dark:bg-neutral-900/50 gap-2.5 sm:gap-3">
            {/* Left: Workspace Selector & New Plus Button placed immediately to its right */}
            <div className="flex items-center gap-2 min-w-0 flex-1 w-full sm:w-auto">
              {/* Workspace Selector Dropdown */}
              <div className="relative workspace-dropdown min-w-0 flex-1 sm:flex-none">
                <button
                  type="button"
                  onClick={() => setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
                  className="workspace-drawer-header-btn h-9 w-full sm:w-auto max-w-full min-w-0 px-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/90 hover:bg-neutral-100 dark:hover:bg-neutral-750 text-neutral-800 dark:text-neutral-100 transition cursor-pointer shadow-2xs flex items-center gap-1.5"
                  title="点击管理与切换工作区（支持重命名、新建、删除）"
                >
                  <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div className="flex flex-col text-left min-w-0 flex-1 sm:max-w-[150px]">
                    <span className="text-xs font-semibold leading-tight truncate">
                      {currentWorkspace?.name || '我的工作区'}
                    </span>
                    <span className="text-[9px] text-neutral-400 leading-none">
                      切换与管理
                    </span>
                  </div>
                  <DropdownIcon className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform duration-200 ${isWorkspaceDropdownOpen ? 'rotate-180 text-indigo-500' : ''}`} />
                </button>

                {/* Workspace Selector & Manager Dropdown Popup (Matching IMG_20261001_171254.jpg) */}
                {isWorkspaceDropdownOpen && (
                  <div className="workspace-dropdown-menu absolute left-0 top-11 z-50 w-72 sm:w-80 bg-white dark:bg-neutral-850 rounded-2xl shadow-2xl border border-neutral-200/90 dark:border-neutral-750 p-2.5 text-xs animate-in fade-in zoom-in-95 select-none">
                    {/* Top Bar: Title & Count */}
                    <div className="flex items-center justify-between px-1.5 pb-2 border-b border-neutral-100 dark:border-neutral-750">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-neutral-800 dark:text-neutral-200">
                        <Layers className="w-3.5 h-3.5 text-indigo-500" />
                        <span>工作区管理</span>
                        <span className="text-[10px] font-normal text-neutral-400">({workspaces.length})</span>
                      </div>
                    </div>

                    {/* Workspace Items List */}
                    <div className="max-h-60 overflow-y-auto space-y-1 my-1.5 pr-0.5">
                      {workspaces.map((w) => {
                        const isActive = w.id === currentWorkspace?.id;
                        const isEditing = editingWorkspaceId === w.id;
                        const fileCount = Object.keys(w.files || {}).length;

                        if (isEditing) {
                          return (
                            <div
                              key={w.id}
                              className="flex items-center gap-1.5 min-w-0 p-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-xl border border-indigo-500 animate-in fade-in duration-150"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                value={editingWorkspaceName}
                                onChange={(e) => setEditingWorkspaceName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveWorkspaceRename(w.id);
                                  if (e.key === 'Escape') setEditingWorkspaceId(null);
                                }}
                                autoFocus
                                placeholder="输入工作区名称..."
                                className="min-w-0 flex-1 px-2 py-1 text-xs bg-transparent outline-hidden text-neutral-900 dark:text-neutral-100 font-medium"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveWorkspaceRename(w.id)}
                                className="p-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition cursor-pointer shrink-0"
                                title="保存名称"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingWorkspaceId(null)}
                                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer shrink-0"
                                title="取消"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={w.id}
                            onClick={() => {
                              onSelectWorkspace(w.id);
                              setIsWorkspaceDropdownOpen(false);
                            }}
                            className={`group flex items-center justify-between p-2 rounded-xl transition cursor-pointer ${
                              isActive
                                ? 'bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800/80 shadow-2xs'
                                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-transparent'
                            }`}
                          >
                            {/* Left: Indicator, Name, Files Count */}
                            <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                              <div
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  isActive
                                    ? 'bg-indigo-600 dark:bg-indigo-400 ring-2 ring-indigo-500/20'
                                    : 'bg-neutral-300 dark:bg-neutral-600 group-hover:bg-indigo-400'
                                }`}
                              />
                              <span
                                className={`truncate text-xs ${
                                  isActive
                                    ? 'font-bold text-indigo-700 dark:text-indigo-300'
                                    : 'text-neutral-700 dark:text-neutral-200'
                                }`}
                                title={w.name}
                              >
                                {w.name}
                              </span>
                              <span className="text-[10px] text-neutral-400 font-mono shrink-0">
                                ({fileCount} 文件)
                              </span>
                            </div>

                            {/* Right: Actions (Rename & Delete) */}
                            <div
                              className="flex items-center gap-1 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Rename Button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingWorkspaceId(w.id);
                                  setEditingWorkspaceName(w.name);
                                }}
                                className="p-1 rounded-lg text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-neutral-700 transition cursor-pointer shadow-2xs"
                                title={`重命名「${w.name}」`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete Button */}
                              <button
                                type="button"
                                onClick={(e) => handleDeleteWorkspaceItem(e, w.id, w.name)}
                                className="p-1 rounded-lg text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-white dark:hover:bg-neutral-700 transition cursor-pointer shadow-2xs"
                                title={`删除「${w.name}」`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Bottom Add Workspace Button */}
                    <div className="pt-2 border-t border-neutral-100 dark:border-neutral-755">
                      <button
                        type="button"
                        onClick={handleCreateNewWorkspace}
                        className="w-full py-2 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.98] shadow-xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>添加新工作区</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* New/Plus Dropdown */}
              <div className="relative new-dropdown shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNewDropdownOpen(!isNewDropdownOpen)}
                  className="workspace-drawer-header-btn h-9 px-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/90 hover:bg-neutral-100 dark:hover:bg-neutral-750 text-neutral-800 dark:text-neutral-100 transition cursor-pointer shrink-0 shadow-2xs flex items-center justify-center gap-1"
                  title="新建文件或文件夹"
                >
                  <Plus className="w-4 h-4 text-neutral-700 dark:text-neutral-200 stroke-[2] shrink-0" />
                  <DropdownIcon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                </button>

                {isNewDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 z-50 w-44 bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-700 py-1.5 text-xs animate-in fade-in zoom-in-95">
                    <button
                      type="button"
                      onClick={() => {
                        setCreateTargetParent('');
                        setCreateType('file');
                        setIsNewDropdownOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-300"
                    >
                      <FilePlus className="w-4 h-4 text-neutral-500" />
                      <span>新建文件</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateTargetParent('');
                        setCreateType('folder');
                        setIsNewDropdownOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-300"
                    >
                      <FolderPlus className="w-4 h-4 text-neutral-500" />
                      <span>新建文件夹</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Actions (Upload with text removed, Download ZIP, Close) */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto w-full sm:w-auto justify-end">
              {/* Upload Dropdown */}
              <div className="relative upload-dropdown shrink-0">
                <button
                  type="button"
                  onClick={() => setIsUploadDropdownOpen(!isUploadDropdownOpen)}
                  className="workspace-drawer-header-btn h-9 px-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/90 hover:bg-neutral-100 dark:hover:bg-neutral-750 text-neutral-800 dark:text-neutral-100 transition cursor-pointer shrink-0 shadow-2xs flex items-center justify-center gap-1"
                  title="上传文件、文件夹或导入 ZIP"
                >
                  <Upload className="w-4 h-4 text-neutral-700 dark:text-neutral-200 stroke-[2] shrink-0" />
                  <DropdownIcon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                </button>

                {isUploadDropdownOpen && (
                  <div className="absolute top-full right-0 mt-2 z-50 w-44 bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-700 py-1.5 text-xs animate-in fade-in zoom-in-95">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full text-left px-3.5 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-300 transition-colors"
                    >
                      <File className="w-4 h-4 text-neutral-500" />
                      <span>上传文件</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className="w-full text-left px-3.5 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-300 transition-colors"
                    >
                      <Folder className="w-4 h-4 text-neutral-500" />
                      <span>上传文件夹</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => zipInputRef.current?.click()}
                      className="w-full text-left px-3.5 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-300 transition-colors"
                    >
                      <Archive className="w-4 h-4 text-amber-500" />
                      <span>导入 ZIP 压缩包</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Download ZIP button */}
              <button
                type="button"
                onClick={handleDownloadZip}
                className="workspace-drawer-header-btn h-9 w-9 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/90 hover:bg-neutral-100 dark:hover:bg-neutral-750 text-neutral-800 dark:text-neutral-100 transition cursor-pointer shrink-0 shadow-2xs flex items-center justify-center"
                title="打包下载整工作区 ZIP"
              >
                <Download className="w-4 h-4 text-neutral-700 dark:text-neutral-200 stroke-[2] shrink-0" />
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="workspace-drawer-header-btn h-9 w-9 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/90 hover:bg-neutral-100 dark:hover:bg-neutral-750 text-neutral-800 dark:text-neutral-100 transition cursor-pointer shrink-0 shadow-2xs flex items-center justify-center"
                title="关闭工作区"
              >
                <X className="w-4 h-4 text-neutral-700 dark:text-neutral-200 stroke-[2] shrink-0" />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-6 py-2.5 border-b border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 shrink-0">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索工作区文件..."
                className="w-full pl-9 pr-8 py-2 bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700/80 rounded-xl text-xs text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Category Header "名称" */}
          <div className="px-6 pt-3 pb-1.5 flex items-center justify-between text-xs font-semibold text-neutral-400 dark:text-neutral-500 select-none">
            <span>名称</span>
            <span>共 {fileCount} 个文件</span>
          </div>

          {/* File List Body */}
          <div className="flex-1 overflow-y-auto px-4 py-1 space-y-1">
            {fileTree.length === 0 ? (
              <div className="py-20 text-center text-neutral-400 space-y-2">
                <Folder className="w-10 h-10 mx-auto opacity-30" />
                <p className="text-sm font-medium">当前工作区为空</p>
                <p className="text-xs text-neutral-500">点击上方“上传”或“新建”即可添加代码与文档文件</p>
              </div>
            ) : (
              fileTree.map(node => renderTreeNode(node, 0))
            )}
          </div>
        </div>
      </div>

      {/* "添加到文件夹" Modal */}
      {movingFile && (
        <div 
          className="fixed inset-0 z-60 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setMovingFile(null)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl p-5 shadow-2xl border border-neutral-200 dark:border-neutral-800 space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-neutral-900 dark:text-white font-semibold text-sm">
                <FolderInput className="w-4 h-4 text-indigo-500" />
                <span>添加到文件夹</span>
              </div>
              <button 
                type="button" 
                onClick={() => setMovingFile(null)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-500">
              选择将文件 <code className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded font-mono">{movingFile.path}</code> 移动到目标文件夹：
            </p>

            <div className="space-y-2 max-h-48 overflow-y-auto p-1">
              {/* Root folder option */}
              <label 
                onClick={() => {
                  setSelectedTargetFolder('');
                  setCustomNewFolder('');
                }}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                  selectedTargetFolder === '' && !customNewFolder
                    ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                    : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <Folder className="w-4 h-4 text-neutral-400" />
                <span>工作区根目录 ( / )</span>
              </label>

              {/* Existing folders */}
              {availableFolders.map(folder => (
                <label 
                  key={folder}
                  onClick={() => {
                    setSelectedTargetFolder(folder);
                    setCustomNewFolder('');
                  }}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                    selectedTargetFolder === folder && !customNewFolder
                      ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                      : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  <Folder className="w-4 h-4 text-amber-500" />
                  <span className="font-mono">{folder}/</span>
                </label>
              ))}
            </div>

            {/* Custom New Folder input */}
            <div className="space-y-1 pt-1">
              <label className="text-[11px] font-medium text-neutral-500">或者输入新建文件夹名：</label>
              <input
                type="text"
                value={customNewFolder}
                onChange={(e) => {
                  setCustomNewFolder(e.target.value);
                  setSelectedTargetFolder('');
                }}
                placeholder="例如：chapters 或 docs"
                className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setMovingFile(null)}
                className="px-3 py-1.5 rounded-xl text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleMoveFileToFolder}
                className="px-4 py-1.5 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition cursor-pointer"
              >
                确认移动
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Dialog Modal */}
      {renamingItem && (
        <div 
          className="fixed inset-0 z-60 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setRenamingItem(null)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white dark:bg-neutral-900 rounded-2xl p-5 shadow-2xl border border-neutral-200 dark:border-neutral-800 space-y-4 animate-in zoom-in-95"
          >
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              重命名 {renamingItem.isFolder ? '文件夹' : '文件'}
            </h3>
            <input
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
              autoFocus
              className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenamingItem(null)}
                className="px-3 py-1.5 rounded-xl text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveRename}
                className="px-4 py-1.5 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition cursor-pointer"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create File / Folder Dialog */}
      {createType && (
        <div 
          className="fixed inset-0 z-60 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setCreateType(null)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white dark:bg-neutral-900 rounded-2xl p-5 shadow-2xl border border-neutral-200 dark:border-neutral-800 space-y-4 animate-in zoom-in-95"
          >
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              新建{createType === 'file' ? '文件' : '文件夹'}
              {createTargetParent && <span className="text-xs text-neutral-400 font-normal"> (在 {createTargetParent}/ 下)</span>}
            </h3>
            <input
              type="text"
              value={newPathInput}
              onChange={(e) => setNewPathInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateSubmit()}
              placeholder={createType === 'file' ? '例如: chapter_01.txt 或 util.ts' : '例如: chapters 或 components'}
              autoFocus
              className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateType(null)}
                className="px-3 py-1.5 rounded-xl text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreateSubmit}
                className="px-4 py-1.5 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition cursor-pointer"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Upload Conflict Dialog */}
      {pendingUploadFiles && conflictFilesList.length > 0 && (
        <div className="fixed inset-0 z-70 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl p-5 shadow-2xl border border-amber-200 dark:border-amber-800/60 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-semibold">检测到同名文件冲突</h3>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-300">
              当前工作区中已存在以下同名文件：
            </p>
            <div className="max-h-32 overflow-y-auto p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-950 font-mono text-[11px] text-neutral-700 dark:text-neutral-300 divide-y divide-neutral-200 dark:divide-neutral-800">
              {conflictFilesList.map(p => (
                <div key={p} className="py-1">{p}</div>
              ))}
            </div>
            <p className="text-xs text-neutral-500">
              请选择处理策略，避免误覆盖重要代码：
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPendingUploadFiles(null);
                  setConflictFilesList([]);
                }}
                className="px-3 py-1.5 rounded-xl text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                取消上传
              </button>
              <button
                type="button"
                onClick={() => handleResolveConflict('rename')}
                className="px-3 py-1.5 rounded-xl text-xs bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-200 font-medium transition cursor-pointer"
              >
                另存为副本 (_copy)
              </button>
              <button
                type="button"
                onClick={() => handleResolveConflict('overwrite')}
                className="px-3.5 py-1.5 rounded-xl text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium transition cursor-pointer"
              >
                覆盖已有文件
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editable File Modal */}
      {editingFile && (
        /\.(xlsx|xls|csv|tsv)$/i.test(editingFile.path) ? (
          <ExcelEditorModal
            isOpen={!!editingFile}
            file={editingFile}
            onClose={() => setEditingFile(null)}
            onSave={handleSaveFileContent}
          />
        ) : (
          <FileEditorModal
            isOpen={!!editingFile}
            file={editingFile}
            onClose={() => setEditingFile(null)}
            onSave={handleSaveFileContent}
          />
        )
      )}
    </>
  );
};
