import { 
  Workspace, 
  WorkspaceFile, 
  ToolCallExecution, 
  validateSafeRelativePath 
} from '../types/workspace';
import { ThinkingStep } from '../types';
import { 
  searchWorkspaceCode, 
  getWorkspaceDirectoryTree, 
  computeDiffBetweenFileSnapshots 
} from './workspaceService';
import { formatChatContextPrompt, detectWorkspaceIntent, WorkspaceIntent } from './chatContextService';
import { ChatContext } from '../types/workspace';
import { executeCode, looksLikePythonSource, getWorkspaceNodeRuntimeState, markWorkspaceDependenciesInstalled, installWorkspaceDependencies, readWorkspaceFile } from './codeExecutionAdapter';
import { buildProjectRuntimeReport, inspectProjectRuntime } from './projectRuntimeService';

export { detectWorkspaceIntent, type WorkspaceIntent };

// AI Tool Calling Specification for Workspace operations (Strictly non-executing!)
export const WORKSPACE_TOOLS_SPEC = [
  {
    name: 'list_files',
    description: '列出工作区中的文件相对路径与大小。用于初步了解文件布局。',
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
    name: 'read_file',
    description: '按需读取工作区中指定代码文件的文本内容。支持指定行号范围。',
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
    name: 'search_files',
    description: '根据文件名或路径搜索工作区中的相关文件。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '文件名或路径关键词，如 "router" 或 "config"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_code',
    description: '在工作区全部代码文件中全文搜索关键词、函数名或变量声明，返回匹配行号和内容。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '代码检索关键词，如 "handleSubmit" 或 "API_URL"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'patch_file',
    description: '对文件进行精确的局部代码块替换（优先使用 Patch 方式，避免无脑重写整个大文件造成代码遗失）。',
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
    description: '全量写入文件内容（适用于新文件或必要的大规模重构）。',
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
    description: '在工作区中创建新文件。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '新建文件的路径，如 "src/types/api.ts"' },
        content: { type: 'string', description: '初始文件内容' },
      },
      required: ['path'],
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
    name: 'get_file_diff',
    description: '查看指定文件自上一个版本或原始版本以来的修改对比差异。',
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
    name: 'query_context7_docs',
    description: '挂载 Context7 实时技术文档库：查询第三方开源库、流行框架或 API 的最新官方文档、类型定义与使用示例（解决大模型 API 废弃与代码幻觉问题）。',
    parameters: {
      type: 'object',
      properties: {
        library: { type: 'string', description: '第三方库或技术名称，如 "lucide-react", "react", "tailwind", "katex", "vite", "drizzle-orm"' },
        topic: { type: 'string', description: '可选，具体要查询的 API 名称、组件、Hooks 或用法主题' },
      },
      required: ['library'],
    },
  },
  {
    name: 'inspect_project',
    description: '识别当前工作区项目类型、包管理器、依赖清单、可用脚本以及推荐的构建/测试检查命令。开始编程任务时优先调用。',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'check_runtime',
    description: '执行 MyChat Android 运行时冒烟检查：验证 Node.js、npm，以及 npm lifecycle 能否通过 PATH 找到 node。Node 项目执行构建/测试前建议先调用。',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'install_dependencies',
    description: '根据项目类型安装运行依赖。Node 项目若存在 package-lock.json 使用 npm ci --no-audit --no-fund 固定依赖树；没有 lockfile 才使用 npm install --no-audit --no-fund。执行后必须读取输出，若失败应分析错误再修改项目。',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'run_project_check',
    description: '运行项目自动检查（typecheck/lint/test/build 中已配置的脚本），用于验证 AI 修改。一次调用只执行一个检查阶段；失败后应根据错误继续修复。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '可选检查命令；留空时使用项目检测得到的第一个推荐命令。' },
      },
    },
  },
  {
    name: 'run_python',
    description: '执行 Python 源代码。直接传入 Python 代码即可，不需要写 python -c；MyChat 会自动选择 Android 原生 Python 运行时或服务器 Python 运行时。此工具在“运行脚本与命令”权限开启时可用。',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '要执行的完整 Python 源代码，不要额外包装成 Shell 命令。' },
      },
      required: ['code'],
    },
  },
  {
    name: 'get_project_memory',
    description: '读取当前项目的长期共享记忆，默认只返回当前有效记录。',
    parameters: { type: 'object', properties: { includeHistory: { type: 'boolean' }, limit: { type: 'number' } } },
  },
  {
  {
    name: 'create_project_memory',
    description: '新增项目级长期记忆；仅保存稳定规则、约束、架构、技术选型、UI/UX约定或明确决定，避免记录普通进度和临时报错。',
    parameters: { type: 'object', properties: { content: { type: 'string' }, reason: { type: 'string' } }, required: ['content'] },
  },
    name: 'update_project_memory',
    description: '更新当前项目已有长期共享记忆记录，避免重复新增。',
    parameters: { type: 'object', properties: { recordId: { type: 'string' }, content: { type: 'string' }, status: { type: 'string' }, reason: { type: 'string' } }, required: ['recordId'] },
  },
  {
    name: 'archive_project_memory',
    description: '归档当前项目已有长期共享记忆记录，不物理删除。',
    parameters: { type: 'object', properties: { recordId: { type: 'string' }, reason: { type: 'string' } }, required: ['recordId'] },
  },
  {
    name: 'search_local_memory',
    description: '仅在用户开启“AI 主动搜索历史对话”后可用。用于在当前上下文不足以确认用户曾经做过的决定、需求、代码改动或历史结论时主动检索本地聊天。不要为了普通背景了解而调用；优先当前项目，搜索结果不足时才换更具体的关键词再次检索。不会把全部历史记录发送给模型。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '要检索的历史主题、关键词或用户曾经提到的内容' },
        projectId: { type: 'string', description: '可选，优先限定到当前项目' },
        conversationId: { type: 'string', description: '可选，仅搜索指定会话' },
        dateFrom: { type: 'number', description: '可选，Unix 毫秒时间戳下限' },
        dateTo: { type: 'number', description: '可选，Unix 毫秒时间戳上限' },
        limit: { type: 'number', description: '可选，最多返回 20 条，默认 8 条' },
      },
      required: ['query'],
    },
  },
  {
    name: 'run_command',
    description: '在工作区服务器端安全终端执行 Shell 命令行与脚本（如编译打包 npm run build、安装运行测试、执行 Python 或 Node 数据分析处理等）。此工具在“运行脚本与命令”权限开启时可用。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的完整 Shell 命令' },
      },
      required: ['command'],
    },
  },
];

// Build System Prompt containing workspace summary, code diagnosis protocol, and strict constraints
export function buildAgentSystemPrompt(
  workspace: Workspace | null,
  chatContext?: ChatContext,
  baseSystemPrompt?: string,
  isDiagnosisMode?: boolean,
  executeScriptEnabled?: boolean,
  historySearchEnabled?: boolean
): string {
  const customPrompt = baseSystemPrompt || '你是一个专业严谨的高级编程助手。';

  const workspaceSummary = workspace
    ? `## 当前绑定的工作区: ${workspace.name} (版本: v${workspace.currentVersion})
- 文件总数: ${Object.keys(workspace.files).length} 个
- 工作区文件结构摘要:
${getWorkspaceDirectoryTree(workspace).slice(0, 1500)}${Object.keys(workspace.files).length > 25 ? '\n... (更多文件可使用 list_files 或 search_files 查看)' : ''}`
    : '## 当前暂未绑定工作区（您可以回答普通问题，或提醒用户在右上角创建/上传 ZIP 工作区）。';

  const chatPrivateMemory = formatChatContextPrompt(chatContext);

  const diagnosisProtocol = `
## 🩺 代码诊断工作协议 (Code Diagnosis Protocol - 必须严格按 10 步法执行):
当用户提出代码诊断、排查、找 Bug、审查或怀疑某处有问题时：
你必须通过调用只读工具对工作区代码进行系统性、有据可查的静态代码诊断，绝不能未经工具调查凭空臆测，绝不能假装检查，并严格遵循以下 10 步流程：

① 【确认目标】：明确用户指出的代码区域、函数名、组件或功能模块；若用户提供了 diff 或检查刚改的代码，优先使用 get_file_diff 或 get_workspace_diff。
② 【搜索相关符号】：调用 search_code 或 search_files 搜索目标函数、变量、组件、事件名 (如 handleSend, onClick, API 路由等)。
③ 【按需读取代码】：根据搜索到的文件和行号，调用 read_file 读取完整函数及所属组件上下文（严禁盲目把整个项目一次性读完，坚持按需最小读取）。
④ 【追踪调用关系】：向上追踪 Caller（谁调用了它）、向下追踪 Callee（它调用了谁），逐步通过 search_code + read_file 还原关键调用链路。
⑤ 【检查上下游依赖】：检查 import、props 传递、状态依赖、service 接口、网络 API 请求与回调。
⑥ 【审查明显逻辑错误】：
   - 条件判断（是否反向、分支是否遗漏、永远不会执行的分支、不可能成立的条件）
   - 空值与未定义（null / undefined / 可选链缺失、空数组/对象属性访问）
   - 越界与边界值、提前 return 造成后续关键逻辑跳过
⑦ 【审查状态 / 异步 / Promise / 异常处理】：
   - 忘记 await、未捕获的 Promise 异常、缺少 catch / finally
   - loading 状态在异常时是否恢复（如 API 失败未恢复 loading 导致 UI 永远卡在加载中）
   - React 状态更新异步性、旧值闭包、并发竞态与请求时序覆盖
⑧ 【按需自动扩大范围】：Target (用户目标) ➔ Related (直接依赖/调用方) ➔ Deep (发现确凿线索时深入底层的 service/API)；相关才扩大，不相关绝不盲目扫描。
⑨ 【综合分析并得出结论】：严格区分以下 3 种结论，禁止产生虚假确定性：
   - A. **发现明确问题**：代码逻辑可确凿证明存在错误路径；
   - B. **暂未发现明确代码错误**：已检查关键路径均正常（必须诚实回答，严禁为了表现而强行制造虚假 bug）；
   - C. **无法确认 / 潜在风险**：代码存在边缘风险但无法静态证明一定会发生，明确指出所需运行时日志或复现条件。
⑩ 【向用户输出结构化诊断报告 & 严格只读不改】：
   - ⚠️ **诊断默认绝不修改代码**：诊断阶段只使用只读工具（search_code, read_file, get_file_diff 等），严禁调用 patch_file / write_file！
   - 必须使用如下标准格式输出诊断报告：

\`\`\`markdown
## 代码诊断报告

### 诊断目标
[用户指出的区域/函数/功能]

### 检查范围
- [已检查文件/模块 1]
- [已检查文件/模块 2]

### 诊断结果
[发现明确问题 / 暂未发现明确代码错误 / 无法确认]

### 发现的问题 (如有)
#### 问题 1: [简述]
- **位置**: \`文件路径:行号\`
- **原因**: [详细逻辑原因]
- **影响**: [对运行、状态或UI的具体影响]
- **证据代码**:
\`\`\`ts
// 关键证据代码
\`\`\`

### 关联链路检查情况
- [调用方 / 被调用方 / 异步状态 / 异常处理等检查总结]

### 已排除的问题
- [已检查但确认正常的逻辑，如：Promise await 完整、条件分支正确等]

### 待确认/限制部分 (如有)
- [静态分析无法百分之百确定的边界情况]

### 建议与后续
- [建议修复方案]

> ⚠️ **注意**：当前仅完成代码诊断与分析，**未修改任何代码**。若您确认需要修复，请回复“**修复它**”，AI 将为您进行精准局部代码替换。
\`\`\`
`;

  const corePrinciples = executeScriptEnabled
    ? `## 核心运行原则与边界声明（已获授权终端执行模式）:
1. **支持并鼓励执行项目代码与终端命令**：您的服务器端终端执行权限已通过安全面板对当前 Agent 开启。如果您编写了代码、需要编译打包（如 npm run build）、运行测试或者执行 Python/Node.js 脚本，您可以通过调用 \`run_command\` 工具执行任意终端命令，控制台会实时反馈执行成果与退出状态，您可以据此直接优化代码，闭环解决问题。
2. **工具规范**：您可以连贯组合代码修改与运行验证，直到编译完全通过或脚本运行产出正确结果。`
    : `## 核心运行原则与边界声明（必须严格遵守）:
1. **不执行项目代码**：当前权限未开启。本环境是一个安全纯净的代码分析与修改工作区。你绝对不能也无法在服务器端执行任何代码、命令行、测试、npm run/test 等。
2. **职责分工**：你负责阅读、搜索代码并做出精确优雅的修改；由用户在本地自行运行和测试。若用户测试遇到错误，用户会将错误信息贴回本聊天中由你继续分析与修改。`;

  return `${customPrompt}

${workspaceSummary}
${chatPrivateMemory}
${isDiagnosisMode ? diagnosisProtocol : ''}
${corePrinciples}

${historySearchEnabled ? `
## 🔎 本地历史对话搜索与自动决策协议
你拥有一个“按需长期记忆”工具 \`search_local_memory\`。先判断当前上下文是否足够，再决定是否搜索。

### 什么时候必须优先考虑搜索
- 用户明确提到“之前/上次/以前/我们决定过”等，而当前上下文没有足够证据。
- 用户要求恢复、继续、对比历史方案、历史代码、历史决定或历史需求。
- 当前任务明显依赖项目过去的讨论，但当前项目共享记忆与当前对话仍不足以确认细节。
- 用户问“你还记得……”、“之前为什么这样改？”、“上次做到哪了？”等历史指向性问题。

### 什么时候不要搜索
- 当前消息和当前上下文已经包含回答所需信息。
- 普通知识、纯计算、纯创作、与历史聊天无关的问题。
- 只是为了了解更多背景而进行无目的扫描。

### 自动搜索流程
1. 先检查当前对话与项目共享记忆。
2. 如果不足，第一次调用 \`search_local_memory\`，使用最具体的关键词并限定当前项目。
3. 阅读“历史记忆摘要”和“原始证据”，判断是否足够。
4. 如果不足，可以再次搜索；第二次必须改变或收窄查询意图，不得机械重复。
5. 获得足够证据后立即停止搜索并继续任务。
6. 仍无法确认时，明确告诉用户，不得编造历史结论。

### 边界
- 当前轮消息不属于历史记忆。
- 默认只搜索当前项目，不得自行扩大到其他项目。
- 不要向用户暴露内部检索协议、评分细节或工具实现。
` : ''} : ''}

## 🤖 多轮自主探索、跨文件规划与多文件协同修改规范 (必须连贯执行):
当 Agent 模式开启时，系统支持你在一个交互任务中【多次连续被调用（支持最高 12 轮自主交互）】。你应充分利用多轮自主迭代的能力，按部就班地完成从“查阅探查”到“多文件协同修改”的全闭环：

### 阶段 0：项目运行时识别与验证闭环 (Runtime)
- 只要任务涉及“写代码、修 Bug、重构、构建、测试、打包”，先调用 \`inspect_project\`，不要凭经验猜项目类型。
- Node/TypeScript/React/Vite 等项目在 Android runtime 上开始构建/测试前，优先调用 \`check_runtime\`；若 Node/npm/lifecycle 检查失败，先修复运行时桥接或明确报告环境限制，不要把运行时故障误判为业务代码错误。
- Node/TypeScript/React/Vite 等项目：先识别 package.json 与 scripts；必要时调用 \`install_dependencies\`，然后调用 \`run_project_check\`。
- 检查失败时，把 stdout/stderr/退出码当作真实证据：定位错误文件与行号 → 读取相关代码 → 修改 → 再次检查。
- 验证必须形成“失败证据 → 定位 → 修改 → 再验证”的闭环；如果同一检查命令连续失败且代码没有发生针对性变化，不得机械重复。
- 单次任务默认最多 3 次“项目检查失败后的修复验证”，超过后停止自动尝试并向用户报告剩余错误与环境限制；不要为了追求绿色结果而盲目改代码。
- 若环境缺少运行时或依赖，明确告诉用户“环境限制”，不要伪造通过。
- Android 运行时优先使用 npm/Node 适配层；不要要求模型自行拼接平台特定的 python -c 等命令。

### 阶段 1：多文件全面查阅与依赖摸排 (Explore)
- 严禁在未读取真实代码的情况下凭空猜测或直接盲改。
- **支持单轮并发调用多个工具**：若需求涉及多个文件或组件，你可以在单次回复中同时输出多个 \`tool_call\`（例如同时调用多个 \`read_file\` 或 \`search_code\`）。
- 前端会并行执行这些工具，并将所有查阅到的真实文件内容以格式化代码块一次性完整反馈给你。

### 阶段 2：综合推理与制定协同方案 (Plan)
- 查阅完所有相关文件后，先梳理出全局修改方案，在回复中清晰列出：
  1. 涉及需要修改的文件清单（例如：File A、File B、File C）；
  2. 各文件之间的依赖对应关系（接口签名、Props、类型定义、样式类名等）；
  3. 具体的修改思路与逻辑。

### 阶段 3：连贯执行跨文件修改 (Execute Multi-Files)
- 在确定方案后，直接连贯地发起多个文件的修改。你可以在当前轮次或连续轮次中，按逻辑先后顺序对所有目标文件依次调用 \`patch_file\` 或 \`write_file\`。
- 优先使用 \`patch_file\` 进行精准局部替换（\`target_content\` 必须与所查阅文件中的代码逐字、逐行、逐空格完全一致）。
- 对于全新创建的文件，使用 \`create_file\` 或 \`write_file\`。

### 阶段 4：执行自愈与容错机制 (Self-Correction)
- 如果某个文件的 \`patch_file\` 返回匹配失败，仔细阅读工具返回的最新错误反馈，在下一轮中自动校准精确代码块或改用 \`write_file\` 进行补齐，绝不半途而废。

### 阶段 5：验证与终结总结 (Summarize)
- 当确认所有目标文件均已成功修改、无需再进行任何工具操作时，**停止输出任何 \`tool_call\` 代码块**。
- 输出完整的中文任务总结，明确列出：
  1. 修改的文件列表；
  2. 每个文件的改动细节；
  3. 提醒用户在本地运行测试。

3. **工具调用协议 (Tool Calling)**：
   若需查看、搜索或修改工作区文件，请以标准 tool_call 代码块输出工具调用（可单次调用或单轮同时输出多个 tool_call）：
\`\`\`tool_call
{
  "tool": "read_file",
  "args": {
    "path": "src/App.tsx"
  }
}
\`\`\`
\`\`\`tool_call
{
  "tool": "read_file",
  "args": {
    "path": "src/components/Sidebar.tsx"
  }
}
\`\`\`
或
\`\`\`tool_call
{
  "tool": "patch_file",
  "args": {
    "path": "src/App.tsx",
    "target_content": "const color = 'blue';",
    "replacement_content": "const color = 'red';"
  }
}
\`\`\`
可使用的工具：
- list_files({ path_prefix? })
- get_workspace_tree()
- read_file({ path, start_line?, end_line? })
- search_files({ query })
- search_code({ query })
- patch_file({ path, target_content, replacement_content })
- write_file({ path, content })
- create_file({ path, content? })
- delete_file({ path })
- rename_file({ old_path, new_path })
- get_file_diff({ path })
- get_workspace_diff()

当所有必要操作已完成无需再调用工具时，请直接给出清晰、结构化的中文说明。若为代码诊断，严格输出标准诊断报告；若为代码修改，列出本次修改了哪些文件、做了哪些调整，并友好提醒用户自行在本地运行测试。`;
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
  workspace: Workspace
): Promise<{
  result: any;
  updatedWorkspace: Workspace;
  diff?: { path: string; oldContent?: string; newContent?: string };
  errorMessage?: string;
  stepIcon: ThinkingStep['icon'];
  stepTitle: string;
}> {
  let ws = { ...workspace, files: { ...workspace.files } };

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
          return {
            result: { success: true, path: filePath },
            updatedWorkspace: ws,
            diff: { path: filePath, oldContent: target, newContent: replacement },
            stepIcon: 'code',
            stepTitle: `修改文件 (Patch): ${filePath}`,
          };
        }

        return {
          result: null,
          updatedWorkspace: ws,
          errorMessage: `局部匹配失败: 在目标文件中未找到指定的精确代码块`,
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
      const checks = [
        { name: 'node', command: 'node --version' },
        { name: 'npm', command: 'npm --version' },
        { name: 'npm-lifecycle-node', command: 'npm exec -- node --version' },
      ];
      const results: Array<Record<string, any>> = [];
      for (const check of checks) {
        const runData = await executeCode({
          language: 'shell',
          code: check.command,
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
        supported: !failed,
        checks: results,
        summary: failed
          ? `运行时检查失败: ${failed.name}`
          : 'Node.js、npm 与 npm lifecycle 的 node PATH 均可用',
      };
      if (!failed) {
        return {
          result,
          updatedWorkspace: ws,
          stepIcon: 'code',
          stepTitle: 'Android Node/npm 运行时检查通过',
        };
      }
      return {
        result,
        updatedWorkspace: ws,
        errorMessage: `${result.summary}。请根据 stderr/stdout 定位 Android runtime 问题，不要直接修改业务代码。`,
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

      const runData = await installWorkspaceDependencies(ws.id, 120_000);
      let afterState = await getWorkspaceNodeRuntimeState(ws.id);
      let installRecord: { ok: boolean; fingerprint?: string; error?: string } | null = null;
      let generatedLockfileSynced = false;
      if (runData.success && info.packageManager === 'npm' && !has(ws, 'package-lock.json')) {
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
        const runData = await executeCode({
          language: 'python',
          code: `import compileall\nimport sys\nok = compileall.compile_dir('.', quiet=1, maxlevels=99)\nsys.exit(0 if ok else 1)`,
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
      const runData = await executeCode({ language: 'shell', code: command, timeoutMs: 120_000, workspaceId: ws.id });
      const result = { command, stdout: runData.stdout, stderr: runData.stderr, exitCode: runData.exitCode, error: runData.error, runtime: runData.runtime };
      if (runData.success) return { result, updatedWorkspace: ws, stepIcon: 'code', stepTitle: '项目检查通过: ' + command };
      return {
        result, updatedWorkspace: ws,
        errorMessage: runData.error || runData.stderr || ('项目检查失败，退出码: ' + runData.exitCode),
        stepIcon: 'lightning', stepTitle: '项目检查失败: ' + command,
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

      const runData = await executeCode({ language: 'python', code, timeoutMs: 20_000, workspaceId: ws.id });
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
        const runData = await executeCode({ language: 'python', code: command, timeoutMs: 20_000, workspaceId: ws.id });
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
