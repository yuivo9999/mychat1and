import React, { useState } from 'react';
import { 
  X, 
  Layers, 
  Key, 
  Bot, 
  Sparkles, 
  Sliders, 
  Palette, 
  Database, 
  ShieldAlert, 
  Plus, 
  Trash2, 
  Edit2, 
  Eye, 
  EyeOff, 
  Check, 
  RotateCw, 
  Download, 
  Upload, 
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  Type
} from 'lucide-react';
import { 
  ProviderDefinition, 
  ApiKeyConfig, 
  ModelItem, 
  UserSettings, 
  Conversation,
  CustomFontItem,
  FontDefinition
} from '../types';
import { getAdapterForProvider } from '../services/adapters';
import { 
  PRESET_CHINESE_FONTS, 
  initCustomFonts, 
  saveCustomFont, 
  deleteCustomFont, 
  exportIndividualFont, 
  applyAppFont 
} from '../services/fontService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: string;
  onOpenModelConfig?: () => void;
  providers: ProviderDefinition[];
  onSaveProvider: (p: ProviderDefinition) => Promise<void>;
  onDeleteProvider: (id: string) => Promise<void>;
  apiKeys: ApiKeyConfig[];
  onSaveApiKey: (key: ApiKeyConfig) => Promise<void>;
  onDeleteApiKey: (id: string) => Promise<void>;
  models: ModelItem[];
  onSaveModel: (m: ModelItem) => Promise<void>;
  onDeleteModel: (id: string) => Promise<void>;
  settings: UserSettings;
  onSaveSettings: (s: UserSettings) => Promise<void>;
  conversations: Conversation[];
  onImportConversations: (imported: Conversation[]) => Promise<void>;
  onClearAllConversations: () => Promise<void>;
  onClearAllApiKeys: () => Promise<void>;
  onResetAllData: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'chat',
  onOpenModelConfig,
  providers,
  onSaveProvider,
  onDeleteProvider,
  apiKeys,
  onSaveApiKey,
  onDeleteApiKey,
  models,
  onSaveModel,
  onDeleteModel,
  settings,
  onSaveSettings,
  conversations,
  onImportConversations,
  onClearAllConversations,
  onClearAllApiKeys,
  onResetAllData,
}) => {
  const [activeTab, setActiveTab] = useState(['appearance', 'data', 'advanced'].includes(initialTab) ? initialTab : 'appearance');

  // API Key Form State
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [keyProviderId, setKeyProviderId] = useState(providers[0]?.id || 'nvidia');
  const [keyLabel, setKeyLabel] = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [keyBaseUrl, setKeyBaseUrl] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  // Model Form State
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [modelFormId, setModelFormId] = useState('');
  const [modelFormName, setModelFormName] = useState('');
  const [modelFormProviderId, setModelFormProviderId] = useState(providers[0]?.id || 'nvidia');
  const [modelFormVision, setModelFormVision] = useState(false);
  const [modelFormStreaming, setModelFormStreaming] = useState(true);
  const [modelFormTemp, setModelFormTemp] = useState<number>(0.7);
  const [modelFormMaxTokens, setModelFormMaxTokens] = useState<number>(4096);
  const [modelFormSystemPrompt, setModelFormSystemPrompt] = useState('');

  // Provider Form State
  const [newProvName, setNewProvName] = useState('');
  const [newProvBaseUrl, setNewProvBaseUrl] = useState('');
  const [newProvDesc, setNewProvDesc] = useState('');

  // Font Management State
  const [customFonts, setCustomFonts] = useState<CustomFontItem[]>([]);
  const [fontImporting, setFontImporting] = useState(false);
  const [fontSuccessMsg, setFontSuccessMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      initCustomFonts().then(fonts => setCustomFonts(fonts));
    }
  }, [isOpen]);

  const handleImportFontFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFontImporting(true);
    try {
      const res = await saveCustomFont(file);
      if (res.error) {
        alert(`导入字体失败: ${res.error}`);
      } else if (res.item) {
        const nextList = [res.item, ...customFonts];
        setCustomFonts(nextList);
        await onSaveSettings({ ...settings, fontFamily: res.item.id });
        applyAppFont(res.item.id, nextList);
        setFontSuccessMsg(`成功导入字体【${res.item.name}】并已生效！`);
        setTimeout(() => setFontSuccessMsg(null), 3500);
      }
    } catch (err: any) {
      alert(`导入字体出错: ${err.message}`);
    } finally {
      setFontImporting(false);
      e.target.value = '';
    }
  };

  const handleDeleteFont = async (id: string, name: string) => {
    if (!confirm(`确认在本地删除导入的字体【${name}】？`)) return;
    await deleteCustomFont(id);
    const updated = customFonts.filter(f => f.id !== id);
    setCustomFonts(updated);
    if (settings.fontFamily === id) {
      await onSaveSettings({ ...settings, fontFamily: 'system' });
      applyAppFont('system', updated);
    }
  };

  const handleExportFont = async (font: FontDefinition | CustomFontItem) => {
    await exportIndividualFont(font);
  };

  if (!isOpen) return null;

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Handle API Key Save
  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyValue.trim()) return;

    const newKeyConfig: ApiKeyConfig = {
      id: editingKeyId || `key_${Date.now()}`,
      providerId: keyProviderId,
      label: keyLabel.trim() || `${keyProviderId} Key`,
      apiKey: keyValue.trim(),
      baseUrl: keyBaseUrl.trim() || undefined,
      createdAt: Date.now(),
      isDefault: apiKeys.filter(k => k.providerId === keyProviderId).length === 0,
    };

    await onSaveApiKey(newKeyConfig);
    // Reset form
    setEditingKeyId(null);
    setKeyLabel('');
    setKeyValue('');
    setKeyBaseUrl('');
  };

  const handleEditKey = (key: ApiKeyConfig) => {
    setEditingKeyId(key.id);
    setKeyProviderId(key.providerId);
    setKeyLabel(key.label);
    setKeyValue(key.apiKey);
    setKeyBaseUrl(key.baseUrl || '');
  };

  // Test API Key connection
  const handleTestKey = async (key: ApiKeyConfig) => {
    setTestingKeyId(key.id);
    setTestResult(null);

    const adapter = getAdapterForProvider(key.providerId);
    // Find a model for testing
    const testModel = models.find(m => m.providerId === key.providerId);
    const result = await adapter.testConnection(key, testModel?.id);

    setTestResult({
      id: key.id,
      success: result.success,
      message: result.message,
    });
    setTestingKeyId(null);
  };

  // Handle Model Save
  const handleSaveModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelFormId.trim() || !modelFormName.trim()) return;

    const newModel: ModelItem = {
      id: modelFormId.trim(),
      name: modelFormName.trim(),
      providerId: modelFormProviderId,
      supportsVision: modelFormVision,
      supportsFiles: true,
      supportsStreaming: modelFormStreaming,
      temperature: modelFormTemp,
      maxTokens: modelFormMaxTokens,
      systemPrompt: modelFormSystemPrompt.trim() || undefined,
      isCustom: true,
    };

    await onSaveModel(newModel);
    setEditingModelId(null);
    setModelFormId('');
    setModelFormName('');
    setModelFormSystemPrompt('');
  };

  const handleEditModel = (m: ModelItem) => {
    setEditingModelId(m.id);
    setModelFormId(m.id);
    setModelFormName(m.name);
    setModelFormProviderId(m.providerId);
    setModelFormVision(m.supportsVision);
    setModelFormStreaming(m.supportsStreaming);
    setModelFormTemp(m.temperature ?? 0.7);
    setModelFormMaxTokens(m.maxTokens ?? 4096);
    setModelFormSystemPrompt(m.systemPrompt || '');
  };

  // Export conversations JSON
  const handleExportAllChats = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(conversations, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `omnichat-backup-${new Date().toISOString().slice(0, 10)}.json`);
    dlAnchor.click();
  };

  // Import conversations JSON
  const handleImportChatsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          await onImportConversations(imported);
          alert(`成功恢复导入 ${imported.length} 个历史对话！`);
        } else {
          alert('导入格式错误：必须为聊天记录 JSON 数组');
        }
      } catch (err: any) {
        alert(`导入解析失败: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  // Export Config
  const handleExportConfig = () => {
    const configData = {
      apiKeys,
      models: models.filter(m => m.isCustom),
      providers: providers.filter(p => p.isCustom),
      settings,
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(configData, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `omnichat-config-${new Date().toISOString().slice(0, 10)}.json`);
    dlAnchor.click();
  };

  // Import Config
  const handleImportConfigFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.apiKeys) {
          for (const k of parsed.apiKeys) await onSaveApiKey(k);
        }
        if (parsed.models) {
          for (const m of parsed.models) await onSaveModel(m);
        }
        if (parsed.settings) {
          await onSaveSettings(parsed.settings);
        }
        alert('配置已成功还原！');
      } catch (err: any) {
        alert(`配置恢复失败: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const tabs = [
    { id: 'appearance', label: '外观风格', icon: Palette },
    { id: 'data', label: '数据管理', icon: Database },
    { id: 'advanced', label: '高级设置', icon: ShieldAlert },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 select-none animate-in fade-in duration-200">
      <div className="settings-modal bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-4xl h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 md:px-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-50/50 dark:bg-neutral-900/50">
          <div>
            <h2 className="text-base md:text-lg font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-500" />
              <span>客户端系统设置</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              本地化优先 · 数据与 API Key 均保存在当前浏览器本地
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Left Tab Nav & Right Content */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Navigation Sidebar */}
          <nav className="w-full md:w-52 border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-800 p-2 md:p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto shrink-0 bg-neutral-50/30 dark:bg-neutral-950/20">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 md:py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 shadow-xs'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Tab Content Panels */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">

            {/* 外观风格 */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">皮肤风格选择</h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    点击下方按钮切换界面色彩与字体外观设计。
                  </p>
                </div>

                <div className="flex flex-col gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => onSaveSettings({ ...settings, theme: 'light' })}
                    className={`w-full p-3.5 px-4 rounded-2xl border text-left transition flex items-center justify-between ${
                      settings.theme !== 'classic1' && settings.theme !== 'classic2' && settings.theme !== 'modern1' && settings.theme !== 'sangtian-shanhe'
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20'
                        : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30'
                    }`}
                  >
                    <div className="flex flex-col justify-center">
                      <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100 leading-snug">默认皮肤</div>
                      <div className="text-[11px] text-neutral-500 leading-snug mt-0.5">现代极简设计，黑白灰无衬线视觉风格</div>
                    </div>
                    {settings.theme !== 'classic1' && settings.theme !== 'classic2' && settings.theme !== 'modern1' && settings.theme !== 'sangtian-shanhe' && (
                      <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 shrink-0 ml-3">
                        <Check className="w-4 h-4" /> 当前已使用
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onSaveSettings({ ...settings, theme: 'sangtian-shanhe' })}
                    className={`w-full p-3.5 px-4 rounded-2xl border text-left transition flex items-center justify-between ${
                      settings.theme === 'sangtian-shanhe'
                        ? 'border-[#728C48] bg-[#F4E8C8]/60 ring-2 ring-[#728C48]/30'
                        : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30'
                    }`}
                  >
                    <div className="flex flex-col justify-center">
                      <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100 leading-snug flex items-center gap-2">
                        <span>桑田山河 · 朱印</span>
                        <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-[#728C48]/15 text-[#5C743A] border border-[#728C48]/30">Sangtian Shanhe</span>
                      </div>
                      <div className="text-[11px] text-neutral-500 leading-snug mt-0.5">宣纸米黄底、稻田青绿、朱砂印章与乌木棕框的古风山河意境</div>
                    </div>
                    {settings.theme === 'sangtian-shanhe' && (
                      <span className="text-xs font-semibold text-[#A9362D] flex items-center gap-1 shrink-0 ml-3 font-medium">
                        <Check className="w-4 h-4" /> 当前已使用
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onSaveSettings({ ...settings, theme: 'modern1' })}
                    className={`w-full p-3.5 px-4 rounded-2xl border text-left transition flex items-center justify-between ${
                      settings.theme === 'modern1'
                        ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-950/30 ring-2 ring-sky-500/30'
                        : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30'
                    }`}
                  >
                    <div className="flex flex-col justify-center">
                      <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100 leading-snug">现代1</div>
                      <div className="text-[11px] text-neutral-500 leading-snug mt-0.5">冰蓝雾灰清爽底色、深海钢蓝字色与蔚蓝高亮，高效商务排版</div>
                    </div>
                    {settings.theme === 'modern1' && (
                      <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1 shrink-0 ml-3">
                        <Check className="w-4 h-4" /> 当前已使用
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onSaveSettings({ ...settings, theme: 'classic1' })}
                    className={`w-full p-3.5 px-4 rounded-2xl border text-left transition flex items-center justify-between ${
                      settings.theme === 'classic1'
                        ? 'border-amber-700 bg-amber-50/60 ring-2 ring-amber-700/20'
                        : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30'
                    }`}
                  >
                    <div className="flex flex-col justify-center font-serif">
                      <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100 leading-snug">古典1</div>
                      <div className="text-[11px] text-neutral-500 leading-snug mt-0.5">古朴宣纸底色、深褐墨香与朱砂沉淀，配合典雅衬线字体</div>
                    </div>
                    {settings.theme === 'classic1' && (
                      <span className="text-xs font-semibold text-amber-800 flex items-center gap-1 shrink-0 ml-3 font-serif">
                        <Check className="w-4 h-4" /> 当前已使用
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onSaveSettings({ ...settings, theme: 'classic2' })}
                    className={`w-full p-3.5 px-4 rounded-2xl border text-left transition flex items-center justify-between ${
                      settings.theme === 'classic2'
                        ? 'border-amber-500 bg-amber-950/40 ring-2 ring-amber-500/30'
                        : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30'
                    }`}
                  >
                    <div className="flex flex-col justify-center font-serif">
                      <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100 leading-snug">古典2</div>
                      <div className="text-[11px] text-neutral-500 leading-snug mt-0.5">天下舆图黑金主页底色；模型与参数弹窗全浅古宣色，绝无黑色背景</div>
                    </div>
                    {settings.theme === 'classic2' && (
                      <span className="text-xs font-semibold text-amber-400 flex items-center gap-1 shrink-0 ml-3 font-serif">
                        <Check className="w-4 h-4" /> 当前已使用
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* 7. 数据管理 */}
            {activeTab === 'data' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">数据备份与清理</h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    所有聊天记录、文件元数据与 API 密钥完全保存在当前设备浏览器本地，您可以随时导出离线备份或全量导入。
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 space-y-3">
                    <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                      <Download className="w-4 h-4 text-indigo-500" />
                      <span>备份聊天记录</span>
                    </h4>
                    <p className="text-[11px] text-neutral-400">将全部 {conversations.length} 个对话以标准化 JSON 文件导出保存到本地磁盘。</p>
                    <button
                      type="button"
                      onClick={handleExportAllChats}
                      className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-xl text-xs font-semibold transition"
                    >
                      导出全部历史记录 (JSON)
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 space-y-3">
                    <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                      <Upload className="w-4 h-4 text-indigo-500" />
                      <span>恢复聊天记录</span>
                    </h4>
                    <p className="text-[11px] text-neutral-400">从之前导出的 JSON 备份中还原会话列表与全部历史版本。</p>
                    <label className="w-full py-2 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-xl text-xs font-semibold transition flex items-center justify-center cursor-pointer">
                      <span>选择并导入备份 JSON</span>
                      <input type="file" accept=".json" onChange={handleImportChatsFile} className="hidden" />
                    </label>
                  </div>

                  <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 space-y-3">
                    <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                      <Download className="w-4 h-4 text-emerald-500" />
                      <span>导出系统配置</span>
                    </h4>
                    <p className="text-[11px] text-neutral-400">导出自定义模型、自定义 API 提供商及 API Key 配置清单。</p>
                    <button
                      type="button"
                      onClick={handleExportConfig}
                      className="w-full py-2 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 rounded-xl text-xs font-semibold transition"
                    >
                      导出配置备份
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 space-y-3">
                    <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                      <Upload className="w-4 h-4 text-emerald-500" />
                      <span>导入系统配置</span>
                    </h4>
                    <p className="text-[11px] text-neutral-400">导入并在本地覆盖还原系统配置项。</p>
                    <label className="w-full py-2 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 rounded-xl text-xs font-semibold transition flex items-center justify-center cursor-pointer">
                      <span>导入配置备份 JSON</span>
                      <input type="file" accept=".json" onChange={handleImportConfigFile} className="hidden" />
                    </label>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="p-4 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50/30 dark:bg-red-950/20 space-y-3">
                  <h4 className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>危险操作与数据清空</span>
                  </h4>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm('确认清空全部聊天历史记录？此操作不可逆！')) {
                          await onClearAllConversations();
                          alert('已清空全部聊天历史记录。');
                        }
                      }}
                      className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition"
                    >
                      清空全部历史对话
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm('确认清除保存在本地的全部 API Key？')) {
                          await onClearAllApiKeys();
                          alert('已清除所有 API Key。');
                        }
                      }}
                      className="px-3 py-2 rounded-xl border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 text-xs font-medium transition"
                    >
                      清除全部本地 API Key
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm('警告：此操作将清空本地数据库并恢复初始预设！是否继续？')) {
                          await onResetAllData();
                          alert('系统已恢复初始出厂设置。');
                        }
                      }}
                      className="px-3 py-2 rounded-xl border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 text-xs font-medium transition"
                    >
                      恢复出厂初始预设
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 8. 高级设置 */}
            {activeTab === 'advanced' && (
              <div className="space-y-6">
                {/* 1. 全局中文字体与排版定制 (16 款精选中文字体 + 本地字体导入/导出) */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                        <Type className="w-4 h-4 text-indigo-500" />
                        <span>全局中文字体定制 ({16 + customFonts.length} 款轻量精选字体)</span>
                      </h3>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        按 4 列逐行排布，即选即显；支持本地导入 .ttf/.otf/.woff/.woff2 字体永久保存在浏览器，支持单字导出备份。
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer shadow-xs transition active:scale-95">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{fontImporting ? '导入中...' : '导入本地字体文件'}</span>
                        <input
                          type="file"
                          accept=".ttf,.otf,.woff,.woff2"
                          onChange={handleImportFontFile}
                          disabled={fontImporting}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {fontSuccessMsg && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in duration-200">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{fontSuccessMsg}</span>
                    </div>
                  )}

                  {/* Font Cards Grid: Arranged strictly 4 items per row, row by row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    {[
                      ...customFonts.map(cf => ({
                        id: cf.id,
                        name: cf.name,
                        category: '自定义',
                        fontFamily: `"${cf.name}", sans-serif`,
                        previewText: '云开山色重，木落雁声迟',
                        isCustom: true,
                        format: cf.format.toUpperCase(),
                        fileSize: cf.fileSize,
                        description: `本地导入 (${cf.format.toUpperCase()}, ${(cf.fileSize / 1024).toFixed(1)}KB)`,
                      })),
                      ...PRESET_CHINESE_FONTS,
                    ].map((font) => {
                      const isSelected = (settings.fontFamily || 'system') === font.id || (font.id === 'system' && !settings.fontFamily);
                      return (
                        <div
                          key={font.id}
                          onClick={() => {
                            onSaveSettings({ ...settings, fontFamily: font.id });
                            applyAppFont(font.id, customFonts);
                          }}
                          className={`group relative p-3 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between select-none ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30 ring-2 ring-indigo-500/25 shadow-xs'
                              : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800/40 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/80'
                          }`}
                        >
                          {/* Top Row: Font Name & Category Tag & Check */}
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate" title={font.name}>
                                {font.name}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                                    font.isCustom
                                      ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60'
                                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                                  }`}
                                >
                                  {font.category}
                                </span>
                                {isSelected && (
                                  <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 stroke-[3]" />
                                )}
                              </div>
                            </div>

                            {/* Middle Row: Live Preview In That Font */}
                            <div
                              style={{ fontFamily: font.fontFamily }}
                              className="text-xs sm:text-sm py-1 font-medium text-neutral-800 dark:text-neutral-200 line-clamp-1 break-all"
                              title={font.previewText}
                            >
                              {font.previewText || '沧海桑田，万象森罗'}
                            </div>

                            {/* Description */}
                            <p className="text-[10px] text-neutral-400 line-clamp-1 mt-0.5" title={font.description}>
                              {font.description}
                            </p>
                          </div>

                          {/* Bottom Row: Actions (Export & Delete) */}
                          <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-neutral-100 dark:border-neutral-800/80">
                            <span className="text-[10px] text-neutral-400 font-mono">
                              {isSelected ? (
                                <span className="text-indigo-600 dark:text-indigo-400 font-medium">● 使用中</span>
                              ) : (
                                '点击启用'
                              )}
                            </span>

                            <div className="flex items-center gap-1.5">
                              {/* Export Individual Font Button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportFont(font);
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-neutral-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition"
                                title={`导出【${font.name}】字体文件或规则`}
                              >
                                <Download className="w-3 h-3" />
                                <span>导出</span>
                              </button>

                              {/* Delete Custom Font Button */}
                              {font.isCustom && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteFont(font.id, font.name);
                                  }}
                                  className="inline-flex items-center p-1 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                                  title="在本地删除该字体"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-5">
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">网络与高级参数</h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    调整请求超时时长与关于浏览器直接调用第三方 API 的 CORS 跨域须知。
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                      请求超时时间 ({settings.requestTimeout} 秒)
                    </label>
                    <input
                      type="range"
                      min="15"
                      max="300"
                      step="5"
                      value={settings.requestTimeout}
                      onChange={(e) => onSaveSettings({ ...settings, requestTimeout: parseInt(e.target.value) || 300 })}
                      className="w-full accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-neutral-400 font-mono mt-1">
                      <span>15s (极速)</span>
                      <span>60s (标准)</span>
                      <span>300s (适合长思考推理模型)</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 space-y-2">
                    <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                      <HardDrive className="w-4 h-4 text-indigo-500" />
                      <span>CORS 跨域说明</span>
                    </h4>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                      由于本应用为 <strong>100% 浏览器本地运行客户端</strong>，浏览器向未配置 CORS 头的第三方 API 发起直接请求时，可能受到浏览器的跨域同源策略限制。
                      如遇到网络跨域报错，建议：
                    </p>
                    <ul className="text-[11px] text-neutral-500 dark:text-neutral-400 list-disc pl-4 space-y-1">
                      <li>使用开放了 CORS 的 API 网关 (如 OpenRouter, SiliconFlow, 智谱开放平台, DeepSeek 等)</li>
                      <li>在设置对应 API Key 时填入您自建的反向代理 Base URL (如 Cloudflare Worker 代理)</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
