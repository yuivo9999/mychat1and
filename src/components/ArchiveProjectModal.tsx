import React from 'react';
import { X, Folder, Plus, Check, Archive, Sparkles } from 'lucide-react';
import { Project, Conversation } from '../types';

interface ArchiveProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: Conversation | null;
  projects: Project[];
  conversations: Conversation[];
  onSelectProject: (projectId: string) => void;
  onCreateNewProject: () => void;
}

export const ArchiveProjectModal: React.FC<ArchiveProjectModalProps> = ({
  isOpen,
  onClose,
  conversation,
  projects,
  conversations,
  onSelectProject,
  onCreateNewProject,
}) => {
  if (!isOpen || !conversation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl p-6 relative select-none animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-neutral-700 dark:text-neutral-300" />
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              归档对话至项目
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-3">
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
            将聊天「<span className="font-medium text-neutral-800 dark:text-neutral-200">{conversation.title || '新对话'}</span>」移动至项目分类中，共享项目记忆与上下文：
          </p>

          {/* Project List */}
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {projects.length === 0 ? (
              <div className="py-6 text-center bg-neutral-50 dark:bg-neutral-800/40 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-700">
                <Folder className="w-8 h-8 text-neutral-300 dark:text-neutral-600 mx-auto mb-1.5" />
                <p className="text-xs text-neutral-500 dark:text-neutral-400">目前还没有任何项目</p>
                <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">请先创建一个项目即可归档聊天</p>
              </div>
            ) : (
              projects.map(project => {
                const count = conversations.filter(c => c.projectId === project.id).length;
                const isCurrent = conversation.projectId === project.id;

                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      onSelectProject(project.id);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all group ${
                      isCurrent
                        ? 'border-indigo-500/50 bg-indigo-50/50 dark:bg-indigo-950/20'
                        : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700 transition">
                        <Folder className="w-4 h-4 text-neutral-700 dark:text-neutral-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                          {project.name}
                        </div>
                        <div className="text-[11px] text-neutral-400 flex items-center gap-1.5 mt-0.5">
                          <span>{count} 个聊天</span>
                          <span>•</span>
                          <span>{project.memoryMode === 'isolated' ? '仅限项目记忆' : '默认记忆'}</span>
                        </div>
                      </div>
                    </div>

                    {isCurrent && (
                      <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> 已在此项目
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer / Create New Project CTA */}
        <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onClose();
              onCreateNewProject();
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            <Plus className="w-4 h-4" />
            <span>新建项目...</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};
