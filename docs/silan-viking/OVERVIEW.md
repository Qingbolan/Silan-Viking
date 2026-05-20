# silan-viking · 总览 —— 一份读完就懂的文档

> 这是 silan-viking 设计的**总入口**。它把"这套系统到底怎么转"的每一个
> 关键问题,**逐条正面回答**,每条指向详细章节。读完这一份,你不用再翻
> 七个文件去拼。
>
> 30 秒定位:silan-viking 是 silan 一个人的 context 系统 —— markdown 为
> 真相源,Rust 引擎 `silan` 把它同步进 SQLite 喂网站,协作 agent 经 MCP
> 读写它。详见 `00-终局与需求.md`。

---

## 一图看全:这套系统怎么转

```
                 ┌─────────────── 本地机器 ───────────────┐
  silan 写 md ─▶ content/(markdown 真相源,Git 仓)
                      │  silan index sync
                      ▼
                 portfolio.db(派生缓存;本地这份不含运行时数据)
                      │
  协作 agent ◀──▶ silan mcp serve(MCP:读内容 / 写 agent context / 提案)
                      │  silan site deploy
                 └─────┼──────────────────────────────────┘
                       ▼
                 ┌─────────────── 服务器 ─────────────────┐
                 Go API + portfolio.db + 前端
                       │
                 访客浏览 → 评论 / 点赞 / 打点 ── 运行时数据,只在这里产生
                       │
  silan stats(远程查询)◀──────────────────────┘
                 └────────────────────────────────────────┘
```

---

## 你问的每一个问题,逐条回答

### Q1. e2e —— 怎么下载、初始化?

**下载**:三种装法任选 —— 安装脚本 / `cargo install silan-viking` / `pip
install silan-viking`(纯安装器包)。三者结果一样:把 `silan-viking` 二进制
以 `silan` 之名放进 PATH。**不依赖旧 Python 包。**

**初始化**:`silan init` —— 在 `~/.silan-viking/` 建好 `content/` 六个 type
目录 + 三个示例条目(welcome blog / 一个 idea / 一个 project)+ `SCHEMA.md`
+ `silan-viking.toml` + `git init`。屏幕打印文件树 + 编号下一步。

→ 完整:`06-端到端.md` §6.1(安装)、§6.2(init,含屏幕实际输出与项目结构)。

### Q2. 提供什么接口,给 agent 和人用?

**两个面,同一个引擎核心**(`Workspace`):

- **给人 —— CLI `silan`**:`idea`/`blog`/`project`/`episode`/`resume`/`update`
  六个 type 专属命令组(各带 new/list/show/edit/rm/archive + 专属操作)+
  `content`/`index`/`relation`/`site`/`stats`/`proposal`/`mcp`/`skill`
  八个工具组。
- **给 agent —— MCP**:`silan mcp serve` 起 MCP server,agent 接入即握手
  推送 SCHEMA + 项目概览。agent 能 检索 / 捕捉 / 提案 / 读写自己的 context。

→ 完整:`02-cli服务.md`(CLI 全清单)、`03-mcp服务.md`(MCP 工具四档 + §3.1)。

### Q3. 怎么创建一个 idea / project / blog?

**两条路**,殊途同归:
- **自己建**:`silan idea new <slug>` —— scaffold 目录 + `parts/overview/`
  + 模板 frontmatter。编辑 markdown,`silan index sync`。
- **对 agent 说**:agent `capture` 起草 → 提案 Git 分支 → `silan proposal
  accept` 收下。

blog 是单 Part(`body`),idea/project 多 Part(overview/progress/…)。

→ 完整:`07-操作手册.md` §7.2(开 idea)、§7.3(写 blog)、§7.4(维护 project)
—— 每条是逐行命令 + 屏幕输出 + 文件变化的剧本。

### Q4. parser 怎么工作?

`Parser`(L3 trait,6 个实现 = Python 6 个 parser 的 Rust 版)读 `SCHEMA.md`
的 type 定义,按 `parts` 列表扫每个 `parts/<role>/` 目录,把每个语言
`<lang>.<ext>` 解析进 `Parsed`(扩展名由 Part shape 决定;语言无关 `main` +
多语言 `langs`)。
`Parser` 只暴露 3 个 public 方法(`content_type`/`parse`/`validate`),
其余 `extract_*` 全是 struct 私有 fn。

→ 完整:`01-oop结构.md` §1.5(Parser trait + 公私可见性)、§1.5.1(ResumeParser
真实切片,逐方法)、§1.8(Parser→Parsed→Mapper→Sink 持久化链)。

### Q5. OOP 怎么实现、怎么拓展?

**四层**:L1 base(纯工具)→ L2 content(领域数据:Namespace/Collection/
Item/Part/File)→ L3 app(行为:Workspace/Parser/Mapper/Sink)→ L4 adapter
(CLI/MCP/Site)。依赖严格单向向下,crate 边界由 `Cargo.toml` 物理保证。

**拓展靠两点**:① 加内容 tab = 改 `SCHEMA.md` 的 type 定义,不改 Rust
(配置驱动的 parser);② 加一个新对外接口 = 加一个 L4 adapter crate,
不动 L1–L3。

→ 完整:`01-oop结构.md` §1.1(四层)、§1.2(继承机制)、§1.3.1(可配置文件树)。

### Q6. 有没有 e2e 测试?

有,四层:L1 单元 / L2 `insta` 快照 / **L3 e2e**(`assert_cmd` 跑真实
`silan` 命令)/ **L4 契约测试**(Rust 产出的 db 与 Go ent schema、前端读取
契约逐项对齐)。
测试场景**从 15 条需求逐条倒推**,文末有「需求↔场景」自查表 —— 一条需求
找不到对应场景 = 测试有缺口。

→ 完整:`05-测试.md`(四层结构 + 场景清单 + §5.3.1 ResumeParser 测试切片)。

### Q7. 怎么同步?

`silan index sync` —— 扫 `content/` → `Parser` 解析 → `Mapper` 映射成
`RowSet` → `Sink` 事务写 `portfolio.db`。增量:对比 hash,只重建变化的 Item。
内容更新有**两条路径**:owner 直接改(编辑源文件 → sync)、agent 改(propose →
提案分支 → owner accept → sync)。

→ 完整:`06-端到端.md` §6.4(更新逻辑全链,两条路径并排)、`01` §1.8(持久化)。

### Q8. 新机器从服务器拉取,能拿到最新评论 / 访问数据吗?

**这是个关键的数据流问题,答案要分清两类数据**:

- **内容**(blog/idea/project…)= markdown,真相源在 `content/` Git 仓。
  新机器 `git clone` content 仓拿到全部内容,本地 `sync` 重建 `portfolio.db`
  的内容表。✅ 完整拿到。
- **运行时数据**(评论 `comment` / 访问打点 `content_interaction`)= 在
  **生产服务器**上产生(访客在网站上评论、浏览)。**它们只存在于服务器的
  `portfolio.db`,不进 Git、不在 markdown 里。**

**架构决策(silan 定)**:运行时数据**只在服务器,本地机器不持有**。
- 新机器拉取 → 本地 `portfolio.db` 的运行时表(comment/content_interaction)
  是**空的**,这是**预期行为**,不是 bug。
- 要看评论 / 访问数据 → `silan stats`(CLI)/ MCP `stats` 工具 **远程查询
  服务器**,不需要把运行时数据同步到本地。
- 好处:本地永远只管"内容创作"这一摊,职责干净;运行时数据有唯一的家
  (服务器),不需要"评论数据在哪台机器最新"这种同步难题。

→ 完整:`01-oop结构.md` §1.10「连带影响 §1.8」中「派生 vs 运行时数据
边界」「运行时数据的物理归属」两段、§1.10 修订 D(`content_interaction`)、
`02` `silan stats` 命令组。

### Q9. 怎么管理版本?

**靠 Git** —— `content/` 是 Git 仓,markdown 的每次修改就是一个 commit,
版本史就是 Git 史。`portfolio.db` **不存历史版本**(它是派生缓存,存历史是
职责错位)。需要看版本 → `git log` / `git diff` content 仓。
agent 的提案也是 Git 分支(`proposal/<ulid>`),`accept` = merge。

→ 完整:`01-oop结构.md` §1.10 修订 B(版本控制靠 Git)、`03` §3.1(提案 = Git 分支)。

---

## 文档地图 —— 按需深入

| 想知道 | 看 |
|---|---|
| 这系统到底为什么、要解决什么 | `00-终局与需求.md` |
| 对象模型 / parser / 数据库 schema / 代码结构 | `01-oop结构.md` |
| CLI 完整命令 | `02-cli服务.md` |
| agent 怎么接入、提案机制 | `03-mcp服务.md` |
| 实施里程碑 | `04-里程碑.md` |
| 测试怎么做 | `05-测试.md` |
| 从安装到部署的完整主线 | `06-端到端.md` |
| 「我想做 X」一步步怎么做 | `07-操作手册.md` |
| 哪些设计还没落地、M0 必须补什么 | `08-工程审查补充.md` |
| 错误处理、tracing、规模假设、性能预算 | `09-可观测性与性能.md` |
| M0 怎么写 SCHEMA(6 type 逐字段定稿)| `10-M0-SCHEMA定稿.md` |
| M0.5 怎么改 Go ent(修订 PR)| `11-M0.5-ent-schema-PR.md` |
| 旧内容怎么一次性重排进新结构 | `12-旧内容离线重排.md` |
| 协作 agent 怎么装 skill、装完怎么自动懂 silan | `13-skill-分发.md` |

> 阅读顺序:本文档 → `00` → `06`(主线)→ `07`(操作)→ `01`(对象/数据库)
> → `02`/`03` → `05` → `08` → `09` → `04`。
> 准备开工 M0/M0.5:`10` → `12` → `11`。
