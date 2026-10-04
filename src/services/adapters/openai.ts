import { BaseAdapter, AdapterOptions, StreamCallbacks, parseHttpError, executeFetch, safeExtractText } from './base';
import { ApiKeyConfig } from '../../types';
import { extractAttachmentText, formatFilesPromptForAi } from '../fileParser';
import { sendOpenAIResponses } from './openaiResponses';
import { getRawModelId, isModelVisionCapable } from '../modelUtils';

export class OpenAIAdapter implements BaseAdapter {
  private getDefaultBaseUrl(providerId: string): string {
    switch (providerId) {
      case 'deepseek':
        return 'https://api.deepseek.com';
      case 'moonshot':
        return 'https://api.moonshot.cn/v1';
      case 'qwen':
        return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      case 'zhipu':
        return 'https://open.bigmodel.cn/api/paas/v4';
      case 'siliconflow':
        return 'https://api.siliconflow.cn/v1';
      case 'openrouter':
        return 'https://openrouter.ai/api/v1';
      case 'groq':
        return 'https://api.groq.com/openai/v1';
      case 'cerebras':
        return 'https://api.cerebras.ai/v1';
      case 'nvidia':
        return 'https://integrate.api.nvidia.com/v1';
      case 'ollama':
        return 'http://localhost:11434/v1';
      default:
        return 'https://api.openai.com/v1';
    }
  }

  private resolveEndpoint(apiKeyConfig: ApiKeyConfig): string {
    let base = (apiKeyConfig.baseUrl?.trim() || this.getDefaultBaseUrl(apiKeyConfig.providerId)).replace(/\/+$/, '');
    if (!base.endsWith('/chat/completions')) {
      if (base.endsWith('/v1')) {
        base += '/chat/completions';
      } else {
        base += '/chat/completions';
      }
    }
    return base;
  }

  async sendMessage(options: AdapterOptions, callbacks?: StreamCallbacks): Promise<string> {
    const { model, apiKeyConfig, messages, systemPrompt, temperature, maxTokens, topP, parameters, abortSignal, timeoutSeconds } = options;
    // Never hijack image attachments to /responses! Standard /v1/chat/completions natively handles vision (gpt-4o, etc.)
    const hasImageAttachments = messages.some(m => m.attachments?.some(a => a.type.startsWith('image/')));
    if (
      apiKeyConfig.providerId === 'openai' &&
      model.supportsFiles &&
      !hasImageAttachments &&
      messages.some(m => m.role === 'user' && (m.attachments?.length || 0) > 0)
    ) {
      return sendOpenAIResponses(options, callbacks);
    }

    const endpoint = this.resolveEndpoint(apiKeyConfig);
    const modelCanVision = isModelVisionCapable(model, apiKeyConfig.providerId);

    const formattedMessages: any[] = [];

    // System message
    let sys = systemPrompt || model.systemPrompt;
    if (parameters?.enableReasoning) {
      const reasoningInstruction = '【深度推理模式开启】请在最终回答前，进行严密、深刻且步骤详尽的逻辑推导与思考分析。';
      sys = sys ? `${sys}\n\n${reasoningInstruction}` : reasoningInstruction;
    }
    if (sys && sys.trim()) {
      formattedMessages.push({
        role: 'system',
        content: sys.trim(),
      });
    }

    // Convert messages
    for (const msg of messages) {
      if (msg.role === 'user') {
        const imageAttachments = (msg.attachments || []).filter(a => a.type.startsWith('image/') && a.dataUrl);
        const nonImageAttachments = (msg.attachments || []).filter(a => !a.type.startsWith('image/'));

        // Format document/code files using optimal structured prompt
        let formattedText = msg.content || '';
        if (nonImageAttachments.length > 0) {
          formattedText = formatFilesPromptForAi(nonImageAttachments, formattedText);
        }

        if (imageAttachments.length > 0 && modelCanVision) {
          const contents: any[] = [];
          if (!formattedText.trim()) {
            formattedText = '请仔细观察并识别分析附带的图片中的内容。';
          }
          contents.push({ type: 'text', text: formattedText });

          // Add image attachments
          for (const att of imageAttachments) {
            contents.push({
              type: 'image_url',
              image_url: {
                url: att.dataUrl,
                detail: 'auto',
              },
            });
          }
          formattedMessages.push({ role: 'user', content: contents });
        } else {
          // Model does not support vision (or no image attached)
          if (imageAttachments.length > 0 && !modelCanVision) {
            // Natural explanation in prompt so AI naturally informs user without showing a red error
            const modelLabel = model.name || model.id;
            if (formattedText.trim()) {
              formattedText += `\n\n[系统提示：用户随消息附带了图片，但当前大模型【${modelLabel}】为纯文本语言模型，暂不支持图像视觉识别功能，系统已自动略过图片数据。请您正常针对上述文字/文件内容进行解答，并在回答开头简要告知用户当前模型暂不支持识别图片。]`;
            } else {
              formattedText = `[系统提示：用户发送了图片，但当前大模型【${modelLabel}】为纯文本语言模型，暂不支持图像视觉识别功能。请礼貌告知用户您当前无法查看该图片内容，并建议用户在顶部切换为支持图片视觉的多模态模型（如 Gemini 3.8 Flash、GPT-4o、Qwen-VL 等）。]`;
            }
          }

          formattedMessages.push({ role: 'user', content: formattedText || '你好' });
        }
      } else if (msg.role === 'assistant') {
        formattedMessages.push({
          role: 'assistant',
          content: msg.content,
        });
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...model.customHeaders,
    };

    // Decide streaming mode before building provider-specific headers.
    const stream = (parameters?.stream !== undefined ? parameters.stream : model.supportsStreaming !== false) && callbacks != null;

    // NVIDIA NIM accepts JSON or SSE explicitly.
    if (apiKeyConfig.providerId === 'nvidia') {
      headers['Accept'] = stream ? 'text/event-stream' : 'application/json';
    }

    if (apiKeyConfig.apiKey) {
      // Accept either a raw nvapi-... token or a value already prefixed with
      // "Bearer ", without ever producing "Bearer Bearer ...".
      const rawKey = apiKeyConfig.apiKey.trim().replace(/^Bearer\s+/i, '');
      headers['Authorization'] = `Bearer ${rawKey}`;
    }

    // OpenRouter attribution headers are optional. Keep the browser request minimal
    // so the API call only needs the standard Authorization + Content-Type headers.

    const rawModelId = getRawModelId(model);
    const bodyPayload: any = {
      model: (apiKeyConfig.providerId === 'groq' || apiKeyConfig.providerId === 'cerebras') ? rawModelId.replace(/^(groq|cerebras)\//, '') : rawModelId,
      messages: formattedMessages,
      stream,
    };

    const isReasoningModel = /^(o1|o3|deepseek-reasoner|r1)/i.test(rawModelId);
    const effectiveTemp = parameters?.temperature ?? temperature ?? model.temperature;
    const effectiveMaxTokens = parameters?.maxTokens ?? maxTokens ?? model.maxTokens;
    const effectiveTopP = parameters?.topP ?? topP ?? model.topP;

    // Reasoning models (o1, o3-mini, deepseek-reasoner) reject custom temperature or force default
    if (!isReasoningModel && typeof effectiveTemp === 'number') {
      bodyPayload.temperature = effectiveTemp;
    }

    if (parameters?.limitMaxTokens && typeof effectiveMaxTokens === 'number' && effectiveMaxTokens > 0) {
      if (isReasoningModel && apiKeyConfig.providerId === 'openai') {
        bodyPayload.max_completion_tokens = effectiveMaxTokens;
      } else {
        bodyPayload.max_tokens = effectiveMaxTokens;
      }
    }

    if (!isReasoningModel && typeof effectiveTopP === 'number' && effectiveTopP < 1) {
      bodyPayload.top_p = effectiveTopP;
    }

    if (typeof parameters?.frequencyPenalty === 'number' && parameters.frequencyPenalty !== 0) {
      bodyPayload.frequency_penalty = parameters.frequencyPenalty;
    }
    if (typeof parameters?.presencePenalty === 'number' && parameters.presencePenalty !== 0) {
      bodyPayload.presence_penalty = parameters.presencePenalty;
    }
    if (parameters?.stop && parameters.stop.trim()) {
      bodyPayload.stop = [parameters.stop.trim()];
    }
    if (typeof parameters?.seed === 'number' && !isNaN(parameters.seed)) {
      bodyPayload.seed = parameters.seed;
    }
    if (parameters?.enableReasoning) {
      const isNativeReasoningModel = 
        apiKeyConfig.providerId === 'openai' || 
        apiKeyConfig.providerId === 'openrouter' ||
        /^(o1|o3|reasoner|r1)/i.test(rawModelId);

      if (isNativeReasoningModel) {
        bodyPayload.reasoning_effort = 'medium';
      }
    }

    // Timeout controller
    const controller = new AbortController();
    const timeout = (timeoutSeconds || 60) * 1000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const onUserAbort = () => controller.abort();
    if (abortSignal) {
      abortSignal.addEventListener('abort', onUserAbort);
    }

    let response: Response;
    try {
      response = await executeFetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        if (abortSignal?.aborted) {
          throw new Error('用户已手动停止生成');
        }
        throw new Error(`请求超时 (${timeout / 1000}秒)，请检查网络连接或在高级设置中增加超时时间`);
      }
      if (err.message && err.message.includes('Failed to fetch')) {
        throw new Error(`网络请求失败 / CORS 跨域拦截: 浏览器直连 ${endpoint} 被提供商拒绝。请确认该 API endpoint 允许浏览器跨域访问。`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onUserAbort);
      }
    }

    if (!response.ok) {
      let errorData: any = null;
      try {
        errorData = await response.json();
      } catch {
        try {
          errorData = await response.text();
        } catch {}
      }

      const errorText = typeof errorData === 'string' ? errorData : JSON.stringify(errorData || {});
      const isVisionRejection =
        (response.status === 400 || response.status === 404 || response.status === 422) &&
        (errorText.toLowerCase().includes('image') ||
         errorText.toLowerCase().includes('vision') ||
         errorText.toLowerCase().includes('multimodal') ||
         errorText.toLowerCase().includes('unsupported content') ||
         errorText.toLowerCase().includes('image_url') ||
         errorText.toLowerCase().includes('not support'));

      // If the API rejected image input and images were attached, seamlessly fallback to text-only mode without throwing error
      if (isVisionRejection && messages.some(m => m.attachments?.some(a => a.type.startsWith('image/')))) {
        console.warn('API rejected image input, seamlessly falling back to text-only mode without image payload.');
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

    // Handle Streaming Response
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
            if (!trimmed || trimmed.startsWith(':')) continue; // comment or empty
            if (trimmed === 'data: [DONE]') {
              continue;
            }
            if (trimmed.startsWith('data:')) {
              const jsonStr = trimmed.slice(5).trim();
              try {
                const parsed = JSON.parse(jsonStr);
                const rawDelta = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.text ?? '';
                const delta = safeExtractText(rawDelta);
                if (delta) {
                  fullContent += delta;
                  callbacks?.onChunk(delta);
                }
              } catch {
                // partial json chunk, ignore
              }
            }
          }
        }

        // flush remaining buffer
        if (buffer.trim().startsWith('data:')) {
          const jsonStr = buffer.trim().slice(5).trim();
          if (jsonStr && jsonStr !== '[DONE]') {
            try {
              const parsed = JSON.parse(jsonStr);
              const rawDelta = parsed.choices?.[0]?.delta?.content ?? '';
              const delta = safeExtractText(rawDelta);
              if (delta) {
                fullContent += delta;
                callbacks?.onChunk(delta);
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

    // Non-streaming fallback
    const resJson = await response.json();
    const content = resJson.choices?.[0]?.message?.content || '';
    callbacks?.onChunk?.(content);
    callbacks?.onFinish?.(content);
    return content;
  }

  async testConnection(apiKeyConfig: ApiKeyConfig, modelId = 'gpt-4o-mini'): Promise<{ success: boolean; message: string }> {
    try {
      const endpoint = this.resolveEndpoint(apiKeyConfig);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKeyConfig.providerId === 'nvidia') {
        headers['Accept'] = 'application/json';
      }
      if (apiKeyConfig.apiKey) {
        const rawKey = apiKeyConfig.apiKey.trim().replace(/^Bearer\s+/i, '');
        headers['Authorization'] = `Bearer ${rawKey}`;
      }

      const rawModelId = getRawModelId(modelId);
      // Keep the connection probe to OpenRouter's standard headers only.
      const res = await executeFetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: (apiKeyConfig.providerId === 'groq' || apiKeyConfig.providerId === 'cerebras') ? rawModelId.replace(/^(groq|cerebras)\//, '') : rawModelId,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5,
        }),
      });

      if (res.ok) {
        return { success: true, message: `连接成功！已顺利收到 ${modelId} 的应答。` };
      }

      let errorData: any = null;
      try {
        errorData = await res.json();
      } catch {
        errorData = await res.text();
      }
      return { success: false, message: parseHttpError(res.status, errorData, res.statusText) };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || '网络连接失败，请检查 Base URL 与网络跨域设置',
      };
    }
  }
}