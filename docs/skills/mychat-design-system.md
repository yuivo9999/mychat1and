# MyChat Design System / UI Inventory

这是 MyChat UI/UX Skill 的实现基线，目标不是建立一套脱离代码的“理想设计系统”，而是把当前项目已经存在的视觉、组件和移动端规则整理成 AI 可复用的事实。

## Canonical source

- Runtime inventory: `src/services/myChatDesignSystem.ts`
- UI/UX runtime skill: `src/services/uiUxSkill.ts`
- Global styles: `src/index.css`
- Sangtian Shanhe theme: `src/themes/sangtian-shanhe.css`

## 核心规则

### 基础

- 使用现有 Tailwind utility 与组件模式。
- 默认字体沿用系统字体栈；代码使用 JetBrains Mono 等等宽字体。
- 应用使用 `100dvh`，移动端不要假设浏览器 viewport 永远稳定。
- 全局 scrollbar 当前为约 6px。

### 间距与圆角

现有代码高频使用 Tailwind 的 2/3/4/6/8/12/14/16 等间距，以及 rounded-lg / rounded-xl / rounded-2xl / rounded-full。

**不要为了理论上的统一而重构已有值。** 新组件应优先匹配相邻组件。

### 组件模式

优先复用：

- ChatComposer
- MessageList / ChatMessage
- Sidebar / TopBar
- ParametersModal
- SettingsModal
- WorkspaceDrawer

已有语义 class（例如 `user-message`、`assistant-message`）应优先于在 JSX 中写新的硬编码视觉规则。

### 主题

MyChat 有多套皮肤。组件层必须允许主题覆盖。

《桑田山河 · 朱印》已经定义完整 token，包括宣纸、木色、墨色、稻田青绿、朱砂红、泥金、边线和阴影，并对 Sidebar、TopBar、聊天、Modal、Workspace 等区域进行了专门适配。

因此，新组件不要默认假设“indigo 就永远是主色”。

### 移动端

当前主题层已经存在 768px 移动断点。设计和实现时额外验证：

- 360px
- 390px
- 412px

重点检查：

- 横向溢出
- 软键盘遮挡
- safe area
- 输入框高度
- Modal/Drawer 宽度
- 核心操作是否仍然容易点击
- icon-only 操作是否有 title/aria-label

## 更新原则

当 MyChat 的实际 UI 发生明显变化时，应先修改真实组件/主题，再同步更新 `myChatDesignSystem.ts`。

这个文件是 **AI 的 UI 参考基线**，不是让 AI 擅自重构整个项目的许可。
