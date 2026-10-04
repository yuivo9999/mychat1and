import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Conversation, 
  Message, 
  Attachment, 
  ModelItem, 
  ProviderDefinition, 
  ApiKeyConfig, 
  UserSettings, 
  ConnectionStatus,
  ModelParameters,
  WebSearchResultItem,
  ThinkingStep,
  Workspace,
  WorkspaceFile,
  ChatContext,
  ToolCallExecution,
  Project,
  ProjectMemoryMode
} from './types';
import { 
  getWorkspaces,
  saveWorkspace,
  deleteWorkspace,
  createEmptyWorkspace,
  createWorkspaceSnapshot,
  packageWorkspaceToZip,
  getModifiedFilesAgainstOriginal
} from './services/workspaceService';
import { 
  updateChatContext, 
  prepareChatHistoryWithHierarchicalCompaction,
  pruneAgentLoopHistory,
  detectDiagnosisIntent,
  detectWorkspaceIntent,
  formatChatContextPrompt
} from './services/chatContextService';
import { 
  buildAgentSystemPrompt, 
  extractToolCallsFromResponse, 
  executeWorkspaceTool, 
  cleanResponseText,
  formatToolOutcomeForModel
} from './services/agentEngine';
import {
  resolveMentionedWorkspaceFiles,
  workspaceFileToAttachment,
  workspaceZipToAttachment,
  isWorkspaceZipRequested
} from './services/workspaceFileAttachment';
import { WorkspaceDrawer } from './components/WorkspaceDrawer';
import { 
  getConversations, 
  saveConversation, 
  deleteConversation, 
  clearAllConversations,
  getApiKeys,
  saveApiKey,
  deleteApiKey,
  clearAllApiKeys,
  getModels,
  saveModel,
  deleteModel,
  getProviders,
  saveProvider,
  deleteProvider,
  restoreDefaultProviders,
  getUserSettings,
  saveUserSettings,
  resetAllData,
  DEFAULT_SETTINGS,
  getProjects,
  saveProject,
  deleteProject
} from './services/db';
import { formatProjectMemoryPrompt, updateProjectCollectiveMemory } from './services/projectMemoryService';
import { getAdapterForProvider } from './services/adapters';
import { safeExtractText } from './services/adapters/base';
import { performWebSearch, buildWebSearchContext } from './services/webSearch';
import { isModelWebSearchSupported, isModelVisionCapable, isModelFileCapable, isModelReasoningSupported } from './services/modelUtils';
import { optimizePrompt } from './services/promptPerfectService';
import { formatContext7Grounding, searchContext7 } from './services/context7Service';
import { UI_UX_DESIGN_SKILL_PROMPT } from './services/uiUxSkill';
import { isAttachmentTextReadable, formatFilesPromptForAi } from './services/fileParser';
import { applyAppFont, initCustomFonts } from './services/fontService';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { MessageList } from './components/MessageList';
import { ChatComposer } from './components/ChatComposer';
import { SettingsModal } from './components/SettingsModal';
import { SearchModal } from './components/SearchModal';
import { ExportModal } from './components/ExportModal';
import { BatchManageModal } from './components/BatchManageModal';
import { ParametersModal } from './components/ParametersModal';
import { AiModelConfigModal } from './components/AiModelConfigModal';
import { CreateProjectModal } from './components/CreateProjectModal';
import { ArchiveProjectModal } from './components/ArchiveProjectModal';
import { WorkspacePreviewModal } from './components/WorkspacePreviewModal';
import { AiFileAuditModal } from './components/AiFileAuditModal';
import { recordAiFileModifications, backfillAuditRecordsFromConversations } from './services/aiFileAuditService';

const DEFAULT_PARAMETERS: ModelParameters = {
  enableReasoning: false,
  stream: true,
  limitMaxTokens: false,
  maxTokens: 4096,
  temperature: 0.5,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stop: '',
  seed: 0,
};

export default function App() {
  // Core Entities State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [providers, setProviders] = useState<ProviderDefinition[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyConfig[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  // Active Selections
  const [selectedModelId, setSelectedModelId] = useState<string>('deepseek-ai/deepseek-v4.1-flash');
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string | undefined>();

  // Runtime State
  const [isGenerating, setIsGenerating] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unconfigured');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [quotedText, setQuotedText] = useState<string | null>(null);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string>('chat');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [isParametersOpen, setIsParametersOpen] = useState(false);
  const [isModelConfigOpen, setIsModelConfigOpen] = useState(false);

  // Model Parameters State (Reasoning, Stream, Max Tokens, Temp, Top P, Penalties, Stop, Seed)
  const [parameters, setParameters] = useState<ModelParameters>(DEFAULT_PARAMETERS);

  // Web Access State (访问网络, 默认关闭 false)
  const [webAccessEnabled, setWebAccessEnabled] = useState(false);

  // AI Workspace State (Strictly decoupled from Chat Memory)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>(undefined);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [agentMode, setAgentMode] = useState(false);

  // Pending Attachments & Prompt injected into ChatComposer from Workspace Drawer
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[] | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  // Projects State (Image 1, 2, 3: 项目分类与多会话共享记忆管理)
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [conversationToArchive, setConversationToArchive] = useState<Conversation | null>(null);

  // Layout & Responsive
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Abort Controller ref for stopping generation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Check viewport width
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Theme synchronization
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'theme-classic1', 'theme-classic2', 'theme-modern1', 'theme-sangtian-shanhe');

    if (settings.theme === 'classic1') {
      root.classList.add('theme-classic1');
    } else if (settings.theme === 'classic2') {
      root.classList.add('theme-classic2');
    } else if (settings.theme === 'modern1') {
      root.classList.add('theme-modern1');
    } else if (settings.theme === 'sangtian-shanhe') {
      root.classList.add('theme-sangtian-shanhe');
    } else {
      const isDark =
        settings.theme === 'dark' ||
        (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

      if (isDark) {
        root.classList.add('dark');
      }
    }
  }, [settings.theme]);

  // Apply Font Family to Document Root
  useEffect(() => {
    applyAppFont(settings.fontFamily);
  }, [settings.fontFamily]);

  // Initial Data Load
  useEffect(() => {
    async function init() {
      try {
        const [settingsResult, providersResult, modelsResult, keysResult, conversationsResult, workspacesResult, projectsResult] =
          await Promise.allSettled([
            getUserSettings(),
            getProviders(),
            getModels(),
            getApiKeys(),
            getConversations(),
            getWorkspaces(),
            getProjects(),
          ]);

        const loadedSettings = settingsResult.status === 'fulfilled' ? settingsResult.value : DEFAULT_SETTINGS;
        const loadedProviders = providersResult.status === 'fulfilled' ? providersResult.value : [];
        const loadedModels = modelsResult.status === 'fulfilled' ? modelsResult.value : [];
        const loadedKeys = keysResult.status === 'fulfilled' ? keysResult.value : [];
        const loadedConversations = conversationsResult.status === 'fulfilled' ? conversationsResult.value : [];
        let loadedWorkspaces: Workspace[] = workspacesResult.status === 'fulfilled' ? (workspacesResult.value as Workspace[]) : [];
        const loadedProjects: Project[] = projectsResult.status === 'fulfilled' ? (projectsResult.value as Project[]) : [];

        // Load and register local custom fonts from IndexedDB, and apply initial font
        const customFonts = await initCustomFonts();
        applyAppFont(loadedSettings.fontFamily, customFonts);

        // If no workspace exists yet, create an initial clean project workspace
        if (loadedWorkspaces.length === 0) {
          const initialWs = createEmptyWorkspace('我的工作区');
          await saveWorkspace(initialWs);
          loadedWorkspaces = [initialWs];
        }

        setSettings(loadedSettings);
        setProviders(loadedProviders);
        setModels(loadedModels);
        setApiKeys(loadedKeys);
        setConversations(loadedConversations);
        setWorkspaces(loadedWorkspaces);
        setActiveWorkspaceId(loadedWorkspaces[0]?.id);
        setProjects(loadedProjects);

        // Backfill historical AI file modifications to audit service if needed
        backfillAuditRecordsFromConversations(loadedConversations, loadedWorkspaces);

        const initialModel =
          loadedModels.find(m => m.id === loadedSettings.defaultModelId) || loadedModels[0];
        if (initialModel) {
          setSelectedModelId(initialModel.id);
        }

        if (loadedConversations.length > 0) {
          setActiveConversationId(loadedConversations[0].id);
        }
      } catch (err) {
        console.error('Failed to initialize local database:', err);
      }
    }
    init();
  }, []);

  // Sync selected API key when model changes
  useEffect(() => {
    const currentModel = models.find(m => m.id === selectedModelId);
    if (!currentModel) return;

    const matchedKeys = apiKeys.filter(k => k.providerId === currentModel.providerId);
    if (matchedKeys.length > 0) {
      const defaultKey = matchedKeys.find(k => k.isDefault) || matchedKeys[0];
      setSelectedApiKeyId(defaultKey.id);
      setConnectionStatus('configured');
    } else {
      setSelectedApiKeyId(undefined);
      setConnectionStatus('unconfigured');
    }
  }, [selectedModelId, apiKeys, models]);

  // Current active conversation
  const currentConversation = conversations.find(c => c.id === activeConversationId) || null;
  const currentModel = models.find(m => m.id === selectedModelId) || models[0];
  const currentApiKey = apiKeys.find(k => k.id === selectedApiKeyId);

  // Resolved active workspace for current chat or selection
  const currentWorkspace: Workspace | null = useMemo(() => {
    if (currentConversation?.workspaceId) {
      const matched = workspaces.find(w => w.id === currentConversation.workspaceId);
      if (matched) return matched;
    }
    if (activeWorkspaceId) {
      const matched = workspaces.find(w => w.id === activeWorkspaceId);
      if (matched) return matched;
    }
    return workspaces[0] || null;
  }, [workspaces, currentConversation?.workspaceId, activeWorkspaceId]);

  // Count modified files against original baseline
  const modifiedFilesCountAgainstOriginal = useMemo(() => {
    if (!currentWorkspace) return 0;
    return getModifiedFilesAgainstOriginal(currentWorkspace).length;
  }, [currentWorkspace]);

  // Sync parameters, web access, and workspace binding when active conversation switches
  useEffect(() => {
    if (currentConversation?.parameters) {
      setParameters({ ...DEFAULT_PARAMETERS, ...currentConversation.parameters });
    } else {
      setParameters(DEFAULT_PARAMETERS);
    }
    if (currentConversation?.webAccessEnabled !== undefined) {
      setWebAccessEnabled(currentConversation.webAccessEnabled);
    } else {
      setWebAccessEnabled(false);
    }
    if (currentConversation?.agentMode !== undefined) {
      setAgentMode(currentConversation.agentMode);
    } else {
      setAgentMode(false);
    }
    if (currentConversation?.workspaceId) {
      setActiveWorkspaceId(currentConversation.workspaceId);
    }
  }, [activeConversationId]);

  // Workspace CRUD handlers
  const handleSaveWorkspaceState = async (updatedWs: Workspace) => {
    await saveWorkspace(updatedWs);
    setWorkspaces(prev => {
      const idx = prev.findIndex(w => w.id === updatedWs.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updatedWs;
        return copy;
      }
      return [updatedWs, ...prev];
    });
  };

  const handleSelectWorkspaceForCurrentChat = async (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    if (currentConversation) {
      const updatedConv = {
        ...currentConversation,
        workspaceId,
        updatedAt: Date.now(),
      };
      await saveConversation(updatedConv);
      setConversations(prev => prev.map(c => c.id === updatedConv.id ? updatedConv : c));
    }
  };

  const handleDeleteWorkspaceSafe = async (workspaceId: string) => {
    if (confirm('确认删除此工作区？注意：删除工作区仅移除该项目文件，绝不会影响任何聊天记录。')) {
      await deleteWorkspace(workspaceId);
      const remaining = workspaces.filter(w => w.id !== workspaceId);
      setWorkspaces(remaining);
      setActiveWorkspaceId(remaining[0]?.id);
    }
  };

  const handleDownloadWorkspaceZipAction = async () => {
    if (!currentWorkspace || Object.keys(currentWorkspace.files).length === 0) {
      alert('当前工作区没有可下载的文件');
      return;
    }
    try {
      const blob = await packageWorkspaceToZip(currentWorkspace);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentWorkspace.name}-v${currentWorkspace.currentVersion}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`打包下载失败: ${err.message || '未知错误'}`);
    }
  };

  const handleToggleAgentMode = (enabled: boolean) => {
    setAgentMode(enabled);
    if (currentConversation) {
      const updated = { ...currentConversation, agentMode: enabled, updatedAt: Date.now() };
      saveConversation(updated);
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c));
    }
  };

  const handleUpdateParameters = (newParams: ModelParameters) => {
    setParameters(newParams);
    if (currentConversation) {
      const updated = { ...currentConversation, parameters: newParams, updatedAt: Date.now() };
      saveConversation(updated);
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c));
    }
  };

  // Project CRUD & Collective Memory Handlers (Image 1, 2, 3)
  const handleCreateProject = async (name: string, memoryMode: ProjectMemoryMode) => {
    const newProject: Project = {
      id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      memoryMode,
      sharedMemory: {
        keyPoints: [],
      },
    };
    await saveProject(newProject);
    setProjects(prev => [newProject, ...prev]);

    // If there was a conversation pending archive to this newly created project
    if (conversationToArchive) {
      handleArchiveConversationToProject(conversationToArchive.id, newProject.id);
      setConversationToArchive(null);
    }
  };

  const handleUpdateProject = async (project: Project) => {
    await saveProject(project);
    setProjects(prev => prev.map(p => p.id === project.id ? project : p));
  };

  const handleDeleteProject = async (projectId: string) => {
    await deleteProject(projectId);
    setProjects(prev => prev.filter(p => p.id !== projectId));
    // When deleting a project, move all its chats back to the general chat list (unarchive)
    setConversations(prev => {
      return prev.map(c => {
        if (c.projectId === projectId) {
          const updated = { ...c, projectId: undefined, updatedAt: Date.now() };
          saveConversation(updated);
          return updated;
        }
        return c;
      });
    });
  };

  const handleNewChatInProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    const newConv: Conversation = {
      id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelId: selectedModelId,
      providerId: currentModel?.providerId || DEFAULT_SETTINGS.defaultProviderId,
      apiKeyId: selectedApiKeyId,
      parameters: parameters,
      webAccessEnabled: false,
      agentMode: false, // 默认 Agent OFF
      projectId,
      messages: [],
    };

    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    setWebAccessEnabled(false);
    setAgentMode(false);
    saveConversation(newConv);

    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleTogglePinConversation = (convId: string) => {
    setConversations(prev => {
      return prev.map(c => {
        if (c.id === convId) {
          const updated = { ...c, isPinned: !c.isPinned, updatedAt: Date.now() };
          saveConversation(updated);
          return updated;
        }
        return c;
      });
    });
  };

  const handleArchiveConversationToProject = (convId: string, projectId: string) => {
    setConversations(prev => {
      return prev.map(c => {
        if (c.id === convId) {
          const updated = { ...c, projectId, updatedAt: Date.now() };
          saveConversation(updated);
          return updated;
        }
        return c;
      });
    });
  };

  const handleUnarchiveConversationFromProject = (convId: string) => {
    setConversations(prev => {
      return prev.map(c => {
        if (c.id === convId) {
          const updated = { ...c, projectId: undefined, updatedAt: Date.now() };
          saveConversation(updated);
          return updated;
        }
        return c;
      });
    });
  };

  // Toggle Web Access (默认关闭)
  const handleToggleWebAccess = (enabled: boolean) => {
    setWebAccessEnabled(enabled);
    if (currentConversation) {
      const updated = {
        ...currentConversation,
        webAccessEnabled: enabled,
        updatedAt: Date.now(),
      };
      saveConversation(updated);
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c));
    }
  };

  // New Chat Action
  const handleNewChat = useCallback(() => {
    const newConv: Conversation = {
      id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelId: selectedModelId,
      providerId: currentModel?.providerId || DEFAULT_SETTINGS.defaultProviderId,
      apiKeyId: selectedApiKeyId,
      parameters: parameters,
      webAccessEnabled: false, // 默认关闭
      agentMode: false, // 默认 Agent OFF
      messages: [],
    };

    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    setWebAccessEnabled(false);
    setAgentMode(false);
    saveConversation(newConv);

    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [selectedModelId, currentModel, selectedApiKeyId, parameters, isMobile]);

  const handleSelectModel = (id: string) => {
    const model = models.find(m => m.id === id);
    if (!model) return;

    const providerKeys = apiKeys.filter(k => k.providerId === model.providerId);
    const nextApiKeyId = providerKeys.find(k => k.isDefault)?.id || providerKeys[0]?.id;

    setSelectedModelId(id);
    setSelectedApiKeyId(nextApiKeyId);
    setConnectionStatus(nextApiKeyId ? 'configured' : 'unconfigured');

    if (currentConversation) {
      const updated = {
        ...currentConversation,
        modelId: model.id,
        providerId: model.providerId,
        apiKeyId: nextApiKeyId,
        updatedAt: Date.now(),
      };
      saveConversation(updated);
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c));
    }
  };

  // Keyboard Shortcuts (⌘K search, ⌘N new chat)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewChat]);

  // Stop Generation
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setConnectionStatus('configured');
  };

  // Send Message Core Engine
  const handleSendMessage = async (
    text: string,
    attachments: Attachment[],
    conversationOverride?: Conversation,
  ) => {
    if (isGenerating) return;
    if (!currentModel) {
      alert('当前没有可用模型，请先进入设置检查模型配置。');
      setIsModelConfigOpen(true);
      return;
    }
    if (!currentApiKey) {
      alert('未找到适用的 API Key，请先进入设置填写。');
      setIsSettingsOpen(true);
      setSettingsTab('keys');
      return;
    }

    let targetConv = conversationOverride || currentConversation;
    // Auto-create conversation if none exists
    if (!targetConv) {
      const newConv: Conversation = {
        id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: text.slice(0, 24) || '新对话',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        modelId: selectedModelId,
        providerId: currentModel.providerId,
        apiKeyId: selectedApiKeyId,
        parameters,
        messages: [],
      };
      targetConv = newConv;
      setConversations(prev => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
    }

    // On-demand Workspace Files Resolution:
    // Files are attached as true file resources (Attachment) rather than concatenating into a giant prompt
    let effectiveAttachments = [...attachments];
    if (currentWorkspace && currentWorkspace.files) {
      const alreadyAttached = new Set(effectiveAttachments.map(a => a.name));

      // 1. Check if user asked for a ZIP of the workspace
      if (isWorkspaceZipRequested(text)) {
        try {
          const zipAtt = await workspaceZipToAttachment(currentWorkspace);
          if (!alreadyAttached.has(zipAtt.name)) {
            effectiveAttachments.push(zipAtt);
            alreadyAttached.add(zipAtt.name);
          }
        } catch (e) {
          console.warn('Failed to package workspace zip on demand:', e);
        }
      }

      // 2. Check if user explicitly mentioned specific file(s) in the workspace (e.g. "第3章", "App.tsx")
      const mentionedFiles = resolveMentionedWorkspaceFiles(text, currentWorkspace, alreadyAttached);
      for (const mf of mentionedFiles) {
        const att = workspaceFileToAttachment(mf);
        effectiveAttachments.push(att);
        alreadyAttached.add(att.name);
      }
    }

    // Detect Workspace Intent
    const workspaceIntent = detectWorkspaceIntent(text, targetConv.chatContext);

    // If the user requested modifying, creating, or deleting files in the workspace while Agent is OFF:
    // System MUST NOT silently turn on Agent, but instead reject execution and prompt user to enable Agent mode
    if (workspaceIntent.type === 'modify' && !agentMode) {
      const refuseUserMessage: Message = {
        id: `msg_u_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
        attachments: effectiveAttachments,
      };

      const refuseAssistantMessage: Message = {
        id: `msg_a_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        role: 'assistant',
        content: '⚠️ **这个任务需要修改或写入工作区文件。**\n\n当前处于**普通聊天模式**（工作区只读）。请先在输入框顶部开启 **Agent [ON]** 模式，然后再执行修改操作。',
        timestamp: Date.now(),
        model: currentModel.name,
        providerId: currentModel.providerId,
        status: 'completed',
        thinkingSteps: [
          {
            id: `step_mode_check_${Date.now()}`,
            icon: 'github',
            title: '权限安全检查：当前为普通聊天只读模式 (Agent OFF)，已拦截写入操作',
            status: 'completed',
          },
        ],
      };

      const updatedMessages = [...targetConv.messages, refuseUserMessage, refuseAssistantMessage];
      const updatedConv: Conversation = {
        ...targetConv,
        updatedAt: Date.now(),
        messages: updatedMessages,
      };
      setConversations(prev => prev.map(c => c.id === updatedConv.id ? updatedConv : c));
      await saveConversation(updatedConv);
      return;
    }

    const userMessage: Message = {
      id: `msg_u_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      attachments: effectiveAttachments,
    };

    const isPromptPerfectEnabled = Boolean((targetConv?.parameters || parameters)?.promptPerfect);
    const isContext7Enabled = Boolean((targetConv?.parameters || parameters)?.context7);
    const isUiUxSkillEnabled = Boolean((targetConv?.parameters || parameters)?.uiUxSkill);

    const initialThinkingSteps: ThinkingStep[] = [
      {
        id: `step_analyze_${Date.now()}`,
        icon: 'github',
        title: '获取上下文并分析模型交互配置',
        status: 'completed',
      },
    ];

    if (isPromptPerfectEnabled) {
      initialThinkingSteps.push({
        id: `step_prompt_perfect_${Date.now()}`,
        icon: 'lightning',
        title: '✨ Prompt Perfect 已启动：自动优化与升级您的提示词工程质量',
        status: 'completed',
      });
    }

    if (isContext7Enabled) {
      initialThinkingSteps.push({
        id: `step_context7_${Date.now()}`,
        icon: 'search',
        title: 'Context7 官方技术文档检索已启用',
        status: 'completed',
      });
    }

    if (isUiUxSkillEnabled) {
      initialThinkingSteps.push({
        id: `step_uiux_skill_${Date.now()}`,
        icon: 'brain',
        title: 'UI/UX Design Skill 已启用：设计 → 实现 → UI Review',
        status: 'completed',
      });
    }

    // Check vision capabilities for image attachments
    const hasImageAttachments = (effectiveAttachments || []).some(a => a.type.startsWith('image/'));
    const isVisionSupported = isModelVisionCapable(currentModel, currentModel.providerId);

    // Check file capabilities for document / code attachments
    const nonImageAttachments = (effectiveAttachments || []).filter(a => !a.type.startsWith('image/'));
    const fileSupport = isModelFileCapable(currentModel, currentModel.providerId);

    // Check reasoning / thinking mode status
    const isReasoningEnabled = Boolean((targetConv.parameters || parameters)?.enableReasoning);
    const modelSupportsReasoning = isModelReasoningSupported(currentModel, currentModel.providerId);

    if (effectiveAttachments && effectiveAttachments.length > 0) {
      if (hasImageAttachments && !isVisionSupported) {
        initialThinkingSteps.push({
          id: `step_att_${Date.now()}`,
          icon: 'code',
          title: `当前模型不支持图片识别，已自动略过图片数据，仅发送文字提问`,
          status: 'completed',
        });
      } else if (nonImageAttachments.length > 0 && !fileSupport.supported) {
        initialThinkingSteps.push({
          id: `step_att_${Date.now()}`,
          icon: 'code',
          title: `当前模型不支持文件解析，已自动略过文件数据，仅发送文字提问`,
          status: 'completed',
        });
      } else {
        initialThinkingSteps.push({
          id: `step_att_${Date.now()}`,
          icon: 'code',
          title: `已解析并装载【${effectiveAttachments.length} 个附件文件】`,
          status: 'completed',
        });
      }
    }

    if (isReasoningEnabled && !modelSupportsReasoning) {
      initialThinkingSteps.push({
        id: `step_reasoning_${Date.now()}`,
        icon: 'brain',
        title: `当前模型不支持原生思考模式，已转为标准模式直接回答`,
        status: 'completed',
      });
    }

    if (webAccessEnabled) {
      initialThinkingSteps.push({
        id: `step_search_${Date.now()}`,
        icon: 'search',
        title: '联网模式已开启，检索最新网络网页资料中...',
        status: 'running',
      });
    } else {
      initialThinkingSteps.push({
        id: `step_engine_${Date.now()}`,
        icon: 'github',
        title: `调用 ${currentModel.name} 推理引擎并准备输出`,
        status: 'running',
      });
    }

    let currentThinkingSteps = [...initialThinkingSteps];

    const initialNotices = '';
    const assistantMsgId = `msg_a_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const assistantMessage: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: initialNotices || '',
      timestamp: Date.now(),
      model: currentModel.name,
      providerId: currentModel.providerId,
      status: 'streaming',
      thinkingSteps: currentThinkingSteps,
      versions: [{ content: initialNotices || '', timestamp: Date.now(), model: currentModel?.name }],
      currentVersionIndex: 0,
    };

    // Auto-title on first message
    const isFirst = targetConv.messages.length === 0;
    const nextTitle = isFirst ? (text.slice(0, 26) || '新对话') : targetConv.title;

    const updatedMessages = [...targetConv.messages, userMessage, assistantMessage];
    const updatedConv: Conversation = {
      ...targetConv,
      title: nextTitle,
      updatedAt: Date.now(),
      modelId: currentModel.id,
      providerId: currentModel.providerId,
      apiKeyId: selectedApiKeyId,
      parameters: targetConv.parameters || parameters,
      webAccessEnabled,
      messages: updatedMessages,
    };

    // Persist the initial streaming state before starting the request.
    setConversations(prev => prev.map(c => c.id === updatedConv.id ? updatedConv : c));
    await saveConversation(updatedConv);

    setIsGenerating(true);
    setConnectionStatus('requesting');
    setStatusMessage('正在请求 AI 生成...');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const adapter = getAdapterForProvider(currentModel.providerId);
    let accumulatedText = '';

    // Web Search Grounding (if 访问网络 is enabled)
    let webResults: WebSearchResultItem[] = [];
    let webContext = '';
    let webSearchNotice = '';

    if (webAccessEnabled) {
      const searchSupport = isModelWebSearchSupported(currentModel, currentModel.providerId);

      if (!searchSupport.supported) {
        // Model does NOT support web search: Inform user honestly, NEVER fake that it searched!
        const reasonText = searchSupport.reason || '当前模型不支持接入网络搜索';
        webSearchNotice = `> ⚠️ **联网搜索提示**：当前选择的模型【${currentModel.name || currentModel.id}】不支持实时网络搜索功能（${reasonText}）。本次回答仅基于该模型的离线训练知识库，未联网检索最新数据。如需获取最新实时网络信息，请在顶栏切换为支持联网的模型（如 Gemini 3.8 Flash、DeepSeek、GPT-4o 等）。\n\n`;

        const updatedSteps: ThinkingStep[] = currentThinkingSteps.map(s => {
          if (s.id.startsWith('step_search_')) {
            return {
              ...s,
              icon: 'search',
              title: `当前模型不支持联网搜索（${reasonText}），已转为离线回答`,
              status: 'completed',
            };
          }
          return s;
        });
        currentThinkingSteps = updatedSteps;
        setConversations(prev => prev.map(c => {
          if (c.id !== updatedConv.id) return c;
          return {
            ...c,
            messages: c.messages.map(m => m.id === assistantMsgId ? { ...m, thinkingSteps: updatedSteps } : m),
          };
        }));
      } else {
        // Model supports web search: Perform real-time search
        setStatusMessage('正在联网检索最新网页与资料...');
        try {
          const searchRes = await performWebSearch(text, settings.searchEngines, settings.activeSearchEngineId);
          if (searchRes.results.length > 0 || searchRes.pageContents.length > 0) {
            webResults = searchRes.results;
            webContext = buildWebSearchContext(searchRes);

            const updatedSteps: ThinkingStep[] = currentThinkingSteps.map(s => {
              if (s.id.startsWith('step_search_')) {
                return {
                  ...s,
                  icon: 'lightning',
                  title: `已搜索到 ${webResults.length} 条实时网络参考资料`,
                  status: 'completed',
                };
              }
              return s;
            });

            if (searchRes.pageContents.length > 0) {
              updatedSteps.push({
                id: `step_page_${Date.now()}`,
                icon: 'search',
                title: `审查并读取 ${searchRes.pageContents.length} 个目标网页正文`,
                status: 'completed',
              });
            }

            updatedSteps.push({
              id: `step_engine_${Date.now()}`,
              icon: 'github',
              title: `结合网络资料调用 ${currentModel.name} 组织回答`,
              status: 'running',
            });

            currentThinkingSteps = updatedSteps;

            setConversations(prev => prev.map(c => {
              if (c.id !== updatedConv.id) return c;
              return {
                ...c,
                messages: c.messages.map(m => m.id === assistantMsgId ? { ...m, thinkingSteps: updatedSteps } : m),
              };
            }));
          } else {
            // Search returned 0 results: Honest notification, do not pretend!
            webSearchNotice = `> ℹ️ **联网检索提示**：网络搜索服务未检索到与本次提问直接相关的公开网页数据，AI 已转为基于基础知识库为您作答。\n\n`;
            const updatedSteps: ThinkingStep[] = currentThinkingSteps.map(s => {
              if (s.id.startsWith('step_search_')) {
                return {
                  ...s,
                  icon: 'search',
                  title: '未检索到相关公开网页数据，已转为基于基础知识库回答',
                  status: 'completed',
                };
              }
              return s;
            });
            updatedSteps.push({
              id: `step_engine_${Date.now()}`,
              icon: 'github',
              title: `调用 ${currentModel.name} 基础知识库组织回答`,
              status: 'running',
            });
            currentThinkingSteps = updatedSteps;

            setConversations(prev => prev.map(c => {
              if (c.id !== updatedConv.id) return c;
              return {
                ...c,
                messages: c.messages.map(m => m.id === assistantMsgId ? { ...m, thinkingSteps: updatedSteps } : m),
              };
            }));
          }
        } catch (searchErr) {
          console.warn('Web search error:', searchErr);
          webSearchNotice = `> ⚠️ **联网检索提示**：实时网络检索服务连接异常，已自动降级为离线模型知识库为您作答。\n\n`;
          const updatedSteps: ThinkingStep[] = currentThinkingSteps.map(s => {
            if (s.id.startsWith('step_search_')) {
              return {
                ...s,
                icon: 'search',
                title: '网络检索服务连接异常，已降级为模型基础知识库直接回答',
                status: 'completed',
              };
            }
            return s;
          });
          currentThinkingSteps = updatedSteps;
        }
      }
    }

    try {
      const baseParams = updatedConv.parameters || parameters;
      const activeParams: ModelParameters = {
        ...baseParams,
        // Only send enableReasoning to model if the model actually supports reasoning mode
        enableReasoning: isReasoningEnabled && modelSupportsReasoning,
      };
      const baseSystemPrompt = targetConv.systemPrompt || settings.defaultSystemPrompt;
      let effectiveSystemPrompt = webContext
        ? (baseSystemPrompt ? `${baseSystemPrompt}\\n\\n${webContext}` : webContext)
        : baseSystemPrompt;

      if (isUiUxSkillEnabled) {
        effectiveSystemPrompt = effectiveSystemPrompt
          ? `${effectiveSystemPrompt}\n\n${UI_UX_DESIGN_SKILL_PROMPT}`
          : UI_UX_DESIGN_SKILL_PROMPT;
      }
      let wsToOperate: Workspace | null = currentWorkspace ? JSON.parse(JSON.stringify(currentWorkspace)) : null;

      // 1. Detect Workspace Intent & Agent Mode Activation
      const workspaceIntent = detectWorkspaceIntent(text, targetConv.chatContext);
      // When Agent Mode is explicitly turned ON, and a workspace is bound, Agent capability is 100% active
      const workspaceContextEnabled = !!wsToOperate && (agentMode || workspaceIntent.shouldAccessWorkspace);
      const workspaceAgentEnabled = agentMode && !!wsToOperate;

      // 2. Detect Code Diagnosis intent vs Normal task (only valid when workspace context is enabled)
      const diagIntent = detectDiagnosisIntent(text, targetConv.chatContext);
      const isDiagnosisMode = workspaceContextEnabled && (diagIntent.isDiagnosis || workspaceIntent.type === 'inspect');

      // 3. System Prompt: ONLY inject Workspace Summary, Tools Protocol & Diagnosis Protocol when Workspace Agent is explicitly enabled!
      if (workspaceAgentEnabled) {
        effectiveSystemPrompt = buildAgentSystemPrompt(
          wsToOperate,
          targetConv.chatContext,
          effectiveSystemPrompt,
          isDiagnosisMode,
          activeParams.executeScript
        );
      } else {
        // Pure chat mode / Agent OFF: only append chat's own private memory if present AND enabled, ZERO workspace tools protocol or directory trees
        const chatMemory = (settings.enableChatContextMemory ?? false) ? formatChatContextPrompt(targetConv.chatContext) : '';
        if (chatMemory) {
          effectiveSystemPrompt = effectiveSystemPrompt ? `${effectiveSystemPrompt}\n\n${chatMemory}` : chatMemory;
        }
      }

      // 4. Project Collective Memory (Multiple chats inside same project share project memory)
      if (targetConv.projectId) {
        const currentProj = projects.find(p => p.id === targetConv.projectId);
        if (currentProj) {
          const projConvs = conversations.filter(c => c.projectId === currentProj.id);
          const projPrompt = formatProjectMemoryPrompt(currentProj, projConvs, targetConv.id);
          if (projPrompt) {
            effectiveSystemPrompt = effectiveSystemPrompt ? `${effectiveSystemPrompt}\n\n${projPrompt}` : projPrompt;
          }
        }
      }

      setStatusMessage(
        isDiagnosisMode 
          ? 'Agent 正在执行 10 步静态代码诊断与调用链分析...' 
          : (workspaceAgentEnabled ? 'Agent 正在分析任务与查阅工作区文件...' : 'AI 正在组织回答...')
      );

      const executedToolCalls: ToolCallExecution[] = [];
      const modifiedPaths = new Set<string>();

      // Prepare user message for API call: if model does not support vision or files, safely strip unsupported attachments
      let apiUserMessage = userMessage;
      const modelLabel = currentModel.name || currentModel.id;

      // Filter attachments based on model capability
      const effectiveAttsForApi = (userMessage.attachments || []).filter(a => {
        if (a.type.startsWith('image/')) return isVisionSupported;
        return fileSupport.supported && (isAttachmentTextReadable(a) || currentModel.providerId === 'google' || currentModel.providerId === 'gemini');
      });

      let adaptedContent = userMessage.content || '';

      if (isPromptPerfectEnabled) {
        adaptedContent = optimizePrompt(adaptedContent);
      }

      // Context7 is an actual documentation-grounding step, independent from chat-history compaction.
      if (isContext7Enabled) {
        setStatusMessage('Context7 正在检索相关官方技术文档...');
        const context7Result = await searchContext7(adaptedContent);
        if (context7Result.success) {
          const grounding = formatContext7Grounding(context7Result.data);
          if (grounding.trim()) {
            adaptedContent += `\n\n${grounding}\n\n[Context7 使用规则：以上内容是检索到的技术文档依据。优先遵循其中明确的 API、版本和代码示例；不要把未提供的内容声称为来自 Context7。]`;
            initialThinkingSteps.push({
              id: `step_context7_docs_${Date.now()}`,
              icon: 'search',
              title: 'Context7 已挂载官方文档与代码示例',
              status: 'completed',
            });
          } else {
            initialThinkingSteps.push({
              id: `step_context7_empty_${Date.now()}`,
              icon: 'search',
              title: 'Context7 未返回可用文档，继续使用模型自身知识',
              status: 'completed',
            });
          }
        } else {
          initialThinkingSteps.push({
            id: `step_context7_error_${Date.now()}`,
            icon: 'search',
            title: `Context7 检索失败：${context7Result.error}`,
            status: 'completed',
          });
        }
      }

      // Append natural guidance if attachments were omitted
      if (hasImageAttachments && !isVisionSupported) {
        if (adaptedContent.trim()) {
          adaptedContent += `\n\n[系统提示：用户随消息附带了图片，但当前模型【${modelLabel}】为纯文本语言模型，暂不支持视觉识别功能，系统已自动略过图片。如果用户问到了图片相关内容，请礼貌告知当前模型暂不支持识别图片，并建议在顶部切换为支持视觉的多模态模型（如 Gemini 3.8 Flash、GPT-4o、Qwen-VL 等）；其他文字/文件问题请正常回答。]`;
        } else {
          adaptedContent = `[系统提示：用户发送了一张图片，但当前大模型【${modelLabel}】为纯文本语言模型，暂不支持图像视觉识别功能。请礼貌告知用户您当前无法查看该图片内容，并建议用户在顶部切换为支持图片视觉的多模态模型（如 Gemini 3.8 Flash、GPT-4o、Qwen-VL 等）。]`;
        }
      }

      if (nonImageAttachments.length > 0 && !fileSupport.supported) {
        if (adaptedContent.trim()) {
          adaptedContent += `\n\n[系统提示：用户随消息附带了文件附件，但当前模型【${modelLabel}】不支持文件查看与解析，系统已自动略过文件内容。如果用户问到了文件相关内容，请说明暂无法直接读取该文件；其他文字提问请正常回答。]`;
        } else {
          adaptedContent = `[系统提示：用户发送了文件，但当前大模型【${modelLabel}】暂不支持读取或解析文件附件。请礼貌告知用户您当前无法查看该文件内容，并建议用户使用支持文档分析的模型（如 Gemini 3.8 Flash、GPT-4o）或将文件文本直接粘贴至输入框。]`;
        }
      }

      // If Web Search returned grounding search context, append it to user prompt as well for 100% provider coverage
      if (webContext) {
        adaptedContent += `\n\n${webContext}`;
      }

      apiUserMessage = {
        ...userMessage,
        content: adaptedContent,
        attachments: effectiveAttsForApi,
      };

      // Extract previous history before the current turn (excluding the newly appended userMessage and streaming assistantMessage)
      const previousHistory = targetConv.messages.slice(0, -2);
      // History compaction is independent from Context7 documentation retrieval.
      // Keep the normal recent-message window stable so the Context7 toggle has one clear meaning.
      const historyWindowSize = 10;
      // Prepare golden-balance hierarchical compaction (L3: Rolling Summary + L4: Code Decoupled Recent Window)
      const { compactedSummary, effectiveMessages } = prepareChatHistoryWithHierarchicalCompaction(previousHistory, historyWindowSize);
      let currentHistoryMessages = [...effectiveMessages, apiUserMessage];

      if (compactedSummary) {
        currentHistoryMessages = [
          {
            id: `msg_compact_${Date.now()}`,
            role: 'system' as any,
            content: compactedSummary,
            timestamp: Date.now(),
          },
          ...currentHistoryMessages,
        ];
      }

      const systemNotices = '';

      let turn = 0;
      // Provide ample turns (up to 12 turns) for multi-file inspection, plan formulation, and multi-file modification
      const maxAgentTurns = workspaceAgentEnabled ? 12 : 1;
      let finalFullText = '';
      let cumulativeAssistantNarrative = '';

      while (turn < maxAgentTurns) {
        let turnAccumulatedText = '';

        // Token Budget Guard: Prune deep tool outputs from earlier turns to prevent quadratic token growth
        const prunedMessagesForTurn = pruneAgentLoopHistory(currentHistoryMessages, turn);

        await adapter.sendMessage(
          {
            model: currentModel,
            apiKeyConfig: currentApiKey,
            messages: prunedMessagesForTurn,
            systemPrompt: effectiveSystemPrompt,
            temperature: currentModel.temperature,
            maxTokens: currentModel.maxTokens,
            topP: currentModel.topP,
            parameters: activeParams,
            abortSignal: abortController.signal,
            timeoutSeconds: settings.requestTimeout,
          },
          settings.enableStreaming ? {
            onChunk: (chunk: string | any) => {
              const textChunk = safeExtractText(chunk);
              if (!textChunk) return;
              turnAccumulatedText += textChunk;
              const cleanTurnText = cleanResponseText(turnAccumulatedText);
              const fullNarrativeSoFar = cumulativeAssistantNarrative
                ? (cleanTurnText ? `${cumulativeAssistantNarrative}\n\n${cleanTurnText}` : cumulativeAssistantNarrative)
                : cleanTurnText;

              const displayContent = (systemNotices ? systemNotices : '') + fullNarrativeSoFar;
              const completedSteps = currentThinkingSteps.map(s => ({ ...s, status: 'completed' as const }));

              setConversations(prev => prev.map(c => {
                if (c.id !== updatedConv.id) return c;
                return {
                  ...c,
                  messages: c.messages.map(m => {
                    if (m.id !== assistantMsgId) return m;
                    const versions = [...(m.versions || [])];
                    if (versions.length > 0) {
                      versions[versions.length - 1] = {
                        ...versions[versions.length - 1],
                        content: displayContent,
                      };
                    }
                    return {
                      ...m,
                      content: displayContent,
                      status: 'streaming',
                      versions,
                      thinkingSteps: completedSteps,
                      toolCalls: executedToolCalls.length > 0 ? [...executedToolCalls] : undefined,
                      modifiedFiles: modifiedPaths.size > 0 ? Array.from(modifiedPaths) : undefined,
                      webSearchResults: webResults.length > 0 ? webResults : undefined,
                    };
                  }),
                };
              }));
            },
            onFinish: (fullText: string) => {
              turnAccumulatedText = fullText;
            },
          } : undefined
        );

        finalFullText = turnAccumulatedText;
        const cleanedThisTurn = cleanResponseText(turnAccumulatedText);
        if (cleanedThisTurn) {
          cumulativeAssistantNarrative = cumulativeAssistantNarrative
            ? `${cumulativeAssistantNarrative}\n\n${cleanedThisTurn}`
            : cleanedThisTurn;
        }

        // Check if response contains tool calls (Protected by workspaceAgentEnabled)
        if (workspaceAgentEnabled && wsToOperate) {
          const detectedToolCalls = extractToolCallsFromResponse(turnAccumulatedText);

          if (detectedToolCalls.length > 0) {
            const toolResultsForPrompt: string[] = [];

            for (let i = 0; i < detectedToolCalls.length; i++) {
              const tc = detectedToolCalls[i];
              const execId = `tool_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
              const targetIdentifier = tc.args.path || tc.args.query || '';
              setStatusMessage(
                isDiagnosisMode 
                  ? `[代码诊断中 ${turn + 1}/${maxAgentTurns}] 正在调用: ${tc.tool} (${targetIdentifier})...` 
                  : `Agent [第 ${turn + 1} 轮 · 步骤 ${i + 1}/${detectedToolCalls.length}] 正在执行: ${tc.tool} (${targetIdentifier})...`
              );

              let outcome;
              if (tc.tool === 'run_command' && !activeParams.executeScript) {
                outcome = {
                  result: null,
                  updatedWorkspace: wsToOperate,
                  errorMessage: "运行脚本与 Shell 命令权限未开启。为了系统与工程安全，请先在顶栏“运行参数”面板中开启“运行脚本与命令”权限开关。",
                  stepIcon: 'lightning' as const,
                  stepTitle: "终端执行被拒绝 (脚本权限未开启)"
                };
              } else {
                outcome = await executeWorkspaceTool(tc.tool, tc.args, wsToOperate);
              }
              wsToOperate = outcome.updatedWorkspace;

              if (outcome.diff?.path) {
                modifiedPaths.add(outcome.diff.path);
              }

              executedToolCalls.push({
                id: execId,
                toolName: tc.tool,
                args: tc.args,
                result: outcome.result,
                status: outcome.errorMessage ? 'error' : 'success',
                errorMessage: outcome.errorMessage,
                diff: outcome.diff,
                timestamp: Date.now(),
              });

              // Add a ThinkingStep to UI log
              currentThinkingSteps.push({
                id: `step_exec_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
                icon: outcome.stepIcon || 'github',
                title: isDiagnosisMode ? `[诊断调查] ${outcome.stepTitle}` : outcome.stepTitle,
                status: 'completed',
              });

              // Format clean markdown code block / structured outcome for AI ingestion
              toolResultsForPrompt.push(
                formatToolOutcomeForModel(tc.tool, tc.args, outcome)
              );
            }

            // Sync updated workspace to state
            await handleSaveWorkspaceState(wsToOperate);

            // Append assistant response and tool feedback to conversation history for next turn
            currentHistoryMessages.push({
              id: `msg_agent_turn_${turn}_${Date.now()}`,
              role: 'assistant',
              content: turnAccumulatedText,
              timestamp: Date.now(),
            });

            const feedbackInstruction = isDiagnosisMode
              ? `[代码诊断工具执行结果反馈]\n${toolResultsForPrompt.join('\n\n')}\n\n请审查上述代码与检索结果。若还需要追踪调用方/被调用方、检查关联依赖或对比 diff，请继续输出只读工具调用；若已完成 10 步调查，请严格按照【代码诊断报告】格式输出结构化报告（明确区分：发现明确问题 / 暂未发现明确错误 / 无法确认三种结论），并严格保持只读、不修改任何代码。`
              : `[工作区工具执行结果反馈 (第 ${turn + 1} 轮)]\n${toolResultsForPrompt.join('\n\n')}\n\n请审查以上工具执行结果：\n1. 【继续查阅】：若还需查看其他相关文件，请继续输出 read_file 或 search_code；\n2. 【制定方案并批量修改】：若查阅已完备，请说明全局协同修改方案，并对目标文件连续发起 patch_file 或 write_file 调用（支持同轮或分轮连续调用）；\n3. 【自愈纠错】：若遇到 patch_file 失败，请根据最新反馈校准 target_content 或使用 write_file 完整覆盖；\n4. 【任务总结】：若所有目标文件已全部修改完成，请停止输出任何 tool_call 代码块，给出结构化的中文任务总结，并提醒用户在本地运行测试。`;

            currentHistoryMessages.push({
              id: `msg_tool_feedback_${turn}_${Date.now()}`,
              role: 'user',
              content: feedbackInstruction,
              timestamp: Date.now(),
            });

            turn++;
            setStatusMessage(
              isDiagnosisMode 
                ? `Agent 正在进行第 ${turn + 1} 轮诊断分析与调用链追踪...` 
                : `Agent 正在进行第 ${turn + 1} 轮协同推进与推理修改...`
            );
            continue; // Continue loop
          }
        }

        // If no tool calls or agent mode disabled, break loop
        break;
      }

      // If files were modified in workspace, create a unified version snapshot (v2, v3...)
      if (workspaceAgentEnabled && wsToOperate && modifiedPaths.size > 0) {
        const modifiedList = Array.from(modifiedPaths);
        const snapshotLabel = modifiedList.length === 1
          ? `AI修改: ${modifiedList[0]}`
          : `AI协同修改(${modifiedList.length}个文件): ${modifiedList.slice(0, 2).join(', ')}${modifiedList.length > 2 ? '等' : ''}`;

        wsToOperate = createWorkspaceSnapshot(
          wsToOperate,
          snapshotLabel,
          'agent'
        );
        await handleSaveWorkspaceState(wsToOperate);

        // Record in Workspace AI File Modification Audit Log (up to 1000 items)
        recordAiFileModifications(
          modifiedList.map(filePath => ({
            filePath,
            modelId: currentModel.id,
            modelName: currentModel.name || currentModel.id,
            providerId: currentModel.providerId,
            workspaceId: wsToOperate?.id,
            workspaceName: wsToOperate?.name || '当前工作区',
            conversationId: targetConv.id,
            conversationTitle: targetConv.title || '当前会话',
            actionType: 'patch',
            actionDetail: `AI 协同修改工作区文件: ${filePath}`,
            timestamp: Date.now(),
          }))
        );
      }

      // Clean final answer
      let cleanedFinalAnswer = (systemNotices ? systemNotices : '') + (cumulativeAssistantNarrative || cleanResponseText(finalFullText));
      if (modifiedPaths.size > 0) {
        cleanedFinalAnswer += `\n\n> 📦 **项目工作区已更新**：AI 已协同修改工作区文件 \`${Array.from(modifiedPaths).join('`, `')}\`。\n> ⚠️ **运行与测试提示**：AI 仅负责分析与修改代码，未在云端运行任何代码或执行测试。请您在本地运行并测试代码；若遇到报错，请将错误信息贴回本聊天中，AI 将继续为您排查修复。`;
      }

      // Update THIS chat's isolated private context memory
      const updatedChatContext = updateChatContext(
        targetConv.chatContext,
        text,
        cleanedFinalAnswer,
        Array.from(modifiedPaths),
        executedToolCalls
      );

      const finalCompletedSteps = currentThinkingSteps.map(s => ({ ...s, status: 'completed' as const }));
      setConversations(prev => prev.map(c => {
        if (c.id !== updatedConv.id) return c;
        const finalMessages = c.messages.map(m => {
          if (m.id !== assistantMsgId) return m;
          const versions = [...(m.versions || [])];
          if (versions.length > 0) {
            versions[versions.length - 1].content = cleanedFinalAnswer;
          }
          return {
            ...m,
            content: cleanedFinalAnswer,
            status: 'completed' as const,
            versions,
            thinkingSteps: finalCompletedSteps,
            toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
            modifiedFiles: modifiedPaths.size > 0 ? Array.from(modifiedPaths) : undefined,
            webSearchResults: webResults.length > 0 ? webResults : m.webSearchResults,
          };
        });
        const finalConv = { 
          ...c, 
          messages: finalMessages,
          workspaceId: wsToOperate?.id || c.workspaceId,
          chatContext: updatedChatContext,
          updatedAt: Date.now() 
        };
        saveConversation(finalConv);
        return finalConv;
      }));

      // Update project collective memory if part of a project
      if (targetConv.projectId) {
        const proj = projects.find(p => p.id === targetConv.projectId);
        if (proj) {
          const allProjConvs = conversations
            .map(c => c.id === targetConv.id ? { ...c, chatContext: updatedChatContext } : c)
            .filter(c => c.projectId === proj.id);
          const updatedProj = updateProjectCollectiveMemory(proj, allProjConvs);
          saveProject(updatedProj);
          setProjects(prev => prev.map(p => p.id === updatedProj.id ? updatedProj : p));
        }
      }

      setConnectionStatus('success');
      setStatusMessage('响应完成');
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('停止生成')) {
        // User aborted
        setConversations(prev => prev.map(c => {
          if (c.id !== updatedConv.id) return c;
          const finalMessages = c.messages.map(m => {
            if (m.id !== assistantMsgId) return m;
            return {
              ...m,
              content: accumulatedText || '（已手动停止生成）',
              status: 'completed' as const,
            };
          });
          const finalConv = { ...c, messages: finalMessages };
          saveConversation(finalConv);
          return finalConv;
        }));
        setConnectionStatus('configured');
      } else {
        // Error occurred
        console.error('AI Request Error:', err);
        const errMsg = err.message || '网络请求错误，请检查网络或 API 配置。';
        setConversations(prev => prev.map(c => {
          if (c.id !== updatedConv.id) return c;
          const finalMessages = c.messages.map(m => {
            if (m.id !== assistantMsgId) return m;
            return {
              ...m,
              status: 'error' as const,
              errorMessage: errMsg,
            };
          });
          const finalConv = { ...c, messages: finalMessages };
          saveConversation(finalConv);
          return finalConv;
        }));
        setConnectionStatus('error');
        setStatusMessage(errMsg);
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // Retry Assistant Message
  const handleRetry = async (messageId: string) => {
    if (!currentConversation || isGenerating || !currentApiKey || !currentModel) return;

    const msgIndex = currentConversation.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const prevMessages = currentConversation.messages.slice(0, msgIndex);
    const targetMsg = currentConversation.messages[msgIndex];

    setIsGenerating(true);
    setConnectionStatus('requesting');
    setStatusMessage('正在重新生成...');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const adapter = getAdapterForProvider(currentModel.providerId);
    let accumulatedText = '';

    const retryThinkingSteps: ThinkingStep[] = [
      {
        id: `step_retry_${Date.now()}`,
        icon: 'github',
        title: '获取历史上下文并重新配置模型',
        status: 'completed',
      },
      {
        id: `step_retry_engine_${Date.now()}`,
        icon: 'github',
        title: `调用 ${currentModel.name} 推理引擎重新生成`,
        status: 'running',
      },
    ];

    // Persist the streaming state before the network request.
    const streamingConversation = {
      ...currentConversation,
      messages: currentConversation.messages.map(m =>
        m.id === messageId
          ? { ...m, content: '', status: 'streaming' as const, errorMessage: undefined, thinkingSteps: retryThinkingSteps }
          : m
      ),
      updatedAt: Date.now(),
    };
    setConversations(prev => prev.map(c => c.id === streamingConversation.id ? streamingConversation : c));
    await saveConversation(streamingConversation);

    try {
      const activeParams = currentConversation.parameters || parameters;
      await adapter.sendMessage(
        {
          model: currentModel,
          apiKeyConfig: currentApiKey,
          messages: prevMessages,
          systemPrompt: currentConversation.systemPrompt || settings.defaultSystemPrompt,
          temperature: currentModel.temperature,
          maxTokens: currentModel.maxTokens,
          topP: currentModel.topP,
          parameters: activeParams,
          abortSignal: abortController.signal,
          timeoutSeconds: settings.requestTimeout,
        },
        settings.enableStreaming ? {
          onChunk: (chunk: string) => {
            accumulatedText += chunk;
            const completedSteps = retryThinkingSteps.map(s => ({ ...s, status: 'completed' as const }));
            setConversations(prev => prev.map(c => {
              if (c.id !== currentConversation.id) return c;
              return {
                ...c,
                messages: c.messages.map(m => m.id === messageId ? { ...m, content: accumulatedText, status: 'streaming', thinkingSteps: completedSteps } : m),
              };
            }));
          },
        } : undefined
      );

      // Save success
      const finalSteps = retryThinkingSteps.map(s => ({ ...s, status: 'completed' as const }));
      setConversations(prev => prev.map(c => {
        if (c.id !== currentConversation.id) return c;
        const updated = {
          ...c,
          messages: c.messages.map(m => m.id === messageId ? { ...m, content: accumulatedText, status: 'completed' as const, thinkingSteps: finalSteps } : m),
          updatedAt: Date.now(),
        };
        saveConversation(updated);
        return updated;
      }));
      setConnectionStatus('success');
    } catch (err: any) {
      const isAborted = err?.name === 'AbortError' || err?.message?.includes('停止生成');
      setConversations(prev => prev.map(c => {
        if (c.id !== currentConversation.id) return c;
        const updated = {
          ...c,
          messages: c.messages.map(m => {
            if (m.id !== messageId) return m;
            if (isAborted) {
              return {
                ...m,
                content: accumulatedText || '（已手动停止生成）',
                status: 'completed' as const,
              };
            }
            return {
              ...m,
              status: 'error' as const,
              errorMessage: err?.message || '重试失败',
            };
          }),
          updatedAt: Date.now(),
        };
        saveConversation(updated);
        return updated;
      }));
      setConnectionStatus(isAborted ? 'configured' : 'error');
      if (!isAborted) setStatusMessage(err?.message || '重试失败');
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // Regenerate (Preserves past version!)
  const handleRegenerate = async (messageId: string) => {
    if (!currentConversation || isGenerating || !currentApiKey || !currentModel) return;

    const msgIndex = currentConversation.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const targetMsg = currentConversation.messages[msgIndex];

    // If it's a user message, resend from here
    if (targetMsg.role === 'user') {
      const trimmedMessages = currentConversation.messages.slice(0, msgIndex + 1);
      const assistantMsgId = `msg_a_${Date.now()}`;
      const regenThinkingSteps: ThinkingStep[] = [
        {
          id: `step_analyze_${Date.now()}`,
          icon: 'github',
          title: '获取上下文并分析模型交互配置',
          status: 'completed',
        },
        {
          id: `step_engine_${Date.now()}`,
          icon: 'github',
          title: `调用 ${currentModel.name} 推理引擎重新生成`,
          status: 'running',
        },
      ];

      const assistantMessage: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        model: currentModel.name,
        providerId: currentModel.providerId,
        status: 'streaming',
        thinkingSteps: regenThinkingSteps,
        versions: [{ content: '', timestamp: Date.now(), model: currentModel.name }],
        currentVersionIndex: 0,
      };

      const updatedConv = {
        ...currentConversation,
        messages: [...trimmedMessages, assistantMessage],
        updatedAt: Date.now(),
      };
      setConversations(prev => prev.map(c => c.id === updatedConv.id ? updatedConv : c));
      await saveConversation(updatedConv);

      // Trigger generation
      setIsGenerating(true);
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const adapter = getAdapterForProvider(currentModel.providerId);
      let accumulatedText = '';

      try {
        await adapter.sendMessage(
          {
            model: currentModel,
            apiKeyConfig: currentApiKey,
            messages: trimmedMessages,
            systemPrompt: currentConversation.systemPrompt || settings.defaultSystemPrompt,
            temperature: currentModel.temperature,
            maxTokens: currentModel.maxTokens,
            topP: currentModel.topP,
            parameters: currentConversation.parameters || parameters,
            abortSignal: abortController.signal,
            timeoutSeconds: settings.requestTimeout,
          },
          settings.enableStreaming ? {
            onChunk: (chunk: string) => {
              accumulatedText += chunk;
              const completedSteps = regenThinkingSteps.map(s => ({ ...s, status: 'completed' as const }));
              setConversations(prev => prev.map(c => {
                if (c.id !== updatedConv.id) return c;
                const messages = c.messages.map(m => {
                  if (m.id !== assistantMsgId) return m;
                  const versions = [...(m.versions || [])];
                  if (versions.length > 0) {
                    versions[0] = { ...versions[0], content: accumulatedText };
                  }
                  return { ...m, content: accumulatedText, status: 'streaming' as const, versions, thinkingSteps: completedSteps };
                });
                return { ...c, messages, updatedAt: Date.now() };
              }));
            },
            onFinish: (fullText: string) => {
              accumulatedText = fullText;
            },
          } : undefined
        );

        const finalSteps = regenThinkingSteps.map(s => ({ ...s, status: 'completed' as const }));
        setConversations(prev => prev.map(c => {
          if (c.id !== updatedConv.id) return c;
          const finalC = {
            ...c,
            messages: c.messages.map(m => {
              if (m.id !== assistantMsgId) return m;
              const versions = [...(m.versions || [])];
              if (versions.length > 0) {
                versions[0] = { ...versions[0], content: accumulatedText };
              }
              return { ...m, content: accumulatedText, status: 'completed' as const, versions, thinkingSteps: finalSteps };
            }),
            updatedAt: Date.now(),
          };
          saveConversation(finalC);
          return finalC;
        }));
      } catch (err: any) {
        const isAborted = err?.name === 'AbortError' || err?.message?.includes('停止生成');
        setConversations(prev => prev.map(c => {
          if (c.id !== updatedConv.id) return c;
          const finalMessages = c.messages.map(m => {
            if (m.id !== assistantMsgId) return m;
            if (isAborted) {
              return {
                ...m,
                content: accumulatedText || '（已手动停止生成）',
                status: 'completed' as const,
                versions: [{
                  content: accumulatedText || '（已手动停止生成）',
                  timestamp: m.versions?.[0]?.timestamp ?? Date.now(),
                  model: m.versions?.[0]?.model,
                }],
              };
            }
            return { ...m, status: 'error' as const, errorMessage: err?.message || '重新生成失败' };
          });
          const finalC = { ...c, messages: finalMessages, updatedAt: Date.now() };
          saveConversation(finalC);
          return finalC;
        }));
        setConnectionStatus(isAborted ? 'configured' : 'error');
        if (!isAborted) setStatusMessage(err?.message || '重新生成失败');
      } finally {
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
      return;
    }

    // It's an assistant message: append a new version to its versions array!
    const prevVersions = targetMsg.versions || [{ content: targetMsg.content, timestamp: targetMsg.timestamp, model: targetMsg.model }];
    const newVersionIndex = prevVersions.length;

    const prevMessages = currentConversation.messages.slice(0, msgIndex);
    setIsGenerating(true);
    setConnectionStatus('requesting');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const adapter = getAdapterForProvider(currentModel.providerId);
    let accumulatedText = '';

    const versionThinkingSteps: ThinkingStep[] = [
      {
        id: `step_analyze_${Date.now()}`,
        icon: 'github',
        title: '获取上下文并分析模型交互配置',
        status: 'completed',
      },
      {
        id: `step_engine_${Date.now()}`,
        icon: 'github',
        title: `调用 ${currentModel.name} 推理引擎生成新版本`,
        status: 'running',
      },
    ];

    setConversations(prev => prev.map(c => {
      if (c.id !== currentConversation.id) return c;
      return {
        ...c,
        messages: c.messages.map(m => {
          if (m.id !== messageId) return m;
          return {
            ...m,
            content: '',
            status: 'streaming',
            thinkingSteps: versionThinkingSteps,
            versions: [...prevVersions, { content: '', timestamp: Date.now(), model: currentModel.name }],
            currentVersionIndex: newVersionIndex,
          };
        }),
        updatedAt: Date.now(),
      };
    }));

    const streamingConversation = {
      ...currentConversation,
      messages: currentConversation.messages.map(m => {
        if (m.id !== messageId) return m;
        return {
          ...m,
          content: '',
          status: 'streaming' as const,
          thinkingSteps: versionThinkingSteps,
          versions: [...prevVersions, { content: '', timestamp: Date.now(), model: currentModel.name }],
          currentVersionIndex: newVersionIndex,
        };
      }),
      updatedAt: Date.now(),
    };
    await saveConversation(streamingConversation);

    try {
      const activeParams = currentConversation.parameters || parameters;
      await adapter.sendMessage(
        {
          model: currentModel,
          apiKeyConfig: currentApiKey,
          messages: prevMessages,
          systemPrompt: currentConversation.systemPrompt || settings.defaultSystemPrompt,
          temperature: currentModel.temperature,
          maxTokens: currentModel.maxTokens,
          topP: currentModel.topP,
          parameters: activeParams,
          abortSignal: abortController.signal,
          timeoutSeconds: settings.requestTimeout,
        },
        settings.enableStreaming ? {
          onChunk: (chunk: string) => {
            accumulatedText += chunk;
            const completedSteps = versionThinkingSteps.map(s => ({ ...s, status: 'completed' as const }));
            setConversations(prev => prev.map(c => {
              if (c.id !== currentConversation.id) return c;
              return {
                ...c,
                messages: c.messages.map(m => {
                  if (m.id !== messageId) return m;
                  const v = [...(m.versions || [])];
                  v[newVersionIndex] = { content: accumulatedText, timestamp: Date.now(), model: currentModel.name };
                  return { ...m, content: accumulatedText, versions: v, thinkingSteps: completedSteps };
                }),
              };
            }));
          },
        } : undefined
      );

      const finalSteps = versionThinkingSteps.map(s => ({ ...s, status: 'completed' as const }));
      setConversations(prev => prev.map(c => {
        if (c.id !== currentConversation.id) return c;
        const finalC = {
          ...c,
          messages: c.messages.map(m => {
            if (m.id !== messageId) return m;
            const v = [...(m.versions || [])];
            v[newVersionIndex] = { content: accumulatedText, timestamp: Date.now(), model: currentModel.name };
            return { ...m, content: accumulatedText, status: 'completed' as const, versions: v, thinkingSteps: finalSteps };
          }),
          updatedAt: Date.now(),
        };
        saveConversation(finalC);
        return finalC;
      }));
      setConnectionStatus('success');
    } catch (err: any) {
      const isAborted = err?.name === 'AbortError' || err?.message?.includes('停止生成');
      setConversations(prev => prev.map(c => {
        if (c.id !== currentConversation.id) return c;
        const failed = {
          ...c,
          messages: c.messages.map(m =>
            m.id === messageId
              ? isAborted
                ? { ...m, content: accumulatedText || '（已手动停止生成）', status: 'completed' as const }
                : { ...m, status: 'error' as const, errorMessage: err?.message || '重新生成失败' }
              : m
          ),
          updatedAt: Date.now(),
        };
        saveConversation(failed);
        return failed;
      }));
      setConnectionStatus(isAborted ? 'configured' : 'error');
      if (!isAborted) setStatusMessage(err?.message || '重新生成失败');
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // Continue generation for a specific incomplete assistant answer.
  const handleContinue = (messageId: string) => {
    if (!currentConversation || isGenerating) return;

    const messageIndex = currentConversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    const targetMessage = currentConversation.messages[messageIndex];
    if (targetMessage.role !== 'assistant') return;

    // Continue from the selected answer only. Do not accidentally include
    // later messages when the conversation contains multiple turns.
    const continuationBase: Conversation = {
      ...currentConversation,
      messages: currentConversation.messages.slice(0, messageIndex + 1),
      updatedAt: Date.now(),
    };

    void handleSendMessage(
      '请从上次回答的结尾紧接着继续往下生成，不要重复前面的内容。',
      [],
      continuationBase,
    );
  };

  // Edit message content
  const handleEditMessage = async (messageId: string, newContent: string, resubmit: boolean) => {
    if (!currentConversation) return;

    if (!resubmit) {
      setConversations(prev => prev.map(c => {
        if (c.id !== currentConversation.id) return c;
        const updated = {
          ...c,
          messages: c.messages.map(m => m.id === messageId ? { ...m, content: newContent } : m),
          updatedAt: Date.now(),
        };
        saveConversation(updated);
        return updated;
      }));
    } else {
      // Find index
      const msgIndex = currentConversation.messages.findIndex(m => m.id === messageId);
      if (msgIndex === -1) return;

      const trimmed = currentConversation.messages.slice(0, msgIndex);
      const editedUserMsg: Message = {
        ...currentConversation.messages[msgIndex],
        content: newContent,
      };

      const editedConversation: Conversation = {
        ...currentConversation,
        messages: [...trimmed, editedUserMsg],
        updatedAt: Date.now(),
      };

      setConversations(prev => prev.map(c => c.id === editedConversation.id ? editedConversation : c));
      await saveConversation(editedConversation);

      // Resend from the edited history instead of the stale React closure.
      const resendBase: Conversation = {
        ...editedConversation,
        messages: trimmed,
      };
      handleSendMessage(newContent, editedUserMsg.attachments || [], resendBase);
    }
  };

  // Switch versions
  const handleSwitchVersion = (messageId: string, versionIndex: number) => {
    if (!currentConversation) return;
    setConversations(prev => prev.map(c => {
      if (c.id !== currentConversation.id) return c;
      const updated = {
        ...c,
        messages: c.messages.map(m => {
          if (m.id !== messageId || !m.versions || !m.versions[versionIndex]) return m;
          return {
            ...m,
            content: m.versions[versionIndex].content,
            currentVersionIndex: versionIndex,
          };
        }),
      };
      saveConversation(updated);
      return updated;
    }));
  };

  // Delete message
  const handleDeleteMessage = (messageId: string) => {
    if (!currentConversation) return;
    setConversations(prev => prev.map(c => {
      if (c.id !== currentConversation.id) return c;
      const updated = {
        ...c,
        messages: c.messages.filter(m => m.id !== messageId),
        updatedAt: Date.now(),
      };
      saveConversation(updated);
      return updated;
    }));
  };

  // Delete conversation
  const handleDeleteConversation = async (id: string) => {
    await deleteConversation(id);
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id);
      if (activeConversationId === id) {
        setActiveConversationId(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });
  };

  // Toggle favorite
  const handleToggleFavorite = async (id: string) => {
    const target = conversations.find(c => c.id === id);
    if (!target) return;
    const updated = { ...target, isFavorite: !target.isFavorite };
    await saveConversation(updated);
    setConversations(prev => prev.map(c => c.id === id ? updated : c));
  };

  // Rename conversation
  const handleRenameConversation = async (id: string, newTitle: string) => {
    const target = conversations.find(c => c.id === id);
    if (!target) return;
    const updated = { ...target, title: newTitle, updatedAt: Date.now() };
    await saveConversation(updated);
    setConversations(prev => prev.map(c => c.id === id ? updated : c));
  };

  // Clear messages in current conversation
  const handleClearChat = async () => {
    if (!currentConversation) return;
    if (confirm('确认清空当前对话的所有消息记录？')) {
      const updated = { ...currentConversation, messages: [], updatedAt: Date.now() };
      await saveConversation(updated);
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c));
    }
  };

  // Copy full chat text
  const handleCopyAllChat = () => {
    if (!currentConversation) return;
    let full = `# ${currentConversation.title}\n\n`;
    for (const msg of currentConversation.messages) {
      full += `[${msg.role === 'user' ? '用户' : msg.model || 'AI'}]:\n${msg.content}\n\n`;
    }
    navigator.clipboard.writeText(full);
    alert('已成功复制对话全文至剪贴板！');
  };

  // Batch delete
  const handleBatchDelete = async (ids: string[]) => {
    await Promise.all(ids.map(id => deleteConversation(id)));
    setConversations(prev => {
      const remaining = prev.filter(c => !ids.includes(c.id));
      if (activeConversationId && ids.includes(activeConversationId)) {
        setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
      }
      return remaining;
    });
  };

  // Batch favorite
  const handleBatchFavorite = async (ids: string[], isFavorite: boolean) => {
    for (const id of ids) {
      const conv = conversations.find(c => c.id === id);
      if (conv) {
        const updated = { ...conv, isFavorite };
        await saveConversation(updated);
      }
    }
    setConversations(prev => prev.map(c => ids.includes(c.id) ? { ...c, isFavorite } : c));
  };

  // Settings Handlers
  const handleSaveApiKeyConfig = async (key: ApiKeyConfig) => {
    await saveApiKey(key);
    const updatedKeys = await getApiKeys();
    setApiKeys(updatedKeys);
    setSelectedApiKeyId(key.id);
    setConnectionStatus('configured');
  };

  const handleDeleteApiKeyConfig = async (id: string) => {
    await deleteApiKey(id);
    const updatedKeys = await getApiKeys();
    setApiKeys(updatedKeys);
    if (selectedApiKeyId === id) {
      setSelectedApiKeyId(updatedKeys[0]?.id);
    }
  };

  const handleSaveModelItem = async (model: ModelItem) => {
    await saveModel(model);
    const updated = await getModels();
    setModels(updated);
  };

  const handleDeleteModelItem = async (id: string) => {
    await deleteModel(id);
    const updated = await getModels();
    setModels(updated);
  };

  const handleSaveProviderDef = async (provider: ProviderDefinition) => {
    await saveProvider(provider);
    const updated = await getProviders();
    setProviders(updated);
  };

  const handleDeleteProviderDef = async (id: string) => {
    if (confirm('确认删除此服务商组？注意：这将一并清空其下的所有 API Key 与模型清单配置！')) {
      await deleteProvider(id);
      
      // Clean up all models belonging to this deleted provider
      const modelsToDelete = models.filter(m => m.providerId === id);
      for (const m of modelsToDelete) {
        await deleteModel(m.id);
      }

      // Clean up all api keys belonging to this deleted provider
      const keysToDelete = apiKeys.filter(k => k.providerId === id);
      for (const k of keysToDelete) {
        await deleteApiKey(k.id);
      }

      const [updatedProviders, updatedModels, updatedKeys] = await Promise.all([
        getProviders(),
        getModels(),
        getApiKeys(),
      ]);
      setProviders(updatedProviders);
      setModels(updatedModels);
      setApiKeys(updatedKeys);

      // Reset selection if active model or key was deleted
      if (selectedModelId && !updatedModels.some(m => m.id === selectedModelId)) {
        const fallbackModel = updatedModels[0];
        if (fallbackModel) {
          handleSelectModel(fallbackModel.id);
        }
      }
    }
  };

  const handleRestoreDefaultProviders = async () => {
    await restoreDefaultProviders();
    const [loadedProviders, loadedModels, loadedKeys] = await Promise.all([
      getProviders(),
      getModels(),
      getApiKeys(),
    ]);
    setProviders(loadedProviders);
    setModels(loadedModels);
    setApiKeys(loadedKeys);
    if (!selectedModelId || !loadedModels.some(m => m.id === selectedModelId)) {
      setSelectedModelId('deepseek-ai/deepseek-v4.1-flash');
    }
  };

  const handleSaveParameters = (newParams: ModelParameters) => {
    setParameters(newParams);
    if (newParams.stream !== undefined && newParams.stream !== settings.enableStreaming) {
      const updatedSettings = { ...settings, enableStreaming: newParams.stream };
      setSettings(updatedSettings);
      saveUserSettings(updatedSettings);
    }
    if (currentConversation) {
      const updated = {
        ...currentConversation,
        parameters: newParams,
        updatedAt: Date.now(),
      };
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c));
      saveConversation(updated);
    }
  };

  const handleSaveSettingsObj = async (newSettings: UserSettings) => {
    if (newSettings.enableStreaming !== undefined && newSettings.enableStreaming !== parameters.stream) {
      setParameters(prev => ({ ...prev, stream: newSettings.enableStreaming }));
    }
    await saveUserSettings(newSettings);
    setSettings(newSettings);
    applyAppFont(newSettings.fontFamily);
  };

  const handleImportConversations = async (imported: Conversation[]) => {
    for (const c of imported) {
      await saveConversation(c);
    }
    const updated = await getConversations();
    setConversations(updated);
    if (updated.length > 0) setActiveConversationId(updated[0].id);
  };

  const handleClearAllConversations = async () => {
    await clearAllConversations();
    setConversations([]);
    setActiveConversationId(null);
  };

  const handleClearAllApiKeys = async () => {
    await clearAllApiKeys();
    setApiKeys([]);
    setSelectedApiKeyId(undefined);
    setConnectionStatus('unconfigured');
  };

  const handleResetAllData = async () => {
    await resetAllData();
    const [loadedSettings, loadedProviders, loadedModels, loadedKeys, loadedConversations] = await Promise.all([
      getUserSettings(),
      getProviders(),
      getModels(),
      getApiKeys(),
      getConversations(),
    ]);
    setSettings(loadedSettings);
    setProviders(loadedProviders);
    setModels(loadedModels);
    setApiKeys(loadedKeys);
    setConversations(loadedConversations);
    setSelectedApiKeyId(undefined);
    setConnectionStatus('unconfigured');
  };

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 font-sans">
      {/* Left Collapsible Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(id) => {
          setActiveConversationId(id);
          if (isMobile) setSidebarOpen(false);
        }}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onTogglePin={handleTogglePinConversation}
        onRenameConversation={handleRenameConversation}
        onExportConversation={() => setIsExportOpen(true)}
        onOpenSettings={() => {
          setSettingsTab('chat');
          setIsSettingsOpen(true);
        }}
        onOpenModelConfig={() => setIsModelConfigOpen(true)}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenBatchManage={() => setIsBatchOpen(true)}
        models={models}
        isMobile={isMobile}
        projects={projects}
        onCreateProjectClick={() => {
          setProjectToEdit(null);
          setIsCreateProjectOpen(true);
        }}
        onEditProjectClick={(proj) => {
          setProjectToEdit(proj);
          setIsCreateProjectOpen(true);
        }}
        onDeleteProject={handleDeleteProject}
        onNewChatInProject={handleNewChatInProject}
        onArchiveConversation={(conv) => {
          setConversationToArchive(conv);
          setIsArchiveModalOpen(true);
        }}
        onUnarchiveConversation={handleUnarchiveConversationFromProject}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Top Header Bar */}
        <TopBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onNewChat={handleNewChat}
          currentConversation={currentConversation}
          projectName={
            currentConversation?.projectId
              ? projects.find(p => p.id === currentConversation.projectId)?.name
              : undefined
          }
          models={models}
          providers={providers}
          apiKeys={apiKeys}
          selectedModelId={selectedModelId}
          onSelectModel={handleSelectModel}
          selectedApiKeyId={selectedApiKeyId}
          onSelectApiKey={(id) => setSelectedApiKeyId(id)}
          connectionStatus={connectionStatus}
          statusMessage={statusMessage}
          onExportChat={() => setIsExportOpen(true)}
          onClearChat={handleClearChat}
          onOpenSettings={(tab) => {
            if (tab) setSettingsTab(tab);
            setIsSettingsOpen(true);
          }}
          onOpenModelConfig={() => setIsModelConfigOpen(true)}
          onRenameChat={(newTitle) => {
            if (currentConversation) handleRenameConversation(currentConversation.id, newTitle);
          }}
          onCopyAllChat={handleCopyAllChat}
          onOpenParameters={() => setIsParametersOpen(true)}
          isReasoningEnabled={parameters.enableReasoning}
          workspaceFilesCount={currentWorkspace ? Object.keys(currentWorkspace.files).length : 0}
          workspaceName={currentWorkspace?.name}
          modifiedFilesCount={modifiedFilesCountAgainstOriginal}
          onOpenPreview={() => setIsPreviewOpen(true)}
          onOpenWorkspace={() => setIsWorkspaceOpen(true)}
          agentMode={agentMode}
          onToggleAgentMode={handleToggleAgentMode}
        />

        {/* Top Inverted Ink Wave Pattern (顶部工具栏下方垂直翻转淡墨色波浪纹，与底部加减号后波浪纹对齐呼应) */}
        <div className="w-full max-w-4xl mx-auto px-3 md:px-6 relative pointer-events-none select-none z-10 h-0">
          <div className="ink-wave-layer absolute inset-x-0 top-0 h-14 sm:h-16 md:h-18 pointer-events-none overflow-hidden opacity-90 dark:opacity-40 transition-opacity">
            <svg
              className="w-full h-full text-neutral-600 dark:text-neutral-400"
              style={{ transform: 'scaleY(-1)' }}
              viewBox="0 0 1200 120"
              preserveAspectRatio="none"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Layer 1: Back soft ink wave */}
              <path
                d="M0 62 C 200 22, 400 78, 600 42 C 800 8, 1000 58, 1200 28 L1200 120 L0 120 Z"
                fill="currentColor"
                fillOpacity="0.08"
              />
              {/* Layer 2: Middle soft ink wave */}
              <path
                d="M0 80 C 180 46, 380 92, 580 56 C 780 22, 980 70, 1200 46 L1200 120 L0 120 Z"
                fill="currentColor"
                fillOpacity="0.10"
              />
              {/* Layer 3: Front soft ink wave */}
              <path
                d="M0 96 C 220 66, 440 106, 660 74 C 880 44, 1060 88, 1200 66 L1200 120 L0 120 Z"
                fill="currentColor"
                fillOpacity="0.14"
              />
            </svg>
          </div>
        </div>

        {/* Message Stream Central Area */}
        <MessageList
          messages={currentConversation?.messages || []}
          currentModel={currentModel}
          settings={settings}
          onRetry={handleRetry}
          onRegenerate={handleRegenerate}
          onContinue={handleContinue}
          onEdit={handleEditMessage}
          onDelete={handleDeleteMessage}
          onQuote={(q) => setQuotedText(q)}
          onSwitchVersion={handleSwitchVersion}
          onSelectPrompt={(p) => handleSendMessage(p, [])}
          onDownloadWorkspaceZip={handleDownloadWorkspaceZipAction}
          currentWorkspace={currentWorkspace}
          onSaveWorkspace={handleSaveWorkspaceState}
        />

        {/* Large AI Composer Input Area */}
        <ChatComposer
          onSendMessage={handleSendMessage}
          isGenerating={isGenerating}
          onStopGeneration={handleStopGeneration}
          currentModel={currentModel}
          currentApiKey={currentApiKey}
          models={models}
          providers={providers}
          apiKeys={apiKeys}
          selectedModelId={selectedModelId}
          onSelectModel={handleSelectModel}
          onDeleteModel={handleDeleteModelItem}
          settings={settings}
          onSaveSettings={handleSaveSettingsObj}
          onOpenSettings={(tab) => {
            if (tab) setSettingsTab(tab);
            setIsSettingsOpen(true);
          }}
          onOpenModelConfig={() => setIsModelConfigOpen(true)}
          onNewChat={handleNewChat}
          projects={projects}
          onNewChatInProject={handleNewChatInProject}
          onCreateProject={() => {
            setProjectToEdit(null);
            setIsCreateProjectOpen(true);
          }}
          onOpenPreview={() => setIsPreviewOpen(true)}
          onOpenAuditHistory={() => setIsAuditModalOpen(true)}
          quotedText={quotedText}
          onClearQuote={() => setQuotedText(null)}
          parameters={parameters}
          onUpdateParameters={handleUpdateParameters}
          onOpenParameters={() => setIsParametersOpen(true)}
          webAccessEnabled={webAccessEnabled}
          onToggleWebAccess={handleToggleWebAccess}
          agentMode={agentMode}
          onToggleAgentMode={handleToggleAgentMode}
          pendingAttachments={pendingAttachments}
          onClearPendingAttachments={() => setPendingAttachments(null)}
          pendingPrompt={pendingPrompt}
          onClearPendingPrompt={() => setPendingPrompt(null)}
        />
      </div>

      {/* Dedicated AI Model Configuration Modal (Matches user screenshots) */}
      <AiModelConfigModal
        isOpen={isModelConfigOpen}
        onClose={() => setIsModelConfigOpen(false)}
        providers={providers}
        onSaveProvider={handleSaveProviderDef}
        onDeleteProvider={handleDeleteProviderDef}
        onRestoreDefaultProviders={handleRestoreDefaultProviders}
        apiKeys={apiKeys}
        onSaveApiKey={handleSaveApiKeyConfig}
        onDeleteApiKey={handleDeleteApiKeyConfig}
        models={models}
        onSaveModel={handleSaveModelItem}
        onDeleteModel={handleDeleteModelItem}
        settings={settings}
        onSaveSettings={handleSaveSettingsObj}
        currentModelId={selectedModelId}
        onSelectModel={handleSelectModel}
        selectedApiKeyId={selectedApiKeyId}
        onSelectApiKey={(id) => setSelectedApiKeyId(id)}
      />

      {/* Parameters Settings Modal (Matches user screenshot) */}
      <ParametersModal
        isOpen={isParametersOpen}
        onClose={() => setIsParametersOpen(false)}
        parameters={parameters}
        onChangeParameters={handleSaveParameters}
        settings={settings}
        onSaveSettings={handleSaveSettingsObj}
        modelName={currentModel?.name}
      />

      {/* Settings Modal (8 Tabs) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialTab={settingsTab}
        onOpenModelConfig={() => setIsModelConfigOpen(true)}
        providers={providers}
        onSaveProvider={handleSaveProviderDef}
        onDeleteProvider={handleDeleteProviderDef}
        apiKeys={apiKeys}
        onSaveApiKey={handleSaveApiKeyConfig}
        onDeleteApiKey={handleDeleteApiKeyConfig}
        models={models}
        onSaveModel={handleSaveModelItem}
        onDeleteModel={handleDeleteModelItem}
        settings={settings}
        onSaveSettings={handleSaveSettingsObj}
        conversations={conversations}
        onImportConversations={handleImportConversations}
        onClearAllConversations={handleClearAllConversations}
        onClearAllApiKeys={handleClearAllApiKeys}
        onResetAllData={handleResetAllData}
      />

      {/* Deep Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        conversations={conversations}
        onSelectConversation={(id) => {
          setActiveConversationId(id);
          if (isMobile) setSidebarOpen(false);
        }}
        models={models}
      />

      {/* Export Format Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        conversation={currentConversation}
        models={models}
      />

      {/* Batch Management Modal */}
      <BatchManageModal
        isOpen={isBatchOpen}
        onClose={() => setIsBatchOpen(false)}
        conversations={conversations}
        onBatchDelete={handleBatchDelete}
        onBatchFavorite={handleBatchFavorite}
        models={models}
      />

      {/* AI Workspace and Project Memory Drawer */}
      <WorkspaceDrawer
        isOpen={isWorkspaceOpen}
        onClose={() => setIsWorkspaceOpen(false)}
        workspaces={workspaces}
        activeWorkspaceId={currentWorkspace?.id}
        onSelectWorkspace={handleSelectWorkspaceForCurrentChat}
        onSaveWorkspace={handleSaveWorkspaceState}
        onDeleteWorkspace={handleDeleteWorkspaceSafe}
        onSendAiMessage={(prompt, atts) => {
          if (atts && atts.length > 0) {
            setPendingAttachments(atts);
          }
          if (prompt) {
            setPendingPrompt(prompt);
          }
          // If a valid API key is present, trigger generation directly
          if (currentApiKey && currentApiKey.apiKey) {
            handleSendMessage(prompt, atts || []);
          }
        }}
        aiStatusText={isGenerating ? (statusMessage || 'AI 正在处理...') : undefined}
      />

      {/* Workspace Web Project Live Preview Modal */}
      <WorkspacePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        workspaces={workspaces}
        initialWorkspaceId={currentWorkspace?.id}
        onSaveWorkspace={handleSaveWorkspaceState}
      />

      {/* Workspace AI File Modification Audit Modal (up to 1000 records) */}
      <AiFileAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        onOpenFileInWorkspace={(path) => {
          setIsAuditModalOpen(false);
          setIsWorkspaceOpen(true);
        }}
      />

      {/* Create / Edit Project Modal (Image 1) */}
      <CreateProjectModal
        isOpen={isCreateProjectOpen}
        onClose={() => {
          setIsCreateProjectOpen(false);
          setProjectToEdit(null);
        }}
        onCreate={handleCreateProject}
        projectToEdit={projectToEdit}
        onUpdate={handleUpdateProject}
      />

      {/* Archive Chat to Project Modal */}
      <ArchiveProjectModal
        isOpen={isArchiveModalOpen}
        onClose={() => {
          setIsArchiveModalOpen(false);
          setConversationToArchive(null);
        }}
        conversation={conversationToArchive}
        projects={projects}
        conversations={conversations}
        onSelectProject={(projectId) => {
          if (conversationToArchive) {
            handleArchiveConversationToProject(conversationToArchive.id, projectId);
          }
        }}
        onCreateNewProject={() => {
          setIsCreateProjectOpen(true);
        }}
      />
    </div>
  );
}
