import { BaseAdapter, AdapterOptions, StreamCallbacks, parseHttpError, executeFetch, safeExtractText } from './base';
import { ApiKeyConfig } from '../../types';
import { extractAttachmentText } from '../fileParser';
import { isGeminiNativeFileModel, resolveGoogleNativeMimeType, supportsGoogleNativeFileMime } from '../googleFileSupport';
import { getRawModelId, isModelVisionCapable } from '../modelUtils';

export class GeminiAdapter implements BaseAdapter {
  private normalizeModelId(modelId: string): string {
    const m = (modelId || '').trim();
    const raw = getRawModelId(m);
    return raw || 'gemini-3.8-flash';
  }

  private cleanKey(rawKey?: string): string {
    let key = (rawKey || '').trim();
    key = key.replace(/^["']|["']$/g, '').trim();
    if (key.toLowerCase().startsWith('bearer ')) key = key.slice(7).trim();
    return key;
  }

  private resolveEndpoint(apiKeyConfig: ApiKeyConfig, modelId: string, isStream: boolean): string {
    let base = (apiKeyConfig.baseUrl?.trim() || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    if (!base.includes('/v1beta') && !base.includes('/v1')) base += '/v1beta';

    const action = isStream ? 'streamGenerateContent' : 'generateContent';
    const effectiveModel = this.normalizeModelId(modelId);
    const sseParam = isStream ? '?alt=sse' : '';
    return `${base}/models/${encodeURIComponent(effectiveModel)}:${action}${sseParam}`;
  }

  private requestHeaders(apiKeyConfig: ApiKeyConfig, customHeaders?: Record<string, string>): Record<string, string> {
    const key = this.cleanKey(apiKeyConfig.apiKey);
    return {
      'Content-Type': 'application/json',
      ...(key ? { 'x-goog-api-key': key } : {}),
      ...customHeaders,
    };
  }


  async sendMessage(options: AdapterOptions, callbacks?: StreamCallbacks): Promise<string> {
    const { model, apiKeyConfig, messages, systemPrompt, temperature, maxTokens, topP, parameters, abortSignal, timeoutSeconds } = options;
    const stream = (parameters?.stream !== undefined ? parameters.stream : model.supportsStreaming !== false) && callbacks != null;
    const endpoint = this.resolveEndpoint(apiKeyConfig, model.id, stream);
    const modelCanVision = isModelVisionCapable(model, 'google');
    const contents: any[] = [];

    for (const msg of messages) {
      const parts: any[] = [];
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const textContent = msg.content;
      if (textContent) parts.push({ text: textContent });

      if (msg.role === 'user' && msg.attachments) {
        const imageAttachments = msg.attachments.filter(a => a.type.startsWith('image/'));
        const nonImageAttachments = msg.attachments.filter(a => !a.type.startsWith('image/'));

        if (imageAttachments.length > 0 && modelCanVision) {
          for (const att of imageAttachments) {
            if (att.dataUrl) {
              const matches = att.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
              if (matches) parts.push({ inlineData: { mimeType: matches[1], data: matches[2] } });
            }
          }
          if (parts.length === 0 || !parts.some(p => p.text)) {
            parts.unshift({ text: '请仔细观察并识别分析附带的图片中的内容。' });
          }
        } else if (imageAttachments.length > 0 && !modelCanVision) {
          const modelLabel = model.name || model.id;
          if (parts.length > 0) {
            parts.push({
              text: `\n\n[系统提示：用户随消息附带了图片，但当前大模型【${modelLabel}】为纯文本语言模型，暂不支持多模态图像视觉识别功能，系统已自动略过图片。请您正常针对上述文字问题进行解答，并在回答开头简要告知用户当前模型暂不支持识别图片。]`
            });
          } else {
            parts.push({
              text: `[系统提示：用户发送了图片，但当前大模型【${modelLabel}】为纯文本语言模型，暂不支持图像视觉识别功能。请礼貌告知用户您当前无法查看该图片内容，并建议用户在顶部切换为支持图片视觉的多模态模型（如 Gemini 3.8 Flash、GPT-4o、Qwen-VL 等）。]`
            });
          }
        }

        for (const att of nonImageAttachments) {
          if (att.base64Data) {
            const isNativeModel = isGeminiNativeFileModel(model.id) || model.supportsFiles;
            const nativeMime = isNativeModel ? resolveGoogleNativeMimeType(att) : null;

            if (nativeMime) {
              // TXT and native document files are sent as independent Gemini inlineData parts.
              parts.push({
                inlineData: {
                  mimeType: nativeMime,
                  data: att.base64Data,
                },
              });
            } else {
              // Only unsupported binary documents fall back to local text extraction.
              parts.push({ text: `[附件文本: ${att.name}]\n${extractAttachmentText(att)}` });
            }
          }
        }
      }
      if (parts.length > 0) contents.push({ role, parts });
    }

    const bodyPayload: any = { contents, generationConfig: {} };
    let sys = systemPrompt || model.systemPrompt;
    if (parameters?.enableReasoning) {
      const reasoningInstruction = '【深度推理模式开启】请在最终回答前，进行严密、深刻且步骤详尽的逻辑推导与思考分析。';
      sys = sys ? `${sys}\n\n${reasoningInstruction}` : reasoningInstruction;
    }
    if (sys && sys.trim()) bodyPayload.systemInstruction = { parts: [{ text: sys.trim() }] };

    const effectiveTemp = parameters?.temperature ?? temperature ?? model.temperature;
    const effectiveMaxTokens = parameters?.maxTokens ?? maxTokens ?? model.maxTokens;
    const effectiveTopP = parameters?.topP ?? topP ?? model.topP;
    if (typeof effectiveTemp === 'number') bodyPayload.generationConfig.temperature = effectiveTemp;
    if (parameters?.limitMaxTokens && typeof effectiveMaxTokens === 'number' && effectiveMaxTokens > 0) bodyPayload.generationConfig.maxOutputTokens = effectiveMaxTokens;
    if (typeof effectiveTopP === 'number') bodyPayload.generationConfig.topP = effectiveTopP;
    if (typeof parameters?.presencePenalty === 'number' && parameters.presencePenalty !== 0) bodyPayload.generationConfig.presencePenalty = parameters.presencePenalty;
    if (typeof parameters?.frequencyPenalty === 'number' && parameters.frequencyPenalty !== 0) bodyPayload.generationConfig.frequencyPenalty = parameters.frequencyPenalty;
    if (parameters?.stop && parameters.stop.trim()) bodyPayload.generationConfig.stopSequences = [parameters.stop.trim()];

    if (parameters?.enableReasoning) {
      bodyPayload.generationConfig.thinkingConfig = { thinkingBudget: 2048 };
    } else if (parameters?.enableReasoning === false) {
      bodyPayload.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const controller = new AbortController();
    const timeout = (timeoutSeconds || 60) * 1000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const onUserAbort = () => controller.abort();
    if (abortSignal) abortSignal.addEventListener('abort', onUserAbort);

    let response: Response;
    try {
      response = await executeFetch(endpoint, {
        method: 'POST',
        headers: this.requestHeaders(apiKeyConfig, model.customHeaders),
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        if (abortSignal?.aborted) throw new Error('用户已手动停止生成');
        throw new Error(`Gemini 请求超时 (${timeout / 1000}秒)`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (abortSignal) abortSignal.removeEventListener('abort', onUserAbort);
    }

    if (!response.ok) {
      let errorData: any = null;
      try { errorData = await response.json(); } catch { errorData = await response.text(); }
      const errorText = typeof errorData === 'string' ? errorData : JSON.stringify(errorData || {});
      const isVisionRejection =
        (response.status === 400 || response.status === 404 || response.status === 422) &&
        (errorText.toLowerCase().includes('image') ||
         errorText.toLowerCase().includes('vision') ||
         errorText.toLowerCase().includes('multimodal') ||
         errorText.toLowerCase().includes('unsupported content') ||
         errorText.toLowerCase().includes('not support'));

      if (isVisionRejection && messages.some(m => m.attachments?.some(a => a.type.startsWith('image/')))) {
        console.warn('Gemini API rejected image input, seamlessly falling back to text-only mode.');
        return this.sendMessage(
          {
            ...options,
            model: { ...model, supportsVision: false },
          },
          callbacks
        );
      }

      throw new Error(parseHttpError(response.status, errorData, response.statusText));
    }

    if (stream && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullContent = '';
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            try {
              const parsed = JSON.parse(trimmed.slice(5).trim());
              const parts = parsed.candidates?.[0]?.content?.parts || [];
              for (const part of parts) {
                const txt = safeExtractText(part.text || part);
                if (txt) {
                  fullContent += txt;
                  callbacks?.onChunk(txt);
                }
              }
            } catch {}
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          callbacks?.onFinish?.(fullContent);
          return fullContent;
        }
        throw err;
      }
      callbacks?.onFinish?.(fullContent);
      return fullContent;
    }

    const resJson = await response.json();
    const parts = resJson.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p: any) => p.text || '').join('');
    callbacks?.onChunk?.(text);
    callbacks?.onFinish?.(text);
    return text;
  }

  async testConnection(apiKeyConfig: ApiKeyConfig, modelId = 'gemini-3.8-flash'): Promise<{ success: boolean; message: string }> {
    try {
      const effectiveModel = this.normalizeModelId(modelId);
      const endpoint = this.resolveEndpoint(apiKeyConfig, effectiveModel, false);
      const res = await executeFetch(endpoint, {
        method: 'POST',
        headers: this.requestHeaders(apiKeyConfig),
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Hello' }] }], generationConfig: { maxOutputTokens: 5 } }),
      });
      if (res.ok) return { success: true, message: `Gemini 连接成功！模型 [${effectiveModel}] 已响应。` };
      let errorData: any = null;
      try { errorData = await res.json(); } catch { errorData = await res.text(); }
      return { success: false, message: `模型 [${effectiveModel}] 连接失败: ${parseHttpError(res.status, errorData, res.statusText)}` };
    } catch (err: any) {
      return { success: false, message: err.message || '连接失败' };
    }
  }
}
