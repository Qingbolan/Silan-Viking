# 03 · MCP 服务清单(协作 agent 接入)

> 服务需求 `#10 #11 #12`。
> `silan mcp serve` 起一个 MCP server,把 `Workspace` 的能力暴露给**任何与 silan
> 协作的 agent**(协作 agent)。这是终局「捕捉想法 + context 增强」的落地。

MCP 工具分四档,**可变性由档位决定**。

## 档 1 — 只读:理解 silan(context 增强,#12)+ 交互数据查询(#15)

| MCP tool | 作用 |
|---|---|
| `recall(query)` | 语义检索 owner 的内容,返回相关 Item 摘要 |
| `list(type, [filter])` | 结构化列出某 type 的 Item:slug / 标题 / status / 演化关系。`filter` 支持按 `status`、最近修改筛选 —— 对齐 CLI `silan <type> list` |
| `browse(uri)` | 浏览 `content/` 目录结构 |
| `read(uri)` | 读一个 Item 的正文 |
| `context_brief()` | **核心**:返回「silan 当前在想什么」的浓缩简报 —— 让新 agent 一上来就懂 silan |
| `lint()` | 内容体检报告(#11)|
| `stats(uri, [section])` | 某 Item / 章节的实时交互统计:浏览 / 点赞 / 评论数(#15)|
| `visitors(uri)` | 该内容的访客明细:指纹 / IP / visitor_kind / referrer_kind(#15)|
| `crawler_breakdown([uri])` | 按访客类型聚合:人类 / 搜索引擎 / AI 爬虫;具体爬虫抓取次数(#15)|
| `source_breakdown([uri])` | 按来源聚合:搜索 / 社交 / AI 对话 / 直接 / 站内引荐(#15)|

> #15 的四个工具(`stats`/`visitors`/`crawler_breakdown`/`source_breakdown`)
> 与 `silan stats` 命令组(`02-cli服务.md` 的 `show`/`visitors`/`crawlers`/
> `sources`)**逐一同构** —— 同一个 `#15`,CLI 与 MCP 两个面切法一致,不存在
> 一面三工具一面四命令的错位。都是 **向生产服务器的远程查询**(经 Go API
> 的 stats endpoint),不是查本地 `portfolio.db`。运行时数据(评论/打点)只在服务器(`01` §1.8),本地那份
> 运行时表是空的。CLI 给 silan、MCP 给协作 agent,同一个远程查询,不存在
> 两套逻辑。它们是**只读**:agent/owner 能看交互数据,不能改 —— 打点由
> Go API 在访客访问时写入服务器 db。

> **`list` 为什么要有 —— 补 agent 查询面的对称缺口**:`recall` 是语义检索、
> `browse` 是目录遍历、`read` 是读单篇 —— 三者都缺一个**结构化列表**。
> agent 想「盘一遍所有 status=building 的 project」「列出最近改过的 idea」,
> 没有 `list` 就只能 `browse` 完目录再一篇篇 `read`,既低效、又拿不到
> `status` 这种结构化字段。CLI 那一面 6 个 type 组各有 `list` + `--status`
> 筛选,MCP 这一面却缺 —— 是 `#10`「agent 能检索」与 CLI 的一处不对称。
> `list(type, filter)` 补上后,agent 的查询三层齐:`list` 盘清单 → `recall`
> 语义定位 → `read` 读细节。`list` 与 CLI `silan <type> list` 同源,查本地
> `content/`(不是远程,与 `stats` 那组相反)。

## 档 2 — 捕捉:往 context 里写想法(#12)

| MCP tool | 作用 |
|---|---|
| `capture(note, type)` | agent 在对话中捕捉 owner 的一个想法 → 起一个新 Item 的提案(见 §3.1)|

## 档 2.5 — agent context:直接读写 `silan://agent/`(#12)

> `agent/` 是 agent 自己的命名空间(`01` §1.2.1)—— 它对项目的理解、笔记、
> 对 owner 的理解、会话摘要。这一摊 **agent 直接读写,不走提案** —— 它是
> agent 的记忆,不是发布内容(§3.1「记忆类直接改」)。

| MCP tool | 作用 |
|---|---|
| `ctx_read(uri)` | 读 `silan://agent/` 下的 context 文件(agent 自己的记忆/理解)|
| `ctx_write(uri, content)` | **直接写** `silan://agent/` —— 不经提案、不需 owner accept |
| `ctx_brief()` | 新 agent 接入时,把 `agent/` 浓缩成一份「上一个 agent 留下的项目理解」简报 |
| `reflect(session)` | 会话末:把本次对话沉淀进 `agent/sessions/` 与 `agent/owner/`(OpenViking 式自进化)|

> **为什么直接写、不走提案**:`resources/`(发布内容)agent 改它走提案,因为
> 那是 owner 的作品、owner 是作者;`agent/` 是 agent 自己的记忆,agent 就是
> 它的作者 —— 让 agent 记自己的笔记还要 silan 审,没有道理。
>
> **载重边界**:`ctx_write` 只能写 `silan://agent/` 前缀的 URI。引擎在
> `Namespace` 层挡死 —— `ctx_write` 一个 `silan://resources/...` 的 URI 直接
> 拒绝(`AgentNamespace.accepts_direct_write()==true`,`ResourceNamespace`
> 是 `false`,§1.2.1)。agent 永远不能用 `ctx_write` 绕过提案改发布内容。
>
> **永不发布**:`agent/` 命名空间 `is_publishable()==false`,`SiteProjector`
> 不可达 —— agent 的 context 再多,一个字都不会出现在网站上(设计明确要求)。

### agent/ 记忆组织与 `reflect` 落盘策略

`agent/` 不是任意乱写的垃圾抽屉。M7 起固定四类路径:

```
content/agent/
├── owner/
│   ├── profile.md          # owner 的稳定偏好、长期目标、工作方式
│   └── preferences.md      # 写作/工程/发布偏好
├── project/
│   ├── brief.md            # 当前项目状态总览,ctx_brief 主要读它
│   └── open-threads.md     # 仍需跟进的问题/风险
├── notes/
│   └── <slug>.md           # agent 主动整理的主题笔记
└── sessions/
    └── YYYY/MM/DD/<ulid>.md # 每次 reflect 的不可变会话摘要
```

`reflect(session)` 的写入规则:

1. 永远先写一份新的 `agent/sessions/YYYY/MM/DD/<ulid>.md`。这是不可变审计
   记录,只追加新文件,不回改旧 session。
2. 从 session 中抽取稳定事实,以 patch 方式更新 `agent/owner/*.md` 与
   `agent/project/*.md`。只写“跨会话仍成立”的偏好、目标、约束、未完成线程;
   一次性闲聊不进入 owner/project。
3. 主题性内容写 `agent/notes/<slug>.md`。同 slug 已存在时 append 一个
   `## YYYY-MM-DD <ulid>` 小节,不全文改写。
4. `ctx_brief()` 只读 `owner/`、`project/` 与最近 N 份 session 摘要,并把
   brief 限制在 2k 字以内;超过预算时优先保留 `project/open-threads.md`。

合并策略:

- `owner/profile.md` / `preferences.md`:按二级标题 patch;同一标题下的旧内容
  不删除,除非新事实明确 supersede 旧事实,此时保留一行 `Supersedes:` 审计。
- `project/brief.md`:替换“Current state / Next / Risks”三个固定段落。
- `project/open-threads.md`:按 checkbox item 合并;同名线程去重。
- `sessions/`:不可变,不 merge。

这给 `reflect` 一个可实现的最小策略:先留审计,再更新浓缩记忆,最后由
`ctx_brief` 控制膨胀。

### ctx_write 的 Git 写入、并发与审计

`ctx_write` 虽然不走提案,但它仍写同一个 `content/` Git 仓,因此必须有
原子写入纪律:

1. `ctx_write` 与 `reflect` 必须持有同一把写锁:
   `content/.git/silan/locks/agent-write.lock`。`proposal accept/rebase`
   也必须在推进主分支前获取这把锁,避免 agent/ 直接写与 resources/ 提案
   合并同时改 HEAD。
2. 每次 `ctx_write` 在当前主分支上写入,只允许 stage `content/agent/**`。
   若工作树已有非 agent/ 的脏文件,不碰、不 stage、不回滚。
3. `ctx_write` 一次调用一个 commit;`reflect` 一次调用一个 commit,可包含多
   个 `agent/` 文件。commit message 固定:
   `agent: ctx_write <uri>` 或 `agent: reflect <session_ulid>`。
4. commit 前记录 `expected_head`;提交后若 `HEAD` 不是基于 `expected_head`,
   返回 `conflict` 并要求重试。实现可用锁内 `git rev-parse HEAD` +
   `git commit` 保证单进程原子。
5. 每次写入都在 commit trailer 里写:
   `Agent-Tool: ctx_write|reflect`、`Agent-Uri: <uri>`、`Content-Hash: <hash>`。

审计语义:agent/ 是 agent 自己的记忆,所以不需要 owner accept;但它不是无痕
写盘。每次 direct write 都有 Git commit + tracing event,可以回看、revert,
且不会混进 proposal 分支。

## 档 3 — 提案:协助写作 / 改内容(#10 #11)

| MCP tool | 作用 |
|---|---|
| `propose(uri, draft)` | agent 起草/修改 —— `uri` 可锚到整个 Item **或某个 Part(tab)**(见 §3.1)|
| `summarize_updates()` | agent 生成 changelog/recent-update 草稿,走提案 |

> `capture`/`propose` 写入的不是真相源,是一个**提案 Git 分支**。`accept`/`reject`
> **不是** MCP 工具 —— agent 永远不能自己把草稿合进真相源(#10 不变量)。
> 完整机制见下 §3.1。

## §3.1 agent 更新链路 —— capture / propose 到底怎么落地

> 早期把 `capture`/`propose`/`accept` 当三个黑箱动词写,没定提案区结构、
> 提案粒度、校验关卡。本节补全 —— 这是「agent 能否合理更新」的实际链路。

### 提案区 = Git 分支

`content/` 是一个 Git 仓(承修订 B「版本控制靠 Git」—— 同一条 Git 线,
不是新增依赖)。agent 的每次 `capture`/`propose`:

1. `silan-viking-mcp` 从 `content/` 的主分支切一个**提案分支**
   `proposal/<id>` —— `id` 用 **ULID**(带时间排序性,`silan proposal list`
   按时间排正好用;不用「hash+时间戳」拼接,那种会碰撞)。
2. agent 的草稿**按正式 `content/` 的同一结构**写进该分支 —— 新建 Item 就
   建 `content/resources/{type}/{slug}/` 目录 + Part 文件;改 Item 就改对应 Part 的
   `.md`。提案分支里的文件结构与真相源**完全一致**(§1.3 的 Item/Part/File)。
3. `accept` / `reject` 的完整流程见下「accept 流程」—— **不是**一句
   `git merge` 就完事。

> 好处:提案天然版本化、可 `git diff` 看 agent 改了什么、merge 干净。
> 代价:MCP server 运行环境需 Git,`content/` 需先 `git init` —— 这与
> 修订 B 是同一条 Git 线,自洽。

### 提案粒度 —— 锚到 Part

`propose(uri, draft)` 的 `uri` 支持两级锚定:

| uri 形态 | 含义 |
|---|---|
| `silan://resources/ideas/<slug>` | 提案整个 Item(新建,或大改)|
| `silan://resources/ideas/<slug>/progress` | **只提案 `progress` 这个 Part(tab)** |

锚到 Part 时,提案分支里**只动那一个 `parts/<role>/` 目录**(其多语言变体),
其余 Part 不碰。agent「只补 Progress 这个 tab」是一次最小改动 —— `git diff`
也只显示那一个文件。这依赖 §1.3 的 `Part` 模型:Part 是可独立寻址的单元。

> 多语言:`propose` 可只提一个 Part 的某个语言 representation(只改
> `parts/progress/zh.md`,不动 `en.md`)
> —— `Parsed` 的多语言结构(§1.8.0)允许部分语言缺省,缺的语言保持原样。

### 两道校验 —— 提交时一道,accept 时一道

agent 写的草稿,结构对不对由**校验**保证,不靠人肉看。关键:提案分支有寿命,
待审期间 `content/` 主分支会变(owner 也在改),所以**校验要做两次**。

**校验①(propose 提交时)** —— 对提案分支跑 `Parser::validate` + SCHEMA
结构校验(frontmatter 字段齐不齐、Part 文件名合不合 §1.3.1 type 定义)。
结果存进提案元数据,`silan proposal list` 里校验不过的标红。这道是**早反馈**,
让 agent 当场知道写歪了。

> 但校验① **不算数到 accept** —— 它基于切分支那一刻的旧主分支。主分支之后
> 变了(owner 删了某个被引用的 Item、改了 SCHEMA),提案可能不再合规。

### accept 流程 —— 临时区 merge + 校验,过了才推进主分支指针(载重)

`silan proposal accept <id>` **不是**一句 `git merge`。关键不变量:**主分支只有
两态 —— 「没动」或「变成已验证结果」,中间态不存在**。要做到这一点,
merge 和校验**绝不在主分支上做**(在主分支 merge 再回滚 = HEAD 真实动过、
并发下会丢 commit、且校验耗时期间存在"已 merge 未验证"窗口 —— 不原子)。

正确流程,merge + 校验在**临时工作区**(`git worktree`)上做:

```
1. git worktree 拉一个临时工作区,基于当前主分支 HEAD。
2. 在临时区:git merge proposal/<id>(产生一个 merge commit —— 它是
   「谁的提案、何时合的」的真实历史记录,保留)。
   有冲突 → accept 报错退出。主分支从头没动过。
   silan proposal show <id> 列出冲突文件;silan 用 silan proposal rebase <id>
   把提案分支重对到最新主分支,或手动解冲突 —— 冲突是 agent 提案与 silan
   改动的内容分歧,只有内容 owner 能裁决,引擎不自动 rebase(不替人做内容取舍)。
3. 临时区 merge 成功 → 校验②:对临时区的 merge 结果跑 Parser::validate + SCHEMA。
   不过 → 报错。主分支从头没动过。
4. 校验②过 → 把主分支指针**一次性推进**到临时区那个已验证的 merge commit
   (`git update-ref`)。主分支此刻直接变成「已验证结果」,无任何中间提交。
* 出口清理:第 1 步建的临时 worktree,在 accept 结束时**无条件清理**
  (`git worktree remove`)—— 成功、校验失败、merge 冲突三条出口都清。
  实现上用 RAII / `defer` 保证,不靠每条路径手动记得(见 §1.5 资源生命周期)。
```

- **真原子的来源**:merge 和校验全程在临时 worktree 完成,主分支 HEAD
  **直到第 4 步才动一次**,且那一次是「指针一次性指向一个已验证 commit」——
  不是 fast-forward(第 2 步的 merge 已产生 merge commit,主分支与临时区
  已分叉,谈不上 ff),是 `update-ref` 式的指针原子推进。原子性**不靠 ff**:
  靠「主分支指针只动一次、动之前结果已校验过」。失败路径(冲突 / 校验不过)
  主分支**一字未改** —— 不存在"merge 进主分支又 reset"那种伪原子。
- **校验②(基于临时区 merge 结果)是真正的关卡** —— 它看的是"提案合进
  主分支后的样子",不是提案自己。挡得住"提案陈旧后合进去变脏"。
- 第 4 步推进指针前,若主分支 HEAD 已被并发推进(单租户多设备),临时区
  那个 merge 不再基于最新主分支 → accept 报错,silan 重跑(或先 `rebase`)。
  并发下绝不丢 commit。

`silan proposal rebase <id>`(CLI):把提案分支重对到最新主分支,处理陈旧提案。
`rebase` 自身可能产生冲突 —— 与 `git rebase` 标准交互一致:停在冲突态,
silan 手动解完后 `silan proposal rebase --continue`。它是 silan 手动调的命令,
他在场,冲突由他裁决。

> `accept`/`reject`/`rebase` 仍是 **CLI 人专属**,不暴露给 agent(#13)。
> 校验是机器的、accept 是人的 —— 机器保证结构对,人保证内容值得收、人裁决冲突。

## §3.2 MCP 实现级合同 —— JSON schema / 错误码 / resources

> 本节是 `10`§10.8.2 的补齐项。M9 写 `silan-viking-mcp` 时以本节为
> 工具签名来源;若 M0 `SCHEMA.md` 字段名有变,M8 只允许同步本节,不能在代码里
> 另起一套隐式合同。

### 通用返回形态

所有工具返回 JSON object。成功返回业务字段;失败返回统一错误:

```json
{
  "error": {
    "code": "not_found",
    "message": "human readable summary",
    "uri": "silan://resources/ideas/example"
  }
}
```

错误码闭集:

| code | 触发 |
|---|---|
| `invalid_request` | 参数类型/必填字段不对,或 `type` 不在 6 个 content type 闭集 |
| `not_found` | URI / Item / Part 不存在 |
| `permission_denied` | `ctx_write` 写 `resources/`,或未开启 deploy 时调用 `deploy` |
| `validation_failed` | `capture`/`propose` 生成的提案未过 SCHEMA 校验 |
| `conflict` | 提案触碰同一 Part、Git 冲突、expected OID 不匹配 |
| `backend_unavailable` | stats 远程 Go API / 本地 Git / SQLite 不可用 |

### 只读工具 schema

```json
{
  "recall": {
    "input": { "query": "string", "limit": "integer?", "scope": "uri[]?" },
    "output": { "items": [{ "uri": "uri", "title": "string", "summary": "string", "score": "number", "matched_parts": ["string"] }] }
  },
  "list": {
    "input": { "type": "idea|blog|project|episode|resume|update", "filter": "object?", "limit": "integer?", "cursor": "string?" },
    "output": { "items": [{ "uri": "uri", "slug": "string", "title": "string", "status": "string", "visibility": "string", "updated_at": "string?" }], "next_cursor": "string?" }
  },
  "browse": {
    "input": { "uri": "uri" },
    "output": { "entries": [{ "uri": "uri", "kind": "namespace|collection|item|part|file", "name": "string" }] }
  },
  "read": {
    "input": { "uri": "uri" },
    "output": { "uri": "uri", "mime": "string", "content": "string" }
  },
  "context_brief": {
    "input": {},
    "output": { "project": "string", "schema_version": "integer", "content_commit": "string", "brief": "string", "suggested_next_reads": ["uri"] }
  },
  "lint": {
    "input": { "uri": "uri?" },
    "output": { "issues": [{ "level": "fatal|warn|info", "uri": "uri", "message": "string" }] }
  }
}
```

`filter` 的键只允许 `status`、`visibility`、`updated_after`、`updated_before`、
`tag`。未知键返回 `invalid_request`,不静默忽略。

### stats 工具 schema

```json
{
  "stats": {
    "input": { "uri": "uri", "section": "string?" },
    "output": { "uri": "uri", "views": "integer", "likes": "integer", "comments": "integer", "updated_at": "string" }
  },
  "visitors": {
    "input": { "uri": "uri", "limit": "integer?", "cursor": "string?" },
    "output": { "visitors": [{ "visitor_id": "string", "ip_masked": "string", "visitor_kind": "human|search_bot|ai_bot|unknown", "referrer_kind": "string", "last_seen_at": "string" }], "next_cursor": "string?" }
  },
  "crawler_breakdown": {
    "input": { "uri": "uri?" },
    "output": { "items": [{ "crawler": "string", "count": "integer", "last_seen_at": "string?" }] }
  },
  "source_breakdown": {
    "input": { "uri": "uri?" },
    "output": { "items": [{ "source": "search|social|ai_chat|direct|internal|unknown", "count": "integer" }] }
  }
}
```

MCP 侧永不返回原始 IP / 完整 fingerprint;只返回脱敏字段,同 `08`§8.4。

### 写入与提案工具 schema

```json
{
  "capture": {
    "input": { "note": "string", "type": "idea|blog|project|episode|resume|update", "lang": "string?", "title": "string?", "tags": ["string"] },
    "output": { "proposal_id": "string", "branch": "proposal/<id>", "created_uri": "uri", "validation": "passed|failed", "issues": ["string"] }
  },
  "propose": {
    "input": { "uri": "uri", "draft": "string", "lang": "string?", "message": "string?" },
    "output": { "proposal_id": "string", "branch": "proposal/<id>", "touched": ["uri"], "validation": "passed|failed", "issues": ["string"] }
  },
  "summarize_updates": {
    "input": { "since": "string?", "scope": "uri[]?" },
    "output": { "proposal_id": "string", "created_uri": "uri", "summary": "string", "validation": "passed|failed" }
  },
  "ctx_read": {
    "input": { "uri": "uri" },
    "output": { "uri": "uri", "content": "string", "updated_at": "string?" }
  },
  "ctx_write": {
    "input": { "uri": "uri", "content": "string", "mode": "replace|append" },
    "output": { "uri": "uri", "content_hash": "string", "written_at": "string" }
  },
  "ctx_brief": {
    "input": {},
    "output": { "brief": "string", "source_uris": ["uri"] }
  },
  "reflect": {
    "input": { "session": "string" },
    "output": { "written": ["uri"], "content_hashes": ["string"] }
  }
}
```

`ctx_write.uri` 必须以 `silan://agent/` 开头;否则返回 `permission_denied`。
`capture`/`propose` 永远返回提案信息,不返回“已发布/已合并”。

### initialize 与 MCP resources

`initialize.instructions` 固定模板:

```text
This MCP server exposes silan-viking, silan's personal context system.
First call context_brief(). Published resources are read/propose only.
Agent memory under silan://agent/ may be updated with ctx_write.
Never accept, publish, or deploy without an explicit owner CLI action.
Schema version: <schema_version>. Content commit: <content_commit>.
Useful resources: silan://schema, silan://overview, silan://agent/brief.
```

只读 resources:

| URI | MIME | 返回体 |
|---|---|---|
| `silan://schema` | `text/markdown` | 当前 `content/SCHEMA.md` |
| `silan://overview` | `text/markdown` | 项目 identity、6 type 清单、常用 URI |
| `silan://agent/brief` | `text/markdown` | `ctx_brief()` 的静态快照 |

## 档 4 — 危险:生产副作用(#11)

| MCP tool | 默认 | 作用 |
|---|---|---|
| `deploy()` | **关闭** | 部署到网站。需 `silan mcp serve --enable-deploy` 显式开启;且强制 dry-run + owner 确认 |

> `publish`(把 Item 设 public)**不**给 agent —— 「选择性发布」的选择权只在
> silan 手里(#13 单租户的安全边界)。agent 能 `propose` 内容,不能决定它公开。

## MCP 安全总则(单租户,#13)

- agent 对 `silan://resources/`(发布内容):能**读**、能**捕捉/提案**(进
  隔离 Git 分支),**不能直接写**、**不能设 public**、默认**不能**部署。
- agent 对 `silan://agent/`(agent context,§1.2.1):能**直接读写**(`ctx_read`/
  `ctx_write`)—— 那是 agent 自己的记忆,不走提案。但它 `is_publishable()==false`,
  **永不发布**。
- `resources/` 真相源的每一次变更,都经过 silan 在 CLI 侧的一次显式动作。
- 这样:终局「捕捉想法」「协助写作」「context 增强」全部成立,而「`resources/`
  markdown 为真相源 + owner 是作者 + 选择性发布」的根基(#1 #12 #13)一寸不破。

## 代码落点

`silan-viking-mcp` crate(L4 adapter,见 `01-oop结构.md` §1.9):
- `server.rs` — MCP server 进程
- `tools.rs` — 四档 ability,全部转调 `Workspace` 的方法,不存在第二套逻辑。
