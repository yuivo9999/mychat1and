import { SearchEngineItem } from '../types';
import { WebSearchResponse, WebSearchResult, WebPageContent, performWebSearch } from './webSearch';

export interface ResearchRound {
  query: string;
  resultCount: number;
  pageCount: number;
  domains: number;
  highConfidenceResults: number;
  reason: string;
}

export interface ResearchResponse extends WebSearchResponse {
  rounds: ResearchRound[];
  sufficient: boolean;
  conflictHints: string[];
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/https?:\/\/[^\s]+/g, ' ')
      .replace(/[^\p{L}\p{N}+#._-]+/gu, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 2)
  );
}

function mergeResults(target: Map<string, WebSearchResult>, incoming: WebSearchResult[]) {
  for (const item of incoming) {
    const key = item.url?.trim().toLowerCase().replace(/\/$/, '') || item.title.trim().toLowerCase();
    if (!key) continue;
    const previous = target.get(key);
    if (!previous || (item.score || 0) > (previous.score || 0)) target.set(key, item);
  }
}

function mergePages(target: Map<string, WebPageContent>, incoming: WebPageContent[]) {
  for (const page of incoming) {
    const key = page.url.trim().toLowerCase().replace(/\/$/, '');
    if (!key) continue;
    const previous = target.get(key);
    if (!previous || page.content.length > previous.content.length) target.set(key, page);
  }
}

function isResearchSufficient(response: WebSearchResponse): boolean {
  const strong = response.results.filter(item => (item.score || 0) >= 55).length;
  const domains = new Set(response.results.map(item => {
    if (item.domain) return item.domain;
    try { return new URL(item.url).hostname; } catch { return ''; }
  }).filter(Boolean));
  const usefulPages = response.pageContents.filter(page => page.content.length >= 500).length;
  return strong >= 3 && domains.size >= 2 && (usefulPages >= 1 || response.results.length >= 6);
}

function looksTechnical(query: string): boolean {
  return /\b(api|sdk|npm|node|react|android|ios|python|typescript|javascript|kotlin|java|gradle|vite|github|error|exception|stack|package|library|framework|version|bug|issue|代码|报错|依赖|接口|开发|编程)\b/i.test(query);
}

function buildFollowUpQueries(query: string, response: WebSearchResponse): string[] {
  const existing = new Set(response.results.map(item => item.title + ' ' + item.url).map(text => text.toLowerCase()));
  const candidates = looksTechnical(query)
    ? [
        query + ' official documentation',
        query + ' GitHub issues latest',
        query + ' latest version breaking changes',
      ]
    : [
        query + ' official source',
        query + ' latest update',
        query + ' independent sources',
      ];

  return candidates.filter(candidate => {
    const tokens = tokenSet(candidate);
    return !Array.from(existing).some(text => {
      const overlap = Array.from(tokens).filter(token => text.includes(token)).length;
      return overlap >= Math.max(2, Math.floor(tokens.size * 0.65));
    });
  });
}

function detectConflictHints(results: WebSearchResult[]): string[] {
  const hints: string[] = [];
  const versionPattern = /(?:version|v|版本)\s*[:=]?\s*(\d+(?:\.\d+){1,3})/i;
  const versions = new Map<string, Set<string>>();
  for (const item of results) {
    const match = (item.title + ' ' + item.snippet).match(versionPattern);
    if (!match) continue;
    const key = item.domain || 'unknown';
    if (!versions.has(key)) versions.set(key, new Set());
    versions.get(key)!.add(match[1]);
  }
  const distinct = new Set(Array.from(versions.values()).flatMap(values => Array.from(values)));
  if (distinct.size > 1) {
    hints.push('不同来源出现多个版本号：' + Array.from(distinct).join('、') + '。回答时必须交叉核实版本与发布时间。');
  }
  return hints;
}

export async function performResearch(
  rawText: string,
  searchEngines?: SearchEngineItem[],
  activeSearchEngineId?: string,
): Promise<ResearchResponse> {
  const first = await performWebSearch(rawText, searchEngines, activeSearchEngineId);
  const resultMap = new Map<string, WebSearchResult>();
  const pageMap = new Map<string, WebPageContent>();
  mergeResults(resultMap, first.results);
  mergePages(pageMap, first.pageContents);

  const rounds: ResearchRound[] = [{
    query: first.query,
    resultCount: first.results.length,
    pageCount: first.pageContents.length,
    domains: new Set(first.results.map(item => item.domain).filter(Boolean)).size,
    highConfidenceResults: first.results.filter(item => (item.score || 0) >= 55).length,
    reason: isResearchSufficient(first) ? '首轮资料已达到多来源研究阈值' : '首轮资料不足，继续补充检索',
  }];

  let aggregate: WebSearchResponse = {
    query: first.query,
    results: Array.from(resultMap.values()),
    pageContents: Array.from(pageMap.values()),
  };

  if (!isResearchSufficient(first)) {
    const followUps = buildFollowUpQueries(first.query, first).slice(0, 2);
    for (const query of followUps) {
      const next = await performWebSearch(query, searchEngines, activeSearchEngineId);
      mergeResults(resultMap, next.results);
      mergePages(pageMap, next.pageContents);
      aggregate = {
        query: first.query,
        results: Array.from(resultMap.values()),
        pageContents: Array.from(pageMap.values()),
      };
      rounds.push({
        query,
        resultCount: next.results.length,
        pageCount: next.pageContents.length,
        domains: new Set(next.results.map(item => item.domain).filter(Boolean)).size,
        highConfidenceResults: next.results.filter(item => (item.score || 0) >= 55).length,
        reason: isResearchSufficient(aggregate) ? '补充检索后达到研究阈值' : '继续检查资料覆盖度',
      });
      if (isResearchSufficient(aggregate)) break;
    }
  }

  return {
    ...aggregate,
    rounds,
    sufficient: isResearchSufficient(aggregate),
    conflictHints: detectConflictHints(aggregate.results),
  };
}
