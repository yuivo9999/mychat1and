import React, { useState } from 'react';
import { X, FileText, Download, Code, Check } from 'lucide-react';
import { Conversation, ModelItem } from '../types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: Conversation | null;
  models: ModelItem[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  conversation,
  models,
}) => {
  const [format, setFormat] = useState<'markdown' | 'json' | 'txt' | 'html'>('markdown');

  if (!isOpen || !conversation) return null;

  const model = models.find(m => m.id === conversation.modelId);

  const handleDownload = () => {
    let content = '';
    let mimeType = 'text/plain;charset=utf-8';
    let ext = 'txt';

    const safeTitle = (conversation.title || 'chat-export')
      .replace(/[\/\\?%*:|"<>]/g, '-')
      .slice(0, 40);

    if (format === 'markdown') {
      ext = 'md';
      mimeType = 'text/markdown;charset=utf-8';
      content = `# ${conversation.title}\n\n`;
      content += `> 模型: ${model?.name || conversation.modelId} | 导出时间: ${new Date().toLocaleString()}\n\n---\n\n`;

      for (const msg of conversation.messages) {
        const role = msg.role === 'user' ? '### 👤 用户' : `### 🤖 ${msg.model || 'AI 助手'}`;
        const time = new Date(msg.timestamp).toLocaleString();
        content += `${role}  *(${time})*\n\n${msg.content}\n\n---\n\n`;
      }
    } else if (format === 'json') {
      ext = 'json';
      mimeType = 'application/json;charset=utf-8';
      content = JSON.stringify(conversation, null, 2);
    } else if (format === 'txt') {
      ext = 'txt';
      content = `${conversation.title}\n模型: ${model?.name || conversation.modelId}\n时间: ${new Date().toLocaleString()}\n\n`;
      for (const msg of conversation.messages) {
        content += `[${msg.role === 'user' ? '用户' : 'AI'}]:\n${msg.content}\n\n`;
      }
    } else if (format === 'html') {
      ext = 'html';
      mimeType = 'text/html;charset=utf-8';
      content = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <title>${conversation.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #1f2937; }
    h1 { font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
    .msg { margin-bottom: 24px; padding: 16px; border-radius: 12px; }
    .user { background: #f3f4f6; }
    .assistant { background: #f9fafb; border: 1px solid #e5e7eb; }
    .meta { font-size: 12px; color: #6b7280; margin-bottom: 8px; font-weight: 600; }
    pre { background: #111827; color: #f9fafb; padding: 12px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>${conversation.title}</h1>
  <p style="color: #6b7280; font-size: 14px;">模型: ${model?.name || conversation.modelId} | 导出时间: ${new Date().toLocaleString()}</p>
  ${conversation.messages.map(m => `
    <div class="msg ${m.role}">
      <div class="meta">${m.role === 'user' ? '👤 你' : '🤖 ' + (m.model || 'AI')} - ${new Date(m.timestamp).toLocaleTimeString()}</div>
      <div style="white-space: pre-wrap;">${escapeHtml(m.content)}</div>
    </div>
  `).join('')}
</body>
</html>`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl p-5 space-y-5 animate-in fade-in duration-150">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-neutral-800 dark:text-neutral-200">
            <Download className="w-4 h-4 text-indigo-500" />
            <span>导出当前对话</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <p className="text-xs text-neutral-500 mb-3">选择导出的文件格式：</p>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { id: 'markdown', label: 'Markdown (.md)', desc: '排版完整，适合 Notion 与 Obsidian' },
              { id: 'json', label: 'JSON (.json)', desc: '完整保留会话树结构与版本' },
              { id: 'txt', label: '纯文本 (.txt)', desc: '极简纯文本记录' },
              { id: 'html', label: '网页 (.html)', desc: '单文件网页，可在浏览器直接阅读' },
            ].map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFormat(item.id as any)}
                className={`p-3 rounded-2xl border text-left transition ${
                  format === item.id
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <div className="text-xs">{item.label}</div>
                <div className="text-[10px] text-neutral-400 font-normal mt-0.5">{item.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-xs rounded-xl text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>立即导出并保存</span>
          </button>
        </div>
      </div>
    </div>
  );
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
