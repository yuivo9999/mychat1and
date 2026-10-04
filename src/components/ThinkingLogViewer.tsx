import React, { useState } from 'react';
import { Sparkles, ChevronDown, ChevronRight, Brain } from 'lucide-react';

interface ThinkingLogViewerProps {
  thinkingText: string;
  isStreaming?: boolean;
}

export function parseThinkingContent(rawText: string): { thinkingText: string; mainContent: string } {
  if (!rawText) return { thinkingText: '', mainContent: '' };

  const thinkMatch = rawText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
  if (!thinkMatch) {
    return { thinkingText: '', mainContent: rawText };
  }

  const thinkingText = thinkMatch[1].trim();
  const mainContent = rawText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();

  return { thinkingText, mainContent };
}

export const ThinkingLogViewer: React.FC<ThinkingLogViewerProps> = ({
  thinkingText,
  isStreaming = false,
}) => {
  // Auto expand during streaming, collapse after finish
  const [isExpanded, setIsExpanded] = useState(isStreaming);

  if (!thinkingText) return null;

  return (
    <div className="my-2.5 rounded-xl border border-purple-500/20 bg-purple-500/5 dark:bg-purple-950/20 text-xs overflow-hidden transition-all">
      {/* Header Bar */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3.5 py-2 flex items-center justify-between text-purple-700 dark:text-purple-300 hover:bg-purple-500/10 transition-colors select-none cursor-pointer"
      >
        <div className="flex items-center gap-2 font-medium">
          <Brain className={`w-3.5 h-3.5 text-purple-600 dark:text-purple-400 ${isStreaming ? 'animate-pulse' : ''}`} />
          <span>{isStreaming ? '深度思考推导中...' : '已深度思考 (Thinking Log)'}</span>
          <span className="text-[10px] opacity-60 font-mono">
            ({thinkingText.length} 字符)
          </span>
        </div>
        <div className="flex items-center gap-1 text-neutral-400">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-purple-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-purple-500" />
          )}
        </div>
      </button>

      {/* Expanded Content Panel */}
      {isExpanded && (
        <div className="px-3.5 py-3 border-t border-purple-500/15 text-neutral-600 dark:text-neutral-300 font-mono leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto selection:bg-purple-500/30">
          {thinkingText}
          {isStreaming && (
            <span className="inline-block w-1.5 h-3 ml-1 bg-purple-500 animate-pulse vertical-middle" />
          )}
        </div>
      )}
    </div>
  );
};
