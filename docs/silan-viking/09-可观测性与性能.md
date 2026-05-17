# 09 · 可观测性、错误处理、性能

> 工程负责人(晓雯)补。前八章把**功能正确性**写满了(对象、测试四层、
> 对拍),但一个会跑常驻 MCP server、会做 git 操作、会被 agent 高频调用的
> 系统,**没有可观测性 = 上线即盲飞,没有性能预算 = 实现时撞墙**。本章是
> 开 M1 写 Rust 之前必须钉死的运行时契约。
>
> 三件事:① 结构化日志 / tracing;② 错误处理分层;③ 规模假设 + 性能预算。

---

## 9.1 错误处理 —— typed error 分层(开 M1 前定)

`01` §1.5.1 已用 `ParseError` / `Issue` 的基调,但没有**全局错误契约**。定死:

### 9.1.1 每个 crate 一个错误枚举,`thiserror` 派生

| crate | 错误类型 | 典型变体 |
|---|---|---|
| `silan-viking-base` | `BaseError` | `InvalidUri`、`HashMismatch` |
| `silan-viking-content` | `ContentError` | `MalformedManifest`、`OrphanPart`、`DanglingRelation` |
| `silan-viking-app` | `ParseError` / `SyncError` / `ProposalError` | `MissingRequiredPart{role}`、`SchemaViolation{file,line}`、`MergeConflict{files}`、`StaleProposal{base,head}` |
| `silan-viking-entities` | (sea-orm 生成,不手写) | — |
| L4 三个 adapter | 各自 `CliError`/`McpError`/`SiteError` | 包裹下层错误 + adapter 上下文 |

**规则**:
- 库 crate(L1–L3)一律返回 `Result<T, ThisCrateError>`,**不用 `anyhow`**。
- `anyhow` **只在 L4 adapter 的进程边界**(`main.rs` / MCP handler 顶层)用——
  把 typed error 转成给人/给 agent 的最终消息。
- **零 `unwrap()` / `expect()` 在非测试代码**(`clippy` 设 `-D unwrap_used`)。
  唯一例外:程序启动时的不可恢复配置错,`expect` 带清晰消息。
- 每个错误变体必须携带**可定位 + 可修复**的信息:`SchemaViolation` 带
  `file:line`,`MergeConflict` 带冲突文件列表 —— 不允许 `Other(String)`。

### 9.1.2 退出码映射(承 `06` §6.8)

`06` §6.8 定了 `0/1/2` 三档退出码。错误枚举到退出码的映射在 L4 adapter 完成:

```
ContentError / ParseError(用户内容/配置错,可改)        → exit 1
SyncError::DbUnwritable / 环境类(git 缺、网络断)        → exit 2
ProposalError::MergeConflict / StaleProposal             → exit 1(附下一步提示)
panic(不该发生的 bug)                                    → exit 101(Rust 默认)
```

`panic` 不当正常错误路径用;一旦 `panic` 说明有 bug,CI 的 panic = 测试失败。

---

## 9.2 结构化日志与 tracing —— 运行时可观测性

### 9.2.1 技术选型

- `tracing` + `tracing-subscriber`:结构化 span/event,不是 `println!`。
- 输出两形态:开发态人类可读(`tracing-subscriber` fmt),`--json` / MCP server
  态输出 JSON 行(可被日志系统采集)。
- 级别约定:`ERROR` 操作失败 / `WARN` 可继续的异常(悬空边、stale 译文)/
  `INFO` 关键操作起止 / `DEBUG` 单 Item 级细节 / `TRACE` 单 Part/File 级。

### 9.2.2 核心操作的 span 契约

**每个核心操作是一个 `#[tracing::instrument]` span,字段固定**。这样任何一次
失败 / 慢,都能从 span 树定位到「哪个操作、哪个 Item、哪个 Part」。

| 操作 | span 名 | 必带字段 | 子 span |
|---|---|---|---|
| `silan index sync` | `sync` | `content_root`、`mode`(full/incremental) | 每个 Item 一个 `sync.item{uri, kind}`;其下 `parse.part{role,lang}` |
| `silan proposal accept` | `proposal.accept` | `proposal_id`、`base_oid` | `merge`、`validate`、`update_ref{old,new}` |
| `silan proposal propose`(MCP)| `proposal.propose` | `proposal_id`、`touched_parts` | `validate` |
| `silan site deploy` | `site.deploy` | `target_host`、`dry_run` | `sync`、`build`、`package`、`ship`、`promote` |
| MCP 每个请求 | `mcp.request` | `tool`、`agent_id`、`namespace` | 对应工具的操作 span |
| `silan stats *` | `stats.query` | `endpoint`、`target_host` | — |

**span 结束时必记**:`elapsed_ms`、结果(`ok`/`err` + 错误变体名)。
`sync` 的根 span 额外记:`items_scanned`、`items_changed`、`items_skipped`。

### 9.2.3 sync 的可观测产物 —— `content/log.md` + sync_meta

- `content/log.md`(`00` §0.4 已有):append-only,每次 sync/accept 一行,
  `## [ISO8601] sync | +3 ~1 -0 | commit <sha>` —— 人可读的操作史。
- `sync_meta` 表(`08` §8.3):`content_commit` + `synced_at` + `duration_ms`
  + `items_total`。`silan index status` 读它回答「上次 sync 多久、多大」。
- 这两个合起来,silan 不用翻日志就知道系统最近怎么转的。

### 9.2.4 MCP server 的可观测性(常驻进程,重点)

MCP server 是唯一的常驻进程,盲点最危险:

- 每个 agent 接入 / 断开:`INFO` 一行(`agent_id`、握手推送的 SCHEMA 版本)。
- 每个工具调用:`mcp.request` span —— 哪个 agent、调了什么、耗时、结果。
- `silan mcp status` 不只显示「在不在」,还显示:当前接入数、各 agent 累计
  调用次数、最近错误。
- `ctx_write` / `reflect` 到 `agent/` 的每次写入记 `INFO`:字段含
  `agent_uri`、`commit_oid`、`content_hash`、`mode`、`written_files`。
  这与 `03` 的 agent-write Git commit 纪律一致:直接写不等于无审计。

---

## 9.3 规模假设 —— 不写死规模,后面所有性能判断都是空中楼阁

silan-viking 是**单人**的个人 context 系统(`#13`)。据此定规模上界
(M1 实现按这个量级设计,不为百万级过度设计):

| 维度 | 预期量级 | 设计上界(实现按此压测)|
|---|---|---|
| 内容条目(blog+idea+project+episode+resume)| 几十 ~ 几百 | 1,000 个 Item |
| 单 Item 的 Part 数 | 1 ~ 4 | 8 |
| 语言数 | 2(en/zh)| 4 |
| `content/` 仓总大小 | 几十 MB | 500 MB(含 assets)|
| `portfolio.db` | 几 MB ~ 几十 MB | 200 MB |
| agent 提案并发 | 1 ~ 2 | 5 个待审提案 |
| `content_interaction` 行(服务器)| 随访问累积 | 单独考量,见下 |

> `content_interaction`(打点)是唯一会**无界增长**的表 —— 它在服务器、随访问
> 累积。它不影响本地 sync 性能(本地不持有,`08` §8.3),但服务器侧需要
> **定期归档/聚合策略** —— M0.5 改 ent 时定:原始行保留 N 个月,更老的滚进
> 日聚合表。这条单列,不在本地引擎的规模预算里。

---

## 9.4 性能预算 —— 每个操作的可接受耗时

基于 §9.3 的设计上界(1000 Item),定**性能预算**。这是验收门槛,不是愿望:

| 操作 | 预算(1000 Item 上界)| 超了怎么办 |
|---|---|---|
| `silan index sync` 全量 | < 5 s | 超 → parser 并行(Item 间无依赖,天然可并行)|
| `silan index sync` 增量(改 1 Item)| < 200 ms | 超 → 检查 hash 比对是否真增量 |
| `silan index rebuild` | < 8 s | 同全量 sync + 派生层重建 |
| `silan <type> show` / `list` | < 100 ms | 查 portfolio.db,该有索引 |
| MCP `recall`(语义/lexical 检索)| < 500 ms | 默认 lexical fallback 离线可用;Embedder 不可用不能拖垮 recall |
| MCP `read` / `ctx_read` | < 50 ms | 读单文件 |
| `proposal accept`(merge+校验)| < 3 s | 校验②是大头,可只校验 merge 影响的 Item |
| `silan stats *`(远程)| < 1 s | 受网络影响,预算含一次 HTTP round-trip |

**两条设计决策由预算倒逼**:
1. `sync` 全量预算 5s / 1000 Item —— Item 间解析无依赖,**parser 必须能并行**
   (`rayon` 或 tokio task)。这是 §1.5 `Parser` 设计时就要留的:`parse` 是
   纯函数、无共享可变状态,天然可并行。M1 实现按可并行设计。
2. 增量 sync 预算 200ms —— `.meta.toml` / `.silan-cache` 的 hash 比对必须
   是 O(变化量) 不是 O(全量)。`sync` 先读 `.silan-cache` 的 hash 清单,只
   重新解析 hash 变了的 Item。
3. `recall` 预算 500ms —— M7 默认走 lexical index,可选 Embedder 只作召回
   增强。模型/网络失败时降级并记录 span 字段 `embedder=fallback`,不返回 5xx。
   同时记录 `embedder=none|api|local|fallback` 与 `recall_mode=lexical|hybrid`;
   没有 Embedder 时不得在日志、CLI 或 skill 正文里宣称“语义召回已开启”。
   lexical fallback 的体验上限写进 `01` §1.5.Q:它只保证关键词命中,不保证
   认出换了说法的旧念头。

---

## 9.5 性能基准 —— criterion + CI 回归门槛

- L1–L4 测试(`05`)验**正确性**;基准测试验**性能不回归**。
- 工具:`criterion`。基准点:`sync` 全量(100 / 1000 Item fixture 两档)、
  增量 sync、`recall`、`accept`。
- 基准 fixture:`engine/tests/fixtures/` 之外另建 `engine/benches/fixtures/`,
  生成 100 / 1000 Item 的合成内容仓(脚本生成,确定性)。
- **CI 回归门槛**:基准结果存基线,新 commit 若某项 `> 基线 ×1.5` → CI 警告;
  `> ×2` → CI 失败。基线随刻意的性能优化更新。
- 基准 job 独立于 `05` 的 L1–L4,不阻塞功能 CI,但 merge 到 main 前必须绿。

---

## 9.6 本章对其他章节的连带要求

| 章节 | 要补 / 要按本章对齐 |
|---|---|
| `01` §1.5 `Parser` | `parse` 标注「纯函数、无共享可变状态」—— §9.4 并行预算的前提 |
| `01` 各 crate | 各带一个 `thiserror` 错误枚举(§9.1.1)|
| `04` 里程碑 | 每个 M 的验收判据加「该模块的 span 已埋 + 基准达标」 |
| `05` §5.5 CI | 加 `criterion` 基准 job(§9.5)+ `clippy` 加 `-D unwrap_used` |
| `06` §6.8 | 退出码映射与 §9.1.2 一致(已一致,交叉确认)|

> 一句话:功能正确性前八章管了;**这个系统跑起来之后能不能被看见、出问题
> 能不能定位、慢了能不能发现** —— 本章管。开 M1 之前,§9.1 错误契约、§9.2
> span 契约、§9.4 性能预算必须先定,否则 Rust 代码写完要回头补埋点、返工。
