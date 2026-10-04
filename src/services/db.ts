import { 
  Conversation, 
  ApiKeyConfig, 
  ModelItem, 
  ProviderDefinition, 
  UserSettings,
  SearchEngineItem,
  Project
} from '../types';
import { getRawModelId, buildUniqueModelId } from './modelUtils';

const DB_NAME = 'OmniChatLocalDB';
const DB_VERSION = 4;

export const DEFAULT_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'google',
    name: 'Google Gemini',
    description: 'Google Gemini / Gemma 多模态模型',
    icon: 'Sparkles',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    enabled: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4o-mini, o1, o3-mini 系列强大通用模型',
    icon: 'Bot',
    defaultBaseUrl: 'https://api.openai.com/v1',
    enabled: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek (深度求索)',
    description: 'DeepSeek-V3, DeepSeek-R1 满血版极致推理与代码模型',
    icon: 'Zap',
    defaultBaseUrl: 'https://api.deepseek.com',
    enabled: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: '一站式访问全球数百个前沿与开源模型',
    icon: 'Globe',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    enabled: true,
  },
  {
    id: 'groq',
    name: 'groq.com',
    description: 'Groq.com 免费层高速推理（OpenAI 兼容 API）',
    icon: 'Zap',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    enabled: true,
  },
  {
    id: 'custom',
    name: '自定义 API (OpenAI 兼容)',
    description: '支持任何遵循 OpenAI 格式的第三方或内网网关',
    icon: 'Sliders',
    defaultBaseUrl: '',
    isCustom: true,
    enabled: true,
  },
];

export const DEFAULT_MODELS: ModelItem[] = [
  // Groq.com Free Plan models.
  // Groq.com Free Plan models.
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B (groq.com 免费)',
    providerId: 'groq',
    description: 'Groq.com 免费层 GPT-OSS 120B',
    supportsVision: false,
    supportsFiles: false,
    supportsStreaming: true,
    contextWindow: 131072,
    temperature: 0.7,
  },
  {
    id: 'openai/gpt-oss-20b',
    name: 'GPT-OSS 20B (groq.com 免费)',
    providerId: 'groq',
    description: 'Groq.com 免费层 GPT-OSS 20B',
    supportsVision: false,
    supportsFiles: false,
    supportsStreaming: true,
    contextWindow: 131072,
    temperature: 0.7,
  },
  {
    id: 'openai/gpt-oss-safeguard-20b',
    name: 'GPT-OSS Safeguard 20B (groq.com 免费)',
    providerId: 'groq',
    description: 'Groq.com 免费层 GPT-OSS Safeguard 20B',
    supportsVision: false,
    supportsFiles: false,
    supportsStreaming: true,
    contextWindow: 131072,
    temperature: 0.7,
  },
  {
    id: 'qwen/qwen3.8-27b',
    name: 'Qwen 3.8 27B (groq.com 免费)',
    providerId: 'groq',
    description: 'Groq.com 免费层 Qwen 3.8 27B，多模态',
    supportsVision: true,
    supportsFiles: false,
    supportsStreaming: true,
    contextWindow: 131072,
    temperature: 0.7,
  },
  // NVIDIA current Free Endpoints (verified against NVIDIA Build)
  {
    id: 'z-ai/glm-5-3',
    name: 'GLM 5.3 (NVIDIA Free)',
    providerId: 'nvidia',
    description: 'NVIDIA Free Endpoint：Z.ai GLM 5.3',
    supportsVision: false,
    supportsFiles: false,
    supportsStreaming: true,
    contextWindow: 202752,
    temperature: 0.7,
  },
  {
    id: 'z-ai/glm-5-3-flash',
    name: 'GLM 5.3 Flash (NVIDIA Free)',
    providerId: 'nvidia',
    description: 'NVIDIA Free Endpoint：Z.ai GLM 5.3 Flash，多模态',
    supportsVision: true,
    supportsFiles: true,
    supportsStreaming: true,
    contextWindow: 202752,
    temperature: 0.7,
  },
  {
    id: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    name: 'Nemotron 3.5 Lightning 30B (NVIDIA Free)',
    providerId: 'nvidia',
    description: 'NVIDIA Free Endpoint：Nemotron 3.5 Lightning 30B A3B',
    supportsVision: false,
    supportsFiles: false,
    supportsStreaming: true,
    contextWindow: 131072,
    temperature: 0.7,
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b',
    name: 'Nemotron 3 Super 120B A12B (NVIDIA Free)',
    providerId: 'nvidia',
    description: 'NVIDIA Free Endpoint：Nemotron 3 Super，1M 上下文。',
    supportsVision: false,
    supportsFiles: false,
    supportsStreaming: true,
    contextWindow: 1048576,
    temperature: 1,
  },
  // Google Gemini Models (免费层与最新前沿模型)
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    providerId: 'google',
    description: '谷歌最新一代前沿多模态大模型，具备极高智力与极速响应，官方支持免费层调用',
    supportsVision: true,
    supportsFiles: true,
    supportsStreaming: true,
    contextWindow: 1048576,
    temperature: 0.7,
  },
  {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash (Latest)',
    providerId: 'google',
    description: '官方 Flash 最新稳定版本，多模态综合能力均衡，免费配额最高',
    supportsVision: true,
    supportsFiles: true,
    supportsStreaming: true,
    contextWindow: 1048576,
    temperature: 0.7,
  },
  {
    id: 'gemini-flash-lite-latest',
    name: 'Gemini Flash-Lite',
    providerId: 'google',
    description: '轻量化极低延迟模型，响应迅猛，特别适合日常连通性测试与快速问答',
    supportsVision: true,
    supportsFiles: true,
    supportsStreaming: true,
    contextWindow: 1048576,
    temperature: 0.7,
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    providerId: 'google',
    description: '具备思维链深度推理能力的敏捷多模态模型，支持免费层使用',
    supportsVision: true,
    supportsFiles: true,
    supportsStreaming: true,
    contextWindow: 1048576,
    temperature: 0.7,
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    providerId: 'google',
    description: '稳定高效的 3.6 代模型，免费层支持良好',
    supportsVision: true,
    supportsFiles: true,
    supportsStreaming: true,
    contextWindow: 1048576,
    temperature: 0.7,
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    providerId: 'google',
    description: 'Google Gemini 3.5 Flash，高性价比与快速响应，支持原生多模态与 TXT/文档文件输入',
    supportsVision: true,
    supportsFiles: true,
    supportsStreaming: true,
    contextWindow: 1048576,
    temperature: 0.7,
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    providerId: 'google',
    description: 'Google Gemini 3.5 Flash Lite，轻量超低延迟版本，支持原生多模态与 TXT/文档文件输入',
    supportsVision: true,
    supportsFiles: true,
    supportsStreaming: true,
    contextWindow: 1048576,
    temperature: 0.7,
  },

  // Google Gemini and Gemma models share the Gemini API attachment transport.
  // File routing is centralized in googleFileSupport.ts, not duplicated per model.
  {
    id: 'gemma-4-31b-it',
    name: 'Gemma 4 31B IT',
    providerId: 'google',
    description: 'Google Gemma 4 31B IT，支持原生图像与 PDF/文本文件输入。',
    supportsVision: true,
    supportsFiles: true,
    supportsStreaming: true,
    contextWindow: 262144,
    temperature: 0.7,
  },
  {
    id: 'gemma-4-26b-a4b-it',
    name: 'Gemma 4 26B A4B IT',
    providerId: 'google',
    description: 'Google Gemma 4 26B A4B IT，支持原生图像与 PDF/文本文件输入。',
    supportsVision: true,
    supportsFiles: true,
    supportsStreaming: true,
    contextWindow: 262144,
    temperature: 0.7,
  },

  // OpenRouter current $0/$0 chat-capable free roster.
  // Special-purpose embedding/reranking/safety models are intentionally excluded.
  {
    id: 'openrouter/free',
    name: 'OpenRouter Free Router',
    providerId: 'openrouter',
    description: 'OpenRouter 免费路由：自动选择当前可用的免费模型。',
    supportsVision: true, supportsFiles: false, supportsStreaming: true,
    contextWindow: 200000, temperature: 0.7,
  },
  {
    id: 'stealth/space-bunny-alpha',
    name: 'Space Bunny Alpha (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：原生多模态，支持文本、图片、视频输入。',
    supportsVision: true, supportsFiles: false, supportsStreaming: true,
    contextWindow: 1000000, temperature: 0.7,
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'Nemotron 3 Ultra (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：NVIDIA Nemotron 3 Ultra，1M 上下文。',
    supportsVision: false, supportsFiles: false, supportsStreaming: true,
    contextWindow: 1000000, temperature: 0.7,
  },
  {
    id: 'inclusionai/ling-3.0-flash-fin:free',
    name: 'Ling 3.0 Flash Fin (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：金融方向 Ling 3.0 Flash Fin。',
    supportsVision: false, supportsFiles: false, supportsStreaming: true,
    contextWindow: 262144, temperature: 0.7,
  },
  {
    id: 'poolside/laguna-s-2.1:free',
    name: 'Laguna S 2.1 (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：Poolside Laguna S 2.1，代码/Agent 方向。',
    supportsVision: false, supportsFiles: false, supportsStreaming: true,
    contextWindow: 262144, temperature: 0.7,
  },
  {
    id: 'dots-studio/dots-3-note-preview:free',
    name: 'Dots3-Note Preview (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：支持文本与图片输入的 Dots3-Note Preview。',
    supportsVision: true, supportsFiles: false, supportsStreaming: true,
    contextWindow: 512000, temperature: 0.7,
  },
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    name: 'Nemotron 3.5 Lightning (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：NVIDIA Nemotron 3.5 Lightning。',
    supportsVision: false, supportsFiles: false, supportsStreaming: true,
    contextWindow: 1000000, temperature: 0.7,
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    name: 'Nemotron 3 Super (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：NVIDIA Nemotron 3 Super。',
    supportsVision: false, supportsFiles: false, supportsStreaming: true,
    contextWindow: 262144, temperature: 0.7,
  },
  {
    id: 'inclusionai/ling-3.0-flash-sante:free',
    name: 'Ling 3.0 Flash Sante (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：医疗方向 Ling 3.0 Flash Sante。',
    supportsVision: false, supportsFiles: false, supportsStreaming: true,
    contextWindow: 262144, temperature: 0.7,
  },
  {
    id: 'thinkingmachines/inkling:free',
    name: 'Inkling (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：Thinking Machines Inkling，支持图片/音频多模态输入。',
    supportsVision: true, supportsFiles: false, supportsStreaming: true,
    contextWindow: 1048576, temperature: 0.7,
  },
  {
    id: 'cohere/north-mini-code:free',
    name: 'North Mini Code (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：Cohere North Mini Code，代码与 Agent 方向。',
    supportsVision: false, supportsFiles: false, supportsStreaming: true,
    contextWindow: 256000, temperature: 0.7,
  },
  {
    id: 'thinkingmachines/inkling-small:free',
    name: 'Inkling Small (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：Thinking Machines Inkling Small，支持图片/音频多模态输入。',
    supportsVision: true, supportsFiles: false, supportsStreaming: true,
    contextWindow: 1048576, temperature: 0.7,
  },
  {
    id: 'poolside/laguna-xs-2.1:free',
    name: 'Laguna XS 2.1 (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：Poolside Laguna XS 2.1，代码/Agent 方向。',
    supportsVision: false, supportsFiles: false, supportsStreaming: true,
    contextWindow: 262144, temperature: 0.7,
  },
  {
    id: 'qwen/qwen3.8-27b:free',
    name: 'Qwen3.8 27B (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：Qwen3.8 27B，原生视觉语言模型。',
    supportsVision: true, supportsFiles: false, supportsStreaming: true,
    contextWindow: 262144, temperature: 0.7,
  },
  {
    id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    name: 'Nemotron 3 Nano Omni (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：NVIDIA Nemotron 3 Nano Omni，支持文本、图片、视频、音频输入。',
    supportsVision: true, supportsFiles: false, supportsStreaming: true,
    contextWindow: 256000, temperature: 0.7,
  },
  {
    id: 'liquid/lfm-2.5-2.6b:free',
    name: 'LFM2.5-2.6B (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：Liquid LFM2.5-2.6B。',
    supportsVision: false, supportsFiles: false, supportsStreaming: true,
    contextWindow: 65536, temperature: 0.7,
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    name: 'Gemma 4 26B A4B (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：Google Gemma 4 26B A4B，支持图片/视频输入。',
    supportsVision: true, supportsFiles: false, supportsStreaming: true,
    contextWindow: 262144, temperature: 0.7,
  },
  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Gemma 4 31B (Free)', providerId: 'openrouter',
    description: 'OpenRouter $0 免费模型：Google Gemma 4 31B，支持图片/视频输入。',
    supportsVision: true, supportsFiles: false, supportsStreaming: true,
    contextWindow: 262144, temperature: 0.7,
  },
  // OpenAI
  {
    id: 'gpt-4o',
    name: 'GPT-4o (Omni)',
    providerId: 'openai',
    description: 'OpenAI 旗舰全模态模型，支持视觉分析与深度逻辑',
    supportsVision: true,
    supportsFiles: true,
    supportsStreaming: true,
    contextWindow: 128000,
    temperature: 0.7,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    providerId: 'openai',
    description: '小巧敏捷，日常对话与代码辅助性价比首选',
    supportsVision: true,
    supportsFiles: true,
    supportsStreaming: true,
    contextWindow: 128000,
    temperature: 0.7,
  },
  {
    id: 'o3-mini',
    name: 'o3-mini (Reasoning)',
    providerId: 'openai',
    description: '高智力深度数学、科学与复杂编程推理模型',
    supportsVision: false,
    supportsFiles: true,
    supportsStreaming: true,
    contextWindow: 128000,
  },

  // DeepSeek
  {
    id: 'deepseek-chat',
    name: 'DeepSeek-V3',
    providerId: 'deepseek',
    description: 'DeepSeek 671B 强大通用对话模型',
    supportsVision: false,
    supportsFiles: false,
    supportsStreaming: true,
    contextWindow: 64000,
    temperature: 0.7,
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek-R1 (推理思考)',
    providerId: 'deepseek',
    description: '满血版思维链强化学习推理大模型',
    supportsVision: false,
    supportsFiles: false,
    supportsStreaming: true,
    contextWindow: 64000,
    temperature: 0.6,
  },

];


export const DEFAULT_SEARCH_ENGINES: SearchEngineItem[] = [
  {
    id: 'bing',
    name: 'Bing 搜索引擎 (优先第一选择)',
    enabled: true,
    type: 'bing',
    url: 'https://www.bing.com/news/search?q={query}&format=rss',
    isDefault: true,
  },
  {
    id: 'google',
    name: 'Google 搜索引擎 (第二备选)',
    enabled: true,
    type: 'google',
    url: 'https://news.google.com/rss/search?q={query}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
    isDefault: true,
  },
  {
    id: 'baidu',
    name: 'Baidu 百度搜索',
    enabled: false,
    type: 'baidu',
    url: 'https://www.baidu.com/s?wd={query}',
    isDefault: false,
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia 维基百科',
    enabled: false,
    type: 'wikipedia',
    url: 'https://zh.wikipedia.org/w/api.php?action=opensearch&search={query}&limit=5&namespace=0&format=json',
    isDefault: false,
  },
];

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  fontSize: 'standard',
  chatFontSizePx: 15,
  enterToSend: true,
  autoScroll: true,
  showTimestamps: true,
  showModelName: true,
  enableStreaming: true,
  enableMarkdown: false,
  enableCodeHighlight: true,
  renderLatex: true,
  showLineNumbers: true,
  collapseLongCode: true,
  showStreamingCursor: true,
  compactMode: false,
  boldHeadings: true,
  enableChatContextMemory: false,
  onlyParseMarkdownTables: false,
  codeShowCopyBtn: true,
  codeShowDownloadBtn: true,
  codeShowAddToWorkspaceBtn: true,
  useCodeBox: true,
  useTextBox: true,
  useMarkdownBox: true,
  searchEngines: DEFAULT_SEARCH_ENGINES,
  activeSearchEngineId: 'bing',
  defaultProviderId: 'google',
  defaultModelId: 'gemini-3.8-flash',
  defaultSystemPrompt: '',
  requestTimeout: 300,
  sidebarOpen: true,
};

// Open IndexedDB instance
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('conversations')) {
        const store = db.createObjectStore('conversations', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('isFavorite', 'isFavorite', { unique: false });
      }
      if (!db.objectStoreNames.contains('api_keys')) {
        const store = db.createObjectStore('api_keys', { keyPath: 'id' });
        store.createIndex('providerId', 'providerId', { unique: false });
      }
      if (!db.objectStoreNames.contains('models')) {
        const store = db.createObjectStore('models', { keyPath: 'id' });
        store.createIndex('providerId', 'providerId', { unique: false });
      }
      if (!db.objectStoreNames.contains('providers')) {
        db.createObjectStore('providers', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
      if (!db.objectStoreNames.contains('workspaces')) {
        const store = db.createObjectStore('workspaces', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('projects')) {
        const store = db.createObjectStore('projects', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Project Operations (项目分类与共享记忆管理)
export async function getProjects(): Promise<Project[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      try {
        const request = db.transaction('projects', 'readonly').objectStore('projects').getAll();
        request.onsuccess = () => {
          const list = (request.result as Project[]) || [];
          list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          // Keep localStorage in sync as backup
          try { localStorage.setItem('omnichat_projects_backup', JSON.stringify(list)); } catch {}
          resolve(list);
        };
        request.onerror = () => {
          // Fallback to localStorage
          try {
            const raw = localStorage.getItem('omnichat_projects_backup');
            resolve(raw ? JSON.parse(raw) : []);
          } catch {
            resolve([]);
          }
        };
      } catch {
        try {
          const raw = localStorage.getItem('omnichat_projects_backup');
          resolve(raw ? JSON.parse(raw) : []);
        } catch {
          resolve([]);
        }
      }
    });
  } catch {
    try {
      const raw = localStorage.getItem('omnichat_projects_backup');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

export async function getProject(id: string): Promise<Project | null> {
  const all = await getProjects();
  return all.find(p => p.id === id) || null;
}

export async function saveProject(project: Project): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      try {
        const request = db.transaction('projects', 'readwrite').objectStore('projects').put(project);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  } catch (e) {
    console.warn('IndexedDB saveProject fallback to localStorage:', e);
  }
  // Sync localStorage backup
  try {
    const raw = localStorage.getItem('omnichat_projects_backup');
    const list: Project[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(p => p.id === project.id);
    if (idx >= 0) list[idx] = project;
    else list.unshift(project);
    localStorage.setItem('omnichat_projects_backup', JSON.stringify(list));
  } catch {}
}

export async function deleteProject(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      try {
        const request = db.transaction('projects', 'readwrite').objectStore('projects').delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  } catch (e) {
    console.warn('IndexedDB deleteProject fallback to localStorage:', e);
  }
  try {
    const raw = localStorage.getItem('omnichat_projects_backup');
    if (raw) {
      const list: Project[] = JSON.parse(raw);
      const filtered = list.filter(p => p.id !== id);
      localStorage.setItem('omnichat_projects_backup', JSON.stringify(filtered));
    }
  } catch {}
}

// Workspace Operations
export async function getWorkspaces(): Promise<any[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction('workspaces', 'readonly').objectStore('workspaces').getAll();
    request.onsuccess = () => {
      const list = (request.result as any[]) || [];
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      resolve(list);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getWorkspace(id: string): Promise<any | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction('workspaces', 'readonly').objectStore('workspaces').get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveWorkspace(workspace: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction('workspaces', 'readwrite').objectStore('workspaces').put(workspace);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteWorkspace(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction('workspaces', 'readwrite').objectStore('workspaces').delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Conversation Operations
export async function getConversations(): Promise<Conversation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction('conversations', 'readonly').objectStore('conversations').getAll();
    request.onsuccess = () => {
      const list = (request.result as Conversation[]) || [];
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(list);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction('conversations', 'readonly').objectStore('conversations').get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction('conversations', 'readwrite').objectStore('conversations').put(conversation);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction('conversations', 'readwrite').objectStore('conversations').delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllConversations(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction('conversations', 'readwrite').objectStore('conversations').clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export const DEFAULT_API_KEYS: ApiKeyConfig[] = [
  {
    id: 'key_google_default',
    providerId: 'google',
    label: '默认 Gemini Key',
    apiKey: '',
    isDefault: true,
    createdAt: Date.now(),
  },
  {
    id: 'key_openai_default',
    providerId: 'openai',
    label: '默认 OpenAI Key',
    apiKey: '',
    isDefault: true,
    createdAt: Date.now(),
  },
  {
    id: 'key_deepseek_default',
    providerId: 'deepseek',
    label: '默认 DeepSeek Key',
    apiKey: '',
    isDefault: true,
    createdAt: Date.now(),
  },
  {
    id: 'key_groq_default',
    providerId: 'groq',
    label: '默认 Groq Key',
    apiKey: '',
    isDefault: true,
    createdAt: Date.now(),
  },
  {
    id: 'key_nvidia_default',
    providerId: 'nvidia',
    label: '默认 NVIDIA Key',
    apiKey: '',
    isDefault: true,
    createdAt: Date.now(),
  },
];

// API Key Operations
export async function getApiKeys(): Promise<ApiKeyConfig[]> {
  const db = await openDB();
  const isInitialized = localStorage.getItem('omnichat_keys_initialized') === 'true';

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('api_keys', 'readwrite');
    const store = transaction.objectStore('api_keys');
    const request = store.getAll();

    request.onsuccess = async () => {
      const results = (request.result as ApiKeyConfig[]) || [];
      if (!isInitialized && results.length === 0) {
        localStorage.setItem('omnichat_keys_initialized', 'true');
        for (const k of DEFAULT_API_KEYS) {
          store.put(k);
        }
        resolve(DEFAULT_API_KEYS);
        return;
      }
      // If Google group has no key but user hasn't explicitly cleared all keys
      const hasGoogleKey = results.some(k => k.providerId === 'google');
      if (!hasGoogleKey && !isInitialized) {
        for (const k of DEFAULT_API_KEYS) {
          store.put(k);
          results.push(k);
        }
      }
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveApiKey(keyConfig: ApiKeyConfig): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('api_keys', 'readwrite');
    const store = transaction.objectStore('api_keys');
    const request = store.put(keyConfig);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteApiKey(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('api_keys', 'readwrite');
    const store = transaction.objectStore('api_keys');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllApiKeys(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('api_keys', 'readwrite');
    const store = transaction.objectStore('api_keys');
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Models Operations
export async function getModels(): Promise<ModelItem[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('models', 'readwrite');
    const store = transaction.objectStore('models');
    const request = store.getAll();

    request.onsuccess = async () => {
      let results = (request.result as ModelItem[]) || [];
      if (results.length === 0) {
        for (const m of DEFAULT_MODELS) {
          const raw = getRawModelId(m);
          const uniqueId = m.id.includes('::') ? m.id : buildUniqueModelId(m.providerId, raw);
          store.put({ ...m, id: uniqueId, rawModelId: raw });
        }
        results = DEFAULT_MODELS.map(m => {
          const raw = getRawModelId(m);
          const uniqueId = m.id.includes('::') ? m.id : buildUniqueModelId(m.providerId, raw);
          return { ...m, id: uniqueId, rawModelId: raw };
        });
      }

      // Remove obsolete slugs
      const staleOpenRouterIds = ['nvidia/nemotron-3-super:free'];
      for (const staleId of staleOpenRouterIds) {
        if (results.some(r => r.id === staleId)) {
          store.delete(staleId);
          results = results.filter(r => r.id !== staleId);
        }
      }

      // Normalize rawModelId
      const normalizedResults = results.map(r => {
        const raw = getRawModelId(r);
        return {
          ...r,
          rawModelId: raw,
        };
      });

      // Match missing defaults scoped strictly by providerId AND rawModelId
      const deletedDefaultKeys = (() => {
        try {
          const raw = localStorage.getItem('omnichat_deleted_default_models');
          return raw ? JSON.parse(raw) : [];
        } catch {
          return [];
        }
      })();

      const missingDefaults = DEFAULT_MODELS.filter(dm => {
        const dmRaw = getRawModelId(dm);
        const uniqueId = dm.id.includes('::') ? dm.id : buildUniqueModelId(dm.providerId, dmRaw);
        if (deletedDefaultKeys.includes(uniqueId)) {
          return false;
        }
        return !normalizedResults.some(r => r.providerId === dm.providerId && getRawModelId(r) === dmRaw);
      });

      if (missingDefaults.length > 0) {
        for (const m of missingDefaults) {
          const raw = getRawModelId(m);
          const uniqueId = m.id.includes('::') ? m.id : buildUniqueModelId(m.providerId, raw);
          const normalizedDefault = { ...m, id: uniqueId, rawModelId: raw };
          store.put(normalizedDefault);
          normalizedResults.push(normalizedDefault);
        }
      }

      resolve(normalizedResults);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function seedDefaultModels(): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction('models', 'readwrite');
  const store = transaction.objectStore('models');
  for (const m of DEFAULT_MODELS) {
    const raw = getRawModelId(m);
    const uniqueId = m.id.includes('::') ? m.id : buildUniqueModelId(m.providerId, raw);
    store.put({ ...m, id: uniqueId, rawModelId: raw });
  }
}

export async function saveModel(model: ModelItem): Promise<void> {
  const db = await openDB();
  const rawId = getRawModelId(model);
  const uniqueId = model.id.includes('::') ? model.id : buildUniqueModelId(model.providerId, rawId);
  const normalizedModel: ModelItem = {
    ...model,
    id: uniqueId,
    rawModelId: rawId,
  };

  // If this model was previously marked as deleted, remove it from the deleted list!
  try {
    const raw = localStorage.getItem('omnichat_deleted_default_models');
    if (raw) {
      const deletedList: string[] = JSON.parse(raw);
      const filtered = deletedList.filter(id => id !== uniqueId);
      localStorage.setItem('omnichat_deleted_default_models', JSON.stringify(filtered));
    }
  } catch {}

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('models', 'readwrite');
    const store = transaction.objectStore('models');
    const request = store.put(normalizedModel);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteModel(id: string): Promise<void> {
  const db = await openDB();

  // Track that this default model was deleted by the user so we don't automatically re-seed it
  try {
    const raw = localStorage.getItem('omnichat_deleted_default_models');
    const deletedList: string[] = raw ? JSON.parse(raw) : [];
    if (!deletedList.includes(id)) {
      deletedList.push(id);
      localStorage.setItem('omnichat_deleted_default_models', JSON.stringify(deletedList));
    }
  } catch (e) {
    console.warn('Failed to save deleted model reference:', e);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('models', 'readwrite');
    const store = transaction.objectStore('models');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Providers Operations
export async function getProviders(): Promise<ProviderDefinition[]> {
  const db = await openDB();
  const isInitialized = localStorage.getItem('omnichat_db_initialized') === 'true';

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('providers', 'readonly');
    const store = transaction.objectStore('providers');
    const request = store.getAll();

    request.onsuccess = async () => {
      const results = (request.result as ProviderDefinition[]) || [];
      if (!isInitialized && results.length === 0) {
        localStorage.setItem('omnichat_db_initialized', 'true');
        await seedDefaultProviders();
        await seedDefaultModels();
        resolve(DEFAULT_PROVIDERS);
        return;
      }

      // Keep NVIDIA as first provider order
      const providerOrder = DEFAULT_PROVIDERS.map(p => p.id);
      results.sort((a, b) => {
        const idxA = providerOrder.indexOf(a.id);
        const idxB = providerOrder.indexOf(b.id);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function seedDefaultProviders(): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction('providers', 'readwrite');
  const store = transaction.objectStore('providers');
  for (const p of DEFAULT_PROVIDERS) {
    store.put(p);
  }
}

export async function restoreDefaultProviders(): Promise<ProviderDefinition[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['providers', 'models', 'api_keys'], 'readwrite');
    const provStore = transaction.objectStore('providers');
    const modelStore = transaction.objectStore('models');
    const keyStore = transaction.objectStore('api_keys');
    
    for (const p of DEFAULT_PROVIDERS) {
      provStore.put(p);
    }
    for (const m of DEFAULT_MODELS) {
      modelStore.put(m);
    }
    for (const k of DEFAULT_API_KEYS) {
      keyStore.put(k);
    }

    transaction.oncomplete = () => {
      resolve(DEFAULT_PROVIDERS);
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function saveProvider(provider: ProviderDefinition): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('providers', 'readwrite');
    const store = transaction.objectStore('providers');
    const request = store.put(provider);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProvider(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('providers', 'readwrite');
    const store = transaction.objectStore('providers');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Settings Operations
export async function getUserSettings(): Promise<UserSettings> {
  // 1. Instant synchronous read from localStorage cache
  let cached: UserSettings | null = null;
  try {
    const raw = localStorage.getItem('omnichat_settings_cache');
    if (raw) {
      cached = JSON.parse(raw);
    }
  } catch {}

  // 2. Fetch from IndexedDB and update cache
  try {
    const db = await openDB();
    const result = await new Promise<UserSettings>((resolve) => {
      const transaction = db.transaction('settings', 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get('user_settings');

      request.onsuccess = () => {
        resolve({ ...DEFAULT_SETTINGS, ...(request.result || {}) });
      };
      request.onerror = () => resolve(cached || DEFAULT_SETTINGS);
    });

    try {
      localStorage.setItem('omnichat_settings_cache', JSON.stringify(result));
    } catch {}
    return result;
  } catch {
    return cached || DEFAULT_SETTINGS;
  }
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  // 1. Synchronously write to localStorage cache for 0ms instant UI update
  try {
    localStorage.setItem('omnichat_settings_cache', JSON.stringify(settings));
  } catch {}

  // 2. Asynchronously persist into IndexedDB
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('settings', 'readwrite');
    const store = transaction.objectStore('settings');
    const request = store.put(settings, 'user_settings');

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Full Reset
export async function resetAllData(): Promise<void> {
  await clearAllConversations();
  await clearAllApiKeys();
  try {
    localStorage.removeItem('omnichat_deleted_default_models');
  } catch {}
  const db = await openDB();
  const tx = db.transaction(['models', 'providers', 'settings'], 'readwrite');
  tx.objectStore('models').clear();
  tx.objectStore('providers').clear();
  tx.objectStore('settings').clear();
  await new Promise<void>((res) => {
    tx.oncomplete = () => res();
  });
  await seedDefaultProviders();
  await seedDefaultModels();
  await saveUserSettings(DEFAULT_SETTINGS);
}
