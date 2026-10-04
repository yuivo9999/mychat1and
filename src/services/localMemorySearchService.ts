import { Conversation } from '../types';

export interface LocalMemorySearchOptions {
  query: string;
  projectId?: string;
  conversationId?: string;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
}

export function searchLocalMemory(conversations: Conversation[], options: LocalMemorySearchOptions) {
  const query = String(options.query || '').trim();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const limit = Math.min(20, Math.max(1, Number(options.limit) || 8));
  if (!query) return { query, scope: 'all', totalMatches: 0, results: [] };

  const scope = options.conversationId ? 'conversation' : options.projectId ? 'project' : 'all';
  const scoped = conversations.filter(c => {
    if (options.conversationId && c.id !== options.conversationId) return false;
    if (!options.conversationId && options.projectId && c.projectId !== options.projectId) return false;
    return true;
  });
  const matches: any[] = [];
  for (const conv of scoped) {
    const title = conv.title || '无标题会话';
    const titleLower = title.toLowerCase();
    for (const message of conv.messages) {
        if (typeof options.dateFrom === 'number' && message.timestamp < options.dateFrom) continue;
      if (typeof options.dateTo === 'number' && message.timestamp > options.dateTo) continue;
      const content = message.content || '';
      const lower = content.toLowerCase();
      const matchedTerms = terms.filter(t => lower.includes(t));
      const titleBoost = terms.some(t => titleLower.includes(t)) ? 4 : 0;
      if (!matchedTerms.length && !titleBoost) continue;
      const exactBoost = lower.includes(query.toLowerCase()) ? 5 : 0;
      const score = matchedTerms.length * 3 + titleBoost + exactBoost + (message.role === 'user' ? 1 : 0);
      const pos = matchedTerms.length ? lower.indexOf(matchedTerms[0]) : 0;
      const start = Math.max(0, pos - 180);
      const end = Math.min(content.length, start + 420);
      matches.push({ conversationId: conv.id, title, projectId: conv.projectId, messageId: message.id, role: message.role, timestamp: message.timestamp, snippet: (start ? '…' : '') + content.slice(start, end).trim() + (end < content.length ? '…' : ''), score });
    }
  }
  matches.sort((a,b) => b.score - a.score || b.timestamp - a.timestamp);
  return { query, scope, totalMatches: matches.length, results: matches.slice(0, limit) };
}

export function formatLocalMemorySearchResult(result: any): string {
  if (!result.results.length) return '### 本地记忆检索结果\n查询: `' + result.query + '`\n没有找到相关历史内容。';
  return '### 本地记忆检索结果\n查询: `' + result.query + '`\n范围: ' + result.scope + '\n返回 ' + result.results.length + ' 条相关片段（共 ' + result.totalMatches + ' 条匹配）\n\n' + result.results.map((x:any,i:number) => (i+1) + '. **' + x.title + '** [' + x.role + ']\n   - projectId: `' + (x.projectId || '无') + '`\n   - conversationId: `' + x.conversationId + '`\n   - messageId: `' + x.messageId + '`\n   - ' + x.snippet).join('\n');
}
