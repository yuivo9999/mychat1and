export type AgentPhase =
  | 'planning'
  | 'exploring'
  | 'implementing'
  | 'verifying'
  | 'fixing'
  | 'reverifying'
  | 'memory_audit'
  | 'completed'
  | 'waiting_user';

export type AgentProgressKind =
  | 'plan'
  | 'explore'
  | 'implement'
  | 'verify'
  | 'fix'
  | 'reverify'
  | 'memory'
  | 'idle';

export interface AgentLoopState {
  phase: AgentPhase;
  round: number;
  phaseRound: number;
  maxRounds: number;
  noProgressRounds: number;
  progressKind: AgentProgressKind;
}

export interface AgentTaskPlan {
  goal: string;
  definitionOfDone: string[];
  checklist: AgentTaskChecklistItem[];
}

export interface AgentTaskChecklistItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  required?: boolean;
  acceptanceCriteria?: string[];
  evidence?: string;
}

const MAX_DYNAMIC_CHECKLIST_ITEMS = 8;

function normalizePlanString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizePlanStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .filter(item => typeof item === 'string' && item.trim())
    .map(item => item.trim())
    .slice(0, 8);
  return items.length > 0 ? items : fallback;
}

export function buildAgentTaskPlanPrompt(goal: string): string {
  return '[Agent 动态任务规划协议]\\n' +
    '用户目标：\\n' + goal + '\\n\\n' +
    '你现在需要把“用户真正想完成的事情”拆成可验证的执行计划。不要把阶段名称当成子任务，也不要泛化成“做完并测试”。\\n' +
    '请输出一个机器可读的规划块：\\n\\n' +
    '<agent_plan>\\n' +
    '{\\n' +
    '  "goal": "一句话准确描述最终目标",\\n' +
    '  "definitionOfDone": ["3-8 条可验证的最终完成条件"],\\n' +
    '  "checklist": [{"id":"简短稳定ID","title":"具体子任务","required":true,"acceptanceCriteria":["可验证事实"]}]\\n' +
    '}\\n' +
    '</agent_plan>\\n\\n' +
    '要求：\\n' +
    '1. checklist 最多 ' + MAX_DYNAMIC_CHECKLIST_ITEMS + ' 项，按真实依赖顺序排列；\\n' +
    '2. 每项必须是具体可执行/可验证的工作；\\n' +
    '3. acceptanceCriteria 必须能通过代码、工具输出、运行结果或明确用户输入验证；\\n' +
    '4. 不确定的事实不要编造，先写成需要探索验证的条件；\\n' +
    '5. 规划完成后继续正常 Agent 工作，不要因为输出规划块就结束任务。';
}

export function parseAgentTaskPlan(text: string, fallbackGoal: string): AgentTaskPlan | null {
  const match = text.match(/<agent_plan>\s*([\s\S]*?)\s*<\/agent_plan>/i);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[1]);
    if (!raw || typeof raw !== 'object') return null;
    const checklistRaw = Array.isArray(raw.checklist) ? raw.checklist : [];
    const checklist = checklistRaw
      .filter((item: any) => item && typeof item.title === 'string' && item.title.trim())
      .slice(0, MAX_DYNAMIC_CHECKLIST_ITEMS)
      .map((item: any, index: number) => ({
        id: normalizePlanString(item.id, 'task_' + (index + 1)),
        title: item.title.trim(),
        status: index === 0 ? 'in_progress' as const : 'pending' as const,
        required: item.required !== false,
        acceptanceCriteria: normalizePlanStringList(item.acceptanceCriteria, []),
      }));
    if (checklist.length === 0) return null;
    return {
      goal: normalizePlanString(raw.goal, fallbackGoal),
      definitionOfDone: normalizePlanStringList(raw.definitionOfDone, [
        '完成用户明确提出的主要目标',
        '修改基于真实工作区代码与运行时证据，而不是猜测',
        '修改后完成针对性的真实验证',
      ]),
      checklist,
    };
  } catch {
    return null;
  }
}

export function stripAgentPlanBlock(text: string): string {
  return text.replace(/<agent_plan>\s*[\s\S]*?\s*<\/agent_plan>/gi, '').trim();
}

export function applyAgentTaskProgress(plan: AgentTaskPlan, text: string): AgentTaskPlan {
  const match = text.match(/<agent_progress>\s*([\s\S]*?)\s*<\/agent_progress>/i);
  if (!match) return plan;
  try {
    const raw = JSON.parse(match[1]);
    const completed = new Set(Array.isArray(raw?.completed) ? raw.completed.map(String) : []);
    const inProgress = new Set(Array.isArray(raw?.inProgress) ? raw.inProgress.map(String) : []);
    const blocked = new Map<string, string>();
    if (Array.isArray(raw?.blocked)) {
      raw.blocked.forEach((item: any) => {
        if (item && item.id) blocked.set(String(item.id), typeof item.evidence === 'string' ? item.evidence : '');
      });
    }
    const evidence = new Map<string, string>();
    if (Array.isArray(raw?.evidence)) {
      raw.evidence.forEach((item: any) => {
        if (item && item.id && typeof item.text === 'string') evidence.set(String(item.id), item.text.slice(0, 500));
      });
    }
    return {
      ...plan,
      checklist: plan.checklist.map(item => {
        const nextEvidence = evidence.get(item.id) || blocked.get(item.id) || item.evidence;
        if (blocked.has(item.id)) return { ...item, status: 'blocked' as const, evidence: nextEvidence };
        if (completed.has(item.id)) return { ...item, status: 'completed' as const, evidence: nextEvidence };
        if (inProgress.has(item.id)) return { ...item, status: 'in_progress' as const, evidence: nextEvidence };
        return nextEvidence ? { ...item, evidence: nextEvidence } : item;
      }),
    };
  } catch {
    return plan;
  }
}

export function stripAgentProgressBlock(text: string): string {
  return text.replace(/<agent_progress>\s*[\s\S]*?\s*<\/agent_progress>/gi, '').trim();
}

export function areAgentTaskRequirementsMet(plan: AgentTaskPlan): boolean {
  return plan.checklist
    .filter(item => item.required !== false)
    .every(item => item.status === 'completed');
}

export function createAgentTaskPlan(goal: string): AgentTaskPlan {
  return {
    goal,
    definitionOfDone: [
      '完成用户明确提出的主要目标',
      '修改基于真实工作区代码与运行时证据，而不是猜测',
      '修改后完成至少一次针对性的验证',
      '验证失败时定位并修复可控问题，或明确记录真实阻塞原因',
      '在没有剩余可执行步骤时再结束 Agent 任务',
    ],
    checklist: [
      { id: 'understand', title: '理解任务与完成条件', status: 'in_progress' },
      { id: 'inspect', title: '检查工作区与相关代码', status: 'pending' },
      { id: 'implement', title: '完成必要的代码/配置修改', status: 'pending' },
      { id: 'verify', title: '执行真实验证', status: 'pending' },
      { id: 'fix', title: '处理验证发现的问题', status: 'pending' },
      { id: 'reverify', title: '再次验证并确认完成条件', status: 'pending' },
      { id: 'memory', title: '审计可长期复用的项目记忆', status: 'pending' },
    ],
  };
}

export function updateAgentTaskChecklist(
  plan: AgentTaskPlan,
  state: AgentLoopState,
  evidence?: string,
): AgentTaskPlan {
  const isDynamicPlan = plan.checklist.some(item => (item.acceptanceCriteria?.length || 0) > 0);
  if (isDynamicPlan) {
    if (state.phase === 'completed') {
      return {
        ...plan,
        checklist: plan.checklist.map(item => ({ ...item, status: 'completed' as const, evidence: evidence || item.evidence })),
      };
    }
    if (state.phase === 'waiting_user') {
      const activeIndex = plan.checklist.findIndex(item => item.status === 'in_progress');
      if (activeIndex >= 0) {
        return {
          ...plan,
          checklist: plan.checklist.map((item, index) =>
            index === activeIndex ? { ...item, status: 'blocked' as const, evidence: evidence || item.evidence } : item
          ),
        };
      }
    }
    return plan;
  }

  const order: Array<[string, AgentPhase]> = [
    ['understand', 'planning'],
    ['inspect', 'exploring'],
    ['implement', 'implementing'],
    ['verify', 'verifying'],
    ['fix', 'fixing'],
    ['reverify', 'reverifying'],
    ['memory', 'memory_audit'],
  ];
  const phaseIndex = order.findIndex(([, phase]) => phase === state.phase);
  const completedThrough = phaseIndex - 1;
  const checklist = plan.checklist.map((item, index) => {
    if (state.phase === 'completed') return { ...item, status: 'completed' as const, evidence: evidence || item.evidence };
    if (state.phase === 'waiting_user' && index === Math.max(0, phaseIndex)) return { ...item, status: 'blocked' as const, evidence: evidence || item.evidence };
    if (index < completedThrough) return { ...item, status: 'completed' as const };
    if (index === phaseIndex) return { ...item, status: 'in_progress' as const, evidence: evidence || item.evidence };
    return item;
  });
  return { ...plan, checklist };
}

export function getAgentTaskStepText(state: AgentLoopState): { currentStep: string; nextStep: string } {
  switch (state.phase) {
    case 'planning': return { currentStep: '确认任务目标与完成条件', nextStep: '检查工作区与相关代码' };
    case 'exploring': return { currentStep: '检查真实代码、依赖与运行时事实', nextStep: '实施必要修改' };
    case 'implementing': return { currentStep: '实施必要的代码/配置修改', nextStep: '执行真实验证' };
    case 'verifying': return { currentStep: '执行项目检查并收集结果', nextStep: '必要时修复验证失败' };
    case 'fixing': return { currentStep: '定位验证失败根因并修复', nextStep: '再次验证修复结果' };
    case 'reverifying': return { currentStep: '再次验证并确认完成条件', nextStep: '审计长期项目记忆并结束' };
    case 'memory_audit': return { currentStep: '审计稳定、可复用的项目记忆', nextStep: '确认任务完成并总结' };
    case 'waiting_user': return { currentStep: '等待不可推断的用户决策或外部输入', nextStep: '收到输入后继续当前任务' };
    default: return { currentStep: '任务收尾', nextStep: '总结并结束' };
  }
}

const SEARCH_TOOLS = new Set([
  'list_files',
  'get_workspace_tree',
  'read_file',
  'search_files',
  'search_code',
  'get_file_diff',
  'get_workspace_diff',
  'inspect_project',
  'check_runtime',
  'query_context7_docs',
  'search_local_memory',
  'get_project_memory',
]);

const WRITE_TOOLS = new Set([
  'patch_file',
  'write_file',
  'create_file',
  'delete_file',
  'rename_file',
]);

const VERIFY_TOOLS = new Set([
  'run_project_check',
  'run_command',
  'run_python',
]);

export function createAgentLoopState(maxRounds = 12): AgentLoopState {
  return {
    phase: 'planning',
    round: 0,
    phaseRound: 0,
    maxRounds,
    noProgressRounds: 0,
    progressKind: 'plan',
  };
}

export function classifyAgentProgress(toolNames: string[], validationFailed: boolean): AgentProgressKind {
  if (validationFailed || toolNames.some(name => VERIFY_TOOLS.has(name))) return validationFailed ? 'fix' : 'verify';
  if (toolNames.some(name => WRITE_TOOLS.has(name))) return 'implement';
  if (toolNames.some(name => SEARCH_TOOLS.has(name))) return 'explore';
  return 'idle';
}

export function advanceAgentLoopState(
  state: AgentLoopState,
  progressKind: AgentProgressKind,
  hasMeaningfulProgress: boolean,
): AgentLoopState {
  const next: AgentLoopState = {
    ...state,
    round: state.round + 1,
    phaseRound: state.phaseRound + 1,
    progressKind,
    noProgressRounds: hasMeaningfulProgress ? 0 : state.noProgressRounds + 1,
  };

  if (progressKind === 'memory') {
    next.phase = 'memory_audit';
    return next;
  }

  if (progressKind === 'implement') {
    next.phase = 'implementing';
  } else if (progressKind === 'verify') {
    next.phase = 'verifying';
  } else if (progressKind === 'fix') {
    next.phase = state.phase === 'verifying' || state.phase === 'reverifying' ? 'fixing' : 'fixing';
  } else if (progressKind === 'explore' && state.phase === 'planning') {
    next.phase = 'exploring';
  }

  // Once verification follows implementation, the next successful verification enters
  // a lightweight re-verification state rather than starting exploration again.
  if (state.phase === 'verifying' && progressKind === 'verify' && hasMeaningfulProgress) {
    next.phase = 'reverifying';
  }

  return next;
}

export function getAgentPhaseInstruction(state: AgentLoopState): string {
  switch (state.phase) {
    case 'planning':
      return '当前阶段：规划。先确认任务目标、工作区边界、完成条件与最小修改范围；不要急于盲改。';
    case 'exploring':
      return '当前阶段：探索。优先搜索/读取真实代码、调用关系、依赖与运行时事实；证据不足就继续查阅，不要凭空猜测。';
    case 'implementing':
      return '当前阶段：实施。基于已经取得的证据进行精确、多文件协同修改；修改后不要立即结束，准备进入验证。';
    case 'verifying':
      return '当前阶段：验证。优先执行真实项目检查或运行验证；把 stdout/stderr/退出码当作证据。';
    case 'fixing':
      return '当前阶段：修复。只针对最近一次验证或工具错误的根因修改，不要重复相同失败动作。';
    case 'reverifying':
      return '当前阶段：再验证。确认修复没有引入新的错误，并检查任务完成条件是否全部满足。';
    case 'memory_audit':
      return '当前阶段：项目记忆审计。只保存稳定、可复用的项目级决定；普通进度和临时报错不要写入长期记忆。';
    case 'waiting_user':
      return '当前阶段：等待用户。只有缺少不可推断的用户决策、权限或外部输入时才暂停；如果任务仍可自主推进，不要等待。';
    case 'completed':
      return '任务完成：不要继续无意义地调用工具。';
  }
}

export function getAgentPhaseLabel(phase: AgentPhase): string {
  const labels: Record<AgentPhase, string> = {
    planning: '规划',
    exploring: '探索',
    implementing: '实施',
    verifying: '验证',
    fixing: '修复',
    reverifying: '再验证',
    memory_audit: '记忆审计',
    completed: '完成',
    waiting_user: '等待用户',
  };
  return labels[phase];
}

export function getAgentPauseDelayMs(state: AgentLoopState): number {
  // A short breathing interval makes phase transitions visible in the UI without
  // pretending that the model is waiting for a human. The actual continuation is
  // automatic and still bounded by AbortController.
  if (state.phase === 'planning' || state.phase === 'exploring') return 650;
  if (state.phase === 'implementing') return 800;
  if (state.phase === 'verifying' || state.phase === 'fixing' || state.phase === 'reverifying') return 950;
  return 500;
}

export function shouldProtectAgainstNoProgress(state: AgentLoopState): boolean {
  return state.noProgressRounds >= 2;
}

export function buildAgentLoopFeedback(
  state: AgentLoopState,
  toolResults: string,
  plan?: AgentTaskPlan,
): string {
  const checklist = plan
    ? plan.checklist.map((item, index) => {
        const criteria = item.acceptanceCriteria?.length
          ? '; 验收：' + item.acceptanceCriteria.join(' / ')
          : '';
        return (index + 1) + '. [' + item.status + '] ' + item.title + criteria +
          (item.evidence ? '; 证据：' + item.evidence.slice(0, 300) : '');
      }).join('\\n')
    : '尚未建立动态子任务清单；请先根据用户目标建立可验证计划。';

  const definitionOfDone = plan
    ? plan.definitionOfDone.map(item => '- ' + item).join('\\n')
    : '- 完成用户明确提出的主要目标';

  return '[Agent 阶段推进指令]\\n' +
    '第 ' + (state.round + 1) + '/' + state.maxRounds + ' 轮 · 当前阶段：' + getAgentPhaseLabel(state.phase) + '\\n\\n' +
    getAgentPhaseInstruction(state) + '\\n\\n' +
    '## 当前任务目标\\n' + (plan?.goal || '未明确') + '\\n\\n' +
    '## Definition of Done\\n' + definitionOfDone + '\\n\\n' +
    '## 动态子任务清单\\n' + checklist + '\\n\\n' +
    '上一轮工具结果：\\n' + toolResults + '\\n\\n' +
    '请根据真实证据决定下一步：\\n' +
    '1. 优先完成当前最前面的未完成 required 子任务；\\n' +
    '2. 每完成一个子任务，必须让其 acceptanceCriteria 有真实证据支撑；\\n' +
    '3. 修改后必须优先验证；\\n' +
    '4. 验证失败 → 定位根因、修复、再验证；\\n' +
    '5. 所有 required 子任务和 Definition of Done 都满足后，才停止调用工具并总结；\\n' +
    '6. 只有确实缺少用户才能提供的信息才进入等待用户，不要因为“暂停一下”而人为停止任务。\\n' +\n    '\\n每轮结束时，如能判断子任务状态，请输出 <agent_progress> JSON；只报告有真实证据支持的 completed/inProgress/blocked 状态，不要猜测。';
}
