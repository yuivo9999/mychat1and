import React, { useState } from 'react';
import { X, CheckSquare, Square, Trash2, Star, Download, Check } from 'lucide-react';
import { Conversation, ModelItem } from '../types';

interface BatchManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  onBatchDelete: (ids: string[]) => Promise<void>;
  onBatchFavorite: (ids: string[], isFavorite: boolean) => Promise<void>;
  models: ModelItem[];
}

export const BatchManageModal: React.FC<BatchManageModalProps> = ({
  isOpen,
  onClose,
  conversations,
  onBatchDelete,
  onBatchFavorite,
  models,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === conversations.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(conversations.map(c => c.id));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0 || isDeleting) return;
    const count = selectedIds.length;
    if (confirm(`确认彻底删除选中的 ${count} 个对话记录？该操作不可恢复，对应存储数据将被立即擦除。`)) {
      setIsDeleting(true);
      try {
        await onBatchDelete(selectedIds);
        setSelectedIds([]);
        showToast(`已成功彻底删除 ${count} 个对话`);
      } catch (err: any) {
        showToast(`删除失败: ${err.message || '未知错误'}`);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const handleFavoriteSelected = async (fav: boolean) => {
    if (selectedIds.length === 0) return;
    await onBatchFavorite(selectedIds, fav);
  };

  const handleExportSelected = () => {
    if (selectedIds.length === 0) return;
    const selectedConvs = conversations.filter(c => selectedIds.includes(c.id));
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(selectedConvs, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `batch-export-${selectedIds.length}-chats.json`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-2xl h-[70vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in duration-150">
        {/* Header */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-indigo-500" />
            <h3 className="font-bold text-sm text-neutral-800 dark:text-neutral-200">
              批量管理对话记录
            </h3>
            <span className="text-xs text-neutral-400">
              (已选 {selectedIds.length} / 共 {conversations.length} 项)
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-800/40 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={selectAll}
            className="flex items-center gap-1.5 font-medium text-neutral-700 dark:text-neutral-300 hover:text-indigo-600"
          >
            {selectedIds.length === conversations.length && conversations.length > 0 ? (
              <CheckSquare className="w-4 h-4 text-indigo-600" />
            ) : (
              <Square className="w-4 h-4 text-neutral-400" />
            )}
            <span>全选 / 全不选</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => handleFavoriteSelected(true)}
              className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 flex items-center gap-1"
            >
              <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
              <span>标记收藏</span>
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={handleExportSelected}
              className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>导出所选</span>
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={handleDeleteSelected}
              className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删除选中</span>
            </button>
          </div>
        </div>

        {/* Toast feedback banner */}
        {toastMessage && (
          <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center justify-between animate-in fade-in">
            <span>{toastMessage}</span>
            <button onClick={() => setToastMessage(null)} className="opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-neutral-100 dark:divide-neutral-800/60">
          {conversations.length === 0 ? (
            <div className="py-16 text-center text-xs text-neutral-400 flex flex-col items-center justify-center">
              <CheckSquare className="w-8 h-8 text-neutral-300 dark:text-neutral-700 mb-2 opacity-50" />
              <span>暂无对话记录可进行批量管理</span>
            </div>
          ) : (
            conversations.map((conv) => {
              const isSelected = selectedIds.includes(conv.id);
              const model = models.find(m => m.id === conv.modelId);

              return (
                <div
                  key={conv.id}
                  onClick={() => toggleSelect(conv.id)}
                  className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition ${
                    isSelected 
                      ? 'bg-indigo-50/60 dark:bg-indigo-950/30' 
                      : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="shrink-0">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Square className="w-4 h-4 text-neutral-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                        {conv.title}
                      </p>
                      <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
                        {model?.name || conv.modelId} · {new Date(conv.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {conv.isFavorite && (
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-current shrink-0" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
