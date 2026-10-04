import { Project, Conversation } from '../types';

/**
 * 黄金平衡分层记忆架构 (Hierarchical Project Shared Memory)
 * Multiple chat windows inside the same project share this collective memory.
 * - L1: Global project conventions & instructions (Immutable / Semi-static)
 * - L2: Structured key decisions & technical agreements (Compact Key Decisions)
 * - L3: Peer conversation summaries (Active context of other chats in this project)
 */
export function formatProjectMemoryPrompt(
  project: Project,
  projectConversations: Conversation[],
  currentConvId?: string
): string {
  const sections: string[] = [];

  // L1: Basic Project Identity & Global Directives
  const identityLines = [
    `所属项目: 【${project.name}】`,
    `项目内协同会话数: ${projectConversations.length} 个`,
    `记忆隔离机制: ${
      project.memoryMode === 'isolated'
        ? '项目严格隔离 (此项目记忆仅在组内互通，外部独立聊天不可见)'
        : '全局共享 (此项目记忆可与全局常规会话互通)'
    }`,
  ];
  sections.push(`### [L1 项目全局静态共识与约束]\n${identityLines.map(l => `- ${l}`).join('\n')}`);

  if (project.customInstructions?.trim()) {
    sections.push(`### [L1 项目全局自定义指令]\n${project.customInstructions.trim()}`);
  }

  if (project.sharedMemory?.summary?.trim()) {
    sections.push(`### [L1 项目核心背景]\n${project.sharedMemory.summary.trim()}`);
  }

  // L2: Structured Key Decisions & Technical Agreements (Deduplicated high-value bullets)
  const keyPoints = project.sharedMemory?.keyPoints || [];
  if (keyPoints.length > 0) {
    sections.push(
      `### [L2 跨会话累计沉淀的核心决策与设计约定 (Key Decisions)]\n` +
      `*(注意: 以下为本项目跨所有聊天窗口已确认达成的重要结论，请严格遵守，无需用户重复说明)*\n` +
      keyPoints.map((kp, idx) => `${idx + 1}. ${kp}`).join('\n')
    );
  }

  // L3: Summaries of other conversations in this same project (Collective project knowledge)
  const peerConversations = projectConversations.filter(c => c.id !== currentConvId);
  const peerSummaries: string[] = [];

  for (const peer of peerConversations) {
    const chatTitle = peer.title || '无标题会话';
    const reqs = peer.chatContext?.userRequirements || [];
    const decisions = peer.chatContext?.importantDecisions || [];
    const task = peer.chatContext?.currentTask;

    if (task || reqs.length > 0 || decisions.length > 0) {
      const details: string[] = [];
      if (task) details.push(`最近议题: ${task}`);
      if (decisions.length > 0) details.push(`关键产出: ${decisions.slice(-2).join('; ')}`);
      else if (reqs.length > 0) details.push(`要点: ${reqs.slice(-2).join('; ')}`);
      peerSummaries.push(`- **会话「${chatTitle}」**: ${details.join(' | ')}`);
    }
  }

  if (peerSummaries.length > 0) {
    sections.push(
      `### [L3 同组其它协同聊天窗口最新进展]\n` +
      peerSummaries.join('\n') +
      `\n*(提示: 你可以无缝参考同项目其它聊天窗口已确认的成果，避免重复劳动。)*`
    );
  }

  if (sections.length === 0) return '';

  return (
    `\n========================================\n` +
    `## 项目多会话共享记忆库 (Project Shared Memory)\n` +
    `========================================\n` +
    sections.join('\n\n') +
    `\n========================================\n`
  );
}

/**
 * Extract / update collective project memory from conversations inside the project
 */
export function updateProjectCollectiveMemory(
  project: Project,
  projectConversations: Conversation[]
): Project {
  const allDecisions = new Set<string>(project.sharedMemory?.keyPoints || []);

  // Aggregate decisions from all conversations in the project
  for (const conv of projectConversations) {
    const decisions = conv.chatContext?.importantDecisions || [];
    decisions.forEach(d => {
      if (d && d.trim().length >= 6) {
        allDecisions.add(d.trim());
      }
    });
  }

  // Cap to top 15 most recent and valuable key points to prevent context bloat
  const cappedPoints = Array.from(allDecisions).slice(-15);

  return {
    ...project,
    updatedAt: Date.now(),
    sharedMemory: {
      ...project.sharedMemory,
      keyPoints: cappedPoints,
    },
  };
}
