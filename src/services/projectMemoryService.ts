import { Project, Conversation, ProjectMemoryRecord } from '../types';

const MAX_ACTIVE_MEMORY_RECORDS = 20;
const MAX_STORED_MEMORY_RECORDS = 60;

const STOP_WORDS = new Set([
  '这个', '那个', '我们', '现在', '之前', '已经', '可以', '需要', '应该', '进行', '使用',
  '项目', '功能', '方案', '问题', '相关', '一下', '一个', '用户', '系统', '之后', '继续',
  'the', 'this', 'that', 'with', 'from', 'for', 'and', 'are', 'was', 'were', 'into', 'use'
]);

function normalizeDecision(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/^[\-*•]+\s*/, '');
}

function decisionTokens(value: string): string[] {
  return Array.from(new Set(
    normalizeDecision(value)
      .toLowerCase()
      .split(/[^\p{L}\p{N}_+#.-]+/u)
      .map(t => t.trim())
      .filter(t => t.length >= 2 && !STOP_WORDS.has(t))
  ));
}

function tokenOverlap(a: string, b: string): number {
  const left = new Set(decisionTokens(a));
  const right = new Set(decisionTokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common++;
  return common / Math.max(1, Math.min(left.size, right.size));
}

function looksLikeSupersedingDecision(value: string): boolean {
  return /改成|改为|调整为|换成|替换|取消|不再|停止使用|弃用|废弃|最终决定|最终采用|现在采用|改用|重新确定|不使用|删除掉|移除/i.test(value);
}

function stableRecordId(content: string): string {
  const normalized = normalizeDecision(content).toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `pmem_${(hash >>> 0).toString(36)}`;
}

function buildRecord(content: string, conversation: Conversation, index: number): ProjectMemoryRecord {
  const now = Date.now();
  return {
    id: `${stableRecordId(content)}_${conversation.id}_${index}`,
    content: normalizeDecision(content),
    status: 'active',
    createdAt: conversation.createdAt || now,
    updatedAt: conversation.updatedAt || now,
    sourceConversationId: conversation.id,
    sourceConversationUpdatedAt: conversation.updatedAt || now,
  };
}

/**
 * Reconcile project memory instead of blindly appending strings.
 * - exact/near duplicates are merged
 * - explicit replacement decisions supersede older related decisions
 * - old superseded records remain locally for traceability
 * - only active records are injected into normal model context
 */
function reconcileMemoryRecords(
  existingRecords: ProjectMemoryRecord[],
  projectConversations: Conversation[]
): ProjectMemoryRecord[] {
  const records = existingRecords.map(r => ({ ...r }));

  const candidates: ProjectMemoryRecord[] = [];
  for (const conv of projectConversations) {
    const decisions = conv.chatContext?.importantDecisions || [];
    decisions.forEach((decision, index) => {
      const normalized = normalizeDecision(decision || '');
      if (normalized.length >= 6) candidates.push(buildRecord(normalized, conv, index));
    });
  }

  candidates.sort((a, b) =>
    (a.sourceConversationUpdatedAt || a.updatedAt) - (b.sourceConversationUpdatedAt || b.updatedAt)
  );

  for (const candidate of candidates) {
    const same = records.find(r =>
      r.status === 'active' && normalizeDecision(r.content).toLowerCase() === candidate.content.toLowerCase()
    );
    if (same) {
      same.updatedAt = Math.max(same.updatedAt, candidate.updatedAt);
      same.sourceConversationUpdatedAt = Math.max(
        same.sourceConversationUpdatedAt || 0,
        candidate.sourceConversationUpdatedAt || 0
      );
      if (!same.sourceConversationId) same.sourceConversationId = candidate.sourceConversationId;
      continue;
    }

    const active = records.filter(r => r.status === 'active');
    const related = active
      .map(r => ({ record: r, overlap: tokenOverlap(r.content, candidate.content) }))
      .filter(item => item.overlap >= 0.5)
      .sort((a, b) => b.overlap - a.overlap);

    if (looksLikeSupersedingDecision(candidate.content) && related.length > 0) {
      for (const item of related.slice(0, 3)) {
        if (item.record.updatedAt <= candidate.updatedAt || item.overlap >= 0.75) {
          item.record.status = 'superseded';
          item.record.updatedAt = candidate.updatedAt;
          item.record.supersededById = candidate.id;
        }
      }
    }

    records.push(candidate);
  }

  // Retire stale duplicate active entries after reconciliation.
  const active = records
    .filter(r => r.status === 'active')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (active.length > MAX_ACTIVE_MEMORY_RECORDS) {
    for (const stale of active.slice(MAX_ACTIVE_MEMORY_RECORDS)) {
      stale.status = 'archived';
      stale.updatedAt = Date.now();
    }
  }

  // Keep a bounded local audit trail, while always retaining all active records.
  const finalActive = records.filter(r => r.status === 'active');
  const historical = records
    .filter(r => r.status !== 'active')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return [...finalActive, ...historical].slice(0, MAX_STORED_MEMORY_RECORDS);
}

function migrateLegacyRecords(project: Project): ProjectMemoryRecord[] {
  const existing = project.sharedMemory?.records || [];
  if (existing.length > 0) return existing.map(r => ({ ...r }));

  return (project.sharedMemory?.keyPoints || [])
    .map((content, index) => normalizeDecision(content || '')).filter(Boolean)
    .map((content, index) => ({
      id: `pmem_legacy_${index}_${stableRecordId(content)}`,
      content,
      status: 'active' as const,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));
}

/**
 * 黄金平衡分层记忆架构 (Hierarchical Project Shared Memory)
 * L1: Project identity, custom instructions and core background.
 * L2: Reconciled active decisions; superseded/archived history stays local.
 * L3: Recent summaries of other conversations in the same project.
 */
export function formatProjectMemoryPrompt(
  project: Project,
  projectConversations: Conversation[],
  currentConvId?: string
): string {
  const sections: string[] = [];
  const identityLines = [
    `所属项目: 【${project.name}】`,
    `项目内协同会话数: ${projectConversations.length} 个`,
    `记忆隔离机制: ${project.memoryMode === 'isolated'
      ? '项目严格隔离 (此项目记忆仅在组内互通，外部独立聊天不可见)'
      : '全局共享 (此项目记忆可与全局常规会话互通)'}`,
  ];
  sections.push(`### [L1 项目全局静态共识与约束]\n${identityLines.map(l => `- ${l}`).join('\n')}`);

  if (project.customInstructions?.trim()) {
    sections.push(`### [L1 项目全局自定义指令]\n${project.customInstructions.trim()}`);
  }

  if (project.sharedMemory?.summary?.trim()) {
    sections.push(`### [L1 项目核心背景]\n${project.sharedMemory.summary.trim()}`);
  }

  const activeRecords = migrateLegacyRecords(project)
    .filter(r => r.status === 'active')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (activeRecords.length > 0) {
    sections.push(
      `### [L2 跨会话累计沉淀的核心决策与设计约定 (Key Decisions)]\n` +
      `*(以下只展示当前仍有效的主动记忆；被新决定取代或已归档的旧记忆不会污染当前上下文。)*\n` +
      activeRecords.map((r, idx) => `${idx + 1}. ${r.content}`).join('\n')
    );
  }

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

export function updateProjectCollectiveMemory(
  project: Project,
  projectConversations: Conversation[]
): Project {
  const existingRecords = migrateLegacyRecords(project);
  const reconciled = reconcileMemoryRecords(existingRecords, projectConversations);
  const activeKeyPoints = reconciled
    .filter(r => r.status === 'active')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX_ACTIVE_MEMORY_RECORDS)
    .map(r => r.content);

  return {
    ...project,
    updatedAt: Date.now(),
    sharedMemory: {
      ...project.sharedMemory,
      keyPoints: activeKeyPoints,
      records: reconciled,
    },
  };
}
