export interface Context7CodeSnippet {
  codeTitle?: string;
  codeDescription?: string;
  codeLanguage?: string;
  pageTitle?: string;
  sourceFile?: string;
  codeList?: Array<{ language?: string; code?: string }>;
}
export interface Context7InfoSnippet {
  pageId?: string;
  breadcrumb?: string;
  content?: string;
}
export interface Context7SearchResult {
  codeSnippets?: Context7CodeSnippet[];
  infoSnippets?: Context7InfoSnippet[];
  rules?: unknown;
  version?: unknown;
}

interface NativeHttpResponse {
  ok: boolean;
  status: number;
  body: string;
  headers?: Record<string, string>;
  error?: string;
}

function getAndroidHttp(): ((url: string, method: string, headersJson: string, body: string, timeoutMs: number) => string) | null {
  return typeof window !== 'undefined' && typeof (window as any).MyChatAndroid?.httpRequest === 'function'
    ? (window as any).MyChatAndroid.httpRequest.bind((window as any).MyChatAndroid)
    : null;
}

function parseNativeResponse(raw: string): NativeHttpResponse {
  try {
    return JSON.parse(raw);
  } catch {
    return { ok: false, status: 0, body: '', error: 'Android HTTP 返回了无效响应。' };
  }
}

export async function searchContext7(
  query: string,
  library?: string,
  language?: string,
  version?: string,
  apiKey?: string,
): Promise<{ success: true; data: Context7SearchResult } | { success: false; error: string; status?: number }> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return { success: false, error: 'Context7 查询为空。' };

  const params = new URLSearchParams({
    query: cleanQuery.slice(0, 2000),
    type: 'json',
  });
  if (library?.trim()) params.set('library', library.trim().slice(0, 200));
  if (language?.trim()) params.set('language', language.trim().slice(0, 80));
  if (version?.trim()) params.set('version', version.trim().slice(0, 80));

  try {
    const nativeHttp = getAndroidHttp();

    if (nativeHttp) {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
      const response = parseNativeResponse(nativeHttp(
        `https://context7.com/api/v3/search?${params.toString()}`,
        'GET',
        JSON.stringify(headers),
        '',
        10000,
      ));
      const payload = response.body ? JSON.parse(response.body) : null;

      if (response.status === 404) {
        return { success: false, status: 404, error: 'Context7 未找到匹配的官方文档。' };
      }
      if (!response.ok) {
        if (response.status === 429) {
          return { success: false, status: 429, error: 'Context7 请求频率受限，请稍后重试。' };
        }
        return {
          success: false,
          status: response.status,
          error: payload?.message || payload?.error || response.error || `Context7 请求失败（HTTP ${response.status}）。`,
        };
      }
      if (!payload || typeof payload !== 'object') {
        return { success: false, status: 502, error: 'Context7 返回了无法解析的响应。' };
      }
      return { success: true, data: payload as Context7SearchResult };
    }

    const response = await fetch('/api/context7/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: cleanQuery.slice(0, 2000),
        apiKey: apiKey?.trim() || undefined,
        library: library?.trim() || undefined,
        language: language?.trim() || undefined,
        version: version?.trim() || undefined,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: payload?.error || payload?.message || `Context7 请求失败（HTTP ${response.status}）。`,
      };
    }
    return { success: true, data: payload as Context7SearchResult };
  } catch (error: any) {
    return { success: false, error: error?.message || '无法连接到 Context7 服务。' };
  }
}

export function formatContext7Grounding(data: Context7SearchResult): string {
  const sections: string[] = [];
  const info = (data.infoSnippets || []).slice(0, 5);
  const code = (data.codeSnippets || []).slice(0, 5);

  if (info.length) {
    sections.push(
      '【Context7 官方文档依据】\n' +
      info.map((item, index) =>
        `- ${item.breadcrumb || item.pageId || `文档 ${index + 1}`}\n${(item.content || '').slice(0, 1800)}`
      ).join('\n\n')
    );
  }

  if (code.length) {
    sections.push(
      '【Context7 官方代码示例】\n' +
      code.map((item, index) => {
        const title = item.codeTitle || item.pageTitle || `示例 ${index + 1}`;
        const fence = String.fromCharCode(96).repeat(3);
        const snippets = (item.codeList || []).slice(0, 3).map(s =>
          fence + (s.language || item.codeLanguage || '') + '\n' +
          (s.code || '').slice(0, 3000) + '\n' + fence
        ).join('\n');
        return `### ${title}\n${item.codeDescription || ''}\n${snippets}`;
      }).join('\n\n')
    );
  }

  return sections.join('\n\n');
}
