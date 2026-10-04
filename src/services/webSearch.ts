import { SearchEngineItem } from '../types';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  sourceType?: 'search' | 'news' | 'wiki' | 'page';
  domain?: string;
  score?: number;
  freshness?: 'fresh' | 'recent' | 'unknown';
}

export interface WebPageContent {
  url: string;
  title: string;
  content: string;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
  pageContents: WebPageContent[];
}

interface NativeHttpResponse {
  ok: boolean;
  status: number;
  body: string;
  headers?: Record<string, string>;
  error?: string;
}

function isAndroidRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).MyChatAndroid?.httpRequest);
}

async function requestText(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {}
): Promise<NativeHttpResponse> {
  if (isAndroidRuntime()) {
    try {
      const raw = (window as any).MyChatAndroid.httpRequest(
        url,
        options.method || 'GET',
        JSON.stringify(options.headers || {}),
        options.body || '',
        options.timeoutMs || 8000,
      );
      return JSON.parse(raw);
    } catch (error: any) {
      return { ok: false, status: 0, body: '', error: error?.message || 'Native HTTP request failed' };
    }
  }

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
    };
  } catch (error: any) {
    return { ok: false, status: 0, body: '', error: error?.message || 'HTTP request failed' };
  }
}

function cleanHtmlText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&middot;/g, '·')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTextFromHtml(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? cleanHtmlText(titleMatch[1]) : '网页内容';
  let clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ');
  clean = cleanHtmlText(clean);
  return { title, text: clean.slice(0, 8000) };
}

function parseRssItems(xmlText: string): WebSearchResult[] {
  const items: WebSearchResult[] = [];
  const itemMatches = xmlText.match(/<item>[\s\S]*?<\/item>/gi) || [];
  for (const itemXml of itemMatches.slice(0, 8)) {
    const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i) || itemXml.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
    const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/i);
    const title = titleMatch ? cleanHtmlText(titleMatch[1]) : '';
    const url = linkMatch ? cleanHtmlText(linkMatch[1]) : '';
    const snippet = descMatch ? cleanHtmlText(descMatch[1]) : '';
    if (title && (url || snippet)) items.push({
      title, url, snippet: snippet || `网页资料：${title}`,
      sourceType: 'news', domain: getDomain(url), freshness: classifyFreshness(`${title} ${snippet}`)
    });
  }
  return items;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/\/$/, '');
  }
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return ''; }
}

function tokenize(text: string): string[] {
  return Array.from(new Set(text.toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, ' ')
    .replace(/[^\p{L}\p{N}+#._-]+/gu, ' ')
    .split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2)));
}

function scoreSearchResult(item: WebSearchResult, query: string): number {
  const q = tokenize(query);
  const haystack = tokenize(`${item.title} ${item.snippet} ${item.url}`);
  const hits = q.filter(token => haystack.some(word => word === token || word.includes(token) || token.includes(word))).length;
  let score = q.length ? (hits / q.length) * 70 : 0;
  const domain = getDomain(item.url);
  if (/\.(gov|edu)(\.|$)/i.test(domain)) score += 14;
  if (/github\.com$/i.test(domain)) score += 12;
  if (/^(docs?|developer)\./i.test(domain) || /\.(dev|org)$/i.test(domain)) score += 6;
  if (/wikipedia\.org$/i.test(domain)) score += 5;
  if (item.sourceType === 'news') score += 3;
  return Math.min(100, Math.round(score));
}

function classifyFreshness(text: string): WebSearchResult['freshness'] {
  const year = new Date().getFullYear();
  if (new RegExp(`\\b${year}\\b`).test(text) || new RegExp(`\\b${year - 1}\\b`).test(text)) return 'fresh';
  if (/刚刚|今天|昨日|小时前|分钟|breaking|updated|latest|new/i.test(text)) return 'recent';
  return 'unknown';
}

function parseBingResults(html: string): WebSearchResult[] {
  const items: WebSearchResult[] = [];
  const algoBlocks = html.split(/<li\s+class=["']b_algo["']/i).slice(1);
  for (const block of algoBlocks.slice(0, 8)) {
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a><\/h2>/i);
    const linkMatch = block.match(/<h2[^>]*>[\s\S]*?<a\s+[^>]*href=["']([^"']+)["']/i);
    const snippetMatch = block.match(/<div\s+class=["']b_caption["'][\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) || block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (!titleMatch) continue;
    const title = cleanHtmlText(titleMatch[1]);
    const snippet = snippetMatch ? cleanHtmlText(snippetMatch[1]) : '';
    const url = linkMatch ? linkMatch[1] : '';
    if (title && (url || snippet)) items.push({
      title, url, snippet: snippet || `必应全网检索：${title}`,
      sourceType: 'search', domain: getDomain(url), freshness: classifyFreshness(`${title} ${snippet}`)
    });
  }
  return items;
}

export function extractCleanQuery(text: string): { query: string; urls: string[] } {
  const urlRegex = /https?:\/\/[^\s<>"'()]+/gi;
  const urls: string[] = [];
  let match;
  while ((match = urlRegex.exec(text)) !== null) urls.push(match[0]);

  let query = text.replace(urlRegex, ' ').trim();
  const conversationalFillers = [
    /^(请(您|你)?(帮我|为我)?(在网上|在网络上|联网)?(搜索|查一下|查找|查询|查查|检索)?)/i,
    /^(请问|请教一下|我想了解|我想知道|我想查一下|帮我查一下|帮我搜索一下|你能告诉我|请告诉我)/i,
    /(有哪些|有什么|好不好|怎么样|是什么意思|详细介绍|并总结|列成表格|以表格形式|制作表格|帮我总结|总结一下|分析一下)[？?！!。]*$/i,
  ];
  let deNoised = query;
  for (const re of conversationalFillers) deNoised = deNoised.replace(re, ' ').trim();
  if (deNoised.length >= 2) query = deNoised;
  query = query.replace(/[，。！？、\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!query && urls.length > 0) {
    try { query = new URL(urls[0]).hostname.replace(/^www\./, ''); } catch { query = urls[0]; }
  }
  if (query.length > 80) query = query.slice(0, 80);
  return { query: query || text.slice(0, 60), urls };
}

async function crawl(url: string, timeoutMs: number): Promise<WebPageContent | null> {
  const response = await requestText(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36' },
    timeoutMs,
  });
  if (!response.ok || !response.body) return null;
  const { title, text } = extractTextFromHtml(response.body);
  return text ? { url, title, content: text } : null;
}

async function performNativeSearch(
  query: string,
  urls: string[],
  searchEngines?: SearchEngineItem[],
): Promise<WebSearchResponse> {
  const results: WebSearchResult[] = [];
  const pageContents: WebPageContent[] = [];
  const engineList = Array.isArray(searchEngines) && searchEngines.length > 0
    ? searchEngines
    : [
        { id: 'bing', enabled: true, type: 'bing' },
        { id: 'google', enabled: true, type: 'google' },
      ];

  const tasks: Promise<void>[] = [];

  for (const targetUrl of urls.slice(0, 3)) {
    tasks.push((async () => {
      const page = await crawl(targetUrl, 10000);
      if (page) pageContents.push(page);
    })());
  }

  const bingEnabled = engineList.some((e: any) => (e.id === 'bing' || e.type === 'bing') && e.enabled !== false);
  if (bingEnabled) {
    tasks.push((async () => {
      const response = await requestText(`https://www.bing.com/search?q=${encodeURIComponent(query)}&ensearch=0`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cookie': 'SRCHHPGUSR=ADLT=OFF&NRSLT=20;',
        },
        timeoutMs: 10000,
      });
      if (response.ok) results.push(...parseBingResults(response.body));
    })());
    tasks.push((async () => {
      const response = await requestText(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' },
        timeoutMs: 10000,
      });
      if (response.ok) results.push(...parseRssItems(response.body));
    })());
  }

  const googleEnabled = engineList.some((e: any) => (e.id === 'google' || e.type === 'google') && e.enabled !== false);
  if (googleEnabled) {
    tasks.push((async () => {
      const response = await requestText(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' },
        timeoutMs: 10000,
      });
      if (response.ok) results.push(...parseRssItems(response.body));
    })());
  }

  const wikiEnabled = engineList.some((e: any) => e.id === 'wikipedia' && e.enabled);
  if (wikiEnabled) {
    tasks.push((async () => {
      const response = await requestText(`https://zh.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&namespace=0&format=json&origin=*`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' },
        timeoutMs: 10000,
      });
      if (!response.ok) return;
      try {
        const data = JSON.parse(response.body);
        const titles: string[] = data[1] || [];
        const snippets: string[] = data[2] || [];
        const links: string[] = data[3] || [];
        for (let i = 0; i < titles.length; i++) {
          if (titles[i] && links[i]) results.push({
            title: titles[i], url: links[i], snippet: snippets[i] || `维基百科词条：${titles[i]}`,
            sourceType: 'wiki', domain: getDomain(links[i]), freshness: 'unknown'
          });
        }
      } catch {}
    })());
  }

  for (const customEng of engineList.filter((e: any) => e.enabled && e.url && !['bing', 'google', 'wikipedia'].includes(e.id))) {
    tasks.push((async () => {
      const targetUrl = customEng.url.replace('{query}', encodeURIComponent(query));
      const response = await requestText(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' },
        timeoutMs: 10000,
      });
      if (response.ok && response.body.includes('<item>')) results.push(...parseRssItems(response.body));
    })());
  }

  await Promise.allSettled(tasks);

  // Research-grade ranking: canonical dedupe + relevance scoring + source diversity.
  const uniqueMap = new Map<string, WebSearchResult>();
  const seenTitles = new Set<string>();
  for (const raw of results) {
    const title = raw.title.trim();
    const url = raw.url.trim();
    if (!title || seenTitles.has(title.toLowerCase())) continue;
    seenTitles.add(title.toLowerCase());
    const enriched: WebSearchResult = {
      ...raw,
      title,
      url,
      domain: raw.domain || getDomain(url),
      score: scoreSearchResult(raw, query),
      freshness: raw.freshness || classifyFreshness(`${title} ${raw.snippet}`),
    };
    const key = normalizeUrl(url) || title.toLowerCase();
    const previous = uniqueMap.get(key);
    if (!previous || (enriched.score || 0) > (previous.score || 0)) uniqueMap.set(key, enriched);
  }

  const ranked = Array.from(uniqueMap.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
  const uniqueResults: WebSearchResult[] = [];
  const domainCounts = new Map<string, number>();
  for (const item of ranked) {
    const domain = item.domain || getDomain(item.url) || 'unknown';
    const count = domainCounts.get(domain) || 0;
    if (count >= 3) continue;
    domainCounts.set(domain, count + 1);
    uniqueResults.push(item);
    if (uniqueResults.length >= 12) break;
  }

  // Research pass: read up to four high-value, distinct pages rather than two arbitrary results.
  const candidates = uniqueResults
    .filter(r => r.url.startsWith('http') && !/youtube\\.com|bilibili\\.com|bing\\.com|google\\.com/i.test(r.url))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 4);
  const crawled = await Promise.all(candidates.map(item => crawl(item.url, 7000)));
  pageContents.push(...crawled.filter(Boolean) as WebPageContent[]);

  return { query, results: uniqueResults, pageContents };
}

export async function performWebSearch(
  rawText: string,
  searchEngines?: SearchEngineItem[],
  activeSearchEngineId?: string
): Promise<WebSearchResponse> {
  const { query, urls } = extractCleanQuery(rawText);

  if (isAndroidRuntime()) {
    return performNativeSearch(query, urls, searchEngines);
  }

  try {
    const res = await fetch('/api/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, rawText, urls, searchEngines, activeSearchEngineId }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && (Array.isArray(data.results) || Array.isArray(data.pageContents))) {
        return { query: data.query || query, results: data.results || [], pageContents: data.pageContents || [] };
      }
    }
  } catch (err) {
    console.warn('Backend /api/web-search unreachable, trying fallback...', err);
  }

  try {
    const wikiUrl = `https://zh.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&namespace=0&format=json&origin=*`;
    const wikiRes = await fetch(wikiUrl);
    if (wikiRes.ok) {
      const data = await wikiRes.json();
      const titles: string[] = data[1] || [];
      const snippets: string[] = data[2] || [];
      const links: string[] = data[3] || [];
      const results: WebSearchResult[] = [];
      for (let i = 0; i < titles.length; i++) {
        if (titles[i] && links[i]) results.push({ title: titles[i], snippet: snippets[i] || `维基百科词条：${titles[i]}`, url: links[i] });
      }
      if (results.length > 0) return { query, results, pageContents: [] };
    }
  } catch (fallbackErr) {
    console.warn('Fallback search error:', fallbackErr);
  }

  return { query, results: [], pageContents: [] };
}

export function buildWebSearchContext(response: WebSearchResponse): string {
  const { results, pageContents, query } = response;
  if (results.length === 0 && pageContents.length === 0) return '';

  const sections: string[] = [];
  sections.push(`【联网研究资料 (检索词: "${query}")】`);
  sections.push('以下资料经过多来源检索、去重、相关性排序与页面抓取；优先使用高相关度与权威来源。\n');

  if (pageContents.length > 0) {
    sections.push('--- 用户指定网页抓取内容 ---');
    pageContents.forEach((page, i) => {
      sections.push(`[网页 ${i + 1}] 标题: ${page.title}\n网址: ${page.url}\n正文提取:\n${page.content.slice(0, 3000)}\n`);
    });
  }
  if (results.length > 0) {
    sections.push('--- 互联网搜索结果摘要 ---');
    results.forEach((r, i) => {
      sections.push(`[来源 ${i + 1}] 相关度: ${r.score ?? 0}/100 | 类型: ${r.sourceType || 'search'} | 域名: ${r.domain || getDomain(r.url)} | 新鲜度: ${r.freshness || 'unknown'}\n标题: ${r.title}\n网址: ${r.url}\n摘要: ${r.snippet}`);
    });
  }

  sections.push('\n【AI 回答指引】');
  sections.push('1. 当前已开启「访问网络」模式：优先使用高相关度、权威且较新的资料。');
  sections.push('2. 对关键事实尽量跨来源验证；若来源互相矛盾，明确指出冲突，不要自行编造结论。');
  sections.push('3. 如果引用上述资料中的数据或事实，请以 [1]、[2] 等格式标注，并在回答末尾附上参考网页链接。');
  sections.push('4. 若网络资料中未提及相关信息，请客观说明，不要把搜索摘要当作已验证事实。');
  return sections.join('\n');
}
