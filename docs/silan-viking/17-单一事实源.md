# 17 · 单一事实源(SSOT)

> 本章是为根治**文档漂移**而设。silan-viking 设计分 17 篇增量写成,后写的章
> 没回改先写的章,导致同一个定义(idea.status enum、MCP 工具数、表清单)
> 在不同章出现不一致 —— 2026-05-19 的 `claude -p` 红队审查实测到 4 处。
>
> 本章把**易漂移的全局定义**集中钉死。其他章节涉及这些定义时,**引用本章、
> 不复制值**。本章与某章冲突时,以"该定义的权威章"为准(下表「权威源」列);
> 本章是索引 + 一致性检查清单,不是新权威。

---

## 17.1 易漂移定义索引

| 定义 | 权威源 | 当前值(摘) | 引用它的章节 |
|---|---|---|---|
| `idea.status` enum | `10` §10.4 | `draft / hypothesis / experimenting / validating / published / concluded`(6 值)| `02` `silan idea status`、`08` §8.2 |
| `blog.status` enum | `10` §10.4 | `draft / published / archived`(3 值)| `02`、`11` |
| `project.status` enum | `10` §10.4 | `active / completed / paused / cancelled`(小写 4 值)| `02`、`11` |
| `blog.content_type` | `10` §10.4 | `article / podcast / vlog / tutorial`(4 值;episode 独立成 type)| `01`、`11` |
| `visibility`(全 type 通用)| `10` §10.3 | `private / unlisted / public`;仅 `public` 投影到网站 | `02`、`08` §8.2 |
| 6 个 content type 闭集 | `10` §10.4 | `idea / blog / project / episode / resume / update` | 全局,`01` §1.9 编译期闭集 |
| Part `shape` 闭集 | `01` §1.3.1 | `prose / entry_list / key_value_list`(3 值,编译期闭集)| `01`、`10` §10.4.5 |
| MCP 工具闭集 | `03` §3.2 | M9 为 **18** 个;E1 后 21;E2 后 22(见 §17.2)| `03`、`04` E 阶段 |
| `silan` CLI 命令组 | `02` §设计要点 | M8 为 **8 工具组**(`content`/`index`/`relation`/`site`/`stats`/`proposal`/`mcp`/`skill`)+ 6 type 组;E2 加 `schema` 组 | `02`、`04`、`OVERVIEW`、`README` |
| ent 表清单 | `11` §11.1 | 见 `11`;含 `stats_cache_*`(`11` §11.3.1)| `11`、`08` §8.3 |
| `referrer_kind` / `source` enum | `11` §11.3 | `search / social / ai_chat / direct / internal`(+ `unknown`)| `03`、`05` |

> **改这些定义的纪律**:只能改权威源那一章,改完**必须**回扫「引用它的章节」
> 列的每一篇,同步更新。这一步就是 `14-漂移诊断与逐里程碑收敛.md` 的诊断
> 动作 —— 本章给它一张可机械核对的清单。

---

## 17.2 MCP 工具闭集 —— 随里程碑增长

`UnknownTool` 错误的判定依据,也是 `tools/list` 通告的全集。**随 E 阶段增长**:

| 阶段 | 工具数 | 增量 |
|---|---|---|
| M9 | **18** | 档1 只读 10(`recall` `list` `browse` `read` `context_brief` `lint` `stats` `visitors` `crawler_breakdown` `source_breakdown`)+ 档2 `capture` + 档2.5 `ctx_read` `ctx_write` `ctx_brief` `reflect` + 档3 `propose` `summarize_updates` + 档4 `deploy` |
| E1 | **21** | +`suggest_relations` `suggest_parts` `suggest_lifecycle`(`15` §15.2;JSON schema §15.5.1)|
| E2 | **22** | +`propose_schema`(`15` §15.2 L-结构;DDL 算法 §15.2.1;JSON schema §15.5.1)|

> `context_brief`(档1,读发布内容现状)与 `ctx_brief`(档2.5,读 agent 记忆)
> 是两个不同工具,勿合并。`deploy` 默认不通告,`--enable-deploy` 才进闭集。

---

## 17.3 部署拓扑假设 —— 单设备(红队漏洞 1)

> 红队审查指出:`03` §3.1 / `08` §8.5 的 `agent-write.lock` 是**本地文件锁**,
> 只在单机有效。文档若声称"单租户多设备",该锁与 `expected_head` 机制保证
> 不了跨设备原子性。本节钉死假设,消除这个伪解。

**本期假设:silan-viking 在单台主机上运行。**

- `content/` Git 仓的写操作(`ctx_write`、`reflect`、`proposal accept`)
  由 `content/.git/silan/locks/agent-write.lock` 文件锁串行化 —— **此锁
  只在单机内有效,设计明确不跨设备**。
- 多设备场景(owner 在两台机器各跑一个 silan-viking)**不由引擎保证一致性**,
  靠 `content/` 仓的手动 `git push` / `git pull` 同步,与普通 Git 协作无异。
  跨设备同时写可能产生 Git 冲突 —— 由 owner 手动解,引擎不介入。
- `expected_head`(`03` §3.1 accept 流程)是**单机内**串行写的乐观锁,
  防的是同一台机器上 `ctx_write` 与 `accept` 交错,**不防跨设备**。

**预留扩展点**(对象模型为未来多设备留位,不实现):

- 写锁抽象为 `WriteLock` trait。当前唯一实现 `FileWriteLock`(本地文件锁)。
  未来多设备可加 `RemoteWriteLock`(基于 Git remote 的租约 / 锁分支),
  不改 `Engine` / `Namespace` 调用方。
- `accept` 的 `expected_head` 已是「提交前比对 HEAD」语义 —— 跨设备版只需
  把比对对象从本地 HEAD 换成 remote tracking ref,接口不变。

> 一句话:**本期单设备,多设备同步是 future,锁抽象已留接口。** 文档其它
> 章节出现「多设备」「多租户」字样的,一律按本节理解为「靠 Git 手动同步、
> 引擎不保证」,不是「引擎已解决」。

---

## 17.4 一致性自检清单(每次改全局定义后跑)

改了 §17.1 任一定义,按此核对:

1. 权威源那一章的值改了?
2. §17.1 表的「当前值」列同步了?
3. 「引用它的章节」列的每一篇,逐一搜过、改对了?
4. 若动了 MCP 工具数 —— `03` §3.2 闭集说明、§17.2、`04` 对应里程碑验收判据,三处同步?
5. 若动了 enum —— `10`(权威)、`11`(ent `field.Enum` 值)、`02`(CLI 提示文案)三处同步?

> 这份清单就是 `claude -p` 红队那次能挑出 4 处矛盾的根因对策 —— 把"回扫"
> 从"希望有人记得"变成"一张必跑的表"。
