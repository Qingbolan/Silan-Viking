# 15 · agent 自我演化 —— 三层设计与闸门

> 需求延伸自 `#10`（agent 经提案更新内容）/ `#11`（agent 维护网站）/
> `#12`（context 增强）。本章回答一个新问题：**让协作 agent 不只是"按指令
> 改一个文件"，而是能主动演化项目的内容、结构、乃至界面 —— 边界在哪、
> 闸门是什么。**
>
> 一句话先钉死全章：**「自我演化」不是「agent 自动改完上线」。它是
> 「agent 主动发现 + 提案 + 分级闸门 + 人在关键节点拍板」。** 演化的
> 自主程度,随「改错的代价」升高而递减。

---

## §15.0 三层模型 —— 按「改错代价」分层

silan-viking 里能被演化的东西分三层,**自主程度与代价反相关**:

| 层 | 演化对象 | 改错的代价 | 自主程度 | 闸门 |
|---|---|---|---|---|
| L-内容 | `content/resources/**` 的 markdown | 低 —— 数据,Git 可回滚 | **高**:agent 主动提案 | 校验① + 人 `accept`（已有）|
| L-结构 | `content/SCHEMA.md` + 派生 DB schema | 中 —— 错了会让 sync/promote 失败 | **中**:agent 提案,机器闸门 + 人双签 | 三方一致性校验 + 人 `accept` |
| L-界面 | `frontend/` 前端代码 + 部署 | 高 —— 运行时、用户可见、难自测 | **低**:agent 起草 PR,人审 | CI + 预览 + 人 merge |

> 为什么不是「一套机制通吃」:内容错了改一行 markdown；schema 错了
> `portfolio.db` 重建不出来;UI 错了线上白屏。**代价不同,闸门必须不同。**
> 把三层塞进同一条 `accept` 链路,等于用「改 markdown 的松紧度」去管
> 「改数据库」—— 这正是 M4 契约漂移那类事故的温床。

---

## §15.1 L-内容演化 —— 已有机制 + 主动性增强

### 现状（已实现）

`03` 档 2 的 `capture` + `§3.1` 提案链路：agent 起草内容 → `proposal/<ulid>`
Git 分支 → 校验① → 人 `silan proposal accept`。idea→blog→project 的演化边
（`content_relation`）也在。**这层不用新做,它已经能演化内容。**

### 增强 —— 从「被动捕捉」到「主动发现」

今天的 agent 是 owner 说一句它 `capture` 一句。演化增强是给它**主动性**:

| 新 MCP tool（档 2 扩展） | 作用 |
|---|---|
| `suggest_relations()` | 扫全部 Item,找出**应该存在但缺失的演化边** —— 如一篇 blog 明显在讲某个 idea 却没 `documents` 边。返回候选边清单,owner 一条条 `accept`。|
| `suggest_parts(uri)` | 看一个 Item 的现有 Part,提议**缺失的可选 Part** —— 如一个 `experimenting` 状态的 idea 没有 `progress` Part。|
| `suggest_lifecycle(uri)` | 基于内容成熟度,提议 `status` 推进 —— 如一个 idea 的 overview 已写得像项目方案,提议 `idea promote --to project`。|

**闸门**：与现有提案完全一致 —— 这些 `suggest_*` 只**产出提案**，
不自动 apply。它们的产物进 `silan proposal list`，owner 逐条 `accept`/
`reject`。风险低是因为：错的建议 = 一条被 reject 的提案，零副作用。

**实现落点**：`silan-viking-mcp`，纯读 + 产出提案，无新 crate。

---

## §15.2 L-结构演化 —— agent 改 SCHEMA,机器闸门把关

### 为什么这层可行

silan-viking 的 parser 是**配置驱动**的（`OVERVIEW.md` Q5）：「加一个内容
tab = 改 `SCHEMA.md` 的 type 定义，不改 Rust」。所以 agent 修改 `SCHEMA.md`
在原理上和修改一篇 markdown 没区别 —— 都是改 `content/` 仓里的一个文件，
都能走提案分支。

### 为什么这层不能照搬 L-内容的松紧度

`SCHEMA.md` 一改,**连锁三个下游**:
1. **引擎 parser** —— 新 Part role / frontmatter 字段,parser 要能解析。
2. **派生 DB schema** —— 新字段可能要新列；ent schema 与引擎 mapper 必须一致
   （这正是 M4 契约漂移的战场）。
3. **promote** —— `DERIVED_TABLES` 白名单、列映射要跟上。

一个 agent 随手给 `SCHEMA.md` 加个字段，如果没有校验，下一次 `sync` 或
`deploy` 就会像我们调试 e2e 那天一样：`NOT NULL constraint failed`、
`schema drift`、`FOREIGN KEY constraint failed` 逐个炸。

### 闸门 —— 「结构提案」必须过三方一致性校验

L-结构演化引入一个**新的提案子类**：`schema-proposal`。它走提案分支，但
`accept` 前多一道**机器闸门** `silan schema check`：

```
agent 调 propose_schema(change)
   ↓  起 proposal/<ulid> 分支,改的是 SCHEMA.md
   ↓
校验①  —— SCHEMA.md 自身语法 / type 定义合法性
   ↓
silan schema check  —— ★新增的三方一致性闸门★
   ├─ 引擎侧:用新 SCHEMA 跑一遍 parser,fixture 内容能解析
   ├─ DB 侧:推演新 SCHEMA → 派生表 DDL diff,检测是否需要 ent 变更
   └─ promote 侧:检测 DERIVED_TABLES / 列映射是否仍自洽
   ↓  三项全绿才进入可 accept 状态
人 accept  —— owner 看 diff + 看 schema check 报告,双签
   ↓
若 check 报告「需要 ent 变更」 —— accept 不直接放行,
   生成一个 backend 侧的 ent 变更工单(进 L-界面层处理)
```

**关键裁决**：
- agent **能提案** schema 变更，**不能**让它自动落到 `portfolio.db`。
- `silan schema check` 不过 → 提案标红，不可 `accept`（同校验①的纪律）。
- 凡是 check 判定「连带 ent / Go 代码变更」的 schema 提案 —— `accept` 只
  合 `SCHEMA.md`，**同时产出一个 L-界面层的工单**，因为改 Go 代码是 L-界面
  层的事。schema 与代码分两层、两个节奏落地（M0.5a/M0.5b 已是这个思路）。

### 安全裁决 —— agent 绝不能做的结构操作

| 操作 | 准许? | 理由 |
|---|---|---|
| 加可选 Part role / 加 frontmatter 字段 | ✅ 提案 | 加法,向后兼容 |
| 加一个新 content type | ⚠️ 提案 + 强人审 | 连带 parser/mapper/ent 大改,等于 L-界面工单 |
| 删 Part / 删字段 / 删 type | ❌ 永不 | 破坏性、丢数据,只能 owner 手动 |
| 改派生 DB 的运行时表 | ❌ 永不 | `08`§8.3 硬约束,运行时数据 agent 不碰 |

**实现落点**：`silan-viking-cli` 加 `schema` 命令组（`check`/`diff`），
`silan-viking-mcp` 加 `propose_schema` 工具。无新 crate。

---

## §15.3 L-界面演化 —— agent 起草,人审 PR,不做「自动上线」

### 裁决:UI「自我演化」= agent 辅助开发 + 人审,不是自动化

让 agent 自动改 `frontend/` 组件并 `site deploy` 上线 —— **本设计明确否决**。
理由是代价层级：

- 内容错了：owner 看一眼 diff 就发现，回滚一行 markdown。
- schema 错了：`silan schema check` 机器闸门当场拦下。
- **UI 错了：agent 没有「看到渲染结果」的能力。** 一个组件改崩、一个
  样式回归、一个交互坏掉 —— 机器闸门测不出「丑」和「难用」，agent 自己
  也测不出。这类错误的发现者只能是人,发现的时机是「已经上线、用户看到了」。

所以 UI 层的「演化」正确形态是**你现在和我协作的这个模式本身**：agent
（在 Claude Code / IDE 里）改代码 → 跑 lint/build/测试 → **起一个 PR** →
**人审 + 看预览 → 人 merge**。这不需要 silan-viking 内置什么新机制 ——
它就是常规的 agent 辅助开发。

### silan-viking 能为 UI 演化做的有限的事

不是「让 agent 自动改 UI」，而是**给 agent 改 UI 时更好的输入**：

| 能力 | 作用 |
|---|---|
| `site check` 扩展 | 发布前体检加上：死链、缺图、组件 props 契约、设计系统 token 一致性 —— 给改 UI 的 agent 一个自检清单。|
| schema → 前端类型联动检查 | L-结构演化产出的 ent 变更工单,附带「前端哪些组件/类型要跟着改」的清单（承 `docs/backend-frontend-migration/` 的 endpoint↔组件矩阵）。|
| 部署预览 | `site preview` 已有 —— agent 改完 UI,人通过 preview 看效果再决定。|

**裁决**：`site deploy` 的 agent 准入维持 `03` 档 4 的现状 ——
`deploy()` 默认关闭、强制 dry-run + owner 确认。**UI 变更上线权永远在人。**

---

## §15.4 三层串起来 —— 一次「完整演化」长什么样

owner 说："我那个 AI content optimizer 的想法，最近想得挺深了。"

```
[L-内容] agent recall 命中那个 idea,suggest_lifecycle 提议:
         "它的 overview 已经写得像项目方案,建议 promote 成 project。"
         → owner accept → idea→project 演化边 + 新 project Item 落地。

[L-内容] agent suggest_parts:"新 project 缺 progress Part。"
         → owner accept → progress Part 起好。

[L-结构] agent 注意到 project 需要一个"实验指标"字段,SCHEMA 里没有。
         propose_schema: 给 project 的 frontmatter 加 metrics 字段。
         → silan schema check:引擎 parser ✅,DB 推演出"需要 ent 加列"⚠️。
         → owner 看报告 accept → SCHEMA.md 合入 + 产出一个 ent 变更工单。

[L-界面] ent 变更工单进开发流:agent(在 IDE 里)按工单改 ent schema、
         regenerate、改 Go handler、改前端组件读新字段 → 跑测试 → 起 PR。
         → owner 审 PR + 看 site preview → merge → site deploy(人确认)。
```

每一层的自主度都不同:L-内容 agent 几乎全自动产出提案、owner 一路
`accept`;L-结构 agent 提案但卡机器闸门 + 人双签;L-界面 agent 只是
辅助写代码,人审 PR、人上线。**演化是真的,但代价越高的层、人越在场。**

---

## §15.5 实施分期

| 阶段 | 交付 | 依赖 |
|---|---|---|
| **E1** | L-内容增强:`suggest_relations` / `suggest_parts` / `suggest_lifecycle` 三个 MCP 工具,产出提案 | 现有提案机制(M7)|
| **E2** | L-结构:`silan schema check` 三方一致性闸门 + `propose_schema` MCP 工具 + `schema-proposal` 子类 | E1、稳定的 ent↔引擎契约 |
| **E3** | L-界面辅助:`site check` 扩展 + schema→前端联动清单 | E2 |

> E1 低风险、纯增量,可立即排。E2 是这章的核心工程量 —— `schema check`
> 的三方校验是关键,它把「agent 改结构」从一件危险的事变成一件有闸门的事。
> E3 不引入「UI 自动演化」,只是把 agent 改 UI 时的输入做厚。

---

## §15.6 一句话总结

**让 agent 自我演化,不是放手让它自动改完上线 —— 是给它「主动发现 +
提案」的能力,再用「代价越高、闸门越硬、人越在场」的三层闸门兜住。**
L-内容已经能演化(增强主动性即可);L-结构能演化(必须先建 `schema check`
机器闸门);L-界面不做「自动演化」,做「agent 辅助 + 人审 PR」。
