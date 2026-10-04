import { performResearch, ResearchResponse } from './researchAgent';
import { SearchEngineItem } from '../types';
import { searchContext7, formatContext7Grounding } from './context7Service';
import { performGitHubResearch } from './githubResearchService';

const TECHNICAL_TERMS = ['api','sdk','npm','node','react','android','python','typescript','javascript','kotlin','java','gradle','github','error','exception','package','library','framework','version','代码','编程','开发','报错','依赖','接口','安卓','构建','编译'];

export function isTechnicalKnowledgeQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  return TECHNICAL_TERMS.some(term => normalized.includes(term));
}

export interface UnifiedKnowledgeResearchResult {
  web?: ResearchResponse;
  github?: Awaited<ReturnType<typeof performGitHubResearch>>;
  context7Grounding: string;
}

export async function runKnowledgeResearch(
  query: string,
  webEnabled: boolean,
  context7Enabled: boolean,
  apiKey?: string,
  searchEngines?: SearchEngineItem[],
  activeSearchEngineId?: string,
): Promise<UnifiedKnowledgeResearchResult> {
  const technicalQuery = context7Enabled && isTechnicalKnowledgeQuery(query);

  const [web, github, docs] = await Promise.all([
    webEnabled ? performResearch(query, searchEngines, activeSearchEngineId) : Promise.resolve(undefined),
    webEnabled ? performGitHubResearch(query) : Promise.resolve(undefined),
    technicalQuery ? searchContext7(query, undefined, undefined, undefined, apiKey) : Promise.resolve(undefined),
  ]);

  const context7Grounding = docs && docs.success ? formatContext7Grounding(docs.data) : '';
  return { web, github, context7Grounding };
}

function buildGitHubGrounding(github: UnifiedKnowledgeResearchResult['github']): string {
  if (!github || (github.results.length === 0 && github.pageContents.length === 0)) return '';

  const sections: string[] = [];
  sections.push('【GitHub 专项研究｜主力来源】');
  if (github.repositories.length) {
    sections.push('重点仓库：' + github.repositories.slice(0, 5).join('、'));
  }
  if (github.results.length) {
    sections.push(github.results.map((item, index) =>
      `[GitHub ${index + 1}] ${item.title}\n${item.snippet}\n${item.url}`
    ).join('\n\n'));
  }
  if (github.pageContents.length) {
    sections.push('--- GitHub README / 源码 / Issue / PR / Commit / Release 正文 ---');
    github.pageContents.forEach((page, index) => {
      sections.push(`[GitHub 页面 ${index + 1}] ${page.title}\n网址: ${page.url}\n${page.content.slice(0, 5000)}`);
    });
  }
  sections.push(
    `GitHub 专项统计：${github.repositories.length} 个仓库，${github.issues} 个 Issue，${github.pullRequests} 个 Pull Request，${github.commits} 个 Commit 记录，${github.releases} 个 Release。`
  );
  sections.push(
    'GitHub 历史分析提示：优先结合 Commit → Issue/PR → Release 的时间顺序判断问题何时出现、为何修改以及哪个版本开始生效；若当前源码与历史讨论不一致，以当前源码和最新版本为准。'
  );
  return sections.join('\n');
}

function buildWebGrounding(web: ResearchResponse): string {
  if (!web.results.length && !web.pageContents.length) return '';

  const sections: string[] = [];
  sections.push('【联网研究｜主力来源：普通网页 + 官方网站】');
  if (web.pageContents.length) {
    sections.push('--- 高价值网页正文 ---');
    web.pageContents.forEach((page, index) => {
      sections.push(`[网页 ${index + 1}] ${page.title}\n网址: ${page.url}\n${page.content.slice(0, 4000)}`);
    });
  }
  if (web.results.length) {
    sections.push('--- 搜索结果 ---');
    sections.push(web.results.map((item, index) =>
      `[网页 ${index + 1}] ${item.title}\n${item.snippet}\n${item.url}`
    ).join('\n\n'));
  }
  if (web.conflictHints.length) {
    sections.push('--- 来源冲突提示 ---\n' + web.conflictHints.join('\n'));
  }
  sections.push(`联网研究完成：${web.rounds.length} 轮，研究充分度：${web.sufficient ? '足够' : '有限'}。`);
  return sections.join('\n');
}

export function buildUnifiedKnowledgeGrounding(result: UnifiedKnowledgeResearchResult): string {
  const sections: string[] = [];

  const githubGrounding = buildGitHubGrounding(result.github);
  if (githubGrounding) sections.push(githubGrounding);

  if (result.web) {
    const webGrounding = buildWebGrounding(result.web);
    if (webGrounding) sections.push(webGrounding);
  }

  if (result.context7Grounding.trim()) {
    sections.push('【补充技术文档｜Context7｜非主力来源】\n' + result.context7Grounding.trim());
  }

  if (!sections.length) return '';

  return [
    '## MyChat 统一知识检索结果',
    '来源优先级：GitHub / 官方网页 ＞ 普通联网网页 ＞ Context7 补充文档。',
    '以下资料用于交叉验证与辅助推理；不要把搜索摘要直接当成已验证事实。',
    sections.join('\n\n'),
  ].join('\n');
}
