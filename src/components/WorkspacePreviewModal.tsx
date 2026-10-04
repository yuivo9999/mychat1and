import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  RefreshCw, 
  ExternalLink, 
  Monitor, 
  Smartphone, 
  Tablet, 
  Terminal, 
  Folder, 
  ChevronDown, 
  Play, 
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Code
} from 'lucide-react';
import { Workspace } from '../types/workspace';
import { 
  generatePreviewHtml, 
  detectWorkspaceRunnableType, 
  scaffoldSampleReactProject 
} from '../services/workspacePreviewEngine';

interface WorkspacePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  initialWorkspaceId?: string;
  onSaveWorkspace?: (workspace: Workspace) => Promise<void>;
}

interface ConsoleLogItem {
  id: string;
  type: 'log' | 'warn' | 'error';
  message: string;
  time: string;
}

export const WorkspacePreviewModal: React.FC<WorkspacePreviewModalProps> = ({
  isOpen,
  onClose,
  workspaces,
  initialWorkspaceId,
  onSaveWorkspace,
}) => {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(
    initialWorkspaceId || workspaces[0]?.id || ''
  );
  const [viewportMode, setViewportMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [showConsole, setShowConsole] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Sync selected workspace if initialWorkspaceId changes
  useEffect(() => {
    if (initialWorkspaceId) {
      setSelectedWorkspaceId(initialWorkspaceId);
    } else if (workspaces.length > 0 && !selectedWorkspaceId) {
      setSelectedWorkspaceId(workspaces[0].id);
    }
  }, [initialWorkspaceId, workspaces]);

  const activeWorkspace = useMemo(() => {
    return workspaces.find(w => w.id === selectedWorkspaceId) || workspaces[0] || null;
  }, [workspaces, selectedWorkspaceId]);

  const runnableInfo = useMemo(() => {
    return detectWorkspaceRunnableType(activeWorkspace);
  }, [activeWorkspace]);

  // Generate preview HTML
  const previewHtml = useMemo(() => {
    return generatePreviewHtml(activeWorkspace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace, refreshKey]);

  // Listen to console messages from preview iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.source === 'workspace-preview-console') {
        const item: ConsoleLogItem = {
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: event.data.type || 'log',
          message: event.data.message || '',
          time: event.data.time || new Date().toLocaleTimeString(),
        };
        setConsoleLogs(prev => [item, ...prev].slice(0, 80));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Handle refresh
  const handleRefresh = () => {
    setConsoleLogs([]);
    setRefreshKey(prev => prev + 1);
  };

  // Handle open in new browser tab via Blob URL
  const handleOpenInNewTab = () => {
    try {
      const blob = new Blob([previewHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      alert('无法打开新窗口，请检查浏览器弹窗拦截设置');
    }
  };

  // One-click scaffold sample React project
  const handleScaffoldSample = async () => {
    if (!activeWorkspace) return;
    const updated = scaffoldSampleReactProject(activeWorkspace);
    if (onSaveWorkspace) {
      await onSaveWorkspace(updated);
    }
    setRefreshKey(prev => prev + 1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 select-none animate-in fade-in duration-200">
      <div 
        className="w-full max-w-6xl h-[92vh] max-h-[900px] bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Control Bar */}
        <div className="px-3 sm:px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* Left: Title & Workspace Switcher */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1.5 font-bold text-sm text-neutral-900 dark:text-neutral-100 shrink-0">
              <span className="w-6 h-6 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-2xs">
                <Play className="w-3 h-3 fill-current ml-0.5" />
              </span>
              <span>项目预览区</span>
            </div>

            <div className="h-4 w-[1px] bg-neutral-200 dark:bg-neutral-700 hidden sm:block" />

            {/* Workspace Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 shadow-2xs transition"
                title="切换当前预览的工作区"
              >
                <Folder className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="truncate max-w-[120px] sm:max-w-[180px]">
                  {activeWorkspace?.name || '请选择工作区'}
                </span>
                <ChevronDown className="w-3 h-3 text-neutral-400 shrink-0" />
              </button>

              {isWorkspaceMenuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-30" 
                    onClick={() => setIsWorkspaceMenuOpen(false)} 
                  />
                  <div className="absolute left-0 top-8 w-56 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 py-1 z-40 text-xs max-h-60 overflow-y-auto">
                    <div className="px-3 py-1 font-semibold text-[10px] text-neutral-400 uppercase tracking-wider">
                      选择要预览的工作区
                    </div>
                    {workspaces.map(ws => (
                      <button
                        key={ws.id}
                        type="button"
                        onClick={() => {
                          setSelectedWorkspaceId(ws.id);
                          setIsWorkspaceMenuOpen(false);
                          setRefreshKey(prev => prev + 1);
                        }}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-700/60 transition ${
                          ws.id === selectedWorkspaceId 
                            ? 'text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50/50 dark:bg-indigo-950/30' 
                            : 'text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        <span className="truncate">{ws.name}</span>
                        <span className="text-[10px] text-neutral-400 font-mono ml-2 shrink-0">
                          {Object.keys(ws.files).length} 文件
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Entry point badge */}
            {runnableInfo.hasRunnableEntry ? (
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-medium">
                <CheckCircle2 className="w-3 h-3" />
                <span>入口: {runnableInfo.entryPath}</span>
              </span>
            ) : (
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-medium">
                <AlertTriangle className="w-3 h-3" />
                <span>无标准网页入口</span>
              </span>
            )}
          </div>

          {/* Center: Device Viewport Switcher */}
          <div className="flex items-center gap-1 bg-neutral-200/60 dark:bg-neutral-800 p-0.5 rounded-xl text-neutral-600 dark:text-neutral-400">
            <button
              type="button"
              onClick={() => setViewportMode('desktop')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition ${
                viewportMode === 'desktop' 
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-2xs' 
                  : 'hover:text-neutral-900 dark:hover:text-white'
              }`}
              title="桌面全宽端 (100% 宽度)"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">电脑端</span>
            </button>
            <button
              type="button"
              onClick={() => setViewportMode('tablet')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition ${
                viewportMode === 'tablet' 
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-2xs' 
                  : 'hover:text-neutral-900 dark:hover:text-white'
              }`}
              title="平板端 (768px 宽度)"
            >
              <Tablet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">平板</span>
            </button>
            <button
              type="button"
              onClick={() => setViewportMode('mobile')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition ${
                viewportMode === 'mobile' 
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-2xs' 
                  : 'hover:text-neutral-900 dark:hover:text-white'
              }`}
              title="手机端 (375px 宽度)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">手机端</span>
            </button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5">
            {!runnableInfo.hasRunnableEntry && (
              <button
                type="button"
                onClick={handleScaffoldSample}
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 dark:text-indigo-300 text-xs font-medium border border-indigo-200 dark:border-indigo-800 transition"
                title="一键植入标准的 React 示例项目用于测试"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>植入 React 示例模版</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleRefresh}
              className="p-1.5 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-neutral-800 rounded-xl transition"
              title="刷新重新渲染"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="p-1.5 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-neutral-800 rounded-xl transition"
              title="在新标签页独立打开运行"
            >
              <ExternalLink className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowConsole(!showConsole)}
              className={`p-1.5 rounded-xl transition relative ${
                showConsole 
                  ? 'bg-neutral-800 text-white dark:bg-neutral-700' 
                  : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800'
              }`}
              title="查看网页运行控制台"
            >
              <Terminal className="w-4 h-4" />
              {consoleLogs.some(l => l.type === 'error') && (
                <span className="w-2 h-2 rounded-full bg-red-500 absolute top-1 right-1" />
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 rounded-xl transition ml-1"
              title="关闭预览"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Viewport Container */}
        <div className="flex-1 bg-neutral-100 dark:bg-neutral-950/60 flex items-center justify-center p-2 sm:p-4 overflow-hidden relative">
          <div 
            className={`h-full transition-all duration-300 bg-white rounded-xl shadow-lg border border-neutral-300/80 dark:border-neutral-800 overflow-hidden flex flex-col ${
              viewportMode === 'desktop' 
                ? 'w-full' 
                : viewportMode === 'tablet' 
                  ? 'w-[768px] max-w-full' 
                  : 'w-[375px] max-w-full'
            }`}
          >
            {/* Viewport Frame Header (Simulated browser URL bar) */}
            <div className="h-7 bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-3 flex items-center gap-2 shrink-0 select-none">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
              </div>
              <div className="flex-1 mx-2 bg-white dark:bg-neutral-800/80 rounded-md px-2 py-0.5 text-[10px] text-neutral-400 truncate font-mono text-center border border-neutral-200/60 dark:border-neutral-700/60">
                localhost:3000 / {activeWorkspace?.name || 'workspace'} / {runnableInfo.entryPath || 'preview'}
              </div>
            </div>

            {/* Sandboxed Iframe Runner */}
            <div className="flex-1 relative bg-white overflow-hidden">
              <iframe
                ref={iframeRef}
                key={`${selectedWorkspaceId}_${refreshKey}`}
                srcDoc={previewHtml}
                title="Workspace Preview"
                sandbox="allow-scripts allow-modals allow-forms allow-same-origin allow-popups"
                className="w-full h-full border-0 bg-white"
              />
            </div>
          </div>
        </div>

        {/* Collapsible Console Logs Drawer */}
        {showConsole && (
          <div className="h-44 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-900 text-neutral-200 font-mono text-xs flex flex-col shrink-0">
            <div className="px-3 py-1.5 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-neutral-400" />
                <span className="font-semibold text-neutral-300">浏览器运行控制台 (Console)</span>
                <span className="text-[10px] text-neutral-500">
                  ({consoleLogs.length} 条记录)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConsoleLogs([])}
                  className="text-[10px] text-neutral-400 hover:text-white transition"
                >
                  清空日志
                </button>
                <button
                  type="button"
                  onClick={() => setShowConsole(false)}
                  className="text-neutral-400 hover:text-white transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-2 overflow-y-auto space-y-1 select-text">
              {consoleLogs.length === 0 ? (
                <div className="text-neutral-500 text-[11px] p-2 italic">
                  暂无控制台日志输出。网页中的 console.log 与运行时报错将实时显示在此处。
                </div>
              ) : (
                consoleLogs.map(log => (
                  <div 
                    key={log.id} 
                    className={`px-2 py-0.5 rounded text-[11px] flex items-start gap-2 ${
                      log.type === 'error' 
                        ? 'bg-red-950/40 text-red-300 border-l-2 border-red-500' 
                        : log.type === 'warn' 
                          ? 'bg-amber-950/40 text-amber-300 border-l-2 border-amber-500' 
                          : 'text-neutral-300 hover:bg-neutral-800/40'
                    }`}
                  >
                    <span className="text-neutral-500 shrink-0 text-[10px]">{log.time}</span>
                    <span className="break-all whitespace-pre-wrap flex-1">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
