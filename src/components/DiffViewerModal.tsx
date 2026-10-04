import React, { useState, useMemo } from 'react';
import { 
  X, 
  FileCode, 
  Plus, 
  Trash2, 
  Edit3, 
  Download, 
  FileCheck,
  Layers,
  ArrowRight,
  Activity
} from 'lucide-react';
import { Workspace, FileDiffItem } from '../types/workspace';
import { computeDiffBetweenFileSnapshots } from '../services/workspaceService';

interface DiffViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: Workspace | null;
  onDownloadZip: () => void;
  onDiagnoseDiff?: (path: string) => void;
}

export const DiffViewerModal: React.FC<DiffViewerModalProps> = ({
  isOpen,
  onClose,
  workspace,
  onDownloadZip,
  onDiagnoseDiff,
}) => {
  if (!isOpen || !workspace) return null;

  const diffList: FileDiffItem[] = useMemo(() => {
    return computeDiffBetweenFileSnapshots(workspace.originalSnapshot.files, workspace.files);
  }, [workspace]);

  const [selectedPath, setSelectedPath] = useState<string>(diffList[0]?.path || '');

  const activeDiff = useMemo(() => {
    return diffList.find(d => d.path === selectedPath) || diffList[0] || null;
  }, [diffList, selectedPath]);

  // Compute simple unified line diff for display
  const lineDiffs = useMemo(() => {
    if (!activeDiff) return [];
    const oldLines = (activeDiff.oldContent || '').split('\n');
    const newLines = (activeDiff.newContent || '').split('\n');

    if (activeDiff.type === 'added') {
      return newLines.map((line, idx) => ({
        type: 'add' as const,
        lineNum: idx + 1,
        text: line,
      }));
    }

    if (activeDiff.type === 'deleted') {
      return oldLines.map((line, idx) => ({
        type: 'del' as const,
        lineNum: idx + 1,
        text: line,
      }));
    }

    // Line by line diff for modified files
    const result: Array<{ type: 'normal' | 'add' | 'del'; oldNum?: number; newNum?: number; text: string }> = [];
    const maxLen = Math.max(oldLines.length, newLines.length);

    // Simple diff display
    let oldIdx = 0;
    let newIdx = 0;

    while (oldIdx < oldLines.length || newIdx < newLines.length) {
      const oldLine = oldLines[oldIdx];
      const newLine = newLines[newIdx];

      if (oldLine === newLine) {
        result.push({
          type: 'normal',
          oldNum: oldIdx + 1,
          newNum: newIdx + 1,
          text: oldLine || '',
        });
        oldIdx++;
        newIdx++;
      } else {
        if (oldLine !== undefined) {
          result.push({
            type: 'del',
            oldNum: oldIdx + 1,
            text: oldLine,
          });
          oldIdx++;
        }
        if (newLine !== undefined) {
          result.push({
            type: 'add',
            newNum: newIdx + 1,
            text: newLine,
          });
          newIdx++;
        }
      }
    }

    return result;
  }, [activeDiff]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="diff-container w-full max-w-5xl h-[85vh] bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-950/40">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <span>代码修改差异对比 (Workspace Diff)</span>
                <span className="px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-[11px] font-normal text-neutral-600 dark:text-neutral-400">
                  {workspace.name} · v1 原始 ➔ v{workspace.currentVersion} 当前
                </span>
              </h2>
              <p className="text-[11px] text-neutral-500">
                共 {diffList.length} 个文件变动。所有修改均为纯文本代码变更，未执行任何本地代码或测试。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDownloadZip}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition cursor-pointer shadow-xs"
              title="重新打包并下载当前修改后的 ZIP 项目"
            >
              <Download className="w-3.5 h-3.5" />
              <span>下载修改后的 ZIP</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {diffList.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-neutral-400 space-y-2">
            <FileCode className="w-12 h-12 stroke-1 opacity-40 mb-1" />
            <p className="text-sm font-medium">当前工作区与原始版本完全一致</p>
            <p className="text-xs">暂无任何代码修改、新增或删除。</p>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Modified Files List */}
            <div className="w-64 border-r border-neutral-200 dark:border-neutral-800 flex flex-col bg-neutral-50/30 dark:bg-neutral-950/20 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800/60">
              <div className="p-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                变动文件 ({diffList.length})
              </div>
              {diffList.map(diff => {
                const isSelected = diff.path === activeDiff?.path;
                return (
                  <div
                    key={diff.path}
                    onClick={() => setSelectedPath(diff.path)}
                    className={`p-3 flex items-start gap-2 cursor-pointer text-xs transition ${
                      isSelected
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
                        : 'hover:bg-neutral-100/60 dark:hover:bg-neutral-800/40 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <span className="mt-0.5 shrink-0">
                      {diff.type === 'added' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-semibold">
                          新增
                        </span>
                      )}
                      {diff.type === 'deleted' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 font-semibold">
                          删除
                        </span>
                      )}
                      {diff.type === 'modified' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-semibold">
                          修改
                        </span>
                      )}
                    </span>
                    <span className="truncate font-mono text-[11px]" title={diff.path}>
                      {diff.path}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Right: Line Diff Viewer */}
            <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden font-mono text-xs">
              <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 text-[11px] text-neutral-400 flex items-center justify-between">
                <span className="font-semibold text-neutral-200">{activeDiff?.path}</span>
                <div className="flex items-center gap-2">
                  {onDiagnoseDiff && activeDiff && (
                    <button
                      type="button"
                      onClick={() => {
                        onDiagnoseDiff(activeDiff.path);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-medium transition cursor-pointer shadow-xs"
                      title="让 AI 针对本文件的代码修改进行系统性静态诊断"
                    >
                      <Activity className="w-3 h-3" />
                      <span>AI 诊断这个修改</span>
                    </button>
                  )}
                  <span className="text-[10px] uppercase text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded">
                    {activeDiff?.type === 'modified' ? '已对比原始基准' : activeDiff?.type}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-3 font-mono leading-relaxed select-text space-y-0.5">
                {lineDiffs.map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start px-2 py-0.5 rounded-xs transition-colors ${
                      item.type === 'add'
                        ? 'bg-emerald-950/50 text-emerald-300'
                        : item.type === 'del'
                        ? 'bg-red-950/50 text-red-300'
                        : 'text-neutral-400 hover:bg-neutral-900'
                    }`}
                  >
                    <span className="w-8 shrink-0 text-neutral-600 select-none text-[10px] text-right pr-2">
                      {item.type === 'add' ? `+` : item.type === 'del' ? `-` : item.newNum || item.oldNum}
                    </span>
                    <span className="w-4 shrink-0 select-none font-bold">
                      {item.type === 'add' ? '+' : item.type === 'del' ? '-' : ' '}
                    </span>
                    <span className="flex-1 whitespace-pre-wrap break-all">
                      {item.text || ' '}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
