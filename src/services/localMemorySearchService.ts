import { Conversation } from '../types';

export interface LocalMemorySearchOptions {
  query: string;
  projectId?: string;
  conversationId?: string;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
}

export interface LocalMemorySearchResult {
  conversationId: string;
  title: string;
  projectId?: string;
  messageId: string;
  role: string;
  timestamp: number;
  snippet: string;
  score: number;
}

export function searchLocalMemory(
  conversations: Conversation[],
  options: LocalMemorySearchOptions
) {
  const query = String(options.query || '').trim();
  const normalizedQuery = query.toLowerCase();
  const terms = normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .filter((term, index, all) => all.indexOf(term) === index);
  const limit = Math.min(20, Math.max(1, Number(options.limit) || 8));

  if (!query) {
    return { query, scope: 'all', totalMatches: 0, results: [] as LocalMemorySearchResult[] };
  }

  const scope = options.conversationId
    ? 'conversation'
    : options.projectId
      ? 'project'
      : 'all';

  const scoped = conversations.filter((conversation) => {
    if (options.conversationId && conversation.id !== options.conversationId) return false;
    if (!options.conversationId && options.projectId && conversation.projectId !== options.projectId) return false;
    return true;
  });

  const now = Date.now();
  const matches: LocalMemorySearchResult[] = [];

  for (const conv of scoped) {
    const title = conv.title || '无标题会话';
    const titleLower = title.toLowerCase();

    for (const message of conv.messages) {
      // Internal system/tool records are not user history and must not leak into memory search.
      if (message.role !== 'user' && message.role !== 'assistant') continue;
      if (typeof options.dateFrom === 'number' && message.timestamp < options.dateFrom) continue;
      if (typeof options.dateTo === 'number' && message.timestamp > options.dateTo) continue;

      const content = String(message.content || '').trim();
      if (!content) continue;

      const lower = content.toLowerCase();
      const matchedTerms = terms.filter((term) => lower.includes(term));
      const titleHits = terms.filter((term) => titleLower.includes(term));
      const exactPhrase = lower.includes(normalizedQuery);

      if (!matchedTerms.length && !titleHits.length) continue;

      // Relevance first, then a mild recency boost. This keeps old but highly
      // relevant decisions above recent incidental mentions.
      const coverage = matchedTerms.length / Math.max(1, terms.length);
      const exactBoost = exactPhrase ? 10 : 0;
      const titleBoost = titleHits.length * 4;
      const coverageBoost = coverage * 8;
      const roleBoost = message.role === 'user' ? 2 : 0;
      const ageDays = Math.max(0, (now - message.timestamp) / 86400000);
      const recencyBoost = Math.min(3, 3 / (1 + ageDays / 30));
      const score = exactBoost + titleBoost + coverageBoost + roleBoost + recencyBoost;

      const firstHit = matchedTerms
        .map((term) => lower.indexOf(term))
        .filter((position) => position >= 0)
        .sort((a, b) => a - b)[0] ?? 0;
      const start = Math.max(0, firstHit - 180);
      const end = Math.min(content.length, start + 420);

      matches.push({
        conversationId: conv.id,
        title,
        projectId: conv.projectId,
        messageId: message.id,
        role: message.role,
        timestamp: message.timestamp,
        snippet:
          (start ? '…' : '') +
          content.slice(start, end).trim() +
          (end < content.length ? '…' : ''),
        score,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp);

  // Avoid flooding the model with many nearly identical hits from one chat.
  const diversified: LocalMemorySearchResult[] = [];
  const perConversation = new Map<string, number>();
  for (const match of matches) {
    const count = perConversation.get(match.conversationId) || 0;
    if (count >= 3) continue;
    perConversation.set(match.conversationId, count + 1);
    diversified.push(match);
    if (diversified.length >= limit) break;
  }

  return {
    query,
    scope,
    totalMatches: matches.length,
    results: diversified,
  };
}

export interface LocalMemoryDigestConversation {
  conversationId: string;
  title: string;
  projectId?: string;
  timestamp: number;
  relevance: number;
  snippets: string[];
}

export function buildLocalMemoryDigest(result: {
  query: string;
  scope: string;
  totalMatches: number;
  results: LocalMemorySearchResult[];
}): LocalMemoryDigestConversation[] {
  const grouped = new Map<string, LocalMemoryDigestConversation>();

  for (const match of result.results) {
    const existing = grouped.get(match.conversationId);
    if (existing) {
      existing.timestamp = Math.max(existing.timestamp, match.timestamp);
      existing.relevance = Math.max(existing.relevance, match.score);
      if (existing.snippets.length < 2) existing.snippets.push(match.snippet);
      continue;
    }

    grouped.set(match.conversationId, {
      conversationId: match.conversationId,
      title: match.title,
      projectId: match.projectId,
      timestamp: match.timestamp,
      relevance: match.score,
      snippets: [match.snippet],
    });
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.relevance - a.relevance || b.timestamp - a.timestamp)
    .slice(0, 6);
}

export function formatLocalMemorySearchResult(result: {
  query: string;
  scope: string;
  totalMatches: number;
  results: LocalMemorySearchResult[];
}): string {
  if (!result.results.length) {
    return '### 本地记忆检索结果\\n查询: \`' + result.query + '\`\\n没有找到相关历史内容。';
  }

  const digest = buildLocalMemoryDigest(result);
  const dateText = (timestamp: number) =>
    new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    '### 本地记忆检索结果\\n' +
    '查询: \`' + result.query + '\`\\n' +
    '范围: ' + result.scope + '\\n' +
    '返回 ' + result.results.length + ' 条证据片段（共 ' + result.totalMatches + ' 条匹配）\\n\\n' +
    '#### 历史记忆摘要\\n' +
    digest
      .map(
        (x, i) =>
          (i + 1) +
          '. **' + x.title + '**（' + dateText(x.timestamp) + '）\\n' +
          '   - conversationId: \`' + x.conversationId + '\`\\n' +
          '   - 相关度: ' + x.relevance.toFixed(1) + '\\n' +
          x.snippets.map((snippet) => '   - ' + snippet).join('\\n')
      )
      .join('\\n') +
    '\\n\\n#### 原始证据\\n' +
    result.results
      .slice(0, 8)
      .map(
        (x, i) =>
          (i + 1) +
          '. [' + x.role + '] **' + x.title + '** · ' + dateText(x.timestamp) + '\\n' +
          '   - ' + x.snippet
      )
      .join('\\n')
  );
}
