import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  User, 
  Copy, 
  Check, 
  RotateCw, 
  Edit3, 
  Trash2, 
  Download, 
  Quote, 
  Play, 
  ChevronLeft, 
  ChevronRight, 
  AlertTriangle,
  FileText,
  Eye,
  FileCode,
  Globe,
  BarChart2,
  X
} from 'lucide-react';
import { Message, Attachment, UserSettings } from '../types';
import { renderMarkdown, getFileExtensionForLang } from '../services/markdown';
import { formatFileSize, downloadWorkspaceFile } from '../services/fileParser';
import { ThinkingSteps } from './ThinkingSteps';
import { AgentToolCallsViewer } from './AgentToolCallsViewer';
import { ThinkingLogViewer, parseThinkingContent } from './ThinkingLogViewer';

interface ChatMessageProps {
  message: Message;
  settings: UserSettings;
  onRetry: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
  onContinue: (messageId: string) => void;
  onEdit: (messageId: string, newContent: string, resubmit: boolean) => void;
  onDelete: (messageId: string) => void;
  onQuote: (content: string) => void;
  onSwitchVersion: (messageId: string, versionIndex: number) => void;
  onDownloadWorkspaceZip?: () => void;
  currentWorkspace?: any;
  onSaveWorkspace?: (workspace: any) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  settings,
  onRetry,
  onRegenerate,
  onContinue,
  onEdit,
  onDelete,
  onQuote,
  onSwitchVersion,
  onDownloadWorkspaceZip,
  currentWorkspace,
  onSaveWorkspace,
}) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('top');
  const statsContainerRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);

  const handleToggleStats = () => {
    if (!isStatsOpen && triggerButtonRef.current) {
      const rect = triggerButtonRef.current.getBoundingClientRect();
      // If button top position is < 320px from top of screen, show below. Otherwise show above.
      if (rect.top < 320) {
        setPlacement('bottom');
      } else {
        setPlacement('top');
      }
    }
    setIsStatsOpen(!isStatsOpen);
  };

  // Close word count popover when clicking elsewhere
  useEffect(() => {
    if (!isStatsOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (statsContainerRef.current && !statsContainerRef.current.contains(event.target as Node)) {
        setIsStatsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isStatsOpen]);

  const { thinkingText, mainContent } = useMemo(() => {
    if (isUser) return { thinkingText: '', mainContent: message.content };
    const parsed = parseThinkingContent(message.content);
    // Strip legacy blockquotes starting with > ℹ️ or > 💡
    const cleaned = parsed.mainContent.replace(/^>\s*(ℹ️|💡)[\s\S]*?\n\n/g, '').trim();
    return { thinkingText: parsed.thinkingText, mainContent: cleaned };
  }, [message.content, isUser]);

  // Detailed statistics for the message content
  const textStats = useMemo(() => {
    const textToAnalyze = isUser ? message.content : (mainContent || message.content);
    const totalChars = textToAnalyze.length;
    const charsNoSpaces = textToAnalyze.replace(/\s/g, '').length;
    
    // Chinese characters count
    const chineseChars = (textToAnalyze.match(/[\u4e00-\u9fa5]/g) || []).length;
    
    // English words count
    const englishWords = (textToAnalyze.match(/[a-zA-Z0-9_-]+/g) || []).length;
    
    // Lines / Paragraphs
    const lines = textToAnalyze.split('\n').length;
    const paragraphs = textToAnalyze.split(/\n\s*\n/).filter(p => p.trim().length > 0).length || 1;
    
    // Code blocks & lines
    const codeBlockMatches = textToAnalyze.match(/```[\s\S]*?```/g) || [];
    const codeBlocksCount = codeBlockMatches.length;
    let codeLinesCount = 0;
    codeBlockMatches.forEach(cb => {
      codeLinesCount += Math.max(0, cb.split('\n').length - 2);
    });
    
    // Reading time estimation
    const readingTimeSec = Math.max(1, Math.round(charsNoSpaces / 5));
    const readingTime = readingTimeSec < 60 
      ? `约 ${readingTimeSec} 秒` 
      : `约 ${Math.ceil(readingTimeSec / 60)} 分钟`;

    const thinkingChars = thinkingText ? thinkingText.length : 0;

    return {
      totalChars,
      charsNoSpaces,
      chineseChars,
      englishWords,
      lines,
      paragraphs,
      codeBlocksCount,
      codeLinesCount,
      readingTime,
      thinkingChars,
    };
  }, [message.content, mainContent, thinkingText, isUser]);

  const shouldRenderMarkdown = settings.enableMarkdown || settings.onlyParseMarkdownTables;

  const htmlContent = useMemo(() => {
    if (isUser || !shouldRenderMarkdown) {
      return '';
    }
    return renderMarkdown(mainContent, {
      renderLatex: settings.renderLatex ?? true,
      showLineNumbers: settings.showLineNumbers ?? true,
      collapseLongCode: settings.collapseLongCode ?? true,
      enableCodeHighlight: settings.enableCodeHighlight ?? true,
      codeShowCopyBtn: settings.codeShowCopyBtn ?? true,
      codeShowDownloadBtn: settings.codeShowDownloadBtn ?? true,
      codeShowAddToWorkspaceBtn: settings.codeShowAddToWorkspaceBtn ?? true,
      useCodeBox: settings.useCodeBox ?? true,
      useTextBox: settings.useTextBox ?? true,
      onlyParseMarkdownTables: settings.onlyParseMarkdownTables ?? false,
      mdHeadings: settings.mdHeadings ?? true,
      mdTextStyle: settings.mdTextStyle ?? true,
      mdListsAndQuotes: settings.mdListsAndQuotes ?? true,
      mdTables: settings.mdTables ?? true,
      mdLinksAndImages: settings.mdLinksAndImages ?? true,
      codeHeaderBar: settings.codeHeaderBar ?? true,
      textBoxBorder: settings.textBoxBorder ?? true,
      textBoxBackground: settings.textBoxBackground ?? true,
      latexInline: settings.latexInline ?? true,
      latexBlock: settings.latexBlock ?? true,
    });
  }, [
    mainContent, 
    isUser, 
    shouldRenderMarkdown, 
    settings.renderLatex, 
    settings.showLineNumbers, 
    settings.collapseLongCode,
    settings.enableCodeHighlight,
    settings.codeShowCopyBtn,
    settings.codeShowDownloadBtn,
    settings.codeShowAddToWorkspaceBtn,
    settings.useCodeBox,
    settings.useTextBox,
    settings.onlyParseMarkdownTables
  ]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([message.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `response-${message.id.slice(-6)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveEdit = (resubmit: boolean) => {
    if (editText.trim()) {
      onEdit(message.id, editText, resubmit);
      setIsEditing(false);
    }
  };

  const renderPlaintextContent = (content: string) => {
    if (!settings.boldHeadings) {
      return <div className="whitespace-pre-wrap font-sans">{content}</div>;
    }

    // Dynamic dark/light theme detection
    const isDark = (() => {
      const theme = settings.theme || 'system';
      if (theme === 'dark' || theme === 'classic2') return true;
      if (theme === 'system') {
        return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      return false;
    })();

    // Helper to select stable, colorful contrast-aware classes for headings based on text hash
    const getHeadingClasses = (text: string) => {
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = text.charCodeAt(i) + ((hash << 5) - hash);
      }
      const index = Math.abs(hash);

      const lightPalette = [
        'bg-emerald-100 text-emerald-950 border-emerald-200/60 shadow-emerald-100/10',
        'bg-sky-100 text-sky-950 border-sky-200/60 shadow-sky-100/10',
        'bg-indigo-100 text-indigo-950 border-indigo-200/60 shadow-indigo-100/10',
        'bg-rose-100 text-rose-950 border-rose-200/60 shadow-rose-100/10',
        'bg-amber-100 text-amber-950 border-amber-200/60 shadow-amber-100/10',
        'bg-fuchsia-100 text-fuchsia-950 border-fuchsia-200/60 shadow-fuchsia-100/10',
        'bg-teal-100 text-teal-950 border-teal-200/60 shadow-teal-100/10',
        'bg-violet-100 text-violet-950 border-violet-200/60 shadow-violet-100/10',
      ];

      const darkPalette = [
        'bg-emerald-950/80 text-emerald-100 border-emerald-800/40 shadow-emerald-950/20',
        'bg-sky-950/80 text-sky-100 border-sky-800/40 shadow-sky-950/20',
        'bg-indigo-950/80 text-indigo-100 border-indigo-800/40 shadow-indigo-950/20',
        'bg-rose-950/80 text-rose-100 border-rose-800/40 shadow-rose-950/20',
        'bg-amber-950/80 text-amber-100 border-amber-800/40 shadow-amber-950/20',
        'bg-fuchsia-950/80 text-fuchsia-100 border-fuchsia-800/40 shadow-fuchsia-950/20',
        'bg-teal-950/80 text-teal-100 border-teal-800/40 shadow-teal-950/20',
        'bg-violet-950/80 text-violet-100 border-violet-800/40 shadow-violet-950/20',
      ];

      const palette = isDark ? darkPalette : lightPalette;
      return palette[index % palette.length];
    };

    const lines = content.split('\n');
    return (
      <div className="whitespace-pre-wrap font-sans">
        {lines.map((line, idx) => {
          const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
          if (headingMatch) {
            const titleText = headingMatch[2];
            const colorClasses = getHeadingClasses(titleText);
            return (
              <div key={idx} className="my-3">
                <span className={`inline-block px-3 py-1 rounded-none font-bold border shadow-xs transition-colors duration-150 ${colorClasses}`}>
                  {titleText}
                </span>
              </div>
            );
          }
          return <div key={idx}>{line || ' '}</div>;
        })}
      </div>
    );
  };

  // Delegate click for code block copy, download, and expand/collapse buttons
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    
    // Copy code button
    const copyBtn = target.closest('.code-copy-btn') as HTMLElement;
    if (copyBtn) {
      const rawCode = decodeURIComponent(copyBtn.getAttribute('data-code') || '');
      if (rawCode) {
        navigator.clipboard.writeText(rawCode);
        const span = copyBtn.querySelector('span');
        if (span) {
          const original = span.innerText;
          span.innerText = '已复制!';
          setTimeout(() => { span.innerText = original; }, 1800);
        }
      }
      return;
    }

    // Download code button (Preserves original language extension and mime type)
    const dlBtn = target.closest('.code-dl-btn') as HTMLElement;
    if (dlBtn) {
      const rawCode = decodeURIComponent(dlBtn.getAttribute('data-code') || '');
      const lang = dlBtn.getAttribute('data-lang') || 'txt';
      const ext = getFileExtensionForLang(lang);
      const fileName = `code-${Date.now().toString().slice(-4)}.${ext}`;
      downloadWorkspaceFile(fileName, rawCode);
      return;
    }

    // Add to workspace button click
    const addWorkspaceBtn = target.closest('.code-add-workspace-btn') as HTMLElement;
    if (addWorkspaceBtn) {
      if (!currentWorkspace || !onSaveWorkspace) {
        alert('当前没有关联的活动工作区，请在右侧先创建一个工作区项目！');
        return;
      }
      const rawCode = decodeURIComponent(addWorkspaceBtn.getAttribute('data-code') || '');
      const lang = addWorkspaceBtn.getAttribute('data-lang') || 'txt';
      const ext = getFileExtensionForLang(lang);
      
      const defaultFilename = `code_${Date.now().toString().slice(-4)}.${ext}`;
      const path = prompt('请输入要加入当前工作区的文件路径与文件名:', defaultFilename);
      if (path && path.trim()) {
        const trimmedPath = path.trim();
        const updatedFiles = {
          ...currentWorkspace.files,
          [trimmedPath]: {
            path: trimmedPath,
            content: rawCode,
            size: new Blob([rawCode]).size,
            updatedAt: Date.now()
          }
        };
        const updatedWorkspace = {
          ...currentWorkspace,
          files: updatedFiles,
          updatedAt: Date.now()
        };
        onSaveWorkspace(updatedWorkspace);
        
        // Visual indicator on the button
        const span = addWorkspaceBtn.querySelector('span');
        if (span) {
          const original = span.innerText;
          span.innerText = '已加入工作区!';
          setTimeout(() => { span.innerText = original; }, 2000);
        }
      }
      return;
    }

    // Expand / Collapse long code block button
    const toggleBtn = target.closest('.code-expand-toggle-btn') as HTMLElement;
    if (toggleBtn) {
      const wrapper = toggleBtn.closest('.code-block-wrapper');
      const collapsible = wrapper?.querySelector('.code-collapsible-wrapper') as HTMLElement;
      const mask = wrapper?.querySelector('.code-collapse-mask') as HTMLElement;
      const textSpan = toggleBtn.querySelector('.toggle-text') as HTMLElement;
      const arrow = toggleBtn.querySelector('.toggle-arrow') as SVGElement;

      if (collapsible) {
        const isExpanded = collapsible.classList.contains('is-expanded');
        if (isExpanded) {
          collapsible.classList.remove('is-expanded');
          collapsible.style.maxHeight = '300px';
          if (mask) {
            mask.style.position = 'absolute';
            mask.style.background = '';
            mask.style.padding = '';
          }
          if (arrow) arrow.style.transform = 'rotate(0deg)';
          if (textSpan) textSpan.innerText = '展开完整代码';
        } else {
          collapsible.classList.add('is-expanded');
          collapsible.style.maxHeight = 'none';
          if (mask) {
            mask.style.position = 'relative';
            mask.style.background = 'transparent';
            mask.style.padding = '0.5rem 0';
          }
          if (arrow) arrow.style.transform = 'rotate(180deg)';
          if (textSpan) textSpan.innerText = '收起代码';
        }
      }
      return;
    }
  };

  const versions = message.versions || [];
  const currentIdx = message.currentVersionIndex ?? (versions.length > 0 ? versions.length - 1 : 0);

  return (
    <div
      onClick={handleContainerClick}
      className={`chat-message-row group relative flex gap-3 transition-colors ${
        settings.compactMode ? 'compact-message' : ''
      } ${
        isUser
          ? `user-message bg-transparent ${settings.compactMode ? 'px-3 py-2.5 md:px-5 md:py-3' : 'px-3 py-4 md:px-6 md:py-5'}`
          : `assistant-message bg-neutral-100/60 dark:bg-neutral-900/50 border-y border-neutral-200/50 dark:border-neutral-800/40 ${
              settings.compactMode ? 'px-3 py-2.5 sm:px-3.5 sm:py-2.5' : 'px-3.5 py-3.5 sm:px-4 sm:py-4'
            }`
      }`}
    >
      {/* Avatar (Only for user messages; removed for AI reply box as requested) */}
      {isUser && (
        <div className="shrink-0 pt-0.5">
          <div className="w-8 h-8 rounded-xl bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 flex items-center justify-center shadow-xs">
            <User className="w-4 h-4" />
          </div>
        </div>
      )}

      {/* Main Message Body */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Meta Header */}
        <div className="flex items-center gap-2 text-xs text-neutral-400 select-none">
          <span className="font-semibold text-neutral-700 dark:text-neutral-300">
            {isUser ? '你' : message.model || 'AI 助手'}
          </span>

          {settings.showTimestamps && (
            <span className="text-[11px] text-neutral-400">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          {/* Versions Carousel if multiple answers exist */}
          {!isUser && versions.length > 1 && (
            <div className="flex items-center gap-1 bg-neutral-200/60 dark:bg-neutral-800 px-1.5 py-0.5 rounded-md text-[10px] ml-2">
              <button
                type="button"
                disabled={currentIdx === 0}
                onClick={() => onSwitchVersion(message.id, currentIdx - 1)}
                className="hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="font-mono">{currentIdx + 1}/{versions.length}</span>
              <button
                type="button"
                disabled={currentIdx === versions.length - 1}
                onClick={() => onSwitchVersion(message.id, currentIdx + 1)}
                className="hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Attachments Preview (for User Messages) */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1 pb-1">
            {message.attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800/80 shadow-2xs text-xs"
              >
                {att.type.startsWith('image/') && att.dataUrl ? (
                  <div 
                    className="relative group/thumb cursor-pointer w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-neutral-200 dark:border-neutral-700"
                    onClick={() => setPreviewImage(att.dataUrl || null)}
                  >
                    <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition">
                      <Eye className="w-3.5 h-3.5 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-700/60 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-indigo-500" />
                  </div>
                )}
                <div className="min-w-0 pr-1">
                  <p className="font-medium text-neutral-800 dark:text-neutral-200 truncate max-w-[140px] text-xs">
                    {att.name}
                  </p>
                  <p className="text-[10px] text-neutral-400">
                    {formatFileSize(att.size)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Thinking & Action Steps Stream (图片中展示的信息条样式) */}
        {!isUser && (
          <ThinkingSteps
            steps={
              message.thinkingSteps && message.thinkingSteps.length > 0
                ? message.thinkingSteps
                : message.status === 'streaming' && !message.content
                ? [
                    {
                      id: 'default-step-1',
                      icon: 'github',
                      title: '分析输入内容与构建模型上下文',
                      status: 'running',
                    },
                  ]
                : undefined
            }
            isStreaming={message.status === 'streaming'}
            hasContent={Boolean(message.content && message.content.trim().length > 0)}
          />
        )}

        {/* Web Search Sources Citation */}
        {!isUser && message.webSearchResults && message.webSearchResults.length > 0 && (
          <div className="mb-2.5 p-2 rounded-xl bg-blue-500/5 dark:bg-blue-950/25 border border-blue-500/20 text-xs animate-in fade-in">
            <div className="flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400 mb-1.5">
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>已参考 {message.webSearchResults.length} 个网络网页资料：</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {message.webSearchResults.map((source, idx) => (
                <a
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700/80 text-[11px] text-neutral-700 dark:text-neutral-300 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-400 dark:hover:border-blue-500/50 transition truncate max-w-[240px]"
                  title={`${source.title}\n${source.snippet}\n${source.url}`}
                >
                  <span className="font-mono text-neutral-400 font-semibold">[{idx + 1}]</span>
                  <span className="truncate">{source.title}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Content Display or Inline Editor */}
        {isEditing ? (
          <div className="space-y-2 pt-1">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full text-sm p-3 rounded-xl border border-indigo-500 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 outline-hidden min-h-[90px] font-sans"
              rows={3}
            />
            <div className="flex items-center gap-2 justify-end text-xs">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition"
              >
                取消
              </button>
              {isUser ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(false)}
                    className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                  >
                    仅保存
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(true)}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition shadow-xs"
                  >
                    保存并重新生成
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSaveEdit(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition"
                >
                  保存修改
                </button>
              )}
            </div>
          </div>
        ) : (
          <div 
            className="text-neutral-900 dark:text-neutral-100 leading-relaxed overflow-hidden"
            style={{ fontSize: 'var(--chat-font-size, 15px)' }}
          >
            {/* Thinking Log (Collapsible reasoning steps for DeepSeek R1 / Reasoning models) */}
            {!isUser && thinkingText && (
              <ThinkingLogViewer
                thinkingText={thinkingText}
                isStreaming={message.status === 'streaming'}
              />
            )}

            {isUser || !shouldRenderMarkdown ? (
              renderPlaintextContent(mainContent)
            ) : (
              <div 
                className="markdown-body" 
                dangerouslySetInnerHTML={{ __html: htmlContent }} 
              />
            )}

            {/* Streaming Breathing Cursor */}
            {message.status === 'streaming' && (settings.showStreamingCursor ?? true) && (
              <span className="streaming-cursor" />
            )}
          </div>
        )}

        {/* Agent Tool Execution Logs & Diff Viewer */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <AgentToolCallsViewer
            toolCalls={message.toolCalls}
            modifiedFiles={message.modifiedFiles}
            onDownloadWorkspaceZip={onDownloadWorkspaceZip}
          />
        )}

        {/* Error Banner */}
        {message.status === 'error' && (
          <div className="mt-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
            <div className="flex-1 space-y-1">
              <p className="font-semibold">生成失败</p>
              <p className="leading-relaxed opacity-90">{message.errorMessage || '请求未成功返回，请检查网络或配置。'}</p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => onRetry(message.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-medium transition"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>立即重试</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Action Toolbar */}
        {!isEditing && message.status !== 'streaming' && (
          <div className={`pt-1.5 flex flex-wrap items-center gap-1 text-xs transition-opacity select-none ${isStatsOpen ? 'opacity-100' : 'opacity-75 md:opacity-0 group-hover:opacity-100'}`}>
            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition"
              title="复制纯文本"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            {/* User message actions */}
            {isUser && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditText(message.content);
                    setIsEditing(true);
                  }}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition"
                  title="编辑问题"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onRegenerate(message.id)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition"
                  title="重新发送"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>

                {/* 用户消息字数统计（点击展示统计详情，点击其他地方收起） */}
                <div className="relative inline-flex items-center" ref={statsContainerRef}>
                  <button
                    ref={triggerButtonRef}
                    type="button"
                    onClick={handleToggleStats}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-mono select-none transition-colors cursor-pointer ${
                      isStatsOpen
                        ? 'bg-neutral-200/90 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 font-semibold shadow-2xs'
                        : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/60'
                    }`}
                  >
                    <span>{textStats.totalChars.toLocaleString()} 字</span>
                  </button>

                  {/* 详细字数与结构统计浮层 (居中，且支持上下自适应避免遮挡) */}
                  {isStatsOpen && (
                    <div className={`absolute ${placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} left-1/2 -translate-x-1/2 w-[240px] max-w-[calc(100vw-2.5rem)] bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-800 p-4 z-40 text-xs animate-in fade-in zoom-in-95 duration-150 select-none`}>
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-100 dark:border-neutral-800">
                        <span className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2 text-sm">
                          <BarChart2 className="w-4 h-4 text-lime-500" />
                          <span>字数统计</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsStatsOpen(false)}
                          className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-1.5 font-sans text-xs">
                        <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                          <span>总字符 (含空格)</span>
                          <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                            {textStats.totalChars.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                          <span>纯字数 (无空格)</span>
                          <span className="font-mono text-neutral-900 dark:text-neutral-100">
                            {textStats.charsNoSpaces.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                          <span>中文字符</span>
                          <span className="font-mono text-neutral-900 dark:text-neutral-100 font-medium">
                            {textStats.chineseChars.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                          <span>英文单词</span>
                          <span className="font-mono text-neutral-900 dark:text-neutral-100 font-medium">
                            {textStats.englishWords.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                          <span>段落 / 行数</span>
                          <span className="font-mono text-neutral-900 dark:text-neutral-100 font-medium">
                            {textStats.paragraphs} 段 / {textStats.lines} 行
                          </span>
                        </div>

                        {textStats.codeBlocksCount > 0 && (
                          <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                            <span>代码块 / 行</span>
                            <span className="font-mono text-neutral-900 dark:text-neutral-100 font-medium">
                              {textStats.codeBlocksCount} 个 ({textStats.codeLinesCount} 行)
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 pt-1.5 mt-1.5 border-t border-neutral-100 dark:border-neutral-800 text-[11px]">
                          <span>预估阅读</span>
                          <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                            {textStats.readingTime}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* AI message actions */}
            {!isUser && (
              <>
                <button
                  type="button"
                  onClick={() => onRetry(message.id)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition"
                  title="重试 (保留上下文)"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onContinue(message.id)}
                  className="px-2 py-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition text-[11px] flex items-center gap-1"
                  title="继续生成未完成内容"
                >
                  <Play className="w-3 h-3" />
                  <span>继续</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditText(message.content);
                    setIsEditing(true);
                  }}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition"
                  title="直接编辑回复内容"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onQuote(message.content)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition"
                  title="引用至输入框"
                >
                  <Quote className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition"
                  title="下载为 Markdown 文件"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>

                {/* AI 消息字数统计（点击展示统计详情，点击其他地方收起） */}
                <div className="relative inline-flex items-center" ref={statsContainerRef}>
                  <button
                    ref={triggerButtonRef}
                    type="button"
                    onClick={handleToggleStats}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-mono select-none transition-colors cursor-pointer ${
                      isStatsOpen
                        ? 'bg-neutral-200/90 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 font-semibold shadow-2xs'
                        : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/60'
                    }`}
                  >
                    <span>{textStats.totalChars.toLocaleString()} 字</span>
                  </button>

                  {/* 详细字数与结构统计浮层 (居中，且支持上下自适应避免遮挡) */}
                  {isStatsOpen && (
                    <div className={`absolute ${placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} left-1/2 -translate-x-1/2 w-[240px] max-w-[calc(100vw-2.5rem)] bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-800 p-4 z-40 text-xs animate-in fade-in zoom-in-95 duration-150 select-none`}>
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-100 dark:border-neutral-800">
                        <span className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2 text-sm">
                          <BarChart2 className="w-4 h-4 text-lime-500" />
                          <span>字数统计</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsStatsOpen(false)}
                          className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-1.5 font-sans text-xs">
                        <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                          <span>总字符 (含空格)</span>
                          <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                            {textStats.totalChars.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                          <span>纯字数 (无空格)</span>
                          <span className="font-mono text-neutral-900 dark:text-neutral-100 font-medium">
                            {textStats.charsNoSpaces.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                          <span>中文字符</span>
                          <span className="font-mono text-neutral-900 dark:text-neutral-100 font-medium">
                            {textStats.chineseChars.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                          <span>英文单词</span>
                          <span className="font-mono text-neutral-900 dark:text-neutral-100 font-medium">
                            {textStats.englishWords.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                          <span>段落 / 行数</span>
                          <span className="font-mono text-neutral-900 dark:text-neutral-100 font-medium">
                            {textStats.paragraphs} 段 / {textStats.lines} 行
                          </span>
                        </div>

                        {textStats.codeBlocksCount > 0 && (
                          <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                            <span>代码块 / 行</span>
                            <span className="font-mono text-neutral-900 dark:text-neutral-100 font-medium">
                              {textStats.codeBlocksCount} 个 ({textStats.codeLinesCount} 行)
                            </span>
                          </div>
                        )}

                        {textStats.thinkingChars > 0 && (
                          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400/90 pt-1.5 border-t border-neutral-100 dark:border-neutral-800">
                            <span>思考过程</span>
                            <span className="font-mono font-semibold">
                              {textStats.thinkingChars.toLocaleString()} 字
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 pt-1.5 mt-1.5 border-t border-neutral-100 dark:border-neutral-800 text-[11px]">
                          <span>预估阅读</span>
                          <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                            {textStats.readingTime}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Delete button */}
            <button
              type="button"
              onClick={() => onDelete(message.id)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition ml-auto"
              title="删除此消息"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setPreviewImage(null)}
        >
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
