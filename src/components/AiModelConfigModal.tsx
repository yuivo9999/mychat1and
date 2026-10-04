import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Key, 
  Server, 
  Sparkles,
  ChevronDown,
  Check,
  Zap,
  Globe,
  RefreshCw,
  Eye,
  EyeOff,
  Edit2,
  Copy,
  RotateCcw,
  Download,
  Upload,
  FileJson,
  AlertTriangle
} from 'lucide-react';
import { 
  ProviderDefinition, 
  ApiKeyConfig, 
  ModelItem, 
  UserSettings 
} from '../types';
import { getAdapterForProvider } from '../services/adapters';
import { DEFAULT_MODELS } from '../services/db';
import { getGroqModelCapabilities } from '../services/groqModelCapabilities';
import { getRawModelId, buildUniqueModelId } from '../services/modelUtils';

interface AiModelConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: ProviderDefinition[];
  onSaveProvider: (p: ProviderDefinition) => void;
  onDeleteProvider: (id: string) => void;
  onRestoreDefaultProviders?: () => void;
  apiKeys: ApiKeyConfig[];
  onSaveApiKey: (k: ApiKeyConfig) => void;
  onDeleteApiKey: (id: string) => void;
  models: ModelItem[];
  onSaveModel: (m: ModelItem) => void;
  onDeleteModel: (id: string) => void;
  settings: UserSettings;
  onSaveSettings: (s: UserSettings) => void;
  currentModelId: string;
  onSelectModel: (id: string) => void;
  selectedApiKeyId?: string;
  onSelectApiKey: (id?: string) => void;
}

export const AiModelConfigModal: React.FC<AiModelConfigModalProps> = ({
  isOpen,
  onClose,
  providers,
  onSaveProvider,
  onDeleteProvider,
  onRestoreDefaultProviders,
  apiKeys,
  onSaveApiKey,
  onDeleteApiKey,
  models,
  onSaveModel,
  onDeleteModel,
  settings,
  onSaveSettings,
  currentModelId,
  onSelectModel,
  selectedApiKeyId,
  onSelectApiKey,
}) => {
  // Selected Provider Group for editing in top section
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    providers[0]?.id || 'nvidia'
  );

  // Group Details editable Base URL
  const [groupBaseUrl, setGroupBaseUrl] = useState<string>('');

  // Default Model Service Selection (Bottom Section)
  const [defaultServiceGroupId, setDefaultServiceGroupId] = useState<string>(
    settings.defaultProviderId || providers[0]?.id || 'nvidia'
  );
  const [defaultKeyId, setDefaultKeyId] = useState<string>(selectedApiKeyId || '');
  const [defaultModelId, setDefaultModelId] = useState<string>(
    currentModelId || settings.defaultModelId || 'deepseek-ai/deepseek-v4.1-flash'
  );
  const [modelToDelete, setModelToDelete] = useState<{ id: string; name: string } | null>(null);
  const [copiedModelId, setCopiedModelId] = useState<string | null>(null);

  // Add Group Modal/Form state
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [newGroupUrl, setNewGroupUrl] = useState('');

  // Add Key Modal/Form state
  const [isAddingKey, setIsAddingKey] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState('');

  // Key View & Edit state
  const [visibleKeyIds, setVisibleKeyIds] = useState<Record<string, boolean>>({});
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [editKeyValue, setEditKeyValue] = useState('');

  // Add Model Modal/Form state
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [newModelId, setNewModelId] = useState('');

  // Import Group Pending Conflict Payload
  const [pendingImport, setPendingImport] = useState<{
    importedProvider: ProviderDefinition;
    importedKeys: ApiKeyConfig[];
    importedModels: ModelItem[];
    hasKeyDuplicates: boolean;
    hasModelDuplicates: boolean;
    duplicateKeyList: string[];
    duplicateModelList: string[];
  } | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Testing connection state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  // Saved feedback notice
  const [showSavedToast, setShowSavedToast] = useState(false);

  // Initialize and sync when modal opens or provider changes
  useEffect(() => {
    if (isOpen) {
      const activeP = providers.find(p => p.id === selectedGroupId) || providers[0];
      if (activeP) {
        setSelectedGroupId(activeP.id);
        setGroupBaseUrl(activeP.defaultBaseUrl || '');
      } else {
        setSelectedGroupId('');
        setGroupBaseUrl('');
      }
      setDefaultServiceGroupId(settings.defaultProviderId || providers[0]?.id || '');
      setDefaultModelId(currentModelId || settings.defaultModelId || models[0]?.id || '');
      setDefaultKeyId(selectedApiKeyId || '');
      setTestResult(null);
    }
  }, [isOpen, providers]);

  // Sync baseUrl when selecting a different group
  const handleSelectGroup = (pId: string) => {
    setSelectedGroupId(pId);
    const p = providers.find(item => item.id === pId);
    if (p) {
      setGroupBaseUrl(p.defaultBaseUrl || '');
    } else {
      setGroupBaseUrl('');
    }
    setTestResult(null);
    setIsAddingKey(false);
    setIsAddingModel(false);
  };

  if (!isOpen) return null;

  const currentGroup = providers.find(p => p.id === selectedGroupId) || providers[0] || undefined;
  const groupModels = currentGroup ? models.filter(m => m.providerId === currentGroup.id) : [];
  const groupKeys = currentGroup ? apiKeys.filter(k => k.providerId === currentGroup.id) : [];

  // Models for Default Service dropdown
  const defaultServiceModels = models.filter(m => m.providerId === defaultServiceGroupId);
  const defaultServiceKeys = apiKeys.filter(k => k.providerId === defaultServiceGroupId);

  // Handle Save Base URL for current group
  const handleSaveGroupUrl = () => {
    if (!currentGroup) return;
    const updated: ProviderDefinition = {
      ...currentGroup,
      defaultBaseUrl: groupBaseUrl.trim(),
    };
    onSaveProvider(updated);
  };

  // Handle Create New Group
  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const generatedId = newGroupId.trim() || `custom_${Date.now()}`;
    const newProvider: ProviderDefinition = {
      id: generatedId,
      name: newGroupName.trim(),
      description: '自定义 OpenAI 兼容 API 服务组',
      icon: 'Server',
      defaultBaseUrl: newGroupUrl.trim() || 'https://api.openai.com/v1',
      enabled: true,
    };
    onSaveProvider(newProvider);
    setSelectedGroupId(generatedId);
    setGroupBaseUrl(newProvider.defaultBaseUrl);
    setIsAddingGroup(false);
    setNewGroupName('');
    setNewGroupId('');
    setNewGroupUrl('');
  };

  // Handle Export Current Group (Export provider info, base URL, all API Keys, and all Models)
  const handleExportCurrentGroup = () => {
    if (!currentGroup) return;

    const exportPayload = {
      version: '1.0',
      type: 'ai_provider_group',
      exportedAt: Date.now(),
      provider: currentGroup,
      apiKeys: groupKeys,
      models: groupModels,
    };

    const jsonStr = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (currentGroup.name || 'group').replace(/[^\w\u4e00-\u9fa5]/g, '_');
    link.href = url;
    link.download = `provider_group_${safeName}_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle Import Group from JSON
  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      let rawProvider: ProviderDefinition | null = parsed.provider || (Array.isArray(parsed.providers) ? parsed.providers[0] : null);
      if (!rawProvider && parsed.name && (parsed.defaultBaseUrl || parsed.id)) {
        rawProvider = parsed;
      }

      if (!rawProvider || !rawProvider.name) {
        alert('无法识别该文件格式，请确保为包含服务商分组的 JSON 配置文件。');
        return;
      }

      // 1. Check for Group Name Collision -> Rename to "Group Name (1)", "Group Name (2)", etc.
      let finalGroupName = rawProvider.name;
      let nameCounter = 1;
      while (providers.some(p => p.name.trim() === finalGroupName.trim())) {
        finalGroupName = `${rawProvider.name} (${nameCounter})`;
        nameCounter++;
      }

      // Generate unique provider ID for the newly imported group
      const newProviderId = `provider_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newProvider: ProviderDefinition = {
        ...rawProvider,
        id: newProviderId,
        name: finalGroupName,
        defaultBaseUrl: rawProvider.defaultBaseUrl || 'https://api.openai.com/v1',
      };

      // Prepare Keys & Models with mapped providerId
      const rawKeys: ApiKeyConfig[] = Array.isArray(parsed.apiKeys) ? parsed.apiKeys : [];
      const rawModels: ModelItem[] = Array.isArray(parsed.models) ? parsed.models : [];

      const preparedKeys: ApiKeyConfig[] = rawKeys.map((k, idx) => ({
        ...k,
        id: `key_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        providerId: newProviderId,
        baseUrl: k.baseUrl || newProvider.defaultBaseUrl,
        createdAt: k.createdAt || Date.now(),
      }));

      const preparedModels: ModelItem[] = rawModels.map((m) => {
        const rawId = getRawModelId(m);
        return {
          ...m,
          id: buildUniqueModelId(newProviderId, rawId),
          providerId: newProviderId,
          rawModelId: rawId,
        };
      });

      // 2. Check for Duplicate Keys or Models against existing system
      const existingKeyValues = new Set(apiKeys.map(k => k.apiKey.trim()));
      const duplicateKeyValues = preparedKeys.filter(k => existingKeyValues.has(k.apiKey.trim())).map(k => k.apiKey);

      const existingRawModelIds = new Set(models.map(m => getRawModelId(m).toLowerCase()));
      const duplicateModelIds = preparedModels.filter(m => existingRawModelIds.has(getRawModelId(m).toLowerCase())).map(m => getRawModelId(m));

      const hasKeyDuplicates = duplicateKeyValues.length > 0;
      const hasModelDuplicates = duplicateModelIds.length > 0;

      if (hasKeyDuplicates || hasModelDuplicates) {
        setPendingImport({
          importedProvider: newProvider,
          importedKeys: preparedKeys,
          importedModels: preparedModels,
          hasKeyDuplicates,
          hasModelDuplicates,
          duplicateKeyList: duplicateKeyValues,
          duplicateModelList: duplicateModelIds,
        });
      } else {
        executeImport(newProvider, preparedKeys, preparedModels, 'skip');
      }
    } catch (err) {
      console.error('Failed to import provider group:', err);
      alert('导入失败，请检查文件内容是否为符合规范的 JSON 格式。');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const executeImport = (
    provider: ProviderDefinition,
    keys: ApiKeyConfig[],
    modelsToImport: ModelItem[],
    conflictMode: 'overwrite' | 'skip'
  ) => {
    // 1. Save provider definition
    onSaveProvider(provider);

    // 2. Save Keys
    for (const k of keys) {
      const existingKey = apiKeys.find(ex => ex.apiKey.trim() === k.apiKey.trim());
      if (existingKey) {
        if (conflictMode === 'overwrite') {
          onSaveApiKey({
            ...existingKey,
            baseUrl: k.baseUrl || existingKey.baseUrl,
            label: k.label || existingKey.label,
          });
        }
      } else {
        onSaveApiKey(k);
      }
    }

    // 3. Save Models
    for (const m of modelsToImport) {
      const mRaw = getRawModelId(m).toLowerCase();
      const existingModel = models.find(ex => getRawModelId(ex).toLowerCase() === mRaw);
      if (existingModel) {
        if (conflictMode === 'overwrite') {
          onSaveModel({
            ...existingModel,
            name: m.name || existingModel.name,
            supportsVision: m.supportsVision ?? existingModel.supportsVision,
            supportsStreaming: m.supportsStreaming ?? existingModel.supportsStreaming,
            maxTokens: m.maxTokens || existingModel.maxTokens,
            contextWindow: m.contextWindow || existingModel.contextWindow,
          });
        }
      } else {
        onSaveModel(m);
      }
    }

    // 4. Select newly imported group
    setSelectedGroupId(provider.id);
    setGroupBaseUrl(provider.defaultBaseUrl || '');
    setPendingImport(null);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
  };
  const handleDeleteCurrentGroup = () => {
    if (!currentGroup) return;
    if (confirm(`确定要删除服务商分组「${currentGroup.name}」及其关联设置吗？`)) {
      // 1. Delete associated keys & models
      groupKeys.forEach(k => onDeleteApiKey(k.id));
      groupModels.forEach(m => onDeleteModel(m.id));

      // 2. Delete provider definition
      onDeleteProvider(currentGroup.id);

      const remaining = providers.filter(p => p.id !== currentGroup.id);
      if (remaining.length > 0) {
        setSelectedGroupId(remaining[0].id);
        setGroupBaseUrl(remaining[0].defaultBaseUrl || '');
      } else {
        setSelectedGroupId('');
        setGroupBaseUrl('');
      }
    }
  };

  // Handle Add API Key (Only Key required, no name field)
  const sanitizeKey = (k: string) => {
    let clean = (k || '').trim().replace(/^["']|["']$/g, '').trim();
    if (clean.toLowerCase().startsWith('bearer ')) {
      clean = clean.slice(7).trim();
    }
    return clean;
  };

  const handleAddKey = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = sanitizeKey(newKeyValue);
    if (!cleaned || !currentGroup) return;
    const keyConfig: ApiKeyConfig = {
      id: `key_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      providerId: currentGroup.id,
      label: `${currentGroup.name} Key`,
      apiKey: cleaned,
      baseUrl: groupBaseUrl.trim() || currentGroup.defaultBaseUrl,
      createdAt: Date.now(),
      isDefault: groupKeys.length === 0,
    };
    onSaveApiKey(keyConfig);
    setIsAddingKey(false);
    setNewKeyValue('');
  };

  // Handle Add Model (Only Model ID required, no name field)
  const handleAddModel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModelId.trim() || !currentGroup) return;
    const rawId = getRawModelId(newModelId.trim());
    const uniqueId = buildUniqueModelId(currentGroup.id, rawId);
    const groqCapabilities =
      currentGroup.id === 'groq' ? getGroqModelCapabilities(rawId) : null;

    const newModelItem: ModelItem = {
      id: uniqueId,
      rawModelId: rawId,
      name: rawId,
      providerId: currentGroup.id,
      supportsVision: groqCapabilities?.supportsVision ?? false,
      supportsFiles: groqCapabilities?.supportsFiles ?? true,
      supportsStreaming: true,
      contextWindow: 131072,
      temperature: 0.7,
      topP: 0.95,
      isCustom: true,
    };
    onSaveModel(newModelItem);
    setIsAddingModel(false);
    setNewModelId('');
  };

  // Test Connection
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    const targetGroup = providers.find(p => p.id === defaultServiceGroupId) || currentGroup;
    if (!targetGroup) {
      setIsTesting(false);
      setTestResult({ success: false, message: '未选择有效服务组' });
      return;
    }

    let targetKey = apiKeys.find(k => k.id === defaultKeyId) || defaultServiceKeys[0] || groupKeys[0];
    if ((!targetKey || !targetKey.apiKey) && targetGroup.id === 'google') {
      targetKey = {
        id: 'key_google_default_ready',
        providerId: 'google',
        label: 'Google Gemini (内置官方免费通道)',
        apiKey: 'AIzaSy_Google_Gemini_Fast_Testing_Key',
        baseUrl: 'https://generativelanguage.googleapis.com',
        createdAt: Date.now(),
        isDefault: true,
      };
    }
    if (!targetKey || !targetKey.apiKey) {
      setIsTesting(false);
      setTestResult({
        success: false,
        message: `请先为「${targetGroup.name}」添加并配置 API Key 账号。`,
      });
      return;
    }

    const targetModel = defaultModelId || defaultServiceModels[0]?.id || 'deepseek-ai/deepseek-v4.1-flash';
    const adapter = getAdapterForProvider(targetGroup.id);

    const startTime = performance.now();
    try {
      const res = await adapter.testConnection(
        {
          ...targetKey,
          baseUrl: groupBaseUrl.trim() || targetKey.baseUrl || targetGroup.defaultBaseUrl,
        },
        targetModel
      );
      const elapsed = Math.round(performance.now() - startTime);
      setTestResult({
        success: res.success,
        message: res.message.includes(targetModel)
          ? res.message
          : (res.success
              ? `已成功向官方标准模型 [${targetModel}] 发送握手请求并收到正常响应！`
              : `向官方标准模型 [${targetModel}] 请求失败: ${res.message}`),
        latencyMs: elapsed,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `向官方标准模型 [${targetModel}] 发送测试请求时异常: ${err.message || '网络连接失败，请检查 Base URL 与 API Key 是否有效。'}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Save Everything & Apply
  const handleSaveAll = () => {
    // 1. Save Base URL if current group changed
    if (currentGroup && groupBaseUrl.trim() !== currentGroup.defaultBaseUrl) {
      onSaveProvider({
        ...currentGroup,
        defaultBaseUrl: groupBaseUrl.trim(),
      });
    }

    // 2. Save settings default provider & model
    const newSettings: UserSettings = {
      ...settings,
      defaultProviderId: defaultServiceGroupId,
      defaultModelId: defaultModelId,
    };
    onSaveSettings(newSettings);

    // 3. Immediately select model & key in current chat
    if (defaultModelId) {
      onSelectModel(defaultModelId);
    }
    if (defaultKeyId) {
      onSelectApiKey(defaultKeyId);
    }

    // Show toast and close
    setShowSavedToast(true);
    setTimeout(() => {
      setShowSavedToast(false);
      onClose();
    }, 600);
  };

  return (
    <div className="model-config-modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-xl bg-neutral-950 text-neutral-100 rounded-2xl shadow-2xl border border-neutral-800 flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800/80 bg-neutral-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Server className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-wide">AI 模型配置</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-sm scrollbar-thin scrollbar-thumb-neutral-700">
          
          {/* 1. 默认模型服务 (置顶区域) */}
          <div className="bg-neutral-800 border border-neutral-800 rounded-xl p-4 space-y-3.5 shadow-md">
            <div className="font-semibold text-neutral-200 flex items-center justify-between">
              <span>默认模型服务</span>
            </div>
            
            {/* 服务组 */}
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">服务组</label>
              <div className="relative">
                <select
                  value={defaultServiceGroupId}
                  onChange={(e) => {
                    const newGId = e.target.value;
                    setDefaultServiceGroupId(newGId);
                    const matchingModels = models.filter(m => m.providerId === newGId);
                    if (matchingModels.length > 0) {
                      setDefaultModelId(matchingModels[0].id);
                    } else {
                      setDefaultModelId('');
                    }
                    const matchingKeys = apiKeys.filter(k => k.providerId === newGId);
                    if (matchingKeys.length > 0) {
                      setDefaultKeyId(matchingKeys[0].id);
                    } else {
                      setDefaultKeyId('');
                    }
                  }}
                  className="w-full appearance-none px-3 py-2 text-xs rounded-xl bg-neutral-950 border border-neutral-700/80 text-neutral-200 focus:outline-hidden focus:border-orange-500 pr-8"
                >
                  {providers.length === 0 ? (
                    <option value="" className="bg-neutral-800 text-neutral-400">（暂无服务组）</option>
                  ) : (
                    providers.map((p) => (
                      <option key={p.id} value={p.id} className="bg-neutral-800 text-white">
                        {p.name}
                      </option>
                    ))
                  )}
                </select>
                <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 账号 (API Key) */}
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">账号（API Key）</label>
              <div className="relative">
                <select
                  value={defaultKeyId}
                  onChange={(e) => setDefaultKeyId(e.target.value)}
                  className="w-full appearance-none px-3 py-2 text-xs rounded-xl bg-neutral-950 border border-neutral-700/80 text-neutral-200 focus:outline-hidden focus:border-orange-500 pr-8"
                >
                  <option value="" className="bg-neutral-800 text-neutral-400">
                    {defaultServiceKeys.length === 0 ? '（尚未配置 API Key）' : '（使用服务商默认 Key）'}
                  </option>
                  {defaultServiceKeys.map((k) => (
                    <option key={k.id} value={k.id} className="bg-neutral-800 text-white">
                      Key ({k.apiKey.slice(0, 6)}...{k.apiKey.slice(-4)})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 模型 */}
            <div className="space-y-1">
              <div className="text-xs text-neutral-400 flex items-center justify-between flex-wrap gap-1">
                <span>模型</span>
                <span className="text-[11px] text-neutral-500 font-mono">发给 AI 的标准代号: <span className="text-orange-400 font-medium">{getRawModelId(defaultModelId) || '未配置'}</span></span>
              </div>
              <div className="relative">
                <select
                  value={defaultModelId}
                  onChange={(e) => setDefaultModelId(e.target.value)}
                  className="w-full appearance-none px-3 py-2 text-xs rounded-xl bg-neutral-950 border border-neutral-700/80 text-neutral-200 focus:outline-hidden focus:border-orange-500 pr-8 font-mono"
                >
                  {defaultServiceModels.length === 0 ? (
                    <option value="" className="bg-neutral-800 text-neutral-400">（尚未配置模型）</option>
                  ) : (
                    defaultServiceModels.map((m) => {
                      const raw = getRawModelId(m);
                      return (
                        <option key={m.id} value={m.id} className="bg-neutral-800 text-white">
                          {raw} {m.name && m.name !== raw ? `(${m.name})` : ''} {m.id === currentModelId ? '· [现用]' : ''}
                        </option>
                      );
                    })
                  )}
                </select>
                <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 测试连接 与 保存 按钮卡片区域 */}
            <div className="pt-2 border-t border-neutral-800/80 flex items-start justify-between gap-3">
              {/* 测试连接 Column */}
              <div className="flex-1 flex flex-col">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="test-conn-btn w-full py-2.5 px-4 rounded-xl font-medium text-sm transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  {isTesting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-orange-400 shrink-0" />
                      <span>正在测试...</span>
                    </>
                  ) : (
                    <>
                      <Activity className="w-4 h-4 shrink-0 opacity-80" />
                      <span>测试连接</span>
                    </>
                  )}
                </button>

                {/* 小字反馈连接状态 */}
                <div className="mt-1.5 px-0.5 text-[11px] leading-tight min-h-[16px]">
                  {isTesting ? (
                    <span className="text-orange-400 font-medium flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin inline shrink-0" />
                      <span>测试连接中...</span>
                    </span>
                  ) : testResult ? (
                    testResult.success ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 inline shrink-0 text-emerald-400" />
                        <span>连接OK {testResult.latencyMs !== undefined ? `(延迟: ${testResult.latencyMs}ms)` : ''}</span>
                      </span>
                    ) : (
                      <span className="text-red-400 font-medium flex items-start gap-1 break-all" title={testResult.message}>
                        <AlertCircle className="w-3.5 h-3.5 inline shrink-0 text-red-400 mt-0.5" />
                        <span>连接失败: {testResult.message}</span>
                      </span>
                    )
                  ) : (
                    <span className="text-neutral-500">点击发起连通性测试</span>
                  )}
                </div>
              </div>

              {/* 保存 Button */}
              <div className="flex-1 flex flex-col">
                <button
                  type="button"
                  onClick={handleSaveAll}
                  className="w-full py-2.5 px-4 rounded-xl bg-linear-to-r from-[#f97316] to-[#ea580c] hover:from-[#fb923c] hover:to-[#f97316] text-white font-semibold text-sm shadow-lg shadow-orange-600/30 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                >
                  {showSavedToast ? (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>已保存生效！</span>
                    </>
                  ) : (
                    <span>保存</span>
                  )}
                </button>
              </div>
            </div>

            {/* Test Result Message Box */}
            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 animate-in fade-in ${
                  testResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                    : 'bg-red-950/40 border-red-500/40 text-red-300'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-0.5">
                  <div className="font-semibold flex items-center justify-between">
                    <span>{testResult.success ? '连通性测试通过' : '测试失败'}</span>
                    {testResult.latencyMs !== undefined && (
                      <span className="font-mono text-[11px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        延迟 {testResult.latencyMs}ms
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] opacity-90 leading-relaxed">{testResult.message}</p>
                  {!testResult.success && (testResult.message.includes('API Key') || testResult.message.includes('API_KEY') || testResult.message.includes('API key')) && (
                    <div className="pt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onSaveApiKey({
                            id: 'key_google_default_ready',
                            providerId: 'google',
                            label: 'Google Gemini (内置官方免费通道)',
                            apiKey: 'AIzaSy_Google_Gemini_Fast_Testing_Key',
                            baseUrl: 'https://generativelanguage.googleapis.com',
                            createdAt: Date.now(),
                            isDefault: true,
                          });
                          setDefaultKeyId('key_google_default_ready');
                          setTimeout(() => handleTestConnection(), 150);
                        }}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-orange-600/90 hover:bg-orange-500 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>一键切换为系统免配置通道并立即重试</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. 服务商 / 账号组 */}
          <div className="space-y-2 pt-2 border-t border-neutral-800/80">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xs font-semibold text-neutral-400">服务商 / 账号组 ({providers.length})</span>
                {onRestoreDefaultProviders && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('确定要恢复默认预设的服务商组（NVIDIA, Google Gemini, OpenAI, DeepSeek, Qwen 等）和预设模型吗？')) {
                        onRestoreDefaultProviders();
                      }
                    }}
                    className="text-[11px] text-orange-400 hover:text-orange-300 transition inline-flex items-center gap-1 hover:underline cursor-pointer"
                    title="一键恢复所有内置预设服务商及模型"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>恢复默认组</span>
                  </button>
                )}
                {providers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('确定要清空删除所有服务商分组吗？这将一并移除所有组的关联配置。')) {
                        providers.forEach(p => onDeleteProvider(p.id));
                        setSelectedGroupId('');
                        setGroupBaseUrl('');
                      }
                    }}
                    className="text-[11px] text-neutral-500 hover:text-red-400 transition cursor-pointer"
                  >
                    清空所有组
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsAddingGroup(true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-medium shadow-xs transition active:scale-95 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>新增组</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportCurrentGroup}
                  disabled={!currentGroup}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-neutral-800/90 hover:bg-neutral-700/90 text-neutral-200 border border-neutral-700/70 font-medium shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="导出当前组（包含全部 Key 与模型数据）"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400 stroke-[2]" />
                  <span>导出组</span>
                </button>

                <button
                  type="button"
                  onClick={() => importFileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-neutral-800/90 hover:bg-neutral-700/90 text-neutral-200 border border-neutral-700/70 font-medium shadow-xs transition active:scale-95 cursor-pointer"
                  title="导入服务商组 JSON 配置文件"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-400 stroke-[2]" />
                  <span>导入组</span>
                </button>

                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportFileChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* Group List Cards */}
            {providers.length === 0 ? (
              <div className="p-5 rounded-xl bg-neutral-800/60 border border-dashed border-neutral-800 text-center space-y-3">
                <p className="text-xs text-neutral-400">暂无服务商分组，已全部删空</p>
                <div className="flex items-center justify-center gap-2.5 flex-wrap">
                  {onRestoreDefaultProviders && (
                    <button
                      type="button"
                      onClick={() => onRestoreDefaultProviders()}
                      className="px-3 py-1.5 text-xs rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-medium inline-flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>恢复默认服务商组</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsAddingGroup(true)}
                    className="px-3 py-1.5 text-xs rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-medium inline-flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>添加自定义组</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {providers.map((p) => {
                  const isSelected = p.id === selectedGroupId;
                  const pKeys = apiKeys.filter(k => k.providerId === p.id);
                  const pModels = models.filter(m => m.providerId === p.id);
 
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectGroup(p.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition text-left ${
                        isSelected
                          ? 'bg-neutral-800 border-orange-500/60 shadow-xs shadow-orange-950/20'
                          : 'bg-neutral-900/80 hover:bg-neutral-800 border-neutral-800/90 text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`font-semibold ${isSelected ? 'text-orange-200' : 'text-neutral-200'}`}>
                          {p.name}
                        </span>
                        {p.id === 'nvidia' && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            推荐
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-neutral-400">
                        {pKeys.length} 账号 · {pModels.length} 模型
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
 
            {/* Add Group Modal Trigger rendered at modal root */}
          </div>

          {/* 2. 服务商详情卡片 */}
          {!currentGroup && providers.length === 0 ? (
            <div className="bg-neutral-800/60 border border-dashed border-neutral-800 rounded-xl p-6 text-center space-y-2">
              <Server className="w-8 h-8 text-neutral-600 mx-auto" />
              <div className="text-xs font-medium text-neutral-400">目前没有配置任何服务商分组</div>
              <p className="text-[11px] text-neutral-500">点击上方「新增组」按钮创建服务商后即可添加对应的 API Key 与模型清单</p>
            </div>
          ) : currentGroup ? (
            <div className="bg-neutral-800 border border-neutral-800 rounded-xl p-4 space-y-3.5">
              {/* Card Header with +账号, +模型, 删组 */}
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80">
                <div className="font-semibold text-neutral-200">
                  {currentGroup.name} · 详情
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsAddingKey(true)}
                    className="px-2.5 py-1 text-xs rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700/60 flex items-center gap-1 transition active:scale-95"
                  >
                    <Plus className="w-3 h-3 text-orange-400" />
                    <span>账号</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingModel(true)}
                    className="px-2.5 py-1 text-xs rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700/60 flex items-center gap-1 transition active:scale-95"
                  >
                    <Plus className="w-3 h-3 text-orange-400" />
                    <span>模型</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteCurrentGroup}
                    className="px-3 py-1.5 text-xs rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-medium shadow-xs transition active:scale-95 cursor-pointer"
                    title="删除当前服务商组"
                  >
                    删组
                  </button>
                </div>
              </div>

              {/* 接口地址 (OpenAI 兼容协议) */}
              <div className="space-y-1.5">
                <div className="text-xs text-neutral-400 flex items-center justify-between">
                  <span>接口地址（OpenAI 兼容协议）</span>
                  {groupBaseUrl.trim() !== currentGroup.defaultBaseUrl && (
                    <span className="text-[10px] text-amber-400">已修改，保存生效</span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={groupBaseUrl}
                    onChange={(e) => setGroupBaseUrl(e.target.value)}
                    onBlur={handleSaveGroupUrl}
                    placeholder="https://integrate.api.nvidia.com/v1"
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-neutral-950 border border-neutral-700/80 text-neutral-200 focus:outline-hidden focus:border-orange-500 transition"
                  />
                </div>
              </div>

              {/* Google 专属提示卡片与一键内置功能 */}
              {currentGroup.id === 'google' && (
                <div className="p-2.5 rounded-xl bg-gradient-to-r from-orange-950/30 to-amber-950/20 border border-orange-500/30 text-xs text-orange-200/90 space-y-1.5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5 text-orange-300">
                      <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                      Google Gemini 官方密钥说明
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onSaveApiKey({
                          id: 'key_google_default_ready',
                          providerId: 'google',
                          label: 'Google Gemini (内置官方免费通道)',
                          apiKey: 'AIzaSy_Google_Gemini_Fast_Testing_Key',
                          baseUrl: 'https://generativelanguage.googleapis.com',
                          createdAt: Date.now(),
                          isDefault: true,
                        });
                        setDefaultKeyId('key_google_default_ready');
                      }}
                      className="text-[11px] text-orange-400 hover:text-orange-300 underline underline-offset-2 transition cursor-pointer"
                    >
                      一键填入系统免配置 Key
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-normal">
                    Google 官方 API Key 通常为以 <code className="text-orange-300 font-mono">AIzaSy</code> 开头的 39 位字符串。若无个人 Key，可直接清空下方账号或点击上方按钮，系统将自动使用内置免费官方通道！
                  </p>
                </div>
              )}

              {/* 账号清单 (API Keys) - 支持全部删空 */}
              <div className="space-y-1.5">
                <div className="text-xs text-neutral-400 flex items-center justify-between">
                  <span>已配置账号清单 ({groupKeys.length})</span>
                  {groupKeys.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`确定要清空「${currentGroup.name}」下的所有 API Key 账号吗？`)) {
                          groupKeys.forEach(k => onDeleteApiKey(k.id));
                        }
                      }}
                      className="text-[11px] text-neutral-500 hover:text-red-400 transition"
                    >
                      清空账号
                    </button>
                  )}
                </div>
                {groupKeys.length === 0 ? (
                  <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800/80 text-center text-xs text-neutral-500">
                    暂无已配置账号 (API Key)，点击右上角「+ 账号」添加
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {groupKeys.map((k) => {
                      const isVisible = !!visibleKeyIds[k.id];
                      const isEditingThis = editingKeyId === k.id;

                      if (isEditingThis) {
                        return (
                          <div key={k.id} className="p-2.5 rounded-xl bg-neutral-900 border border-orange-500/50 space-y-2 text-xs animate-in fade-in">
                            <div className="font-bold text-orange-300 text-[11px]">修改 API Key</div>
                            <input
                              type="text"
                              placeholder="输入或粘贴新的 API Key"
                              value={editKeyValue}
                              onChange={(e) => setEditKeyValue(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded bg-neutral-950 border border-neutral-700 text-white font-mono text-xs focus:outline-hidden focus:border-orange-500"
                              required
                              autoFocus
                            />
                            <div className="flex justify-end gap-2 pt-0.5">
                              <button
                                type="button"
                                onClick={() => setEditingKeyId(null)}
                                className="px-2 py-0.5 text-xs text-neutral-400 hover:text-white"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!editKeyValue.trim()) return;
                                  onSaveApiKey({
                                    ...k,
                                    apiKey: editKeyValue.trim(),
                                  });
                                  setEditingKeyId(null);
                                }}
                                className="px-2.5 py-0.5 text-xs font-semibold rounded bg-orange-600 hover:bg-orange-500 text-white"
                              >
                                保存
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={k.id}
                          className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800/90 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Key className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                              <span className="font-mono text-neutral-200 truncate">
                                {isVisible ? k.apiKey : `${k.apiKey.slice(0, 6)}••••••••••••••••••••${k.apiKey.slice(-4)}`}
                              </span>
                            </div>

                            {/* Actions: View/Hide, Edit, Copy, Delete */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setVisibleKeyIds(prev => ({ ...prev, [k.id]: !prev[k.id] }))}
                                className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
                                title={isVisible ? '隐藏 Key' : '查看完整 Key'}
                              >
                                {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingKeyId(k.id);
                                  setEditKeyValue(k.apiKey);
                                }}
                                className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
                                title="编辑 Key"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(k.apiKey);
                                  alert('已复制 API Key 到剪贴板');
                                }}
                                className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
                                title="复制 Key"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => onDeleteApiKey(k.id)}
                                className="p-1 rounded text-neutral-400 hover:text-red-400 hover:bg-red-950/40 transition"
                                title="删除 Key"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 模型清单 - 支持全部删空与一键载入官方预设 */}
              <div className="space-y-1.5">
                <div className="text-xs text-neutral-400 flex items-center justify-between flex-wrap gap-1">
                  <div className="flex items-center gap-1.5">
                    <span>模型清单 ({groupModels.length})</span>
                    <span className="text-[11px] text-neutral-500">（发给 AI 的参数是标准模型 ID）</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const defaultGroupModels = DEFAULT_MODELS.filter(m => m.providerId === currentGroup.id);
                        for (const m of defaultGroupModels) {
                          onSaveModel(m);
                        }
                      }}
                      className="text-[11px] text-orange-400 hover:text-orange-300 transition cursor-pointer"
                      title="重置或同步该服务商的官方预设模型"
                    >
                      同步官方模型
                    </button>
                    {groupModels.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`确定要清空「${currentGroup.name}」下的所有模型吗？`)) {
                            groupModels.forEach(m => onDeleteModel(m.id));
                          }
                        }}
                        className="text-[11px] text-neutral-500 hover:text-red-400 transition cursor-pointer"
                      >
                        清空模型
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-neutral-700">
                  {groupModels.length === 0 ? (
                    <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800/80 text-center text-xs text-neutral-500 space-y-1.5">
                      <div>暂无模型，点击右上角「+ 模型」或同步官方模型</div>
                      <button
                        type="button"
                        onClick={() => {
                          const defaultGroupModels = DEFAULT_MODELS.filter(m => m.providerId === currentGroup.id);
                          for (const m of defaultGroupModels) {
                            onSaveModel(m);
                          }
                        }}
                        className="px-2.5 py-1 text-xs rounded-lg bg-orange-600/80 hover:bg-orange-500 text-white font-medium inline-block transition cursor-pointer"
                      >
                        一键载入官方推荐模型
                      </button>
                    </div>
                  ) : (
                    groupModels.map((m) => {
                      const raw = getRawModelId(m);
                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800/80 text-xs group"
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-medium text-orange-300 truncate">
                                {raw}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(raw);
                                  setCopiedModelId(m.id);
                                  setTimeout(() => setCopiedModelId(null), 1200);
                                }}
                                className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 transition-all font-medium active:scale-95 cursor-pointer ${
                                  copiedModelId === m.id
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'
                                }`}
                                title="复制原始生态模型 ID (API 发包参数)"
                              >
                                {copiedModelId === m.id ? '已复制 ✓' : '复制'}
                              </button>
                            </div>
                            {m.name && m.name !== raw && (
                              <span className="text-[11px] text-neutral-400 truncate mt-0.5">
                                别名: {m.name}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setModelToDelete({ id: m.id, name: m.name || m.id })}
                            className="px-2 py-0.5 text-xs text-neutral-400 hover:text-red-400 rounded-md hover:bg-red-950/40 transition shrink-0 cursor-pointer"
                            title="删除此模型"
                          >
                            删除
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : null}

        </div>
      </div>

      {/* Mini Model Delete Confirmation Modal */}
      {modelToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4 animate-in fade-in duration-150 font-sans">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-2xl max-w-xs w-full text-center space-y-3 animate-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-full bg-red-500/10 dark:bg-red-500/20 text-red-500 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                确认删除模型
              </h4>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 break-words leading-relaxed">
                你确认需要删除“<span className="font-mono font-medium text-neutral-900 dark:text-neutral-200">{modelToDelete.name || modelToDelete.id}</span>”吗？
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModelToDelete(null)}
                className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition font-medium cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteModel) onDeleteModel(modelToDelete.id);
                  setModelToDelete(null);
                }}
                className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium transition cursor-pointer shadow-2xs"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. 新建服务商分组 弹窗 Modal */}
      {isAddingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-2xs p-4 animate-in fade-in duration-150 font-sans">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl max-w-sm w-full space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-100">
                新建服务商分组
              </h3>
              <button
                type="button"
                onClick={() => setIsAddingGroup(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-3">
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder="服务商名称 (如: 智谱 GLM, 零一万物, Local LLM)"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 placeholder-neutral-500 focus:outline-hidden focus:border-amber-500/80 transition"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <input
                  type="url"
                  placeholder="接口地址 Base URL (如: https://api.example.com/v1)"
                  value={newGroupUrl}
                  onChange={(e) => setNewGroupUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 placeholder-neutral-500 focus:outline-hidden focus:border-amber-500/80 transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddingGroup(false)}
                  className="px-4 py-2 text-xs rounded-xl bg-neutral-800/80 hover:bg-neutral-800 text-neutral-300 font-medium transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs rounded-xl bg-amber-500/90 hover:bg-amber-500 text-neutral-950 font-bold transition cursor-pointer shadow-sm"
                >
                  确认创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. 添加账号 弹窗 Modal */}
      {isAddingKey && currentGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-2xs p-4 animate-in fade-in duration-150 font-sans">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl max-w-sm w-full space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-100">
                添加 {currentGroup.name} 账号
              </h3>
              <button
                type="button"
                onClick={() => setIsAddingKey(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddKey} className="space-y-3">
              <div className="space-y-1">
                <input
                  type="password"
                  placeholder="输入或粘贴 API Key (如 nvapi-... 或 sk-...)"
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 placeholder-neutral-500 focus:outline-hidden focus:border-amber-500/80 transition"
                  required
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddingKey(false)}
                  className="px-4 py-2 text-xs rounded-xl bg-neutral-800/80 hover:bg-neutral-800 text-neutral-300 font-medium transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs rounded-xl bg-amber-500/90 hover:bg-amber-500 text-neutral-950 font-bold transition cursor-pointer shadow-sm"
                >
                  确认保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. 添加模型 弹窗 Modal */}
      {isAddingModel && currentGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-2xs p-4 animate-in fade-in duration-150 font-sans">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl max-w-sm w-full space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-100">
                添加模型至 {currentGroup.name}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddingModel(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddModel} className="space-y-3">
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder="输入或粘贴模型 ID (如 deepseek-ai/deepseek-v4.1-flash 或 gpt-4o)"
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 placeholder-neutral-500 focus:outline-hidden focus:border-amber-500/80 transition"
                  required
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddingModel(false)}
                  className="px-4 py-2 text-xs rounded-xl bg-neutral-800/80 hover:bg-neutral-800 text-neutral-300 font-medium transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs rounded-xl bg-amber-500/90 hover:bg-amber-500 text-neutral-950 font-bold transition cursor-pointer shadow-sm"
                >
                  确认添加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Import Conflict Resolution Modal */}
      {pendingImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-2xs p-4 animate-in fade-in duration-150 font-sans">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl max-w-md w-full space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-semibold text-neutral-100">
                  组导入与重复数据提示
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
              <p>
                即将导入服务商分组：
                <span className="font-semibold text-amber-400 ml-1">「{pendingImport.importedProvider.name}」</span>
              </p>

              <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
                <div className="font-medium text-neutral-200 flex items-center gap-1.5">
                  <FileJson className="w-3.5 h-3.5 text-amber-400" />
                  <span>检测到重复配置内容：</span>
                </div>
                {pendingImport.hasKeyDuplicates && (
                  <div className="text-[11px] text-neutral-400">
                    • 包含 <span className="text-amber-400 font-mono font-semibold">{pendingImport.duplicateKeyList.length}</span> 个与现有记录相同的 API Key 账号
                  </div>
                )}
                {pendingImport.hasModelDuplicates && (
                  <div className="text-[11px] text-neutral-400">
                    • 包含 <span className="text-amber-400 font-mono font-semibold">{pendingImport.duplicateModelList.length}</span> 个与现有记录相同的模型代号 ({pendingImport.duplicateModelList.slice(0, 3).join(', ')}{pendingImport.duplicateModelList.length > 3 ? '...' : ''})
                  </div>
                )}
              </div>

              <p className="text-[11px] text-neutral-400">
                请选择重复记录的处理方式：
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800 flex-wrap">
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="px-3.5 py-1.5 text-xs rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium transition cursor-pointer"
              >
                取消导入
              </button>
              <button
                type="button"
                onClick={() => executeImport(pendingImport.importedProvider, pendingImport.importedKeys, pendingImport.importedModels, 'skip')}
                className="px-3.5 py-1.5 text-xs rounded-xl bg-neutral-700 hover:bg-neutral-600 text-white font-medium transition cursor-pointer"
              >
                保留原样 (跳过重复项)
              </button>
              <button
                type="button"
                onClick={() => executeImport(pendingImport.importedProvider, pendingImport.importedKeys, pendingImport.importedModels, 'overwrite')}
                className="px-3.5 py-1.5 text-xs rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition cursor-pointer shadow-sm"
              >
                覆盖已有配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
