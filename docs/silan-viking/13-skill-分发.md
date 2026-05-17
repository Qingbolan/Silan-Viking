# 13 · skill 分发 —— 让协作 agent「装一下就懂 silan」

> 服务需求 `#10 #11 #12`。
> 前 12 章把 agent 的能力做全了 —— 但能力的**承载方式**是 MCP server。
> 本章补的是最后一层:让一个 Claude agent **不手动配 MCP、装一个 skill 就能
> 自动发现 silan-viking 并在对的时机调用它**。
>
> 这一章存在的理由,是 `00-终局` §0.1 那句承诺 ——「与一个**带这个 skill
> 的 agent** 说话」。在 `00`–`12` 里这句没有实现支撑:agent 接入靠 MCP,
> 不靠 skill。本章把这句话兑现。

---

## §13.1 终局倒推 —— skill 解决的到底是什么

先把一件事讲死,免得 `03-mcp服务.md` 和本章被读成两套能力:

> **skill 不重新实现任何能力。silan-viking 的全部 agent 能力(recall /
> capture / propose / ctx_* / reflect …)永远只活在 MCP 一处(`03` 四档
> 工具)。skill 是这套能力的「分发包 + 自动触发说明书」,不是第二套逻辑。**

第一性地拆,一个 Claude agent 要「装一下就懂 silan」,中间隔着三道坎,
MCP 只跨过了第一道:

| 坎 | 问题 | 谁解决 |
|---|---|---|
| ① 能力 | agent 有没有 recall/capture/propose 这些动作可调 | **MCP**(`03`)|
| ② 发现 | agent 怎么知道这台机器上有 silan-viking、何时该用它 | **skill**(本章)|
| ③ 触发 | silan 只是「说出一个念头」,agent 怎么自动想到去 capture | **skill 的 description + 正文**(本章 §13.4)|

坎 ② ③ 就是 `00-终局` 那个画面 ——「他不录入内容,他只是想」—— 真正落地
的地方。silan 不该手动配 MCP server 地址、不该说「请调用 capture 工具」;
他说一句半成形的念头,agent 自己想到该把它收进 context。**skill 是让 agent
「自己想到」的那份说明书。**

### 终局画面(本章版本)

silan 在任意一台装了 silan-viking 的机器上,对 Claude agent 说话:

- agent 启动时,Claude 扫 `~/.claude/skills/`,发现 `silan-viking` skill。
- silan 说出一个半成形的念头 → skill 的 description 命中 → Claude 挂载
  skill 正文 → 正文告诉它「先 `context_brief` 再决定」→ 它调 MCP。
- 全程 silan 没说过「MCP」「capture」「工具」任何一个词。

---

## §13.2 skill 包长什么样 —— 磁盘产物

一个 silan-viking skill 是 `~/.claude/skills/silan-viking/` 下的一棵小树。
**它是 `silan` 生成的产物,不是手写、不是真相源** —— 与 `portfolio.db` 同
性质:可随时由 `silan skill emit` 重建。

```
~/.claude/skills/silan-viking/
├── SKILL.md            # ★ 唯一必需:frontmatter(name/description)+ 正文
└── reference/
    └── mcp-tools.md    # 四档 MCP 工具速查(从 03 派生,供 skill 正文引用)
```

`SKILL.md` 的 frontmatter 形态(description 是坎 ③ 的核心,§13.4 详述):

```markdown
---
name: silan-viking
description: silan 的个人 context 系统。当 silan 说出一个想法、灵感、半成形
  的念头,或想写文章 / 推进项目 / 查看网站内容与访客数据时使用 —— 帮他把想法
  捕捉进 context、协助写作、维护项目、选择性发布。
---

（正文见 §13.4）
```

> **为什么 skill 包是派生物**:skill 正文里要嵌入「MCP 本机解析规则」
> 「当前 6 个 content type 的清单」「SCHEMA 摘要」—— 这些都随 `silan-viking.toml`
> 和 `SCHEMA.md` 变。手写必然漂移。让 `silan skill emit` 每次从真相源重新
> 生成,skill 与项目状态强一致 —— 同 `00` §0.4 的载重纪律:真相源唯一,
> 派生物可重建。

---

## §13.3 怎么生成、怎么装 —— `silan skill` 命令组

新增一个工具命令组,挂在 `02-cli服务.md` 的「跨类型 / 工具组」一类(与
`mcp`/`site`/`proposal` 并列)。命名遵 `#8` noun-first:

```
silan skill emit            生成 skill 包到 ~/.claude/skills/silan-viking/
                            （--path 改输出位置；从 silan-viking.toml + SCHEMA.md 派生）
silan skill status          检查 skill 是否已装、与当前项目状态是否一致（hash 比对）
silan skill rm              移除已装的 skill 包
```

`silan skill emit` 做三件事,全部纯生成、无副作用到真相源:

1. 读 `silan-viking.toml`(项目 identity、MCP 传输偏好)+ `content/SCHEMA.md`
   (6 个 type 当前定义)。
2. 渲染 `SKILL.md` —— frontmatter 的 description 用固定模板(§13.4),正文
   嵌入当前 type 清单与 **MCP 本机解析规则**。
3. 写出 `~/.claude/skills/silan-viking/` 整棵树。已存在则覆盖(它是派生物,
   覆盖无损失)。

> **装** = `silan skill emit` 一条命令。没有「下载 / 注册」额外步骤 —— skill
> 的发现机制是 Claude 自己扫 `~/.claude/skills/`,文件到位即被发现。
> **`silan init` 时是否自动 emit**:不。`init` 只建内容项目(`00` §0.4 的
> ③);skill 是「让协作 agent 用」的可选层,由 silan 显式 `silan skill emit`
> 决定 —— 与「`deploy` 默认关闭」(`03` 档 4)同一种纪律:对外暴露面默认不开。

### 跨机器分发渠道

`silan-viking` 不自造 skill 分发协议。skill 包是派生物,真相源仍是
`silan-viking.toml` + `content/SCHEMA.md`;跨机器只解决“把派生物放到那台
机器的 Claude skills 目录”这件事。支持三种落点:

| 场景 | 做法 | 约束 |
|---|---|---|
| 本机个人使用 | `silan skill emit` 写 `~/.claude/skills/silan-viking/` | 默认路径,覆盖安全 |
| 多台个人机器 | `silan skill emit --path <dotfiles>/skills/silan-viking/`,再由 dotfiles / 云盘 / git 同步到各机 `~/.claude/skills/` | 同步机制外包给现成工具;每台机器用本机 `silan mcp status` 解析接入状态,`silan skill status` 用 hash 检查漂移 |
| 团队/项目共享 | `silan skill emit --path .claude/skills/silan-viking/` 后随 repo 分发 | 只能提交不含私人端口/绝对路径的包;MCP 接入必须写成 `silan mcp serve --stdio` 这类相对约定 |

这条边界很重要:skill 包不是通用 marketplace 包,也不是本机端口/绝对路径的
同步载体。跨机分发默认借 dotfiles/git/云盘,但每台机器仍必须有可执行的
`silan-viking` 与对应 MCP server 配置;否则 skill 只能提示“本环境能力不可用”。

### MCP 坐标的机器本地解析合同

skill 包可以被同步,但 **MCP 坐标不能当同步真相**。`silan skill emit`
生成 `reference/mcp-tools.md` 时遵守以下规则:

1. **默认写相对启动约定**,不写绝对路径和固定端口:

   ```text
   transport: stdio
   command: silan mcp serve --stdio
   project: resolve from current workspace or SILAN_VIKING_PROJECT
   ```

   也就是说,agent 连接前按本机 `PATH` 找 `silan`,由 `silan mcp serve`
   在本机读取 `silan-viking.toml`。这份 skill 包同步到第二台机器后,
   仍由第二台机器自己的 `silan` 解析项目与传输。

2. **本机状态先探测**。skill 正文必须写明:连接 MCP 前先执行或请求宿主执行
   `silan mcp status --json`。只有 status 返回 `available=true` 且
   `schema_hash` / `skill_hash` 与当前包一致,才宣称“可用”;否则提示重跑
   `silan skill emit` 或 `silan mcp serve --stdio`。

3. **TCP/端口只作为本机 hint**。如果 `[mcp]` 配了 `transport=tcp`,
   `emit` 可以在 `reference/mcp-tools.local.md` 写入
   `127.0.0.1:<port>` 供本机使用,但该文件默认进 `.gitignore`/不同步;
   同步包里的 `reference/mcp-tools.md` 仍写 stdio 约定。

4. **`status` 负责暴露漂移原因**。`silan skill status` 除了 ContentHash,
   还要显示 `binary_found`、`mcp_available`、`transport_resolved`、
   `schema_hash_match`、`skill_hash_match`。这样第二台机器的失败是可诊断的,
   不会把“skill 已发现”误报成“MCP 已接通”。

### skill 与 MCP server 怎么对接

skill 正文不内含能力,它**指挥 Claude 去连 MCP**。两者的接线:

- skill 正文写明:「silan-viking 的能力经 MCP 提供。若本会话尚未接入,
  先按 `reference/mcp-tools.md` 跑 `silan mcp status --json`;可用后再按
  `silan mcp serve --stdio` 接入。」
- MCP server 仍由 silan(或其环境)以 `silan mcp serve` 启动 —— skill **不
  负责拉起进程**(skill 是声明式说明书,不是 supervisor)。
- 接入坐标由本机 `silan mcp status --json` / `silan mcp serve --stdio`
  解析。`silan-viking.toml` 的 `[mcp]` 段只提供传输偏好,不能把本机绝对
  坐标写成跨机器真相。

> **边界**:skill 能让 Claude「知道该连 MCP、连哪、连上后调什么」,但起
> server 这一下仍是 silan 环境的事。若某 agent 运行环境根本没有 silan-viking
> 二进制 —— skill 正文明确告知「此环境无 silan-viking,能力不可用」,不伪装。

### “装了 skill”与“agent 能用”的判定

`silan skill emit` 只兑现**发现层**。一个 agent 真正能调用 silan-viking,
必须三件事同时成立:

1. `~/.claude/skills/silan-viking/` 下有当前 hash 的 skill 包。
2. 当前机器有可执行的 `silan-viking` / `silan` 二进制,且能读到
   `silan-viking.toml` 指向的 content 仓。
3. `silan mcp status --json` 显示本机 MCP 可用,或宿主能按
   `silan mcp serve --stdio` 的相对约定启动/连接它。

缺 ② 或 ③ 时,skill 仍可被 Claude 发现,但只能提示「本环境能力不可用」,
不能伪装成已经接入。这个限制是安全边界:skill 包不是安装器,不会把私人
content 仓、MCP server 或本机二进制复制到协作者机器。

---

## §13.4 description 与正文 —— 让 agent「自己想到」(坎 ③)

这是本章的载重段。skill 能不能兑现 `00-终局`,全看 description 写得准不准 ——
Claude 是靠 description 判断「现在该不该挂载这个 skill」的。

### description 的写法纪律

description 必须覆盖 silan 的**自然语言触发面**,而不是工具名:

- ✅ 覆盖「silan 说出一个想法 / 灵感 / 半成形的念头」—— 对应 `capture`。
- ✅ 覆盖「想写文章 / 推进项目 / 整理某个 idea」—— 对应 `propose` / `summarize_updates`。
- ✅ 覆盖「查看网站内容、访客数据、某篇的浏览/评论」—— 对应 `stats` / `visitors`。
- ❌ 不写「调用 capture 工具时使用」—— 那是工具名,silan 永远不会那样说话。

description 命中的判据是**「silan 像在做什么」**,不是「该调哪个函数」。
agent 先被 skill 正文接住,再由正文把「像在做什么」翻译成「调哪一档 MCP」。

### 正文骨架(`SKILL.md` 正文应包含的段)

```
## 这是什么
  silan 的个人 context 系统。真相源是 markdown，能力经 MCP 提供。
  一句话定位 + 指向 silan://（00-终局）。

## 接入（坎 ②）
  能力来自 MCP。若本会话未接入，按 reference/mcp-tools.md 连接。
  连上后第一件事：调 context_brief() —— 先懂 silan 当前在想什么，再做事。

## 何时做什么（坎 ③ —— 自然语言 → MCP 档位的翻译表）
  | silan 像在…… | 你该做 |
  |---|---|
  | 盘点已有内容（「我有哪些进行中的 project」）| list(type, filter) —— 结构化清单，带 status |
  | 找「写过没写过某主题」 | recall(query) —— 语义检索 |
  | 说出一个半成形的念头 | capture(note, type) —— 起一个提案，不直接落库 |
  | 想把某个想法想深、写成文 | recall 先看有没有相关旧 Item；再 propose |
  | 想推进某个 project / idea | propose 锚到对应 Part（progress 等）|
  | 问「这篇有多少人看」 | stats / visitors / crawler_breakdown / source_breakdown（读 sync 过的本地缓存）|
  | 让你记住关于他/项目的事 | ctx_write 到 silan://agent/ —— 直接写，不走提案 |
  | 会话结束 | reflect(session) —— 沉淀进 agent/sessions/ 与 agent/owner/ |

## 三条不可破的红线（重述 03 安全总则，不新增）
  1. resources/（发布内容）只能 capture/propose，永不 ctx_write、永不直接合。
  2. accept / reject / publish / deploy 不是 agent 能做的 —— 那是 silan 的 CLI 动作。
  3. agent/ 命名空间永不发布。

## 参考
  reference/mcp-tools.md —— 四档工具完整签名（派生自 03-mcp服务.md）。
```

> **正文为什么要重述 `03` 的安全红线**:skill 正文是 agent 实际读到、据以
> 行动的文本。`03` 的安全总则若只活在文档里、不进 skill 正文,agent 运行
> 时看不到 —— 红线必须出现在 agent 真正读的地方。这不是「两套规则」,是
> **同一套规则投影到 agent 的视野里**;`03` 是源,skill 正文是派生投影,
> `silan skill emit` 保证两者不漂移。

---

## §13.5 与既有设计的一致性自查

| 既有约束 | 本章是否一寸不破 |
|---|---|
| `#1` markdown 为真相源 | ✅ skill 包是 `~/.claude/` 下的派生物,不碰 `content/` |
| `#10` agent 经提案改发布内容 | ✅ skill 正文红线①明令 resources/ 只能走提案 |
| `#13` 单租户、选择性发布权在 silan | ✅ skill 正文红线②:accept/publish/deploy 不给 agent |
| `03` MCP 是能力唯一来源 | ✅ skill 零能力,只做发现+触发,全部转指 MCP |
| `00` §0.4「真相源唯一、派生可重建」 | ✅ skill 包由 `silan skill emit` 从真相源重建 |
| `#8` CLI noun-first | ✅ `silan skill emit/status/rm`,noun-first |
| `deploy` 默认关闭的纪律 | ✅ `init` 不自动 emit skill,需 silan 显式调 |

> **设计纪律自查(`00` §0.2)**:本章新增的对象 = `silan skill` 命令组 +
> skill 包产物。两者指回 **`#16`**(协作 agent 经 skill 零配置接入)——
> 该需求已于审查中正式补入 `00` §0.2 需求基线。指得回 —— 不删。

---

## §13.6 既有文档的同步回改 —— 状态

本章落地需四处既有文档同步,**前三处已在本章引入时完成**:

1. ✅ **`00-终局与需求.md` §0.2** —— 已补入 `#16`(协作 agent 经 skill
   零配置接入),并在该节加裁决说明:#16 不是 #12 的细节,是独立分发面。
   §0.1「带这个 skill 的 agent」由此获得需求支撑。
2. ✅ **`02-cli服务.md`「跨类型 / 工具组」** —— 已新增 `silan skill` 命令组
   (`emit`/`status`/`rm`),与 `mcp`/`site`/`proposal` 并列。
3. ✅ **`03-mcp服务.md` 档 1** —— `#15` 的 MCP 工具已与 CLI `silan stats`
   逐一同构:`traffic_breakdown` 拆为 `crawler_breakdown` + `source_breakdown`,
   对齐 CLI 的 `crawlers`/`sources`。两面不再错位。
4. ✅ **`04-里程碑.md`** —— 已回改。`silan skill` **拆成 M8 结构验收 +
   M9 端到端验收**:M8 在 `silan-viking-cli` 中交付 `emit/status/rm`,
   先验证 skill 包可生成、可被 Claude 发现、hash 漂移可检测;M9 等 MCP
   server 就绪后,再验收「skill 包经 MCP 完成一次 capture」(`07` 剧本 K)。

> 四处回改全部完成 —— skill 这条线在 `00`(需求 #16)/ `02`(命令组)/
> `03`(stats 对齐)/ `04`(里程碑)/ `05`(测试场景)/ `07`(剧本 K)/
> `13`(本章)七份文档之间已闭环,无悬空引用。

---

## §13.7 代码落点

skill 生成逻辑放在 **`silan-viking-cli` crate**,不新建 crate ——
理由:skill 包是「渲染几个 markdown 文件到磁盘」,无领域能力,够不上一个
L4 adapter(对比 `silan-viking-mcp` 是一个真的 server 进程)。

```
silan-viking-cli/src/skill.rs   # silan skill emit/status/rm 三个子命令
                                # 读 silan-viking.toml + SCHEMA.md,
                                # 渲染 SKILL.md + reference/ 到 ~/.claude/skills/
```

- `SKILL.md` 的 frontmatter description 用**固定模板字符串**(§13.4 的写法
  纪律已定死),只有正文里的 type 清单 / MCP 坐标是变量插值。
- `silan skill status` 的「一致性比对」:对 `SKILL.md` 与「当前 `silan-viking.toml`
  + `SCHEMA.md` 重新渲染的结果」做逐字节比对 —— 不一致提示 `silan skill
  emit` 重生成。除此之外它输出 §13.3 规则 4 的诊断字段:`binary_found`、
  `mcp_available`、`transport_resolved`、`schema_hash_match`、
  `skill_hash_match`、`status`(`not_installed`/`up_to_date`/`stale`)。
- `silan skill emit` 在 `[mcp].transport = "tcp"` 时额外写
  `reference/mcp-tools.local.md`(`127.0.0.1:<port>` 本机 hint)并把它加进
  skill 包的 `.gitignore` —— 同步包里只留 stdio 约定的 `mcp-tools.md`。
  stdio(默认)不生成 local 文件。

> 这一章不动 L1–L3,不动 `silan-viking-mcp`。它纯粹是 `silan-viking-cli`
> 多一个工具命令组 —— 与 `01` §1.1「加一个新对外接口才加 L4 crate」自洽:
> skill 不是新接口,是把既有 MCP 接口「打包让 agent 易于发现」,留在 CLI。
