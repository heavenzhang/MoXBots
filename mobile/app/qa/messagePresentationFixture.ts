/** Synthetic reading-only fixture; never sent to a Host or model. */
export const messagePresentationFixture = `# 移动端会话验收

这一段包含 **重点内容**、*补充说明*、~~过期计划~~ 和 \`inline_code\`，需要在窄屏自然换行。
中文第二行保留换行，不把整段挤在一行。

## 执行步骤

1. 检查登录状态
2. 阅读历史消息
   - 嵌套条目：保留清楚的层级
   - 超长标识：abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789
3. 核对结果

- [x] 已完成的事项
- [ ] 尚待实机复核

> 引用内容应有独立边线，和正文保持可读间距。
>
> **引用中的重点**仍然可辨认。

### 代码保持缩进

\`\`\`typescript
function greet(name: string) {
  const diagnostic = "这是一条较长的代码行，用于确认左右滑动不会撑宽整个会话页面";
  return { message: "Hello " + name, diagnostic, enabled: true, timestamp: "2026-10-20T00:00:00Z" };
}
\`\`\`

### 宽表格

| 项目 | 当前结果 | 下一步 |
| --- | :---: | ---: |
| Markdown | 标题、列表和强调 | 实机复验 |
| 宽内容 | 局部横向滚动 | 不撑宽整个页面 |
| 设备身份 | 保留原身份 | 不切换账号 |

[官方说明](https://example.com/documentation) 和长链接 https://example.com/abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789

![受控图片占位](https://example.invalid/controlled-qa.png)

---

<script>这段 HTML 必须显示为普通文本，不能执行。</script>

\`\`\`text
末尾正在流入的未闭合代码块
  indentation stays intact
`;
