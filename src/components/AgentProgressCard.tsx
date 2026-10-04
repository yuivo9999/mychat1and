import React, { useMemo } from 'react';
import { Check, Circle, Loader2, AlertTriangle, PauseCircle, Bot, Play } from 'lucide-react';
import { AgentTaskState, Message } from '../types';

type ProgressItem = {
  id: string;
  title?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  evidence?: string;
};

type AgentProgressPayload = {
  round?: number;
  maxRounds?: number;
  phase?: string;
  status?: string;
  summary?: string;
  currentStep?: string;
  result?: string;
  nextStep?: string;
};

interface AgentProgressCardProps {
  message: Message;
  compact?: boolean;
  taskState?: AgentTaskState | null;
  onContinue?: (messageId: string) => void;
  onStop?: (messageId: string) => void;
}

function parseAgentProgress(content: string): { payload: AgentProgressPayload; items: ProgressItem[] } | null {
  const match = content.match(/<agent_progress>\s*([\s\S]*?)\s*<\/agent_progress>/i);
  if (!match) return null;

  try {
    const raw = JSON.parse(match[1]);
    const payload: AgentProgressPayload = {
      round: typeof raw?.round === 'number' ? raw.round : undefined,
      maxRounds: typeof raw?.maxRounds === 'number' ? raw.maxRounds : undefined,
      phase: typeof raw?.phase === 'string' ? raw.phase : undefined,
      status: typeof raw?.status === 'string' ? raw.status : undefined,
      summary: typeof raw?.summary === 'string' ? raw.summary : undefined,
      currentStep: typeof raw?.currentStep === 'string' ? raw.currentStep : undefined,
      result: typeof raw?.result === 'string' ? raw.result : undefined,
      nextStep: typeof raw?.nextStep === 'string' ? raw.nextStep : undefined,
    };
    const completed = new Set<string>(Array.isArray(raw?.completed) ? raw.completed.map(String) : []);
    const inProgress = new Set<string>(Array.isArray(raw?.inProgress) ? raw.inProgress.map(String) : []);
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

    const ids = new Set<string>([...Array.from(completed), ...Array.from(inProgress), ...Array.from(blocked.keys()), ...Array.from(evidence.keys())]);
    if (!ids.size) return null;

    return { payload, items: Array.from(ids).map((id) => ({
      id,
      status: blocked.has(id)
        ? 'blocked'
        : completed.has(id)
          ? 'completed'
          : inProgress.has(id)
            ? 'in_progress'
            : 'pending',
      evidence: evidence.get(id) || blocked.get(id),
    })) };

  } catch {
    return null;
  }
}

function buildTaskStateView(task: AgentTaskState | null): { payload: AgentProgressPayload; items: ProgressItem[] } | null {
  if (!task?.checklist?.length) return null;
  return {
    payload: {
      round: task.round,
      maxRounds: task.maxRounds,
      phase: task.phase,
      status: task.status === 'failed' ? 'blocked' : task.status === 'paused' ? 'waiting_user' : task.status,
      summary: task.progressSummary,
      currentStep: task.currentStep,
      nextStep: task.nextStep,
    },
    items: task.checklist.map(item => ({
      id: item.id,
      title: item.title,
      status: item.status,
      evidence: item.evidence,
    })),
  };
}

export const AgentProgressCard: React.FC<AgentProgressCardProps> = ({ message, compact = false, taskState: providedTaskState, onContinue, onStop }) => {
  const parsed = useMemo(() => parseAgentProgress(message.content), [message.content]);
  const taskState = providedTaskState ?? null;

  const taskView = useMemo(() => buildTaskStateView(taskState), [taskState]);
  const view = taskView || parsed;
  if (!view?.items.length) return null;
  const { items } = view;
  const payload = {
    ...parsed?.payload,
    ...view.payload,
    summary: view.payload.summary || parsed?.payload.summary,
    currentStep: view.payload.currentStep || parsed?.payload.currentStep,
    nextStep: view.payload.nextStep || parsed?.payload.nextStep,
  };

  const completed = items.filter(item => item.status === 'completed').length;
  const active = items.find(item => item.status === 'in_progress');
  const blocked = items.find(item => item.status === 'blocked');
  const latestCompleted = [...items].reverse().find(item => item.status === 'completed' && item.evidence);
  const hasRunningTools = message.toolCalls?.some((call: any) => call.status === 'running' || call.status === 'pending');

  const progressLines = [payload.summary, payload.currentStep, payload.result, payload.nextStep]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);
  const pauseReason = taskState?.pauseReason?.trim();

  const phaseLabels: Record<string, string> = {
    planning: '规划', exploring: '探索', implementing: '实施', verifying: '验证',
    fixing: '修复', reverifying: '再验证', memory_audit: '记忆审计', waiting_user: '等待用户', completed: '完成',
  };
  const statusLabel = payload.status === 'waiting_user' || payload.phase === 'waiting_user'
    ? '等待你的指示'
    : payload.status === 'paused'
      ? '已暂停'
      : payload.status === 'stopped'
        ? '已停止'
        : payload.status === 'blocked' || blocked
          ? '已阻塞'
          : payload.status === 'completed' || payload.phase === 'completed'
            ? '已完成'
            : message.status === 'streaming' || hasRunningTools || active
              ? '执行中'
              : completed === items.length
                ? '本轮完成'
                : '已更新';

  const statusIcon = blocked
    ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
    : statusLabel === '执行中'
      ? <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
      : statusLabel === '已完成' || statusLabel === '本轮完成'
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
        {payload.round && <span className="text-[10px] font-mono text-neutral-400">第 {payload.round}/{payload.maxRounds || 12} 轮</span>}
        {payload.phase && <span className="text-[10px] text-neutral-400">· {phaseLabels[payload.phase] || payload.phase}</span>}
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-neutral-500 dark:text-neutral-400">
          {statusIcon}
          {statusLabel}
          <span className="ml-1 font-mono">{completed}/{items.length}</span>
        </span>
      </div>

      <div className={compact ? 'px-3 py-2' : 'px-3 py-2.5'}>
        {progressLines[0] && <div className="mb-2 text-[10px] leading-relaxed text-neutral-600 dark:text-neutral-300">{progressLines[0]}</div>}
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
                {item.title || item.id}
                {item.status === 'blocked' && item.evidence ? ' · ' + item.evidence : ''}
              </span>
            </div>
          ))}
        </div>

        {progressLines.slice(1).map((line, index) => {
          const label = index === 0 ? '当前：' : index === 1 ? '结果：' : '下一步：';
          return (
            <div key={label + line} className="mt-2 text-[10px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              <span className="font-medium text-neutral-600 dark:text-neutral-300">{label}</span>{line}
            </div>
          );
        })}
        {payload.status !== 'completed' && payload.status !== 'stopped' && (
          <div className="mt-2 flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            {pauseReason && <span className="mr-auto text-[10px] text-neutral-500 dark:text-neutral-400">需要你的指示才能继续</span>}
            {onStop && <button type="button" onClick={() => onStop(message.id)} className="inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-medium border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300">结束任务</button>}
            {(payload.status === 'waiting_user' || payload.status === 'paused') && onContinue && (
              <button
                type="button"
                onClick={() => onContinue(message.id)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium bg-indigo-500 text-white active:scale-95 transition-transform"
              >
                <Play className="w-3 h-3" />
                继续执行
              </button>
            )}
          </div>
        )}

        {(payload.status === 'waiting_user' || payload.status === 'paused') && pauseReason && (
          <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-[10px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            <span className="font-medium text-neutral-600 dark:text-neutral-300">暂停原因：</span>{pauseReason}
          </div>
        )}

        {latestCompleted && !active && (
          <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-[10px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            <span className="font-medium text-neutral-600 dark:text-neutral-300">最新完成：</span>{latestCompleted.evidence}
          </div>
        )}

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
