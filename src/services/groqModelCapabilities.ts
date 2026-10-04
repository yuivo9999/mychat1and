export interface GroqModelCapabilities {
  supportsVision: boolean;
  supportsFiles: boolean;
}

/**
 * Groq uses the OpenAI-compatible chat API in this app.
 *
 * File attachments are handled locally by fileParser.ts and inserted as text,
 * so Groq models do not need native file-upload support for TXT/code files.
 * Image attachments are sent as image_url only when the model is documented
 * as vision-capable.
 */
export function getGroqModelCapabilities(modelId: string): GroqModelCapabilities {
  const id = modelId.trim().toLowerCase();

  // Groq documents Qwen 3.8 27B as a vision-capable model.
  if (id === 'qwen/qwen3.8-27b') {
    return {
      supportsVision: true,
      supportsFiles: true,
    };
  }

  // GPT-OSS 20B/120B and Safeguard 20B are text-input models.
  return {
    supportsVision: false,
    supportsFiles: true,
  };
}
