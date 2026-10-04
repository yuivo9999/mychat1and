import React, { useMemo } from 'react';
import { Check, Circle, Loader2, AlertTriangle, PauseCircle, Bot } from 'lucide-react';
import { Message } from '../types';

type ProgressItem = {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  evidence?: string;
};

interface AgentProgressCardProps {
  message: Message;
  compact?: boolean;
}

function parseAgentProgress(content: string): ProgressItem[] | null {
  const match = content.match(/<agent_progress>\s*([\s\S]*?)\s*<\/agent_progress>/i);
  if (!match) return null;

  try {
    const raw = JSON.parse(match[1]);
    const completed = new Set(Array.isArray(raw?.completed) ? raw.completed.map(String) : []);
    const inProgress = new Set(Array.isArray(raw?.inProgress) ? raw.inProgress.map(String) : []);
    const blocked = new Map<string, string>();

    if (Array.isArray(raw?.blocked)) {
      raw.blocked.forEach((item: any) => {
        if (item?.id) blocked.set(String(item.id), typeof item.evidence === 'string' ? item.evidence : '');
      });
    }

    const evidence = new Map<string, string>();
    if (Array.isArray(raw?.evidence)) {
      raw.evidence.forEach((item: any) => {
        if (item?.id && typeof item.text === 'string') evidence.set(String(item.id), item.text);
      });
    }

    const ids = new Set<string>([...completed, ...inProgress, ...blocked.keys(), ...evidence.keys()]);
    if (!ids.size) return null;

    return Array.from(ids).map((id) => ({
      id,
      status: blocked.has(id)
        ? 'blocked'
        : completed.has(id)
          ? 'completed'
          : inProgress.has(id)
            ? 'in_progress'
            : 'pending',
      evidence: evidence.get(id) || blocked.get(id),
    }));
  } catch {
    return null;
  }
}

export const AgentProgressCard: React.FC<AgentProgressCardProps> = ({ message, compact = false }) => {
  const items = useMemo(() => parseAgentProgress(message.content), [message.content]);
  if (!items?.length) return null;

  const completed = items.filter(item => item.status === 'completed').length;
  const active = items.find(item => item.status === 'in_progress');
  const blocked = items.find(item => item.status === 'blocked');
  const hasRunningTools = message.toolCalls?.some((call: any) => call.status === 'running' || call.status === 'pending');

  const statusLabel = blocked
    ? '已阻塞'
    : message.status === 'streaming' || hasRunningTools || active
      ? '执行中'
      : completed === items.length
        ? '本轮完成'
        : '已更新';

  const statusIcon = blocked
    ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
    : statusLabel === '执行中'
      ? <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
      : statusLabel === '本轮完成'
        ? <Check className="w-3.5 h-3.5 text-emerald-500" />
        : <PauseCircle className="w-3.5 h-3.5 text-neutral-400" />;

  return (
    <section
      className="mb-2 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/70 shadow-sm overflow-hidden"
      aria-label="Agent 当前进度"
    >
      <div className="px-3 py-2 flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800">
        <Bot className="w-3.5 h-3.5 text-indigo-500" />
        <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">Agent 当前进度</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-neutral-500 dark:text-neutral-400">
          {statusIcon}
          {statusLabel}
          <span className="ml-1 font-mono">{completed}/{items.length}</span>
        </span>
      </div>

      <div className={compact ? 'px-3 py-2' : 'px-3 py-2.5'}>
        <div className="space-y-1.5">
          {items.slice(0, compact ? 4 : 7).map((item) => (
            <div key={item.id} className="flex items-start gap-2 min-w-0">
              <span className="mt-0.5 shrink-0">
                {item.status === 'completed' && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                {item.status === 'in_progress' && <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />}
                {item.status === 'blocked' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                {item.status === 'pending' && <Circle className="w-3.5 h-3.5 text-neutral-300 dark:text-neutral-600" />}
              </span>
              <span className={
                item.status === 'completed'
                  ? 'text-[10px] text-neutral-400 dark:text-neutral-500 line-through'
                  : item.status === 'blocked'
                    ? 'text-[10px] text-amber-700 dark:text-amber-300'
                    : 'text-[10px] text-neutral-600 dark:text-neutral-300'
              }>
                {item.id}
                {item.status === 'blocked' && item.evidence ? \` · \${item.evidence}\` : ''}
              </span>
            </div>
          ))}
        </div>

        {active && active.evidence && (
          <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-[10px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            <span className="font-medium text-neutral-600 dark:text-neutral-300">当前：</span>
            {active.evidence}
          </div>
        )}

        {blocked && blocked.evidence && (
          <div className="mt-2 pt-2 border-t border-amber-200/60 dark:border-amber-900/40 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">
            <span className="font-medium">需要处理：</span>
            {blocked.evidence}
          </div>
        )}
      </div>
    </section>
  );
};
