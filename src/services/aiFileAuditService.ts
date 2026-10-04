import { Conversation, Workspace } from '../types';

export interface AiFileAuditRecord {
  id: string;
  filePath: string;
  modelId: string;
  modelName: string;
  providerId?: string;
  workspaceId?: string;
  workspaceName?: string;
  conversationId?: string;
  conversationTitle?: string;
  actionType: 'patch' | 'write' | 'create' | 'delete' | 'modify';
  actionDetail?: string;
  diffSummary?: string;
  timestamp: number;
}

const STORAGE_KEY = 'omnichat_ai_file_audit_records_v1';
const MAX_RECORDS = 1000;

/**
 * Get all AI file modification audit records (up to 1000, sorted newest first)
 */
export function getAiFileAuditRecords(): AiFileAuditRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: AiFileAuditRecord[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_RECORDS);
  } catch (err) {
    console.error('Failed to load AI file audit records:', err);
    return [];
  }
}

/**
 * Record new AI file modifications (automatically prepended & capped at 1000 records)
 */
export function recordAiFileModifications(
  newRecords: Array<Omit<AiFileAuditRecord, 'id' | 'timestamp'> & { timestamp?: number }>
): AiFileAuditRecord[] {
  if (!newRecords || newRecords.length === 0) return getAiFileAuditRecords();

  try {
    const current = getAiFileAuditRecords();
    const now = Date.now();

    const created: AiFileAuditRecord[] = newRecords.map((r, idx) => ({
      ...r,
      id: `audit_${now}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: r.timestamp || now,
    }));

    // Prepend new records to the front and cap at 1000 items
    const combined = [...created, ...current];
    const capped = combined.slice(0, MAX_RECORDS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
    return capped;
  } catch (err) {
    console.error('Failed to save AI file audit records:', err);
    return getAiFileAuditRecords();
  }
}

/**
 * Clear all audit records
 */
export function clearAiFileAuditRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear audit records:', err);
  }
}

/**
 * Delete a single record by ID
 */
export function deleteAiFileAuditRecord(id: string): AiFileAuditRecord[] {
  try {
    const current = getAiFileAuditRecords();
    const filtered = current.filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (err) {
    console.error('Failed to delete audit record:', err);
    return getAiFileAuditRecords();
  }
}

/**
 * Export records as a formatted JSON string for download
 */
export function exportAuditRecordsToJson(): string {
  const records = getAiFileAuditRecords();
  return JSON.stringify(records, null, 2);
}

/**
 * Backfill historical audit records from existing conversations if audit log is empty
 */
export function backfillAuditRecordsFromConversations(
  conversations: Conversation[],
  workspaces: Workspace[]
): void {
  try {
    const existing = getAiFileAuditRecords();
    if (existing.length > 0) return; // Don't overwrite existing logs

    const workspaceMap = new Map(workspaces.map(w => [w.id, w.name]));
    const backfilled: Array<Omit<AiFileAuditRecord, 'id'>> = [];

    for (const conv of conversations) {
      const wsName = conv.workspaceId ? (workspaceMap.get(conv.workspaceId) || '当前工作区') : '工作区';
      for (const msg of conv.messages) {
        if (msg.role === 'assistant' && msg.modifiedFiles && msg.modifiedFiles.length > 0) {
          const modelName = msg.model || conv.modelId || 'AI 模型';
          for (const path of msg.modifiedFiles) {
            backfilled.push({
              filePath: path,
              modelId: conv.modelId || 'ai-model',
              modelName,
              providerId: conv.providerId,
              workspaceId: conv.workspaceId,
              workspaceName: wsName,
              conversationId: conv.id,
              conversationTitle: conv.title,
              actionType: 'modify',
              actionDetail: 'AI 协同修改工作区文件',
              timestamp: msg.timestamp || conv.updatedAt || Date.now(),
            });
          }
        }
      }
    }

    if (backfilled.length > 0) {
      // Sort newest first and cap at 1000
      backfilled.sort((a, b) => b.timestamp - a.timestamp);
      recordAiFileModifications(backfilled.slice(0, MAX_RECORDS));
    }
  } catch (e) {
    console.warn('Could not backfill audit records:', e);
  }
}
