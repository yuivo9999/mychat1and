import React, { useState, useRef, useEffect } from 'react';
import { 
  Menu, 
  Plus, 
  ChevronDown, 
  ExternalLink, 
  Download, 
  Trash2, 
  MoreVertical, 
  Check, 
  Key, 
  Settings, 
  Sparkles, 
  Activity, 
  AlertCircle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Copy,
  SlidersHorizontal,
  Server,
  Folder,
  Bot,
  Play
} from 'lucide-react';
import { Conversation, ModelItem, ProviderDefinition, ApiKeyConfig, ConnectionStatus } from '../types';

interface TopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNewChat: () => void;
  currentConversation: Conversation | null;
  models: ModelItem[];
  providers: ProviderDefinition[];
  apiKeys: ApiKeyConfig[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  selectedApiKeyId: string | undefined;
  onSelectApiKey: (keyId: string) => void;
  connectionStatus: ConnectionStatus;
  statusMessage?: string;
  onExportChat: () => void;
  onClearChat: () => void;
  onOpenSettings: (initialTab?: string) => void;
  onOpenModelConfig?: () => void;
  onRenameChat: (newTitle: string) => void;
  onCopyAllChat: () => void;
  onOpenParameters?: () => void;
  isReasoningEnabled?: boolean;
  projectName?: string;
  workspaceFilesCount?: number;
  workspaceName?: string;
  modifiedFilesCount?: number;
  onOpenWorkspace?: () => void;
  onOpenPreview?: () => void;
  agentMode?: boolean;
  onToggleAgentMode?: (enabled: boolean) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  sidebarOpen,
  onToggleSidebar,
  onNewChat,
  currentConversation,
  models,
  providers,
  apiKeys,
  selectedModelId,
  onSelectModel,
  selectedApiKeyId,
  onSelectApiKey,
  connectionStatus,
  statusMessage,
  onExportChat,
  onClearChat,
  onOpenSettings,
  onOpenModelConfig,
  onRenameChat,
  onCopyAllChat,
  onOpenParameters,
  isReasoningEnabled,
  projectName,
  workspaceFilesCount = 0,
  workspaceName,
  modifiedFilesCount = 0,
  onOpenWorkspace,
  onOpenPreview,
  agentMode = false,
  onToggleAgentMode,
}) => {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [keyDropdownOpen, setKeyDropdownOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [searchModelQuery, setSearchModelQuery] = useState('');

  const moreMenuRef = useRef<HTMLDivElement>(null);
  const keyDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    if (moreMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [moreMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (keyDropdownRef.current && !keyDropdownRef.current.contains(event.target as Node)) {
        setKeyDropdownOpen(false);
      }
    };
    if (keyDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [keyDropdownOpen]);

  const currentModel = models.find(m => m.id === selectedModelId) || models[0];
  const currentProvider = providers.find(p => p.id === currentModel?.providerId);
  const currentKey = apiKeys.find(k => k.id === selectedApiKeyId);

  // Filter models for dropdown
  const filteredModels = models.filter(m => {
    if (!searchModelQuery) return true;
    const q = searchModelQuery.toLowerCase();
    const p = providers.find(prov => prov.id === m.providerId);
    return (
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      (p && p.name.toLowerCase().includes(q))
    );
  });

  // Group models by provider strictly respecting provider order
  const modelsByProvider: Record<string, ModelItem[]> = {};
  for (const p of providers) {
    const pModels = filteredModels.filter(m => m.providerId === p.id);
    if (pModels.length > 0) {
      modelsByProvider[p.id] = pModels;
    }
  }
  for (const m of filteredModels) {
    if (!modelsByProvider[m.providerId]) {
      modelsByProvider[m.providerId] = [m];
    }
  }

  // Get keys for current provider
  const availableKeysForProvider = apiKeys.filter(
    k => k.providerId === currentModel?.providerId
  );

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'requesting':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium border border-blue-500/20">
            <Activity className="w-3.5 h-3.5 animate-pulse text-blue-500" />
            <span>请求中...</span>
          </div>
        );
      case 'configured':
      case 'success':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>已就绪</span>
          </div>
        );
      case 'error':
        return (
          <button
            onClick={() => onOpenSettings('keys')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium border border-red-500/20 transition"
            title={statusMessage || '请求出错'}
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
            <span>连接异常</span>
          </button>
        );
      case 'unconfigured':
      default:
        return (
          <button
            onClick={() => onOpenSettings('keys')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium border border-amber-500/20 transition cursor-pointer"
            title="点击配置 API Key"
          >
            <Key className="w-3.5 h-3.5 text-amber-500" />
            <span>未配置 Key</span>
          </button>
        );
    }
  };

  return (
    <header className="h-14 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md px-3 md:px-4 flex items-center justify-between shrink-0 z-20 select-none">
      {/* Left Area: Toggle & Title */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-2 rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          title={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
        >
          <Menu className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onNewChat}
          className="hidden sm:flex items-center gap-1 p-1.5 px-2.5 text-xs font-medium rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          title="创建新聊天"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新聊天</span>
        </button>

        {projectName && (
          <span 
            className="hidden sm:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium shrink-0 ml-1"
            title={`所属项目: ${projectName} (共享项目记忆)`}
          >
            <Folder className="w-3 h-3 text-amber-500" />
            <span className="max-w-[120px] truncate">{projectName}</span>
          </span>
        )}
      </div>

      {/* Center Spacer */}
      <div className="flex-1" />

      {/* Right Area: Key Switcher, Connection Status, Fast Actions & More */}
      <div className="flex items-center gap-2">
        {/* Status Badge */}
        <div className="hidden sm:block">
          {getStatusBadge()}
        </div>

        {/* Quick API Key switch if multiple keys */}
        {availableKeysForProvider.length > 1 && (
          <div className="relative hidden md:block" ref={keyDropdownRef}>
            <button
              onClick={() => {
                setKeyDropdownOpen(!keyDropdownOpen);
                setModelDropdownOpen(false);
                setMoreMenuOpen(false);
              }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              title="切换当前提供商的 API Key"
            >
              <Key className="w-3.5 h-3.5 text-neutral-400" />
              <span className="max-w-[80px] truncate">{currentKey?.label || '默认 Key'}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {keyDropdownOpen && (
              <div className="absolute right-0 top-8 w-48 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-800 py-1 z-40 text-xs">
                <div className="px-3 py-1 font-semibold text-[10px] text-neutral-400 uppercase">
                  切换 {currentProvider?.name} Key
                </div>
                {availableKeysForProvider.map(k => (
                  <button
                    key={k.id}
                    onClick={() => {
                      onSelectApiKey(k.id);
                      setKeyDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                      k.id === selectedApiKeyId ? 'text-indigo-600 font-medium' : 'text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <span className="truncate">{k.label}</span>
                    {k.id === selectedApiKeyId && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Agent Mode Switch Button */}
        {onToggleAgentMode && (
          <button
            type="button"
            onClick={() => onToggleAgentMode(!agentMode)}
            className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
              agentMode
                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 font-semibold'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700'
            }`}
            title={agentMode ? '当前为 Agent 自动化模式：AI 会自主调用工具读写工作区' : '点击开启 Agent 自动化模式'}
          >
            <Bot className={`w-3.5 h-3.5 ${agentMode ? 'text-purple-500' : 'text-neutral-400'}`} />
            <span>Agent 模式</span>
            <span className={`w-1.5 h-1.5 rounded-full ${agentMode ? 'bg-purple-500 animate-pulse' : 'bg-neutral-400'}`} />
          </button>
        )}

        {/* Workspace Web Preview Button (放置在“我的工作区”左侧) */}
        {onOpenPreview && (
          <button
            type="button"
            onClick={onOpenPreview}
            className="preview-area-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/80 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-medium transition cursor-pointer shadow-2xs active:scale-[0.98]"
            title="打开工作区网页实时预览区（直接运行查看静态网页/React项目）"
          >
            <Play className="w-3.5 h-3.5 fill-current text-emerald-600 dark:text-emerald-400" />
            <span>预览区</span>
          </button>
        )}

        {/* AI Workspace Button */}
        {onOpenWorkspace && (
          <button
            type="button"
            onClick={onOpenWorkspace}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/80 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-medium transition cursor-pointer shadow-2xs"
            title="打开工作区面板（管理文件、查看改动 Diff、打包下载 ZIP）"
          >
            <Folder className="w-3.5 h-3.5 text-indigo-500" />
            <span className="truncate max-w-[120px]">
              {workspaceName || '工作区'}
            </span>
            {workspaceFilesCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                {workspaceFilesCount}
              </span>
            )}
            {modifiedFilesCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-bold" title={`${modifiedFilesCount} 个文件已修改`}>
                {modifiedFilesCount}改
              </span>
            )}
          </button>
        )}

        {/* Open in new window button */}
        <button
          type="button"
          onClick={() => window.open(window.location.href, '_blank')}
          className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition hidden lg:block"
          title="在新窗口打开客户端"
        >
          <ExternalLink className="w-4 h-4" />
        </button>

        {/* Export chat button */}
        <button
          type="button"
          onClick={onExportChat}
          className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition hidden sm:block"
          title="导出当前聊天"
        >
          <Download className="w-4 h-4" />
        </button>

        {/* More actions menu */}
        <div className="relative" ref={moreMenuRef}>
          <button
            type="button"
            onClick={() => {
              setMoreMenuOpen(!moreMenuOpen);
              setModelDropdownOpen(false);
              setKeyDropdownOpen(false);
            }}
            className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
            title="更多功能"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {moreMenuOpen && (
            <div className="absolute right-0 top-10 w-40 bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border border-neutral-200 dark:border-neutral-800 py-1.5 z-40 text-xs">
              <button
                onClick={() => {
                  setMoreMenuOpen(false);
                  onExportChat();
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-300 transition-colors"
              >
                <Download className="w-4 h-4 text-neutral-400 shrink-0" />
                <span>导出对话</span>
              </button>
              <button
                onClick={() => {
                  setMoreMenuOpen(false);
                  onCopyAllChat();
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-300 transition-colors"
              >
                <Copy className="w-4 h-4 text-neutral-400 shrink-0" />
                <span>复制全文</span>
              </button>

              <div className="border-t border-neutral-100 dark:border-neutral-800 my-1" />

              <button
                onClick={() => {
                  setMoreMenuOpen(false);
                  onClearChat();
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center gap-2.5 transition-colors"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>清空对话</span>
              </button>

              <div className="border-t border-neutral-100 dark:border-neutral-800 my-1" />

              <button
                onClick={() => {
                  setMoreMenuOpen(false);
                  onOpenSettings('appearance');
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
              >
                <Settings className="w-4 h-4 text-neutral-400 shrink-0" />
                <span>系统设置</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
