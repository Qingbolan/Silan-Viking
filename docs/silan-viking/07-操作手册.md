# 07 · 操作手册 —— 用户想做 X,一步步怎么做

> `06` 是主线骨架(安装→部署),本章是**具体任务的剧本**:每条以「用户想做
> 什么」起头,逐行给出 **敲什么命令 / 对 agent 说什么 / 屏幕回什么 / 文件怎么变**。
> 不是口号 —— 一条剧本读完,用户照着能原样跑通。
>
> 约定:`$` 行是终端命令,缩进行是屏幕输出,`▸ silan:` / `▸ agent:` 是
> 与协作 agent 的对话。

## 剧本索引

| # | 用户想做 | 谁来做 | §  |
|---|---|---|---|
| A | 装完后配置 CLI | silan | §7.1 |
| B | 开第一个 idea | silan | §7.2 |
| C | 直接写一篇 blog | silan | §7.3 |
| D | 维护一个 project(更新进展)| silan | §7.4 |
| E | 让 agent 帮忙改简历 | agent(走提案)| §7.5 |
| F | 从一个 idea 长出 blog | agent(走提案)| §7.6 |
| G | idea 成熟,转成 project | owner + agent | §7.7 |
| H | 给已有内容加中文版 | silan / agent | §7.8 |
| I | 删除 / 归档内容 | silan | §7.9 |
| J | 让 agent 体检内容、汇总动态 | agent | §7.10 |
| K | 给 agent 装 skill,让它零配置接入并维护 | silan + agent | §7.11 |

> 权限总则(承 `03` §3.1):agent 改**记忆**直接生效;agent 改**发布内容**
> (简历/blog/project)**一律走提案分支**,`silan proposal accept` 才入真相源。
>
> 剧本 A–J 的 agent 走「手动 `silan mcp serve` + 手动接入」;**剧本 K 是
> 同一套能力的零配置形态** —— 装一个 skill,agent 自动发现、自动接入。两条
> 路能力一致,差别只在「怎么接上」。

---

## §7.1 配置 CLI(剧本 A)

`silan init` 后,两个配置文件要填:全局 `~/.config/silan/config.toml`、
项目 `~/.silan-viking/silan-viking.toml`(`06` §6.1/§6.2.2 给了完整字段)。
本节是**实际操作**。

**第一步 —— 决定要不要 LLM**。引擎默认纯本地(规则法生成 L0 摘要),不需要
配 LLM 也能跑。想让 agent 的 `context_brief`、L0 摘要更聪明,才填:

```
$ silan config edit --global          # 打开 ~/.config/silan/config.toml
```

填 `[llm]` 段(不想用 LLM 就跳过这步):

```toml
[llm]
provider = "anthropic"
api_key  = "sk-ant-..."        # 在 ~/.config/silan/ 下,不进任何 Git
```

**第二步 —— 填部署目标**(暂不部署可跳过,部署前再填):

```
$ silan config edit                   # 打开项目 silan-viking.toml
```

填 `[deploy]` 段,`ssh_key_path` 指向你的部署私钥:

```toml
[deploy]
host         = "silan.tech"
user         = "deploy"
ssh_key_path = "~/.ssh/silan_deploy_ed25519"
```

**第三步 —— 验证配置**:

```
$ silan doctor
  silan doctor —— 配置与环境检查

  ✓ 全局配置  ~/.config/silan/config.toml
  ✓ 项目配置  ~/.silan-viking/silan-viking.toml
  ✓ LLM       anthropic(api_key 已配)
  ⚠ 部署      ssh_key_path ~/.ssh/silan_deploy_ed25519 不存在
              → 部署前用 ssh-keygen 生成,或先不部署
  ✓ Git 仓    content/ 已初始化

  1 warning —— 不阻塞日常使用,部署前解决即可。
```

> `silan doctor` 是**每次拿不准配置对不对时**的第一条命令。它逐项 `✓/⚠/✗`,
> warning 不阻塞,`✗` 才必须修。

---

## §7.2 开第一个 idea(剧本 B)

silan 有个想法,要把它记下来。两条路。

### 路 1 —— 自己建

```
$ silan idea new rust-context-engine
  ✓ 创建 content/resources/ideas/rust-context-engine/
  ✓ 创建 content/resources/ideas/rust-context-engine/parts/overview/{meta.toml, en.md}
  ✓ 更新 content/resources/ideas/.silan-cache

  下一步:编辑 parts/overview/en.md 写下你的想法;silan index sync 同步到库。
```

打开 `parts/overview/en.md`,模板已把 frontmatter 起好,silan 填正文:

```markdown
---
slug: rust-context-engine
title: "用 Rust 写一个上下文引擎"
kind: idea
status: hypothesis
tags: [rust, context]
tldr: ""                        # 留空 → sync 时引擎自动生成 L0
---

# 用 Rust 写一个上下文引擎

## Motivation
现在的内容管理是 Python,想用 Rust 重写...

## Approach
...
```

同步进库:

```
$ silan index sync
  ✓ ideas/rust-context-engine —— 新增
  ✓ 生成 L0 摘要:"用 Rust 重写内容引擎的设想"
  1 新增, 0 更新, portfolio.db 已刷新
```

### 路 2 —— 对 agent 说

agent 已接入(`silan mcp serve`,见 §7.5 第一步)。silan 在对话里:

```
▸ silan: 我有个想法 —— 用 Rust 重写现在的内容引擎,想记下来。
▸ agent: (调 capture)已为你起草一个 idea「用 Rust 写一个上下文引擎」,
         放在提案分支 proposal/01H...,你可以 silan proposal show 看。
```

`capture` 起草的是**提案**(内容类,走提案):

```
$ silan proposal list
  01H8X...  idea  rust-context-engine  "用 Rust 写一个上下文引擎"  ✓校验通过
$ silan proposal accept 01H8X...
  ✓ merge proposal/01H8X... → 主分支
  ✓ content/resources/ideas/rust-context-engine/ 已落地
```

> 两条路殊途同归:都得到 `content/resources/ideas/rust-context-engine/`。路 1 适合你
> 想自己写,路 2 适合你只有个模糊念头、让 agent 起草。

---

## §7.3 直接写一篇 blog(剧本 C)

不经 idea,直接起一篇博文。

```
$ silan blog new 2026-rust-rewrite-notes
  ✓ 创建 content/resources/blog/2026-rust-rewrite-notes/
  ✓ 创建 .../en.md(body Part,主语言)
```

`en.md` 写好正文(frontmatter 模板已起好,填 `content_type`/`tags` 等),
然后 sync:

```
$ silan index sync
  ✓ blog/2026-rust-rewrite-notes —— 新增
$ silan content show silan://resources/blog/2026-rust-rewrite-notes
  blog · 2026-rust-rewrite-notes
  title    Rust 重写笔记
  status   draft
  langs    en
  L0       "记录用 Rust 重写引擎的过程与取舍"
```

要发布,把 frontmatter 的 `status` 改 `published`,再 sync。要上线网站,
见 §7 末「发布」或 `06` §6.5。

> blog 是单 Part(`body`),没有 idea/project 的多 tab —— 一篇就是一个正文文件。

---

## §7.4 维护一个 project —— 更新进展(剧本 D)

project 已存在(`content/resources/projects/silan-viking/`)。owner 要记一笔进展。

project 有多个 Part:`overview` / `progress` / `reference`,每个 Part 是
`parts/<role>/` 目录(`meta.toml` + 各语言 `.md`/`.toml`)。更新进展 = 写 `progress` Part。

**如果 `progress` Part 还不存在**(首例只建 overview,progress 是可选 Part):

```
$ silan project add-part silan-viking progress
  ✓ 创建 content/resources/projects/silan-viking/parts/progress/{meta.toml, en.md}
```

打开 `parts/progress/en.md` 追加一段进展,然后:

```
$ silan index sync
  ✓ projects/silan-viking —— 更新(progress Part 变化)
  ✓ item_part 表:progress / en 行已刷新
```

`silan content show silan://resources/projects/silan-viking` 会列出它现在
有 overview + progress 两个 Part。

> 「维护 project」的本质就是**往它的 Part 里写**。加新 tab = `add-part`,
> 改已有 tab = 改对应 `.md`。tab 按需生长(§1.3.1)。

---

## §7.5 让 agent 帮忙改简历(剧本 E)

silan 想给简历加一段新经历,让协作 agent 代劳。

> **依据(`10` 裁决 #2)**:resume **不是**单 `body` Part —— 它是多 Part:
> `summary`(prose)、`education` / `experience` / `publications` / `awards` /
> `research`(entry_list)、`skills`(key_value_list)。结构化 Part 的源文件是
> `parts/<role>/<lang>.toml`(TOML array-of-tables),每条 entry 带稳定锚点
> `entry_id = "e_<ulid>"`。「给简历加一段经历」= 往 `experience` 这个
> entry_list Part 加一条 `[[entry]]`,**不是**改一个笼统的 `body`。

**第一步 —— 起 MCP server,让 agent 接入**:

```
$ silan mcp serve --stdio
  silan mcp serve —— stdio 模式,等待 agent 接入
  ✓ SCHEMA + 项目概览 已就绪,等待 agent 接入
  [agent claude-1 接入] 已推送 SCHEMA(6 type)+ 项目概览(blog 3 / idea 2 / project 1 / resume 1)
```

agent 接入瞬间就「明白」了项目(`06` §6.3 握手推送)。SCHEMA 是 **6 type**
(idea/blog/project/episode/resume/update,`10` 裁决 #1/#3)。

**第二步 —— 对 agent 说要改什么**:

```
▸ silan: 简历加一段经历 —— 2026 年起在 X 公司做 AI infra。
▸ agent: (读 resume 的 experience Part → 在 parts/experience/en.toml 顶部
         加一个 [[entry]] 块,引擎为它生成 entry_id=e_<ulid>
         → 调 propose,锚到 silan://resources/resume/resume/experience)
         已起草。提案 proposal/01HA..., 校验通过。改动:parts/experience/en.toml
         +1 条 entry(e_01HA9...)。silan proposal show 01HA... 看 diff。
```

> agent 改的是 **experience Part 的一条 entry**,不动其他 Part。新 entry 由
> 引擎补 `entry_id`,sync 时能精确定位「这一条是新增」(`10` §10.4.5)。

**第三步 —— silan 审、收**:

```
$ silan proposal show 01HA...
  提案 01HA... · resume · experience Part(entry_list)· 校验 ✓
  --- diff(proposal 分支 vs 主分支)---
  parts/experience/en.toml:
  + [[entry]]
  + entry_id   = "e_01HA9..."
  + company    = "X 公司"
  + position   = "AI Infra Engineer"
  + start_date = 2026-01-01
  + is_current = true
$ silan proposal accept 01HA...
  ✓ 临时区 merge + 校验② 通过(entry_fields 契约校验:company/position 必填 ✓)
  ✓ 主分支指针推进 → parts/experience/en.toml 已更新
$ silan index sync
  ✓ resume —— 更新;experience Part 的 part_entry 表 +1 行(e_01HA9...)
```

> 全程 agent **没碰真相源** —— 它只写提案分支。简历真正变,是 owner 那一下
> `accept`。这就是「agent 经 skill 更新内容、但 owner 是作者」(§3.1)。
> 注意 sync 落库到通用 `part_entry` 表(不是旧的 `work_experience` 专用表
> —— `10` 裁决 #2:不为 resume 的结构化 Part 建专用 ent 表)。

> **改已有一条 entry**(比如订正某段 education 的 GPA):agent 同样走提案,
> 但改的是 `parts/education/en.toml` 里**那一条 `[[entry]]`**(靠 `entry_id`
> 定位),其余 entry 不动 —— sync 据 `entry_id` 精确更新单行,`git diff`
> 只有那一条变。命令 `silan resume edit education` 打开同一文件供 owner 直接改。

---

## §7.6 从一个 idea 长出 blog(剧本 F)

`rust-context-engine` 这个 idea(§7.2 建的)想清楚了,silan 想基于它写一篇 blog。

```
▸ silan: 把 rust-context-engine 这个 idea 写成一篇 blog。
▸ agent: (recall 读 idea 的 README → 起草一篇 blog → propose 起新 blog
         + 在 blog frontmatter 写一条演化边 documents → 该 idea)
         已起草 blog「用 Rust 重写内容引擎:设计笔记」,提案 proposal/01HB...。
         附带一条关系:blog --documents--> ideas/rust-context-engine。
```

```
$ silan proposal show 01HB...
  提案 01HB... · 新增 blog「用 Rust 重写内容引擎:设计笔记」
  + content/resources/blog/rust-rewrite-design-notes/parts/body/en.md
  + 关系:blog/rust-rewrite-design-notes --documents--> ideas/rust-context-engine
  校验 ✓
$ silan proposal accept 01HB...
  ✓ 已落地;关系写入 content_relation 表
```

之后查这个 idea,能看到它「被哪篇 blog 记录」:

```
$ silan relation show silan://resources/ideas/rust-context-engine
  正向:(无)
  反向:blog/rust-rewrite-design-notes  --documents-->  本 idea
```

> idea→blog **不是**把 idea 搬走 —— idea 还在,blog 是新条目,两者间一条
> `documents` 演化边(`#4`)。这条边是 agent 在 propose 时一并建的。

---

## §7.7 idea 成熟,转成 project(剧本 G,补漏场景)

`rust-context-engine` 不只想清楚了,silan 决定动手做 —— 它要从 idea 变 project。

**关键:不是「idea 改成 project」**。idea 是 idea(`content/resources/ideas/`),project
是 project(`content/resources/projects/`),两个独立条目(`#4`:三独立条目)。「转」=
**新建一个 project + 建一条 `evolved-from` 演化边指回 idea**。

```
$ silan project new rust-context-engine
  ✓ 创建 content/resources/projects/rust-context-engine/(overview Part)
$ silan relation link \
    silan://resources/projects/rust-context-engine \
    silan://resources/ideas/rust-context-engine \
    --type evolved-from
  ✓ 关系写入:project --evolved-from--> idea
```

或对 agent 说「把 rust-context-engine 这个 idea 立项」,agent `propose` 一个
新 project + `evolved-from` 边,silan `accept`。

idea 的 `status` 可顺手改成 `shipped`(它催生了 project),但 idea 条目**保留**
—— 它是这个 project 的思想源头,演化链(`#4`)要它在。

---

## §7.8 给已有内容加中文版(剧本 H,补漏场景)

`welcome` 这篇 blog 现在只有 `en.md`,owner 要加中文。

blog 的 body Part 是 `parts/body/` 目录(`01` §1.3.1)。加中文 = 在该 Part
目录里加一个 `zh.md` representation:

```
$ silan blog add-lang welcome zh
  ✓ 创建 content/resources/blog/welcome/parts/body/zh.md(body Part 的 zh representation)
  ✓ parts/body/meta.toml:variants 增加 zh(translation_of 字段位留空,见 01 §1.3.2)
```

打开 `parts/body/zh.md` 译/写中文正文,然后 sync:

```
$ silan index sync
  ✓ blog/welcome —— 更新;langs: en, zh
  ✓ blog_post_translations 表:zh 行已写入
```

> `Part`(角色)与 `File`(语言)两维正交(§1.3)—— 加语言是在 Part 下加
> File,不动 Part 结构。Parsed 的多语言变体(§1.8.0)接住它,Mapper 映射到
> `*_translations` 表。

---

## §7.9 删除 / 归档内容(剧本 I,补漏场景)

silan 想下线一篇旧 blog。两种力度:

**归档(推荐)** —— 内容留着,不再公开:

```
$ silan blog archive old-post
  ✓ frontmatter status 改为 archived
$ silan index sync && silan site deploy --confirm
  归档的内容不再投影到网站(SiteProjector 只投 visibility=public)
```

**彻底删除** —— 真删文件:

```
$ silan blog rm old-post
  ⚠ 将删除 content/resources/blog/old-post/ 整个目录,且:
    - 检测到 1 条演化边指向它(idea/x --documents--> 本 blog)
    - 删除后该边变悬空
  确认删除?[y/N] y
  ✓ 已删除;content_relation 中相关边一并清理;git commit「remove blog/old-post」
```

> `remove` 前引擎**主动检查演化边** —— 删一个被引用的条目会留悬空边
> (`#4`、§1.8.2),引擎提示后再删并清理。这是 `silan index lint` 的同类
> 检查,前置到了删除动作里。

---

## §7.10 让 agent 体检内容、汇总动态(剧本 J,补漏场景)

silan 让 agent 做两件维护活,都是**只读 / 提案**,不直接改真相源。

**内容体检** —— agent 调 `lint`(`03` 档 1,只读):

```
▸ silan: 帮我体检一下内容,看有没有问题。
▸ agent: (调 lint)体检报告:
         · ideas/old-idea —— status=exploring 但 6 个月未更新,建议复查
         · blog/draft-x —— 悬空演化边:documents → 一个已删的 idea
         · projects/y —— overview Part 缺 tldr,L0 摘要为空
         3 项,无致命问题。要我起草修复提案吗?
```

**动态汇总** —— agent 调 `summarize_updates`(`03` 档 3,走提案):

```
▸ silan: 把最近的更新汇总成一条动态。
▸ agent: (读近期 git log + 内容变化 → 起草一个 update Item → propose)
         已起草 update「近期:Rust 引擎设计定稿、新增 2 篇 blog」,提案 proposal/01HC...。
$ silan proposal show 01HC...
  提案 01HC... · 新增 update「近期:Rust 引擎设计定稿、新增 2 篇 blog」
  + content/resources/update/2026-05-rust-engine-recap/parts/body/en.md
  校验 ✓
$ silan proposal accept 01HC...
  ✓ update 已落地;recent_updates 表新增一行
```

> `update` 是**第 6 种 content type**(`10` 裁决 #3)—— 它有独立容器
> `content/resources/update/<slug>/parts/body/`、独立 parser、独立内容主表
> `recent_updates`。汇总出来的不是某条派生记录,而是一个正经的 `update` Item。

> 体检是**只读**(agent 给报告,不改);汇总是**提案**(agent 起草 update,
> owner accept)。两者都不让 agent 碰真相源 —— 维护活也守 §3.1 的边界。

---

## §7.11 给 agent 装 skill,让它零配置接入并维护(剧本 K)

> 对应 `13-skill-分发.md` 与需求 `#16`。剧本 E/J 里 agent 走的是「silan 手动
> `silan mcp serve` + agent 手动接入」;本剧本是**同一套能力的零配置形态** ——
> silan 装一个 skill,以后任何 Claude agent 一启动就自动发现 silan-viking、
> 自动接入,silan 只管说话。skill **不新增能力**,它让 E/J 那套能力「自己接上」。

**第一步 —— silan 生成并安装 skill(一次性)**:

```
$ silan skill emit
  ✓ 已生成 ~/.claude/skills/silan-viking/
      SKILL.md                (name + description + 正文)
      reference/mcp-tools.md  (四档 MCP 工具速查)
  ✓ 正文已嵌入:6 个 content type 清单、MCP 本机解析规则
  下一步:silan mcp status --json 检查本机可用性,再用 silan mcp serve --stdio 接入
```

> `silan skill emit` 是**派生动作**,不碰真相源 —— 同 `portfolio.db`,改了
> SCHEMA 重 emit 即可。`silan init` **不**自动 emit:skill 是「让协作 agent
> 用」的可选层,silan 显式开启(同 `site deploy` 默认关闭)。

**第二步 —— 起 MCP server(skill 指挥 agent 连它,但起进程仍是 silan 的事)**:

```
$ silan mcp status --json
  {"available":true,"transport_resolved":"stdio","schema_hash_match":true,"skill_hash_match":true}
$ silan mcp serve --stdio
  silan mcp serve —— stdio 模式,等待 agent 接入
```

**第三步 —— agent 零配置接入,silan 只是说话**:

```
▸ silan: (在一个全新的 Claude 会话里)我最近在想个事 —— 把简历的研究方向
         那段重写一下,突出 AI infra。
▸ agent: (Claude 扫 ~/.claude/skills/,description 命中「silan 说出想法 /
         想写作 / 推进项目」→ 挂载 silan-viking skill
         → 正文「接入」段:先看 silan mcp status --json,再用 stdio 接入 MCP,
         第一件事调 context_brief()
         → 正文翻译表:「想改某个 Part」→ propose,锚到对应 Part)
         我先看了你当前的 context —— 你这周在推 Rust 引擎定稿。
         简历的 research Part 我已起草修改,锚到 research 这一个 Part,
         提案 proposal/01HD...,校验通过。silan proposal show 01HD... 看 diff。
```

> 对比剧本 E:silan **没说**「连 MCP」「调 propose」任何一个词。skill 正文
> 的 description + 翻译表替 agent 把「silan 像在做什么」翻译成了「调哪一档
> MCP」(`13` §13.4 坎③)。这就是 `00-终局` §0.1「与一个带这个 skill 的
> agent 说话」的落地。

**第四步 —— 维护活也一样零配置**。silan 说「帮我体检内容」「汇总一条动态」,
agent 经 skill 自动走 `lint` / `summarize_updates`(同剧本 J),全程不需 silan
点名工具。

**第五步 —— 红线不变,发布仍是 silan 的事**:

```
$ silan proposal accept 01HD...
  ✓ 临时区 merge + 校验② 通过;research Part 已更新
```

> skill 正文里写死了三条红线(`13` §13.4):agent 对 `resources/` 只能
> propose、`accept`/`publish`/`deploy` 人专属、`agent/` 永不发布。**装了
> skill 不等于放权** —— agent 经 skill 能「维护、起草」,发布的最后一下
> 永远是 silan 的 `silan proposal accept` / `silan site deploy`。

> **skill 是「怎么接上」,不是「能做什么」**:剧本 K 与 E/J 的能力完全一致
> —— capture / propose / lint / summarize_updates 一个不多一个不少。skill
> 改变的只是接入成本:从「silan 手动起 server + 告诉 agent 怎么连」降到
> 「agent 自己发现、自己连、自己想到该做什么」。

---

## §7.12 这些剧本验证了什么

每条剧本都是一条「用户想做 X」从头跑到尾的真实路径。它们合起来验证:
`silan` CLI 的命令、`03` 的 MCP 提案机制、`13` 的 skill 分发、`#4` 的演化边、
`01` 的 Part/多语言模型 —— 不只是设计上自洽,而是**拼成了用户真实会走的操作流**。

> 一条剧本若读下来发现某一步「没有对应命令 / 机制」,就是设计缺口。本章每条
> 剧本的每一步都落到了具体命令或 MCP 工具 —— M1 实施时,这些剧本即验收脚本。
