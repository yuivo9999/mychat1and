import { SearchEngineItem } from '../types';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
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

/**
 * Extracts clean search query text by removing long URLs and conversational noise phrases
 */
export function extractCleanQuery(text: string): { query: string; urls: string[] } {
  const urlRegex = /https?:\/\/[^\s<>"'()]+/gi;
  const urls: string[] = [];
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    urls.push(match[0]);
  }

  // Clean prompt for search engine
  let query = text
    .replace(urlRegex, ' ')
    .trim();

  // Strip conversational fillers at beginning or end
  const conversationalFillers = [
    /^(请(您|你)?(帮我|为我)?(在网上|在网络上|联网)?(搜索|查一下|查找|查询|查查|检索)?)/i,
    /^(请问|请教一下|我想了解|我想知道|我想查一下|帮我查一下|帮我搜索一下|你能告诉我|请告诉我)/i,
    /(有哪些|有什么|好不好|怎么样|是什么意思|详细介绍|并总结|列成表格|以表格形式|制作表格|帮我总结|总结一下|分析一下)[？?！!。]*$/i,
  ];

  let deNoised = query;
  for (const re of conversationalFillers) {
    deNoised = deNoised.replace(re, ' ').trim();
  }

  // If denoised is still non-empty (at least 2 chars), use it, otherwise keep query
  if (deNoised.length >= 2) {
    query = deNoised;
  }

  query = query
    .replace(/[，。！？、\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If query is too short or empty but has URLs, use the domain or path
  if (!query && urls.length > 0) {
    try {
      const u = new URL(urls[0]);
      query = u.hostname.replace(/^www\./, '');
    } catch {
      query = urls[0];
    }
  }

  // Limit query length for search engines
  if (query.length > 80) {
    query = query.slice(0, 80);
  }

  return { query: query || text.slice(0, 60), urls };
}

/**
 * Perform web search through backend proxy or fallback
 */
export async function performWebSearch(
  rawText: string,
  searchEngines?: SearchEngineItem[],
  activeSearchEngineId?: string
): Promise<WebSearchResponse> {
  const { query, urls } = extractCleanQuery(rawText);

  try {
    const res = await fetch('/api/web-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        rawText,
        urls,
        searchEngines,
        activeSearchEngineId,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && (Array.isArray(data.results) || Array.isArray(data.pageContents))) {
        return {
          query: data.query || query,
          results: data.results || [],
          pageContents: data.pageContents || [],
        };
      }
    }
  } catch (err) {
    console.warn('Backend /api/web-search unreachable, trying fallback...', err);
  }

  // Fallback: search Wikipedia API if backend search is unavailable (e.g. static site)
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
        if (titles[i] && links[i]) {
          results.push({
            title: titles[i],
            snippet: snippets[i] || `维基百科词条：${titles[i]}`,
            url: links[i],
          });
        }
      }
      if (results.length > 0) {
        return { query, results, pageContents: [] };
      }
    }
  } catch (fallbackErr) {
    console.warn('Fallback search error:', fallbackErr);
  }

  return { query, results: [], pageContents: [] };
}

/**
 * Builds formatted grounding context prompt from search results
 */
export function buildWebSearchContext(response: WebSearchResponse): string {
  const { results, pageContents, query } = response;
  if (results.length === 0 && pageContents.length === 0) {
    return '';
  }

  const sections: string[] = [];

  sections.push(`【联网实时检索与网页资料 (检索词: "${query}")】`);
  sections.push(`以下是系统刚刚从互联网获取的最新实时网页资料与内容，请仔细阅读并充分利用：\n`);

  if (pageContents.length > 0) {
    sections.push(`--- 用户指定网页抓取内容 ---`);
    pageContents.forEach((page, i) => {
      sections.push(`[网页 ${i + 1}] 标题: ${page.title}\n网址: ${page.url}\n正文提取:\n${page.content.slice(0, 3000)}\n`);
    });
  }

  if (results.length > 0) {
    sections.push(`--- 互联网搜索结果摘要 ---`);
    results.forEach((r, i) => {
      sections.push(`[来源 ${i + 1}] 标题: ${r.title}\n网址: ${r.url}\n摘要: ${r.snippet}`);
    });
  }

  sections.push(`\n【AI 回答指引】`);
  sections.push(`1. 当前已开启「访问网络」模式，请结合上述最新的互联网信息与网页资料，直接准确回答用户问题。`);
  sections.push(`2. 如果引用了上述资料中的数据或事实，请在回答中以 [1]、[2] 等格式标注，并在回答末尾附上参考网页链接。`);
  sections.push(`3. 若网络资料中未提及相关信息，请客观说明。`);

  return sections.join('\n');
}
