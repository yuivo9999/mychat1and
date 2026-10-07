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
const ACTION_TYPES = new Set<AiFileAuditRecord['actionType']>([
  'patch',
  'write',
  'create',
  'delete',
  'modify',
]);

function normalizeAuditRecord(value: unknown, fallbackIndex = 0): AiFileAuditRecord | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AiFileAuditRecord>;
  const filePath = typeof raw.filePath === 'string' ? raw.filePath.trim() : '';
  if (!filePath) return null;

  const timestamp = Number(raw.timestamp);
  const safeTimestamp = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
  const actionType = ACTION_TYPES.has(raw.actionType as AiFileAuditRecord['actionType'])
    ? raw.actionType as AiFileAuditRecord['actionType']
    : 'modify';

  return {
    id: typeof raw.id === 'string' && raw.id.trim()
      ? raw.id
      : `audit_recovered_${safeTimestamp}_${fallbackIndex}`,
    filePath,
    modelId: typeof raw.modelId === 'string' ? raw.modelId : 'ai-model',
    modelName: typeof raw.modelName === 'string' && raw.modelName.trim()
      ? raw.modelName
      : (typeof raw.modelId === 'string' && raw.modelId.trim() ? raw.modelId : 'AI 模型'),
    ...(typeof raw.providerId === 'string' ? { providerId: raw.providerId } : {}),
    ...(typeof raw.workspaceId === 'string' ? { workspaceId: raw.workspaceId } : {}),
    ...(typeof raw.workspaceName === 'string' ? { workspaceName: raw.workspaceName } : {}),
    ...(typeof raw.conversationId === 'string' ? { conversationId: raw.conversationId } : {}),
    ...(typeof raw.conversationTitle === 'string' ? { conversationTitle: raw.conversationTitle } : {}),
    actionType,
    ...(typeof raw.actionDetail === 'string' ? { actionDetail: raw.actionDetail } : {}),
    ...(typeof raw.diffSummary === 'string' ? { diffSummary: raw.diffSummary } : {}),
    timestamp: safeTimestamp,
  };
}

/**
 * Get all AI file modification audit records (up to 1000, sorted newest first).
 * Malformed legacy records are ignored instead of breaking the audit window.
 */
export function getAiFileAuditRecords(): AiFileAuditRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item, index) => normalizeAuditRecord(item, index))
      .filter((item): item is AiFileAuditRecord => item !== null)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_RECORDS);
  } catch (err) {
    console.error('Failed to load AI file audit records:', err);
    return [];
  }
}

/**
 * Record new AI file modifications and keep the newest 1000 records.
 */
export function recordAiFileModifications(
  newRecords: Array<Omit<AiFileAuditRecord, 'id' | 'timestamp'> & { timestamp?: number }>
): AiFileAuditRecord[] {
  if (!Array.isArray(newRecords) || newRecords.length === 0) return getAiFileAuditRecords();

  try {
    const current = getAiFileAuditRecords();
    const now = Date.now();

    const created = newRecords
      .map((record, index) => normalizeAuditRecord({
        ...record,
        id: `audit_${now}_${index}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: record.timestamp ?? now,
      }, index))
      .filter((item): item is AiFileAuditRecord => item !== null);

    const combined = [...created, ...current]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_RECORDS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(combined));
    return combined;
  } catch (err) {
    console.error('Failed to save AI file audit records:', err);
    return getAiFileAuditRecords();
  }
}

export function clearAiFileAuditRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear audit records:', err);
  }
}

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

export function exportAuditRecordsToJson(): string {
  return JSON.stringify(getAiFileAuditRecords(), null, 2);
}

/**
 * Backfill historical audit records from existing conversations if the audit log is empty.
 */
export function backfillAuditRecordsFromConversations(
  conversations: Conversation[],
  workspaces: Workspace[]
): void {
  try {
    const existing = getAiFileAuditRecords();
    if (existing.length > 0) return;

    const workspaceMap = new Map(workspaces.map(w => [w.id, w.name]));
    const backfilled: Array<Omit<AiFileAuditRecord, 'id'>> = [];

    for (const conv of conversations) {
      const wsName = conv.workspaceId ? (workspaceMap.get(conv.workspaceId) || '当前工作区') : '工作区';
      for (const msg of conv.messages) {
        if (msg.role === 'assistant' && Array.isArray(msg.modifiedFiles) && msg.modifiedFiles.length > 0) {
          const modelName = msg.model || conv.modelId || 'AI 模型';
          for (const path of msg.modifiedFiles) {
            const filePath = typeof path === 'string' ? path.trim() : '';
            if (!filePath) continue;
            backfilled.push({
              filePath,
              modelId: conv.modelId || 'ai-model',
              modelName,
              providerId: conv.providerId,
              workspaceId: conv.workspaceId,
              workspaceName: wsName,
              conversationId: conv.id,
              conversationTitle: conv.title,
              actionType: 'modify',
              actionDetail: 'AI 协同修改工作区文件',
              timestamp: Number(msg.timestamp) || Number(conv.updatedAt) || Date.now(),
            });
          }
        }
      }
    }

    if (backfilled.length > 0) {
      backfilled.sort((a, b) => b.timestamp - a.timestamp);
      recordAiFileModifications(backfilled.slice(0, MAX_RECORDS));
    }
  } catch (e) {
    console.warn('Could not backfill audit records:', e);
  }
}
