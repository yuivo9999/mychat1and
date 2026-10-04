import { AdapterOptions, StreamCallbacks, executeFetch, parseHttpError, isConciseReplyModeEnabled } from './base';
import { extractAttachmentText } from '../fileParser';

function supportsResponsesFileMime(mimeType: string): boolean {
  return [
    'text/plain',
    'text/markdown',
    'text/html',
    'text/css',
    'text/xml',
    'text/csv',
    'text/rtf',
    'text/javascript',
    'application/json',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ].includes(mimeType.toLowerCase());
}

export async function sendOpenAIResponses(options: AdapterOptions, callbacks?: StreamCallbacks): Promise<string> {
  const { model, apiKeyConfig, messages, systemPrompt, parameters, abortSignal, timeoutSeconds } = options;
  const base = (apiKeyConfig.baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '').replace(/\/chat\/completions$/, '').replace(/\/responses$/, '');
  const endpoint = `${base}/responses`;
  const input: any[] = [];

  for (const msg of messages) {
    const parts: any[] = [];
    if (msg.content) parts.push({ type: 'input_text', text: msg.content });
    if (msg.role === 'user') {
      for (const att of msg.attachments || []) {
        if (att.type.startsWith('image/') && model.supportsVision && att.dataUrl) {
          parts.push({ type: 'input_image', image_url: att.dataUrl });
        } else if (!att.type.startsWith('image/') && att.base64Data && supportsResponsesFileMime(att.type)) {
          parts.push({
            type: 'input_file',
            filename: att.name,
            file_data: 'data:' + (att.type || 'application/octet-stream') + ';base64,' + att.base64Data,
          });
        } else if (!att.type.startsWith('image/')) {
          const fallbackText = extractAttachmentText(att);
          if (fallbackText) parts.push({ type: 'input_text', text: '[附件文本: ' + att.name + ']\\n' + fallbackText });
        }
      }
    }
    if (parts.length) input.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: parts });
  }

  const body: any = {
    model: model.id,
    input,
    stream: callbacks != null && (parameters?.stream !== false),
  };
  let sys = systemPrompt || model.systemPrompt;
  if (parameters?.enableReasoning) {
    const reasoningInstruction = '【深度推理模式开启】请在最终回答前，进行严密、深刻且步骤详尽的逻辑推导与思考分析。';
    sys = sys ? `${sys}\n\n${reasoningInstruction}` : reasoningInstruction;
  }
    if (isConciseReplyModeEnabled(parameters)) {
      const conciseReplyInstruction = "【AI 回复精简模式开启】\n最终给用户看的回复只保留真正有用的信息，不输出冗长的背景铺垫、重复解释、过程性自言自语、无关免责声明或总结套话。\n请把答案组织成连续的「关键内容 + 操作步骤」单元：\n1. 先用 1-3 句话说清这一段最核心的结论/判断。\n2. 紧接着给出这一段对应的实际操作步骤，优先使用 1、2、3… 的短步骤；没有操作步骤时给出最关键的下一步。\n3. 一个问题有多个独立重点时，继续输出下一组「关键内容 + 操作步骤」，组与组之间保持清晰留白。\n4. 代码、命令、表格、链接等只有在确实有助于完成任务时才保留。\n5. 不要展示你的内部思考过程；不要为了凑格式而重复内容。\n6. 对纯问答、解释、创意类问题，如果没有实际操作步骤，则改为「核心结论 + 必要补充」，保持简洁。\n目标是让用户打开聊天界面后，第一眼就能看到核心结论，并马上知道下一步怎么做。";
      sys = sys ? `${sys}\n\n${conciseReplyInstruction}` : conciseReplyInstruction;
    }
  if (sys?.trim()) body.instructions = sys.trim();
  if (typeof parameters?.maxTokens === 'number' && parameters.maxTokens > 0) body.max_output_tokens = parameters.maxTokens;

  const key = apiKeyConfig.apiKey?.trim().replace(/^Bearer\s+/i, '') || '';
  const controller = new AbortController();
  const timeout = (timeoutSeconds || 60) * 1000;
  const timer = setTimeout(() => controller.abort(), timeout);
  if (abortSignal) abortSignal.addEventListener('abort', () => controller.abort());

  let response: Response;
  try {
    response = await executeFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...model.customHeaders },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let data: any = null;
    try { data = await response.json(); } catch { data = await response.text(); }
    throw new Error(parseHttpError(response.status, data, response.statusText));
  }

  if (body.stream && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim().startsWith('data:')) continue;
        const raw = line.trim().slice(5).trim();
        if (raw === '[DONE]') continue;
        try {
          const event = JSON.parse(raw);
          if (event.type === 'response.output_text.delta' && event.delta) {
            full += event.delta;
            callbacks?.onChunk(event.delta);
          }
        } catch {}
      }
    }
    callbacks?.onFinish?.(full);
    return full;
  }

  const data = await response.json();
  const full = Array.isArray(data.output)
    ? data.output.flatMap((x: any) => x.content || []).map((x: any) => x.text || '').join('')
    : '';
  callbacks?.onChunk?.(full);
  callbacks?.onFinish?.(full);
  return full;
}
