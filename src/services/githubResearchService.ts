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
  updated_at?: string;
  pull_request?: unknown;
}

interface GitHubFile {
  path?: string;
  html_url?: string;
  download_url?: string | null;
  type?: string;
  content?: string;
  encoding?: string;
}

interface GitHubRelease {
  name?: string | null;
  tag_name?: string;
  html_url?: string;
  body?: string | null;
  published_at?: string | null;
  prerelease?: boolean;
}

export interface GitHubResearchResponse {
  results: WebSearchResult[];
  pageContents: WebPageContent[];
  repositories: string[];
  issues: number;
  pullRequests: number;
  releases: number;
  sourceFiles: number;
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

function decodeBase64(value: string): string {
  if (typeof atob !== 'function') return '';
  try {
    const binary = atob(value.replace(/\\n/g, ''));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function looksLikeRepoRef(query: string): string | null {
  const explicit = query.match(/(?:github\.com[/:])([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i);
  if (explicit) return explicit[1];
  const compact = query.match(/\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\b/);
  return compact ? compact[1] : null;
}

function pushResult(results: WebSearchResult[], title: string, url: string, snippet: string, score: number) {
  results.push({
    title,
    url,
    snippet: cleanText(snippet, 1600),
    sourceType: 'search',
    domain: 'github.com',
    score,
    freshness: 'fresh',
  });
}

async function fetchReadme(fullName: string): Promise<WebPageContent | null> {
  const response = await requestJson(`https://api.github.com/repos/${fullName}/readme`);
  if (!response.ok) return null;
  try {
    const data = JSON.parse(response.body);
    const content = data.content ? decodeBase64(String(data.content)) : '';
    if (!content) return null;
    return {
      url: data.html_url || `https://github.com/${fullName}/blob/HEAD/README.md`,
      title: `${fullName} README`,
      content: cleanText(content, 6500),
    };
  } catch {
    return null;
  }
}

async function fetchRepositoryFiles(fullName: string, branch = 'HEAD'): Promise<WebPageContent[]> {
  const response = await requestJson(`https://api.github.com/repos/${fullName}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (!response.ok) return [];
  try {
    const data = JSON.parse(response.body);
    const files: GitHubFile[] = (data.tree || [])
      .filter((item: GitHubFile) => item.type === 'blob' && item.path)
      .filter((item: GitHubFile) => /\.(ts|tsx|js|jsx|py|java|kt|kts|go|rs|swift|dart|json|gradle|xml|yml|yaml|md)$/i.test(item.path || ''))
      .slice(0, 12);

    const selected = files.filter(item =>
      /(?:src|app|lib|packages|android|server|api|README|package\.json|build\.gradle)/i.test(item.path || '')
    ).slice(0, 8);

    const pages = await Promise.all(selected.map(async file => {
      const url = `https://api.github.com/repos/${fullName}/contents/${String(file.path).split('/').map(encodeURIComponent).join('/')}`;
      const result = await requestJson(url);
      if (!result.ok) return null;
      try {
        const data = JSON.parse(result.body);
        const content = data.content ? decodeBase64(String(data.content)) : '';
        if (!content) return null;
        return {
          url: data.html_url || `https://github.com/${fullName}/blob/${branch}/${file.path}`,
          title: `${fullName} / ${file.path}`,
          content: cleanText(content, 7000),
        };
      } catch {
        return null;
      }
    }));

    return pages.filter(Boolean) as WebPageContent[];
  } catch {
    return [];
  }
}

async function fetchReleases(fullName: string, results: WebSearchResult[]): Promise<number> {
  const response = await requestJson(`https://api.github.com/repos/${fullName}/releases?per_page=5`);
  if (!response.ok) return 0;
  try {
    const releases: GitHubRelease[] = JSON.parse(response.body);
    for (const release of releases) {
      if (!release.html_url || !release.tag_name) continue;
      pushResult(
        results,
        `GitHub Release: ${fullName} ${release.tag_name}`,
        release.html_url,
        [
          release.name || '',
          release.prerelease ? '预发布版本' : '正式发布',
          release.published_at ? `发布时间：${release.published_at}` : '',
          release.body || '',
        ].filter(Boolean).join('；'),
        93,
      );
    }
    return releases.length;
  } catch {
    return 0;
  }
}

export async function performGitHubResearch(rawQuery: string): Promise<GitHubResearchResponse> {
  const query = rawQuery.trim().slice(0, 160);
  if (!query) {
    return { results: [], pageContents: [], repositories: [], issues: 0, pullRequests: 0, releases: 0, sourceFiles: 0 };
  }

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
        pushResult(results, `GitHub Repository: ${repo.full_name}`, repo.html_url, meta || 'GitHub 开源仓库', 97);
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
        pushResult(
          results,
          `GitHub ${isPr ? 'Pull Request' : 'Issue'}: ${item.title}`,
          item.html_url,
          item.body || `状态：${item.state || 'unknown'}；更新时间：${item.updated_at || 'unknown'}`,
          isPr ? 91 : 89,
        );
      }
    } catch {}
  }

  const targets = Array.from(new Set([
    ...(repoRef ? [repoRef] : []),
    ...repositories.slice(0, 3),
  ])).slice(0, 3);

  for (const fullName of targets) {
    const repoMeta = await requestJson(`https://api.github.com/repos/${fullName}`);
    let branch = 'HEAD';
    if (repoMeta.ok) {
      try {
        const repo = JSON.parse(repoMeta.body);
        branch = repo.default_branch || 'HEAD';
      } catch {}
    }

    const [readme, files, releaseCount] = await Promise.all([
      fetchReadme(fullName),
      fetchRepositoryFiles(fullName, branch),
      fetchReleases(fullName, results),
    ]);

    if (readme) pageContents.push(readme);
    pageContents.push(...files);
    void releaseCount;
  }

  return {
    results,
    pageContents,
    repositories,
    issues,
    pullRequests,
    releases: results.filter(item => item.title.startsWith('GitHub Release:')).length,
    sourceFiles: pageContents.filter(item => item.title.includes(' / ')).length,
  };
}
