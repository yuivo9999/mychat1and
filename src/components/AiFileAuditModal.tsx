import React, { useState, useMemo } from 'react';
import { 
  X, 
  History, 
  Search, 
  Download, 
  Trash2, 
  FileCode, 
  Bot, 
  Calendar, 
  Clock, 
  Check, 
  Copy, 
  FolderGit2, 
  Sparkles,
  Layers,
  MessageSquare
} from 'lucide-react';
import { 
  AiFileAuditRecord, 
  getAiFileAuditRecords, 
  clearAiFileAuditRecords, 
  deleteAiFileAuditRecord, 
  exportAuditRecordsToJson 
} from '../services/aiFileAuditService';

interface AiFileAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFileInWorkspace?: (filePath: string) => void;
}

export const AiFileAuditModal: React.FC<AiFileAuditModalProps> = ({
  isOpen,
  onClose,
  onOpenFileInWorkspace,
}) => {
  const [records, setRecords] = useState<AiFileAuditRecord[]>(() => getAiFileAuditRecords());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Refresh records on open
  React.useEffect(() => {
    if (isOpen) {
      setRecords(getAiFileAuditRecords());
      setShowClearConfirm(false);
    }
  }, [isOpen]);

  // Unique models list for filter dropdown
  const modelList = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.modelName) set.add(r.modelName);
      else if (r.modelId) set.add(r.modelId);
    });
    return Array.from(set).sort();
  }, [records]);

  // Unique files count
  const uniqueFilesCount = useMemo(() => {
    return new Set(records.map(r => r.filePath)).size;
  }, [records]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        r.filePath.toLowerCase().includes(q) ||
        (r.modelName && r.modelName.toLowerCase().includes(q)) ||
        (r.modelId && r.modelId.toLowerCase().includes(q)) ||
        (r.conversationTitle && r.conversationTitle.toLowerCase().includes(q)) ||
        (r.workspaceName && r.workspaceName.toLowerCase().includes(q));

      const matchModel = selectedModel === 'all' || 
        r.modelName === selectedModel || 
        r.modelId === selectedModel;

      return matchSearch && matchModel;
    });
  }, [records, searchQuery, selectedModel]);

  const handleCopyPath = (id: string, path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDeleteItem = (id: string) => {
    const updated = deleteAiFileAuditRecord(id);
    setRecords(updated);
  };

  const handleClearAll = () => {
    clearAiFileAuditRecords();
    setRecords([]);
    setShowClearConfirm(false);
  };

  const handleExportJson = () => {
    const data = exportAuditRecordsToJson();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workspace_ai_file_audit_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  };

  const getRelativeTime = (ts: number) => {
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;
    return '较早前';
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in"
      onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl h-[720px] max-h-[92vh] bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 flex flex-col overflow-hidden animate-in zoom-in-95"
      >
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-50/70 dark:bg-neutral-850/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 shadow-2xs">
              <History className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                  工作区 AI 文件修改记录
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                  最多保存 1000 条
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                记录工作区内由各 AI 模型执行的精准修改与文件变动（附具体模型名称与时间戳）
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition cursor-pointer"
            title="关闭窗口"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-900/30 shrink-0 text-xs">
          <div className="p-2.5 rounded-xl border border-neutral-200/70 dark:border-neutral-800 bg-white dark:bg-neutral-850 flex items-center gap-2.5 shadow-2xs">
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <FolderGit2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-neutral-400">总修改记录</div>
              <div className="font-bold text-neutral-900 dark:text-neutral-100">
                {records.length} <span className="font-normal text-[10px] text-neutral-400">/ 1000 条</span>
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-xl border border-neutral-200/70 dark:border-neutral-800 bg-white dark:bg-neutral-850 flex items-center gap-2.5 shadow-2xs">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <FileCode className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-neutral-400">涉及文件数</div>
              <div className="font-bold text-neutral-900 dark:text-neutral-100">
                {uniqueFilesCount} <span className="font-normal text-[10px] text-neutral-400">个文件</span>
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-xl border border-neutral-200/70 dark:border-neutral-800 bg-white dark:bg-neutral-850 flex items-center gap-2.5 shadow-2xs">
            <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-neutral-400">参与 AI 模型</div>
              <div className="font-bold text-neutral-900 dark:text-neutral-100">
                {modelList.length} <span className="font-normal text-[10px] text-neutral-400">个模型</span>
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-xl border border-neutral-200/70 dark:border-neutral-800 bg-white dark:bg-neutral-850 flex items-center gap-2.5 shadow-2xs">
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-neutral-400">最新修改</div>
              <div className="font-bold text-neutral-900 dark:text-neutral-100">
                {records.length > 0 ? getRelativeTime(records[0].timestamp) : '暂无'}
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar: Search, Filters, Actions */}
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-white dark:bg-neutral-900">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索文件路径、模型或会话..."
                className="w-full pl-8 pr-7 py-1.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700/80 rounded-xl text-xs text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Model Filter */}
            {modelList.length > 0 && (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="px-2.5 py-1.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700/80 rounded-xl text-xs text-neutral-700 dark:text-neutral-300 outline-none cursor-pointer"
              >
                <option value="all">全部模型 ({records.length})</option>
                {modelList.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {records.length > 0 && (
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs font-medium transition cursor-pointer shadow-2xs"
                title="导出修改记录为 JSON 文件"
              >
                <Download className="w-3.5 h-3.5 text-neutral-500" />
                <span>导出 JSON</span>
              </button>
            )}

            {records.length > 0 && (
              <>
                {showClearConfirm ? (
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="px-2.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition cursor-pointer"
                    >
                      确认清空
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(false)}
                      className="px-2 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-500 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 text-xs font-medium transition cursor-pointer"
                    title="清空所有修改记录"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>清空</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Record List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredRecords.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-neutral-400">
              <History className="w-12 h-12 stroke-[1.2] text-neutral-300 dark:text-neutral-700 mb-3" />
              <p className="font-medium text-sm text-neutral-600 dark:text-neutral-300">
                {searchQuery || selectedModel !== 'all' ? '未找到符合条件的修改记录' : '暂无 AI 文件修改记录'}
              </p>
              <p className="text-xs text-neutral-400 max-w-md mt-1 leading-relaxed">
                当您启用 Agent 模式或在对话中让 AI 分析和修改工作区文件时，被修改文件的具体路径、负责修改的模型与精确时间戳将自动汇总留存并展示在此处（最多保存 1000 条）。
              </p>
            </div>
          ) : (
            filteredRecords.map((r, index) => {
              const isCopied = copiedId === r.id;
              return (
                <div
                  key={r.id || `${r.filePath}_${r.timestamp}_${index}`}
                  className="group p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-850 hover:border-indigo-300 dark:hover:border-indigo-800 transition shadow-2xs flex flex-col gap-2"
                >
                  {/* Top Line: Action badge, file path, timestamp */}
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      {/* Action Badge */}
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide shrink-0 ${
                        r.actionType === 'create'
                          ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300/40'
                          : r.actionType === 'delete'
                          ? 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-300/40'
                          : 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-300/40'
                      }`}>
                        {r.actionType === 'create' ? '新建文件' : r.actionType === 'delete' ? '删除文件' : '修改代码'}
                      </span>

                      {/* File Path: Horizontally scrollable by touch/mouse so users can see full path without truncation */}
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto overscroll-x-contain py-0.5 select-text touch-pan-x scrollbar-none">
                        <FileCode className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span 
                          onClick={() => onOpenFileInWorkspace?.(r.filePath)}
                          className="font-mono text-xs font-semibold text-neutral-800 dark:text-neutral-100 whitespace-nowrap hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                          title={`点击在工作区中打开: ${r.filePath}`}
                        >
                          {r.filePath}
                        </span>
                      </div>
                    </div>

                    {/* Timestamp & Relative Time */}
                    <div className="flex items-center gap-2 shrink-0 text-neutral-400 text-xs font-mono ml-1">
                      <span className="hidden sm:inline text-[11px] text-neutral-500 dark:text-neutral-400">
                        {formatTimestamp(r.timestamp)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-[10px] text-neutral-500 font-sans whitespace-nowrap">
                        {getRelativeTime(r.timestamp)}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Line: Model Badge, Workspace, Conversation */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-100 dark:border-neutral-800/60 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* AI Model Badge */}
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950/50 border border-purple-200/60 dark:border-purple-800/60 text-purple-700 dark:text-purple-300 font-medium text-[11px]">
                        <Sparkles className="w-3 h-3 text-purple-500" />
                        <span>{r.modelName || r.modelId}</span>
                      </div>

                      {/* Workspace Name */}
                      {r.workspaceName && (
                        <div className="inline-flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                          <Layers className="w-3 h-3 text-neutral-400" />
                          <span className="truncate max-w-[140px]">{r.workspaceName}</span>
                        </div>
                      )}

                      {/* Conversation Title */}
                      {r.conversationTitle && (
                        <div className="inline-flex items-center gap-1 text-[11px] text-neutral-400">
                          <MessageSquare className="w-3 h-3 text-neutral-400" />
                          <span className="truncate max-w-[180px]">{r.conversationTitle}</span>
                        </div>
                      )}
                    </div>

                    {/* Row Action Buttons */}
                    <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleCopyPath(r.id, r.filePath)}
                        className="inline-flex items-center gap-1 p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition text-[11px] cursor-pointer"
                        title="复制文件路径"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span className="text-[10px]">复制路径</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteItem(r.id)}
                        className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition cursor-pointer"
                        title="删除此条记录"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
