import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  ArrowUp, 
  Square, 
  Paperclip, 
  Image as ImageIcon, 
  FileText, 
  X, 
  Key, 
  Sparkles, 
  SlidersHorizontal,
  FileCode,
  AlertCircle,
  Server,
  Globe,
  ChevronDown,
  Check,
  Bot,
  RefreshCw,
  Plus,
  Minus,
  Trash2,
  SquarePen,
  MonitorPlay,
  History,
  Folder,
  FolderPlus,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { Attachment, ModelItem, ProviderDefinition, ApiKeyConfig, UserSettings, ModelParameters, Project } from '../types';
import { parseFileToAttachment, formatFileSize } from '../services/fileParser';
import { isModelWebSearchSupported, isModelVisionCapable } from '../services/modelUtils';

interface ChatComposerProps {
  onSendMessage: (content: string, attachments: Attachment[]) => void;
  isGenerating: boolean;
  onStopGeneration: () => void;
  currentModel: ModelItem | undefined;
  currentApiKey: ApiKeyConfig | undefined;
  models?: ModelItem[];
  providers?: ProviderDefinition[];
  apiKeys?: ApiKeyConfig[];
  selectedModelId?: string;
  onSelectModel?: (modelId: string) => void;
  settings: UserSettings;
  onOpenSettings: (tab?: string) => void;
  onOpenModelConfig?: () => void;
  onNewChat?: () => void;
  projects?: Project[];
  onNewChatInProject?: (projectId: string) => void;
  onCreateProject?: () => void;
  onOpenPreview?: () => void;
  onOpenAuditHistory?: () => void;
  quotedText?: string | null;
  onClearQuote?: () => void;
  parameters: ModelParameters;
  onUpdateParameters: (params: ModelParameters) => void;
  onOpenParameters?: () => void;
  webAccessEnabled?: boolean;
  onToggleWebAccess?: (enabled: boolean) => void;
  agentMode?: boolean;
  onToggleAgentMode?: (enabled: boolean) => void;
  pendingAttachments?: Attachment[] | null;
  onClearPendingAttachments?: () => void;
  pendingPrompt?: string | null;
  onClearPendingPrompt?: () => void;
  onSaveSettings?: (settings: UserSettings) => void;
  onDeleteModel?: (id: string) => void;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  onSendMessage,
  isGenerating,
  onStopGeneration,
  currentModel,
  currentApiKey,
  models = [],
  providers = [],
  apiKeys = [],
  selectedModelId,
  onSelectModel,
  onDeleteModel,
  settings,
  onSaveSettings,
  onOpenSettings,
  onOpenModelConfig,
  onNewChat,
  projects = [],
  onNewChatInProject,
  onCreateProject,
  onOpenPreview,
  onOpenAuditHistory,
  quotedText,
  onClearQuote,
  parameters,
  onUpdateParameters,
  onOpenParameters,
  webAccessEnabled = false,
  onToggleWebAccess,
  agentMode = false,
  onToggleAgentMode,
  pendingAttachments,
  onClearPendingAttachments,
  pendingPrompt,
  onClearPendingPrompt,
}) => {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [searchModelQuery, setSearchModelQuery] = useState('');
  const [modelToDelete, setModelToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const isComposingRef = useRef(false);

  // New Chat Popover Menu States (全新窗口 / 项目归档)
  const [isNewChatMenuOpen, setIsNewChatMenuOpen] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const newChatMenuRef = useRef<HTMLDivElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Safely dismiss virtual keyboard without causing jitter
  const dismissKeyboard = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.blur();
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  // Prevent virtual keyboard scroll offset sticky bug on mobile (iOS/Android Safari/Firefox/Chrome)
  useEffect(() => {
    const handleWindowScrollReset = () => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('scroll', handleWindowScrollReset, { passive: true });
    return () => window.removeEventListener('scroll', handleWindowScrollReset);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (newChatMenuRef.current && !newChatMenuRef.current.contains(event.target as Node)) {
        setIsNewChatMenuOpen(false);
        setShowProjectPicker(false);
      }
    }
    if (isNewChatMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNewChatMenuOpen]);

  // Sync external pendingPrompt and pendingAttachments
  useEffect(() => {
    if (pendingPrompt) {
      setContent(pendingPrompt);
      onClearPendingPrompt?.();
    }
  }, [pendingPrompt, onClearPendingPrompt]);

  useEffect(() => {
    if (pendingAttachments && pendingAttachments.length > 0) {
      setAttachments(prev => [...prev, ...pendingAttachments]);
      onClearPendingAttachments?.();
    }
  }, [pendingAttachments, onClearPendingAttachments]);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 100), 360);
    textarea.style.height = `${nextHeight}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [content, adjustTextareaHeight]);

  // Handle quoted text insertion
  useEffect(() => {
    if (quotedText) {
      setContent(prev => {
        const quotePrefix = quotedText.split('\n').map(l => `> ${l}`).join('\n');
        return prev ? `${prev}\n\n${quotePrefix}\n\n` : `${quotePrefix}\n\n`;
      });
      onClearQuote?.();
      textareaRef.current?.focus();
    }
  }, [quotedText, onClearQuote]);

  // Handle file uploads
  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setIsProcessingFiles(true);
    try {
      const parsed: Attachment[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        const att = await parseFileToAttachment(f);
        parsed.push(att);
      }
      setAttachments(prev => [...prev, ...parsed]);
    } catch (err) {
      console.error('File parsing error:', err);
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  // Clipboard paste (image & text files)
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const filesToProcess: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) filesToProcess.push(file);
      }
    }

    if (filesToProcess.length > 0) {
      e.preventDefault();
      setIsProcessingFiles(true);
      const parsed: Attachment[] = [];
      for (const f of filesToProcess) {
        const att = await parseFileToAttachment(f);
        parsed.push(att);
      }
      setAttachments(prev => [...prev, ...parsed]);
      setIsProcessingFiles(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFiles(e.dataTransfer.files);
    }
  };

  // Send action
  const handleSend = () => {
    if (isGenerating) {
      onStopGeneration();
      return;
    }

    if (isProcessingFiles) {
      alert('正在解析上传的文件，请稍候...');
      return;
    }

    const trimmed = content.trim();
    if (!trimmed && attachments.length === 0) return;

    // Check API Key (Exclude local Ollama since it doesn't use keys)
    const isOllama = currentModel?.providerId === 'ollama';
    if (!isOllama && (!currentApiKey || !currentApiKey.apiKey?.trim())) {
      alert('未检测到有效的 API Key！请点击底部或右上角设置并填入对应模型的 API Key。');
      onOpenSettings('keys');
      return;
    }

    onSendMessage(trimmed, attachments);
    setContent('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = '100px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 1. Prevent sending if Chinese/Japanese/Korean input IME is active and composing
    if (isComposingRef.current || e.nativeEvent.isComposing) return;

    if (e.key === 'Escape') {
      if (isNewChatMenuOpen) {
        setIsNewChatMenuOpen(false);
        setShowProjectPicker(false);
      } else {
        dismissKeyboard();
      }
      return;
    }

    if (settings.enterToSend) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    } else {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  const hasApiKey = !!currentApiKey?.apiKey?.trim() || currentModel?.providerId === 'ollama';
  const canSend = (content.trim().length > 0 || attachments.length > 0) && !isGenerating && !isProcessingFiles;

  const currentFontSize = settings.chatFontSizePx ?? 15;

  const handleIncreaseFontSize = () => {
    const nextSize = Math.min(32, currentFontSize + 1);
    if (onSaveSettings) {
      onSaveSettings({ ...settings, chatFontSizePx: nextSize });
    }
  };

  const handleDecreaseFontSize = () => {
    const nextSize = Math.max(10, currentFontSize - 1);
    if (onSaveSettings) {
      onSaveSettings({ ...settings, chatFontSizePx: nextSize });
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-3 md:px-6 pt-1 pb-[calc(0.35rem+env(safe-area-inset-bottom,0px))] sm:pb-2 md:pb-2 shrink-0 relative select-none">
      {/* Soft Ink Wave Pattern shifted up by another half text height (~8px) (淡墨色波浪纹/山水涟漪) */}
      <div className="ink-wave-layer absolute inset-x-0 -top-5 sm:-top-4 md:-top-3 h-14 sm:h-16 md:h-18 pointer-events-none overflow-hidden z-10 opacity-90 dark:opacity-40 transition-opacity">
        <svg
          className="w-full h-full text-neutral-600 dark:text-neutral-400"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Layer 1: Back soft ink wave */}
          <path
            d="M0 62 C 200 22, 400 78, 600 42 C 800 8, 1000 58, 1200 28 L1200 120 L0 120 Z"
            fill="currentColor"
            fillOpacity="0.08"
          />
          {/* Layer 2: Middle soft ink wave */}
          <path
            d="M0 80 C 180 46, 380 92, 580 56 C 780 22, 980 70, 1200 46 L1200 120 L0 120 Z"
            fill="currentColor"
            fillOpacity="0.10"
          />
          {/* Layer 3: Front soft ink wave */}
          <path
            d="M0 96 C 220 66, 440 106, 660 74 C 880 44, 1060 88, 1200 66 L1200 120 L0 120 Z"
            fill="currentColor"
            fillOpacity="0.14"
          />
        </svg>
      </div>

      {/* Top row: Font Size adjustment buttons on left, Model Name display on right */}
      <div className={`flex items-center justify-between px-1 mb-1.5 min-h-[26px] relative ${modelDropdownOpen ? 'z-40' : 'z-10'}`}>
        {/* Left: Font size adjuster buttons with circular ○ backgrounds */}
        <div className="flex items-center gap-1.5 select-none">
          <button
            type="button"
            onClick={() => {
              dismissKeyboard();
              handleIncreaseFontSize();
            }}
            className="w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-full flex items-center justify-center bg-white/90 dark:bg-neutral-900/90 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs transition active:scale-90 cursor-pointer"
            title={`增大聊天字体 (+1px, 当前: ${currentFontSize}px)`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              dismissKeyboard();
              handleDecreaseFontSize();
            }}
            className="w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-full flex items-center justify-center bg-white/90 dark:bg-neutral-900/90 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs transition active:scale-90 cursor-pointer"
            title={`减小聊天字体 (-1px, 当前: ${currentFontSize}px)`}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right-aligned model pill button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              dismissKeyboard();
              setModelDropdownOpen(!modelDropdownOpen);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:py-1 rounded-full bg-white/90 dark:bg-neutral-900/90 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200/80 dark:border-neutral-800 text-xs font-mono font-medium transition cursor-pointer shadow-2xs max-w-[280px] sm:max-w-[360px]"
            title="点击切换 AI 模型或配置服务商"
          >
            <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
            <span className="truncate leading-none text-xs font-mono">
              {currentModel?.id || '选择模型'}
            </span>
            <ChevronDown className={`w-3 h-3 text-neutral-400 shrink-0 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Model Dropdown Popup */}
          {modelDropdownOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setModelDropdownOpen(false)} />
              <div className="absolute right-0 bottom-full mb-2 w-72 sm:w-80 max-h-[380px] overflow-hidden flex flex-col bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 z-40 animate-in fade-in zoom-in-95 duration-150">
                {/* Dropdown search & header */}
                <div className="p-2.5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-2">
                  <input
                    type="text"
                    placeholder="搜索模型或服务商..."
                    value={searchModelQuery}
                    onChange={(e) => setSearchModelQuery(e.target.value)}
                    className="flex-1 text-xs bg-neutral-100 dark:bg-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 outline-hidden font-sans"
                  />
                  {onOpenModelConfig && (
                    <button
                      type="button"
                      onClick={() => {
                        setModelDropdownOpen(false);
                        onOpenModelConfig();
                      }}
                      className="px-2 py-1 text-[11px] rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-medium transition shrink-0 cursor-pointer"
                    >
                      配置
                    </button>
                  )}
                </div>

                {/* Models list */}
                <div className="overflow-y-auto p-1.5 flex-1 divide-y divide-neutral-100 dark:divide-neutral-800/60 font-sans">
                  {models.length === 0 ? (
                    <div className="p-4 text-center text-xs text-neutral-400">暂无可用模型</div>
                  ) : (
                    models
                      .filter(m => {
                        // Ensure the model belongs to an active, registered provider group
                        const providerExists = providers.some(p => p.id === m.providerId);
                        if (!providerExists) return false;

                        // Only show models of providers that have at least one active (non-empty) API Key configured.
                        // Exception: Ollama is running locally, doesn't need a key.
                        // Fallback: If the user has NOT configured ANY api keys in the entire client yet, show all so they are not greeted with an empty list.
                        const hasConfiguredKeysInEntireApp = apiKeys.some(k => k.apiKey && k.apiKey.trim() !== '');
                        if (hasConfiguredKeysInEntireApp) {
                          const isOllama = m.providerId === 'ollama';
                          const providerHasKey = apiKeys.some(k => k.providerId === m.providerId && k.apiKey && k.apiKey.trim() !== '');
                          if (!providerHasKey && !isOllama) {
                            return false;
                          }
                        }

                        if (!searchModelQuery) return true;
                        const q = searchModelQuery.toLowerCase();
                        return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.providerId.toLowerCase().includes(q);
                      })
                      .map((m) => {
                        const isSelected = m.id === currentModel?.id;
                        return (
                          <div
                            key={m.id}
                            onClick={() => {
                              if (onSelectModel) onSelectModel(m.id);
                              setModelDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left text-xs transition cursor-pointer group/item ${
                              isSelected
                                ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-medium'
                                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                            }`}
                          >
                            <div className="min-w-0 pr-2 font-mono">
                              <span className="truncate block font-medium">{m.id}</span>
                              {m.name && m.name !== m.id && (
                                <span className="text-[10px] text-neutral-400 truncate block font-sans">{m.name}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isSelected && <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                              {onDeleteModel && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setModelToDelete({ id: m.id, name: m.name || m.id });
                                  }}
                                  className="p-1 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition shrink-0 cursor-pointer"
                                  title={`删除模型 ${m.name || m.id}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mini Model Delete Confirmation Modal */}
      {modelToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-2xl max-w-xs w-full text-center space-y-3 font-sans animate-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-full bg-red-500/10 dark:bg-red-500/20 text-red-500 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                确认删除模型
              </h4>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 break-words leading-relaxed">
                你确认需要删除“<span className="font-mono font-medium text-neutral-900 dark:text-neutral-200">{modelToDelete.name || modelToDelete.id}</span>”吗？
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModelToDelete(null)}
                className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition font-medium cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteModel) onDeleteModel(modelToDelete.id);
                  setModelToDelete(null);
                }}
                className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium transition cursor-pointer shadow-2xs"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Composer Box */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative ${isNewChatMenuOpen ? 'z-30' : 'z-10'} flex flex-col rounded-2xl border bg-white dark:bg-neutral-900 transition-all duration-200 shadow-md ${
          isDragging 
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/20 dark:bg-indigo-950/20' 
            : isFocused
            ? 'border-indigo-500/70 dark:border-indigo-500/60 ring-3 ring-indigo-500/15 dark:ring-indigo-400/15 shadow-lg'
            : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
        }`}
      >
        {/* Drag & Drop Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-20 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/20 backdrop-blur-2xs flex flex-col items-center justify-center pointer-events-none border-2 border-dashed border-indigo-500">
            <Paperclip className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-bounce mb-1" />
            <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">松开鼠标以上传文件或图片</p>
          </div>
        )}

        {/* Half-height streamlined toolbar (Icon-only, no text clutter) */}
        <div className="flex items-center justify-between px-3 py-1 border-b border-neutral-100 dark:border-neutral-800/80 bg-neutral-50/70 dark:bg-neutral-900/60 rounded-t-2xl">
          {/* Left: Thinking Mode (Reasoning) Toggle & Agent Toggle */}
          <div className="flex items-center gap-3">
            {/* Reasoning Toggle: Minimalist switch */}
            <div 
              onClick={() => {
                dismissKeyboard();
                onUpdateParameters({ ...parameters, enableReasoning: !parameters.enableReasoning });
              }}
              className="flex items-center gap-1.5 cursor-pointer select-none"
              title={parameters.enableReasoning ? '思考模式: 已开启 (Reasoning ON)' : '思考模式: 已关闭 (Reasoning OFF)'}
            >
              <Sparkles className={`w-3.5 h-3.5 ${parameters.enableReasoning ? 'text-[#84cc16]' : 'text-neutral-400'}`} />
              <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">思考模式</span>
              <div className="flex items-center bg-neutral-200 dark:bg-neutral-800 p-0.5 rounded-full text-[9px] font-bold border border-neutral-300/60 dark:border-neutral-700/60">
                <span className={`px-1.5 py-0.2 rounded-full transition-all ${!parameters.enableReasoning ? 'bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white shadow-xs' : 'text-neutral-400'}`}>
                  OFF
                </span>
                <span className={`px-1.5 py-0.2 rounded-full transition-all ${parameters.enableReasoning ? 'bg-[#84cc16] text-black shadow-xs' : 'text-neutral-400'}`}>
                  ON
                </span>
              </div>
            </div>

            {/* Agent Toggle: Minimalist switch (right next to 思考模式, matching Section 4) */}
            {onToggleAgentMode && (
              <div 
                onClick={() => {
                  dismissKeyboard();
                  onToggleAgentMode(!agentMode);
                }}
                className="flex items-center gap-1.5 cursor-pointer select-none"
                title={agentMode ? 'Agent 模式: 已开启 (AI 可自主调用工具读写、创建与修改工作区)' : 'Agent 模式: 已关闭 (普通聊天/工作区只读模式，不执行任何写操作)'}
              >
                <Bot className={`w-3.5 h-3.5 ${agentMode ? 'text-purple-500' : 'text-neutral-400'}`} />
                <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Agent</span>
                <div className="flex items-center bg-neutral-200 dark:bg-neutral-800 p-0.5 rounded-full text-[9px] font-bold border border-neutral-300/60 dark:border-neutral-700/60">
                  <span className={`px-1.5 py-0.2 rounded-full transition-all ${!agentMode ? 'bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white shadow-xs' : 'text-neutral-400'}`}>
                    OFF
                  </span>
                  <span className={`px-1.5 py-0.2 rounded-full transition-all ${agentMode ? 'bg-purple-600 text-white shadow-xs' : 'text-neutral-400'}`}>
                    ON
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons: New Chat, Model Config, Parameters (Icon-only) */}
          <div className="flex items-center gap-1 relative" ref={newChatMenuRef}>
            {onNewChat && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    dismissKeyboard();
                    setIsNewChatMenuOpen(!isNewChatMenuOpen);
                    setShowProjectPicker(false);
                  }}
                  className={`p-1 rounded-lg transition cursor-pointer ${
                    isNewChatMenuOpen
                      ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                      : 'hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:text-indigo-600 dark:hover:text-indigo-400'
                  }`}
                  title="新建聊天窗口（全新窗口 / 项目归档）"
                >
                  <SquarePen className="w-3.5 h-3.5" />
                </button>

                {/* Upward Popover Menu (上拉菜单) */}
                {isNewChatMenuOpen && (
                  <div className="absolute bottom-full mb-2 right-0 sm:right-auto sm:left-0 z-50 w-72 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl p-1.5 select-none animate-in zoom-in-95 duration-150">
                    {!showProjectPicker ? (
                      <div className="space-y-1">
                        <div className="px-2.5 py-1 text-[11px] font-semibold text-neutral-400 tracking-wider">
                          新建聊天窗口
                        </div>

                        {/* Option 1: 全新窗口 */}
                        <button
                          type="button"
                          onClick={() => {
                            dismissKeyboard();
                            setIsNewChatMenuOpen(false);
                            setContent('');
                            setAttachments([]);
                            if (textareaRef.current) textareaRef.current.style.height = '100px';
                            onNewChat();
                          }}
                          className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-left cursor-pointer group"
                        >
                          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-200/50 dark:border-indigo-800/50">
                            <SquarePen className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                              全新窗口
                            </div>
                            <div className="text-[10px] text-neutral-400 truncate">
                              创建独立新会话，不归属任何项目
                            </div>
                          </div>
                        </button>

                        {/* Option 2: 项目归档 */}
                        <button
                          type="button"
                          onClick={() => {
                            dismissKeyboard();
                            setShowProjectPicker(true);
                          }}
                          className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-left cursor-pointer group"
                        >
                          <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-200/50 dark:border-amber-800/50">
                            <FolderPlus className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 group-hover:text-amber-600 dark:group-hover:text-amber-400 flex items-center justify-between">
                              <span>项目归档</span>
                              <ChevronRight className="w-3.5 h-3.5 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                            <div className="text-[10px] text-neutral-400 truncate">
                              在项目下创建新窗口，共享项目记忆
                            </div>
                          </div>
                        </button>
                      </div>
                    ) : (
                      <div>
                        {/* Header with Back button */}
                        <div className="flex items-center justify-between px-2 py-1.5 border-b border-neutral-100 dark:border-neutral-800 mb-1">
                          <button
                            type="button"
                            onClick={() => setShowProjectPicker(false)}
                            className="flex items-center gap-1 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span>选择归档项目</span>
                          </button>
                          <span className="text-[10px] text-neutral-400 font-mono">
                            {projects.length} 个
                          </span>
                        </div>

                        {/* Project List */}
                        <div className="max-h-52 overflow-y-auto space-y-1 p-0.5 pr-1">
                          {projects.length === 0 ? (
                            <div className="py-4 text-center px-2">
                              <Folder className="w-6 h-6 text-neutral-300 dark:text-neutral-600 mx-auto mb-1.5" />
                              <p className="text-xs text-neutral-500 dark:text-neutral-400">目前暂无项目</p>
                              <p className="text-[10px] text-neutral-400 mt-0.5">请先创建项目即可在该项目下开启新窗口</p>
                              {onCreateProject && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    dismissKeyboard();
                                    setIsNewChatMenuOpen(false);
                                    setShowProjectPicker(false);
                                    onCreateProject();
                                  }}
                                  className="mt-2.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer"
                                >
                                  + 新建项目
                                </button>
                              )}
                            </div>
                          ) : (
                            projects.map(proj => (
                              <button
                                key={proj.id}
                                type="button"
                                onClick={() => {
                                  dismissKeyboard();
                                  setIsNewChatMenuOpen(false);
                                  setShowProjectPicker(false);
                                  setContent('');
                                  setAttachments([]);
                                  if (textareaRef.current) textareaRef.current.style.height = '100px';
                                  onNewChatInProject?.(proj.id);
                                }}
                                className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-left cursor-pointer group"
                              >
                                <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
                                  <Folder className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                                    {proj.name}
                                  </div>
                                  <div className="text-[10px] text-neutral-400 truncate">
                                    {proj.memoryMode === 'isolated' ? '仅限项目记忆' : '默认记忆'}
                                  </div>
                                </div>
                              </button>
                            ))
                          )}
                        </div>

                        {/* Bottom Action: Create Project */}
                        {projects.length > 0 && onCreateProject && (
                          <div className="pt-1 mt-1 border-t border-neutral-100 dark:border-neutral-800">
                            <button
                              type="button"
                              onClick={() => {
                                dismissKeyboard();
                                setIsNewChatMenuOpen(false);
                                setShowProjectPicker(false);
                                onCreateProject();
                              }}
                              className="w-full flex items-center justify-center gap-1.5 p-1.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-indigo-600 dark:text-indigo-400 text-xs font-medium transition cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>新建项目</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {onOpenModelConfig && (
              <button
                type="button"
                onClick={() => {
                  dismissKeyboard();
                  onOpenModelConfig();
                }}
                className="p-1 rounded-lg hover:bg-orange-500/15 text-orange-600 dark:text-orange-400 transition cursor-pointer"
                title="AI 模型与服务商配置"
              >
                <Server className="w-3.5 h-3.5 text-orange-500" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                dismissKeyboard();
                onOpenParameters?.();
              }}
              className="p-1 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:text-[#84cc16] dark:hover:text-[#84cc16] transition cursor-pointer"
              title="模型运行参数 (Parameters)"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#84cc16]" />
            </button>
          </div>
        </div>

        {/* Attachments Preview Tray */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 pb-1 border-b border-neutral-100 dark:border-neutral-800/80">
            {attachments.map((att) => (
              <div 
                key={att.id}
                className="relative group flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700/80 bg-neutral-50 dark:bg-neutral-800 text-xs shadow-2xs"
              >
                {att.type.startsWith('image/') && att.dataUrl ? (
                  <img src={att.dataUrl} alt={att.name} className="w-7 h-7 object-cover rounded-lg shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0">
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                )}
                <div className="min-w-0 pr-2">
                  <p className="font-medium text-neutral-800 dark:text-neutral-200 truncate max-w-[120px] text-xs">
                    {att.name}
                  </p>
                  <p className="text-[10px] text-neutral-400">
                    {formatFileSize(att.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="p-1 rounded-full text-neutral-400 hover:text-red-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
                  title="移除附件"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text Area (Double Height - min 100px) */}
        <div className="p-3 pt-2 pb-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onFocus={() => {
              setIsFocused(true);
              setIsNewChatMenuOpen(false);
              setModelDropdownOpen(false);
              setShowProjectPicker(false);
            }}
            onBlur={() => {
              setIsFocused(false);
              // Force-reset viewport scroll position on focus loss to fix sticky keyboard blank space bug on iOS/mobile browsers
              setTimeout(() => {
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                document.body.scrollTop = 0;
                if (document.documentElement) {
                  document.documentElement.scrollTop = 0;
                }
              }, 40);
            }}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              isGenerating 
                ? 'AI 正在生成中...' 
                : '给 AI 发送消息... (Enter 发送, Shift+Enter 换行)'
            }
            rows={3}
            className="w-full bg-transparent resize-none border-0 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 outline-hidden leading-relaxed min-h-[100px] max-h-[360px] font-sans"
          />
        </div>

        {/* Bottom Toolbar Row */}
        <div className="px-3.5 pb-2 pt-1 flex items-center justify-between">
          {/* Left Buttons: Attachments & Tools */}
          <div className="flex items-center gap-3">
            {/* Hidden Inputs */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFiles(e.target.files)}
              multiple
              className="hidden"
            />
            <input
              type="file"
              ref={imageInputRef}
              accept="image/*"
              onChange={(e) => handleFiles(e.target.files)}
              multiple
              className="hidden"
            />

            <button
              type="button"
              onClick={() => {
                dismissKeyboard();
                fileInputRef.current?.click();
              }}
              className="p-1.5 rounded-xl text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition flex items-center justify-center cursor-pointer"
              title="上传文档/代码/文件 (TXT, PDF, MD, JSON, CSV, DOCX)"
            >
              <Paperclip className="w-6 h-6 stroke-[1.8]" />
            </button>

            <button
              type="button"
              onClick={() => {
                dismissKeyboard();
                imageInputRef.current?.click();
              }}
              className="p-1.5 rounded-xl text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition flex items-center justify-center cursor-pointer"
              title="上传图片 (PNG, JPG, WEBP, GIF)"
            >
              <ImageIcon className="w-6 h-6 stroke-[1.8]" />
            </button>

            {/* 访问网络按钮 (默认关闭) */}
            <button
              type="button"
              onClick={() => {
                dismissKeyboard();
                onToggleWebAccess?.(!webAccessEnabled);
              }}
              className={`p-1.5 rounded-xl transition flex items-center justify-center select-none cursor-pointer ${
                webAccessEnabled
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 font-medium shadow-2xs'
                  : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
              title={
                webAccessEnabled
                  ? '访问网络 (已开启): AI 回答时将自动检索最新网络资料与网页'
                  : '访问网络 (默认关闭): 点击开启允许 AI 检索互联网资料与网页来回答问题'
              }
            >
              <Globe className={`w-6 h-6 stroke-[1.8] ${webAccessEnabled ? 'text-blue-600 dark:text-blue-400' : ''}`} />
            </button>

            {/* 1. 预览区入口按钮 (纯图标，无文字) */}
            {onOpenPreview && (
              <button
                type="button"
                onClick={() => {
                  dismissKeyboard();
                  onOpenPreview();
                }}
                className="p-1.5 rounded-xl text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition flex items-center justify-center cursor-pointer"
                title="打开工作区实时预览 (Workspace Preview)"
              >
                <MonitorPlay className="w-6 h-6 stroke-[1.8]" />
              </button>
            )}

            {/* 2. 工作区 AI 文件修改记录入口按钮 (纯图标，无文字，弹窗显示最多 1000 条审计记录) */}
            {onOpenAuditHistory && (
              <button
                type="button"
                onClick={() => {
                  dismissKeyboard();
                  onOpenAuditHistory();
                }}
                className="p-1.5 rounded-xl text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition flex items-center justify-center cursor-pointer"
                title="查看工作区 AI 文件修改记录 (最多保留 1000 条审计记录)"
              >
                <History className="w-6 h-6 stroke-[1.8]" />
              </button>
            )}
          </div>

          {/* Right Action: Send or Stop */}
          <div className="flex items-center gap-2">
            {content.length > 0 && (
              <span className="text-xs text-neutral-400 font-mono hidden sm:inline mr-1">
                {content.length} 字
              </span>
            )}

            {isGenerating ? (
              <button
                type="button"
                onClick={onStopGeneration}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer animate-pulse"
                title="停止生成"
              >
                <Square className="w-5 h-5 fill-current" />
                <span>停止</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className={`p-2.5 rounded-2xl flex items-center justify-center transition-all shadow-xs ${
                  canSend
                    ? 'bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 active:scale-95 cursor-pointer'
                    : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                }`}
                title={isProcessingFiles ? '正在解析上传文件...' : (canSend ? '发送消息' : '请输入内容')}
              >
                {isProcessingFiles ? (
                  <RefreshCw className="w-6 h-6 stroke-[2.2] animate-spin text-neutral-400 dark:text-neutral-500" />
                ) : (
                  <ArrowUp className="w-6 h-6 stroke-[2.2]" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
