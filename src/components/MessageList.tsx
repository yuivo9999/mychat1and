import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { Message, ModelItem, UserSettings } from '../types';
import { ChatMessage } from './ChatMessage';

interface MessageListProps {
  messages: Message[];
  currentModel: ModelItem | undefined;
  settings: UserSettings;
  onRetry: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
  onContinue: (messageId: string) => void;
  onEdit: (messageId: string, newContent: string, resubmit: boolean) => void;
  onDelete: (messageId: string) => void;
  onQuote: (content: string) => void;
  onSwitchVersion: (messageId: string, versionIndex: number) => void;
  onSelectPrompt: (prompt: string) => void;
  onDownloadWorkspaceZip?: () => void;
  currentWorkspace?: any;
  onSaveWorkspace?: (workspace: any) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentModel,
  settings,
  onRetry,
  onRegenerate,
  onContinue,
  onEdit,
  onDelete,
  onQuote,
  onSwitchVersion,
  onSelectPrompt,
  onDownloadWorkspaceZip,
  currentWorkspace,
  onSaveWorkspace,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Check scroll position
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;
    setShowScrollBottom(!isNearBottom);
  };

  // Dismiss keyboard when user swipes or touches the message list
  const handleTouchDismiss = () => {
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
      active.blur();
    }
  };

  const scrollToBottom = (smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    if (settings.autoScroll) {
      scrollToBottom();
    }
  }, [messages, settings.autoScroll]);

  return (
    <div 
      ref={containerRef}
      onScroll={handleScroll}
      onTouchStart={handleTouchDismiss}
      className={`flex-1 overflow-y-auto overscroll-contain relative flex flex-col ${settings.compactMode ? 'compact-mode' : ''}`}
      style={{
        '--chat-font-size': `${settings.chatFontSizePx ?? 15}px`,
        fontSize: `${settings.chatFontSizePx ?? 15}px`,
      } as React.CSSProperties}
    >
      {messages.length === 0 ? (
        <div className="flex-1" />
      ) : (
        <div className="w-full max-w-4xl mx-auto divide-y divide-neutral-100 dark:divide-neutral-800/60 pb-8">
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              settings={settings}
              onRetry={onRetry}
              onRegenerate={onRegenerate}
              onContinue={onContinue}
              onEdit={onEdit}
              onDelete={onDelete}
              onQuote={onQuote}
              onSwitchVersion={onSwitchVersion}
              onDownloadWorkspaceZip={onDownloadWorkspaceZip}
              currentWorkspace={currentWorkspace}
              onSaveWorkspace={onSaveWorkspace}
            />
          ))}
          <div ref={bottomRef} className="h-4" />
        </div>
      )}

      {/* Floating Scroll to Bottom Button (居中悬浮，绝不遮挡右上角/左上角任何工具栏按钮) */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="fixed bottom-[calc(9rem+env(safe-area-inset-bottom,0px))] sm:bottom-28 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/95 dark:bg-neutral-850/95 text-neutral-800 dark:text-neutral-100 border border-neutral-200/90 dark:border-neutral-750 shadow-xl hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all cursor-pointer text-xs font-medium backdrop-blur-md active:scale-95 animate-in fade-in slide-in-from-bottom-2 duration-150"
          title="点击一键回到最新消息"
        >
          <ArrowDown className="w-3.5 h-3.5 text-indigo-500 stroke-[2.5]" />
          <span>回到最新消息</span>
        </button>
      )}
    </div>
  );
};
