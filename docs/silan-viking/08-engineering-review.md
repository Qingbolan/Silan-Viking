# 08 · 工程审查补充 —— 未落地问题与必须补齐的设计

> 本章是对 上一轮文档的工程审查补丁。结论先说清:
> 当前 `docs/silan-viking/` 已经把终局、对象、CLI、MCP、测试写得很满,
> 但仓库里还没有 Rust `engine/`,Go ent schema 也还没按文档修订。
> 所以下一步不能直接开 M1 写 parser;必须先把下面这些不可省的设计门槛补完。

## 8.1 当前没有落地的硬事实

| 文档承诺 | 仓库现状 | 工程判断 |
|---|---|---|
| Rust `engine/` workspace + 7 个成员 crate | 仓库根目录没有 `engine/` | M1 之前只能算设计,不能算实现 |
| 最新内容结构 `content/resources/.../parts/...` | 旧 Python 仍是 `content/{type}/{item}/{file}` 语义 | 不做兼容;M0 只写最新 SCHEMA,旧内容离线重排 |
| `content_relation` / `content_interaction` / `annotation` / `item_part` | `backend/internal/ent/schema/` 仍是旧表;`project_relationships`、`project_views`、`project_likes`、`comment_likes` 仍在 | M0.5 必须先改 Go ent,否则 Rust entity 无真相源 |
| 运行时数据只在服务器 | `06` 原 deploy 流程有“本地 db 打进镜像/或 volume 待定” | 若直接覆盖线上 `portfolio.db`,会丢评论/打点;必须改成“只替换派生表” |
| `silan stats` 远程查访客 IP/指纹 | 只写了命令,没写远程鉴权、脱敏、访问边界 | #15 是高敏数据,必须有 owner-only 鉴权和默认脱敏 |
| MCP 握手推 SCHEMA | 已补实现形态(`03` §3.2) | M8 需按最终 SCHEMA 回扫 instructions/resources/tool schema,不能在代码里另写隐式合同 |
| `proposal accept` 原子性 | 流程正确,但缺锁和 expected HEAD 检查细节 | 单机内多进程/写交错下必须有锁 + `update-ref <new> <old>`;跨设备不在保证内(单设备假设,`17` §17.3) |

## 8.2 M0 的 SCHEMA 最小契约

M0 的 `content/SCHEMA.md` 不能只是字段说明。它必须足够让 CLI、MCP、parser、
测试 fixture 都按同一个契约生成和校验内容。最小字段如下:

```yaml
version: 1
layout: latest-only

namespaces:
  resources:
    root: content/resources
    publishable: true
    direct_agent_write: false
  agent:
    root: content/agent
    publishable: false
    direct_agent_write: true

types:
  idea:
    collection: ideas
    item_id: { source: frontmatter.id, fallback: slug, stable: true }
    slug: { pattern: "^[a-z0-9][a-z0-9-]*$" }
    parts:
      - { role: overview, required: true, order: 10 }
      - { role: progress, required: false, order: 20 }
      - { role: reference, required: false, order: 30 }
      - { role: result, required: false, order: 40 }
    # idea.status — 唯一事实源是 10-M0-SCHEMA定稿.md §10.4(本骨架仅引用)
    statuses: [draft, hypothesis, experimenting, validating, published, concluded]
    publish_statuses: [published]
    frontmatter_required: [slug, title, kind, status]

relations:
  types: [evolved_into, evolved_from, documents, references, supersedes, part_of]
  canonical:
    evolved_from: evolved_into
    evolved_into: evolved_into
    documents: documents
    references: references
    supersedes: supersedes
    part_of: part_of
```

**硬规则**:

- Runtime parser 只接受 `content/resources/{type}/{item}/parts/<role>/meta.toml`
  + `<lang>.<ext>`(`prose` 用 `.md`,结构化 Part 用 `.toml`)。旧 `README.md`、
  `NOTES.md`、`resume.md` 不作为运行时输入。
- `PartID` 必须在 `meta.toml`;缺失时由 `silan init` / `add-part` / 离线重排脚本补,
  `index sync` 不偷偷生成并写回,否则 sync 从只读操作变成隐式修改真相源。
- **`index sync` / `index rebuild` 遇到 `meta.toml` 缺 `PartID` 时:报错退出,
  不静默生成**。错误信息指明缺 ID 的 Part 路径,并提示「跑 `silan index repair`
  补 ID」。`silan index repair` 是**唯一**被允许向 `meta.toml` 写回 `PartID`
  的命令(`02` §`silan index`)—— 它是显式的写真相源动作,人知情。理由:
  `PartID` 是 `item_part` 表外键的稳定锚,`sync` 若自动生成新 ID 会让旧表行
  变孤记录 —— 把一次只读 sync 变成破坏性操作。
  这条让 `rebuild` 真正是「全量重建派生物」而非「重建真相源」—— `rebuild`
  只重建 `.silan-cache` 与派生表,`meta.toml` 是它的**只读输入**。
- `.silan-cache` 由引擎写,人不手写。SCHEMA/frontmatter/meta.toml 是人和 agent
  可编辑契约;`.silan-cache` 是派生注册表。`.silan-cache` 丢失时 `rebuild`
  从 `meta.toml` 全量重建它(`meta.toml` 在 → 重建无副作用);`meta.toml`
  丢失 PartID 时按上一条报错 —— 两者的处置不同,因为前者是派生物、后者是真相源。
- `status` 与 `visibility` 必须分开:`status` 是内容生命周期;`visibility=public`
  才允许网站投影。`blog publish` 可以同时把 `status=published` 和
  `visibility=public` 写入,但 schema 里两者不能混成一个字段。

## 8.3 部署不能覆盖运行时数据

`01` 已经定了运行时数据(comment / content_interaction / annotation reader 部分)
只在生产服务器。那 deploy 就不能把本地新生成的 `_deploy/portfolio.db` 直接替换
服务器正在使用的 `portfolio.db`。

**最终策略**:

1. 本地 `silan index sync` 生成的是**派生库快照**:内容主表、translation、
   `item_part`、`content_relation`、`sync_meta`。
2. `silan site deploy --confirm` 上传派生库快照和前端产物。
3. 服务器执行一次 promote job:在同一个持久 `portfolio.db` 里,事务性删除并重建
   **派生表**;运行时表(`comments`、`content_interaction`、`annotation` reader 行、
   `user_identities`)不动。
4. promote 成功后更新 `sync_meta.content_commit`;失败则线上 DB 保持旧状态。

这比“双 DB”简单:Go API 仍读一个 SQLite 文件;但 deploy 的写入边界是表级,
不是文件级。M0.5 改 Go ent 时必须把“派生表/运行时表”列成白名单。

> **promote 的原子性与 promote 期间可用性**,不是文字承诺 —— 完整的
> 实现级合同在 `11-M0.5-ent-schema-PR.md` §11.11「promote job 实现级合同」:
> 单个 `BEGIN IMMEDIATE` 事务包住全部 DELETE+INSERT,任一表失败整体
> rollback(不留半新半旧);Go API 读侧走 WAL 不被阻塞;`busy_timeout`
> 到期则本次 promote 失败、线上保持旧态。M9 `site deploy` 的验收判据
> 即「promote 满足 §11.11 合同」—— 不再是空判据。

## 8.4 stats 远程查询的安全契约

#15 要查 IP、浏览器指纹、AI 爬虫、来源类型。这是 owner-only 数据,不能走公开 API。

最小设计:

- `silan stats *` 默认走 SSH tunnel 或带 owner admin token 的 HTTPS endpoint。
- admin token 存在 `~/.config/silan/config.toml` 或系统 keychain,不进
  `silan-viking.toml`,不进 content Git。
- 默认输出脱敏:IP 显示 `/24` 或 hash 前缀,fingerprint 只显示前 8 位。
- `--raw` 只允许本机 owner 交互式确认后输出完整 IP/fingerprint;MCP 侧不暴露
  `--raw` 等价能力。
- Go API 写入时做 `visitor_kind` / `crawler_name` / `referrer_kind` 分类;
  Rust stats 只查询,不重判。

## 8.5 proposal 的并发与冲突补丁

`03` 的 worktree + 校验②方向是对的,但实现还缺两条硬约束:

- `accept` 必须持有进程锁:`content/.git/silan/locks/proposal-accept.lock`。
  同一 content 仓一次只能有一个 accept/rebase 写主分支。
- `proposal-accept.lock` 是提案级互斥;推进主分支前还必须拿
  `content/.git/silan/locks/agent-write.lock`,与 `ctx_write`/`reflect`
  共用同一把 HEAD 写锁。否则 agent/ 直接写 commit 可能和 accept 的
  `update-ref` 竞争。
- 推进主分支必须使用 expected old OID:
  `git update-ref refs/heads/main <verified_merge_oid> <expected_main_oid>`。
  如果主分支在校验期间被**同机的另一个写操作**(`ctx_write`/`reflect`/
  另一次 `accept`)推进,命令失败,主分支不动。这是单机内的乐观锁;
  silan-viking 是**单设备假设**,跨设备一致性靠 `content/` 仓手动
  `git push/pull`,不由本机制保证(`17` §17.3)。

`propose` 还要在元数据里记录 touched parts:

```toml
id = "01H..."
base = "<main_oid>"
kind = "modify"
touched = ["silan://resources/ideas/rust-context-engine/progress"]
validation = "passed"
```

`silan proposal list` 若发现多个待审提案触碰同一个 Part,必须提示冲突风险。
这不是锁,但能防止 owner 在审阅层面误以为两个提案彼此独立。

## 8.6 MCP 握手的落地形态

“握手推 SCHEMA”需要落到 MCP 可实现的形态:

- server initialize instructions 内包含:项目名、SCHEMA 版本、最新 content commit、
  关键资源 URI。
- 暴露只读 resources:
  - `silan://schema`
  - `silan://overview`
  - `silan://agent/brief`
- 暴露工具:
  - `context_brief()` 返回浓缩版。
  - `read(uri)` 读取资源。
  - `ctx_write(uri, content)` 只允许 `silan://agent/`。

这样 agent 接入时即使宿主没有展示 resources,也能通过 instructions 知道第一步
该读什么;不会依赖“模型自觉去翻文档”。

## 8.7 M0 / M0.5 的完成定义

M0 完成必须同时满足:

- `content/SCHEMA.md` 覆盖 6 个 type(blog/projects/ideas/episode/resume/update)、
  所有 Part、frontmatter、relation、status、visibility、manifest 归属。
- `engine/tests/fixtures/content/` 全部是最新结构,没有旧路径样例。
- 离线重排脚本只用于一次性把旧样例搬到最新结构;运行时 parser 无兼容分支。

M0.5 完成必须同时满足:

- Go ent 新增/删除/修改表后重新生成成功。
- Go API 对派生表读取通过;对运行时表写入通过。
- deploy promote job 证明只替换派生表,不删除既有 comment / content_interaction。
- Rust `silan-viking-entities` 从 Go ent 真相源反向生成,不手写漂移实体。

这两关没过,不要开 M1 parser。否则 Rust 代码会围绕一个还在漂移的 schema 返工。

### 8.7.1 SCHEMA 变更时 fixture 的同步责任(E2 起,红队审查补)

「运行时 parser 无兼容分支」(上文)意味着 `engine/tests/fixtures/content/`
**永远只有一套、对应当前 SCHEMA**。那么 E2 的 `propose_schema` 改了
`SCHEMA.md` 时,fixture 谁升级、何时升级 —— 钉死如下:

- **fixture 升级是 `schema-proposal` 的一部分,不是事后补**。一个
  `schema-proposal` 提案分支(`15` §15.2)里若改了 `SCHEMA.md`,**同一个
  提案分支必须同时改 `engine/tests/fixtures/content/`**,使 fixture 与新
  SCHEMA 自洽。两者在同一分支、同一次 `accept` 合入 —— 不存在「SCHEMA 变了
  但 fixture 还旧」的中间态。
- **`silan schema check`(§15.2.1)的引擎侧校验,跑的就是升级后的 fixture**。
  即:check 用「新 SCHEMA + 新 fixture」一起验,fixture 没同步升级 → 引擎侧
  解析失败 → `schema check` 不过 → 提案不可 `accept`。这把「fixture 跟不上」
  从一个无人负责的事,变成 `schema check` 自动拦截的事。
- **谁来改 fixture**:`propose_schema` 的发起 agent。它改 `SCHEMA.md` 的同时
  按新结构改 fixture 样例 —— 这是 agent 的提案内容的一部分,owner 在
  `accept` 时连 fixture diff 一起审。
- **新增可选 Part / 字段**:fixture 至少加一个用到该新结构的样例(对齐
  `05` §5.2「每种结构都有一例」)。删除类变更被 `15` §15.2 安全表禁止,
  不涉及 fixture 删样例。

> 一句话:**SCHEMA 与 fixture 绑在同一个提案里同生同死**,`schema check`
> 是它俩一致性的机器闸门。M0 的「fixture 全是最新结构」这条不变量,在 E2
> 之后由本规则维持。

## 8.8 camera-ready 演练实测 —— CLI / MCP / skill 验收(2026-05-19)

一轮 camera-ready 演练:`engine/install-dev.sh` 路线重编引擎、`skill emit`
装 skill、起前后端,逐剧本(`07` A–K)实测。**记录三类东西:已验证可用的、
真实 gap、以及方法论本身的失败。**

#### 方法论失败 —— 验收脚本三次自毁,这本身是一条 camera-ready gap

演练中**三次**误报 gap,且都不是引擎的错,是验收脚本不可信:

- 误报 1:用旧的、损坏的 `silan-viking` 二进制(一律 SIGKILL)测 `project
  list`,得 `unknown command`,据此断言「`list` 动词全缺」。**实为旧 binary
  损坏**;重编后 `list` 全通。
- 误报 2:shell 里写 `for v in "show foo"`,引号让 `show foo` 作为单参数
  传入,引擎收 argv `["blog","show foo"]` 报 `unknown subcommand`。
- 误报 3:`for c in "blog --help"` 同病再犯 —— `"blog --help"` 作为单 token
  传入,引擎报 `unknown command`,据此断言「20 个命令 `--help` 全挂」。
  **实为同一个分词错误**;数组传参后 20 个命令 `--help` 全通。

> 三次同源(变量未控制 / shell 分词)说明:**这次演练没有一套可信的验收
> 脚本** —— 每条结论都靠人肉回头复核才没写进文档。在一个产出会变成验收
> 依据的演练里,**验收脚本的可信度 = 结论的可信度**。这条本身要进 backlog:
> 见 §8.8.2 A2 —— 引擎需要一套 CLI/MCP 表面的 contract 测试,演练才不必
> 每次靠临时拼的、易碎的 shell 脚本。教训钉死:矩阵测试用数组逐 token 传、
> MCP 输出落盘后用 `jq` 解析、绝不用带空格字符串或脆弱的 inline 脚本。

### 8.8.1 已验证可用(新 binary,正确分词)

| 面 | 命令 / 工具 | 结果 |
|---|---|---|
| CLI 列举 | `idea/blog/project/update list` | ✅ 四类全通 |
| CLI 查看 | `<type> show <slug>` | ✅;缺失 slug 报 `not found` 且 `exit=1` |
| CLI 列举 | `content ls`、`episode series list`、`episode list <series>` | ✅ |
| CLI 简历 | `resume show`、`resume list`(列 research/experience/publications 等段) | ✅ |
| CLI 提案 | `proposal list` | ✅ |
| CLI 关系 | `relation graph`(无参)、`relation show <uri>` | ✅(`graph` 不接 URI) |
| 引擎 | `doctor`、`guide`、`index sync`、`skill emit/status` | ✅;`skill status=up_to_date` |
| MCP | `mcp status` → `tools_advertised=17`、`mcp_available=true` | ✅ |
| MCP | `tools/list` 经 stdio JSON-RPC → 17 个工具全枚举 | ✅ |
| MCP | `list`(按 type / 全量)、`read`(Item 摘要 / Part 全文)、`context_brief` | ✅ 返回真实数据 |

> MCP `read` 在 Item URI 上返回 `body:null` + 标题/语言,在 Part URI
> (`…/<slug>/<role>`)上返回全文 —— **这是设计如此**(工具描述已写明),不是 gap。

### 8.8.2 真实 gap —— 架构师定级(凉冰)

> 工程师按「命令坏没坏」定级;架构师按「离终局差哪一步」定级。下表是后者。
> 本轮最有价值的产出不是「前后端起通了」,是**确认了 M9 并未真正完成**。

#### A1 — `site preview` 名不副实,根因是 M9 验收标准漏了一条(原 G1+G4)

`["site","build"] | ["site","preview"]` 同指 `site_build`,只产
sitemap/robots/jsonld 三个 SEO artifact,不起服务器、不渲染 HTML。

**这不是「代码没跟上规格」,是规格本身漏了。** `04` §M9 出口写的是
「`05` MCP + 端到端 + 网站场景全绿;deploy promote 只替换派生表」——
**通篇没有一条要求 `site preview` 在浏览器里呈现一个可看的站点**。在 M9
当前的验收口径下,`SiteProjector` 只产 SEO artifact 是「通过」的。而
`guide`/`--help` 的文案「preview the site locally」承诺了一件 M9 验收
从未要求过的事 —— 文案与验收标准互相打架,代码站在了验收标准那边。

终局判断:引擎已内嵌 frontend/backend/deploy 三个 tarball,这个事实本身
就是规格声明 —— **引擎承诺自己能把站点跑起来,camera-ready 那天的用户
只有 `curl|sh` 装来的一个二进制,`site preview` 是他看到自己站点的唯一
入口**。这个入口现在是空的。

**处置(不在本轮「编译安装」职责内,须走正经 PR):**
1. `04-里程碑.md` §M9 验收标准回补一条:`site preview` 解包内嵌
   frontend/backend tarball、起本地实例连 `_deploy/api/portfolio.db`、
   在浏览器呈现站点;并配套 `site stop` 收回实例、`site status` 报实例
   存活。修复路径可复用 `site_deploy` 已有的 tarball 解包逻辑,做本地版、
   不推远端。
2. M9 按补全后的标准**重新走验收**。在此之前 M9 不算完成。

> 原 G4(无进程管理 / 无 `site stop`、反复起累积端口僵尸)与 A1 同源:
> 引擎根本没有「本地实例」这个概念。`site preview` 一旦从「构建」变成
> 「起实例」,preview/status/stop 三件套必须一起做 —— 故合并入 A1。

#### A2 — CLI 命令表面缺 contract 测试(原 G3)

`--version` 缺失已修(`main.rs` 加 `--version`/`-V`/`version` 分支,
parse 前拦截)。但**真正的 gap 不是缺这十行,是 `engine/crates/silan-viking-cli/tests/`
没有一层覆盖命令表面的 contract 测试**。`silan-viking` 是会自我演化的引擎
(`15` 章),agent 会不断改 CLI 表面 —— 没有表面 contract 测试,`--version`
这类回归 CI 永远拦不住,今天撞见的只是其中一个。

**处置:** backlog 加一条 —— CLI 命令/动词表面的 contract 测试(每个
公开命令、每个 `--help` 承诺的动词,至少一条「能被识别、不报 unknown」
的断言)。

#### A3 — `site status` 错误文案错位(原 G2,维持 P3)

`silan-viking site status` 报 `silan site deploy needs a [deploy]
section` —— 文案抄了 deploy 的,且 `status` 不应硬依赖 `[deploy]` 段。
小事,但属同一类「命令表面未被测试覆盖」,与 A2 一并修。

#### A4 — `init` 种子内容全为 draft/private,新用户首屏是空站(已决)

后端 `/api/v1/blog/posts`、`/api/v1/projects` 正确过滤草稿(publish 是
person-only 动词,`02` §设计要点)—— 行为是对的。但 `init` 铺下的示例
内容全是 `draft/private`,于是 camera-ready 那天 silan 装好引擎、init、
sync、打开站点 —— **看到的是空壳**。对的行为遇上了错的初始状态。

**架构裁决(凉冰,2026-05-19):`init` 不预置 published 内容。**
`silan-viking` 的灵魂是「silan voice 想法 → 内容长出来」,`init` 就该是
一张干净白纸 —— 预置假样例内容反而背叛这个气质,也会让新用户的站点一上来
就带着不是他的东西。**用引导补空,不用假数据补空:** 真正的修法是让
`guide` 在「已 init、内容未 publish」这个状态识别出来,把下一步明确指成
`blog publish <slug>` / `site publish`,而不是泛泛说「preview/deploy」。
此项归入 A1 同一个 PR(同属 guide/preview 的 onboarding 收尾)。

#### A5 — CLI 适配器与 MCP 适配器对同一引擎能力给出不等价结果(本轮新增)

`08` 之前的验收只问「CLI 能跑吗 / MCP 能跑吗」,**没问「同一能力两个
适配器是否等价」**。逐剧本实测后,这是覆盖面最大的一类漏验,实例:

| 能力 | CLI 出口 | MCP 出口 | 问题 |
|---|---|---|---|
| `lint` 体检 | `index lint` → `ok documents=12`,**0 issue** | `lint` → **15 条 info issue**(缺翻译) | CLI 把全部 issue 吞成一句 `ok` |
| `lint` 体检 | `doctor` → `ok ... items=12`,**0 issue** | 同上 15 条 | `doctor` 同样不报逐条 issue |
| `stats` 空缓存 | `silan stats sync` | `silan stats sync <uri>` | 错误文案漂移,MCP 那条带 URI 更可用 |

**为何严重:** `07` 剧本 J 明写 agent 调 `lint` 要拿到一份**带逐条 issue
的体检报告**。MCP 端做到了;CLI 的 `index lint` / `doctor` 只报 `ok N`,
**把 15 条「缺翻译」issue 全吞掉**。一个纯用 CLI 的人,永远不知道自己内容
缺 15 处翻译 —— 而 camera-ready 的用户既会用 CLI、也会经 skill 用 MCP,
两套结论打架,他不知该信哪个。这违背 `02`/`03` 的隐含契约:CLI 与 MCP
是同一引擎的两个适配器,**同名能力必须给等价结论**,差异只应在呈现形态
(人读 vs JSON),不应在结论内容。

**处置(走正经 PR,不在本轮职责内):**
1. `index lint` / `doctor` 必须输出与 MCP `lint` 同一份 issue 列表
   (人读形态),不得把 issue 静默吞成 `ok`。
2. CLI 与 MCP 的错误文案统一到带 URI 的那一版。
3. 根治靠 A2 的 contract 测试 —— 测试矩阵须含一条「CLI 出口与 MCP 出口
   对同一输入给出等价结论」的断言,否则此类漂移会持续发生。

> A5 是本轮「逐剧本验」相对「逐命令验」多挖出来的东西。教训:验收的单位
> 是**剧本**(一条用户路径从头到尾),不是孤立命令 —— 孤立命令各自 `ok`,
> 不代表串起来的路径对用户讲得通。
