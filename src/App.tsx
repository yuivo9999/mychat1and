
            const mobileSelfTestWasRun = detectedToolCalls.some(tc => tc.tool === 'auto_test_mobile_preview');
            const mobileSelfTestInstruction = mobileSelfTestWasRun
              ? '\\n\\n### 📱 手机自测视觉闭环（强制）\\n本轮已提供 mobile-baseline 与 mobile-final 真实截图。请实际比较两张截图，并结合 auto_test_mobile_preview 的动作证据判断页面是否真的响应；“动作 API 成功”不等于 UI 正确。若发现明确 UI/UX 问题，下一轮必须直接修改工作区代码，然后调用 restart_project_runtime（必要时）并再次调用 auto_test_mobile_preview 复验；最多复验 1 轮。若没有明确问题，说明具体视觉证据，不要为了凑轮次修改代码。只检查手机 390×780，不检查 Network、电脑或平板。'
              : '';
            const phaseFeedback = buildAgentLoopFeedback(
              agentLoopState,
              toolResultsForPrompt.join('\\n\\n') + mobileSelfTestInstruction,
              agentTaskPlan,
            );
            const feedbackInstruction = isDiagnosisMode
              ? `[代码诊断工具执行结果反馈 · ${getAgentPhaseLabel(agentLoopState.phase)}]\n${toolResultsForPrompt.join('\n\n')}\n\n${getAgentPhaseInstruction(agentLoopState)}\n\n请继续严格遵循只读诊断协议；若已完成 10 步调查，请输出结构化诊断报告并停止工具调用。`
              : phaseFeedback;

            currentHistoryMessages.push({
              id: `msg_tool_feedback_${turn}_${Date.now()}`,
              role: 'user',
              content: feedbackInstruction,
              timestamp: Date.now(),
              ...(visualAttachments.length > 0 ? { attachments: visualAttachments } : {}),
            });

            if (validationFailureCount >= 3 || shouldProtectAgainstNoProgress(agentLoopState)) {
              if (agentTaskId) {
                await persistAgentTaskState(targetConv.id, {