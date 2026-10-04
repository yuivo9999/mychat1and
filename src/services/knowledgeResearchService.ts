import { performResearch } from './researchAgent';
import { searchContext7, formatContext7Grounding } from './context7Service';

export async function runKnowledgeResearch(
  query: string,
  webEnabled: boolean,
  context7Enabled: boolean,
  apiKey?: string,
  searchEngines?: any[],
  activeSearchEngineId?: string,
) {
  const web = webEnabled ? await performResearch(query, searchEngines, activeSearchEngineId) : undefined;
  const docs = context7Enabled ? await searchContext7(query, undefined, undefined, undefined, apiKey) : undefined;
  const context7Grounding = docs && docs.success ? formatContext7Grounding(docs.data) : '';
  return { web, context7Grounding };
}
