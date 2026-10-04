import React, { useState, useEffect, useRef } from 'react';
import { X, Lightbulb, ChevronDown, Check, Sparkles, Smile } from 'lucide-react';
import { Project, ProjectMemoryMode } from '../types';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, memoryMode: ProjectMemoryMode) => void;
  projectToEdit?: Project | null;
  onUpdate?: (project: Project) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  projectToEdit,
  onUpdate,
}) => {
  const [name, setName] = useState('');
  const [memoryMode, setMemoryMode] = useState<ProjectMemoryMode>('default');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (projectToEdit) {
        setName(projectToEdit.name);
        setMemoryMode(projectToEdit.memoryMode || 'default');
      } else {
        setName('');
        setMemoryMode('default');
      }
      setIsDropdownOpen(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, projectToEdit]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) return;

    if (projectToEdit && onUpdate) {
      onUpdate({
        ...projectToEdit,
        name: name.trim(),
        memoryMode,
        updatedAt: Date.now(),
      });
    } else {
      onCreate(name.trim(), memoryMode);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl p-6 relative select-none animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {projectToEdit ? '编辑项目' : '创建项目'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project Name Field */}
          <div>
            <label className="block text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-2">
              项目名称
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-neutral-400 dark:text-neutral-500 pointer-events-none">
                <Smile className="w-5 h-5" />
              </span>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="哥本哈根之旅"
                maxLength={40}
                className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-xl text-neutral-900 dark:text-neutral-100 text-sm placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-hidden focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 transition"
              />
            </div>
          </div>

          {/* Info / Tip Card */}
          <div className="bg-neutral-100/90 dark:bg-neutral-800/60 rounded-xl p-3.5 flex items-start gap-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
            <Lightbulb className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0 mt-0.5" />
            <p>
              项目功能可将聊天、文件和自定义指令集中保存。可将其用于持续进行的工作，或仅用于保持内容整洁有序。
            </p>
          </div>

          {/* Bottom Controls: Memory Mode Selector & Submit Button */}
          <div className="pt-2 flex items-center justify-between relative">
            {/* Memory Mode Dropdown Selector */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-1.5 text-sm font-medium text-neutral-800 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white py-1 px-1 rounded-lg transition"
              >
                <span>{memoryMode === 'default' ? '默认记忆' : '仅限项目记忆'}</span>
                <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu matching Image 1 */}
              {isDropdownOpen && (
                <div className="absolute left-0 bottom-full mb-2 w-72 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in duration-150">
                  {/* Option 1: 默认记忆 */}
                  <button
                    type="button"
                    onClick={() => {
                      setMemoryMode('default');
                      setIsDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80 transition flex items-start justify-between gap-3 group"
                  >
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        默认记忆
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 leading-normal">
                        此项目可以访问外部聊天中的记忆，反之亦然。
                      </div>
                    </div>
                    {memoryMode === 'default' && (
                      <Check className="w-4 h-4 text-neutral-800 dark:text-neutral-200 shrink-0 mt-0.5 stroke-[2.5]" />
                    )}
                  </button>

                  {/* Option 2: 仅限项目记忆 */}
                  <button
                    type="button"
                    onClick={() => {
                      setMemoryMode('isolated');
                      setIsDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80 transition flex items-start justify-between gap-3 group"
                  >
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        仅限项目记忆
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 leading-normal">
                        此项目只能访问自己的记忆。其记忆对外部聊天不可见。
                      </div>
                    </div>
                    {memoryMode === 'isolated' && (
                      <Check className="w-4 h-4 text-neutral-800 dark:text-neutral-200 shrink-0 mt-0.5 stroke-[2.5]" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Submit Action Button */}
            <button
              type="submit"
              disabled={!name.trim()}
              className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all shadow-xs ${
                name.trim()
                  ? 'bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white cursor-pointer active:scale-95'
                  : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
              }`}
            >
              {projectToEdit ? '保存修改' : '创建项目'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
