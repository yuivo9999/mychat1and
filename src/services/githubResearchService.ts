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
  type?: string;
}

interface GitHubRelease {
  name?: string | null;
  tag_name?: string;
  html_url?: string;
  body?: string | null;
  published_at?: string | null;
  prerelease?: boolean;
}

interface GitHubCommit {
  sha?: string;
  html_url?: string;
  message?: string;
  author?: { login?: string } | null;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string } | null;
  };
}

export interface GitHubResearchResponse {
  results: WebSearchResult[];
  pageContents: WebPageContent[];
  repositories: string[];
  issues: number;
  pullRequests: number;
  releases: number;
  commits: number;
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
  return text.replace(/\r/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function decodeBase64(value: string): string {
  if (typeof atob !== 'function') return '';
  try {
    const binary = atob(value.replace(/\\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
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

function tokenize(query: string): string[] {
  return Array.from(new Set(
    query.toLowerCase()
      .replace(/github\.com|https?:\/\/|[^a-z0-9_\u4e00-\u9fff]+/g, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 2),
  )).slice(0, 18);
}

function scorePath(path: string, tokens: string[]): number {
  const lower = path.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (lower.includes(token)) score += 12;
  }
  if (/package\.json$|build\.gradle|settings\.gradle|pyproject\.toml|cargo\.toml|go\.mod$/i.test(path)) score += 18;
  if (/readme/i.test(path)) score += 8;
  if (/(test|spec|__tests__|\.test\.|\.spec\.)/i.test(path)) score += 3;
  if (/(src|app|lib|server|api|android|packages)\//i.test(path)) score += 5;
  return score;
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
    return content ? {
      url: data.html_url || `https://github.com/${fullName}/blob/HEAD/README.md`,
      title: `${fullName} README`,
      content: cleanText(content, 6500),
    } : null;
  } catch {
    return null;
  }
}

async function fetchRepositoryFiles(fullName: string, branch: string, query: string): Promise<WebPageContent[]> {
  const response = await requestJson(`https://api.github.com/repos/${fullName}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (!response.ok) return [];

  try {
    const data = JSON.parse(response.body);
    const tokens = tokenize(query);
    const files: GitHubFile[] = (data.tree || [])
      .filter((item: GitHubFile) => item.type === 'blob' && item.path)
      .filter((item: GitHubFile) => /\.(ts|tsx|js|jsx|py|java|kt|kts|go|rs|swift|dart|json|gradle|xml|yml|yaml|md)$/i.test(item.path || ''))
      .filter((item: GitHubFile) => !/(node_modules|dist|build|\.git|vendor|coverage)/i.test(item.path || ''));

    const selected = files
      .map(file => ({ file, score: scorePath(file.path || '', tokens) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(item => item.file);

    const pages = await Promise.all(selected.map(async file => {
      const path = String(file.path);
      const url = `https://api.github.com/repos/${fullName}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
      const result = await requestJson(url);
      if (!result.ok) return null;
      try {
        const data = JSON.parse(result.body);
        const content = data.content ? decodeBase64(String(data.content)) : '';
        if (!content) return null;
        return {
          url: data.html_url || `https://github.com/${fullName}/blob/${branch}/${path}`,
          title: `${fullName} / ${path}`,
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

async function fetchReleases(fullName: string, results: WebSearchResult[], pageContents: WebPageContent[]): Promise<number> {
  const response = await requestJson(`https://api.github.com/repos/${fullName}/releases?per_page=5`);
  if (!response.ok) return 0;
  try {
    const releases: GitHubRelease[] = JSON.parse(response.body);
    const history = releases
      .filter(release => release.tag_name)
      .map(release => [
        `版本：${release.tag_name}`,
        `名称：${release.name || release.tag_name}`,
        `类型：${release.prerelease ? '预发布' : '正式发布'}`,
        release.published_at ? `发布时间：${release.published_at}` : '',
        release.body || '',
      ].filter(Boolean).join('；'))
      .join('\n');
    if (history) {
      pageContents.push({
        url: `https://github.com/${fullName}/releases`,
        title: `GitHub Release History: ${fullName}`,
        content: cleanText(history, 9000),
      });
    }
    for (const release of releases) {
      if (!release.html_url || !release.tag_name) continue;
      pushResult(
        results,
        `GitHub Release: ${fullName} ${release.tag_name}`,
        release.html_url,
        [release.name || '', release.prerelease ? '预发布版本' : '正式发布', release.published_at ? `发布时间：${release.published_at}` : '', release.body || ''].filter(Boolean).join('；'),
        93,
      );
    }
    return releases.length;
  } catch {
    return 0;
  }
}

async function fetchCommitHistory(
  fullName: string,
  query: string,
  results: WebSearchResult[],
  pageContents: WebPageContent[],
): Promise<number> {
  const response = await requestJson(`https://api.github.com/repos/${fullName}/commits?per_page=8`);
  if (!response.ok) return 0;

  try {
    const commits: GitHubCommit[] = JSON.parse(response.body);
    const relevant = commits
      .filter(commit => commit.sha && commit.html_url)
      .slice(0, 8);

    for (const commit of relevant) {
      const message = commit.message || commit.commit?.message || '';
      const author = commit.author?.login || commit.commit?.author?.name || 'unknown';
      const date = commit.commit?.author?.date || '';
      pushResult(
        results,
        `GitHub Commit: ${fullName} ${commit.sha!.slice(0, 7)}`,
        commit.html_url!,
        [message.split('\n')[0], `作者：${author}`, date ? `时间：${date}` : ''].filter(Boolean).join('；'),
        94,
      );
    }

    if (relevant.length) {
      pageContents.push({
        url: `https://github.com/${fullName}/commits`,
        title: `GitHub Commit History: ${fullName}`,
        content: cleanText(
          relevant.map(commit => {
            const message = commit.message || commit.commit?.message || '';
            const author = commit.author?.login || commit.commit?.author?.name || 'unknown';
            const date = commit.commit?.author?.date || '';
            return [
              `Commit: ${commit.sha!.slice(0, 12)}`,
              `时间：${date || 'unknown'}`,
              `作者：${author}`,
              `消息：${message}`,
              `链接：${commit.html_url}`,
            ].join('\n');
          }).join('\n\n'),
          10000,
        ),
      });
    }

    const tokens = tokenize(query);
    const candidatePaths = pageContents
      .filter(page => page.title.startsWith(`${fullName} / `))
      .slice(0, 3)
      .map(page => page.title.slice(`${fullName} / `.length))
      .filter(Boolean);

    const pathCommits = await Promise.all(candidatePaths.map(async path => {
      const pathResponse = await requestJson(
        `https://api.github.com/repos/${fullName}/commits?path=${encodeURIComponent(path)}&per_page=5`,
      );
      if (!pathResponse.ok) return [];
      try {
        const items: GitHubCommit[] = JSON.parse(pathResponse.body);
        return items.filter(item => item.sha && item.html_url).slice(0, 5).map(item => ({
          path,
          item,
        }));
      } catch {
        return [];
      }
    }));

    const uniquePathCommits = new Map<string, { path: string; item: GitHubCommit }>();
    pathCommits.flat().forEach(entry => {
      uniquePathCommits.set(entry.item.sha!, entry);
    });

    for (const { path, item } of uniquePathCommits.values()) {
      const message = item.message || item.commit?.message || '';
      pushResult(
        results,
        `GitHub File Commit: ${path} @ ${item.sha!.slice(0, 7)}`,
        item.html_url!,
        [message.split('\n')[0], `关联文件：${path}`, item.commit?.author?.date ? `时间：${item.commit.author.date}` : ''].filter(Boolean).join('；'),
        95,
      );
    }

    if (tokens.length) {
      const matched = relevant.filter(commit => {
        const message = (commit.message || commit.commit?.message || '').toLowerCase();
        return tokens.some(token => message.includes(token));
      });
      if (matched.length) {
        results.forEach(result => {
          if (result.title.startsWith(`GitHub Commit: ${fullName}`) && matched.some(commit => result.url === commit.html_url)) {
            result.score = Math.min(99, (result.score || 94) + 3);
          }
        });
      }
    }

    return relevant.length + uniquePathCommits.size;
  } catch {
    return 0;
  }
}

async function fetchIssuesForRepo(fullName: string, query: string, results: WebSearchResult[]): Promise<{ issues: number; pullRequests: number }> {
  const scopedQuery = query
    .replace(/github\.com[/:][^\s]+/i, '')
    .replace(fullName, '')
    .trim();
  const q = encodeURIComponent(`repo:${fullName}${scopedQuery ? ` ${scopedQuery}` : ''}`);
  const response = await requestJson(`https://api.github.com/search/issues?q=${q}&sort=updated&order=desc&per_page=8`);
  if (!response.ok) return { issues: 0, pullRequests: 0 };

  let issues = 0;
  let pullRequests = 0;
  let commits = 0;
  try {
    const data = JSON.parse(response.body);
    for (const item of (data.items || []) as GitHubIssue[]) {
      if (!item.title || !item.html_url) continue;
      const isPr = Boolean(item.pull_request);
      if (isPr) pullRequests++; else issues++;
      pushResult(
        results,
        `GitHub ${isPr ? 'Pull Request' : 'Issue'}: ${item.title}`,
        item.html_url,
        item.body || `状态：${item.state || 'unknown'}；更新时间：${item.updated_at || 'unknown'}`,
        isPr ? 92 : 90,
      );
    }
  } catch {}
  return { issues, pullRequests };
}


async function fetchIssueDetails(fullName: string, number: number, isPr: boolean): Promise<WebPageContent[]> {
  const pages: WebPageContent[] = [];
  const detail = await requestJson(`https://api.github.com/repos/${fullName}/issues/${number}`);
  if (detail.ok) {
    try {
      const item = JSON.parse(detail.body) as GitHubIssue;
      if (item.html_url) {
        pages.push({
          url: item.html_url,
          title: `GitHub ${isPr ? 'Pull Request' : 'Issue'} Detail: ${item.title || number}`,
          content: cleanText([
            `状态：${item.state || 'unknown'}`,
            `更新时间：${item.updated_at || 'unknown'}`,
            item.body || '',
          ].join('\n'), 7000),
        });
      }
    } catch {}
  }

  if (isPr) {
    const files = await requestJson(`https://api.github.com/repos/${fullName}/pulls/${number}/files?per_page=10`);
    if (files.ok) {
      try {
        const items = JSON.parse(files.body) || [];
        for (const file of items) {
          if (!file.filename) continue;
          pages.push({
            url: file.blob_url || `https://github.com/${fullName}/pull/${number}/files`,
            title: `GitHub PR ${number} diff: ${file.filename}`,
            content: cleanText([
              `文件：${file.filename}`,
              `变更：+${file.additions || 0} / -${file.deletions || 0}`,
              file.patch || '补丁内容不可用',
            ].join('\n'), 7000),
          });
        }
      } catch {}
    }
  }

  return pages;
}

async function enrichTopIssuesAndPullRequests(
  fullName: string,
  results: WebSearchResult[],
  pageContents: WebPageContent[],
): Promise<void> {
  const candidates = results
    .filter(item => item.title.startsWith('GitHub Issue:') || item.title.startsWith('GitHub Pull Request:'))
    .slice(0, 4);

  await Promise.all(candidates.map(async item => {
    const match = item.url.match(/github\.com\/[^/]+\/[^/]+\/(issues|pull)\/(\d+)/i);
    if (!match) return;
    const number = Number(match[2]);
    if (!Number.isFinite(number)) return;
    const details = await fetchIssueDetails(fullName, number, match[1].toLowerCase() === 'pull');
    pageContents.push(...details);
  }));
}

export async function performGitHubResearch(rawQuery: string): Promise<GitHubResearchResponse> {
  const query = rawQuery.trim().slice(0, 160);
  if (!query) {
    return { results: [], pageContents: [], repositories: [], issues: 0, pullRequests: 0, releases: 0, commits: 0, sourceFiles: 0 };
  }

  const repoRef = looksLikeRepoRef(query);
  const searchQuery = encodeURIComponent(repoRef ? query.replace(repoRef, '').trim() || repoRef : query);
  const results: WebSearchResult[] = [];
  const pageContents: WebPageContent[] = [];
  const repositories: string[] = [];

  let repoItems: GitHubSearchRepository[] = [];

  if (repoRef) {
    const repoResponse = await requestJson(`https://api.github.com/repos/${repoRef}`);
    if (repoResponse.ok) {
      try {
        const repo = JSON.parse(repoResponse.body) as GitHubSearchRepository;
        if (repo.full_name && repo.html_url) repoItems = [repo];
      } catch {}
    }
  } else {
    const repoResponse = await requestJson(`https://api.github.com/search/repositories?q=${searchQuery}&sort=stars&order=desc&per_page=5`);
    if (repoResponse.ok) {
      try {
        repoItems = JSON.parse(repoResponse.body).items || [];
      } catch {}
    }
  }

  for (const repo of repoItems) {
    if (!repo.full_name || !repo.html_url) continue;
    repositories.push(repo.full_name);
    pushResult(
      results,
      `GitHub Repository: ${repo.full_name}`,
      repo.html_url,
      [repo.description ? cleanText(repo.description, 500) : '', repo.language ? `语言：${repo.language}` : '', typeof repo.stargazers_count === 'number' ? `Stars：${repo.stargazers_count}` : '', repo.updated_at ? `更新时间：${repo.updated_at}` : ''].filter(Boolean).join('；') || 'GitHub 开源仓库',
      97,
    );
  }

  let issues = 0;
  let pullRequests = 0;
  let commits = 0;

  if (repoRef) {
    const scoped = await fetchIssuesForRepo(repoRef, query, results);
    issues += scoped.issues;
    pullRequests += scoped.pullRequests;
  } else {
    const issueResponse = await requestJson(`https://api.github.com/search/issues?q=${searchQuery}&sort=updated&order=desc&per_page=8`);
    if (issueResponse.ok) {
      try {
        for (const item of (JSON.parse(issueResponse.body).items || []) as GitHubIssue[]) {
          if (!item.title || !item.html_url) continue;
          const isPr = Boolean(item.pull_request);
          if (isPr) pullRequests++; else issues++;
          pushResult(results, `GitHub ${isPr ? 'Pull Request' : 'Issue'}: ${item.title}`, item.html_url, item.body || `状态：${item.state || 'unknown'}`, isPr ? 91 : 89);
        }
      } catch {}
    }
  }

  const targets = Array.from(new Set([...(repoRef ? [repoRef] : []), ...repositories.slice(0, 3)])).slice(0, 3);
  for (const fullName of targets) {
    const repoMeta = await requestJson(`https://api.github.com/repos/${fullName}`);
    let branch = 'HEAD';
    if (repoMeta.ok) {
      try {
        branch = JSON.parse(repoMeta.body).default_branch || 'HEAD';
      } catch {}
    }

    const [readme, files] = await Promise.all([
      fetchReadme(fullName),
      fetchRepositoryFiles(fullName, branch, query),
    ]);

    if (readme) pageContents.push(readme);
    pageContents.push(...files);

    await fetchReleases(fullName, results, pageContents);
    commits += await fetchCommitHistory(fullName, query, results, pageContents);

    await enrichTopIssuesAndPullRequests(fullName, results, pageContents);
  }

  return {
    results,
    pageContents,
    repositories,
    issues,
    pullRequests,
    releases: results.filter(item => item.title.startsWith('GitHub Release:')).length,
    commits,
    sourceFiles: pageContents.filter(item => item.title.includes(' / ')).length,
  };
}
