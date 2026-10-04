import { BaseAdapter } from './base';
import { OpenAIAdapter } from './openai';
import { GeminiAdapter } from './gemini';

const openaiAdapter = new OpenAIAdapter();
const geminiAdapter = new GeminiAdapter();

export function getAdapterForProvider(providerId: string): BaseAdapter {
  switch (providerId) {
    case 'google':
    case 'gemini':
      return geminiAdapter;
    default:
      // OpenAI, DeepSeek, Moonshot, Qwen, Zhipu, SiliconFlow, OpenRouter, NVIDIA, Groq, Custom
      return openaiAdapter;
  }
}

export * from './base';
export * from './openai';
export * from './gemini';
