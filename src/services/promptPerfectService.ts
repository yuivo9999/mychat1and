/**
 * Local Prompt Perfect-style prompt engineering pass.
 * This is deterministic and does not claim to call an external provider.
 */
export function optimizePrompt(input: string): string {
  const original = input.trim();
  if (!original) return original;

  const hasStructure = /(?:目标|需求|约束|验收|输出|acceptance|constraints|requirements|deliverables)/i.test(original);
  const hasCodeContext = /(?:代码|项目|bug|报错|api|sdk|react|vue|next|typescript|javascript|python|sql|接口|函数|组件|实现|修改|重构)/i.test(original);

  if (hasStructure && original.length > 500) return original;

  const role = hasCodeContext
    ? '请以资深软件工程师/架构师的视角处理任务。'
    : '请以该问题领域的专业人士视角处理任务。';

  return [
    '【优化后的任务指令】',
    role,
    '',
    '【原始需求】',
    original,
    '',
    '【执行要求】',
    '1. 先准确理解目标，不擅自改变用户意图。',
    '2. 明确关键假设、约束和边界条件；信息不足时指出需要确认的部分。',
    '3. 给出可直接执行、可验证的方案，避免占位符和未经证实的结论。',
    hasCodeContext ? '4. 涉及代码时优先考虑兼容性、异常处理、边界条件和现有项目结构。' : '4. 涉及事实或外部资料时区分已知信息与不确定信息。',
    '',
    '【期望输出】',
    '请先给出结论或可执行方案，再补充必要的说明、步骤和验证方式。'
  ].join('\n');
}
