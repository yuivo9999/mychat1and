import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  Save, 
  RotateCcw, 
  FileText, 
  Code2, 
  FileCode, 
  Check, 
  Copy, 
  Eye, 
  Edit3, 
  Download,
  AlertTriangle,
  Sparkles,
  WrapText,
  RefreshCw,
  Info,
  CheckSquare,
  Trash2
} from 'lucide-react';
import { WorkspaceFile } from '../types/workspace';
import { formatFileSize, downloadWorkspaceFile, convertUtf16ToUtf8 } from '../services/fileParser';
import { renderMarkdown } from '../services/markdown';
import { ExcelEditorModal } from './ExcelEditorModal';

interface FileEditorModalProps {
  isOpen: boolean;
  file: WorkspaceFile | null;
  onClose: () => void;
  onSave: (filePath: string, newContent: string) => void;
}

// Detect language name and icon category from extension
function getLanguageInfo(filename: string): { langName: string; isMarkdown: boolean; isCode: boolean; isImageOrPdf: boolean } {
  const lower = filename.toLowerCase();
  
  if (lower.endsWith('.pdf') || lower.match(/\.(png|jpg|jpeg|gif|webp|ico|bmp|svg)$/)) {
    return { langName: lower.endsWith('.pdf') ? 'PDF' : 'IMAGE', isMarkdown: false, isCode: false, isImageOrPdf: true };
  }

  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return { langName: 'MARKDOWN', isMarkdown: true, isCode: false, isImageOrPdf: false };
  }
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) {
    return { langName: 'TYPESCRIPT', isMarkdown: false, isCode: true, isImageOrPdf: false };
  }
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) {
    return { langName: 'JAVASCRIPT', isMarkdown: false, isCode: true, isImageOrPdf: false };
  }
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.less')) {
    return { langName: 'STYLESHEET', isMarkdown: false, isCode: true, isImageOrPdf: false };
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return { langName: 'HTML', isMarkdown: false, isCode: true, isImageOrPdf: false };
  }
  if (lower.endsWith('.json')) {
    return { langName: 'JSON', isMarkdown: false, isCode: true, isImageOrPdf: false };
  }
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    return { langName: 'YAML', isMarkdown: false, isCode: true, isImageOrPdf: false };
  }
  if (lower.endsWith('.sql')) {
    return { langName: 'SQL', isMarkdown: false, isCode: true, isImageOrPdf: false };
  }
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    return { langName: 'WORD DOC', isMarkdown: false, isCode: false, isImageOrPdf: false };
  }
  if (lower.endsWith('.txt')) {
    return { langName: 'TEXT', isMarkdown: false, isCode: false, isImageOrPdf: false };
  }

  return { langName: 'DOCUMENT', isMarkdown: false, isCode: true, isImageOrPdf: false };
}

export const FileEditorModal: React.FC<FileEditorModalProps> = ({
  isOpen,
  file,
  onClose,
  onSave,
}) => {
  const [content, setContent] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [wordWrap, setWordWrap] = useState(true);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [isSavedToast, setIsSavedToast] = useState(false);
  const [copied, setCopied] = useState(false);
  const [encodingConvertedToast, setEncodingConvertedToast] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  // Convert UTF-16 / UTF-16LE or null-byte-padded text to UTF-8
  const handleConvertToUtf8 = () => {
    const { text } = convertUtf16ToUtf8(content);
    setContent(text);
    setEncodingConvertedToast(true);
    setTimeout(() => setEncodingConvertedToast(false), 3500);
  };

  // Sync content when file opens
  useEffect(() => {
    if (file) {
      const initial = file.content || '';
      setContent(initial);
      setInitialContent(initial);
      setHistory([initial]);
      setHistoryIndex(0);
      setActiveTab('edit');
      setIsSavedToast(false);
    }
  }, [file]);

  const isModified = content !== initialContent;

  const langInfo = useMemo(() => {
    if (!file) return { langName: 'FILE', isMarkdown: false, isCode: false, isImageOrPdf: false };
    return getLanguageInfo(file.path);
  }, [file]);

  // Handle Text Content Change with History stack
  const handleContentChange = (newVal: string) => {
    setContent(newVal);
    // Push state to history stack up to 30 steps
    if (historyIndex >= 0) {
      const nextHistory = history.slice(0, historyIndex + 1);
      nextHistory.push(newVal);
      if (nextHistory.length > 30) nextHistory.shift();
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
    }
  };

  // Undo (撤销) action
  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const prevContent = history[prevIndex];
      setHistoryIndex(prevIndex);
      setContent(prevContent);
    } else {
      // Revert back to initialContent when modal was opened
      setContent(initialContent);
    }
  };

  // Save (保存) action
  const handleSave = () => {
    if (!file) return;
    onSave(file.path, content);
    setInitialContent(content);
    setIsSavedToast(true);
    setTimeout(() => {
      setIsSavedToast(false);
    }, 2200);
  };

  // Close (关闭) action with safety check for unsaved edits
  const handleAttemptClose = () => {
    if (isModified) {
      if (confirm(`文件 "${file?.path}" 存在未保存的修改，确定关闭吗？`)) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  // Synchronize line numbers gutter scrolling
  const handleScrollTextarea = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Delegate Excel format files (.xlsx, .xls, .csv, .tsv) to dedicated Excel Editor Component
  if (isOpen && file && file.path.toLowerCase().match(/\.(xlsx|xls|csv|tsv)$/)) {
    return (
      <ExcelEditorModal
        isOpen={isOpen}
        file={file}
        onClose={onClose}
        onSave={onSave}
      />
    );
  }

  // Support Tab key indentation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+S / Cmd+S => Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
      return;
    }
    // Ctrl+Z / Cmd+Z => Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      handleUndo();
      return;
    }
    // Tab key
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      const newVal = content.substring(0, start) + '  ' + content.substring(end);
      handleContentChange(newVal);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  // Copy all content
  const handleCopyAll = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Select all text in editor without opening mobile virtual keyboard
  const handleSelectAllText = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (textareaRef.current) {
      const ta = textareaRef.current;
      const originalReadOnly = ta.readOnly;
      ta.readOnly = true;
      ta.focus();
      ta.setSelectionRange(0, ta.value.length);
      setTimeout(() => {
        ta.readOnly = originalReadOnly;
      }, 50);
    }
  };

  // Delete currently selected text
  const handleDeleteSelectedText = () => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) {
      const newVal = content.substring(0, start) + content.substring(end);
      handleContentChange(newVal);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start;
        }
      }, 0);
    }
  };

  // Line & Char statistics
  const linesCount = useMemo(() => content.split('\n').length, [content]);
  const charCount = useMemo(() => content.length, [content]);

  if (!isOpen || !file) return null;

  return (
    <div className="file-editor-modal fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 select-none animate-in fade-in duration-150">
      <div className="bg-neutral-900 border border-neutral-800 text-neutral-100 rounded-2xl sm:rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh] min-h-[500px]">
        
        {/* Header Bar */}
        <div className="px-4 py-3 bg-neutral-900/90 border-b border-neutral-800 flex items-center justify-between shrink-0 gap-3">
          {/* File Info */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl border border-sky-500/30 bg-sky-500/10 flex items-center justify-center text-sky-400 shrink-0">
              {langInfo.isCode ? <Code2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="file-editor-filename font-bold text-sm text-white truncate" title={file.path}>
                  {file.path}
                </h3>
                {isModified && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-medium shrink-0 animate-pulse">
                    已修改 (未保存)
                  </span>
                )}
                {isSavedToast && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-medium shrink-0 flex items-center gap-1 animate-in fade-in duration-150">
                    <Check className="w-3 h-3" />
                    已保存!
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-400 font-mono mt-0.5">
                <span className="text-lime-400 font-sans font-medium uppercase text-[10px] bg-lime-500/10 px-1.5 py-0.2 rounded border border-lime-500/20">
                  {langInfo.langName}
                </span>
                <span>{formatFileSize(charCount)}</span>
                <span>{linesCount} 行</span>
              </div>
            </div>
          </div>

          {/* Action Buttons: 撤销, 保存, 关闭 */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 撤销 (Undo) 按钮 */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={!isModified && historyIndex <= 0}
              className={`h-9 w-9 rounded-xl border text-xs font-medium flex items-center justify-center transition cursor-pointer active:scale-95 ${
                isModified || historyIndex > 0
                  ? 'border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white'
                  : 'border-neutral-800 bg-neutral-900/50 text-neutral-600 cursor-not-allowed'
              }`}
              title="撤销 (Ctrl+Z)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* 保存 (Save) 按钮 */}
            <button
              type="button"
              onClick={handleSave}
              className={`h-9 w-9 rounded-xl text-xs font-semibold flex items-center justify-center transition cursor-pointer shadow-xs active:scale-95 ${
                isModified
                  ? 'bg-lime-500 hover:bg-lime-400 text-black shadow-lime-500/20'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white border border-neutral-700/80'
              }`}
              title="保存 (Ctrl+S)"
            >
              <Save className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-5 bg-neutral-800 mx-0.5" />

            {/* 关闭 (Close) 按钮 */}
            <button
              type="button"
              onClick={handleAttemptClose}
              className="h-9 w-9 rounded-xl border border-neutral-800 hover:border-neutral-700 bg-neutral-800/60 hover:bg-neutral-800 text-neutral-400 hover:text-white transition cursor-pointer flex items-center justify-center"
              title="关闭编辑器"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Toolbar & View Tabs */}
        <div className="px-4 py-2 bg-neutral-950/80 border-b border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400 shrink-0 gap-2 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-2 shrink-0">
            {langInfo.isMarkdown && (
              <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('edit')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                    activeTab === 'edit'
                      ? 'bg-neutral-800 text-neutral-100 shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5 shrink-0" />
                  <span>编辑内容</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`md-preview-tab px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 text-white ${
                    activeTab === 'preview'
                      ? 'bg-neutral-800 text-white shadow-xs'
                      : 'text-white hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 shrink-0" />
                  <span>MD 渲染预览</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setWordWrap(!wordWrap)}
              className={`px-2.5 py-1 rounded-lg border text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                wordWrap
                  ? 'border-neutral-700 bg-neutral-800 text-neutral-200'
                  : 'border-neutral-800 bg-neutral-900/60 text-neutral-500'
              }`}
              title="自动换行切换"
            >
              <WrapText className="w-3.5 h-3.5 shrink-0" />
              <span>自动换行: {wordWrap ? '开' : '关'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Convert UTF-16 to UTF-8 Button */}
            <button
              type="button"
              onClick={handleConvertToUtf8}
              className="px-2.5 py-1 rounded-lg border border-amber-500/40 hover:border-amber-500 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-medium text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
              title="将 UTF-16 / UTF-16LE / 空字节 BOM 标记转为标准 UTF-8 并写回保存"
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>转 UTF-8</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (file) {
                  downloadWorkspaceFile(file.path, content);
                }
              }}
              className="px-2.5 py-1 rounded-lg border border-neutral-800 hover:border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title="下载保存原格式文件到本地"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>下载本文件</span>
            </button>

            <button
              type="button"
              onClick={handleCopyAll}
              className="px-2.5 py-1 rounded-lg border border-neutral-800 hover:border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title="复制全文本"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-lime-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
              <span>{copied ? '已复制!' : '复制全文本'}</span>
            </button>
          </div>
        </div>

        {/* Auto Detection Banner for UTF-16 / LE */}
        {(content.includes('\x00') || content.charCodeAt(0) === 0xFEFF || content.charCodeAt(0) === 0xFFFE) && (
          <div className="px-4 py-1.5 bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-xs flex items-center justify-between shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0 text-amber-400" />
              <span>检测到此文件包含 UTF-16 / UTF-16LE 空字节或 BOM 标记</span>
            </div>
            <button
              type="button"
              onClick={handleConvertToUtf8}
              className="px-2.5 py-0.5 rounded-md bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-[11px] transition cursor-pointer shrink-0 shadow-xs"
            >
              一键转为 UTF-8 格式
            </button>
          </div>
        )}

        {/* Encoding Converted Toast */}
        {encodingConvertedToast && (
          <div className="px-4 py-1.5 bg-emerald-500/20 border-b border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between shrink-0 animate-in fade-in">
            <span>✓ 已成功转为标准 UTF-8 编码！请点击右上角“保存”写回工作区。</span>
          </div>
        )}

        {/* Editor Body */}
        <div className="flex-1 min-h-0 bg-neutral-950 relative flex overflow-hidden">
          {langInfo.isImageOrPdf ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-neutral-400 space-y-3">
              <AlertTriangle className="w-10 h-10 text-amber-500/80" />
              <h4 className="text-sm font-bold text-neutral-200">此文件格式暂无需在此编辑器中修改</h4>
              <p className="text-xs max-w-sm text-neutral-500">
                当前项目专注于纯文本与代码（TXT, JS, TS, MD, CSS, DOCX, JSON 等）的快速编辑与保存。
              </p>
            </div>
          ) : activeTab === 'preview' ? (
            <div className="flex-1 overflow-y-auto p-6 text-sm text-neutral-200 select-text font-sans scrollbar-thin scrollbar-thumb-neutral-800">
              <div 
                className="markdown-body max-w-3xl mx-auto"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              />
            </div>
          ) : (
            <div className="flex-1 flex min-w-0 relative">
              {/* Line Numbers Gutter */}
              <div 
                ref={gutterRef}
                className="select-none py-3 pl-3 pr-2.5 text-right font-mono text-xs leading-[1.625rem] text-neutral-600 bg-neutral-950 border-r border-neutral-800/80 overflow-hidden shrink-0"
              >
                {Array.from({ length: linesCount }, (_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>

              {/* Textarea Editor */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                onScroll={handleScrollTextarea}
                onKeyDown={handleKeyDown}
                placeholder="在此输入或粘贴文件内容..."
                spellCheck={false}
                className={`flex-1 p-3 bg-neutral-950 text-neutral-100 font-mono text-xs leading-[1.625rem] outline-hidden border-none resize-none scrollbar-thin scrollbar-thumb-neutral-800 selection:bg-lime-500/30 ${
                  wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto'
                }`}
              />
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <div className="px-4 py-2 bg-neutral-900 border-t border-neutral-800 flex flex-wrap items-center justify-between text-[11px] text-neutral-500 font-mono shrink-0 gap-2">
          <div>
            状态: <span className={isModified ? 'text-amber-400 font-medium' : 'text-neutral-400'}>{isModified ? '修改未保存' : '已同步'}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSelectAllText}
              className="px-2.5 py-1 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white transition cursor-pointer flex items-center gap-1.5 text-xs font-medium shrink-0 active:scale-95"
              title="全选文字"
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>全选</span>
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleDeleteSelectedText}
              className="px-2.5 py-1 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-red-300 transition cursor-pointer flex items-center gap-1.5 text-xs font-medium shrink-0 active:scale-95"
              title="删除已选中的文字"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span>删除</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
