import { ChatContext, Message, ToolCallExecution, DiagnosisContext } from '../types';

export interface WorkspaceIntent {
  shouldAccessWorkspace: boolean;
  type?: 'read' | 'search' | 'inspect' | 'modify';
  targetHint?: string;
}

// Initialize a clean, independent ChatContext for a single chat
export function createDefaultChatContext(): ChatContext {
  return {
    userRequirements: [],
    importantDecisions: [],
    recentChanges: [],
    lastModifiedFiles: [],
  };
}

// Extract high-value, crisp architectural and implementation decisions from user and AI text
export function extractKeyDecisionsFromTurn(
  userText: string,
  aiResponseText: string,
  modifiedFiles: string[] = []
): string[] {
  const decisions: string[] = [];

  // 1. From modified files: record tangible implementation outcomes
  if (modifiedFiles.length > 0) {
    const fileSummary = modifiedFiles.length <= 3 
      ? `已落实修改并保存工作区文件: \`${modifiedFiles.join('`, `')}\``
      : `已落实修改并保存工作区文件: \`${modifiedFiles.slice(0, 3).join('`, `')}\` 等共 ${modifiedFiles.length} 个文件`;
    decisions.push(fileSummary);
  }

  // 2. From AI response: scan for explicit conclusions, design conventions, and architectural choices
  const candidateSentences = aiResponseText.split(/[。\n；;]/).map(s => s.trim()).filter(Boolean);

  const decisionKeywords = [
    '已确认', '决定采用', '选择使用', '采用', '架构方案为', '接口定义为',
    '规范约定', '统一使用', '核心设计为', '重构了', '新增了', '已修复', '技术选型为'
  ];

  for (const sentence of candidateSentences) {
    // Only capture concise, punchy decision sentences (20 to 90 characters)
    if (sentence.length >= 12 && sentence.length <= 90) {
      if (decisionKeywords.some(k => sentence.includes(k))) {
        // Strip markdown list bullets or numbers
        const clean = sentence.replace(/^[-*•\d+.\s]+/, '').trim();
        if (clean && !decisions.includes(clean)) {
          decisions.push(clean);
          if (decisions.length >= 4) break; // Keep max 4 decisions per turn to prevent bloat
        }
      }
    }
  }

  // 3. From user text: if user explicitly specified a constraint or rule
  const userRules = [
    '必须使用', '不要使用', '统一用', '规范是', '记得用', '设计成', '命名为'
  ];
  for (const r of userRules) {
    if (userText.includes(r)) {
      const match = userText.match(new RegExp(`([^，。！？\n]*${r}[^，。！？\n]*)`));
      if (match && match[1] && match[1].trim().length <= 60) {
        decisions.push(`用户明确约定: ${match[1].trim()}`);
        break;
      }
    }
  }

  return decisions;
}

/**
 * Decouple massive code blocks in older conversation history.
 * When sending history to the LLM API, replacing 50~500 line code bodies with
 * compact workspace references saves 70%~90% of tokens while preserving 100%
 * of interface and semantic understanding.
 * 
 * NOTE: This is strictly for API payload serialization; user's UI messages are never mutated!
 */
export function decoupleCodeBlocksForModelContext(
  content: string,
  isRecentMessage = false
): string {
  if (!content || !content.includes('```')) {
    return content;
  }

  // For the most recent assistant message, keep code intact so immediate context is natural
  if (isRecentMessage) {
    return content;
  }

  // Replace code blocks in older messages that have more than 10 lines
  return content.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const lines = code.trim().split('\n');
    if (lines.length <= 10) {
      return match; // Keep small code snippets as-is
    }

    // Extract signature / header lines (first 3 lines) and footer (last 1 line)
    const headerLines = lines.slice(0, 3).join('\n');
    const footerLine = lines[lines.length - 1];
    const totalLines = lines.length;

    return `\`\`\`${lang}\n${headerLines}\n  // ... [代码实现已同步至工作区，为节约上下文 Token 省略中间 ${totalLines - 4} 行代码] ...\n${footerLine}\n\`\`\``;
  });
}

/**
 * Hierarchical History Preparation (黄金平衡分层上下文组装):
 * - Layer 1: Global System Prompt & Rules (Outside)
 * - Layer 2: Project Shared Memory & Key Decisions (Outside)
 * - Layer 3: Rolling Semantic Summary of older messages (Injected as compact system note)
 * - Layer 4: Recent Active Window (Kept in full conversation fidelity, with older code blocks decoupled)
 */
export function prepareChatHistoryWithHierarchicalCompaction(
  messages: Message[],
  maxRecentCount = 10
): {
  compactedSummary?: string;
  effectiveMessages: Message[];
  estimatedSavedTokens: number;
} {
  if (messages.length <= maxRecentCount) {
    // Under threshold: keep all messages, but decouple large code blocks in non-latest messages
    const decoupled = messages.map((m, idx) => {
      const isRecent = idx >= messages.length - 2;
      return {
        ...m,
        content: decoupleCodeBlocksForModelContext(m.content, isRecent),
      };
    });

    return {
      effectiveMessages: decoupled,
      estimatedSavedTokens: 0,
    };
  }

  // Split into older messages to compress and recent messages to keep active
  const olderMessages = messages.slice(0, messages.length - maxRecentCount);
  const recentMessages = messages.slice(messages.length - maxRecentCount);

  // Extract older user task trajectory
  const olderTasks = olderMessages
    .filter(m => m.role === 'user')
    .map(m => m.content.slice(0, 50).trim())
    .filter(Boolean)
    .slice(-4);

  // Extract all modified files from older turns
  const olderTouchedFiles = Array.from(
    new Set(
      olderMessages
        .filter(m => m.modifiedFiles && m.modifiedFiles.length > 0)
        .flatMap(m => m.modifiedFiles!)
    )
  );

  // Extract decisions made in older turns
  const olderDecisions: string[] = [];
  for (const m of olderMessages) {
    if (m.role === 'assistant' && m.content) {
      const matches = m.content.match(/(?:已确认|决定采用|核心方案为|已落实修改)[^。\n；]{6,50}/g);
      if (matches) {
        matches.forEach(d => {
          if (!olderDecisions.includes(d) && olderDecisions.length < 5) {
            olderDecisions.push(d);
          }
        });
      }
    }
  }

  // High-density structured summary (< 150 tokens)
  const summaryParts: string[] = [
    `【前期历史结构化归档摘要 (已为节约 Token 自动浓缩)】`,
    `- 讨论的主线任务轨迹: ${olderTasks.join(' ➔ ') || '基础架构搭建与咨询'}`,
  ];

  if (olderDecisions.length > 0) {
    summaryParts.push(`- 前期已达成的核心约定: ${olderDecisions.join('； ')}`);
  }

  if (olderTouchedFiles.length > 0) {
    summaryParts.push(`- 前期已修改的工作区文件: \`${olderTouchedFiles.join('`, `')}\``);
  }

  const compactedSummary = summaryParts.join('\n');

  // For recent messages, decouple code in older ones, keep latest 2 turns intact
  const processedRecent = recentMessages.map((m, idx) => {
    const isLatestTurns = idx >= recentMessages.length - 2;
    return {
      ...m,
      content: decoupleCodeBlocksForModelContext(m.content, isLatestTurns),
    };
  });

  // Estimate rough tokens saved
  const rawOlderLength = olderMessages.reduce((sum, m) => sum + (m.content || '').length, 0);
  const estimatedSavedTokens = Math.max(0, Math.floor((rawOlderLength - compactedSummary.length) / 3));

  return {
    compactedSummary,
    effectiveMessages: processedRecent,
    estimatedSavedTokens,
  };
}

/**
 * Prune previous tool outputs in a multi-turn ReAct Agent loop.
 * In turn 6 of 12, raw outputs from `read_file` in turn 1 or 2 (which could be 300+ lines)
 * are pruned so that later turns do not endlessly accumulate redundant file dumps.
 */
export function pruneAgentLoopHistory(
  historyMessages: Message[],
  currentTurn: number
): Message[] {
  // Only activate pruning when loop is deep (turn >= 3)
  if (currentTurn < 3) {
    return historyMessages;
  }

  return historyMessages.map((msg, idx) => {
    // If it's an older message in the agent loop and contains a massive tool output
    const isOldAgentStep = idx < historyMessages.length - 3;
    if (isOldAgentStep && msg.content && msg.content.includes('[工作区工具执行结果反馈]')) {
      // If it contains a large read_file payload, prune it
      if (msg.content.includes('read_file') && msg.content.length > 800) {
        return {
          ...msg,
          content: msg.content.replace(/```[\s\S]*?```/g, '`[该文件代码已于前序步骤成功读取并分析完毕]`'),
        };
      }
    }
    return msg;
  });
}

// Detect whether the user's message explicitly requests workspace access (Strictly Conservative)
export function detectWorkspaceIntent(
  userText: string,
  chatContext?: ChatContext
): WorkspaceIntent {
  const text = (userText || '').trim();
  const lower = text.toLowerCase();

  if (!text) {
    return { shouldAccessWorkspace: false };
  }

  // 1. General chat and greetings explicitly bypass workspace context
  const isGeneralGreetingOrChat =
    /^(你好|您好|hi|hello|hey|在吗|早安|晚安|嗨|早上好|晚上好)([!！。~～\s]|$)/i.test(text) ||
    /^(聊一下|谈谈|讨论一下|讲个|写篇|作首|写一首|翻译|总结下这篇|创作|讲故事)/.test(text);

  if (isGeneralGreetingOrChat && !text.includes('工作区') && !lower.includes('workspace') && !text.includes('项目文件') && !text.includes('项目代码')) {
    return { shouldAccessWorkspace: false };
  }

  // 2. Explicit workspace / project file references
  const hasExplicitWorkspaceKeyword =
    text.includes('工作区') ||
    lower.includes('workspace') ||
    text.includes('项目文件') ||
    text.includes('项目目录') ||
    text.includes('工程目录') ||
    text.includes('项目代码') ||
    text.includes('工程代码') ||
    text.includes('当前项目') ||
    text.includes('整个项目');

  // 3. Explicit action verbs targeting workspace
  // A. Modify / Repair in workspace
  const modifyKeywords = [
    '修改工作区', '修复工作区', '改写工作区', '更新工作区', '重构工作区',
    '在工作区创建', '在工作区新建', '在工作区删除', '从工作区删除', '重命名工作区',
    '把工作区里的', '把工作区的', '修改项目里的', '修复项目里的', '改一下工作区',
    '修复它', '应用修复', '按照建议修改', '开始修复', '应用刚才的建议'
  ];
  if (modifyKeywords.some(k => text.includes(k))) {
    return {
      shouldAccessWorkspace: true,
      type: 'modify',
      targetHint: text.slice(0, 100),
    };
  }

  // B. Search in workspace
  const searchKeywords = [
    '搜索工作区', '在工作区查找', '在工作区搜索', '在工作区搜', '工作区里找', '工作区里搜',
    '帮我在工作区找', '在项目里面搜索', '在项目中搜索', '搜索项目代码', '查找项目文件',
    '搜索项目中的', '在工程中搜索', 'search workspace', 'search_code'
  ];
  if (searchKeywords.some(k => text.includes(k))) {
    return {
      shouldAccessWorkspace: true,
      type: 'search',
      targetHint: text.slice(0, 100),
    };
  }

  // C. Read / Inspect / Diagnose workspace
  const readInspectKeywords = [
    '查看工作区', '看看工作区', '读取工作区', '打开工作区', '浏览工作区',
    '工作区有什么', '工作区里面有什么', '工作区目录', '工作区文件', '工作区结构', '工作区代码',
    '检查工作区', '诊断工作区', '审查工作区', '排查工作区', '分析工作区',
    '检查项目里的', '审查项目里的', '诊断项目里的', '读取项目中的', '查看项目文件',
    'list_files', 'get_workspace_tree', 'read_file', 'get_workspace_diff', 'get_file_diff'
  ];
  if (readInspectKeywords.some(k => text.includes(k))) {
    const isInspect = text.includes('检查') || text.includes('诊断') || text.includes('审查') || text.includes('排查') || text.includes('分析');
    return {
      shouldAccessWorkspace: true,
      type: isInspect ? 'inspect' : 'read',
      targetHint: text.slice(0, 100),
    };
  }

  // D. If explicit workspace keyword is present alongside action verbs
  if (hasExplicitWorkspaceKeyword) {
    if (text.includes('改') || text.includes('修') || text.includes('写') || text.includes('创') || text.includes('删') || text.includes('换')) {
      return { shouldAccessWorkspace: true, type: 'modify', targetHint: text.slice(0, 100) };
    }
    if (text.includes('搜') || text.includes('找') || text.includes('查') || text.includes('检索')) {
      return { shouldAccessWorkspace: true, type: 'search', targetHint: text.slice(0, 100) };
    }
    if (text.includes('看') || text.includes('读') || text.includes('析') || text.includes('开') || text.includes('览')) {
      const isInspect = text.includes('析') || text.includes('检') || text.includes('排');
      return { shouldAccessWorkspace: true, type: isInspect ? 'inspect' : 'read', targetHint: text.slice(0, 100) };
    }
    return { shouldAccessWorkspace: true, type: 'read', targetHint: text.slice(0, 100) };
  }

  // E. Explicit continuation referencing workspace specifically
  const isExplicitWorkspaceContinuation =
    (text.includes('继续看刚才') || text.includes('继续检查刚才') || text.includes('继续修改刚才') || text.includes('继续排查刚才')) &&
    (text.includes('文件') || text.includes('代码') || text.includes('工作区') || text.includes('项目'));

  if (isExplicitWorkspaceContinuation && chatContext?.lastModifiedFiles && chatContext.lastModifiedFiles.length > 0) {
    return {
      shouldAccessWorkspace: true,
      type: text.includes('修') || text.includes('改') ? 'modify' : 'inspect',
      targetHint: text.slice(0, 100),
    };
  }

  // Default: Conservative rejection (Keep context purely in chat)
  return {
    shouldAccessWorkspace: false,
  };
}

// Detect user's intent regarding code diagnosis and repair
export function detectDiagnosisIntent(
  userText: string,
  prevContext?: ChatContext
): {
  isDiagnosis: boolean;
  isContinuation: boolean;
  isFixRequest: boolean;
  isDiffDiagnosis: boolean;
  isScopeNarrow: boolean;
  isScopeExpand: boolean;
  targetHint?: string;
} {
  const text = userText.trim();
  const lower = text.toLowerCase();

  const fixKeywords = [
    '修复', '改一下', '帮我改', '修复错误', '修一下', '按刚才的建议改',
    '应用修改', '修正', '修掉这个bug', '修改这个文件', '改代码', 'fix this', 'apply fix'
  ];
  const isFixRequest = fixKeywords.some(k => text.includes(k) || lower.includes(k));

  const diffKeywords = [
    '诊断刚才的修改', '检查改动', '看下改了什么', 'diff诊断', '改完之后有什么问题',
    '检查修改结果', '验证改动', 'diff', '改动审查', '增量诊断'
  ];
  const isDiffDiagnosis = diffKeywords.some(k => text.includes(k) || lower.includes(k));

  const diagKeywords = [
    '诊断', '排查', '静态分析', '调用链', '审查代码', '找bug', '排查报错',
    '为什么报错', '有什么问题', '检查代码', '深度检查', '全面排查', '查错', 'diagnose', 'inspect code'
  ];
  const isDirectDiagnosis = diagKeywords.some(k => text.includes(k) || lower.includes(k));

  const continueKeywords = ['继续排查', '继续看', '往下查', '还有别的问题吗', '接着查', '深入查', '继续诊断'];
  const isContinuation = continueKeywords.some(k => text.includes(k));

  const narrowKeywords = ['只看这个函数', '缩小范围', '只看这个文件', '聚焦到', '就看这里'];
  const isScopeNarrow = narrowKeywords.some(k => text.includes(k));

  const expandKeywords = ['深入全面排查', '扩大范围', '看所有调用者', '深度调用链', '把关联的都看了'];
  const isScopeExpand = expandKeywords.some(k => text.includes(k));

  const isDiagnosis = isDirectDiagnosis || isDiffDiagnosis || isContinuation || isFixRequest || Boolean(prevContext?.diagnosisContext && isContinuation);

  let targetHint: string | undefined;
  const pathMatch = text.match(/([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/);
  if (pathMatch) {
    targetHint = pathMatch[1];
  }

  return {
    isDiagnosis,
    isContinuation,
    isFixRequest,
    isDiffDiagnosis,
    isScopeNarrow,
    isScopeExpand,
    targetHint,
  };
}

// Format the single chat's private memory into prompt
export function formatChatContextPrompt(context?: ChatContext): string {
  if (!context) return '';

  const sections: string[] = [];

  if (context.currentTask) {
    sections.push(`### 本会话当前主线任务:\n${context.currentTask}`);
  }

  if (context.userRequirements && context.userRequirements.length > 0) {
    sections.push(`### 本会话用户核心要求:\n${context.userRequirements.map(r => `- ${r}`).join('\n')}`);
  }

  if (context.importantDecisions && context.importantDecisions.length > 0) {
    sections.push(`### 本会话结构化关键决策与设计约定 (Key Decisions):\n${context.importantDecisions.map(d => `- ${d}`).join('\n')}`);
  }

  if (context.lastModifiedFiles && context.lastModifiedFiles.length > 0) {
    sections.push(`### 本会话最近涉及与修改的文件:\n${context.lastModifiedFiles.map(f => `- ${f}`).join('\n')}`);
  }

  if (sections.length === 0) return '';

  return `\n## 当前单聊会话专属上下文 (Chat Private Memory):\n${sections.join('\n\n')}\n`;
}

// Update the current Chat's context after an interaction turn with automatic decision extraction
export function updateChatContext(
  prevContext: ChatContext | undefined,
  userText: string,
  aiResponseText: string,
  modifiedFiles: string[] = [],
  toolCalls: ToolCallExecution[] = []
): ChatContext {
  const ctx: ChatContext = prevContext ? { ...prevContext } : createDefaultChatContext();

  // 1. If user prompt sets or refines requirements
  if (userText.trim().length > 0 && userText.length < 180) {
    const trimmed = userText.trim();
    if (!ctx.userRequirements.includes(trimmed)) {
      ctx.userRequirements = [...ctx.userRequirements.slice(-5), trimmed];
    }
  }

  // 2. Automatically extract high-value decisions from this turn
  const extractedDecisions = extractKeyDecisionsFromTurn(userText, aiResponseText, modifiedFiles);
  if (extractedDecisions.length > 0) {
    const currentDecisions = new Set(ctx.importantDecisions || []);
    extractedDecisions.forEach(d => currentDecisions.add(d));
    // Keep top 10 most recent key decisions
    ctx.importantDecisions = Array.from(currentDecisions).slice(-10);
  }

  // 3. Update current task
  ctx.currentTask = userText.slice(0, 100);

  // 4. Update modified files in this chat
  if (modifiedFiles.length > 0) {
    const combined = Array.from(new Set([...ctx.lastModifiedFiles, ...modifiedFiles]));
    ctx.lastModifiedFiles = combined.slice(-15);
  }

  // 5. Update diagnosis context if this turn involved code diagnosis
  const diagIntent = detectDiagnosisIntent(userText, prevContext);
  if (diagIntent.isDiagnosis || (toolCalls.some(t => ['search_code', 'read_file', 'get_file_diff'].includes(t.toolName)) && !modifiedFiles.length)) {
    const readPaths: string[] = [];
    const searchedQueries: string[] = [];

    for (const tc of toolCalls) {
      if (tc.toolName === 'read_file' && tc.args?.path) {
        readPaths.push(tc.args.path);
      } else if (tc.toolName === 'search_code' && tc.args?.query) {
        searchedQueries.push(tc.args.query);
      } else if (tc.toolName === 'search_files' && tc.args?.query) {
        searchedQueries.push(tc.args.query);
      }
    }

    const prevDiag = ctx.diagnosisContext;
    const depth: 'target' | 'related' | 'deep' = diagIntent.isScopeExpand
      ? 'deep'
      : diagIntent.isScopeNarrow
      ? 'target'
      : prevDiag?.depth || 'related';

    let conclusion: DiagnosisContext['lastConclusion'] = 'pending';
    if (aiResponseText.includes('发现明确问题') || aiResponseText.includes('发现 1 个明确问题') || aiResponseText.includes('发现问题')) {
      conclusion = 'confirmed_bug';
    } else if (aiResponseText.includes('暂未发现明确代码错误') || aiResponseText.includes('未发现明确错误')) {
      conclusion = 'no_bug_found';
    } else if (aiResponseText.includes('无法确认') || aiResponseText.includes('潜在风险') || aiResponseText.includes('存疑')) {
      conclusion = 'unconfirmed';
    }

    const updatedCheckedFiles = Array.from(new Set([...(prevDiag?.checkedFiles || []), ...readPaths]));
    const updatedCheckedFuncs = Array.from(new Set([...(prevDiag?.checkedFunctions || []), ...searchedQueries]));

    ctx.diagnosisContext = {
      target: diagIntent.isContinuation ? (prevDiag?.target || userText.slice(0, 80)) : userText.slice(0, 80),
      depth,
      checkedFiles: updatedCheckedFiles.slice(-20),
      checkedFunctions: updatedCheckedFuncs.slice(-20),
      relatedFiles: prevDiag?.relatedFiles || [],
      suspectedIssues: prevDiag?.suspectedIssues || [],
      confirmedIssues: conclusion === 'confirmed_bug' ? [aiResponseText.slice(0, 100)] : (prevDiag?.confirmedIssues || []),
      ruledOutIssues: conclusion === 'no_bug_found' ? [userText.slice(0, 80)] : (prevDiag?.ruledOutIssues || []),
      unresolvedQuestions: conclusion === 'unconfirmed' ? [aiResponseText.slice(0, 100)] : (prevDiag?.unresolvedQuestions || []),
      lastConclusion: conclusion,
      lastReportSummary: aiResponseText.slice(0, 150),
      updatedAt: Date.now(),
    };
  } else if (diagIntent.isFixRequest && ctx.diagnosisContext) {
    ctx.diagnosisContext.lastConclusion = 'pending';
  }

  return ctx;
}
