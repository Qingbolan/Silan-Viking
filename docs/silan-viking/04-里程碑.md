# 04 · 里程碑

> 实施路线。M0–M9 主表已定;M7–M9 的实现级 contract 以 `10`§10.8 的
> M4/M8 验收出口补齐。

## 当前状态

- `00`–`03`:OOP 结构 / CLI / MCP 已对齐,经多轮评审。
- 评审修订已落地(`01-oop结构.md` §1.8.1 + §1.10 修订 A)。
- M0–M6 可按本章直接排工;M7–M9 开工前必须满足 `10`§10.8 的前置契约。

## ⚠️ 实施分界线 —— 文档现在能支撑到哪

> **这条分界线很重要,别误读「文档完整 = 整个系统能写完」。**

| 阶段 | 文档支撑度 | 说明 |
|---|---|---|
| **结构层 + M0 / M0.5a** | ✅ 可开工 | 分层、crate 边界、Parser/Mapper/Sink、RowSet、实体生成、SCHEMA 定稿、ent 修订 PR —— 实现级契约齐备。 |
| **M1 – M6**(Rust core)| ✅ 可开工 | base/content/entities/app(parser+sync)。本目录 `00`–`12` 已够这一段逐 crate 实现。 |
| **M7 – M9**(L4 adapter:CLI/MCP/site/deploy)| ⚠️ **部分 contract 已补,仍有 M4/M8 出口** | CLI 大方向有(`02`);MCP tool 的 JSON schema 已落到 `03`§3.2,promote DDL/WAL 已落到 `11`§11.11。**Go API 读取矩阵(endpoint↔表↔字段)** 初稿已落到 `docs/backend-frontend-migration/01-后端迁移.md` §1.10,但 M4 必须用真实 `backend.api`/ent 表名核对;M8 开工前还要用最终 SCHEMA/Go API 对 `03`/`11`/skill 接入合同做一次核对。 |

> 一句话:**现在可以开 M0 → M6,放手实现 Rust core。** 不过 `10`§10.8
> 的出口不再是无主“以后再说”:Go API 读取矩阵的真实代码核对卡 M4 出口,
> MCP schema / promote 细节的最终核对卡 M8 出口。过不了这些出口,
> 不得开对应的 M9 实现。

## M0 — `content/SCHEMA.md` 定稿(下一步)

> **可编码级规格见 `10-M0-SCHEMA定稿.md`** —— 本节是里程碑视角的概述,
> `10` 是 6 个 type(idea/blog/project/episode/resume/update)逐字段、
> enum 裁决、错误分级的实施依据。旧内容重排规则见 `12-旧内容离线重排.md`。

把 `00` 的「最新结构」+ `01` 的对象,逐字段如实写定。

做法:通读 silan 6 个 parser(`silan/parsers/`)+ `.silan-cache` 真实样例,
只抽取**字段语义**和已有内容事实,不继承旧磁盘布局。运行时 parser 只接受
`content/resources/{type}/{item}/parts/<role>/{meta.toml,<lang>.<ext>}` 最新结构。
旧内容若要进入新系统,走 M0 离线重排脚本,不进运行时兼容层。

M0 评审留下的待定项,F1/F2 已由 `10` 关闭:

- F1 —✅ 已关闭(`10` §10.4.6):`update` 保留为第 6 种 content type,
  `recent_updates` 是它的内容主表;不再有「`update` 在 `content_relation`
  里算什么角色」的悬念。
- F2 —✅ 已关闭(`10` §10.4.6 后注 / §10.4.1):`idea_details.references`
  自由文本与 `content_relation` 的 `references` 边各司其职,已裁定。
- §1.4 —✅ 已关闭(最终裁决,`01` §1.4):`.silan-cache`(两个
  Manifest)全部引擎派生、可 `rebuild`、进 `.gitignore`,类型 crate 私有;
  `meta.toml` 是可编辑契约(进 Git),`part_id` 只能由 `init`/`add-part`/
  重排工具生成,`sync` 不隐式写回。
- 评审标记的 3 处信息缺失 — 语言变体推断、Episode 解析路径、Idea 多文件聚合。
- `08-工程审查补充.md` §8.2 的 SCHEMA 最小契约:URI、ItemID/PartID、frontmatter、
  relation 声明、status/visibility、manifest 归属。

## M0.5 — schema 修订 PR(拆成 M0.5a / M0.5b 两段)

> **可执行 PR 设计见 `11-M0.5-ent-schema-PR.md`** —— 每张新表/改表的完整
> 字段、enum、索引、删表清单、派生/运行时表白名单、迁移步骤。本节是概述。
>
> **评审 P1 裁决**:M0.5 拆成 **M0.5a / M0.5b** 两段,中间隔着 M6
> (详细执行序见 `11` §11.12)。原因:M0.5 阶段还没有可验证的 Rust sync
> (要 M5/M6 才有),不能在没有可验证 sync 的情况下 drop 简历专用表 ——
> 否则一旦 sync 出问题,resume 数据断档且无回路。

### M0.5a — 加新表 + 改 enum + 适配 API(**保留所有简历旧表**)

`01-oop结构.md` §1.10 的修订 A/D/E/F/G + `10` 的裁决,落到 Go ent:
- 新增表:`content_relation`(A)、`content_interaction`(D)、`annotation`(E)、
  `item_part`(+ `item_part_translation`,G)、`part_entry`(+
  `part_entry_translation`,`10` 裁决 #2)、`episodes` / `episode_series`
  (+各 translation,`10` 裁决 #1 episode 独立成 type),enum 字段 + 索引。
- 迁移但**不在 M0.5a drop**:`project_views`、`project_likes`、
  `comment_likes` 是运行时数据,此阶段只新增 `content_interaction` 并写
  一次性迁移脚本;真实 drop 放到 M0.5b 的不可逆窗口(`11` §11.9/§11.12)。
  `project_relationships` 是派生表,可随 M0.5a 改到 `content_relation` 后
  删除;`blog_posts` 删 `ideas_id` 外键。
- 改 `comment`:`type`/`entity_type` 改 enum,`referrence_id` 改名
  `reference_id`(F)。
- 改 `recent_updates`:转正为 `update`(第 6 type)的内容主表 —— 加
  `slug`/`visibility`/`update_type`(`10` §10.4.6 裁决 #3)。
- 改 `blog_posts`/`ideas`/`projects`:enum 与 visibility 对齐 `10`。
- `*_details` 表(idea/project):文本型 tab 字段迁出到 `item_part`,
  结构化属性字段保留 —— 逐字段划分见 `11` §11.8。
- `request_logs` 收编:独立成正式 ent 表(`10` 裁决 #7,不并入
  `content_interaction`)。
- **简历专用表 `education`/`work_experience`/`publications`/`awards`/…
  此阶段一律不动、全部保留。**
- 部署数据策略按 `08` §8.3:服务器持久 DB 保留运行时表,deploy 只替换
  派生表,不能用本地新 `portfolio.db` 覆盖线上评论/打点。
- ent 重新生成 → Go API 适配 → promote 改造 → `sea-orm-cli` 反向生成
  `silan-viking-entities`。

> M0.5a 是改 Go 代码的动作,与 silan-viking 引擎实施解耦,**可与 Rust
> M1–M5 并行**。M4(entities 反向生成)依赖 M0.5a 完成。
>
> **「Go API 适配」的完整施工图**:schema 变更连锁到后端 18 个 handler /
> 14 个 logic、前端的 API/类型/组件 —— 逐 handler / 逐组件的可编码级
> 计划在 `docs/backend-frontend-migration/`(`01` 后端、`02` 前端、
> `03` 联调切换)。该目录的改动按 M0.5a / M0.5b 分阶段标注,与本节时序
> 一致;其中前端 resume 重构、后端删旧表均排 **M0.5b**(M6 之后)。
>
> **执行纪律**:M0.5a 允许并行,但不建议交给中级工程师独立合并。它同时碰
> Go ent、运行时数据迁移、API 合同、前端类型和 promote 白名单;PR 至少要
> 有一名 senior/owner 按 `docs/backend-frontend-migration/03-联调与切换.md`
> 的阶段闸门逐项验收。任何会删除运行时表或简历旧表的 SQL,都不得出现在
> M0.5a 部署包里。

### M0.5b — drop 简历旧表(**M6 验证通过后才做**)

M5/M6 Rust parser/sync 落地、离线重排(`12`)把旧 resume 内容搬进新结构、
且 `silan index sync` 验证 `part_entry` / `part_entry_translation` 能从
新结构正确重建之后,M0.5b 才 drop `education`/`work_experience`/
`publications`/`awards` 等简历专用表(+各 detail/translation),并再跑
一次 `sea-orm-cli` 生成 entities。

> **M0.5b 必须排在 M6 之后** —— 这是评审 P1 裁决的硬时序。详细执行
> 序、验收判据见 `11` §11.12。

## M1+ — Rust 引擎实施(完整里程碑)

> 自底向上按 crate 推进(`01` §1.9 的 **7 个成员 crate**,`engine/Cargo.toml`
> 是 workspace root 非 crate —— M1 建骨架时以此为准)。每个 M
> 独立可验收。**通用验收前提**:`cargo test` + `cargo clippy -D warnings
> -D unwrap_used` + `cargo fmt --check` 全绿;涉及核心操作的 M 还须满足
> `09` 的 span 埋点 + 性能预算。

| M | 交付物 | 依赖 | 验收判据 |
|---|---|---|---|
| **M1** | `engine/` workspace + 7 crate 空骨架 + CI 流水线(`05` §5.5 + `09` §9.5 基准 job)| M0 | `cargo test --workspace` 跑通(空);CI 三段 + 基准 job 配好;crate 依赖图编译期单向(`01` §1.9)|
| **M2** | `silan-viking-base`:`SilanUri`/`Meta`/`ContentHash`/`Lang`/`Slug` + `Identified`/`HasMeta` trait + `BaseError` | M1 | L1 单元测试覆盖 URI 解析/hash;`BaseError` 按 `09` §9.1 |
| **M3** | `silan-viking-content`:`Namespace`/`Collection`/`Item`/`Part`/`File`/`Manifest`/`Relation`/`Series`/`Anthology` + `ContentError` | M2 | L1 单元;`Part==Identity`(`meta.toml` 的 `PartID`)成立;两 Namespace 的 `is_publishable`/`accepts_direct_write` 不变量 |
| **M4** | `silan-viking-entities`:`sea-orm-cli` 从 M0.5a 后的 Go ent 反向生成 | M0.5a、M3 | M0.5a 全部新/改表的 Entity 生成成功;Go API endpoint↔表↔字段读取矩阵已按真实 `backend.api`/ent 表名核对(`docs/backend-frontend-migration/01`§1.10,承 `10`§10.8.1);`05` L4 对拍能用上 |
| **M5** | `silan-viking-app` 之 parser:`Parser` trait + **6 实现**(idea/blog/project/episode/resume/update)+ `ParserRegistry`(闭集静态分派)+ `Parsed` 只读产物 + parser-only `ParsedBuilder` + `ParseError`;**parser 并行**(`09` §9.4)| M3、M4 | `05` §5.3 内容解析场景全绿;`Workspace::scan -> Item.kind -> ParserRegistry::parser_for -> parse -> validate` 主链路测试通过;§5.3.1 ResumeParser 切片跑通;`sync` 全量 1000 Item < 5s(`09` §9.4)|
| **M6** | `silan-viking-app` 之 sync:`Mapper` trait + **6 实现**(对应 6 type)+ `MapperRegistry`(闭集静态分派)+ `RowSet` + `Sink`/`SqliteSink` + `Workspace::sync` + 增量;`sync`/`parse` span(`09` §9.2)| M5 | `05` 持久化场景绿;`Parsed.kind -> MapperRegistry::mapper_for -> map -> Sink` 主链路测试通过;增量 sync < 200ms;L4 对拍通过;`sync_meta` 写入;`part_entry` 能从新结构正确重建(M0.5b 的前置门槛)|
| **M7** | `silan-viking-app` 之 proposal + relation + query:提案 Git 分支、`accept`(worktree+校验②+锁+expected OID,`08` §8.5)、`canonicalize`、`Workspace::query` + SQLite FTS5 `QueryIndex`(`01` §1.5.Q) | M6 | `05` 演化关系 + 提案场景全绿;`accept` 原子性测试(陈旧/冲突/重校验)通过;无网络环境下 `recall` lexical fallback 命中预期 Item;验收报告明确 `embedder=none|api|local|fallback`,不把 lexical fallback 宣称为语义召回 |
| **M8** | `silan-viking-cli`:`silan` binary,6 个 type 命令组 + 8 工具组(`content`/`index`/`relation`/`site`/`stats`/`proposal`/`mcp`/`skill`)+ `init`/`config`/`doctor`(`02`)+ **skill 包结构生成**(`silan skill emit/status/rm`,`13`)| M7 | `05` CLI 场景 + `07` 操作剧本可跑通;`silan --help` 全组在;`silan skill emit --path t` 生成可被 Claude 发现的包且 `status` hash 检测可用;skill 包只写 `silan mcp serve --stdio` 本机解析约定,跨机同步不含绝对路径/固定端口;MCP JSON schema 与 promote DDL/WAL/回滚契约按最终 SCHEMA/ent 表名核对完成(`10`§10.8.2–§10.8.3) |
| **M9** | `silan-viking-mcp` + `silan-viking-site`:MCP server(握手推 SCHEMA、四档工具、`ctx_*`,`08` §8.6)+ `SiteProjector`/`SeoEmitter` + `silan site` 部署链(`06` §6.5 + `08` §8.3 promote)+ **skill 端到端接入验证**(`13`)| M8 | `05` MCP + 端到端 + 网站场景全绿;deploy promote 只替换派生表(`08` §8.3)验证通过;**M8 产出的 skill 包能被 Claude 发现并经 M9 MCP 完成一次 capture**(`07` 剧本 K) |

**关键路径**:M1→M2→M3→M5→M6→M7 是主干串行(每个依赖前一个的对象/能力);
M4 可在 **M0.5a** 完成后与 M2/M3 并行;M8/M9 是 L4 adapter,M7 后才有完整
`Workspace` 可包。**skill 分发(`silan skill`,需求 `#16`)拆两级验收**:
M8 先做 CLI 侧 `emit/status/rm` 与包结构/hash 验收,让“装一下”的体感尽早可试;
M9 在 MCP server 就绪后做真正端到端 capture。它仍落点在
`silan-viking-cli`(`13` §13.7),无独立 crate、无下游依赖。**M0.5b(drop 简历旧表)依赖 M6** —— M6 验证 `part_entry`
能从新结构正确重建后才能开,是评审 P1 裁决的硬时序(`11` §11.12);
M0.5b 不在 Rust 主干关键路径上,但卡在 M6 之后。**带队排期按这个依赖图
分工。**

## E1–E3 — agent 自我演化(M9 之后,`15` 章)

> `15-agent自我演化.md` 定义「agent 主动演化项目」的三层设计,自带 §15.5
> 分期表。早期它游离于主里程碑之外(红队审查指出);本节把它正式接入 ——
> E 阶段排在 M9(MCP server 就绪)之后,工具/命令的合同以 `15` 为准。

| 里程碑 | 交付 | 依赖 | 验收 |
|---|---|---|---|
| **E1** | `silan-viking-mcp` 加 3 工具 `suggest_relations`/`suggest_parts`/`suggest_lifecycle`(`15` §15.2);产出走现有提案机制,不新增闸门 | M9 | 三工具产出的提案能被 `silan proposal` 审阅;`03` 工具闭集 18 → 21,`tools/list` 与 `UnknownTool` 同步更新 |
| **E2** | `silan schema check` 三方一致性闸门(CLI)+ `propose_schema` MCP 工具 + `schema-proposal` 提案子类(`15` §15.2;DDL 算法 §15.2.1;JSON schema §15.5.1)| E1、稳定 ent↔引擎契约 | `schema check` 能拦下「引擎 parser 过但 ent 需加列」;`accept` schema 提案前 `schema check` 必过;`02` `silan schema` 命令组、`03` 工具闭集(→ 22)同步落账 |
| **E3** | `site check` 扩展 + schema→前端联动清单(`15` §15.4)| E2 | `site check` 报出「schema 改了但前端未跟进」的清单;不做 UI 自动演化 |

> E 阶段的 MCP 工具(`suggest_*`/`propose_schema`)**不在 M9 的 18 工具
> 闭集内** —— 它们是 E1/E2 才加入的增量,`03` §3.2 的闭集说明已注明。
> `silan schema` 命令组同理:M8 的 8 工具组不含它,E2 才加。

---

**每个 M 的横切验收**(`09` 要求,不单列里程碑):
- 涉及核心操作(M5 sync/parse、M6 sync、M7 accept、M9 mcp/deploy)的 M,
  验收时该操作的 `tracing` span 已按 `09` §9.2 埋好。
- M5/M6/M7 验收含 `09` §9.4 的性能预算达标(criterion 基准)。
- 每个 crate 交付时带自己的 `thiserror` 错误枚举(`09` §9.1)。

> 旧 `archive/RUST-ENGINE-DESIGN.md` 的 M0–M12 已被本表取代,不再参考其拆分。
