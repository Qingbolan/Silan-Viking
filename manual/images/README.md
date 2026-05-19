# Manual screenshots / 手册截图

This folder holds the screenshots referenced by `MANUAL.zh-CN.md` and
`MANUAL.en.md`. Each manual embeds them as `![...](images/<name>.png)`.
本目录存放两个手册引用的截图,手册中以 `![...](images/<name>.png)` 嵌入。

## How to capture / 如何截图

Run the command in a terminal, then screenshot the window. Keep a consistent
terminal theme and width (≈ 90 cols) so the images look uniform.
在终端跑下面的命令,截取窗口。保持统一的终端主题和宽度(≈ 90 列),让截图风格一致。

## Screenshot checklist / 截图清单

| File / 文件名 | Command to run / 截图命令 | Used in / 用在 |
|---|---|---|
| `01-help.png` | `silan-viking --help` | §1 / §4 — the command surface + ASCII banner |
| `02-init.png` | `silan-viking init`(在一个空目录里)| §3 / 案例 1 — 脚手架输出 |
| `03-guide.png` | `silan-viking guide` | §3 / 案例 1 — 下一步提示 |
| `04-blog-new.png` | `silan-viking blog new my-first-post` | §5.2 / 案例 1 — 新建 blog |
| `05-index-sync.png` | `silan-viking index sync` | §3 / 案例 1 — 同步进库 |
| `06-site-preview.png` | `silan-viking site preview`(连同浏览器里的站点)| §3 / 案例 1 — 本地预览 |
| `07-doctor.png` | `silan-viking doctor` | §5.1 — 环境体检 |
| `08-mcp-serve.png` | `silan-viking mcp serve`(server 启动后的输出)| §5.4 / 案例 2 — 启动 MCP |
| `09-skill-emit.png` | `silan-viking skill emit` | §5.5 / 案例 2 — 安装 skill |
| `10-agent-chat.png` | 在 Claude 里与 agent 的一段对话(说一个想法 → agent 调 capture)| 案例 2 — AI 协作 |
| `11-proposal-list.png` | `silan-viking proposal list` | §5.4 / 案例 2 — 待处理提案 |
| `12-proposal-show.png` | `silan-viking proposal show <id>` | §5.4 / 案例 2 — 查看提案 diff |
| `13-stats.png` | `silan-viking stats` | §6 / 案例 3 — 访客数据 |
| `14-site-deploy.png` | `silan-viking site deploy --confirm` | §6 / 案例 1 — 部署上线 |
| `15-website.png` | the deployed website in a browser | §1 — 成品网站(可复用根目录 `image.png`)|

> Until a screenshot is added, the manual shows a placeholder line. The manual
> still reads fine without images — they are enhancement, not dependency.
> 截图补齐前,手册显示占位说明;没有截图手册也完整可读 —— 截图是增强,不是依赖。
