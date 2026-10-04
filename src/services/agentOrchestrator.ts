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
        const deps = item.dependsOn?.length
          ? '; 前置：' + item.dependsOn.join(', ')
          : '';
        return (index + 1) + '. [' + item.status + '] ' + item.title + deps + criteria +
          (item.evidence ? '; 证据：' + item.evidence.slice(0, 300) : '');
      }).join('\\n')
    : '尚未建立动态子任务清单；请先根据用户目标建立可验证计划。';

  const definitionOfDone = plan
    ? plan.definitionOfDone.map(item => '- ' + item).join('\\n')
    : '- 完成用户明确提出的主要目标';

  const nextTask = plan ? getNextExecutableAgentTask(plan) : null;
  const blockedTasks = plan ? getBlockedAgentTasks(plan) : [];
  const nextTaskText = nextTask
    ? nextTask.id + '：' + nextTask.title
    : (blockedTasks.length ? '当前没有可执行子任务，必须先完成前置依赖。' : '没有剩余可执行子任务。');
  const blockedText = blockedTasks.length
    ? blockedTasks.map(entry => entry.item.id + ' 等待：' + entry.blockedBy.join(', ')).join('；')
    : '无';

  return '[Agent 阶段推进指令]\\n' +
    '第 ' + (state.round + 1) + '/' + state.maxRounds + ' 轮 · 当前阶段：' + getAgentPhaseLabel(state.phase) + '\\n\\n' +
    getAgentPhaseInstruction(state) + '\\n\\n' +
    '## 当前任务目标\\n' + (plan?.goal || '未明确') + '\\n\\n' +
    '## Definition of Done\\n' + definitionOfDone + '\\n\\n' +
    '## 动态子任务清单\\n' + checklist + '\\n\\n' +
    '## 依赖调度\\n下一项可执行任务：' + nextTaskText + '\\n被依赖阻塞：' + blockedText + '\\n\\n' +
    '上一轮工具结果：\\n' + toolResults + '\\n\\n' +\n    buildAgentReplanPrompt(plan || createAgentTaskPlan('未明确任务'), '结合上一轮工具结果判断当前计划是否仍然成立') + '\\n\\n' +
    '请根据真实证据决定下一步：\\n' +
    '1. 优先执行“下一项可执行任务”；如果任务有未完成 dependsOn，不得抢跑；\\n' +
    '2. 每完成一个子任务，必须让其 acceptanceCriteria 有真实证据支撑；\\n' +
    '3. 修改后必须优先验证；\\n' +
    '4. 验证失败 → 定位根因、修复、再验证；\\n' +
    '5. 所有 required 子任务和 Definition of Done 都满足后，才停止调用工具并总结；\\n' +
    '6. 只有确实缺少用户才能提供的信息才进入等待用户，不要因为“暂停一下”而人为停止任务。\\n' +
    '\\n每轮结束时必须输出一个 <agent_progress> JSON；只报告有真实证据支持的状态，不要猜测。\\n' +
    '格式固定为：<agent_progress>{"round":本轮编号,"maxRounds":最大轮数,"phase":"planning|exploring|implementing|verifying|fixing|reverifying|memory_audit|waiting_user|completed","status":"running|blocked|waiting_user|completed","summary":"本轮最核心进展","currentStep":"当前正在做什么","result":"本轮真实结果","nextStep":"下一步","completed":["已完成子任务ID"],"inProgress":["正在执行子任务ID"],"blocked":[{"id":"阻塞子任务ID","evidence":"阻塞证据"}],"evidence":[{"id":"子任务ID","text":"真实证据"}]}<\\/agent_progress>。\\n\\n' +
    '## 用户可见的 Agent 核心进度输出协议（重要）\\n' +
    '当前已启用“核心内容 + 操作步骤”式 Agent 进度表达。你给用户看的自然语言回复必须是高信息密度的工作快照，而不是长篇过程记录。\\n' +
    '固定优先顺序：\\n' +
    '【当前状态】一句话说明现在处于什么阶段、这一轮发生了什么。\\n' +
    '【核心内容】1-3 句话说明本轮最重要的发现、判断、修改结果或验证结果。\\n' +
    '【操作步骤】列出本轮实际完成或正在执行的关键步骤，使用 1、2、3…；不要把内部推理过程写给用户。\\n' +
    '【结果】明确写“已完成 / 验证通过 / 发现问题 / 被阻塞”等真实结果；没有结果时不要编造。\\n' +
    '【下一步】只写接下来真正要做的一步或两步，让用户一眼知道 Agent 正在往哪里走。\\n' +
    '每轮只突出增量信息：已经在上一轮说过且没有变化的内容不要重复；文件修改、验证结果、错误、阻塞、重要决策必须保留。\\n' +
    '验证失败时优先表达为“问题 → 原因/证据 → 已采取动作 → 下一步”；等待用户时优先表达为“已完成什么 → 为什么必须等你 → 需要你提供/决定什么”。\\n' +
    '如果任务已经完成，只输出最终完成状态、关键成果、验证结果和必要的后续建议，不再输出无意义的阶段过程。';
}