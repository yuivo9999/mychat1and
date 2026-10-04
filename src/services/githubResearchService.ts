import { WebPageContent, WebSearchResult } from './webSearch';

interface GitHubSearchRepository {
  full_name?: string;
  html_url?: string;
  description?: string;
  stargazers_count?: number;
  language?: string;
  updated_at?: string;
  default_branch?: string;
}

interface GitHubIssue {
  title?: string;
  html_url?: string;
  body?: string | null;
  state?: string;
  repository_url?: string;
  updated_at?: string;
  pull_request?: unknown;
}

interface GitHubResearchResponse {
  results: WebSearchResult[];
  pageContents: WebPageContent[];
  repositories: string[];
  issues: number;
  pullRequests: number;
}

interface NativeHttpResponse {
  ok: boolean;
  status: number;
  body: string;
}

function isAndroidRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).MyChatAndroid?.httpRequest);
}

async function requestJson(url: string, timeoutMs = 8000): Promise<NativeHttpResponse> {
  if (isAndroidRuntime()) {
    try {
      const raw = (window as any).MyChatAndroid.httpRequest(
        url,
        'GET',
        JSON.stringify({
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'MyChat-Android-Agent',
        }),
        '',
        timeoutMs,
      );
      return JSON.parse(raw);
    } catch {
      return { ok: false, status: 0, body: '' };
    }
  }

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'MyChat-Android-Agent',
      },
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  } catch {
    return { ok: false, status: 0, body: '' };
  }
}

function cleanText(text: string, max = 1800): string {
  return text
    .replace(/\r/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function looksLikeRepoRef(query: string): string | null {
  const explicit = query.match(/(?:github\.com[/:])([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i);
  if (explicit) return explicit[1];
  const compact = query.match(/\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\b/);
  return compact ? compact[1] : null;
}

async function fetchReadme(fullName: string): Promise<WebPageContent | null> {
  const response = await requestJson(`https://api.github.com/repos/${fullName}/readme`);
  if (!response.ok) return null;
  try {
    const data = JSON.parse(response.body);
    const encoded = data.content;
    if (!encoded) return null;
    const content = typeof atob === 'function'
      ? atob(String(encoded).replace(/\\n/g, ''))
      : '';
    if (!content) return null;
    return {
      url: data.html_url || `https://github.com/${fullName}/blob/HEAD/README.md`,
      title: `${fullName} README`,
      content: cleanText(content, 6000),
    };
  } catch {
    return null;
  }
}

export async function performGitHubResearch(rawQuery: string): Promise<GitHubResearchResponse> {
  const query = rawQuery.trim().slice(0, 120);
  if (!query) return { results: [], pageContents: [], repositories: [], issues: 0, pullRequests: 0 };

  const repoRef = looksLikeRepoRef(query);
  const searchQuery = encodeURIComponent(repoRef ? query.replace(repoRef, '').trim() || repoRef : query);

  const [repoResponse, issueResponse] = await Promise.all([
    requestJson(`https://api.github.com/search/repositories?q=${searchQuery}&sort=stars&order=desc&per_page=5`),
    requestJson(`https://api.github.com/search/issues?q=${searchQuery}&sort=updated&order=desc&per_page=8`),
  ]);

  const results: WebSearchResult[] = [];
  const pageContents: WebPageContent[] = [];
  const repositories: string[] = [];

  if (repoResponse.ok) {
    try {
      const data = JSON.parse(repoResponse.body);
      const items: GitHubSearchRepository[] = data.items || [];
      for (const repo of items) {
        if (!repo.full_name || !repo.html_url) continue;
        repositories.push(repo.full_name);
        const meta = [
          repo.description ? cleanText(repo.description, 500) : '',
          repo.language ? `语言：${repo.language}` : '',
          typeof repo.stargazers_count === 'number' ? `Stars：${repo.stargazers_count}` : '',
          repo.updated_at ? `更新时间：${repo.updated_at}` : '',
        ].filter(Boolean).join('；');
        results.push({
          title: `GitHub Repository: ${repo.full_name}`,
          url: repo.html_url,
          snippet: meta || 'GitHub 开源仓库',
          sourceType: 'search',
          domain: 'github.com',
          score: 95,
          freshness: 'fresh',
        });
      }
    } catch {}
  }

  let issues = 0;
  let pullRequests = 0;
  if (issueResponse.ok) {
    try {
      const data = JSON.parse(issueResponse.body);
      const items: GitHubIssue[] = data.items || [];
      for (const item of items) {
        if (!item.title || !item.html_url) continue;
        const isPr = Boolean(item.pull_request);
        if (isPr) pullRequests++; else issues++;
        results.push({
          title: `GitHub ${isPr ? 'Pull Request' : 'Issue'}: ${item.title}`,
          url: item.html_url,
          snippet: cleanText(item.body || '') || `状态：${item.state || 'unknown'}；更新时间：${item.updated_at || 'unknown'}`,
          sourceType: 'search',
          domain: 'github.com',
          score: isPr ? 88 : 86,
          freshness: 'fresh',
        });
      }
    } catch {}
  }

  const readmeTargets = Array.from(new Set([
    ...(repoRef ? [repoRef] : []),
    ...repositories.slice(0, 3),
  ])).slice(0, 3);

  const readmes = await Promise.all(readmeTargets.map(fetchReadme));
  pageContents.push(...readmes.filter(Boolean) as WebPageContent[]);

  return { results, pageContents, repositories, issues, pullRequests };
}
