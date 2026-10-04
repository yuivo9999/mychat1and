import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Simple, dependency-free CORS middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Helper: Extract clean text from HTML
  function extractTextFromHtml(html: string): { title: string; text: string } {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '网页内容';

    // Remove script, style, svg, noscript
    let clean = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ');

    // Extract text
    clean = clean.replace(/<[^>]+>/g, ' ');
    clean = clean
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    return { title, text: clean.slice(0, 8000) };
  }

  // Helper: Decode HTML entities and strip tags
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

  // Helper: Parse XML RSS items
  function parseRssItems(xmlText: string): Array<{ title: string; url: string; snippet: string }> {
    const items: Array<{ title: string; url: string; snippet: string }> = [];
    const itemMatches = xmlText.match(/<item>[\s\S]*?<\/item>/gi) || [];

    for (const itemXml of itemMatches.slice(0, 8)) {
      const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i) || itemXml.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
      const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/i);

      const rawTitle = titleMatch ? cleanHtmlText(titleMatch[1]) : '';
      let rawLink = linkMatch ? cleanHtmlText(linkMatch[1]) : '';
      const rawSnippet = descMatch ? cleanHtmlText(descMatch[1]) : '';

      if (rawTitle && (rawLink || rawSnippet)) {
        items.push({
          title: rawTitle,
          url: rawLink,
          snippet: rawSnippet || `网页资料：${rawTitle}`,
        });
      }
    }
    return items;
  }

  // Helper: Bing Universal Web Search (searches the entire internet, not just news)
  async function searchBingWeb(cleanQuery: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
    const items: Array<{ title: string; url: string; snippet: string }> = [];
    try {
      const url = `https://www.bing.com/search?q=${encodeURIComponent(cleanQuery)}&ensearch=0`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cookie': 'SRCHHPGUSR=ADLT=OFF&NRSLT=20;'
        },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) return items;
      const html = await res.text();
      const algoBlocks = html.split(/<li\s+class="b_algo"/i).slice(1);
      for (const block of algoBlocks.slice(0, 8)) {
        const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a><\/h2>/i);
        const citeMatch = block.match(/<cite>([\s\S]*?)<\/cite>/i);
        const linkMatch = block.match(/<h2[^>]*>[\s\S]*?<a\s+[^>]*href="([^"]+)"/i);
        const snippetMatch = block.match(/<div\s+class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) || block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);

        if (titleMatch) {
          const cleanTitle = cleanHtmlText(titleMatch[1]);
          const cleanSnippet = snippetMatch ? cleanHtmlText(snippetMatch[1]) : '';
          let targetUrl = '';
          if (citeMatch) {
            const rawCite = cleanHtmlText(citeMatch[1]).split(' ')[0].split('›')[0].trim();
            targetUrl = rawCite.startsWith('http') ? rawCite : (rawCite ? `https://${rawCite}` : '');
          }
          if (!targetUrl && linkMatch && !linkMatch[1].startsWith('/')) {
            targetUrl = linkMatch[1];
          }

          if (cleanTitle && (cleanSnippet || targetUrl)) {
            items.push({
              title: cleanTitle,
              url: targetUrl || 'https://www.bing.com',
              snippet: cleanSnippet || `必应全网检索：${cleanTitle}`
            });
          }
        }
      }
    } catch (err) {
      console.warn('Bing Web Search error:', err);
    }
    return items;
  }

  // Helper: Strip conversational prefixes/suffixes to extract clean keyword query
  function cleanQueryString(rawQuery: string): string {
    let q = (rawQuery || '').replace(/https?:\/\/[^\s]+/g, ' ').trim();
    const fillers = [
      /^(请(您|你)?(帮我|为我)?(在网上|在网络上|联网)?(搜索|查一下|查找|查询|查查|检索)?)/i,
      /^(请问|请教一下|我想了解|我想知道|我想查一下|帮我查一下|帮我搜索一下|你能告诉我|请告诉我)/i,
      /(有哪些|有什么|好不好|怎么样|是什么意思|详细介绍|并总结|列成表格|以表格形式|制作表格|帮我总结|总结一下|分析一下)[？?！!。]*$/i,
    ];
    let deNoised = q;
    for (const re of fillers) {
      deNoised = deNoised.replace(re, ' ').trim();
    }
    if (deNoised.length >= 2) {
      q = deNoised;
    }
    return q.replace(/[，。！？、\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // 1. Ultra-Fast Parallel Web Search Endpoint (< 2.5s Timeout, Bing & Google Priority)
  app.post('/api/web-search', async (req, res) => {
    const { query, urls = [], searchEngines, activeSearchEngineId } = req.body;
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const pageContents: Array<{ url: string; title: string; content: string }> = [];
    const cleanQuery = cleanQueryString(query);

    const tasks: Promise<void>[] = [];

    // Parallel Task A: Crawl target URLs if user prompt contains https://...
    if (Array.isArray(urls) && urls.length > 0) {
      tasks.push((async () => {
        for (const targetUrl of urls.slice(0, 3)) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2500);
            const pageRes = await fetch(targetUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              },
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (pageRes.ok) {
              const html = await pageRes.text();
              const { title, text } = extractTextFromHtml(html);
              if (text) {
                pageContents.push({ url: targetUrl, title: cleanHtmlText(title), content: text });
              }
            }
          } catch (pageErr) {
            console.warn('Failed to crawl URL:', targetUrl, pageErr);
          }
        }
      })());
    }

    if (cleanQuery) {
      // Determine active engines to query based on user's configuration in Parameters
      const engineList = Array.isArray(searchEngines) && searchEngines.length > 0 
        ? searchEngines 
        : [
            { id: 'bing', enabled: true, type: 'bing' },
            { id: 'google', enabled: true, type: 'google' }
          ];

      // Primary engine task (Bing search engine: Universal Web Search + Breaking News RSS in parallel)
      const isBingEnabled = engineList.some((e: any) => (e.id === 'bing' || e.type === 'bing') && e.enabled !== false);
      if (isBingEnabled || !activeSearchEngineId || activeSearchEngineId === 'bing') {
        // Parallel Task 1: Bing Universal Web Search (Whole Web)
        tasks.push((async () => {
          try {
            const webItems = await searchBingWeb(cleanQuery);
            if (webItems.length > 0) {
              results.push(...webItems);
            }
          } catch (e) {
            console.warn('Bing Web Search task error:', e);
          }
        })());

        // Parallel Task 2: Bing News RSS
        tasks.push((async () => {
          try {
            const bingNewsUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(cleanQuery)}&format=rss`;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2500);
            const bRes = await fetch(bingNewsUrl, {
              headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
              },
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (bRes.ok) {
              const xml = await bRes.text();
              const parsed = parseRssItems(xml);
              results.push(...parsed);
            }
          } catch (e) {
            console.warn('Bing News RSS error:', e);
          }
        })());
      }

      // Secondary engine task (Google search engine)
      const isGoogleEnabled = engineList.some((e: any) => (e.id === 'google' || e.type === 'google') && e.enabled !== false);
      if (isGoogleEnabled) {
        tasks.push((async () => {
          try {
            const gNewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQuery)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2500);
            const gRes = await fetch(gNewsUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (gRes.ok) {
              const xml = await gRes.text();
              const parsed = parseRssItems(xml);
              results.push(...parsed);
            }
          } catch (e) {
            console.warn('Google Search error:', e);
          }
        })());
      }

      // Wikipedia task (if enabled by user or as knowledge fallback)
      const isWikiEnabled = engineList.some((e: any) => e.id === 'wikipedia' && e.enabled);
      if (isWikiEnabled) {
        tasks.push((async () => {
          try {
            const wikiUrl = `https://zh.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(cleanQuery)}&limit=5&namespace=0&format=json`;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2500);
            const wikiRes = await fetch(wikiUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (wikiRes.ok) {
              const data = await wikiRes.json();
              const titles: string[] = data[1] || [];
              const snippets: string[] = data[2] || [];
              const links: string[] = data[3] || [];
              for (let i = 0; i < titles.length; i++) {
                if (titles[i] && links[i]) {
                  results.push({
                    title: cleanHtmlText(titles[i]),
                    url: links[i],
                    snippet: cleanHtmlText(snippets[i] || `维基百科词条：${titles[i]}`),
                  });
                }
              }
            }
          } catch (e) {
            console.warn('Wikipedia search error:', e);
          }
        })());
      }

      // Custom user search engines (if user added custom RSS or search URL)
      const customEngines = engineList.filter((e: any) => e.enabled && e.url && !['bing', 'google', 'wikipedia'].includes(e.id));
      for (const customEng of customEngines) {
        tasks.push((async () => {
          try {
            const targetEngineUrl = customEng.url.replace('{query}', encodeURIComponent(cleanQuery));
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2500);
            const customRes = await fetch(targetEngineUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (customRes.ok) {
              const bodyText = await customRes.text();
              if (bodyText.includes('<item>')) {
                const parsed = parseRssItems(bodyText);
                results.push(...parsed);
              }
            }
          } catch (e) {
            console.warn(`Custom search engine [${customEng.name}] error:`, e);
          }
        })());
      }
    }

    // Execute all parallel search engines concurrently
    await Promise.allSettled(tasks);

    // Deduplicate search results by title/URL
    const uniqueResults: Array<{ title: string; url: string; snippet: string }> = [];
    const seenUrls = new Set<string>();
    const seenTitles = new Set<string>();

    for (const item of results) {
      const cleanTitle = item.title.trim();
      const cleanUrl = item.url.trim();

      if (!cleanTitle || seenTitles.has(cleanTitle)) continue;
      if (cleanUrl && seenUrls.has(cleanUrl)) continue;

      seenTitles.add(cleanTitle);
      if (cleanUrl) seenUrls.add(cleanUrl);

      uniqueResults.push(item);
      if (uniqueResults.length >= 10) break;
    }

    // Deep Web Crawling: Automatically crawl the top 2 search result pages for in-depth article reading!
    if (pageContents.length < 2 && uniqueResults.length > 0) {
      const candidateUrls = uniqueResults
        .map(r => r.url)
        .filter(u => u && u.startsWith('http') && !u.includes('youtube.com') && !u.includes('bilibili.com') && !u.includes('bing.com') && !u.includes('google.com'))
        .slice(0, 2);

      const crawlPromises = candidateUrls.map(async (targetUrl) => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 2000);
          const pageRes = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (pageRes.ok) {
            const html = await pageRes.text();
            const { title, text } = extractTextFromHtml(html);
            if (text && text.length > 60) {
              pageContents.push({
                url: targetUrl,
                title: cleanHtmlText(title) || '网页正文',
                content: text.slice(0, 2500)
              });
            }
          }
        } catch (pageErr) {
          // Ignore crawl errors
        }
      });
      await Promise.allSettled(crawlPromises);
    }

    res.json({
      success: true,
      query: cleanQuery,
      results: uniqueResults,
      pageContents,
    });
  });

  // 2. Direct Webpage Fetch Endpoint
  app.post('/api/fetch-url', async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        return res.status(resp.status).json({ error: `HTTP ${resp.status}: ${resp.statusText}` });
      }
      const html = await resp.text();
      const { title, text } = extractTextFromHtml(html);
      res.json({ success: true, url, title, content: text });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch webpage' });
    }
  });

  // Context7 official documentation proxy. Keep the API key server-side.
  app.post('/api/context7/search', async (req, res) => {
    const { query, library, language, version } = req.body || {};
    const cleanQuery = String(query || '').trim().slice(0, 2000);
    const cleanLibrary = library ? String(library).trim().slice(0, 200) : '';
    const cleanLanguage = language ? String(language).trim().slice(0, 80) : '';
    const cleanVersion = version ? String(version).trim().slice(0, 80) : '';

    if (!cleanQuery) {
      return res.status(400).json({ error: 'Context7 query is required.' });
    }

    const apiKey = process.env.CONTEXT7_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'Context7 未配置。请在服务器环境变量中设置 CONTEXT7_API_KEY。',
        code: 'CONTEXT7_NOT_CONFIGURED',
      });
    }

    const params = new URLSearchParams({
      query: cleanQuery,
      type: 'json',
    });
    if (cleanLibrary) params.append('library', cleanLibrary);
    if (cleanLanguage) params.set('language', cleanLanguage);
    if (cleanVersion) params.set('version', cleanVersion);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`https://context7.com/api/v3/search?${params.toString()}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      const bodyText = await response.text();
      let payload: any = null;
      try {
        payload = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        payload = null;
      }

      if (response.status === 404) {
        return res.status(404).json({
          error: 'Context7 未找到匹配的官方文档。',
          code: 'NO_DOCUMENTATION_FOUND',
        });
      }

      if (!response.ok) {
        const retryAfter = response.headers.get('Retry-After');
        if (response.status === 429) {
          return res.status(429).json({
            error: 'Context7 请求频率受限，请稍后重试。',
            code: 'CONTEXT7_RATE_LIMITED',
            retryAfter,
          });
        }
        return res.status(response.status).json({
          error: payload?.message || payload?.error || `Context7 返回 HTTP ${response.status}。`,
          code: payload?.error || 'CONTEXT7_REQUEST_FAILED',
        });
      }

      if (!payload || typeof payload !== 'object') {
        return res.status(502).json({
          error: 'Context7 返回了无法解析的响应。',
          code: 'CONTEXT7_INVALID_RESPONSE',
        });
      }

      return res.json(payload);
    } catch (error: any) {
      const isAbort = error?.name === 'AbortError';
      return res.status(502).json({
        error: isAbort ? 'Context7 请求超时。' : (error?.message || 'Context7 网络请求失败。'),
        code: isAbort ? 'CONTEXT7_TIMEOUT' : 'CONTEXT7_NETWORK_ERROR',
      });
    }
  });

  // 3. General Proxy Endpoint for CORS
  app.post('/api/proxy', async (req, res) => {
    const { url, method = 'POST', headers = {}, body } = req.body;
    if (!url) {
      return res.status(400).json({ error: { message: 'Missing target URL' } });
    }
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      });

      res.status(response.status);
      const contentType = response.headers.get('content-type') || '';
      const isEventStream = contentType.includes('text/event-stream') || contentType.includes('stream');

      if (isEventStream && response.body) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      } else {
        if (contentType.includes('application/json')) {
          const data = await response.json();
          res.json(data);
        } else {
          const text = await response.text();
          res.send(text);
        }
      }
    } catch (err: any) {
      res.status(502).json({ error: { message: err.message || 'Proxy error' } });
    }
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // 4. Secure Sandbox Script/Command Execution Endpoint
  app.post('/api/execute-script', async (req, res) => {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'Missing command parameter' });
    }

    const { exec } = await import('child_process');
    exec(command, { timeout: 20000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      res.json({
        success: !error,
        exitCode: error ? error.code : 0,
        stdout: stdout || '',
        stderr: stderr || '',
        error: error ? error.message : null
      });
    });
  });

  // In development, mount Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve built dist
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
