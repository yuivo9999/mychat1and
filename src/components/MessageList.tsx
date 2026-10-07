import React, { useEffect, useRef, useState } from 'react';
import { AgentTaskState, Message, ModelItem, UserSettings } from '../types';
import { subscribeConversationChanges } from '../services/db';
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
  onOpenWorkspace?: () => void;
  agentTaskState?: AgentTaskState | null;
  onScrollBottomVisibilityChange?: (visible: boolean) => void;
  scrollToLatestRef?: React.MutableRefObject<(() => void) | null>;
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
  onOpenWorkspace,
  agentTaskState,
  onScrollBottomVisibilityChange,
  scrollToLatestRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [liveAgentTaskState, setLiveAgentTaskState] = useState<AgentTaskState | null>(agentTaskState ?? null);

  useEffect(() => {
    setLiveAgentTaskState(agentTaskState ?? null);
  }, [agentTaskState]);

  useEffect(() => {
    const unsubscribe = subscribeConversationChanges((conversation) => {
      const ownsVisibleMessages = conversation.messages?.some(candidate =>
        messages.some(message => message.id === candidate.id)
      );
      if (ownsVisibleMessages) {
        setLiveAgentTaskState(conversation.agentTask ?? null);
      }
    });
    return unsubscribe;
  }, [messages]);

  // Check scroll position
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;
    const shouldShow = !isNearBottom;
    setShowScrollBottom(shouldShow);
    onScrollBottomVisibilityChange?.(shouldShow);
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
    if (!scrollToLatestRef) return;
    scrollToLatestRef.current = () => scrollToBottom(true);
    return () => {
      scrollToLatestRef.current = null;
    };
  }, [scrollToLatestRef]);

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
            <React.Fragment key={msg.id}>
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
                onOpenWorkspace={onOpenWorkspace}
              />
            </React.Fragment>
          ))}
          <div ref={bottomRef} className="h-4" />
        </div>
      )}


    </div>
  );
};
