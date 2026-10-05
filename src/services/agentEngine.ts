import { 
  Workspace, 
  WorkspaceFile, 
  ToolCallExecution, 
  validateSafeRelativePath 
} from '../types/workspace';
import { ThinkingStep } from '../types';
import { assertAgentTaskNotStopped } from './agentOrchestrator';
import { 
  searchWorkspaceCode, 
  getWorkspaceDirectoryTree, 
  computeDiffBetweenFileSnapshots 
} from './workspaceService';
import { formatChatContextPrompt, detectWorkspaceIntent, WorkspaceIntent } from './chatContextService';
import { ChatContext } from '../types/workspace';
import { looksLikePythonSource, getWorkspaceNodeRuntimeState, markWorkspaceDependenciesInstalled, readWorkspaceFile, listWorkspaceFiles, writeWorkspaceFile, deleteWorkspaceFile as deleteAndroidWorkspaceFile, executeCode } from './codeExecutionAdapter';
import { executeAgentRuntime, getAgentRuntimeCapabilities, installAgentDependencies } from './agentRuntime';
import { buildProjectRuntimeReport, inspectProjectRuntime, getProjectRuntimeDiagnostics, startProjectRuntime, stopProjectRuntime, captureProjectRuntimeScreenshot, interactProjectPreview, discoverProjectPreviewElements } from './projectRuntimeService';

export { detectWorkspaceIntent, type WorkspaceIntent };

// AI Tool Calling Specification for Workspace operations - focused on Code Analysis, Modification & Review
export const WORKSPACE_TOOLS_SPEC = [
  {
    name: 'read_file',
    description: '核心读代码工具：按需读取工作区中指定代码文件的文本内容。在修改任何代码前必须先读取文件真实内容。支持指定 start_line 和 end_line 行号范围。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件相对路径，如 "src/App.tsx"' },
        start_line: { type: 'number', description: '可选起始行号 (1-indexed)' },
        end_line: { type: 'number', description: '可选结束行号' },
      },
      required: ['path'],
    },
  },
  {
    name: 'patch_file',
    description: '核心改代码工具：对现有文件进行精确的局部代码块替换。必须先 read_file，确保 target_content 与文件中现有代码精确逐字匹配。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目标文件相对路径' },
        target_content: { type: 'string', description: '文件中必须完全精确匹配的现有代码块' },
        replacement_content: { type: 'string', description: '替换后的新代码块' },
      },
      required: ['path', 'target_content', 'replacement_content'],
    },
  },
  {
    name: 'write_file',
    description: '全量写入文件内容。适用于创建新代码文件或必要的大规模重构重写。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目标文件相对路径' },
        content: { type: 'string', description: '要写入的完整文件内容' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'create_file',
    description: '在工作区中创建新代码文件。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '新建文件的路径，如 "src/types/user.ts"' },
        content: { type: 'string', description: '初始文件内容' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_code',
    description: '在工作区全部代码文件中全文搜索关键词、函数名、类名或变量声明，返回匹配的文件路径、行号和代码行。用于快速定位函数定义与调用链路。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '代码检索关键词或函数名，如 "handleSubmit" 或 "fetchUser"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_files',
    description: '根据文件名或路径搜索工作区中的相关文件。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '文件名或路径关键词，如 "Modal" 或 "route"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_files',
    description: '列出工作区中的文件相对路径与大小。支持 path_prefix 目录前缀筛选。',
    parameters: {
      type: 'object',
      properties: {
        path_prefix: { type: 'string', description: '可选，目录前缀，如 "src/"' },
      },
    },
  },
  {
    name: 'get_workspace_tree',
    description: '获取整个工作区的完整文件树目录概览。',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_file_diff',
    description: '查看指定文件自修改以来的 diff 对比差异，用于自审改动是否正确。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件相对路径' },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_workspace_diff',
    description: '查看整个工作区中所有已修改、新增和删除的文件清单与差异。',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'delete_file',
    description: '从工作区中删除指定文件。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要删除的文件路径' },
      },
      required: ['path'],
    },
  },
  {
    name: 'rename_file',
    description: '重命名工作区中的文件。',
    parameters: {
      type: 'object',
      properties: {
        old_path: { type: 'string', description: '原文件路径' },
        new_path: { type: 'string', description: '新文件路径' },
      },
      required: ['old_path', 'new_path'],
    },
  },
  {
    name: 'run_project_check',
    description: '核心自我审查与验证工具：运行项目的自动化检查（typecheck/lint/test/build），获取真实编译器和测试报错以指导自愈修复。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '可选指定检查命令；留空时使用项目检测到的推荐检查命令。' },
      },
    },
  },
  {
    name: 'inspect_project',
    description: '识别当前工作区项目类型、包管理器、依赖清单及可用 scripts 脚本命令。',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'run_command',
    description: '通过统一 Agent Runtime 执行 Shell 命令、测试或构建脚本。在“运行脚本与命令”权限开启时可用。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的完整 Shell 命令' },
      },
      required: ['command'],
    },
  },
  {
    name: 'run_python',
    description: '执行 Python 源代码。在“运行脚本与命令”权限开启时可用。',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '要执行的完整 Python 源代码' },
      },
      required: ['code'],
    },
  },
];

// Build System Prompt containing workspace summary, code diagnosis & modification protocol
export function buildAgentSystemPrompt(
  workspace: Workspace | null,
  chatContext?: ChatContext,
  baseSystemPrompt?: string,
  isDiagnosisMode?: boolean,
  executeScriptEnabled?: boolean,
  historySearchEnabled?: boolean,
  visionAvailable: boolean = true
): string {
  const customPrompt = baseSystemPrompt || '你是一个专业严谨的高级全栈编程助手与代码架构师。';

  const workspaceSummary = workspace
    ? `## 📁 当前绑定的工作区: ${workspace.name} (ID: ${workspace.id}, 版本: v${workspace.currentVersion})
- 文件总数: ${Object.keys(workspace.files).length} 个
- 工作区目录树概览:
${getWorkspaceDirectoryTree(workspace).slice(0, 1500)}${Object.keys(workspace.files).length > 25 ? '\n... (更多文件可使用 list_files 查看)' : ''}`
    : '## 当前暂未绑定工作区。';

  const chatPrivateMemory = formatChatContextPrompt(chatContext);

  const coreWorkflow = `
## ⚡ 核心能力与工程 Agent 工作流 (Coding Agent Protocol):
你拥有直接读取、搜索和精准修改当前工作区代码文件的全部能力。面对用户的编程需求、Bug 排查或功能开发，请遵循以下高效闭环：

### 1. 【代码深度分析 (Analyze)】
- **严禁无据猜测**：修改代码前必须使用 \`read_file\` 或 \`search_code\` 确认目标函数、类型定义与依赖关系。
- 确认问题根因或开发目标后，规划涉及修改的文件列表。

### 2. 【直接精准修改 (Modify)】
- **优先使用 \`patch_file\` 局部替换**：将目标代码块精准替换为新代码，确保 \`target_content\` 与查阅到的代码逐行逐字符精确一致。保持原代码风格与缩进。
- 创建全新文件时使用 \`create_file\` 或 \`write_file\`。
- 支持单轮输出多个 \`tool_call\`，连贯修改多个相关文件。

### 3. 【自我审查与验证 (Review & Self-Correction)】
- 代码修改完成后，主动审查语法、类型（TypeScript）、未捕获异常、缺失 import 以及边界逻辑。
- 可主动调用 \`run_project_check\` 或运行脚本，获取真实编译器与测试反馈。
- 若检查或工具返回报错，**立即在下一轮分析报错并调用 \`patch_file\` 自愈修正**，直到代码彻底正确。

### 4. 【完结与清晰总结 (Conclude)】
- 当所有代码均已修改完毕且验证通过后，**立即停止输出任何 tool_call 代码块**。
- 输出结构化的中文总结：明确列出修改的文件、改动的核心逻辑，以及对用户的提示。

## 🛠️ 工具调用格式规范 (Tool Call Specification):
若需查看、搜索或修改工作区文件，请以标准 tool_call 代码块输出：
\`\`\`tool_call
{
  "tool": "read_file",
  "args": {
    "path": "src/App.tsx"
  }
}
\`\`\`
或修改代码：
\`\`\`tool_call
{
  "tool": "patch_file",
  "args": {
    "path": "src/App.tsx",
    "target_content": "const count = 0;",
    "replacement_content": "const count = 1;"
  }
}
\`\`\`
核心可用工具：
- read_file({ path, start_line?, end_line? })
- patch_file({ path, target_content, replacement_content })
- write_file({ path, content })
- create_file({ path, content? })
- delete_file({ path })
- rename_file({ old_path, new_path })
- search_code({ query })
- search_files({ query })
- list_files({ path_prefix? })
- get_file_diff({ path })
- get_workspace_diff()
- run_project_check({ command? })
- inspect_project()
${executeScriptEnabled ? '- run_command({ command })\n- run_python({ code })' : ''}
`;

  return `${customPrompt}

${workspaceSummary}
${chatPrivateMemory}
${coreWorkflow}
`;
}

// Format tool execution outcome into clean, structured markdown for AI model ingestion
export function formatToolOutcomeForModel(
  toolName: string,
  args: Record<string, any>,
  outcome: { result: any; errorMessage?: string }
): string {
  if (outcome.errorMessage) {
    return `### 工具执行失败: \`${toolName}\`
- 参数: \`${JSON.stringify(args)}\`
- 错误详情: ${outcome.errorMessage}
- 建议: 若为 patch_file 匹配失败，请使用 read_file 重新读取该文件最新内容确认精确格式，或使用 write_file 直接写入完整代码。`;
  }

  switch (toolName) {
    case 'read_file': {
      const { path, size, content, isBinary } = outcome.result || {};
      if (isBinary) {
        return `### 工具执行成功: \`read_file\`
- 文件: \`${path}\`
- 状态: 二进制文件，无法作为文本读取。`;
      }
      const lines = typeof content === 'string' ? content.split('\n').length : 0;
      return `### 工具执行成功: \`read_file\` (文件: \`${path}\`, 大小: ${size} 字节, 共 ${lines} 行)
文件当前实际内容如下:
\`\`\`
${content}
\`\`\``;
    }

    case 'trace_mobile_ui_source': {
      const r = outcome.result || {};
      const matches = (r.matches || []).slice(0, 30).map((m: any) => `  - \`${m.path}\` (第 ${m.line} 行, 查询 \`${m.query}\`): \`${m.text}\``).join('\\n');
      return `### 手机 UI 源码追踪完成: \`trace_mobile_ui_source\`
- 目标: \`${r.target || ''}\`
- 操作: ${r.action || '未知'}
- 检索关键词: ${(r.queries || []).join(', ') || '无'}
- 候选匹配: ${r.matchCount || 0}
${matches || '  - 未找到直接匹配'}
- 下一步: ${r.guidance || ''}`;
    }

    case 'search_code': {
      const { query, matchCount, matches } = outcome.result || {};
      if (!matches || matches.length === 0) {
        return `### 工具执行结果: \`search_code\`
- 搜索词: \`${query}\`
- 匹配结果: 未在任何工作区代码中找到匹配行。`;
      }
      const formattedMatches = (matches || []).slice(0, 30).map((m: any) => `  - \`${m.path}\` (第 ${m.line} 行): \`${m.text}\``).join('\n');
      return `### 工具执行结果: \`search_code\` (搜索词: \`${query}\`, 共匹配到 ${matchCount} 处)
匹配位置清单:
${formattedMatches}`;
    }

    case 'search_files': {
      const { query, matchedCount, files } = outcome.result || {};
      return `### 工具执行结果: \`search_files\` (搜索词: \`${query}\`, 匹配到 ${matchedCount} 个文件)
文件列表:
${(files || []).map((f: string) => `  - \`${f}\``).join('\n')}`;
    }

    case 'patch_file': {
      return `### 工具执行成功: \`patch_file\`
- 目标文件: \`${args.path}\`
- 执行状态: 局部代码块已精确替换，工作区文件已实时同步更新。`;
    }

    case 'write_file': {
      return `### 工具执行成功: \`write_file\`
- 目标文件: \`${args.path}\`
- 执行状态: 文件内容已全量写入并保存至工作区 (${outcome.result?.size || 0} 字节)。`;
    }

    case 'create_file': {
      return `### 工具执行成功: \`create_file\`
- 目标文件: \`${args.path}\`
- 执行状态: 新文件已成功创建在工作区。`;
    }

    case 'delete_file': {
      return `### 工具执行成功: \`delete_file\`
- 目标文件: \`${args.path}\`
- 执行状态: 文件已从工作区安全移除。`;
    }

    case 'list_files':
    case 'get_workspace_tree': {
      return `### 工具执行成功: \`${toolName}\`
工作区文件结构:
\`\`\`
${outcome.result?.tree || JSON.stringify(outcome.result?.files, null, 2)}
\`\`\``;
    }

    case 'inspect_project': {
      const result = outcome.result || {};
      return `### 项目运行时检查完成: \`inspect_project\`
- 项目类型: **${result.kind || 'unknown'}**
- 包管理器: ${result.packageManager || '无'}
- 清单: ${result.manifest || '无'}
- 可用脚本: ${(result.scripts || []).join(', ') || '无'}
- 推荐检查命令: ${(result.checkCommands || []).join(' | ') || '无'}
- 检查策略: ${result.checkStrategy || 'unknown'}
- 入口候选: ${(result.entrypoints || []).join(', ') || '无'}
- 运行时信号: ${(result.signals || []).join('；') || '无'}
> 这是后续安装依赖、构建、测试与修复的事实基线，不要凭经验猜测项目工具链。`;
    }

    case 'install_dependencies':
    case 'run_project_check': {
      const result = outcome.result || {};
      const command = result.command || args.command || '自动检查命令';
      const status = result.exitCode === 0 ? '通过' : '失败';
      return `### 项目运行命令结果: \`${toolName}\`
- 命令: \`${command}\`
- 状态: **${status}**
- 运行时: ${result.runtime || 'unknown'}
- 退出码: ${result.exitCode ?? 'unknown'}
- stdout:
\`\`\`
${result.stdout || '(空)'}
\`\`\`
- stderr:
\`\`\`
${result.stderr || '(空)'}
\`\`\`
- 错误: ${result.error || outcome.errorMessage || '无'}
> 若检查失败，优先定位 stdout/stderr 中的文件路径与行号，读取相关代码后修复，再重新执行检查；不要重复执行完全相同的失败命令而不改变代码。`;
    }

    case 'capture_project_runtime_screenshot': {
      const result = outcome.result || {};
      return '### 项目视觉检查截图已生成: capture_project_runtime_screenshot\n' +
        '- 工作区: ' + (result.workspaceId || '当前工作区') + '\n' +
        '- 图片尺寸: ' + (result.width || '?') + ' × ' + (result.height || '?') + '\n' +
        '- 视觉证据: 已作为图片附件注入下一轮模型上下文；不要仅根据文字猜测页面布局。';
    }

    case 'run_python':
    case 'run_command': {
      const result = outcome.result || {};
      return `### 运行时执行结果: \`${toolName}\`
- 运行时: ${result.runtime || 'unknown'}
- 退出码: ${result.exitCode ?? 'unknown'}
- stdout:
\`\`\`
${result.stdout || '(空)'}
\`\`\`
- stderr:
\`\`\`
${result.stderr || '(空)'}
\`\`\`
- 错误: ${result.error || outcome.errorMessage || '无'}`;
    }
    default: {
      return `### 工具执行成功: \`${toolName}\`
- 参数: \`${JSON.stringify(args)}\`
- 执行结果: ${JSON.stringify(outcome.result)}`;
    }
  }
}

// Extract tool calls from AI response string
export function extractToolCallsFromResponse(text: string): { tool: string; args: Record<string, any> }[] {
  const toolCalls: { tool: string; args: Record<string, any> }[] = [];

  // 1. Match ```tool_call ... ``` blocks
  const toolCallBlockRegex = /```(?:tool_call|json:tool_call|tool)\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = toolCallBlockRegex.exec(text)) !== null) {
    const rawJson = match[1].trim();
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && (item.tool || item.name)) {
            toolCalls.push({
              tool: item.tool || item.name,
              args: item.args || item.parameters || item.arguments || {},
            });
          }
        }
      } else if (parsed && (parsed.tool || parsed.name)) {
        toolCalls.push({
          tool: parsed.tool || parsed.name,
          args: parsed.args || parsed.parameters || parsed.arguments || {},
        });
      }
    } catch {
      // Continue to next match
    }
  }

  // 2. Fallback: match inline JSON object if markdown block was omitted
  if (toolCalls.length === 0) {
    const inlineJsonRegex = /\{\s*"tool"\s*:\s*"([a-zA-Z0-9_]+)"\s*,\s*"args"\s*:\s*(\{[\s\S]*?\})\s*\}/g;
    while ((match = inlineJsonRegex.exec(text)) !== null) {
      try {
        const toolName = match[1];
        const args = JSON.parse(match[2]);
        toolCalls.push({ tool: toolName, args });
      } catch {
        // Ignore
      }
    }
  }

  return toolCalls;
}

// Clean response text by removing tool_call blocks for neat presentation to user
export function cleanResponseText(text: string): string {
  return text
    .replace(/```(?:tool_call|json:tool_call|tool)\s*[\s\S]*?```/gi, '')
    .trim();
}

// Execute a Workspace tool strictly inside the bound Workspace
export async function executeWorkspaceTool(
  toolName: string,
  args: Record<string, any>,
  workspace: Workspace,
  agentTaskId?: string | null
): Promise<{
  result: any;
  updatedWorkspace: Workspace;
  diff?: { path: string; oldContent?: string; newContent?: string };
  errorMessage?: string;
  stepIcon: ThinkingStep['icon'];
  stepTitle: string;
}> {
  // Stop requests are checked before every Agent tool execution so a stopped task
  // cannot start another workspace mutation or runtime command.
  assertAgentTaskNotStopped(agentTaskId);

  let ws = { ...workspace, files: { ...workspace.files } };

  // Reconcile runtime-created files into the Agent's workspace view. Existing in-memory
  // files win so unsaved edits from the current Agent turn are never overwritten.
  if (typeof window !== 'undefined' && ws.id && ['list_files', 'get_workspace_tree', 'read_file', 'search_files', 'search_code'].includes(toolName)) {
    const runtimeFiles = await listWorkspaceFiles(ws.id);
    if (runtimeFiles) {
      for (const entry of runtimeFiles) {
        const existing = ws.files[entry.path];
        const runtimeIsNewer = !existing || ((entry.updatedAt || 0) > (existing.updatedAt || 0));
        if (!runtimeIsNewer) continue;
        const runtimeFile = await readWorkspaceFile(ws.id, entry.path);
        if (runtimeFile?.exists && typeof runtimeFile.content === 'string') {
          ws.files[entry.path] = { path: entry.path, content: runtimeFile.content, isBinary: false, size: entry.size || runtimeFile.content.length, updatedAt: entry.updatedAt || Date.now() };
        }
      }
    }
  }

  switch (toolName) {
    case 'list_files': {
      const prefix = args.path_prefix ? args.path_prefix.replace(/^\/+/, '').trim() : '';
      const list = Object.keys(ws.files)
        .filter(p => !prefix || p.startsWith(prefix))
        .sort()
        .map(p => ({ path: p, size: ws.files[p].size, isBinary: ws.files[p].isBinary }));

      return {
        result: { total: list.length, files: list },
        updatedWorkspace: ws,
        stepIcon: 'github',
        stepTitle: `审查工作区目录（共 ${list.length} 个文件）`,
      };
    }

    case 'get_workspace_tree': {
      const tree = getWorkspaceDirectoryTree(ws);
      return {
        result: { tree },
        updatedWorkspace: ws,
        stepIcon: 'github',
        stepTitle: `获取工作区文件树（${Object.keys(ws.files).length} 个文件）`,
      };
    }

    case 'read_file': {
      const pathVal = validateSafeRelativePath(args.path || '');
      if (!pathVal.valid) {
        return {
          result: null,
          updatedWorkspace: ws,
          errorMessage: pathVal.error,
          stepIcon: 'file',
          stepTitle: `读取文件拒绝: ${pathVal.error}`,
        };
      }

      const file = ws.files[pathVal.normalizedPath];
      if (!file) {
        return {
          result: null,
          updatedWorkspace: ws,
          errorMessage: `未找到文件: "${pathVal.normalizedPath}"`,
          stepIcon: 'file',
          stepTitle: `尝试读取文件: ${pathVal.normalizedPath} (未找到)`,
        };
      }

      if (file.isBinary) {
        return {
          result: { path: file.path, isBinary: true, message: '该文件为二进制文件，无法作为文本读取' },
          updatedWorkspace: ws,
          stepIcon: 'file',
          stepTitle: `读取文件: ${file.path} (二进制)`,
        };
      }

      let content = file.content;
      if (args.start_line || args.end_line) {
        const lines = content.split('\n');
        const start = Math.max(1, args.start_line || 1);
        const end = Math.min(lines.length, args.end_line || lines.length);
        content = lines.slice(start - 1, end).join('\n');
      }

      return {
        result: { path: file.path, size: file.size, content },
        updatedWorkspace: ws,
        stepIcon: 'code',
        stepTitle: `读取工作区文件: ${file.path}`,
      };
    }

    case 'search_files': {
      const query = String(args.query || '').toLowerCase();
      const matched = Object.keys(ws.files)
        .filter(p => p.toLowerCase().includes(query))
        .sort();

      return {
        result: { query, matchedCount: matched.length, files: matched },
        updatedWorkspace: ws,
        stepIcon: 'search',
        stepTitle: `搜索文件名: "${query}" (匹配 ${matched.length} 个)`,
      };
    }

    case 'search_code': {
      const query = String(args.query || '');
      const matches = searchWorkspaceCode(ws, query);
      return {
        result: { query, matchCount: matches.length, matches },
        updatedWorkspace: ws,
        stepIcon: 'search',
        stepTitle: `搜索代码库: "${query}" (匹配 ${matches.length} 处)`,
      };
    }

    case 'trace_mobile_ui_source': {
      const target = String(args.target || '').trim();
      const role = String(args.role || '').trim();
      const action = String(args.action || '').trim();
      const evidence = String(args.evidence || '').trim();
      const candidates = Array.from(new Set([
        target,
        target.replace(/^#/, ''),
        target.match(/data-testid=["']?([^"']+)/i)?.[1] || '',
        target.match(/[.#]([A-Za-z_][\w-]{2,})/)?.[1] || '',
        role === 'button' ? 'onClick' : '',
        role === 'textbox' ? 'onChange' : '',
        action === 'tap' ? 'onClick' : '',
        action === 'type' ? 'onChange' : '',
        /(submit|send|save|login|register|confirm|next|start|search|提交|发送|保存|登录|注册|确定|下一步|开始|搜索)/i.test(target) ? 'handleSubmit' : '',
        evidence.match(/(?:changedValues|appeared|disappeared)[^\n]*/i)?.[0] || '',
      ].filter(Boolean)));
      const allMatches: any[] = [];
      for (const query of candidates.slice(0, 6)) {
        const matches = searchWorkspaceCode(ws, query);
        for (const match of matches.slice(0, 12)) allMatches.push({ query, ...match });
      }
      const deduped = allMatches.filter((m, i, arr) =>
        i === arr.findIndex((x) => x.path === m.path && x.line === m.line)
      ).slice(0, 40);
      return {
        result: {
          target, role, action,
          queries: candidates.slice(0, 6),
          matchCount: deduped.length,
          matches: deduped,
          guidance: deduped.length
            ? '优先读取排名靠前的组件上下文，再追踪其事件处理器、状态更新与路由/条件渲染。'
            : '未找到直接匹配；应改用组件文件名、可见文案、data-testid 或事件函数名继续 search_code。',
        },
        updatedWorkspace: ws,
        stepIcon: 'search',
        stepTitle: `追踪手机 UI 源码: "${target}" (${deduped.length} 个候选)`,
      };
    }

    case 'patch_file': {
      const pathVal = validateSafeRelativePath(args.path || '');
      if (!pathVal.valid) {
        return {
          result: null,
          updatedWorkspace: ws,
          errorMessage: pathVal.error,
          stepIcon: 'code',
          stepTitle: `路径拒绝: ${pathVal.error}`,
        };
      }

      const filePath = pathVal.normalizedPath;
      const file = ws.files[filePath];
      if (!file) {
        return {
          result: null,
          updatedWorkspace: ws,
          errorMessage: `修改失败: 找不到文件 "${filePath}"`,
          stepIcon: 'code',
          stepTitle: `修改文件失败: 找不到 ${filePath}`,
        };
      }

      const original = file.content;
      const target = String(args.target_content || '');
      const replacement = String(args.replacement_content || '');

      if (!original.includes(target)) {
        // Fallback for line-ending normalization
        const normOriginal = original.replace(/\r\n/g, '\n');
        const normTarget = target.replace(/\r\n/g, '\n');
        if (normOriginal.includes(normTarget)) {
          const idx = normOriginal.indexOf(normTarget);
          const newContent = normOriginal.slice(0, idx) + replacement + normOriginal.slice(idx + normTarget.length);
          ws.files[filePath] = {
            ...file,
            content: newContent,
            size: newContent.length,
            updatedAt: Date.now(),
          };
          await writeWorkspaceFile(ws.id, filePath, newContent);
          return {
            result: { success: true, path: filePath },
            updatedWorkspace: ws,
            diff: { path: filePath, oldContent: target, newContent: replacement },
            stepIcon: 'code',
            stepTitle: `修改文件 (Patch): ${filePath}`,
          };
        }

        // Fallback for trimmed target block
        const trimmedTarget = normTarget.trim();
        if (trimmedTarget && normOriginal.includes(trimmedTarget)) {
          const idx = normOriginal.indexOf(trimmedTarget);
          const newContent = normOriginal.slice(0, idx) + replacement.trim() + normOriginal.slice(idx + trimmedTarget.length);
          ws.files[filePath] = {
            ...file,
            content: newContent,
            size: newContent.length,
            updatedAt: Date.now(),
          };
          return {
            result: { success: true, path: filePath },
            updatedWorkspace: ws,
            diff: { path: filePath, oldContent: target, newContent: replacement },
            stepIcon: 'code',
            stepTitle: `修改文件 (Patch 容错替换): ${filePath}`,
          };
        }

        return {
          result: null,
          updatedWorkspace: ws,
          errorMessage: `局部匹配失败: 在目标文件中未找到指定的精确代码块。建议先调用 read_file 重新读取该文件核对最新代码，或使用 write_file 直接写入。`,
          stepIcon: 'code',
          stepTitle: `精确修改 ${filePath} 匹配失败`,
        };
      }

      const idx = original.indexOf(target);
      const newContent = original.slice(0, idx) + replacement + original.slice(idx + target.length);
      ws.files[filePath] = {
        ...file,
        content: newContent,
        size: newContent.length,
        updatedAt: Date.now(),
      };
      await writeWorkspaceFile(ws.id, filePath, newContent);

      return {
        result: { success: true, path: filePath },
        updatedWorkspace: ws,
        diff: { path: filePath, oldContent: target, newContent: replacement },
        stepIcon: 'code',
        stepTitle: `修改文件 (Patch): ${filePath}`,
      };
    }

    case 'write_file': {
      const pathVal = validateSafeRelativePath(args.path || '');
      if (!pathVal.valid) {
        return {
          result: null,
          updatedWorkspace: ws,
          errorMessage: pathVal.error,
          stepIcon: 'code',
          stepTitle: `路径拒绝: ${pathVal.error}`,
        };
      }

      const filePath = pathVal.normalizedPath;
      const newContent = String(args.content || '');
      const existing = ws.files[filePath];
      const oldContent = existing ? existing.content : undefined;

      ws.files[filePath] = {
        path: filePath,
        content: newContent,
        isBinary: false,
        size: newContent.length,
        updatedAt: Date.now(),
      };
      await writeWorkspaceFile(ws.id, filePath, newContent);

      return {
        result: { success: true, path: filePath, size: newContent.length },
        updatedWorkspace: ws,
        diff: { path: filePath, oldContent, newContent },
        stepIcon: 'code',
        stepTitle: existing ? `覆盖修改文件: ${filePath}` : `新建写入文件: ${filePath}`,
      };
    }

    case 'create_file': {
      const pathVal = validateSafeRelativePath(args.path || '');
      if (!pathVal.valid) {
        return {
          result: null,
          updatedWorkspace: ws,
          errorMessage: pathVal.error,
          stepIcon: 'code',
          stepTitle: `创建路径拒绝: ${pathVal.error}`,
        };
      }

      const filePath = pathVal.normalizedPath;
      const initialContent = String(args.content || '');

      ws.files[filePath] = {
        path: filePath,
        content: initialContent,
        isBinary: false,
        size: initialContent.length,
        updatedAt: Date.now(),
      };
      await writeWorkspaceFile(ws.id, filePath, initialContent);

      return {
        result: { success: true, path: filePath },
        updatedWorkspace: ws,
        diff: { path: filePath, newContent: initialContent },
        stepIcon: 'code',
        stepTitle: `创建文件: ${filePath}`,
      };
    }

    case 'delete_file': {
      const pathVal = validateSafeRelativePath(args.path || '');
      if (!pathVal.valid) {
        return {
          result: null,
          updatedWorkspace: ws,
          errorMessage: pathVal.error,
          stepIcon: 'code',
          stepTitle: `删除路径拒绝: ${pathVal.error}`,
        };
      }

      const filePath = pathVal.normalizedPath;
      const existing = ws.files[filePath];
      if (existing) {
        delete ws.files[filePath];
        await deleteAndroidWorkspaceFile(ws.id, filePath);
      }

      return {
        result: { success: !!existing, path: filePath },
        updatedWorkspace: ws,
        diff: existing ? { path: filePath, oldContent: existing.content } : undefined,
        stepIcon: 'code',
        stepTitle: existing ? `删除工作区文件: ${filePath}` : `尝试删除不存在的文件: ${filePath}`,
      };
    }

    case 'rename_file': {
      const oldVal = validateSafeRelativePath(args.old_path || '');
      const newVal = validateSafeRelativePath(args.new_path || '');
      if (!oldVal.valid || !newVal.valid) {
        const err = oldVal.error || newVal.error;
        return {
          result: null,
          updatedWorkspace: ws,
          errorMessage: err,
          stepIcon: 'code',
          stepTitle: `重命名路径拒绝: ${err}`,
        };
      }

      const oldF = ws.files[oldVal.normalizedPath];
      if (!oldF) {
        return {
          result: null,
          updatedWorkspace: ws,
          errorMessage: `找不到原文件: "${oldVal.normalizedPath}"`,
          stepIcon: 'code',
          stepTitle: `重命名失败: 找不到 ${oldVal.normalizedPath}`,
        };
      }

      delete ws.files[oldVal.normalizedPath];
      ws.files[newVal.normalizedPath] = {
        ...oldF,
        path: newVal.normalizedPath,
        updatedAt: Date.now(),
      };
      await deleteAndroidWorkspaceFile(ws.id, oldVal.normalizedPath);
      await writeWorkspaceFile(ws.id, newVal.normalizedPath, oldF.content);

      return {
        result: { success: true, from: oldVal.normalizedPath, to: newVal.normalizedPath },
        updatedWorkspace: ws,
        stepIcon: 'code',
        stepTitle: `重命名文件: ${oldVal.normalizedPath} -> ${newVal.normalizedPath}`,
      };
    }

    case 'get_file_diff': {
      const pathVal = validateSafeRelativePath(args.path || '');
      const filePath = pathVal.normalizedPath;
      const originalFile = ws.originalSnapshot.files[filePath];
      const currentFile = ws.files[filePath];

      return {
        result: {
          path: filePath,
          originalExists: !!originalFile,
          currentExists: !!currentFile,
          isModified: originalFile?.content !== currentFile?.content,
          originalContentSample: originalFile?.content?.slice(0, 1000),
          currentContentSample: currentFile?.content?.slice(0, 1000),
        },
        updatedWorkspace: ws,
        stepIcon: 'code',
        stepTitle: `查阅文件改动对比: ${filePath}`,
      };
    }

    case 'get_workspace_diff': {
      const diffs = computeDiffBetweenFileSnapshots(ws.originalSnapshot.files, ws.files);
      return {
        result: {
          totalModified: diffs.length,
          modifiedList: diffs.map(d => ({ path: d.path, type: d.type })),
        },
        updatedWorkspace: ws,
        stepIcon: 'code',
        stepTitle: `检查工作区整体改动差异 (${diffs.length} 个文件变动)`,
      };
    }

    case 'query_context7_docs': {
      const library = String(args.library || '').trim();
      const topic = String(args.topic || args.query || '').trim();
      const queryStr = topic ? `${library} ${topic}` : library;

      if (!queryStr) {
        return {
          result: null,
          updatedWorkspace: ws,
          errorMessage: 'Context7 查询为空。',
          stepIcon: 'search',
          stepTitle: 'Context7 查询失败：缺少库名或查询内容',
        };
      }

      try {
        const res = await fetch('/api/context7/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: queryStr, library }),
        });
        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          const errorMessage = payload?.error || `Context7 请求失败（HTTP ${res.status}）。`;
          return {
            result: { library, topic, source: 'Context7', error: errorMessage, status: res.status },
            updatedWorkspace: ws,
            errorMessage,
            stepIcon: 'search',
            stepTitle: `Context7 查询失败: [${library}]`,
          };
        }

        return {
          result: {
            library,
            topic,
            source: 'Context7 official documentation search',
            docs: payload,
          },
          updatedWorkspace: ws,
          stepIcon: 'search',
          stepTitle: `Context7 已检索官方文档: [${library}]${topic ? ` / ${topic}` : ''}`,
        };
      } catch (error: any) {
        const errorMessage = error?.message || '无法连接到 Context7 服务。';
        return {
          result: { library, topic, source: 'Context7', error: errorMessage },
          updatedWorkspace: ws,
          errorMessage,
          stepIcon: 'search',
          stepTitle: `Context7 连接失败: [${library}]`,
        };
      }
    }

    case 'inspect_project': {
      const info = inspectProjectRuntime(ws);
      const report = JSON.parse(buildProjectRuntimeReport(ws)) as Record<string, any>;
      if (info.kind === 'node') {
        const runtimeState = await getWorkspaceNodeRuntimeState(ws.id);
        report.androidWorkspaceRuntime = runtimeState || {
          available: false,
          reason: '当前运行环境未暴露 Android workspace runtime 状态接口',
        };
        report.dependencies = runtimeState
          ? {
              status: runtimeState.dependenciesInSync
                ? 'in-sync'
                : runtimeState.nodeModulesExists
                  ? 'stale'
                  : 'missing',
              nodeModulesCount: runtimeState.nodeModulesCount,
              persistent: runtimeState.runtimePersistent,
              packageLockExists: runtimeState.packageLockExists,
              lockfile: runtimeState.lockfile,
              dependencyFingerprint: runtimeState.dependencyFingerprint,
              installedDependencyFingerprint: runtimeState.installedDependencyFingerprint,
              dependenciesInSync: runtimeState.dependenciesInSync,
            }
          : { status: 'unknown' };
      }
      return {
        result: report,
        updatedWorkspace: ws,
        stepIcon: 'search',
        stepTitle: '识别项目运行时: ' + info.kind,
      };
    }

    case 'check_runtime': {
      const capabilities = await getAgentRuntimeCapabilities();
      const checks = [
        { name: 'node', command: 'node --version' },
        { name: 'npm', command: 'npm --version' },
        { name: 'npm-lifecycle-node', command: 'npm exec -- node --version' },
      ];
      const results: Array<Record<string, any>> = [];
      for (const check of checks) {
        const runData = await executeAgentRuntime({
          language: 'shell',
          sourceOrCommand: check.command,
          timeoutMs: 30_000,
          workspaceId: ws.id,
        });
        results.push({
          name: check.name,
          command: check.command,
          success: runData.success,
          stdout: runData.stdout,
          stderr: runData.stderr,
          exitCode: runData.exitCode,
          error: runData.error,
          runtime: runData.runtime,
        });
        if (!runData.success) break;
      }

      const failed = results.find(item => !item.success);
      const result = {
        runtime: capabilities.runtime,
        platform: capabilities.platform,
        capabilities,
        supported: !failed,
        checks: results,
        summary: failed
          ? `运行时检查失败: ${failed.name}`
          : '统一 Agent Runtime 的 Node.js、npm 与 Shell 检查均通过',
      };
      if (!failed) {
        return {
          result,
          updatedWorkspace: ws,
          stepIcon: 'code',
          stepTitle: '统一 Agent Runtime 检查通过',
        };
      }
      return {
        result,
        updatedWorkspace: ws,
        errorMessage: `${result.summary}。请根据 stderr/stdout 定位运行时问题，不要直接修改业务代码。`,
        stepIcon: 'lightning',
        stepTitle: result.summary,
      };
    }

    case 'install_dependencies': {
      const info = inspectProjectRuntime(ws);
      if (!info.dependencyInstallCommand) {
        return {
          result: { kind: info.kind, installed: false, reason: '当前项目没有可安全自动安装的依赖命令。' },
          updatedWorkspace: ws,
          errorMessage: info.packageManager && info.packageManager !== 'npm'
            ? `当前检测到 ${info.packageManager}，Android runtime 目前只保证 npm；不会错误地用 npm install 替代 ${info.packageManager}。`
            : '当前项目类型暂不支持自动依赖安装，请根据项目实际工具链处理。',
          stepIcon: 'code',
          stepTitle: '依赖安装暂不支持: ' + info.kind,
        };
      }
      const beforeState = await getWorkspaceNodeRuntimeState(ws.id);
      if (
        beforeState?.dependenciesInSync === true &&
        beforeState.nodeModulesExists &&
        beforeState.dependencyFingerprint
      ) {
        return {
          result: {
            command: info.dependencyInstallCommand,
            skipped: true,
            reason: '当前 package.json/lockfile 与上次成功安装的依赖指纹一致，复用现有 node_modules。',
            dependencyState: beforeState,
          },
          updatedWorkspace: ws,
          stepIcon: 'code',
          stepTitle: '依赖未变化，复用现有 node_modules',
        };
      }

      const runData = await installAgentDependencies(ws.id, 120_000);
      let afterState = await getWorkspaceNodeRuntimeState(ws.id);
      let installRecord: { ok: boolean; fingerprint?: string; error?: string } | null = null;
      let generatedLockfileSynced = false;
      if (runData.success && info.packageManager === 'npm' && !ws.files['package-lock.json']) {
        const generated = await readWorkspaceFile(ws.id, 'package-lock.json');
        if (generated?.ok && generated.exists && typeof generated.content === 'string') {
          const now = Date.now();
          ws.files['package-lock.json'] = {
            path: 'package-lock.json',
            content: generated.content,
            size: new TextEncoder().encode(generated.content).length,
            updatedAt: now,
          };
          generatedLockfileSynced = true;
        }
      }
      if (runData.success && afterState?.nodeModulesExists) {
        installRecord = await markWorkspaceDependenciesInstalled(ws.id);
        afterState = await getWorkspaceNodeRuntimeState(ws.id);
      }
      if (runData.success) {
        return {
          result: {
            command: info.dependencyInstallCommand,
            stdout: runData.stdout,
            stderr: runData.stderr,
            exitCode: runData.exitCode,
            runtime: runData.runtime,
            dependencyState: {
              before: beforeState,
              after: afterState,
              persisted: !!afterState?.nodeModulesExists,
              fingerprintRecorded: installRecord?.ok === true,
              fingerprint: installRecord?.fingerprint || afterState?.installedDependencyFingerprint || null,
              generatedLockfileSynced,
            },
          },
          updatedWorkspace: ws, stepIcon: 'lightning',
          stepTitle: generatedLockfileSynced
            ? '依赖安装成功，并已把 Android 生成的 package-lock.json 同步回工作区'
            : afterState?.dependenciesInSync
            ? '依赖安装成功，依赖指纹已记录；后续无变化时将复用 node_modules'
            : afterState?.nodeModulesExists
              ? '依赖安装成功，但未确认依赖指纹持久化'
              : '依赖安装成功，但未确认 node_modules 持久化',
        };
      }
      const failureCategory = (runData as any).failureCategory || 'unknown';
      const recoveredPreviousDependencies = (runData as any).recoveredPreviousDependencies === true;
      const categoryHint: Record<string, string> = {
        permission: '权限/文件访问问题',
        network: '网络或 registry 访问问题',
        timeout: '安装超时',
        'package-not-found': '依赖包不存在或 registry 返回 404',
        'dependency-conflict': '依赖版本或 peer dependency 冲突',
        'native-module': '原生模块编译/预构建二进制问题',
        'missing-runtime-file': '运行时文件缺失',
        unknown: '未分类 npm 错误',
      };
      const diagnostic = categoryHint[failureCategory] || categoryHint.unknown;
      return {
        result: {
          command: info.dependencyInstallCommand,
          stdout: runData.stdout,
          stderr: runData.stderr,
          exitCode: runData.exitCode,
          error: runData.error,
          runtime: runData.runtime,
          failureCategory,
          diagnosis: diagnostic,
          recoveredPreviousDependencies,
        },
        updatedWorkspace: ws,
        errorMessage: (runData.error || runData.stderr || ('依赖安装失败，退出码: ' + runData.exitCode)) + '。分类：' + diagnostic + '。' + (recoveredPreviousDependencies ? '已自动恢复安装前的 node_modules，当前项目依赖未被本次失败安装破坏。' : '未检测到可恢复的旧 node_modules，请先处理安装错误再继续。'),
        stepIcon: 'lightning',
        stepTitle: '依赖安装失败：' + diagnostic,
      };
    }

    case 'run_project_check': {
      const info = inspectProjectRuntime(ws);
      const requested = String(args.command || '').trim();
      if (info.checkStrategy === 'unsupported') {
        return {
          result: { kind: info.kind, checked: false, supported: false, reason: info.signals.join('；') },
          updatedWorkspace: ws,
          errorMessage: `当前 Android runtime 不支持 ${info.kind} 项目的自动检查。请不要反复执行不可用工具链。`,
          stepIcon: 'search',
          stepTitle: `项目检查不可用: ${info.kind}`,
        };
      }

      if (info.checkStrategy === 'python_source' && !requested) {
        const runData = await executeAgentRuntime({
          language: 'python',
          sourceOrCommand: `import compileall\nimport sys\nok = compileall.compile_dir('.', quiet=1, maxlevels=99)\nsys.exit(0 if ok else 1)`,
          timeoutMs: 120_000,
          workspaceId: ws.id,
        });
        const result = {
          command: 'Python compileall',
          stdout: runData.stdout,
          stderr: runData.stderr,
          exitCode: runData.exitCode,
          error: runData.error,
          runtime: runData.runtime,
        };
        if (runData.success) return { result, updatedWorkspace: ws, stepIcon: 'code', stepTitle: '项目检查通过: Python compileall' };
        return {
          result,
          updatedWorkspace: ws,
          errorMessage: runData.error || runData.stderr || `Python 项目检查失败，退出码: ${runData.exitCode}`,
          stepIcon: 'lightning',
          stepTitle: '项目检查失败: Python compileall',
        };
      }

      const command = requested || info.checkCommands[0];
      if (!command) {
        return {
          result: { kind: info.kind, checked: false, reason: '未找到可执行的项目检查命令。' },
          updatedWorkspace: ws, errorMessage: '未识别到可执行的项目检查命令。',
          stepIcon: 'search', stepTitle: '项目检查跳过: 未找到检查命令',
        };
      }
      const runData = await executeAgentRuntime({ language: 'shell', sourceOrCommand: command, timeoutMs: 120_000, workspaceId: ws.id });
      const result = { command, stdout: runData.stdout, stderr: runData.stderr, exitCode: runData.exitCode, error: runData.error, runtime: runData.runtime };
      if (runData.success) return { result, updatedWorkspace: ws, stepIcon: 'code', stepTitle: '项目检查通过: ' + command };
      return {
        result, updatedWorkspace: ws,
        errorMessage: runData.error || runData.stderr || ('项目检查失败，退出码: ' + runData.exitCode),
        stepIcon: 'lightning', stepTitle: '项目检查失败: ' + command,
      };
    }

    case 'start_project_runtime': {
      const state = startProjectRuntime(ws);
      const result = { supported: state.supported, running: state.running, status: state.status, port: state.port, pid: state.pid, command: state.command, stderr: state.stderr };
      if (state.status === 'error' || !state.supported) return { result, updatedWorkspace: ws, errorMessage: state.stderr || '当前项目无法通过 Android Agent Runtime 启动。', stepIcon: 'lightning', stepTitle: '项目运行启动失败' };
      return { result, updatedWorkspace: ws, stepIcon: 'lightning', stepTitle: state.port ? '项目已启动，HTTP 端口: ' + state.port : '项目进程已启动，等待检测端口' };
    }

    case 'inspect_project_runtime': {
      const diagnostics = getProjectRuntimeDiagnostics(ws.id);
      const result = { ...diagnostics, runtime: { ...diagnostics.runtime, stdout: undefined, stderr: undefined } };
      if (!diagnostics.healthy) return { result, updatedWorkspace: ws, errorMessage: diagnostics.diagnosis, stepIcon: 'lightning', stepTitle: '项目运行诊断：' + diagnostics.diagnosis.slice(0, 80) };
      return { result, updatedWorkspace: ws, stepIcon: 'code', stepTitle: '项目运行正常' + (diagnostics.health?.latencyMs != null ? ' · ' + diagnostics.health.latencyMs + 'ms' : '') };
    }

    case 'restart_project_runtime': {
      stopProjectRuntime(ws.id);
      const state = startProjectRuntime(ws);
      const diagnostics = getProjectRuntimeDiagnostics(ws.id);
      const result = { restart: true, state, diagnostics };
      if (!diagnostics.healthy && state.status === 'error') return { result, updatedWorkspace: ws, errorMessage: diagnostics.diagnosis, stepIcon: 'lightning', stepTitle: '项目重启失败' };
      return { result, updatedWorkspace: ws, stepIcon: 'lightning', stepTitle: diagnostics.healthy ? '项目重启并健康检查通过' : '项目已重启，等待进一步诊断' };
    }

    case 'stop_project_runtime': {
      stopProjectRuntime(ws.id);
      return { result: { stopped: true, workspaceId: ws.id }, updatedWorkspace: ws, stepIcon: 'code', stepTitle: '已停止项目运行进程' };
    }

    case 'capture_project_runtime_screenshot': {
      const screenshot = captureProjectRuntimeScreenshot(ws.id, 72, 'mobile');
      if (!screenshot.success || !screenshot.dataUrl) {
        return { result: { success: false, error: screenshot.error || '项目预览截图失败' }, updatedWorkspace: ws, errorMessage: screenshot.error || '项目预览截图失败', stepIcon: 'lightning', stepTitle: '项目视觉检查失败' };
      }
      return { result: { success: true, workspaceId: ws.id, width: screenshot.width, height: screenshot.height, dataUrl: screenshot.dataUrl }, updatedWorkspace: ws, stepIcon: 'code', stepTitle: '已截取真实项目预览画面，准备交给视觉模型检查' };
    }

    case 'interact_project_preview': {
      const action = String(args.action || '').trim() as any;
      if (!['tap', 'type', 'scroll', 'back', 'wait'].includes(action)) {
        return { result: null, updatedWorkspace: ws, errorMessage: '不支持的手机交互动作', stepIcon: 'lightning', stepTitle: '手机预览交互参数无效' };
      }
      const interaction = interactProjectPreview(ws.id, action, {
        target: typeof args.target === 'string' ? args.target : undefined,
        value: typeof args.value === 'string' ? args.value : undefined,
        x: typeof args.x === 'number' ? args.x : undefined,
        y: typeof args.y === 'number' ? args.y : undefined,
      });
      const result = { ...interaction, workspaceId: ws.id, viewport: 'mobile-390x780' };
      if (!interaction.success) {
        return { result, updatedWorkspace: ws, errorMessage: interaction.error || '手机预览交互失败', stepIcon: 'lightning', stepTitle: '手机预览交互失败' };
      }
      return { result, updatedWorkspace: ws, stepIcon: 'code', stepTitle: '手机预览交互成功 · ' + action };
    }

    case 'discover_mobile_preview': {
      const discovery = discoverProjectPreviewElements(ws.id);
      const screenshot = captureProjectRuntimeScreenshot(ws.id, 72, 'mobile');
      const result = {
        ...discovery,
        viewport: 'mobile-390x780',
        screenshot: screenshot.success ? {
          width: screenshot.width,
          height: screenshot.height,
          dataUrl: screenshot.dataUrl,
        } : null,
        screenshotError: screenshot.success ? undefined : screenshot.error,
        planningHint: discovery.success
          ? '优先选择一个主要按钮/链接和一个可输入控件，规划不超过 8 步的点击→输入→提交→等待→截图流程；若页面存在滚动内容，再加入一次滚动。'
          : discovery.crossOrigin
            ? 'iframe 跨域，不能伪造 DOM 元素。请使用返回的真实截图进行视觉判断，并用 390×780 坐标执行关键路径；坐标点击后必须截图验证。'
            : '元素发现失败。先检查项目运行状态，再决定是否使用截图+坐标进行手机验证。',
      };
      if (!discovery.success && !screenshot.success) {
        return { result, updatedWorkspace: ws, errorMessage: discovery.error || screenshot.error || '手机预览发现失败', stepIcon: 'lightning', stepTitle: '手机预览元素发现失败' };
      }
      return { result, updatedWorkspace: ws, stepIcon: 'code', stepTitle: discovery.success ? `发现 ${discovery.count || 0} 个手机可交互元素` : '手机预览为跨域模式，已返回真实截图供视觉规划' };
    }

    case 'auto_test_mobile_preview': {
      const maxSteps = Math.max(2, Math.min(8, Number(args.maxSteps) || 6));
      const includeScroll = args.includeScroll !== false;
      const discovery = discoverProjectPreviewElements(ws.id);
      const baseline = captureProjectRuntimeScreenshot(ws.id, 72, 'mobile');
      type PlannedStep = { action: 'tap' | 'type' | 'scroll' | 'back' | 'wait'; target?: string; value?: string; x?: number; y?: number };
      const plan: PlannedStep[] = [];
      if (discovery.success && discovery.elements?.length) {
        const elements = discovery.elements.filter((e: any) => !e.disabled && e.visible !== false);
        const textOf = (e: any) => String(e.text || '') + ' ' + String(e.aria || '') + ' ' + String(e.title || '');
        const input = elements.find((e: any) => ['input', 'textarea'].includes(e.tag) && e.type !== 'hidden');
        const submitPattern = /提交|保存|发送|登录|注册|确定|下一步|开始|搜索|继续|确认|创建|购买|send|submit|save|login|sign|next|start|search|continue|confirm|create/i;
        const secondaryPattern = /取消|返回|关闭|菜单|设置|更多|删除|cancel|back|close|menu|settings|more|delete/i;
        const scoreAction = (e: any) => {
          const text = textOf(e);
          let score = 0;
          if (e.tag === 'button' || e.role === 'button') score += 8;
          if (e.tag === 'a' || e.role === 'link') score += 3;
          if (e.type === 'submit') score += 12;
          if (submitPattern.test(text)) score += 18;
          if (secondaryPattern.test(text)) score -= 8;
          if (e.width >= 120) score += 3;
          if (e.height >= 36) score += 2;
          const centerY = Number(e.y || 0) + Number(e.height || 0) / 2;
          if (centerY > 260 && centerY < 720) score += 2;
          return score;
        };
        const actionCandidates = elements
          .filter((e: any) => ['button', 'a'].includes(e.tag) || ['button', 'link'].includes(e.role || ''))
          .map((e: any) => ({ e, score: scoreAction(e), text: textOf(e) }))
          .sort((a: any, b: any) => b.score - a.score);

        // 不是只测一条“第一个按钮”路径：从真实元素中挑选主 CTA + 第二独立交互，
        // 尽量覆盖表单/主操作、导航/菜单等不同区域；明确破坏性操作永不自动点击。
        const destructivePattern = /删除|移除|清空|退出账号|注销|重置|永久|delete|remove|clear|logout|reset|destroy/i;
        const safeCandidates = actionCandidates.filter((candidate: any) => !destructivePattern.test(candidate.text));
        const action = safeCandidates[0]?.e || actionCandidates[0]?.e || elements[0];
        const secondary = safeCandidates.find((candidate: any) => {
          if (!action) return false;
          const e = candidate.e;
          if (e === action) return false;
          if (action.selector && e.selector) return action.selector !== e.selector;
          return Math.abs((e.x || 0) - (action.x || 0)) > 8 || Math.abs((e.y || 0) - (action.y || 0)) > 8;
        })?.e;

        const addTap = (e: any) => {
          if (!e) return;
          if (e.selector) plan.push({ action: 'tap', target: e.selector });
          else plan.push({ action: 'tap', x: e.x + e.width / 2, y: e.y + e.height / 2 });
        };
        const inputAction = input && action && (
          input.selector && action.selector
            ? input.selector === action.selector
            : Math.abs((input.x || 0) - (action.x || 0)) < 4 && Math.abs((input.y || 0) - (action.y || 0)) < 4
        ) ? secondary : action;

        // 第一条路径：输入（若存在）→ 主 CTA → 等待，验证表单/提交状态。
        if (input?.selector) {
          plan.push({ action: 'tap', target: input.selector });
          plan.push({ action: 'type', target: input.selector, value: 'MyChat mobile test' });
        } else if (input) {
          plan.push({ action: 'tap', x: input.x + input.width / 2, y: input.y + input.height / 2 });
          plan.push({ action: 'type', value: 'MyChat mobile test' });
        }
        addTap(inputAction);
        if (inputAction) plan.push({ action: 'wait', value: '500' });

        // 第二条路径：滚动后尝试一个与主操作空间不同的安全交互。
        if (includeScroll) {
          plan.push({ action: 'scroll', value: '480' });
          if (secondary && secondary !== inputAction) {
            addTap(secondary);
            plan.push({ action: 'wait', value: '500' });
          }
        }
      } else if (baseline.success && discovery.crossOrigin) {
        plan.push({ action: 'tap', x: 195, y: 390 });
        plan.push({ action: 'wait', value: '500' });
        if (includeScroll) plan.push({ action: 'scroll', value: '480' });
      }
      // 去重连续等待，避免有限步数被无意义等待占用；优先保留真实交互和滚动。
      const normalizedPlan = plan.filter((step: PlannedStep, index: number, arr: PlannedStep[]) => (
        step.action !== 'wait' || (index > 0 && arr[index - 1]?.action !== 'wait')
      ));
      const steps = normalizedPlan.slice(0, maxSteps);
      if (!steps.length) {
        const error = discovery.error || baseline.error || '没有足够的真实页面证据生成手机测试路径。';
        return { result: { success: false, viewport: 'mobile-390x780', discovery, plan, error }, updatedWorkspace: ws, errorMessage: error, stepIcon: 'lightning', stepTitle: '手机自测无法生成测试路径' };
      }
      const summarizeMobileState = (state: any) => {
        if (!state?.success) return { success: false, crossOrigin: state?.crossOrigin === true, error: state?.error || null };
        const elements = Array.isArray(state.elements) ? state.elements : [];
        return {
          success: true,
          count: state.count ?? elements.length,
          activeTag: state.activeTag || null,
          activeText: state.activeText || null,
          scrollTop: state.scrollTop ?? null,
          scrollHeight: state.scrollHeight ?? null,
          clientHeight: state.clientHeight ?? null,
          visibleElements: elements.slice(0, 30).map((e: any) => ({
            tag: e.tag, role: e.role, type: e.type, text: String(e.text || '').slice(0, 80),
            value: String(e.value || '').slice(0, 80), focused: e.focused === true, disabled: e.disabled === true,
            x: e.x, y: e.y, width: e.width, height: e.height,
          })),
        };
      };
      const baselineState = summarizeMobileState(discovery);
      const diffMobileState = (before: any, after: any) => {
        if (!before?.success || !after?.success) return { comparable: false, reason: 'DOM 不可访问或元素发现失败' };
        const beforeMap = new Map<string, any>((before.visibleElements || []).map((e: any) => [`${e.tag}|${e.role}|${e.text}|${e.x}|${e.y}`, e]));
        const afterMap = new Map<string, any>((after.visibleElements || []).map((e: any) => [`${e.tag}|${e.role}|${e.text}|${e.x}|${e.y}`, e]));
        const changedValues: any[] = [];
        for (const [key, beforeItem] of beforeMap) {
          const afterItem = afterMap.get(key);
          if (afterItem && (beforeItem.value !== afterItem.value || beforeItem.focused !== afterItem.focused || beforeItem.disabled !== afterItem.disabled)) {
            changedValues.push({ key, before: { value: beforeItem.value, focused: beforeItem.focused, disabled: beforeItem.disabled }, after: { value: afterItem.value, focused: afterItem.focused, disabled: afterItem.disabled } });
          }
        }
        return {
          comparable: true,
          elementCountChanged: (before.count ?? 0) !== (after.count ?? 0),
          scrollChanged: before.scrollTop !== after.scrollTop,
          activeChanged: before.activeTag !== after.activeTag || before.activeText !== after.activeText,
          changedValues: changedValues.slice(0, 12),
          appeared: after.visibleElements.filter((e: any) => !before.visibleElements.some((b: any) => b.tag === e.tag && b.role === e.role && b.type === e.type && b.text === e.text && b.aria === e.aria)).slice(0, 12),
          disappeared: before.visibleElements.filter((e: any) => !after.visibleElements.some((a: any) => a.tag === e.tag && a.role === e.role && a.type === e.type && a.text === e.text && a.aria === e.aria)).slice(0, 12),
          visibleElementCountBefore: before.count ?? 0,
          visibleElementCountAfter: after.count ?? 0,
        };
      };
      const buildExpectation = (step: any, before: any) => {
        const text = String(step?.target || '').toLowerCase();
        const action = String(step?.action || '');
        const expectsInput = action === 'type';
        const expectsScroll = action === 'scroll';
        const expectsStateChange = ['tap', 'type', 'back', 'scroll'].includes(action);
        const semantic = {
          primaryAction: /(submit|send|save|login|register|confirm|next|start|search|提交|发送|保存|登录|注册|确定|下一步|开始|搜索)/i.test(text),
          overlay: /(dialog|modal|popup|弹窗|对话框)/i.test(text),
        };
        return {
          expectsInput,
          expectsScroll,
          expectsStateChange,
          semantic,
          target: text || null,
          baselineScrollTop: before?.scrollTop ?? null,
          baselineElementCount: before?.count ?? null,
          rule: semantic.overlay
            ? '弹窗类操作后应出现或消失相关结构'
            : semantic.primaryAction
              ? '主要操作后应出现内容、结构、焦点或值变化'
              : expectsInput
            ? '输入后应观察到焦点或输入值变化'
            : expectsScroll
              ? '滚动后应观察到 scrollTop 变化，若已到边界允许无变化'
              : expectsStateChange
                ? '交互后应观察到结构化 UI 状态变化；无变化时标记为可能无响应'
                : '无需强制状态断言',
        };
      };
      const evaluateExpectation = (expectation: any, delta: any, after: any) => {
        if (!expectation.expectsStateChange) return { status: 'not-applicable', reason: '该动作不要求状态断言' };
        if (!delta?.comparable) return { status: 'needs-vision', reason: 'DOM 状态不可比较，需要视觉模型复核' };
        if (expectation.expectsInput) {
          const inputChanged = Array.isArray(delta.changedValues) && delta.changedValues.some((x: any) => x.before?.value !== x.after?.value);
          return inputChanged || delta.activeChanged
            ? { status: 'passed', reason: '检测到输入值或焦点变化' }
            : { status: 'failed', reason: '输入动作后未检测到输入值/焦点变化' };
        }
        if (expectation.expectsScroll) {
          return delta.scrollChanged
            ? { status: 'passed', reason: '检测到 scrollTop 变化' }
            : { status: 'inconclusive', reason: (after?.scrollHeight ?? 0) <= (after?.clientHeight ?? 0) ? '页面没有可滚动高度，滚动无变化可接受' : '存在可滚动内容但 scrollTop 未变化' };
        }
        const structuralChange = delta.elementCountChanged || delta.activeChanged || (delta.changedValues?.length > 0) || (delta.appeared?.length > 0) || (delta.disappeared?.length > 0);
        if (expectation.semantic.overlay) {
          return delta.appeared?.length > 0 || delta.disappeared?.length > 0
            ? { status: 'passed', reason: '检测到弹窗相关结构出现或消失' }
            : { status: 'failed', reason: '预期弹窗状态变化，但未检测到结构变化' };
        }
        if (expectation.semantic.primaryAction) {
          return structuralChange
            ? { status: 'passed', reason: '检测到主要操作后的结构、焦点或值变化' }
            : { status: 'failed', reason: '主要操作成功但未检测到状态/内容/结构变化' };
        }
        return structuralChange
          ? { status: 'passed', reason: '检测到元素数量、焦点、值或元素出现/消失变化' }
          : { status: 'failed', reason: '交互成功但未检测到结构化状态变化；可能点击未生效' };
      };
      const evidence: Array<Record<string, any>> = [];
      let failedAt = -1;
      let failure: string | undefined;
      evidence.push({ index: 0, phase: 'baseline', screenshot: baseline.success ? { width: baseline.width, height: baseline.height, dataUrl: baseline.dataUrl } : null, screenshotError: baseline.success ? undefined : baseline.error });
      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        const beforeState = i === 0 ? baselineState : summarizeMobileState(discoverProjectPreviewElements(ws.id));
        const interaction = interactProjectPreview(ws.id, step.action as any, { target: step.target, value: step.value, x: step.x, y: step.y });
        const afterState = summarizeMobileState(discoverProjectPreviewElements(ws.id));
        const stateDelta = diffMobileState(beforeState, afterState);
        const expectation = buildExpectation(step, beforeState);
        const assertion = evaluateExpectation(expectation, stateDelta, afterState);
        const item: Record<string, any> = {
          index: i + 1,
          action: step,
          interaction,
          viewport: 'mobile-390x780',
          diagnosis: {
            target: step.target || (typeof step.x === 'number' && typeof step.y === 'number' ? { x: step.x, y: step.y } : null),
            selectorUsed: Boolean(step.target),
            coordinateFallback: !step.target && typeof step.x === 'number' && typeof step.y === 'number',
            interactionSucceeded: interaction.success === true,
            structuredStateComparable: stateDelta.comparable === true,
            stateChanged: stateDelta.comparable === true && (stateDelta.elementCountChanged || stateDelta.scrollChanged || stateDelta.activeChanged || (stateDelta.changedValues?.length ?? 0) > 0),
          },
          stateBefore: beforeState,
          stateAfter: afterState,
          stateDelta,
          expectation,
          assertion,
        };
        const shot = captureProjectRuntimeScreenshot(ws.id, 72, 'mobile');
        item.screenshot = shot.success ? { width: shot.width, height: shot.height, dataUrl: shot.dataUrl } : null;
        item.screenshotError = shot.success ? undefined : shot.error;
        // 截图变化只作为“是否值得进一步判断”的证据，不把像素差直接当成业务成功。
        // 同一截图可用 dataURL 长度做廉价指纹，避免引入图像库；真正的视觉结论仍交给 Agent。
        const previousShot = evidence[evidence.length - 1]?.screenshot;
        if (shot.success && previousShot?.dataUrl) {
          const previousUrl = String(previousShot.dataUrl);
          const currentUrl = String(shot.dataUrl);
          const sample = (url: string) => url.length > 160 ? url.slice(0, 80) + url.slice(-80) : url;
          item.visualDelta = {
            changed: sample(previousUrl) !== sample(currentUrl) || previousUrl.length !== currentUrl.length,
            previousBytesApprox: previousUrl.length,
            currentBytesApprox: currentUrl.length,
          };
          item.visualVerificationHint = item.visualDelta.changed
            ? '截图存在可检测差异；请结合页面语义判断这是预期状态变化还是布局/渲染异常。'
            : '截图指纹未见明显差异；若该动作理论上应改变页面状态，应重点检查点击是否命中、事件是否触发或 UI 是否无响应。';
        } else {
          item.visualDelta = { changed: null, reason: '缺少可比较的前一张截图。' };
        }
        item.diagnosis.visualStateChanged = item.visualDelta?.changed ?? null;
        if (interaction.success !== true) {
          item.diagnosis.failureClass = step.target && /跨域|DOM|iframe/i.test(String(interaction.error || ''))
            ? 'selector-cross-origin'
            : 'interaction-failed';
        } else if (stateDelta.comparable === true && stateDelta.scrollChanged && step.action === 'scroll') {
          item.diagnosis.failureClass = 'state-change-observed';
        } else if (stateDelta.comparable === true && (stateDelta.changedValues?.length ?? 0) > 0) {
          item.diagnosis.failureClass = 'state-change-observed';
        } else if (item.visualDelta?.changed === false && ['tap', 'type', 'back'].includes(step.action)) {
          item.diagnosis.failureClass = 'possible-no-op';
        } else if (item.visualDelta?.changed === true) {
          item.diagnosis.failureClass = 'state-change-observed';
        } else {
          item.diagnosis.failureClass = 'inconclusive';
        }
        evidence.push(item);
        if (!interaction.success) { failedAt = i + 1; failure = interaction.error || '手机预览交互失败'; break; }
        if (assertion.status === 'failed') {
          failedAt = i + 1;
          failure = assertion.reason;
          item.repairDiagnosis = {
            target: step.target || null,
            likelyCauses: expectation.semantic?.primaryAction
              ? ['检查该按钮的 onClick/submit handler 是否实际触发', '检查提交后的状态更新、路由跳转或数据刷新', '检查 disabled/loading 条件是否阻止了事件']
              : expectation.semantic?.overlay
                ? ['检查弹窗 open 状态与触发事件', '检查条件渲染/Portal 是否实际生成弹窗节点']
                : step.action === 'type'
                  ? ['检查输入框 focus、受控 value/onChange 与 Android 键盘输入链路']
                  : step.action === 'scroll'
                    ? ['检查实际滚动容器、overflow 与可滚动高度']
                    : ['检查目标元素事件绑定、状态更新与条件渲染'],
            evidenceToTrace: {
              appeared: stateDelta.appeared?.map((e: any) => e.text || e.aria || e.role).filter(Boolean).slice(0, 8) || [],
              disappeared: stateDelta.disappeared?.map((e: any) => e.text || e.aria || e.role).filter(Boolean).slice(0, 8) || [],
              changedValues: stateDelta.changedValues?.slice(0, 8) || [],
            },
            nextAction: '先调用 trace_mobile_ui_source，用目标文字/selector/role/action 与 stateDelta 追踪对应源码候选；再读取候选组件上下文，定位事件处理器、状态更新和条件渲染；修复后重新运行同一手机路径验证，不要盲改无关文件。',
            sourceTraceRequired: true,
          };
          break;
        }
      }
      const flow = { result: {
        success: failedAt === -1, visualVerificationRequired: true, viewport: 'mobile-390x780',
        stepCount: steps.length, completedSteps: failedAt === -1 ? steps.length : failedAt - 1,
        failedAt: failedAt === -1 ? null : failedAt, failure: failure || null, evidence,
        repairHint: failedAt === -1
          ? '动作链执行完成。请结合结构化断言与 baseline/最后截图判断按钮状态、输入结果、滚动位置、键盘遮挡、溢出与空白区域；若发现明确 UI 问题，优先定位对应组件与事件处理器后修复，再执行同一流程验证。'
          : '先读取失败步骤的 repairDiagnosis、stateDelta 与 assertion；调用 trace_mobile_ui_source 追踪目标元素对应源码候选，再读取候选组件上下文定位事件处理器、状态更新和条件渲染。修复后重新启动/检查项目，再执行同一手机路径验证；不要把 selector 跨域失败误判成业务按钮不存在。'
      }};
      const result = {
        success: flow?.result?.success === true,
        viewport: 'mobile-390x780',
        planningMode: discovery.success ? 'dom' : 'screenshot-coordinate',
        discovery,
        baseline: baseline.success ? { width: baseline.width, height: baseline.height, dataUrl: baseline.dataUrl } : null,
        plan: steps,
        flow: flow?.result || flow,
        visualVerification: {
          status: 'evidence-only',
          rule: '动作 API 成功不等于业务成功；若理论上应发生状态变化但 visualDelta.changed=false，应优先检查事件命中、状态更新和 UI 无响应。',
          changedSteps: evidence.filter((item: any) => item.visualDelta?.changed === true).map((item: any) => item.index),
          unchangedSteps: evidence.filter((item: any) => item.visualDelta?.changed === false).map((item: any) => item.index),
          possibleNoOpSteps: evidence.filter((item: any) => item.diagnosis?.failureClass === 'possible-no-op').map((item: any) => item.index),
          selectorCrossOriginSteps: evidence.filter((item: any) => item.diagnosis?.failureClass === 'selector-cross-origin').map((item: any) => item.index),
        },
        nextAction: flow?.result?.success === true
          ? '逐步检查 visualDelta：理论上应变化却没有变化的动作优先判为疑似无响应；再结合每步截图判断布局、键盘遮挡、溢出和按钮状态，必要时修复后最多再跑 1 轮。'
          : '根据失败步骤和截图定位明确问题；修复后重新发现元素并再跑一轮。',
      };
      if (result.success) return { result, updatedWorkspace: ws, stepIcon: 'code', stepTitle: `手机自测完成 · 自动规划 ${steps.length} 步` };
      return { result, updatedWorkspace: ws, errorMessage: (flow as any)?.errorMessage || '手机自测流程失败', stepIcon: 'lightning', stepTitle: '手机自测发现需要处理的问题' };
    }

    case 'run_mobile_preview_flow': {
      const rawSteps = Array.isArray(args.steps) ? args.steps : [];
      const steps = rawSteps.slice(0, 8).map((step: any) => ({
        action: String(step?.action || '').trim(),
        target: typeof step?.target === 'string' ? step.target : undefined,
        value: typeof step?.value === 'string' ? step.value : undefined,
        x: typeof step?.x === 'number' ? step.x : undefined,
        y: typeof step?.y === 'number' ? step.y : undefined,
      }));
      if (!steps.length) {
        return {
          result: { success: false, reason: 'steps 为空', viewport: 'mobile-390x780' },
          updatedWorkspace: ws,
          errorMessage: '手机 UI 测试流程没有步骤。',
          stepIcon: 'lightning',
          stepTitle: '手机 UI 测试流程参数无效',
        };
      }
      const allowed = new Set(['tap', 'type', 'scroll', 'back', 'wait']);
      const invalid = steps.find((step: any) => !allowed.has(step.action));
      if (invalid) {
        return {
          result: { success: false, invalidAction: invalid.action, viewport: 'mobile-390x780' },
          updatedWorkspace: ws,
          errorMessage: '手机 UI 测试包含不支持的交互动作。',
          stepIcon: 'lightning',
          stepTitle: '手机 UI 测试动作无效',
        };
      }

      const screenshotEveryStep = args.screenshotEveryStep !== false;
      const evidence: Array<Record<string, any>> = [];
      let failedAt = -1;
      let failure: string | undefined;

      const baseline = captureProjectRuntimeScreenshot(ws.id, 72, 'mobile');
      evidence.push({
        index: 0,
        phase: 'baseline',
        screenshot: baseline.success ? {
          width: baseline.width,
          height: baseline.height,
          dataUrl: baseline.dataUrl,
        } : null,
        screenshotError: baseline.success ? undefined : baseline.error,
      });

      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        const interaction = interactProjectPreview(ws.id, step.action as any, {
          target: step.target,
          value: step.value,
          x: step.x,
          y: step.y,
        });
        const item: Record<string, any> = {
          index: i + 1,
          action: step,
          interaction,
          viewport: 'mobile-390x780',
        };
        if (screenshotEveryStep || !interaction.success) {
          const shot = captureProjectRuntimeScreenshot(ws.id, 72, 'mobile');
          item.screenshot = shot.success ? {
            width: shot.width,
            height: shot.height,
            dataUrl: shot.dataUrl,
          } : null;
          item.screenshotError = shot.success ? undefined : shot.error;
        }
        evidence.push(item);
        if (!interaction.success) {
          failedAt = i + 1;
          failure = interaction.error || '手机预览交互失败';
          break;
        }
      }

      const visualVerificationRequired = failedAt === -1;
      const result = {
        success: failedAt === -1,
        visualVerificationRequired,
        viewport: 'mobile-390x780',
        stepCount: steps.length,
        completedSteps: failedAt === -1 ? steps.length : failedAt - 1,
        failedAt: failedAt === -1 ? null : failedAt,
        failure: failure || null,
        evidence,
        repairHint: failedAt === -1
          ? '动作链执行完成。请结合最后一张截图判断按钮状态、输入结果、滚动位置、键盘遮挡、溢出与空白区域；若发现明确 UI 问题，直接修复后重新执行同一流程。'
          : '先根据失败动作与对应截图定位问题。修复代码后重新启动/检查项目，再重新执行流程验证；不要把 selector 跨域失败误判成业务按钮不存在。',
      };
      if (result.success) {
        return { result, updatedWorkspace: ws, stepIcon: 'code', stepTitle: `手机 UI 测试流程完成 · ${steps.length} 步` };
      }
      return {
        result,
        updatedWorkspace: ws,
        errorMessage: failure || '手机 UI 测试流程失败',
        stepIcon: 'lightning',
        stepTitle: `手机 UI 测试在第 ${failedAt} 步失败`,
      };
    }

    case 'run_python': {
      const code = String(args.code || '');
      if (!code.trim()) {
        return {
          result: null,
          updatedWorkspace: ws,
          errorMessage: 'Python 代码为空。',
          stepIcon: 'lightning',
          stepTitle: '尝试执行 Python（代码为空）',
        };
      }

      const runData = await executeAgentRuntime({ language: 'python', sourceOrCommand: code, timeoutMs: 20_000, workspaceId: ws.id });
      if (runData.success) {
        return {
          result: { stdout: runData.stdout, stderr: runData.stderr, exitCode: runData.exitCode, runtime: runData.runtime },
          updatedWorkspace: ws,
          stepIcon: 'lightning',
          stepTitle: `成功执行 Python（${runData.runtime === 'android' ? 'Android 原生运行时' : '服务器运行时'}）`,
        };
      }

      return {
        result: { stdout: runData.stdout, stderr: runData.stderr, exitCode: runData.exitCode, error: runData.error, runtime: runData.runtime },
        updatedWorkspace: ws,
        errorMessage: runData.error || runData.stderr || `Python 执行失败，退出码: ${runData.exitCode}`,
        stepIcon: 'lightning',
        stepTitle: `Python 执行出错（${runData.runtime}）`,
      };
    }

    case 'run_command': {
      const command = String(args.command || '').trim();
      if (!command) {
        return {
          result: null,
          updatedWorkspace: ws,
          errorMessage: '命令为空。',
          stepIcon: 'lightning',
          stepTitle: '尝试运行命令（命令为空）',
        };
      }

      // Android compatibility: if the caller supplied raw Python source,
      // do not force the model to remember "python -c" syntax.
      if (looksLikePythonSource(command)) {
        const runData = await executeAgentRuntime({ language: 'python', sourceOrCommand: command, timeoutMs: 20_000, workspaceId: ws.id });
        if (runData.success) {
          return {
            result: { stdout: runData.stdout, stderr: runData.stderr, exitCode: runData.exitCode, runtime: runData.runtime },
            updatedWorkspace: ws,
            stepIcon: 'lightning',
            stepTitle: `成功执行 Python 源码（${runData.runtime === 'android' ? 'Android 原生运行时' : '服务器运行时'}）`,
          };
        }
        return {
          result: { stdout: runData.stdout, stderr: runData.stderr, exitCode: runData.exitCode, error: runData.error, runtime: runData.runtime },
          updatedWorkspace: ws,
          errorMessage: runData.error || runData.stderr || `Python 执行失败，退出码: ${runData.exitCode}`,
          stepIcon: 'lightning',
          stepTitle: `Python 执行出错（${runData.runtime}）`,
        };
      }

      try {
        const runData = await executeCode({
          language: 'shell',
          code: command,
          timeoutMs: 20_000,
          workspaceId: ws.id,
        });

        if (runData.success) {
          return {
            result: {
              stdout: runData.stdout,
              stderr: runData.stderr,
              exitCode: runData.exitCode,
              runtime: runData.runtime,
            },
            updatedWorkspace: ws,
            stepIcon: 'lightning',
            stepTitle: `成功执行终端命令: ${command}`,
          };
        }

        return {
          result: {
            stdout: runData.stdout,
            stderr: runData.stderr,
            exitCode: runData.exitCode,
            error: runData.error,
            runtime: runData.runtime,
          },
          updatedWorkspace: ws,
          errorMessage: runData.error || runData.stderr || `命令执行失败，退出码: ${runData.exitCode}`,
          stepIcon: 'lightning',
          stepTitle: `命令执行出错: ${command}`,
        };
      } catch (e: any) {
        return {
          result: null,
          updatedWorkspace: ws,
          errorMessage: `终端脚本执行异常: ${e.message}`,
          stepIcon: 'lightning',
          stepTitle: `终端异常: ${command}`,
        };
      }
    }

    default:
      return {
        result: null,
        updatedWorkspace: ws,
        errorMessage: `未知工具名称: ${toolName}`,
        stepIcon: 'github',
        stepTitle: `尝试调用未知工具: ${toolName}`,
      };
  }
}
