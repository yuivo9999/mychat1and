import { ModelItem } from '../types';

/**
 * Safely extract the raw model code (e.g., "gpt-4o", "gemini-3.8-flash")
 * from either a ModelItem or a model ID string (which may contain a "providerId::" prefix).
 */
export function getRawModelId(modelOrId: ModelItem | string | undefined | null): string {
  if (!modelOrId) return '';
  const idStr = typeof modelOrId === 'string' ? modelOrId : (modelOrId.rawModelId || modelOrId.id);
  if (!idStr) return '';
  const doubleColonIdx = idStr.indexOf('::');
  if (doubleColonIdx !== -1) {
    return idStr.slice(doubleColonIdx + 2);
  }
  return idStr;
}

/**
 * Build a provider-scoped unique ID for storage in IndexedDB (e.g., "openai::gpt-4o", "custom::gpt-4o").
 */
export function buildUniqueModelId(providerId: string, rawModelId: string): string {
  const cleanRaw = getRawModelId(rawModelId);
  if (!providerId) return cleanRaw;
  return `${providerId}::${cleanRaw}`;
}

/**
 * Accurately determines if a model supports image vision / multimodal recognition.
 */
export function isModelVisionCapable(model: ModelItem | undefined | null, providerId?: string): boolean {
  if (!model) return false;

  // 1. Explicit user or preset override
  if (model.supportsVision === false) return false;
  if (model.supportsVision === true) return true;

  const rawId = getRawModelId(model).toLowerCase();
  const effectiveProvider = (providerId || model.providerId || '').toLowerCase();

  // 2. Explicitly text-only models that DO NOT support vision unless they contain -vl or vision
  const isExplicitlyTextOnly =
    rawId.includes('deepseek') ||
    rawId.includes('o3-mini') ||
    rawId.includes('o1-mini') ||
    rawId.includes('nemotron') ||
    rawId.includes('north-mini-code') ||
    rawId.includes('laguna') ||
    rawId.includes('lfm-') ||
    rawId.includes('ling-') ||
    rawId.includes('llama-3.3') ||
    rawId.includes('llama-3.1') ||
    rawId.includes('llama-3-') ||
    rawId.includes('llama-2') ||
    rawId.includes('mistral') ||
    rawId.includes('mixtral') ||
    rawId.includes('qwen-plus') ||
    rawId.includes('qwen-turbo') ||
    rawId.includes('qwen-max') ||
    rawId.includes('qwen3.8') ||
    rawId.includes('qwen3') ||
    rawId.includes('qwen2.5') ||
    rawId.includes('qwen-2') ||
    rawId.includes('qwen-7') ||
    rawId.includes('qwen-14') ||
    rawId.includes('qwen-32') ||
    rawId.includes('qwen-72');

  if (isExplicitlyTextOnly) {
    // Only vision if explicitly has -vl, vl-, or vision in name
    if (!rawId.includes('-vl') && !rawId.includes('vl-') && !rawId.includes('vision')) {
      return false;
    }
  }

  // 3. Known models that ALWAYS natively support image vision
  if (
    effectiveProvider === 'google' ||
    effectiveProvider === 'gemini' ||
    rawId.includes('gemini') ||
    rawId.includes('gpt-4o') ||
    rawId.includes('chatgpt-4o') ||
    rawId.includes('gpt-4-turbo') ||
    rawId.includes('gpt-4-vision') ||
    rawId.includes('claude-3') ||
    rawId.includes('claude-3-5') ||
    rawId.includes('claude-3.5') ||
    rawId.includes('claude-3-7') ||
    rawId.includes('claude-3.7') ||
    rawId.includes('pixtral') ||
    rawId.includes('-vl') ||
    rawId.includes('vl-') ||
    rawId.includes('-vision') ||
    rawId.includes('omni')
  ) {
    return true;
  }

  return false;
}

/**
 * Determines whether a model supports web search / grounding.
 */
export function isModelWebSearchSupported(
  model: ModelItem | undefined | null,
  providerId?: string
): { supported: boolean; reason?: string } {
  if (!model) {
    return { supported: false, reason: '未选择有效模型' };
  }

  // Explicit false flag
  if (model.supportsWebSearch === false) {
    return { supported: false, reason: `当前模型 [${model.name || model.id}] 已配置不支持联网搜索` };
  }

  const rawId = getRawModelId(model).toLowerCase();

  // Very small context models (< 4000 tokens) cannot fit search grounding context
  if (model.contextWindow && model.contextWindow < 4000) {
    return { supported: false, reason: `当前模型上下文窗口较小（${model.contextWindow} Tokens），无法容纳实时网络检索内容` };
  }

  // Purely embedding or non-chat models
  if (rawId.includes('embedding') || rawId.includes('rerank') || rawId.includes('moderation') || rawId.includes('dall-e') || rawId.includes('tts')) {
    return { supported: false, reason: `当前模型为专用处理模型，不支持网络搜索与对话` };
  }

  return { supported: true };
}

/**
 * Accurately determines if a model supports viewing/reading user-uploaded document & code files.
 */
export function isModelFileCapable(
  model: ModelItem | undefined | null,
  providerId?: string
): { supported: boolean; reason?: string } {
  if (!model) {
    return { supported: false, reason: '未选择有效模型' };
  }

  // Explicit false flag
  if (model.supportsFiles === false) {
    return { supported: false, reason: `当前模型 [${model.name || model.id}] 已配置不支持文件附件` };
  }

  const rawId = getRawModelId(model).toLowerCase();

  // Purely embedding, audio or image generation models
  if (rawId.includes('embedding') || rawId.includes('rerank') || rawId.includes('moderation') || rawId.includes('dall-e') || rawId.includes('tts') || rawId.includes('whisper')) {
    return { supported: false, reason: `当前模型为专用处理模型，不支持分析文件内容` };
  }

  // Micro context models (< 2000 tokens) cannot fit file contents
  if (model.contextWindow && model.contextWindow < 2000) {
    return { supported: false, reason: `当前模型上下文窗口过小（${model.contextWindow} Tokens），无法容纳附件文件` };
  }

  return { supported: true };
}

/**
 * Accurately determines whether a model supports deep reasoning / thinking mode
 * (e.g., DeepSeek-R1, OpenAI o1/o3-mini, Gemini 2.0/2.5/3.8 Thinking, Claude 3.7 Thinking, QwQ, etc.).
 */
export function isModelReasoningSupported(
  model: ModelItem | undefined | null,
  providerId?: string
): boolean {
  if (!model) return false;

  // 1. Explicit user or preset override
  if ((model as any).supportsReasoning === false || (model as any).isReasoningModel === false) return false;
  if ((model as any).supportsReasoning === true || (model as any).isReasoningModel === true) return true;

  const rawId = getRawModelId(model).toLowerCase();
  const effectiveProvider = (providerId || model.providerId || '').toLowerCase();

  // 2. Known models with native reasoning/thinking capability
  if (
    rawId.includes('r1') ||
    rawId.includes('reasoner') ||
    rawId.includes('reasoning') ||
    rawId.includes('thinking') ||
    rawId.includes('qwq') ||
    rawId.includes('o1') ||
    rawId.includes('o3-mini') ||
    rawId.includes('o3') ||
    rawId.includes('o4') ||
    rawId.includes('claude-3-7') ||
    rawId.includes('claude-3.7') ||
    rawId.includes('gemini-2.0-flash-thinking') ||
    rawId.includes('gemini-2.5-pro') ||
    rawId.includes('gemini-2.5-flash') ||
    rawId.includes('gemini-3.8-pro') ||
    rawId.includes('gemini-3.8-flash') ||
    rawId.includes('qwen-max') ||
    rawId.includes('qwen-plus')
  ) {
    return true;
  }

  // Google provider models support reasoning instructions
  if (effectiveProvider === 'google' || effectiveProvider === 'gemini') {
    return true;
  }

  return false;
}
