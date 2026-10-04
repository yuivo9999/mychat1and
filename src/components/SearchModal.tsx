import React, { useState, useMemo } from 'react';
import { Search, X, MessageSquare, Calendar, ChevronRight } from 'lucide-react';
import { Conversation, ModelItem } from '../types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  models: ModelItem[];
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  conversations,
  onSelectConversation,
  models,
}) => {
  const [query, setQuery] = useState('');

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();

    const matches: Array<{
      conv: Conversation;
      matchedIn: 'title' | 'user' | 'assistant';
      snippet: string;
    }> = [];

    for (const conv of conversations) {
      // Check title
      if (conv.title.toLowerCase().includes(q)) {
        matches.push({
          conv,
          matchedIn: 'title',
          snippet: conv.title,
        });
        continue;
      }

      // Check messages
      let foundInMsg = false;
      for (const msg of conv.messages) {
        const text = msg.content.toLowerCase();
        const index = text.indexOf(q);
        if (index !== -1) {
          const start = Math.max(0, index - 25);
          const end = Math.min(msg.content.length, index + q.length + 35);
          const snippet = (start > 0 ? '...' : '') + msg.content.slice(start, end) + (end < msg.content.length ? '...' : '');

          matches.push({
            conv,
            matchedIn: msg.role === 'user' ? 'user' : 'assistant',
            snippet,
          });
          foundInMsg = true;
          break;
        }
      }
    }

    return matches;
  }, [query, conversations]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-20 p-4 select-none">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[75vh]">
        {/* Search Input Bar */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-3">
          <Search className="w-5 h-5 text-neutral-400 shrink-0" />
          <input
            type="text"
            placeholder="搜索聊天标题、你的提问或 AI 的回答内容..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 outline-hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            ESC
          </button>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-2 flex-1 divide-y divide-neutral-100 dark:divide-neutral-800/60">
          {!query.trim() ? (
            <div className="p-8 text-center text-xs text-neutral-400">
              输入关键词，检索全部本地对话与历史回答
            </div>
          ) : searchResults.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400">
              未找到与 &quot;{query}&quot; 相关的对话记录
            </div>
          ) : (
            searchResults.map(({ conv, matchedIn, snippet }, idx) => {
              const model = models.find(m => m.id === conv.modelId);
              return (
                <div
                  key={`${conv.id}_${idx}`}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    onClose();
                  }}
                  className="p-3 hover:bg-neutral-100/80 dark:hover:bg-neutral-800/70 rounded-2xl cursor-pointer transition flex items-center justify-between group"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span className="font-semibold text-xs text-neutral-900 dark:text-neutral-100 truncate">
                        {conv.title}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
                        {model?.name || conv.modelId}
                      </span>
                    </div>

                    <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">
                      <span className="text-[10px] font-medium mr-1 text-indigo-600 dark:text-indigo-400">
                        [{matchedIn === 'title' ? '标题匹配' : matchedIn === 'user' ? '用户提问' : 'AI 回答'}]:
                      </span>
                      {snippet}
                    </p>

                    <div className="flex items-center gap-1 text-[10px] text-neutral-400 mt-1">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(conv.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
