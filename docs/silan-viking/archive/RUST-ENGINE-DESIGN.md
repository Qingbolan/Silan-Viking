# silan-viking — 知识体引擎(Rust)设计

> **先读 [`VISION.md`](./VISION.md)。** 那是终局;本文档是抵达终局的引擎设计。
> 二者冲突,以 `VISION.md` 为准。
>
> 本文档**从终局倒推**:先定本体论(§1),再定磁盘契约(§2)、工程结构(§3)、
> 流程(§4)、不变量(§5)、测试(§6)、里程碑(§7)。不含实现代码。

---

## 0. 这个引擎为什么存在

`VISION.md` 的终局是一个**会生长的知识体**:人写 markdown,agent 当园丁,
对外是网站、对内是第二大脑。这个知识体需要一个运行时——这就是 `silan-viking`。

它取代当前过程式的 Python `silan`(约定藏在代码里、无对象、无关系建模)。
之所以值得重写,是因为终局的五条「优美」判据(`VISION.md` §3)——内容是对象、
关系是一等公民、记忆与发布共享引擎、人与 agent 同一能力面、真相是纯文本——
**没有一条能在过程式脚本里自然成立**。它们要求一套领域模型,这就是 §1。

引擎的设计思路参考了 OpenViking(`silan://` 寻址、L0/L1/L2 分层、目录递归检索、
会话自进化)与 Karpathy LLM Wiki(markdown 真相源、LLM 维护索引与关系)。
但 `silan-viking` 不是它们的复制——它是为 `VISION.md` 那个知识体量身设计的。

**与现有代码的关系**:Go 后端不变(它消费引擎产出的 SQLite);Python `silan`
在引擎跑通前保留为 fallback,之后由 L4 对拍测试(§6)背书后退役。

### 命名空间总览

知识体是一组 `silan://` 命名空间,每个是一棵树。本文档的里程碑覆盖前两个:

| 命名空间 | 是什么 | 可变性 | 里程碑 |
|---|---|---|---|
| `silan://resources/` | 对外发布内容(blog/series/collections/projects/ideas/resume)| 只读(人改 markdown)| M3–M7 |
| `silan://agent/` | agent 的记忆,会自我进化 | 可变(agent 自更新)| M8 |
| `silan://user/` | 个人偏好层 | 可变 | 对象模型预留,暂不实现 |

为什么是命名空间而非特例:`VISION.md` §3.3 ——「记忆和发布共享一套引擎、
分属两个世界」。命名空间就是这句话的落地,可变性是它们唯一的差异(§1)。

---

## 1. 系统定位与对象模型(OOP)

### 1.1 设计范式 — 这是一个 OOP 引擎

对齐 EasyNet 的对象本体论(`facade/cli/mod.rs`:"core abstraction is
object-oriented... objects with public abilities and private skills")。
本引擎的核心**不是流水线函数**,而是一组有封装边界的对象。一条规则贯穿全设计:

> **行为属于对象,不属于自由函数。** 解析、分层、检索、写出 —— 每个动作都是
> 某个领域对象的方法;crate 按**对象族**切分,不按技术层切分。

### 1.2 核心对象模型

```
        ┌──────────────┐  拥有 N 个   ┌──────────────────────────────┐
        │   Engine     │─────────────▶│  «trait» Namespace           │
        │ (聚合根)     │              │  - root_uri()                │
        │  +propose()  │              │  - mount() / sync()          │
        └──────┬───────┘              │  - query(&Query)             │
               │                      │  - is_mutable()    ┐能力探询 │
               │ 持有                 │  - accepts_proposals()? ┘     │
               ▼                      └───────────┬──────────────────┘
   ┌───────────────────────┐                      │ 实现
   │  EmbedderPort «trait» │          ┌───────────┴───────────┐
   │  StoragePort «trait»  │          ▼                       ▼
   │  (依赖倒置:外部能力)│   ResourceNamespace        AgentNamespace
   └───────────────────────┘   is_mutable=false          is_mutable=true
                                accepts_proposals=true   (M8,可自更新记忆)
                                       │ 含 N 个
                                       ▼
                              ┌────────────────────────┐
                              │  «trait» ContextNode   │  ← 条目的统一抽象
                              │  - uri: SilanUri       │
                              │  - l0/l1/l2()  (惰性)  │
                              │  - relations()->[Relation]
                              └───────────┬────────────┘
                  ┌───────────────┬───────┴───────┬───────────────┐
                  ▼               ▼               ▼               ▼
              Entry           SeriesContainer  Collection      Episode
          (blog/idea/        (容器系列:有序   (松散合集:按序   (容器系列的
           project 单篇)      Episode 子节点)   引用散落 Entry)   有序成员)
```

**对象职责(每个都是 class,带方法,有不变量):**

| 对象 | 是什么 | 关键方法 | 封装的不变量 |
|---|---|---|---|
| `Engine` | 聚合根。持有所有 Namespace 与外部端口 | `namespace(uri)`、`sync_all()`、`query()`、`propose()` | 唯一对外入口;adapter 只能经它访问 |
| `Namespace` (trait) | 一棵 silan:// 树的抽象 | `mount`、`sync`、`query`、`is_mutable`、`accepts_proposals` | 命名空间边界 = 封装边界;能力探询决定可否被 Agent 写 |
| `ResourceNamespace` | 只读发布内容(blog/idea/project/resume) | 实现上述 | `is_mutable()==false`(Agent 不能直接改);`accepts_proposals()==true`(可走提案区) |
| `AgentNamespace` (M8) | 可自我更新的 Agent 记忆 | 多 `remember(...)`、`reflect(...)` | `is_mutable()==true`,有自进化循环 |
| `Proposal` | 值对象:Agent 草稿的隔离副本(id/目标 uri/draft/状态) | `accept`、`reject`(经 CLI) | 未 `accept` 前,一字不进真相源;`accept/reject` 不暴露给 Agent |
| `ContextNode` (trait) | 条目的统一抽象,L0/L1/L2 是它的三个视图 | `l0/l1/l2`(惰性)、`relations` | L2 是真相,L0/L1 是派生视图,不可脱离 L2 独存 |
| `Entry` | 独立单篇。`kind ∈ {blog, vlog, idea, project}` | 实现 `ContextNode`;`vlog` 变体带 `video` 字段 | 可被 `Collection` 引用、可有演化边 |
| `SeriesContainer` | 容器系列(连载教程/vlog 系列),拥有有序 `Episode` | `episodes()`(有序) | episode 是私有成员,**不进 blog 列表** |
| `Episode` | 容器系列的有序成员 | 实现 `ContextNode` | 只属于一个 `SeriesContainer`,序由目录名前缀决定 |
| `Collection` | 松散合集,按序**引用**散落的 `Entry` | `members()`(有序、可悬空检测)、`promote()` | 不拥有成员;成员仍独立、可被多个 Collection 引用;`promote` 可转为 `SeriesContainer`(§2.2)|
| `Relation` | 值对象:有向有类型的边(`from`/`to`/`type`)| — | `type ∈ {evolved-from/into, documents, references, supersedes}`;`lint` 检测悬空 |
| `SilanUri` | 值对象,`silan://<ns>/<path>` | `parse`、`namespace`、`join` | 不可变;非法 URI 构造不出来 |
| `Abstract/Overview/Body` | L0/L1/L2 的类型,各是值对象 | — | 类型系统区分三层,编译期防止混用 |

### 1.3 端口与适配器(依赖倒置)

核心领域对象**不依赖**具体的存储/嵌入/接口实现。它们依赖 trait(端口):

- `StoragePort` — 读写磁盘 / 写出 portfolio.db。实现:`FsStorage`、`SqliteSink`。
- `EmbedderPort` — 文本 → 向量。实现:`LocalEmbedder`、`ApiEmbedder`、`NullEmbedder`。

引擎对外有**两个适配器**(你定的「核心 + 双接口」):

```
            ┌──────────────┐   ┌──────────────┐
            │ CliAdapter   │   │ SkillAdapter │   ← 两个 inbound adapter
            │ (sv …)   │   │ (EasyNet     │      共享同一个 Engine
            └──────┬───────┘   │  ability +   │
                   │           │  MCP server) │
                   └─────┬─────┴──────┬───────┘
                         ▼            ▼
                    ┌─────────────────────┐
                    │      Engine         │  ← 领域核心,不知道 CLI/MCP 存在
                    └─────────────────────┘
```

`SkillAdapter` 把 `Engine` 的方法暴露为 **agent 可调用的 ability**(见 §1.4),
同时起一个 MCP server。`CliAdapter` 把同样的方法暴露为 `sv` 命令(§3.5)。
**两个 adapter 调用完全相同的 Engine 方法 —— 不存在两套逻辑。**

### 1.4 作为 EasyNet skill:Agent 如何检索与更新

引擎对 Agent 暴露一组 **ability(public 方法)**,Agent 永远经 ability 调用,
不直接碰文件 —— 这就是 EasyNet 的封装不变量(skill 私有,ability 公开)。

ability 分三类,**可变性由命名空间决定,不由 ability 决定**:

| Ability | 类别 | 对应方法 | resources(只读发布内容)| agent(可变记忆)|
|---|---|---|---|---|
| `recall(query)` | 检索 | `Engine::query` | ✅ 查发布内容 | ✅ 查记忆 |
| `browse(uri)` | 检索 | `Namespace::ls/tree` | ✅ | ✅ |
| `read(uri, tier)` | 检索 | `ContextNode::l0/l1/l2` | ✅ | ✅ |
| `lint()` | 只读分析 | `Engine::lint` | ✅ 内容体检 | ✅ |
| `check()` | 只读分析 | `Engine::site_check` | ✅ 发布前检查 | — |
| `remember(note)` | 直接写 | `AgentNamespace::remember` | ❌ 拒绝 | ✅ 直接写记忆 |
| `reflect(session)` | 直接写 | 自进化循环 | ❌ 拒绝 | ✅ 会话末抽取记忆 |
| `propose(uri,draft)` | **提案** | `Engine::propose` | ✅ 写入隔离提案区 | ✅(也可提案)|
| `summarize_updates()` | **提案** | `Engine::propose` | ✅ 生成 changelog 草稿(走提案)| — |
| `build()` | 副作用 | `Engine::site_build` | ✅ 构建前端/预览 | — |
| `deploy()` | **生产副作用** | `Engine::site_deploy` | ⚠️ 默认关,需 `--enable-deploy`(§3.6.1)| — |

> 你想让 Agent 帮忙的四件事 —— **内容体检** `lint()`、**发布前检查** `check()`、
> **内容起草/翻译** `propose()`、**动态汇总** `summarize_updates()` —— 全部落在
> 「只读」或「写隔离区」档:Agent 全程不碰真相源、不碰生产,天然安全。
> `deploy()` 是唯一生产危险项,单独 feature-gate。

> **检索**:对两个命名空间都开放 —— Agent 既能查你的发布内容,也能查记忆。
>
> **直接写(`remember`/`reflect`)**:只对 `is_mutable()==true` 的命名空间生效。
> Agent 的记忆库可被 Agent 自我更新(OpenViking 自进化);发布内容拒绝。
>
> **提案(`propose`)** —— 这是「Agent 帮我更新发布内容」的安全通道:
> Agent **不直接改** `content/*.md`,而是把草稿写进隔离的提案区
> (`content/.proposals/<id>.md` 或一个 Git 分支)。`ResourceNamespace`
> 仍然 `is_mutable()==false`,但 `accepts_proposals()==true`。

### 1.4.1 提案通道 —— Agent 帮你写,你始终是作者

```
Agent ──propose(uri, draft)──▶ Engine ──▶ content/.proposals/<id>.md  (隔离区)
                                                   │
你 review ─ sv proposal accept/reject <id> ────┘──▶ 合并进 content/*.md
            (CLI 专属动词,不暴露给 Agent)            (你署名,走 Git)
```

载重不变量:
- `accept` / `reject` 是 **CLI 专属**(人执行),**绝不**作为 ability 暴露给 Agent。
- Agent 能 `propose` 无数次,但一字进不了真相源,除非你 `accept`。
- 这同时满足你两个诉求:Agent 能帮你起草/改 blog/idea ✅;
  「markdown 为真相源 + 你是作者 + 走 Git」的根基不破 ✅。

### 1.5 引擎的两个出口(职责不变,换 OOP 表述)

1. **同步出口** — `Engine::sync_all()` 经 `SqliteSink` 写出 `portfolio.db`,喂现有 Go API。
2. **检索出口** — `Engine::query()`,经 `CliAdapter` 或 `SkillAdapter` 对外。

旧 Python `silan` 在同步出口跑通前一直是 fallback。

---

## 2. 磁盘结构 — `content/` 仓(SCHEMA 第一部分)

> 这是「先定 SCHEMA」的核心产出。引擎按此结构读写。

```
content/                          # = silan://  根
├── SCHEMA.md                     # 约定文档(本节的人类可读版,LLM 也读它)
├── index.md                      # 引擎维护:全站目录,每行一个 L0
├── log.md                        # 引擎维护:append-only 操作日志
│
├── blog/                         # = silan://resources/blog/  独立单篇
│   ├── .abstract / .overview     # L0 / L1:本集合
│   └── welcome/                  # 一篇 = 一个目录(条目)
│       ├── index.md              # L2 正文 + frontmatter(主文件)
│       ├── .abstract / .overview # L0 / L1:引擎生成(派生,可重建)
│       ├── .meta.toml            # 引擎缓存:hash/embedding 指针/ingest 时间
│       └── assets/               # 图片等附件
│
├── series/                       # = silan://resources/series/  容器系列(vlog/教程)
│   └── rust-tutorial/            # 一个 SeriesContainer = 一个目录
│       ├── index.md              #   系列本身:frontmatter(标题/简介/封面)+ L2
│       ├── .abstract / .overview #   L0 / L1:系列级
│       ├── ep-01-setup/          #   episode = 子目录条目,有序(文件名前缀定序)
│       │   └── index.md + L0/L1
│       └── ep-02-content/
│           └── index.md + L0/L1
│       # episode 只属于本系列,不出现在 blog 列表(见 §2.1)
│
├── collections/                  # = silan://resources/collections/  松散合集
│   └── papers-i-read/            # 一个 Collection = 一个条目(不含成员目录)
│       └── index.md              #   frontmatter 的 `members:` 按序引用散落 blog
│
├── projects/                     # = silan://resources/projects/
│   └── <slug>/index.md + 同上
├── ideas/                        # = silan://resources/ideas/
│   └── <slug>/{index.md, notes.md, references.md, timeline.md} + L0/L1
└── resume/
    └── {personal,education,experience,...}.md
```

### 2.1 两类系列 + 演化关系(SCHEMA 的关系部分)

你的内容有两种关系,引擎用**不同对象**建模 —— 见 §1.2 的 `SeriesContainer`/
`Collection`/`Relation`:

| 关系 | 对象 | 形态 | 成员归属 |
|---|---|---|---|
| **容器系列**(vlog、连载教程)| `SeriesContainer` | `series/<name>/` 目录,episode 是有序子目录 | episode **只属于该系列**,不进 blog 列表 |
| **松散合集**(如「我读过的论文」)| `Collection` | `collections/<name>/` 单条目,`members:` 按序引用 | 被引 blog **仍是独立 blog**,可被多个 Collection 引用 |
| **演化链**(idea→blog→project)| `Relation` 有向边 | 不占目录,在 frontmatter 声明 | 三者各自独立条目,边带类型与方向 |

**进 `portfolio.db` 的规则(供 Go API):**
- 容器系列:作为**一个系列卡片**出现在 blog 列表;单集 episode 不单独进列表。
- 松散合集:`Collection` 本身是一个可列出的条目;成员 blog 照常各自进 blog 列表。
- 演化边:写入一张 `content_relation` 表(`from`/`to`/`relation_type`),前端图谱用。

### 2.2 系列的两种来源 —— Collection 可 promote 成容器

一个内容什么时候是 `Collection`、什么时候是 `SeriesContainer`,取决于**它怎么诞生**:

| 诞生路径 | 用哪个对象 |
|---|---|
| 先规划好一个连载/vlog 系列,再一集集填 | `SeriesContainer`(一开始就是容器)|
| 先写了若干散落 blog,**事后**发现能成系列 | `Collection`(引用式,不挪文件)|

事后聚成的系列若后来变成强连续(读者该顺序看完),引擎提供:

```
sv content promote <collection-slug>
```

`Collection::promote()` 做的事:
1. 把被引成员 `Entry` 从 `blog/` 物理迁入 `series/<slug>/ep-NN-*/`
2. 在每个迁移条目留一个 **URL 重定向**(旧 `blog/<slug>` → 新 episode URI),保 URL 不死
3. 迁移走 `git mv`,Git 历史延续
4. `Collection` 条目转写为 `SeriesContainer` 的 `index.md`

> 这解决了「引用式 vs 容器式」的真实张力:**默认引用(零成本、不挪文件),
> 只有当一个合集真的成熟为强连续系列时,才一次性 promote。** 不强迫你预先决定。
> `promote` 是 CLI 动词(人触发),不是 ability —— 它会移动真相源文件。

### 文件角色(对应 OpenViking)

| 文件 | 层 | 谁写 | 进 Git? |
|---|---|---|---|
| `index.md`(条目)正文 + frontmatter | **L2** | **人**(或 LLM 起草) | ✅ 真相源 |
| `.abstract` | **L0** | **引擎**(可由 LLM 生成) | ✅ 可读、可 diff |
| `.overview` | **L1** | **引擎** | ✅ |
| `.meta.toml` | 缓存 | 引擎 | ❌ gitignore |
| `index.md`(根)/ `log.md` | 导航 | 引擎 | ✅ |

> 关键决策:`.abstract`/`.overview` 是**派生物但进 Git**。
> 理由:它们是人可读的,进 Git 能 diff「摘要怎么变的」,也让没装引擎的人能直接读懂仓库。
> 它们可随时由引擎 `rebuild` 重新生成 —— 派生但不瞬态。

### Frontmatter 语法(SCHEMA 第二部分)

**A. 普通条目(blog / vlog / idea / project)`index.md` 顶部 YAML:**

```yaml
---
# ── 身份 ──
slug: context-engine             # 唯一,= 目录名;构成 silan://resources/ideas/context-engine
title: "Silan Context Engine"
lang: en
kind: idea                       # blog | vlog | idea | project(决定它在哪个集合)

# ── 分层(L0 由引擎回填,人可不写)──
tldr: "一句话"                    # L0 种子;留空则引擎生成
summary: "一段话"                 # L1 种子

# ── 视频:仅 kind=vlog 时填(对齐 Go API 的 BlogData video 字段)──
video:                           # vlog 的 L2 正文是脚本/转写稿,视频本身在此声明
  url: "https://..."
  duration: "12:30"
  thumbnail: assets/thumb.jpg

# ── 分类 ──
tags: [rust, architecture]
status: published                # draft | published | archived
date: 2026-05-16

# ── 演化关系:有向、有类型的边(取代旧的无向 links)──
relations:
  - { type: evolved-from, to: ideas/context-engine }   # 本 project 由该 idea 演化而来
  - { type: documents,    to: ideas/context-engine }   # 本 blog 记录该 idea 的进展
# 合法 type:evolved-from / evolved-into / documents / references / supersedes

# ── 多语言 ──
i18n:
  zh: { title: "...", summary: "..." }
---
正文 markdown(L2)...
```

**B. 容器系列 `series/<name>/index.md`:**

```yaml
---
slug: rust-tutorial
title: "Rust 上手系列"
kind: series                     # 标记这是 SeriesContainer
cover: assets/cover.jpg
status: published
# episode 不在此声明 —— 引擎扫描子目录、按目录名前缀(ep-01/ep-02…)定序
---
系列总览正文(L2)...
```

> episode 的 `index.md` 是普通条目 frontmatter,`kind: episode`,可省略 `slug`
> (从目录名取)。episode 不进 blog 列表(§2.1)。

**C. 松散合集 `collections/<name>/index.md`:**

```yaml
---
slug: papers-i-read
title: "我读过的论文"
kind: collection                 # 标记这是 Collection
members:                         # 有序引用散落的独立 blog,不复制其内容
  - blog/attention-is-all-you-need
  - blog/openviking-notes
status: published
---
合集说明正文(L2)...
```

`SCHEMA.md` 会逐字段定义:必填/选填、取值域、`relations.type` 的合法值、引擎对
缺失/悬空引用的行为。**这份 SCHEMA 是引擎和人之间的契约,parser 实现必须 1:1 对应它。**

---

## 3. Rust 工程结构

Cargo workspace,新目录 `engine/`(与 `backend/` `frontend/` 平级)。

**crate 按对象族切分,不按技术层。** 每个 crate 拥有一族领域对象及其全部行为
(对象的方法就在对象旁边),而不是「所有解析在一个 crate、所有存储在另一个」。

```
engine/
├── Cargo.toml                    # workspace
├── crates/
│   ├── silan-viking-domain/            # 【领域核心】所有领域对象 + 其方法
│   │   ├── uri.rs                #   SilanUri 值对象:parse/namespace/join
│   │   ├── tier.rs               #   Abstract/Overview/Body(L0/L1/L2 各一类型)
│   │   ├── node.rs               #   ContextNode trait + Entry/SeriesContainer/Collection/Episode
│   │   ├── relation.rs           #   Relation 有向边 + 关系图(正反向)
│   │   ├── schema.rs             #   frontmatter 对象(serde),= SCHEMA.md 契约
│   │   └── ports.rs              #   StoragePort / EmbedderPort trait(依赖倒置)
│   │
│   ├── silan-viking-namespace/         # 【命名空间对象族】Namespace trait + 实现
│   │   ├── traits.rs             #   «trait» Namespace:mount/sync/query/is_mutable
│   │   ├── resource.rs           #   ResourceNamespace(本期实现,只读)
│   │   └── agent.rs              #   AgentNamespace(M8,可变,带 remember/reflect)
│   │
│   ├── silan-viking-engine/            # 【聚合根】Engine 对象
│   │   ├── engine.rs             #   Engine:持有 namespaces + ports,唯一对外入口
│   │   ├── sync.rs               #   Engine::sync_all 的实现细节
│   │   └── reflect.rs            #   自进化循环骨架(未来,服务 AgentNamespace)
│   │
│   ├── silan-viking-infra/             # 【端口实现】adapter 到外部世界
│   │   ├── fs_storage.rs         #   FsStorage : StoragePort(content/ 读写)
│   │   ├── sqlite_sink.rs        #   SqliteSink : StoragePort(写 portfolio.db)
│   │   └── embedder.rs           #   Local/Api/Null Embedder : EmbedderPort
│   │
│   ├── silan-viking-cli/               # 【inbound adapter 1】`viking` 命令行 binary
│   │   ├── main.rs               #   构造 Engine → 分发到 groups
│   │   ├── banner.rs
│   │   └── groups/               #   noun-first 分组(对齐 EasyNet-Cli §3.5)
│   │       ├── mod.rs            #     聚合 + 顶层 Command 枚举
│   │       ├── content.rs        #     sv content <verb>
│   │       ├── index.rs          #     sv index <verb>
│   │       └── query.rs          #     sv query <verb>
│   │
│   └── silan-viking-skill/             # 【inbound adapter 2】EasyNet skill + MCP server
│       ├── abilities.rs          #   recall/browse/read/remember/reflect → Engine
│       └── mcp.rs                #   MCP server,把 abilities 暴露给任意 agent
│
└── tests/                        # e2e 测试(见 §6)
    └── fixtures/                 #   测试用的迷你 content/ 仓
```

**依赖方向(单向,核心不依赖外围):**

```
silan-viking-cli ─┐
            ├─▶ silan-viking-engine ─▶ silan-viking-namespace ─▶ silan-viking-domain
silan-viking-skill┘         │                                   ▲
                      └────────── silan-viking-infra ────────────┘
                                  (实现 domain 的 ports)
```

`silan-viking-domain` 不依赖任何其他 crate —— 领域核心纯净。`silan-viking-infra` 实现 domain
定义的 port trait。两个 adapter(cli/skill)只依赖 `silan-viking-engine`。
**这保证:换存储、换 embedding、加一个新 adapter,都不动领域核心。**

> `silan-viking-cli/groups/` 的布局对齐 EasyNet-Cli 的 `facade/cli/groups/` —— 见 §3.5。
> `silan-viking-skill` 对齐 EasyNet 的 skill/ability 模型 —— 见 §1.4。

### 关键依赖(建议,非强制)

| 用途 | crate |
|---|---|
| frontmatter / 序列化 | `serde`, `serde_yaml`, `toml` |
| markdown | `pulldown-cmark` |
| 错误处理 | `thiserror`(库), `anyhow`(CLI) |
| CLI | `clap` |
| 向量缓存 | `rusqlite` + `sqlite-vec` 扩展 |
| 异步(embedding HTTP)| `tokio`, `reqwest` |
| 测试 | `insta`(快照), `assert_cmd`(CLI e2e), `tempfile` |

### embedding 设计

`silan-viking-domain/ports.rs` 定义 `EmbedderPort` 端口(依赖倒置),
具体实现在 `silan-viking-infra/embedder.rs`:

```
// 端口在领域核心,实现在 infra —— 核心不知道用的是本地还是 API。
trait EmbedderPort { fn embed(&self, text: &str) -> Vec<f32>; }
```

实现可插拔:
- `LocalEmbedder` — 本地小模型(默认,无网络,确定性)
- `ApiEmbedder` — OpenAI/其他(可选)

> 借鉴 Karpathy「内容量小可不上 RAG」:`find` 默认先走 `grep` + 标题/tag 匹配,
> 向量检索是**可选增强**。embedding 不可用时引擎仍完全可用。

---

## 3.5 CLI 样式 — 对齐 EasyNet-Cli

`sv` CLI(binary `silan-viking`) 的命令组织、代码布局、输出风格,**全部对齐 `~/Documents/GitHub/EasyNet-Cli`**
(同为 Silan Hu 的 Rust CLI,已有成熟章法)。以下是从该仓库实测提炼的对齐规范。

### 3.5.1 命令组织 — noun-first 分组

EasyNet-Cli 的核心约定:**`<binary> <noun> <verb>`**,不用扁平动词列表
(原因:20+ 扁平动词逼用户死记;同一名词的操作散落在 help 各处)。

`sv` 顶层按名词分三组:

```
sv content <verb>         # 内容条目操作
  ├─ ls        列出某 silan:// 路径下的条目
  ├─ tree      层级浏览
  ├─ show      显示一个条目的 L0/L1/L2
  ├─ new       从模板起草一个新条目(--kind blog|vlog|idea|project)
  └─ promote   把一个 Collection 升级为容器系列(§2.2,会 git mv 真相源)

sv index <verb>           # 索引 / 派生层
  ├─ sync      扫描 content/ → 重建 L0/L1/index.md → 写 portfolio.db
  ├─ rebuild   删派生层后全量重建(幂等性验证)
  ├─ lint      扫描矛盾 / 过期声明 / 悬空演化边 / 孤立条目
  └─ relations 打印某条目的正反向演化边

sv query <verb>           # 检索
  ├─ find      OpenViking 式递归语义检索
  └─ grep      文本匹配

sv doctor                 # 跨层健康检查(见 3.5.4)
sv completion <shell>     # 生成 shell 补全
```

> §4 的核心流程(sync / find / rebuild …)即挂在这些名词组下,
> 全名为 `sv index sync`、`sv query find` 等。

### 3.5.2 代码布局

对齐 EasyNet-Cli 的 `facade/cli/groups/`:**一个名词一个文件**,每个文件自带
`<Group>Args`(clap `#[derive(Args)]`,持 `#[command(subcommand)]`)+
`<Group>Action` 枚举 + `run()` 入口。`groups/mod.rs` 聚合并暴露顶层 `Command`。

```rust
// silan-viking-cli/groups/index.rs   —— 示意,本期不实现
#[derive(Debug, Args)]
pub struct IndexArgs {
    #[command(subcommand)]
    pub action: IndexAction,
}

#[derive(Debug, Subcommand)]
pub enum IndexAction {
    /// 扫描 content/,重建 L0/L1/index.md,并写出 portfolio.db。
    Sync(SyncArgs),
    /// 删除所有派生层后从 L2 全量重建(验证幂等)。
    Rebuild(RebuildArgs),
    /// 扫描矛盾、过期声明、悬空演化边、孤立条目。
    Lint(LintArgs),
    /// 打印某条目的正向 / 反向链接。
    Links(LinksArgs),
}

pub fn run(args: IndexArgs) -> anyhow::Result<()> {
    match args.action {
        IndexAction::Sync(a)    => sync::run(a),
        IndexAction::Rebuild(a) => rebuild::run(a),
        IndexAction::Lint(a)    => lint::run(a),
        IndexAction::Links(a)   => links::run(a),
    }
}
```

每个 action 变体的 `///` 文档注释**就是** clap 的 help 文本 —— 写注释即写帮助。

### 3.5.3 文件头注释规范

每个 CLI 文件统一头块,照搬 EasyNet-Cli 格式:

```
// Silan Context Engine — Index Group
// ==================================
//
// File: silan-viking-cli/groups/index.rs
// Description: `sv index …` — 索引与派生层的所有操作。
// Verbs:
//   sync     重建派生层 + 写 portfolio.db
//   rebuild  从 L2 全量重建
//   lint     一致性检查
//   links    打印双向链接
//
// Author: Silan Hu
// Copyright (c) 2026 Silan. All rights reserved.
```

### 3.5.4 输出与错误风格

| 维度 | 对齐做法 |
|---|---|
| 上色 | `console::style`;标签 `.dim()`、路径 `.cyan()`、状态 ok/warn/fail 绿/黄/红 |
| 流向 | 结果走 `stdout`;进度 / 次要信息走 `stderr`(`eprintln!`) |
| 机器可读 | 每个查询类命令提供 `--json` 旗标 |
| 错误处理 | 库 crate 用 `thiserror`;`silan-viking-cli` 用 `anyhow`;`anyhow::bail!` 报错**必须带可执行的下一步提示** |
| 诊断 | `sv doctor`:逐项 `ok/warn/fail`,全 ok/warn 退出 0、有 fail 退出 1 |

错误提示范例(对齐 EasyNet-Cli 的 `bail!` 风格):

```
no content/ directory at /path/to/content
Run `sv index sync` from your content repo root,
or pass --content <path>.
```

### 3.5.5 命名

| 项 | 名称 | 说明 |
|---|---|---|
| 项目 / 引擎 | **silan-viking** | 归入 Silan 体系;`viking` 取自 OpenViking 的 `silan://` 范式 |
| binary | `silan-viking` | 安装后注册短别名 **`sv`**(如 `kubectl`/`k`),日常用 `sv` |
| crate 前缀 | `silan-viking-*` | `-domain` / `-namespace` / `-engine` / `-infra` / `-cli` / `-skill` |
| 协议名 | `silan://` | **保留不改** —— 它是 OpenViking 的概念,不属于命名空间归属问题 |
| EasyNet skill 名 | `silan-viking` | 作为 EasyNet skill 包安装时的标识 |

> 组织/布局/输出风格全部对齐 EasyNet-Cli。若未来并入 EasyNet 生态,
> `sv` 的名词组可平滑成为 `easynet` 的子命令组。

---

## 3.6 `sv site` 命令组 — 网站运维

`sv` 除了内容引擎,再扩一个 `site` 名词组,统一网站的构建/部署/运维入口,
取代散落的 `build.sh`。`site` 组的 verb 多数有副作用,**`deploy` 有生产副作用,
单独加护栏**(见 §3.6.1)。

```
sv site <verb>
  build        构建前端(Vite),产物进 _deploy/
  sync-db      重建 portfolio.db(= `sv index sync` 的网站侧别名)
  preview      本地起 Go 后端 + 前端,整站预览
  check        发布前体检:死链 / 缺图 / SCHEMA 不一致 / DB 生成失败
  deploy       Docker Compose 部署到服务器(--dry-run 默认开)
  status       线上服务健康 + 当前部署的 content commit
  rollback     回退到上一个发布 tag
```

另补 `sv proposal` 组(M9 提案通道的人侧入口,§1.4.1):

```
sv proposal <verb>
  list         列出待审提案
  show <id>    查看某提案的 diff
  accept <id>  合并进 content/*.md(你署名,走 Git)—— 人专属
  reject <id>  丢弃提案 —— 人专属
```

### 3.6.1 部署护栏(两道,载重)

`sv site deploy` 与 `deploy()` ability 能改生产服务器,误触代价是对外服务中断
(不同于 `propose`/`remember` 最坏只是脏数据)。因此:

1. **`deploy` ability 默认关闭**。`silan-viking-skill` 的 MCP server 必须以
   `--enable-deploy` 显式启动,才向 Agent 暴露 `deploy()`。对齐 EasyNet 对危险
   能力的 feature-gate 做法。
2. **强制 dry-run + 审计**。`deploy` 默认 `--dry-run`,先返回「将执行什么」;
   真执行需显式 `--confirm`。每次真实部署写入 `log.md`(谁/何时/哪个 content commit)。

> 取舍说明:你选择「Agent 可完整部署生产」。本设计**接受**该选择,但保留这两道
> 护栏 —— 它们不挡正常使用,只挡 LLM 误判触发的意外部署。

---

## 4. 核心流程(step-by-step)

### 流程 A — `sv index sync`(知识体入库,核心)

```
1. 扫描 content/,对每个条目目录:
2.   读 index.md → `silan-viking-domain` 解析 → `ContextNode` (frontmatter + 正文块)
3.   校验 frontmatter 是否符合 SCHEMA.md;不符 → 报错并指出文件:行
4.   算正文 hash,对比 .meta.toml:未变 → 跳过(增量)
5.   变了 → `Namespace::sync` 触发分层:
        - 生成/刷新 .abstract (L0)
        - 生成/刷新 .overview (L1)
        - (可选)算 embedding,写 cache.rs
6.   `Namespace` 更新 `Relation` 有向关系图
7. 全量扫完 → catalog.rs 重写 index.md;追加 log.md
8. `SqliteSink`(silan-viking-infra):把内容表写入 portfolio.db
        ⚠️ 只写内容表,绝不碰 comment/like/view 等互动表 —— 真相是 markdown,互动数据属运行时(VISION.md §3.5)
```

### 流程 B — `sv query find`(目录递归语义检索)

```
1. 意图分析:query → 若干检索条件
2. 初定位:在根的各集合 .abstract/.overview 上做匹配 → 高分集合
3. 精检索:进该集合,在条目 .abstract 上二次匹配 → 候选条目
4. 递归:若条目是目录(如 episode 系列)→ 对子项重复 2-3
5. 聚合:返回 silan:// URI 列表 + L0 摘要;--full 才读 L2
6. 记录检索轨迹(可观测性,OpenViking 特性)→ 可 --explain 打印
```

### 流程 C — `sv content ls/tree` 与 `sv query grep`

纯文件系统语义,确定性,无需 embedding。`ls silan://resources/blog/` 列条目 + 各自 L0。

### 流程 D — `sv index rebuild`

删除所有 `.abstract`/`.overview`/缓存,从 L2 正文全量重建。验证「派生层可重建」。

---

## 5. 数据流与边界(必须钉死的不变量)

| 不变量 | 说明 |
|---|---|
| **L2 正文是唯一真相源** | `.abstract`/`.overview`/`index.md`/`portfolio.db` 全部可从 L2 重建 |
| **引擎只读内容、只写内容表** | 互动数据(评论/点赞)在 Go API 侧,引擎永不触碰 |
| **SCHEMA.md = parser 契约** | `silan-viking-domain/schema.rs` 的 struct 必须与 SCHEMA.md 字段逐一对应;改一个要同步改另一个 |
| **检索可降级** | embedding 不可用时 `find` 退化为 `grep`+元数据匹配,引擎仍可用 |
| **新旧并行** | 本引擎不删 Python `silan`;`sync` 产出的 db 与 Python 产出的须 schema 兼容 |

---

## 6. 测试策略(e2e 详细覆盖)

你明确要「e2e 测试详细覆盖」。分四层:

### L1 单元测试(每个 crate 内 `#[cfg(test)]`)
- `silan-viking-domain`:URI 解析(合法/非法/边界)、L0/L1/L2 转换
- `silan-viking-domain`:frontmatter —— 完整/缺字段/类型错/多语言;markdown 块切分
- `silan-viking-domain` 的 `Relation`:有向边正反向解析、悬空检测

### L2 快照测试(`insta`)
- 给定 fixture 条目 → 生成的 `.abstract`/`.overview`/`index.md` 与快照比对
- 改了生成逻辑,快照 diff 一眼可见

### L3 e2e 测试(`tests/`,`assert_cmd` 跑真实 CLI)
fixtures 里放一个迷你 `content/` 仓(3-4 个条目,含一个多语言、一个容器系列、一个松散合集、一条演化边):

| 用例 | 验证 |
|---|---|
| `sv sync` 全量 | 生成全部 L0/L1/index.md/log.md;portfolio.db 表数据正确 |
| `sv sync` 增量 | 改一个条目 → 只该条目重建,其余 .meta.toml hash 不变 |
| `sv rebuild` | 删派生层后重建,结果与首次 sync **逐字节一致**(幂等性) |
| `sv ls/tree` | 输出结构正确 |
| `sv find` | 已知 query 命中预期条目;`--explain` 轨迹合理 |
| `sv find` 降级 | 关掉 embedding,find 仍返回合理结果 |
| SCHEMA 违规 | 故意写错 frontmatter → 退出码非 0,报错指明文件:行 |
| 互动表保护 | 预置一个带评论的 db → sync 后评论数据原样保留 |

### L4 对拍测试(关键!新旧并行的保险)
- 同一个 `content/` 仓:Python `silan` 产出 db_a,Rust `sv sync` 产出 db_b
- 断言 db_a 与 db_b 的**内容表**等价(允许字段顺序差异)
- 这是「Rust 版没回归」的硬证据,也是未来敢删 Python 的前提

### CI
- `cargo test --workspace` + `cargo clippy -- -D warnings` + `cargo fmt --check`
- L4 对拍作为独立 job(需要 Python 环境)

---

## 7. 里程碑(step-by-step,本期不实现)

| 阶段 | 产出 | 完成判据 |
|---|---|---|
| **M0** | `content/SCHEMA.md` 定稿 | 字段表完整,与现有 Python parser 行为核对过 |
| **M1** | `engine/` workspace + 6 个 crate 空骨架 + `silan-viking-cli` noun-first 骨架(§3.5)+ CI | `cargo test` 跑通;`sv --help` 显示三个名词组 |
| **M2** | `silan-viking-domain`:`SilanUri`/`Abstract/Overview/Body`/`ContextNode`/`schema`/`ports` + L1 单测 | 领域对象与 frontmatter 解析对 fixtures 全绿 |
| **M3** | `silan-viking-namespace`:`Namespace` trait + `ResourceNamespace`;分层/catalog/links + L2 快照测试 | `ResourceNamespace::sync` 生成 `.abstract`/`index.md` 稳定;`is_mutable()==false` |
| **M4** | `silan-viking-infra`(`FsStorage`/`SqliteSink`)+ `silan-viking-engine`(`Engine::sync_all`)+ L3 e2e | 垂直切片:blog 一类 md→db 经 `Engine` 跑通 |
| **M5** | 其余内容类型(idea/project/episode/resume) | 全类型 e2e 绿;L4 对拍通过 |
| **M6** | `silan-viking-namespace` 检索(`Engine::query` + ls/tree/grep/find)+ 检索 e2e | `find` 用例通过,降级路径通过 |
| **M7** | `silan-viking-skill`:检索 abilities + MCP server(`recall/browse/read`)| Agent 经 MCP 能**检索** resources 与记忆;ability e2e 通过 |
| **M8** | `AgentNamespace`(`is_mutable==true`)+ `remember`/`reflect` 自进化循环 | Agent 能**更新记忆**;会话末 `reflect` 抽取记忆;e2e 覆盖 |
| **M9** | 提案通道:`Engine::propose` + `Proposal` 对象 + `sv proposal accept/reject` | Agent `propose` 草稿进隔离区;人 `accept` 才合并;`reject` 丢弃;e2e 覆盖 |
| **M10** | `sv site` 运维组:`build/sync-db/preview/check/status` + `lint`/`check`/`summarize_updates` ability | 一条命令完成构建+体检;Agent 能体检/汇总(走只读或提案)|
| **M11** | `sv site deploy`/`rollback` + `deploy()` ability + 部署护栏(§3.6.1)| dry-run 默认开;`--confirm` 才真部署;部署留痕;ability feature-gate 验证 |
| **M12** | embedding 增强 + `--explain` 检索轨迹 | 可选,内容量大后再做 |

每个里程碑独立可验收;M4 拿到第一个端到端跑通的垂直切片。

**对照你的诉求:**
- 「Agent 帮我**检索**」→ M7
- 「Agent 帮我**更新记忆**」→ M8
- 「Agent 帮我**更新发布内容**」→ M9(经提案)
- 「Agent 帮我**维护网站**」→ M10(体检/起草/汇总,安全档)+ M11(部署,带护栏)

---

## 8. 风险与取舍

| 风险 | 应对 |
|---|---|
| Rust 重写工作量大,中途烂尾 | 旧 Python 全程保留;M1-M4 就有可用切片;每里程碑可停 |
| L0/L1 生成依赖 LLM,不确定/要网络 | 默认 `.abstract` 用规则法(取首句/摘要),LLM 是可选增强;测试用规则法保证确定性 |
| `portfolio.db` schema 与 Go API/Python 漂移 | L4 对拍测试卡死;schema 以 Go 的 Ent 为准,引擎适配 |
| OpenViking 式 `find` 过度设计 | `find` 是检索出口的增强;**核心价值在 `sync` 出口**,先把 sync 做扎实,find 可后置(M6) |
| SCHEMA 与代码不同步 | 不变量:schema.rs 改动必须同步 SCHEMA.md;CI 可加文档校验 |

---

## 9. 本期下一步

按你定的「先定 SCHEMA 再写代码」:

**下一步 = 产出 `content/SCHEMA.md`。**

做法:通读 Python `silan` 的 `parsers/` 与 `models/`,把现有 frontmatter 约定**如实抽取**,
再按本文档 §2 的 silan:// 结构补齐(L0/L1 文件、两类系列、演化边、命名空间),形成定稿。
SCHEMA 定稿后才进入 M1。

> 本文档不含任何实现代码,符合「本期只出完整设计方案」。
