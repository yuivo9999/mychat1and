# MyChat UI/UX Design Skill

This is the design contract behind the optional **UI/UX Skill** runtime switch.

The skill makes the model act as a product designer, UI designer, UX designer, mobile/Android designer, and UI reviewer for **works the user is creating inside MyChat**. It is not a design specification for MyChat itself.

Runtime flow:

**Understand → IA → Design System → Interaction states → Responsive/Android → Implement → UI Review → Fix**

The runtime prompt is exported from `src/services/uiUxSkill.ts` and uses `src/services/creativeDesignSystem.ts` as the baseline for newly created works. The switch is conversation-level through `ModelParameters.uiUxSkill`, alongside Context7 in the **运行参数** panel.

The skill is deliberately optional. When disabled, normal coding behavior is unchanged.


## 现有界面改造工作流

开启 Skill 后，涉及现有 UI 的任务采用固定闭环：

1. **UI Context Scan**：读取任务相关入口、组件、主题、样式、类型和状态逻辑，并优先利用现有预览能力。
2. **Design Brief**：先明确当前问题、目标体验、信息层级、关键交互、响应式策略和复用策略。
3. **Implementation**：优先复用现有 Design System，局部修改，避免无关重构和新增依赖。
4. **UI Review**：完成后检查布局、间距、字体、颜色、交互状态、响应式、可访问性、一致性和业务回归。
5. **Correction**：发现能够自行解决的问题时直接修正，而不是只报告问题。
6. **Completion Report**：最终说明修改内容、设计原因、Review 修正项以及仍需真实设备/运行环境验证的部分。

这样，UI/UX Skill 不只是“告诉 AI 怎么设计”，而是把设计、编码和审查串成一个完整闭环。MyChat 负责提供创作工作台；Skill 负责提升 AI 制作其他作品的能力。\n\n## 边界\n\n- 默认对象：用户正在制作的 Web、App、Android/iOS、后台、工具、Landing Page 等作品。\n- 默认不是：MyChat 自身的 Sidebar、ChatComposer、ParametersModal、主题等。\n- 只有用户明确要求修改 MyChat 本身时，才以 MyChat 当前代码和设计系统为设计依据。