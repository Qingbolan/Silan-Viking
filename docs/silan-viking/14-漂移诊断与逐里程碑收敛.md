# 14 · 漂移诊断与逐里程碑收敛

> 本章不是新设计。它回答一个被 e2e 暴露出来的、比任何单个 bug 更重的
> 问题:**为什么一个号称从 `11` 定稿、经多轮第一性审查收敛出来的项目,
> 实现里到处是 schema / 行为漂移?修完一条,下一条还会冒出来吗?**
>
> 这一章给出第一性诊断、漂移的三类接缝、缺失的收敛机制,以及「重走逐
> 里程碑收敛」的施工图。

---

## 14.1 症状 —— 一次 e2e 撞出的 11 处漂移

2026-05-17 的一次 e2e(`silan init` → `index sync` → 查更新)没有
止于「CLI 不能用」——`init`/`new`/`sync`/`content`/`relation` 实跑都对。
它撞出的是一条**连环实现缺陷**,合计 11 处漂移:

| # | 漂移 | 在哪两方之间 |
|---|---|---|
| 1 | `content_relation` 写 `from_uri` ≠ entities 的 `from_type/from_id` | 实现↔实现 |
| 2 | `item_part` 只写 `item_id/role` ≠ entities 的 7 列 | 实现↔实现 |
| 3 | translation 表外键 `item_id` ≠ entities 的 `blog_post_id` 等 | 实现↔实现 |
| 4 | `part_entry` 平铺列 ≠ entities 的 `shared_payload` JSON 列 | 实现↔实现 |
| 5 | `main_row` 写 `kind` 列,entities 无此列 | 实现↔实现 |
| 6 | `episodes.series` ≠ entities 的 `series_id` | 实现↔实现 |
| 7 | `priority`/`tech_stack` 老 frontmatter 字段无处落 —— *初判文档↔文档,实为新设计有意不收(见 §14.3 类 C 更正)* | (非漂移)|
| 8 | `scroll_progress`/`recent_updates` media 字段 —— Go ent 有、`11` 初稿漏写(已补) | 文档↔文档 |
| 9 | `init` 不产 6 type 目录 + 示例条目 —— 实现 ≠ `06` §6.2.1 | 实现↔文档 |
| 10 | `scaffold` 不写 `part_id` —— 实现 ≠ `01` §1.4 | 实现↔文档 |
| 11 | `content tree/ls` 的 `--help` 写了 `<uri>` 参数、实现没接 | 实现↔文档 |

> 11 处**不是同一种错** —— 这本身是线索。它们分三类(末列),三类各有
> 不同的成因,但**同一个根**。

---

## 14.2 根因 —— 引擎被「一次性照文档全量生成」,跳过了 `04` 的收敛机制

`04` 里程碑把实施切成 M1→M9:每个里程碑「独立可验收」、有依赖顺序、
有验收门。**这个设计是对的。** 但 git 史显示引擎是这样落地的:

```
39491f7  feat(engine): silan-viking Rust content engine (M1-M9)
```

**M1 到 M9,九个里程碑,一个 commit。** 引擎是「读文档 → 一次性写出
全部 7 个 crate」生成的,不是「M1 做完验收 → M2 基于 M1 真实产物做」
逐里程碑长出来的。

「照文档一次性写全部」和「逐里程碑收敛」是本质不同的两件事:

- **逐里程碑收敛**:M4 生成 `entities` 后,M5/M6 写 `mapper` 时,手边
  **就是 M4 的真实产物**。mapper 天然按 `entities` 的真实列名写 ——
  前一个里程碑的产物是后一个里程碑的**事实地基**。
- **一次性全量生成**:写 `mapper` 时,`entities` 可能还没生成、或在
  另一个文件里没去核。写 `mapper` 的人按**文档的描述**(甚至按自己
  对 schema 的理解)写列名。

`sync/rows.rs` 的文件头注释是铁证:

> 「Until the sea-orm Entities are reverse-generated (milestone M4),
> a `Row` is represented generically...」

—— **`mapper` 是在「`entities` 还不存在」的假设下写的。** M4 后来确实
生成了 `entities`,但**没有任何步骤、没有任何测试**强制 `mapper` 回去
对齐它。`sink` 又是 row-driven 动态建表(mapper 写什么列就建什么表),
所以漂移可以一直存在、`cargo test` 还全绿。

**结论**:漂移不是 11 个偶然的 bug,是「跳过逐里程碑收敛、让 7 个
crate 同时对着一份『打算』(文档)各写各的」这个生成方式的**必然产物**。
文档是「打算做成什么」;`04` 的里程碑链本意是让「打算」逐步**凝固成
事实**,后一步踩前一步的事实。跳过这个链,等于让漂移成为默认状态。

---

## 14.3 三类接缝 —— 漂移藏在里程碑与里程碑之间

把 11 处漂移按「发生在哪两方之间」归类,得到**三类接缝**。每一类是
一道「前方产物 → 后方消费」的缝,漂移就藏在缝里:

### 类 A —— 实现 ↔ 实现(同一次生成里,两个 crate 各写各的)

漂移 #1–#6。典型缝:**M4 `entities` ↔ M5/M6 `mapper`**。
`entities` 从 Go ent 反向生成(对的);`mapper` 凭文档描述写(漂的)。
同一个 commit 里两个模块各写各的,**没有一个环节让它们对齐**。

### 类 B —— 实现 ↔ 文档(实现没逐字对定稿,或文档后改实现没跟)

漂移 #9–#11。典型缝:**`06`/`01`/`02` 定稿 ↔ 各 crate 实现**。
`init` 该产 6 type(`06`§6.2.1)实际只产 1;`scaffold` 该写 `part_id`
(`01`§1.4)实际不写;`content tree` 的 `--help` 承诺 `<uri>` 参数,
实现没接。

### 类 C —— 文档 ↔ 文档(两份文档本身没对齐过)

典型缝:**`11` 定稿 ↔ Go ent schema**。

> **2026-05-17 收敛核对结果 —— 类 C 这道缝其实基本不漂(>99% 一致)。**
> 本章初稿曾把 #7/#8 归为类 C 漂移,经逐表核对 `11` ↔
> `backend/internal/ent/schema/`,那是诊断时的误判,更正如下:
> - `priority`(idea)/`tech_stack`(project):Go ent **没有**这些列,
>   `10`/`11` 也**没有真把它们定为列** —— 它们是 Python 老 parser
>   frontmatter 里的字段,新设计**有意不收**。不是漂移。
> - `scroll_progress` + `recent_updates` 的 media 字段:Go ent 有、`11`
>   初稿漏写 —— 已于 §11.3 / §11.7.1 补进 `11`。已对齐。
> - 唯一遗留:`personal_info.visibility` —— `10`§10.4.5 给 resume 一个
>   `visibility`,Go ent `personal_info` 无此列。一处小缺口,归 M0.5a。
>
> **结论**:类 C 不需要专门的校验闸 —— Go ent 与 `11` 已高度一致。
> 收敛重心在类 A(已建闸)与类 B(待建闸)。

---

## 14.4 缺失的收敛机制 —— 每道缝都该有一个「闸」

漂移能长期潜伏,是因为**没有任何机制在持续检查每道缝两边是否一致**。
治本不是「这次把 11 处修掉」(那是治标),是**给每一类接缝建一个
自动校验闸**,让漂移**结构性地不可能再沉默**。

| 接缝类 | 该有的校验闸 | 状态 |
|---|---|---|
| A 实现↔实现(mapper↔entities)| `sink` 写库前校验:mapper 产的列必须 ⊆ `silan-viking-entities` 的实体列,不符报 `SchemaDrift` | ✅ **已建**(2026-05-17,`sync/sink.rs` Phase 0)—— 见 §14.6 |
| B 实现↔文档 | 一组「契约测试」把文档契约写成可执行断言:`init` 产物 == `06`§6.2.1(6 type 目录 + 3 示例 + SCHEMA/config/git);`scaffold` 的 meta.toml == `01`§1.3.1/§1.4(part_id 稳定);`--help` == 实际命令集 | ✅ **已建**(2026-05-17,`silan-viking-cli/tests/doc_contract.rs`,7 测试)|
| C 文档↔文档(`11`↔Go ent)| 经 2026-05-17 逐表核对,这道缝 >99% 一致(见 §14.3 类 C 更正)—— **不需要专门闸**;唯一遗留 `personal_info.visibility` 归 M0.5a | ✅ 已核对,无需建闸 |

> **mapper↔entities 闸是示范**:它把类 A 的漂移从「沉默」变成「sync 时
> 报错」。它一开,一次 sync 把所有漂移列一次报全 —— 6 处类 A 漂移就是
> 被它逼出来、然后逐一对齐的。类 B / 类 C 还没有对应的闸,所以「还在
> 漂」的感觉是真的:没有机制在盯那两道缝。

---

## 14.5 「重走逐里程碑收敛」—— 施工图

silan 裁决:**重走逐里程碑收敛**。这不是「从 M1 把 7 个 crate 重写
一遍」(那是又一次一次性大动作,只是换了方向)。精确含义是:

> 让 `04` 设计的收敛机制 —— 后一个里程碑踩前一个里程碑的真实产物、
> 每道缝有验收 —— **真正运行一遍**。现有 ~17500 行引擎代码大部分是对
> 的(171 测试全绿),它是**草稿**。重走收敛 = **逐道接缝核对前后里程
> 碑产物、把缝里的漂移挤出来对齐、给能自动校验的缝建闸** —— 不重写
> 已对的东西。

### M1–M9 接缝清单(逐道核对的施工顺序)

| 缝 | 前方产物(里程碑)| 后方消费(里程碑)| 漂移风险 | 校验闸 |
|---|---|---|---|---|
| 1 | M0.5a Go ent schema | M4 `entities`(sea-orm-cli 反生)| `11` ↔ Go ent(类 C)| 🔲 建类 C 闸 |
| 2 | M3 `content`(Item/Part/PartId)| M5 `parser` 建 `Parsed` | Part.id 链(已接通,2026-05-17)| 间接(parser 测试)|
| 3 | M4 `entities` | M5/M6 `mapper` 产 RowSet | mapper 列名(类 A,6 处已对齐)| ✅ §14.6 闸 |
| 4 | M6 `sync` 行为 | M8 `cli` 命令实际行为 | init/content tree(类 B,已修)| 🔲 建类 B 闸 |
| 5 | `00`–`12` 文档定稿 | 各 crate 实现 | 实现 ≠ 定稿(类 B,普遍)| 🔲 建类 B 闸 |
| 6 | M7 `proposal`/`accept` | M8 CLI `proposal` 命令组 | ✅ 干净 —— CLI `proposal_accept` 是 `ws.accept_proposal` 的薄包装,未重写逻辑 | 不需(已薄包装)|
| 7 | M8 `cli` / M7 `app` | M9 `mcp`/`site` | ✅ 已收敛 —— 发现「创建提案」逻辑只在 mcp(`accept` 在 app 却 `create` 在 mcp,职责不对称),已上提 `Workspace::create_proposal`,mcp `propose`/`capture` 改薄包装(2026-05-17)| 结构性(create 与 accept 同在 app)|

> 每道缝的收敛动作:① 拿前方真实产物,核后方是否照它消费;② 漂移挤出
> 来对齐(改后方,或若前方错则改前方,以 `11`/定稿为最优基准);
> ③ 能自动校验的缝,建闸,让漂移以后结构性不可能。

---

## 14.6 已建的示范闸 —— mapper ↔ entities schema gate

类 A 的闸已经建好,是后续类 B / 类 C 闸的模板。

**位置**:`engine/crates/silan-viking-app/src/sync/sink.rs`,`write_batch`
的 Phase 0。

**机制**:
- `silan-viking-entities` 新增 pub `table_columns(table) -> Option<Vec<String>>`
  —— 用 sea-orm 的 `Iterable` 反射实体列名,是「schema 真相源」的查询入口。
- `sink` 写库前,对每张表:若它是 `entities` 的实体,mapper 产的列必须
  ⊆ 实体列;不符则收集进 `SyncError::SchemaDrift`。
- 一次 sync 把**所有**漂移列一次报全(不是撞一个停一个),mapper 可
  一轮对齐。
- Entity-backed 表按**实体列集**建表(不再按 mapper 给的列动态建)——
  on-disk schema 永远跟实体一致。

**收益**:`entities` 从「死代码」变成「被强制执行的 schema 真相源」。
mapper 再想停在旧理解上,sync 直接 `SchemaDrift` 报错 —— 类 A 漂移
结构性不可能再沉默。

> 类 B 闸(实现↔文档)和类 C 闸(`11`↔Go ent)按这个模板建:找到
> 「真相源的可查询入口」+「在某个必经路径上校验」。详细设计在「重走
> 逐里程碑收敛」逐缝施工时给出。

---

## 14.7 给将来的纪律 —— 不要再「一次性全量生成」

这一章最该被记住的一句:

> **跨多个里程碑、多个模块的实现,不能一次性照文档全量生成。** 文档是
> 「打算」,会过时、会有多份、会互相矛盾。必须逐里程碑落地:前一个里
> 程碑交付**活的、可执行的事实**(代码 + 测试),后一个里程碑踩这个
> 事实,而不是踩文档的描述。每道里程碑接缝要有验收;能自动校验的,
> 建闸。

漂移不是手滑,是「让 N 个模块同时对着一份『打算』各写各的」的必然
产物。收敛机制(逐里程碑 + 接缝闸)就是把「打算」逼成「事实」、再让
「事实」约束下一步的装置。`04` 设计了这个装置,这一次没有运行它 ——
`13` 章的存在,就是为了让它被运行。
