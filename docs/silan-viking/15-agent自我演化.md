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

> **fixture 同步**:一个改 `SCHEMA.md` 的 `schema-proposal`,**必须在同一
> 提案分支里同步升级 `engine/tests/fixtures/content/`** —— `schema check`
> 的引擎侧校验跑的就是升级后的 fixture,没同步就过不了闸门。完整规则见
> `08` §8.7.1。

### §15.2.1 `schema check` 的 DB 侧推演算法(E2 实现级 spec)

> 红队审查补:§15.2 的流程图把「DB 侧:推演 DDL diff」当一步黑箱。
> 本节给出可实现级算法 —— E2 实现 `schema check` 时以此为依据。

**输入**:提案分支的 `SCHEMA.md`(新)+ 主分支的 `SCHEMA.md`(旧)。
**输出**:一个 `DdlDiff` 报告 —— 每个 type 的派生表需要哪些 `ADD COLUMN` /
类型变更 / 无变更,以及是否触碰编译期闭集。

**算法(纯推演,不连真实 DB)**:

```
1. 解析新旧 SCHEMA.md,各得一个 { type -> [FieldDef] } 映射。
   FieldDef = { name, kind(见下表), required, enum_values? }
2. 对 6 个 type 逐一 diff 字段集合,每条变更归一个 verdict:
   - 新增非 enum 字段        → ADD_COLUMN
   - 新增 enum 字段          → ADD_COLUMN(列自带 CHECK,SQLite 的 ADD COLUMN
                               支持带 CHECK 的新列 —— 安全)
   - 已有 enum 扩值/减值      → REBUILD ★关键:SQLite 无法原地改 CHECK 约束,
                               只能「建新表+迁数据+换名」12 步重建。这是
                               破坏性迁移,不是 ADD,但 ent migration 能做。
   - 删除字段 / 字段 kind 变更 → FATAL(§15.2 安全表禁止;列类型变更破坏性)
3. 对每个 ADD_COLUMN,用「字段 kind → SQLite 列类型」映射表(下)算出列定义。
4. 新增 Part role:若 shape 已知 → 仅 item_part 表多几行数据,无 DDL,verdict
   = NO_OP;若 shape 未知(新 shape)→ verdict = ENGINE(触碰编译期闭集)。
5. 汇总成四态 schema_check 结果(与 §15.5.1 propose_schema 的枚举一致):
   - 全部 NO_OP                          → passed
   - 含 ADD_COLUMN / REBUILD,无 FATAL/ENGINE → needs_ent
       (REBUILD 在 ddl_diff 里 action 标 `rebuild_table`,工单注明
        「破坏性迁移、ent 走 12 步重建、需停服窗口或影子表」)
   - 含 ENGINE                            → needs_engine
   - 含 FATAL                             → failed(提案标红,不可 accept)
```

**字段 kind → SQLite 列类型映射表**(推演 DDL 的唯一依据):

| SCHEMA `kind` | SQLite 列类型 | 可空性 | 备注 |
|---|---|---|---|
| `string` / `slug` / `uri` | `TEXT` | `required` → `NOT NULL` | — |
| `text`(长文)| `TEXT` | 同上 | 正文类一般走 `item_part`,不进主表 |
| `int` | `INTEGER` | 同上 | — |
| `bool` | `INTEGER`(0/1)| `NOT NULL DEFAULT 0` | — |
| `date` / `datetime` | `TEXT`(ISO-8601)| 同上 | 与现有 ent `field.Time` 一致 |
| `enum` | `TEXT` + `CHECK(col IN (...))` | 同上 | **新增 enum 字段**=安全 ADD;**改已有 enum 的值集**=REBUILD(见算法第 2 步)|
| `string_list` / `tag_list` | 不进主表 | — | 走关系表或 JSON,verdict = ENGINE |

> **三种非 passed verdict 的区别**:
> - `needs_ent` —— Go ent 改表即可,引擎 Rust 不动(`silan-viking-entities`
>   反向重新生成)。其中 `ADD_COLUMN` 是轻量迁移,`REBUILD`(enum 改值集)
>   是**破坏性迁移** —— ent 仍能做(SQLite 12 步重建表),但 `ddl_diff` 必须
>   把它标 `rebuild_table`,工单注明需停服窗口/影子表,owner `accept` 时知情。
> - `needs_engine` —— 触碰编译期闭集(新 shape / 新 type / list 类字段),
>   引擎 Rust 要改。`accept` 仍只合 `SCHEMA.md`,工单标「需引擎改代码」。
> - `failed` —— 删字段/改 kind 等破坏性或禁止操作,提案不可 `accept`。
>
> 这把 §15.2 流程图「检测是否需要 ent 变更」落成**可判定的四态**,且对
> 「SQLite 改 enum 值集是破坏性操作」这一真实约束不再含糊(早期初稿误把
> enum 增值当安全 ADD —— 红队审查纠正,此处定死)。

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

> **接入主干**:E1/E2/E3 已正式排入 `04-里程碑.md` 的「E1–E3」节(排在
> M9 之后)。本章新增的 MCP 工具(`suggest_*`/`propose_schema`)是 M9
> 的 18 工具闭集之外的增量 —— E1 后闭集为 21、E2 后为 22,`03` §3.2
> 闭集说明已注明;`silan schema` 命令组在 E2 加入 `02`。

### §15.5.1 E 阶段工具的 JSON schema 合同

> 红队审查补:E1/E2 的 4 个 MCP 工具此前只有行为语义,缺 `03` §3.2 风格的
> 输入/输出 JSON schema。本节补齐 —— E1/E2 实现 `silan-viking-mcp` 时以此
> 为工具签名来源。错误返回沿用 `03` §3.2 的统一 `{ "error": {...} }` 形态。

```json
{
  "suggest_relations": {
    "input": { "scope": "uri[]?", "limit": "integer?" },
    "output": { "suggestions": [
      { "from": "uri", "to": "uri", "relation_type": "string",
        "confidence": "number", "rationale": "string",
        "proposal_id": "string" }
    ] }
  },
  "suggest_parts": {
    "input": { "uri": "uri" },
    "output": { "uri": "uri", "suggestions": [
      { "role": "string", "shape": "prose|entry_list|key_value_list",
        "rationale": "string", "proposal_id": "string" }
    ] }
  },
  "suggest_lifecycle": {
    "input": { "uri": "uri" },
    "output": { "uri": "uri", "current_status": "string",
      "suggested_status": "string", "rationale": "string",
      "proposal_id": "string?" }
  },
  "propose_schema": {
    "input": {
      "change": {
        "op": "add_field | extend_enum | add_part_role",
        "target_type": "idea|blog|project|episode|resume|update",
        "field_def": {
          "name": "string", "kind": "string",
          "required": "bool", "enum_values": "string[]?"
        },
        "part_role": { "role": "string", "shape": "prose|entry_list|key_value_list" }
      },
      "rationale": "string?"
    },
    "output": { "proposal_id": "string", "branch": "proposal/<id>",
      "kind": "schema-proposal",
      "schema_check": "passed|needs_ent|needs_engine|failed",
      "ddl_diff": [ { "type": "string",
        "action": "no_op|add_column|rebuild_table",
        "column": "string?", "sql_type": "string?",
        "destructive": "bool" } ],
      "issues": ["string"] }
  }
}
```

> `propose_schema.input.change` 是**结构化**对象,不是自由文本 —— 它必须能
> 直接驱动 §15.2.1 的推演算法,所以字段与算法的 `FieldDef` 同构。`op` 三选一:
> `add_field`(用 `field_def`)、`extend_enum`(用 `field_def.name` +
> `field_def.enum_values` 给新值集)、`add_part_role`(用 `part_role`)。
> 与 `op` 无关的子对象传 `null`。删字段/删 type 等破坏性操作**没有对应
> `op`** —— agent 在合同层就无法发起(§15.2 安全表「agent 永不」的落地)。

合同要点(与现有机制一致,不另起一套):

- 三个 `suggest_*` **永远只产出提案** —— `output` 里每条 `suggestion` 都带
  `proposal_id`,产物进 `silan proposal list`,owner 逐条 `accept`/`reject`。
  `suggest_*` 自身不 apply、无副作用(§15.2「闸门」)。
- `propose_schema` 的 `schema_check` 字段是 §15.2.1 推演算法的四态结果
  (`passed`/`needs_ent`/`needs_engine`/`failed`);`ddl_diff` 是该算法的
  `DdlDiff` 报告,`action` 三态 `no_op`/`add_column`/`rebuild_table` 与
  算法 verdict 对应,`destructive=true` 即 `rebuild_table`(SQLite 改 enum
  值集那类破坏性迁移)。`failed` 时提案标红不可 `accept`。
- 这 4 个工具的错误码复用 `03` §3.2 的 `McpError` 变体:参数错 →
  `InvalidRequest`,目标 Item 不存在 → `Workspace`,提案/校验失败 →
  `Proposal`。E 阶段不新增错误变体。

---

## §15.6 一句话总结

**让 agent 自我演化,不是放手让它自动改完上线 —— 是给它「主动发现 +
提案」的能力,再用「代价越高、闸门越硬、人越在场」的三层闸门兜住。**
L-内容已经能演化(增强主动性即可);L-结构能演化(必须先建 `schema check`
机器闸门);L-界面不做「自动演化」,做「agent 辅助 + 人审 PR」。
