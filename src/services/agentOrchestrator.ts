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

const PHASE_ORDER: AgentPhase[] = [
  'planning',
  'exploring',
  'implementing',
  'verifying',
  'fixing',
  'reverifying',
  'memory_audit',
];

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
): string {
  return `[Agent 阶段推进指令]
第 ${state.round + 1}/${state.maxRounds} 轮 · 当前阶段：${getAgentPhaseLabel(state.phase)}

${getAgentPhaseInstruction(state)}

上一轮工具结果：
${toolResults}

请根据真实证据决定下一步：
1. 有未完成目标且可以自主推进 → 继续调用最相关工具；
2. 修改后必须优先验证；
3. 验证失败 → 定位根因、修复、再验证；
4. 已满足完成条件 → 停止调用工具并总结；
5. 只有确实缺少用户才能提供的信息才进入等待用户，不要因为“暂停一下”而人为停止任务。
`;
}
