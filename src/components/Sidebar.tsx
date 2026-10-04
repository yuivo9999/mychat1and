import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Plus, 
  Search, 
  Settings, 
  MessageSquare, 
  ChevronLeft, 
  ChevronDown,
  ChevronRight, 
  Trash2, 
  Edit2, 
  MoreVertical, 
  MoreHorizontal,
  CheckSquare, 
  ShieldCheck,
  Folder,
  FolderPlus,
  FolderMinus,
  Archive,
  Pin,
  SquarePen,
  Server,
  Sparkles
} from 'lucide-react';
import { Conversation, ModelItem, Project } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onExportConversation: (conv: Conversation) => void;
  onOpenSettings: (initialTab?: string) => void;
  onOpenModelConfig?: () => void;
  onOpenSearch: () => void;
  onOpenBatchManage: () => void;
  models: ModelItem[];
  isMobile: boolean;

  // Projects management
  projects: Project[];
  onCreateProjectClick: () => void;
  onEditProjectClick?: (project: Project) => void;
  onDeleteProject?: (projectId: string) => void;
  onNewChatInProject?: (projectId: string) => void;
  onArchiveConversation: (conv: Conversation) => void;
  onUnarchiveConversation: (convId: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onTogglePin,
  onRenameConversation,
  onExportConversation,
  onOpenSettings,
  onOpenModelConfig,
  onOpenSearch,
  onOpenBatchManage,
  models,
  isMobile,
  projects,
  onCreateProjectClick,
  onEditProjectClick,
  onDeleteProject,
  onNewChatInProject,
  onArchiveConversation,
  onUnarchiveConversation,
}) => {
  const [menuDropdown, setMenuDropdown] = useState<{
    type: 'conversation';
    conv: Conversation;
    isInProject: boolean;
    position: { top?: number; bottom?: number; left?: number };
  } | {
    type: 'project';
    project: Project;
    position: { top?: number; bottom?: number; left?: number };
  } | null>(null);

  const [projectSectionMenuOpen, setProjectSectionMenuOpen] = useState(false);
  const [chatSectionMenuOpen, setChatSectionMenuOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set(projects.map(p => p.id)));

  // Close floating menus on scroll or resize
  useEffect(() => {
    const handleScrollOrResize = () => {
      if (menuDropdown) setMenuDropdown(null);
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [menuDropdown]);

  const handleOpenConvMenu = (e: React.MouseEvent, conv: Conversation, isInProject: boolean) => {
    e.stopPropagation();
    if (menuDropdown?.type === 'conversation' && menuDropdown.conv.id === conv.id) {
      setMenuDropdown(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < 220; // If less than 220px below, pop UPWARD to prevent footer clipping!
    
    setMenuDropdown({
      type: 'conversation',
      conv,
      isInProject,
      position: {
        top: openUpward ? undefined : rect.bottom + 4,
        bottom: openUpward ? window.innerHeight - rect.top + 4 : undefined,
        left: Math.max(8, rect.right - 144),
      },
    });
  };

  const handleOpenProjectMenu = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    if (menuDropdown?.type === 'project' && menuDropdown.project.id === project.id) {
      setMenuDropdown(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < 180;
    
    setMenuDropdown({
      type: 'project',
      project,
      position: {
        top: openUpward ? undefined : rect.bottom + 4,
        bottom: openUpward ? window.innerHeight - rect.top + 4 : undefined,
        left: Math.max(8, rect.right - 144),
      },
    });
  };

  const toggleProjectExpand = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedProjectIds(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const startRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
    setMenuDropdown(null);
  };

  const submitRename = (id: string) => {
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const getModelName = (modelId: string) => {
    const m = models.find(item => item.id === modelId);
    return m ? m.name : modelId;
  };

  // Split conversations into normal (unarchived) and project-bound
  const normalConversations = conversations.filter(c => !c.projectId);
  
  // Group normal conversations by pinned vs time
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - oneDay;
  const last7DaysStart = todayStart - 7 * oneDay;

  const pinnedNormal = normalConversations.filter(c => c.isPinned);
  const unpinnedNormal = normalConversations.filter(c => !c.isPinned);

  const groups = {
    today: unpinnedNormal.filter(c => c.updatedAt >= todayStart),
    yesterday: unpinnedNormal.filter(c => c.updatedAt >= yesterdayStart && c.updatedAt < todayStart),
    last7Days: unpinnedNormal.filter(c => c.updatedAt >= last7DaysStart && c.updatedAt < yesterdayStart),
    earlier: unpinnedNormal.filter(c => c.updatedAt < last7DaysStart),
  };

  // Render a single chat item with the 3-dots button and context menu
  const renderConversationItem = (conv: Conversation, isInProject = false) => {
    const isActive = conv.id === activeConversationId;
    const isEditing = editingId === conv.id;
    const isMenuOpen = menuDropdown?.type === 'conversation' && menuDropdown.conv.id === conv.id;

    return (
      <div
        key={conv.id}
        onClick={() => {
          if (!isEditing) onSelectConversation(conv.id);
        }}
        className={`group relative flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer transition-all text-sm ${
          isActive
            ? 'bg-neutral-200/80 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium shadow-xs'
            : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100/80 dark:hover:bg-neutral-800/60 hover:text-neutral-900 dark:hover:text-neutral-200'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-1">
          {conv.isPinned ? (
            <Pin className="w-3.5 h-3.5 shrink-0 text-amber-500 fill-current rotate-45" />
          ) : (
            <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-neutral-400'}`} />
          )}

          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              autoFocus
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={() => submitRename(conv.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename(conv.id);
                if (e.key === 'Escape') setEditingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-neutral-900 border border-indigo-500 rounded px-1.5 py-0.5 text-xs w-full text-neutral-900 dark:text-white outline-hidden"
            />
          ) : (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="truncate text-[13px] leading-tight" title={conv.title}>
                {conv.title || '新对话'}
              </span>
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate font-mono mt-0.5">
                {getModelName(conv.modelId)}
              </span>
            </div>
          )}
        </div>

        {/* Vertical 3-dots button with smart non-clipped menu */}
        {!isEditing && (
          <div className="relative shrink-0 flex items-center">
            <button
              type="button"
              onClick={(e) => handleOpenConvMenu(e, conv, isInProject)}
              className={`p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-700/60 transition cursor-pointer ${
                isMenuOpen ? 'opacity-100 bg-neutral-200/80 dark:bg-neutral-700/80 text-neutral-800 dark:text-neutral-100' : 'opacity-60 group-hover:opacity-100'
              }`}
              title="操作菜单"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobile && isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity"
          onClick={onToggle}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800/80 transition-all duration-300 ease-in-out shrink-0 select-none ${
          isOpen ? 'w-72 translate-x-0' : isMobile ? '-translate-x-full w-72' : 'w-0 -translate-x-full overflow-hidden border-r-0'
        }`}
      >
        {/* Top Header */}
        <div className="p-3 flex items-center justify-between border-b border-neutral-200/70 dark:border-neutral-800/70">
          <button
            type="button"
            onClick={onNewChat}
            className="flex-1 mr-2 flex items-center justify-center gap-2 py-2 px-3 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-xl font-medium text-sm transition-all shadow-xs active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>新聊天</span>
          </button>

          <button
            type="button"
            onClick={onToggle}
            className="p-2 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-xl hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition"
            title="收起侧边栏"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Search & Tools Bar */}
        <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-neutral-200/50 dark:bg-neutral-800/50 hover:bg-neutral-200/80 dark:hover:bg-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 transition"
          >
            <Search className="w-3.5 h-3.5" />
            <span>搜索聊天...</span>
            <kbd className="ml-auto text-[10px] font-mono opacity-60 bg-neutral-300/40 dark:bg-neutral-700/40 px-1 py-0.5 rounded">⌘K</kbd>
          </button>

          <button
            type="button"
            onClick={onOpenBatchManage}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition"
            title="批量管理"
          >
            <CheckSquare className="w-4 h-4" />
          </button>
        </div>

        {/* Main Scrollable Categories: 项目 & 聊天 (Matching Image 2) */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-4 pb-16">
          
          {/* ========================================================
              CATEGORY 1: 项目 (Projects Section)
              ======================================================== */}
          <div className="space-y-1">
            {/* Header: 项目 with + and ... */}
            <div className="flex items-center justify-between px-2 py-1 text-neutral-500 dark:text-neutral-400">
              <span className="text-sm font-semibold tracking-wide text-neutral-700 dark:text-neutral-200">
                项目
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={onCreateProjectClick}
                  className="p-1 hover:text-neutral-900 dark:hover:text-white rounded-md hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition"
                  title="创建新项目"
                >
                  <Plus className="w-4 h-4" />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setProjectSectionMenuOpen(!projectSectionMenuOpen)}
                    className="p-1 hover:text-neutral-900 dark:hover:text-white rounded-md hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition"
                    title="项目选项"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {projectSectionMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setProjectSectionMenuOpen(false)} />
                      <div className="sidebar-dropdown-menu absolute right-0 top-6 w-36 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-800 py-1 z-40 text-xs">
                        <button
                          onClick={() => {
                            setProjectSectionMenuOpen(false);
                            onCreateProjectClick();
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2 text-neutral-700 dark:text-neutral-300"
                        >
                          <FolderPlus className="w-3.5 h-3.5" /> 创建新项目
                        </button>
                        {projects.length > 0 && (
                          <button
                            onClick={() => {
                              setProjectSectionMenuOpen(false);
                              // Expand all projects
                              setExpandedProjectIds(new Set(projects.map(p => p.id)));
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2 text-neutral-700 dark:text-neutral-300"
                          >
                            展开所有项目
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Content: 没有项目 vs List of Projects */}
            {projects.length === 0 ? (
              <div className="px-3 py-1 text-xs text-neutral-400 dark:text-neutral-500 font-normal">
                没有项目
              </div>
            ) : (
              <div className="space-y-1">
                {projects.map((project) => {
                  const projectChats = conversations.filter(c => c.projectId === project.id);
                  const isExpanded = expandedProjectIds.has(project.id);
                  const isProjectMenuOpen = menuDropdown?.type === 'project' && menuDropdown.project.id === project.id;

                  // Sort project chats: pinned first, then by updatedAt
                  const sortedProjectChats = [...projectChats].sort((a, b) => {
                    if (a.isPinned && !b.isPinned) return -1;
                    if (!a.isPinned && b.isPinned) return 1;
                    return b.updatedAt - a.updatedAt;
                  });

                  return (
                    <div key={project.id} className="rounded-xl overflow-hidden bg-neutral-100/40 dark:bg-neutral-800/30 border border-neutral-200/50 dark:border-neutral-800/50">
                      {/* Project Header Row */}
                      <div
                        onClick={(e) => toggleProjectExpand(project.id, e)}
                        className="group flex items-center justify-between px-2.5 py-2 cursor-pointer hover:bg-neutral-200/50 dark:hover:bg-neutral-800/60 transition text-xs font-medium text-neutral-800 dark:text-neutral-200"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </span>
                          <Folder className="w-4 h-4 text-amber-500/90 shrink-0" />
                          <span className="truncate text-sm font-medium" title={project.name}>
                            {project.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-200/80 dark:bg-neutral-700/80 text-neutral-500 dark:text-neutral-400 shrink-0">
                            {projectChats.length}
                          </span>
                        </div>

                        {/* Project actions */}
                        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => onNewChatInProject?.(project.id)}
                            className="p-1 hover:text-neutral-900 dark:hover:text-white rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
                            title="在此项目中新建聊天"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>

                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => handleOpenProjectMenu(e, project)}
                              className="p-1 hover:text-neutral-900 dark:hover:text-white rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
                              title="项目菜单"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Chats Inside this Project */}
                      {isExpanded && (
                        <div className="pl-3 pr-1 py-1 space-y-0.5 border-t border-neutral-200/40 dark:border-neutral-800/40 bg-white/40 dark:bg-neutral-900/30">
                          {sortedProjectChats.length === 0 ? (
                            <div className="py-2 px-3 text-[11px] text-neutral-400 dark:text-neutral-500 italic">
                              暂无聊天，点击 + 新建或归档聊天至此
                            </div>
                          ) : (
                            sortedProjectChats.map(c => renderConversationItem(c, true))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ========================================================
              CATEGORY 2: 聊天 (Chats Section)
              ======================================================== */}
          <div className="space-y-1 pt-1">
            {/* Header: 聊天 with edit icon and ... */}
            <div className="flex items-center justify-between px-2 py-1 text-neutral-500 dark:text-neutral-400">
              <span className="text-sm font-semibold tracking-wide text-neutral-700 dark:text-neutral-200">
                聊天
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={onNewChat}
                  className="p-1 hover:text-neutral-900 dark:hover:text-white rounded-md hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition"
                  title="新建普通聊天"
                >
                  <SquarePen className="w-4 h-4" />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setChatSectionMenuOpen(!chatSectionMenuOpen)}
                    className="p-1 hover:text-neutral-900 dark:hover:text-white rounded-md hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition"
                    title="聊天选项"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {chatSectionMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setChatSectionMenuOpen(false)} />
                      <div className="sidebar-dropdown-menu absolute right-0 top-6 w-36 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-800 py-1 z-40 text-xs">
                        <button
                          onClick={() => {
                            setChatSectionMenuOpen(false);
                            onNewChat();
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2 text-neutral-700 dark:text-neutral-300"
                        >
                          <SquarePen className="w-3.5 h-3.5" /> 新建聊天
                        </button>
                        <button
                          onClick={() => {
                            setChatSectionMenuOpen(false);
                            onOpenBatchManage();
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2 text-neutral-700 dark:text-neutral-300"
                        >
                          <CheckSquare className="w-3.5 h-3.5" /> 批量管理
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* List of normal chats */}
            {normalConversations.length === 0 ? (
              <div className="py-6 px-4 text-center">
                <p className="text-xs text-neutral-400">暂无独立聊天记录</p>
                <p className="text-[11px] text-neutral-400/80 mt-1">点击右上角图标开启对话</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Pinned Chats */}
                {pinnedNormal.length > 0 && (
                  <div>
                    <div className="px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 uppercase tracking-wider">
                      <Pin className="w-3 h-3 fill-current rotate-45" />
                      <span>置顶聊天 ({pinnedNormal.length})</span>
                    </div>
                    <div className="space-y-0.5 mt-1">
                      {pinnedNormal.map(c => renderConversationItem(c, false))}
                    </div>
                  </div>
                )}

                {/* Today */}
                {groups.today.length > 0 && (
                  <div>
                    <div className="px-2 py-0.5 text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                      今天
                    </div>
                    <div className="space-y-0.5 mt-0.5">
                      {groups.today.map(c => renderConversationItem(c, false))}
                    </div>
                  </div>
                )}

                {/* Yesterday */}
                {groups.yesterday.length > 0 && (
                  <div>
                    <div className="px-2 py-0.5 text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                      昨天
                    </div>
                    <div className="space-y-0.5 mt-0.5">
                      {groups.yesterday.map(c => renderConversationItem(c, false))}
                    </div>
                  </div>
                )}

                {/* Last 7 Days */}
                {groups.last7Days.length > 0 && (
                  <div>
                    <div className="px-2 py-0.5 text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                      最近 7 天
                    </div>
                    <div className="space-y-0.5 mt-0.5">
                      {groups.last7Days.map(c => renderConversationItem(c, false))}
                    </div>
                  </div>
                )}

                {/* Earlier */}
                {groups.earlier.length > 0 && (
                  <div>
                    <div className="px-2 py-0.5 text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                      更早之前
                    </div>
                    <div className="space-y-0.5 mt-0.5">
                      {groups.earlier.map(c => renderConversationItem(c, false))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-neutral-200/70 dark:border-neutral-800/70 bg-neutral-50/50 dark:bg-neutral-900/50 shrink-0">
          <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1 py-0.5">
            <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>数据本地存储</span>
            </span>
            <button
              type="button"
              onClick={onNewChat}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#7a1212] hover:bg-[#911616] border border-[#a12828]/40 shadow-md transition-all active:scale-95 shrink-0"
              title="开启新窗口"
            >
              <Plus className="w-4 h-4 text-[#faebd7] stroke-[3px]" />
            </button>
          </div>
        </div>
      </aside>

      {/* Portal-rendered floating context menu (Never clipped by overflow or footer) */}
      {menuDropdown && createPortal(
        <>
          <div
            className="fixed inset-0 z-9998"
            onClick={(e) => {
              e.stopPropagation();
              setMenuDropdown(null);
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: menuDropdown.position.top !== undefined ? `${menuDropdown.position.top}px` : 'auto',
              bottom: menuDropdown.position.bottom !== undefined ? `${menuDropdown.position.bottom}px` : 'auto',
              left: menuDropdown.position.left !== undefined ? `${menuDropdown.position.left}px` : 'auto',
            }}
            className="sidebar-dropdown-menu z-9999 w-36 bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-800 py-1 text-xs select-none animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {menuDropdown.type === 'conversation' && (
              <>
                {/* 1. 重命名 */}
                <button
                  type="button"
                  onClick={(e) => {
                    startRename(menuDropdown.conv, e);
                    setMenuDropdown(null);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2.5 text-neutral-800 dark:text-neutral-200 font-medium transition cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                  <span>重命名</span>
                </button>

                <div className="border-t border-neutral-100 dark:border-neutral-800 my-1" />

                {/* 2. 置顶聊天 / 取消置顶 */}
                <button
                  type="button"
                  onClick={() => {
                    onTogglePin?.(menuDropdown.conv.id);
                    setMenuDropdown(null);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2.5 text-neutral-800 dark:text-neutral-200 font-medium transition cursor-pointer"
                >
                  <Pin className={`w-3.5 h-3.5 ${menuDropdown.conv.isPinned ? 'text-amber-500 fill-current' : 'text-neutral-600 dark:text-neutral-400'}`} />
                  <span>{menuDropdown.conv.isPinned ? '取消置顶' : '置顶聊天'}</span>
                </button>

                {/* 3. 归档 (非项目内) / 离档 (项目内) */}
                {menuDropdown.isInProject || menuDropdown.conv.projectId ? (
                  <button
                    type="button"
                    onClick={() => {
                      onUnarchiveConversation(menuDropdown.conv.id);
                      setMenuDropdown(null);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2.5 text-neutral-800 dark:text-neutral-200 font-medium transition cursor-pointer"
                    title="移出此项目并恢复为普通聊天"
                  >
                    <FolderMinus className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                    <span>离档</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onArchiveConversation(menuDropdown.conv);
                      setMenuDropdown(null);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2.5 text-neutral-800 dark:text-neutral-200 font-medium transition cursor-pointer"
                    title="将此聊天移入指定项目中集中管理"
                  >
                    <Archive className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                    <span>归档</span>
                  </button>
                )}

                <div className="border-t border-neutral-100 dark:border-neutral-800 my-1" />

                {/* 4. 删除 */}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`确定要删除对话「${menuDropdown.conv.title || '新对话'}」及其记录吗？`)) {
                      onDeleteConversation(menuDropdown.conv.id);
                    }
                    setMenuDropdown(null);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center gap-2.5 font-medium transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>删除</span>
                </button>
              </>
            )}

            {menuDropdown.type === 'project' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const projId = menuDropdown.project.id;
                    setMenuDropdown(null);
                    onNewChatInProject?.(projId);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2 text-neutral-700 dark:text-neutral-300 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> 新建聊天
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const proj = menuDropdown.project;
                    setMenuDropdown(null);
                    onEditProjectClick?.(proj);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2 text-neutral-700 dark:text-neutral-300 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" /> 编辑项目
                </button>
                <div className="border-t border-neutral-100 dark:border-neutral-800 my-1" />
                <button
                  type="button"
                  onClick={() => {
                    const proj = menuDropdown.project;
                    setMenuDropdown(null);
                    if (confirm(`确定要删除项目「${proj.name}」吗？项目内的聊天将自动恢复为普通聊天。`)) {
                      onDeleteProject?.(proj.id);
                    }
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 删除项目
                </button>
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  );
};
