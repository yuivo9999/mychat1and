/**
 * Google Gemini / Gemma attachment capability policy.
 *
 * Specifically targets Google Gemini 3.6 Flash, Gemini 3.7 Flash, and Gemini 3.8 Flash
 * to guarantee that plain text (.txt) and native document formats are delivered as
 * independent native inlineData parts rather than serialized into user prompt text.
 */

export const GEMINI_NATIVE_FILE_MODELS = new Set([
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
]);

/**
 * Checks whether a model ID belongs to the Gemini native file model family.
 */
export function isGeminiNativeFileModel(modelId?: string): boolean {
  const id = (modelId || '').trim();
  return GEMINI_NATIVE_FILE_MODELS.has(id);
}

/**
 * Resolves a clean, sanitized native MIME type for Google Gemini inlineData parts.
 * Crucially strips any charset parameters (e.g. '; charset=utf-8') which trigger
 * 400 Unsupported MIME type errors on the Google Generative Language API.
 *
 * Specifically guarantees:
 * - .txt/.text files or text/plain MIME -> 'text/plain'
 * - .pdf files or application/pdf MIME -> 'application/pdf'
 * - .json files or application/json MIME -> 'application/json'
 * - .csv files or text/csv MIME -> 'text/csv'
 * - .md/.markdown files or text/markdown MIME -> 'text/markdown'
 * - .html/.htm files or text/html MIME -> 'text/html'
 * - .xml files or text/xml/application/xml MIME -> 'text/xml'
 * - .yaml/.yml files -> 'text/plain'
 * - .sql files -> 'text/plain'
 * - Any other text/* MIME -> sanitized raw MIME
 * Returns null if the attachment is not natively supported by Gemini generateContent
 * (e.g. binary .docx, archives, etc., which require text extraction fallback).
 */
export function resolveGoogleNativeMimeType(attachment: { name?: string; type?: string }): string | null {
  const rawMime = (attachment.type || '').toLowerCase().split(';', 1)[0].trim();
  const ext = (attachment.name || '').split('.').pop()?.toLowerCase();

  // 1. Explicit TXT file detection
  if (ext === 'txt' || ext === 'text' || rawMime === 'text/plain') {
    return 'text/plain';
  }

  // 2. Standard documents
  if (ext === 'pdf' || rawMime === 'application/pdf') return 'application/pdf';
  if (ext === 'json' || rawMime === 'application/json') return 'application/json';
  if (ext === 'csv' || rawMime === 'text/csv') return 'text/csv';
  if (ext === 'html' || ext === 'htm' || rawMime === 'text/html') return 'text/html';
  if (ext === 'md' || ext === 'markdown' || rawMime === 'text/markdown') return 'text/markdown';
  if (ext === 'xml' || rawMime === 'text/xml' || rawMime === 'application/xml') return 'text/xml';
  if (ext === 'yaml' || ext === 'yml' || rawMime === 'application/yaml') return 'text/plain';
  if (ext === 'sql' || rawMime === 'application/sql') return 'text/plain';

  // 3. Other text/* MIME types
  if (rawMime.startsWith('text/')) {
    return rawMime;
  }

  return null;
}

export function supportsGoogleNativeFileMime(mimeType?: string): boolean {
  const mime = (mimeType || '').toLowerCase().split(';', 1)[0].trim();

  if (mime === 'application/pdf' || mime === 'application/json') return true;
  if (mime.startsWith('text/')) return true;

  return [
    'application/xml',
    'application/yaml',
    'application/sql',
  ].includes(mime);
}
