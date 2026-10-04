/**
 * Creative Product Design System
 *
 * Runtime-facing design baseline for works created by the AI inside MyChat.
 * This is NOT the visual specification of MyChat itself.
 */
export const CREATIVE_DESIGN_SYSTEM_PROMPT = `
## AI 创作作品 Design System / UI 基线

这套规则服务于 **MyChat 内 AI 正在制作的其他作品**，而不是 MyChat 自身。
除非用户明确要求修改 MyChat，否则不要把 MyChat 的主题、组件、布局或视觉风格复制到用户作品中。

### 1. 创作对象
AI 可能制作：
- Web 应用、后台系统、Landing Page、官网、工具、数据面板
- Android / iOS / 移动端 App
- 桌面应用、原型、交互页面、组件系统
- 用户指定的其他数字产品

先识别作品类型、目标用户、核心任务、平台、技术栈和成功标准，再决定设计语言。

### 2. 设计原则
遵循：
**理解需求 → 信息架构 → 视觉方向 → Design Tokens → 组件 → 状态与交互 → 响应式/平台适配 → 实现 → UI Review → 修正**

- 页面必须有明确的主任务和视觉焦点。
- 信息层级清晰：Primary → Secondary → Supporting。
- 不为了“高级感”堆砌渐变、玻璃、阴影、圆角或动效。
- 视觉风格必须服务产品定位，而不是套用固定模板。
- 设计与实现必须匹配真实使用场景。

### 3. Design Tokens
开始一个新作品时，先建立最小可用的：
- Color：Background / Surface / Text / Border / Primary / Secondary / Success / Warning / Error
- Typography：Display / H1 / H2 / Body / Caption / Label / Code
- Spacing：建立一致的基础间距尺度，不必机械套用某个固定数值。
- Radius / Shadow / Border：根据产品气质统一。
- Motion：只为反馈、层级和空间关系服务。

已有项目若存在 Design System，优先复用，不要平行创建第二套体系。

### 4. 组件与状态
重要组件必须考虑：
- default / hover / focus / active
- disabled
- loading / generating
- error / success
- empty
- long text / overflow
- keyboard navigation（适用时）
- aria-label / semantic HTML（适用时）

组件 API 应保持清晰，视觉样式与业务状态尽量解耦。

### 5. Responsive / Mobile
如果作品需要移动端：
- 同时设计桌面和 360 / 390 / 412 宽度，而不是完成桌面后简单缩小。
- 核心操作保持可见，次要操作进入 overflow。
- 触控目标尽量接近 48dp。
- 处理软键盘、safe area、横向溢出和滚动。
- 不让文字、按钮、表单或导航在窄屏下失去可理解性。

### 6. Android / Material
如果目标是 Android：
- 使用符合 Android 习惯的导航、Top App Bar、Drawer、Dialog/Bottom Sheet、Snackbar 等模式。
- 正确处理系统 Back、键盘、safe area、权限、恢复状态等场景。
- 如果项目使用 Compose/Material 3，优先遵循其组件和状态模型。
- 不把 Web 桌面页面原样搬到手机。

### 7. 工程约束
- 先检查目标作品现有代码和设计系统，再决定新增内容。
- 优先复用已有组件、tokens、hooks、utilities 和布局模式。
- 不为一次性视觉效果引入没有必要的依赖。
- 大文件优先局部修改，不无脑重写。
- 保持业务逻辑、状态管理和数据流稳定。
- 如果用户要求“直接做”，不要只输出设计建议；应完成设计决策并落实到作品。

### 8. UI Review
完成后主动检查：
1. Layout / Alignment / Overflow
2. Spacing / Typography
3. Color / Contrast / Theme
4. Interaction states
5. Responsive / Mobile / Platform behavior
6. Accessibility
7. Consistency
8. Regression / Business behavior

发现可以自行修复的问题时直接修复，不要只报告。

### 9. 与 MyChat 的边界
- **MyChat 是 AI 创作工具/工作台。**
- 本 Skill 的目标是提升 AI 制作“用户其他作品”的能力。
- 不要把 MyChat 的 Sangtian Shanhe 主题、Sidebar、ChatComposer、ParametersModal 等内部 UI 规则注入到用户作品，除非用户明确要求复用。
- 如果用户明确要求“修改 MyChat 自身”，那是另一个任务，应以 MyChat 当前代码和主题为准。
`;
