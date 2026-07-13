# Silan Desktop 产品与架构评审

评审日期：2026-07-14

评审范围：独立 Tauri 项目 `desktop/`、CLI 桌面入口、真实本地 SQLite 数据、现有内容契约与桌面/窄窗口渲染。

## 结论

本轮已经完成编辑器最重要的边界修正：独立 `desktop/` Tauri 工程只编辑 `content/` Markdown。SQLite 中的内容表是可重建读投影，评论和 interaction 表是可选运行时数据；两者通过独立只读仓储访问。应用层 `ContentEditor` 负责 revision 校验、frontmatter 保留、串行原子写源文件、`Workspace::sync` 和受保护的失败回滚；Tauri 不再直接更新内容表。

当前产品是可用的本地 Markdown 工作台基础版，还不是完整发布工作台。真实 Quick Create、Resume 结构化 TOML 编辑、评论处理、lint/publish 状态机和安装后独立运行仍是后续范围。

## 已验证事实

### 数据与持久化

- `content/` 是已创作内容的写模型；SQLite 内容表是 `Workspace::sync` 生成的读投影，评论与 interaction 表属于运行时数据。
- CLI 同时传入 `SILAN_DESKTOP_CONTENT` 和 `SILAN_DESKTOP_DB`；Tauri 现在使用两者并保持职责分离。
- SQLite 由两个只读仓储访问：`ProjectionRepository` 读取内容元数据，`RuntimeInsightsRepository` 读取可选评论与 interaction。
- 全新同步数据库没有运行时表时，Dashboard 将其解释为零条观测，不再整页加载失败。
- 编辑器正文和 revision 从 Markdown 读取，导航元数据与 Dashboard 聚合从 SQLite 读取。
- 保存只替换 Markdown body，YAML frontmatter 保持字节级稳定。
- 完整文件 hash 是 optimistic revision；旧 revision 保存返回 conflict，不覆盖磁盘。
- 同一进程内的保存被串行化；源文件写入成功但投影失败时，只有磁盘仍是本次写入版本才会回滚，不会覆盖外部编辑。
- 端到端测试已证明 Markdown 更新后 SQLite body 由同步链路刷新，而非直接 UPDATE。

### 领域语义

- 当前前端将一个 Part 表示为一个 `EditorDocument`，其 `translations[]` 承载语言版本。
- Project 和 Idea 已按 Entity 分组。
- Episode 已按 Series -> Episode -> Part -> Translation 分组，同一 Episode 不因多个 Part 重复成为多个内容项。
- Resume 有 prose、entry_list、key_value_list 三类 Part；当前桌面只列出 Markdown prose，结构化 TOML 不会误进 Vditor。
- Preview 使用 Vditor Markdown renderer；网站组件级 Preview 仍未实现。

### 产品行为

- `Write blog`、`Record idea`、`Log update` 当前是写作入口，尚未创建新 Entity。
- Recently touched 当前打开内容类型，尚未精确恢复目标 Part。
- Dirty 状态下 Refresh 会被阻止，不再静默清空修改；完整 Save / Discard / Cancel 对话框仍待实现。
- Tauri 当前注册 Dashboard、List、Get、Save 四类命令；Create、Publish、Archive 和 Comment Review 尚未实现。
- CLI 的 desktop 命令要求源码目录存在 `desktop/package.json` 并启动 `npm run desktop`；Tauri bundle 当前关闭，因此这还是开发启动器。

### 页面与样式

- 原生 Tauri 窗口可以加载真实 Markdown 正文，Vditor 与 EN/ZH tabs 正常渲染。
- 1440px 下为紧凑 Sidebar + Content Library + Editor 三栏，没有常驻 Inspector。
- “Queue” 已删除；内容目录按 Entity -> Part 表达语义，不模拟文件队列。
- 内部 Translation ULID 已从界面删除，编辑器标题只展示内容类型、标题、Part、源路径、status 与 visibility。
- Sidebar 固定 196px，800px 以下收缩为图标栏；不再强制 1120px 页面宽度。
- Rust 引擎有 source-first 端到端测试，桌面 Rust check 和 TypeScript build 通过。

## 产品定义

Silan Desktop 是站点所有者的本地发布工作台：把零散观察转成结构化、多语言、可发布的长期内容，并把真实访问与评论重新转成下一轮写作行动。

它不是通用 CMS、文件浏览器、纯 Markdown 编辑器或纯流量面板。

核心 Job Story：

> 当我结束一段研究、开发或收到网站反馈时，我希望打开软件后立刻知道最值得推进的内容，并恢复到对应 Entity、Part 和语言版本，从而完成从想法到发布、再到反馈跟进的闭环。

## 写作 SOP

```text
Capture
  -> Triage
  -> Structure
  -> Draft by Part and Translation
  -> Preview and Validate
  -> Ready
  -> Publish and Sync
  -> Observe
  -> Follow-up
  -> Structure or Draft
```

1. Capture：快速记录，不要求先填写完整 slug、结构和发布信息。
2. Triage：选择 Blog、Idea、Project、Update；Episode 必须选择或创建 Series；Resume 进入具体栏目。
3. Structure：创建 Entity、必需 Part、canonical Translation、关系和元数据。
4. Draft：编辑对象始终是 Entity -> Part -> Translation，每个 Translation 独立 dirty、saved、ready。
5. Preview and Validate：按真实内容组件渲染，检查 schema、链接、媒体、必需 Part 和语言完整度。
6. Publish and Sync：原子写入内容真源、校验、同步投影，再执行类型专属的发布状态迁移。
7. Observe：同步并过滤真实人类交互、评论和来源。
8. Follow-up：将评论、高关注旧内容或缺失信息转成绑定原 Entity 的下一步行动。

工作流状态不能替代领域状态。Blog/Episode、Idea、Project、Update、Series 各自继续使用 SCHEMA 中的状态集合；`status` 与 `visibility` 保持正交。

## 信息架构与页面规格

### Dashboard

页面目的：回答“今天最值得处理什么”，不是展示累计数字。

首屏结构：

1. Needs attention：按优先级排列 pending comment、projection drift、save/sync failure、缺失必需 Part。
2. Continue writing：最近编辑的 draft/private 内容，直接进入上次 Part 和 Translation。
3. Ready to publish：已校验、无 dirty、满足必需字段但仍未公开的内容。
4. Audience signals：最近 7 天唯一人类访问、相对前 7 天变化、具体 Entity 归因。
5. Recently changed：点击精确打开 Entity、Part 和语言，而不是只打开栏目。

Dashboard 不需要重复的 Signals Inspector。只有选中一条信号时才从右侧打开详情抽屉，显示时间窗、数据源、目标内容和下一步动作。

快速入口：

- New blog post：创建 Blog Entity、body Part 和 canonical Translation，随后选中新草稿。
- Capture idea：创建 Idea Entity、overview Part 和 canonical Translation，随后选中新想法。
- Log update：创建带当前日期的 Update、body Part 和 canonical Translation，随后选中新记录。

### Library

将 All files 改为 Library。顶层只显示 Entity，不把 Part 当作文件平铺。

搜索结果保留层级上下文：类型 / Entity / Part / Translation。空结果时 Editor 不能继续展示旧选中对象。

### Blog

层级：状态分组 -> Blog Post -> body -> Translation。

列表辅助信息：status、visibility、updated time、published time、语言完整度、dirty、最近 7 天 human views。

### Projects

层级：Project -> overview/goals/challenges/solutions/... -> Translation。

列表辅助信息：project status、visibility、Part 完整度、tech stack、relations、last updated。

选择 Project 时默认打开上次编辑 Part；首次打开则进入 overview。

### Ideas

层级：Idea lifecycle group -> Idea -> overview/progress/reference/result/... -> Translation。

主动作围绕当前 lifecycle：补充 hypothesis、记录 experiment、更新 progress、形成 result，而不是只编辑正文。

### Episodes

层级必须是 Series -> Episode -> Part -> Translation。

Series 显示自己的 status；Episode 显示 number、title、status、visibility；Part 显示 role 和语言完整度。同一个 Episode 无论有几个 Part，都只能出现一次。

创建 Episode 时先选择 Series 或新建 Series，再确定 episode number。

### Resume

Resume 是单一 Entity，其下是多个有 shape 的 Part：

- prose：使用 Vditor，例如 summary；
- entry_list：使用可排序的结构化行编辑器，例如 education、experience、awards；
- key_value_list：使用键值编辑器，例如 skills。

结构化 Part 的语言内容在字段级编辑，不能显示空 Vditor。

### Updates

按日期倒序，并可按 update type 和 status 分组。列表显示 date、type、关联 Entity、status、visibility、language coverage。

创建时要求日期和 update type；关联 Project/Idea/Episode 应作为明确字段，而不是埋在正文。

### Editor 与上下文

Editor 只承担当前 Part 的内容编辑。语言 tabs 属于 Part，不属于全局导航。

常驻 Inspector 不存在。当前写作所需上下文放在编辑器标题：title、Part、source path、status、visibility；更低频的元数据与校验结果应使用按需抽屉，而不是永久占用编辑宽度。内部 Translation ULID 不进入普通界面。

Preview 至少有两级：

1. Content Preview：渲染 Markdown、结构化条目、媒体和链接。
2. Site Preview：使用真实网站组件和目标路由预览公开页面。

## Dashboard 指标契约

任何主指标必须同时具备：数据源、时间窗、比较基线、Entity 归因和下一步动作。

| 指标 | 默认口径 | 驱动动作 |
|---|---|---|
| Pending comments | 当前未审核评论 | Review / Approve / Follow-up |
| Human views | 最近 7 天去重人类访问 | 打开高关注内容 |
| Change | 最近 7 天 vs 前 7 天 | 识别上升或下降内容 |
| Continue drafts | 最近编辑且未公开的内容 | 恢复上次 Part/Translation |
| Ready to publish | 校验通过且无 dirty 的内容 | 打开发布检查表 |
| Missing content | 缺少 required Part 或 canonical Translation | 补齐结构 |
| Projection drift | content revision 与 DB sync revision 不一致 | Sync / Inspect error |

Crawler 只作为数据健康与 SEO 诊断信息，不与人类受众信号同级。

## 显式状态机

Workspace：

```text
Loading -> Ready
Loading -> LoadFailed
LoadFailed -> Loading
```

Editing Session：

```text
Clean(revision)
  -> Dirty
  -> SavingSource
  -> SourceSaved
  -> Reindexing
  -> Clean(new revision)

SavingSource -> SaveFailed
SavingSource -> Conflict
Reindexing -> ProjectionStale
```

Create：

```text
Idle -> Creating -> CreatedAndSelected
Creating -> CreateFailed
```

只有 Clean 可以无确认刷新、切换 workspace 或关闭应用。

关键文案：

- Dirty：`Unsaved changes in EN · body`
- Cross-language：`Saved ZH · 1 unsaved change in EN`
- Saving：`Saving EN · body...`
- Save failed：`Save failed. Your changes are still open.`
- Conflict：`This part changed outside the app.`
- Projection stale：`Content is saved, but the local index is out of date.`

Refresh、导航和退出在 Dirty 状态必须提供 Save / Discard / Cancel。

## 目标架构

```text
desktop/
  src/
    app/                 # route/screen state and dependency composition
    features/dashboard/  # triage projection and actions
    features/library/    # entity tree and search
    features/editor/     # explicit editing session state machine
    features/preview/    # content/site preview
    features/feedback/   # comments and interaction drilldown
    domain/              # UI-facing Entity/Part/Translation types

  src-tauri/src/
    commands/            # thin Tauri adapters
    application/         # WorkbenchCommandService, DashboardQueryService
    domain/              # Entity, PartShape, Translation, Revision, lifecycle
    adapters/content/    # Markdown/meta.toml repository; write model
    adapters/projection/ # SQLite read repository
    adapters/insights/   # stats cache/runtime insight repository
```

写模型：

```text
content/**/*.md + meta.toml
  <- WorkbenchCommandService
     create / save / metadata / publish / archive
     atomic write -> validate -> index sync -> revision
```

读模型：

```text
ContentProjectionRepository -> portfolio.db
RuntimeInsightsRepository   -> stats_cache_* / synced production data
DashboardQueryService       -> snapshot + generated_at + freshness + source
```

Tauri commands 只做 DTO 转换和错误映射。SQL、文件路径、生命周期和 UI 状态不能继续集中在 `main.rs` / `App.tsx`。

Desktop 应复用 engine 的 application/domain 能力，而不是复制 CLI SQL 或 shell-out 到 CLI。迁移完成后删除直接 UPDATE 派生内容表的保存路径，不保留兼容层。

## 响应式与视觉预期

视觉原则：安静、工作导向、可扫描。参考图的柔和背景和快速入口可以保留，但视觉强调应落在待处理项、选中 Entity、保存状态和发布动作，而不是大面积玻璃卡片。

- >= 1280px：196px Sidebar + 258px Content Library + Editor。
- 981-1279px：Sidebar 缩至 168px，Content Library 缩至 226px。
- 800-980px：Sidebar 保留标签，Dashboard 主卡改为单列内容。
- < 800px：Sidebar 变为 58px 图标栏；Content Library 与 Editor 仍保持明确边界。

具体调整：

- Dashboard H1 使用 `Overview`，首屏直接显示 interaction、views、likes、comments 与待处理评论。
- Dashboard 主判断标题控制在工作台尺度，不使用 52px 展示页字号。
- 列表行控制在 44-52px，空白空间服从扫描效率。
- 内容类型颜色只辅助识别；生命周期与错误状态拥有更高视觉优先级。
- 一般面板圆角为 8px，列表行保持紧凑。
- 不设置常驻 Inspector；低频详情后续使用按需抽屉。

## 用户任务验收

| 任务 | 当前 | 目标验收 |
|---|---|---|
| A 打开并理解待办 | 失败 | 首屏给出一个最高优先级下一步和具体对象 |
| B 根据互动决定动作 | 失败 | 指标有时间窗、对比、内容归因和 drilldown |
| C 找到 Project/Idea/Episode | 基本通过 | 搜索与 Recent 精确定位 Entity/Part |
| D 理解内容层级 | 通过 | Library 为 Entity -> Part；Episode 为 Series -> Episode -> Part |
| E 切换 EN/ZH | 通过 | 语言始终是同一 Part 的 tab |
| F 只保存目标语言 | 通过 | 只保存目标 Markdown representation，并保留其他 dirty 状态和 revision |
| G 快速创建内容 | 失败 | 三个入口原子创建真源并选中新内容 |
| H 恢复错误与冲突 | 部分通过 | revision conflict 和 refresh guard 已有，完整冲突 UI 待补 |

## 当前评审

| 视角 | 已成立 | 主要缺口 |
|---|---|---|
| 产品 | 内容层级与写作对象清晰，Dashboard 有真实统计入口 | Quick Create 与评论行动闭环 |
| 架构 | content 真源、revision、串行原子写、sync、受保护 rollback；内容投影与运行时洞察独立只读 | typed error、共享应用生命周期和 React 页面仍需继续拆分 |
| 用户 | 导航紧凑、无 Dossier 干扰、源路径和保存对象明确 | 新建内容与结构化 Resume 编辑 |

## 根修顺序

1. 真实 Quick Create：Blog、Idea、Update 创建真源后直接选中。
2. 显式编辑状态机 UI：Save / Discard / Cancel、冲突比较、关闭保护。
3. Resume 结构化 Part 编辑器。
4. Dashboard 行动队列和统一 interaction 口径。
5. Content/Site Preview、lint、publish 和类型专属 lifecycle。
6. React/Rust 模块继续拆分，增加 command/state-machine 测试。
7. CLI 产品化启动：安装后不依赖源码目录、Node 或 Tauri dev server。

每个切片完成时删除被替代的旧路径，不保留双写、SQLite 编辑兼容层或临时 fallback。

## 本轮验证记录

- `npm --prefix desktop run build`：通过。
- `cargo check --manifest-path desktop/src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path desktop/src-tauri/Cargo.toml`：通过，验证只读投影、缺失运行时表和真实 runtime 聚合。
- `cargo test --manifest-path engine/Cargo.toml -p silan-viking-app`：通过。
- `editor_source` 端到端：通过，验证 Markdown、frontmatter、SQLite projection、stale revision 和 projection 失败回滚。
- 原生 Tauri 1440px：真实 Markdown、Content Library、Vditor、EN/ZH tabs 可渲染。
- 原生启动：`silan-viking desktop` 通过，CLI 正确传入 content root 和 database path。
