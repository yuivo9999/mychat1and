import React, { useState } from 'react';
import { 
  Wrench, 
  ChevronDown, 
  ChevronRight, 
  FileCode, 
  Download, 
  CheckCircle2, 
  AlertCircle,
  FileCheck,
  BrainCircuit,
  Search,
  Globe
} from 'lucide-react';
import { ToolCallExecution } from '../types';

interface AgentToolCallsViewerProps {
  toolCalls?: ToolCallExecution[];
  modifiedFiles?: string[];
  onDownloadWorkspaceZip?: () => void;
}

export const AgentToolCallsViewer: React.FC<AgentToolCallsViewerProps> = ({
  toolCalls = [],
  modifiedFiles = [],
  onDownloadWorkspaceZip,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeDiffPath, setActiveDiffPath] = useState<string | null>(null);

  if (!toolCalls || toolCalls.length === 0) return null;

  const successfulCalls = toolCalls.filter(c => c.status === 'success');
  const errorCalls = toolCalls.filter(c => c.status === 'error');
  const filesModified = modifiedFiles.length > 0 ? modifiedFiles : Array.from(
    new Set(
      toolCalls
        .filter(c => c.diff?.path)
        .map(c => c.diff!.path)
    )
  );

  const getToolIcon = (toolName: string) => {
    switch (toolName) {
      case 'read_file':
      case 'list_files':
        return <FileCode className="w-3.5 h-3.5 text-blue-500" />;
      case 'write_file':
      case 'edit_file':
        return <FileCheck className="w-3.5 h-3.5 text-emerald-500" />;
      case 'search_files':
        return <Search className="w-3.5 h-3.5 text-amber-500" />;
      case 'update_memory':
        return <BrainCircuit className="w-3.5 h-3.5 text-purple-500" />;
      case 'web_search':
        return <Globe className="w-3.5 h-3.5 text-orange-500" />;
      default:
        return <Wrench className="w-3.5 h-3.5 text-neutral-500" />;
    }
  };

  return (
    <div className="my-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/60 overflow-hidden text-xs">
      {/* Header bar */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-neutral-100/70 dark:hover:bg-neutral-800/60 transition select-none"
      >
        <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300 font-medium">
          <div className="p-1 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
            <Wrench className="w-3.5 h-3.5" />
          </div>
          <span>Agent 执行了 {toolCalls.length} 个工具操作</span>
          {filesModified.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-[10px] font-normal">
              已修改 {filesModified.length} 个文件
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-neutral-400">
          {errorCalls.length > 0 && (
            <span className="flex items-center gap-1 text-red-500 text-[11px]">
              <AlertCircle className="w-3 h-3" />
              {errorCalls.length} 处异常
            </span>
          )}
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </div>

      {/* Expanded Tools Log */}
      {isOpen && (
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2.5 animate-in fade-in">
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {toolCalls.map((call, idx) => (
              <div 
                key={call.id || idx}
                className="p-2 rounded-lg bg-white dark:bg-neutral-800/90 border border-neutral-200/80 dark:border-neutral-700/60 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-800 dark:text-neutral-200">
                    {getToolIcon(call.toolName)}
                    <span className="font-semibold">{call.toolName}</span>
                    <span className="text-neutral-400 truncate max-w-[280px]">
                      {JSON.stringify(call.args)}
                    </span>
                  </div>
                  <div>
                    {call.status === 'success' ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    ) : call.status === 'error' ? (
                      <AlertCircle className="w-3 h-3 text-red-500" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                    )}
                  </div>
                </div>

                {call.errorMessage && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 font-mono">
                    {call.errorMessage}
                  </p>
                )}

                {call.diff && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveDiffPath(activeDiffPath === call.diff!.path ? null : call.diff!.path)}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <FileCheck className="w-3 h-3" />
                      {activeDiffPath === call.diff.path ? '收起改动预览' : `查看代码差异 (${call.diff.path})`}
                    </button>

                    {activeDiffPath === call.diff.path && (
                      <div className="mt-1.5 p-2 rounded bg-neutral-900 text-neutral-200 font-mono text-[10px] overflow-x-auto max-h-48 border border-neutral-700">
                        {call.diff.oldContent && (
                          <div className="text-red-400 line-through opacity-80 whitespace-pre">
                            - {call.diff.oldContent.slice(0, 300)}
                            {call.diff.oldContent.length > 300 ? '...' : ''}
                          </div>
                        )}
                        {call.diff.newContent && (
                          <div className="text-emerald-400 whitespace-pre">
                            + {call.diff.newContent.slice(0, 400)}
                            {call.diff.newContent.length > 400 ? '...' : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Quick Download Zip Action */}
          {onDownloadWorkspaceZip && filesModified.length > 0 && (
            <div className="pt-1 flex items-center justify-between border-t border-neutral-200 dark:border-neutral-800">
              <span className="text-[11px] text-neutral-500">
                已生成最新代码变更，可立即重新打包
              </span>
              <button
                type="button"
                onClick={onDownloadWorkspaceZip}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs transition shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>重新打包下载项目 (.zip)</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
