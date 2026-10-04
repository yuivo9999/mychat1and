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
export async function searchContext7(query: string, library?: string): Promise<{ success: true; data: Context7SearchResult } | { success: false; error: string; status?: number }> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return { success: false, error: 'Context7 查询为空。' };
  try {
    const response = await fetch('/api/context7/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: cleanQuery.slice(0, 2000), library: library?.trim() || undefined }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return { success: false, status: response.status, error: payload?.error || payload?.message || `Context7 请求失败（HTTP ${response.status}）。` };
    return { success: true, data: payload as Context7SearchResult };
  } catch (error: any) {
    return { success: false, error: error?.message || '无法连接到 Context7 服务。' };
  }
}
export function formatContext7Grounding(data: Context7SearchResult): string {
  const sections: string[] = [];
  const info = (data.infoSnippets || []).slice(0, 5);
  const code = (data.codeSnippets || []).slice(0, 5);
  if (info.length) sections.push('【Context7 官方文档依据】\n' + info.map((item, index) => `- ${item.breadcrumb || item.pageId || `文档 ${index + 1}`}\n${(item.content || '').slice(0, 1800)}`).join('\n\n'));
  if (code.length) sections.push('【Context7 官方代码示例】\n' + code.map((item, index) => {
    const title = item.codeTitle || item.pageTitle || `示例 ${index + 1}`;
    const fence = String.fromCharCode(96).repeat(3);
    const snippets = (item.codeList || []).slice(0, 3).map(s =>
      fence + (s.language || item.codeLanguage || '') + '\\n' + (s.code || '').slice(0, 3000) + '\\n' + fence
    ).join('\\n');
    return `### ${title}\n${item.codeDescription || ''}\n${snippets}`;
  }).join('\n\n'));
  return sections.join('\n\n');
}
