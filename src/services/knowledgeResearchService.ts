import { performResearch } from './researchAgent';
import { searchContext7, formatContext7Grounding } from './context7Service';

const TECHNICAL_TERMS = ['api','sdk','npm','node','react','android','python','typescript','javascript','kotlin','java','gradle','github','error','exception','package','library','framework','version','代码','编程','开发','报错','依赖','接口','安卓','构建','编译'];

export function isTechnicalKnowledgeQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  return TECHNICAL_TERMS.some(term => normalized.includes(term));
}

export async function runKnowledgeResearch(
  query: string,
  webEnabled: boolean,
  context7Enabled: boolean,
  apiKey?: string,
  searchEngines?: any[],
  activeSearchEngineId?: string,
) {
  const web = webEnabled ? await performResearch(query, searchEngines, activeSearchEngineId) : undefined;
  const docs = context7Enabled && isTechnicalKnowledgeQuery(query)
    ? await searchContext7(query, undefined, undefined, undefined, apiKey)
    : undefined;
  const context7Grounding = docs && docs.success ? formatContext7Grounding(docs.data) : '';
  return { web, context7Grounding };
}
