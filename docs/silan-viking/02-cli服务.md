# 02 · CLI 服务清单(`silan …`)

> 服务需求 `#8`(noun-first,对齐 EasyNet-Cli `<binary> <noun> <verb>`)。
> CLI 是 owner 的操作面。每个命令标注它服务哪条需求。
>
> **命令组分两类**:① 每种内容 type 一个**专属命令组**(`idea`/`blog`/
> `project`/`episode`/`resume`/`update`,共 6 个)—— 各带完整增删改查 +
> 类型专属操作;② **跨类型 / 工具组**(`content`/`index`/`relation`/
> `site`/`stats`/`proposal`/`mcp`/`skill`)。

---

## 一、内容 type 专属命令组(对应 #2 #3 #4 #5)

6 种 type 各一个名词组(`idea`/`blog`/`project`/`episode`/`resume`/
`update`)。**增删改查的六动词统一**(`new`/`list`/`show`/`edit`/`rm`/
`archive`),**类型专属操作各组不同**。

### `silan idea <verb>` —— 想法

```
silan idea new <slug>            新建一个 idea(scaffold 目录 + parts/overview/{meta.toml,en.md})
silan idea list                  列出所有 idea(可 --status hypothesis 等筛选)
silan idea show <slug>           显示一个 idea(各 Part + 元数据 + 演化关系)
silan idea edit <slug> [part]    打开 idea 某 Part 的 .md(默认 overview)
silan idea rm <slug>             ★真删:删整个目录,删前检查悬空演化边并确认
silan idea archive <slug>        归档:status 改 archived,不删文件,不再投影到网站
# ── idea 类型专属 ──
silan idea status <slug> <state> 推进生命周期:hypothesis→exploring→building→shipped
silan idea promote <slug> --to blog|project
                                 一键演化:从 idea 起草 blog 或 project,
                                 并自动建演化边(blog→documents、project→evolved-from)
silan idea add-part <slug> <role>   加一个可选 Part(progress/reference/result)
silan idea add-lang <slug> <lang>   给 idea 加一个语言变体
```

### `silan blog <verb>` —— 博文 / vlog

```
silan blog new <slug>            新建一篇 blog(scaffold + parts/body/{meta.toml,en.md})
silan blog list                  列出所有 blog(可 --status / --content-type vlog 筛选)
silan blog show <slug>           显示一篇 blog
silan blog edit <slug> [lang]    打开 blog 某语言的 .md(默认主语言)
silan blog rm <slug>             ★真删:删前检查悬空演化边并确认
silan blog archive <slug>        归档
# ── blog 类型专属 ──
silan blog publish <slug>        发布:status 改 published(可被投影到网站)
silan blog unpublish <slug>      撤回发布:status 改回 draft
silan blog add-lang <slug> <lang>   加语言变体(en.md → zh.md…)
```

### `silan project <verb>` —— 项目

```
silan project new <slug>         新建一个 project(scaffold + parts/overview/{meta.toml,en.md})
silan project list               列出所有 project(可 --status active 等筛选)
silan project show <slug>         显示一个 project(各 Part + 演化关系 + 进展)
silan project edit <slug> [part] 打开 project 某 Part 的 .md(默认 overview)
silan project rm <slug>           ★真删:删前检查悬空演化边并确认
silan project archive <slug>      归档
# ── project 类型专属 ──
silan project progress <slug>    往 project 的 progress Part 追加一条进展
                                 (progress Part 不存在则自动建,见 07 §7.4)
silan project add-part <slug> <role>   加一个可选 Part(progress/reference)
silan project add-lang <slug> <lang>   加语言变体
```

### `silan episode <verb>` —— 独立 type:容器系列 + 系列下的剧集

> episode 是**独立 content type、独立容器系列**(`#5`、10 §10.4.4 裁决
> #1)—— 不依附 blog。磁盘形态:`content/resources/episode/<series>/`
> 下 `series.toml` + 各 `<episode-slug>/parts/body/`。每个 episode 是
> 一个独立 Item,落 `episodes` 表(不进 `blog_posts`)。命令组同时表达
> 「系列」与「系列下的单集」两层:`series` 子动词管系列,其余动词管单集。

```
# ── 系列层(容器系列)──
silan episode series new <series>     新建一个容器系列(scaffold + series.toml)
silan episode series list             列出所有系列
silan episode series show <series>    显示系列(系列总览 + 有序 episode 清单)
silan episode series reorder <series> 调整系列下各集的顺序(episode_number)
silan episode series rm <series>      ★真删整个系列(连同其下所有 episode)
silan episode series archive <series> 归档系列(status 改 archived)
# ── 单集层(每集是一个独立 Item)──
silan episode new <series> <slug>     往系列加一集(scaffold + parts/body/{meta.toml,en.md};episode_number 自动定序)
silan episode list [<series>]         列出 episode(给 <series> 则只列该系列下的)
silan episode show <series> <slug>    显示一集(frontmatter + body)
silan episode edit <series> <slug> [lang]  打开该集 parts/body/<lang>.md(默认主语言)
silan episode rm <series> <slug>      ★真删一集
silan episode archive <series> <slug> 归档一集
silan episode add-lang <series> <slug> <lang>   给该集加语言变体
# ── episode 类型专属 ──
silan episode publish <series> <slug>    发布一集:status 改 published
silan episode unpublish <series> <slug>  撤回:status 改回 draft
```

### `silan resume <verb>` —— 简历(单 Item · 多 Part)

> resume 是**单 Item**,但**不是单 body Part** —— 它有多个 Part:
> `summary`/`education`/`experience`/`publications`/`awards`/`research`/
> `skills`,每个 Part 各有自己的 `shape`(`prose` / `entry_list` /
> `key_value_list`,见 10 §10.4.5 裁决 #2)。因此 `edit` 必须指到具体
> Part,不能像旧设计那样只开一个 `parts/body/<lang>.md`。

```
silan resume show [part]         显示简历(不给 part:各 Part 总览;给 part:只显示该 Part)
silan resume edit <part> [lang]  打开 parts/<part>/<lang>.<ext>(<part> ∈ summary/education/
                                 experience/publications/awards/research/skills;默认 part=summary)
                                 # <ext> 由 Part 的 shape 决定:prose→.md,entry_list/key_value_list→.toml
silan resume list                列出 resume 当前已建的各 Part 及其 shape
silan resume add-part <role>     加一个 Part(role 取 SCHEMA.md resume.parts 配置的可选项)
silan resume add-lang <part> <lang>  给某 Part 加语言变体(parts/<part>/ 下加 <lang>.md 或 .toml,按 shape)
# resume 是单 Item,无 new/rm —— silan init 时已建,不增不删整个 Item
# Part 粒度可增(add-part);Part 删除走 SCHEMA 配置,不在此命令组
```

> resume 的 `show`/`edit`/`add-lang` 都带 `<part>` 维度 —— 旧设计假设
> resume 是单 body Part(`silan resume edit [lang]`),与 10 §10.4.5
> 「resume 多 Part」裁决冲突,已修正。`add-part` 用于把 SCHEMA.md 里
> 声明为可选(非 required)的 Part 真正落到磁盘。

### `silan update <verb>` —— 动态更新(第 6 个 type)

> `update` 是**第 6 种 content type**(10 §10.4.6 裁决 #3)—— 有独立
> parser、独立 `ContentKind::Update`、独立 mapper,`recent_updates` 是
> 它的内容主表。它带生命周期(`status` ∈ active/ongoing/completed),
> 所以专属操作参考 `idea` 组的 `status` 推进式动词。

```
silan update new <slug>          新建一条 update(scaffold + parts/body/{meta.toml,en.md})
silan update list                列出所有 update(可 --status active / --update-type release 等筛选)
silan update show <slug>         显示一条 update(frontmatter + body + 演化关系)
silan update edit <slug> [lang]  打开 update 某语言的 .md(默认主语言;update 仅 body 一个 Part)
silan update rm <slug>           ★真删:删前检查悬空演化边并确认
silan update archive <slug>      归档:status 不变,visibility 不再投影到网站
# ── update 类型专属 ──
silan update status <slug> <state>  推进生命周期:active→ongoing→completed
silan update set-type <slug> <update_type>
                                 设 update_type ∈ milestone/achievement/progress/release/
                                 announcement/insight/learning/reflection(8 值,见 10 §10.4.6)
silan update add-lang <slug> <lang> 加语言变体
```

> 增删改查的统一性:`new`/`list`/`show`/`edit`/`rm`/`archive` 六个动词在
> idea/blog/project/update 四组**完全同名同义**(resume/episode 因形态特殊
> 有删减或扩维)—— 用户学一组就会其余组。专属操作(`status`/`publish`/
> `progress`/`promote`/`set-type`)才是各 type 的差异,各组单列。
>
> `rm` vs `archive`:`archive` 是日常用的"下线"(只改 status,内容留着);
> `rm` 是彻底删除文件,**删前必检查悬空演化边 + 二次确认**(`#4`、见 07 §7.9)。

---

## 二、跨类型 / 工具命令组

### `silan content <verb>` —— 跨类型只读浏览(对应 #2)

```
silan content ls <uri>     列出某 silan:// 路径下的内容(跨所有 type)
silan content tree         层级浏览整个 content/
silan content show <uri>   按 silan:// URI 显示任一条目(不分 type)
```

> `content` 组**只读、跨类型** —— 它是"鸟瞰整个 content/"。增删改具体内容
> 走上面的 type 专属组。`content show <uri>` 与 `<type> show <slug>` 的区别:
> 前者按完整 URI、不需知道 type;后者在已知 type 时更短。

### `silan index <verb>` —— 索引与同步(对应 #1)

```
silan index sync       扫描 content/ → 解析 → 写 portfolio.db(更新逻辑全链见 06 §6.4)
silan index rebuild    全量重建(.silan-cache + 派生数据,逐字节幂等)
silan index lint       体检:悬空演化边、缺字段、孤立 Item、过期内容(对应 #11)
silan index status     工作区状态:各 Collection 条目数、未同步项
```

### `silan relation <verb>` —— 演化关系(对应 #4)

```
silan relation link <from> <to> --type <kind>   建有向边(写 content_relation)
silan relation show <uri>                       打印某条目正/反向关系
silan relation graph                            导出关系图(网站知识图谱数据源)
# kind ∈ evolved-from/into · documents · references · supersedes · part-of
```

### `silan site <verb>` —— 网站投影与运维(对应 #11 #14)

```
silan site build       构建前端 + 生成爬虫产物(sitemap/robots/JSON-LD/预渲染/meta,#14)
silan site preview     本地预览整站
silan site check       发布前体检(死链/缺图/SCHEMA)
silan site publish <uri>   把一个 Item 的 visibility 置 public(选择性发布)
silan site deploy      Docker 部署(--dry-run 默认开,--confirm 才真部署);部署即带爬虫产物
silan site rollback    回退到上一发布
silan site status      线上服务健康 + 当前部署的 content commit
```

### `silan stats <verb>` —— 内容交互数据查询(对应 #15)

```
silan stats sync <uri>        从生产服务器拉这个 Item 的运行时统计进本地缓存
silan stats show <uri>        某 Item 的浏览/点赞/评论统计(读本地缓存)
silan stats visitors <uri>    访客明细:指纹 / IP / visitor_kind / referrer_kind
silan stats crawlers <uri>    按访客类型聚合:人类 / 搜索引擎 / AI 爬虫;具体爬虫抓取次数
silan stats sources <uri>     按来源聚合:搜索 / 社交 / AI 对话 / 直接 / 引荐
```

> **`stats` 是 sync-then-query 模型**(owner 裁定的设计变更 —— 早期设计是
> 「远程实时查询」,实现时改为先同步再本地查)。运行时数据(评论/打点)
> 只在生产服务器(`01` §1.8)—— 本地 `portfolio.db` 的 `content_interaction`
> 表**是空的**。链路两步:
> - `silan stats sync <uri>` 通过 HTTP 调**服务器上 Go API 的 stats
>   endpoint**(`/api/v1/stats/...`),把该 Item 的统计拉进本地
>   `portfolio.db` 的 `stats_cache_*` 表。服务器地址取 `silan-viking.toml`
>   的 `[deploy].api_base`,或由 `[deploy].host` 推导 `https://<host>`。
> - `stats show/visitors/crawlers/sources <uri>` **读这份本地缓存**,离线可用。
>
> 未 `sync` 过的缓存,读命令清楚提示「先 run `silan stats sync`」;未部署
> (无 `[deploy]`)时 `stats sync` 报错提示「运行时数据需先部署」。
> MCP 的 #15 四工具与 CLI 同源 —— 读同一份本地缓存(见 `03` 档 1)。

### `silan proposal <verb>` —— agent 提案的人侧审阅(对应 #10,机制见 03 §3.1)

```
silan proposal list           列待审提案;校验不过的标红
silan proposal show <id>      看提案 diff(提案分支 vs 主分支)+ 校验报告 + 冲突文件
silan proposal accept <id>    临时区 merge+校验②→过才把主分支指针推进到已验证结果
silan proposal reject <id>    删提案分支
silan proposal rebase <id>    陈旧提案分支重对最新主分支;遇冲突停下,解完 rebase --continue
# 提案 = content 仓的一个 Git 分支(proposal/<ulid>)。accept/reject/rebase 人专属
```

### `silan mcp <verb>` —— MCP 服务进程(对应 #10 #12)

```
silan mcp serve           打印握手信息(SCHEMA 版本、工具清单),供运维核对
silan mcp serve --stdio   启动 stdio JSON-RPC MCP server,供 MCP host 驱动(06 §6.3)
silan mcp status          就绪探测:binary / SCHEMA / content 仓 / 工具数
```

> `mcp status` 不是查常驻 server(没有常驻进程可查),是一次本机就绪探测:
> 报告 `binary_found`、`schema_present`、`content_repo`、`tools_advertised`、
> `mcp_available` —— 与 `silan skill status` 的诊断字段对齐(`13` §13.3)。

### `silan skill <verb>` —— 协作 agent 的 skill 包分发(对应 #16)

```
silan skill emit     生成 skill 包到 ~/.claude/skills/silan-viking/(--path 改输出位置)
                     从 silan-viking.toml + content/SCHEMA.md 派生,已存在则覆盖
silan skill status   检查 skill 是否已装、与当前项目状态是否一致(ContentHash 比对)
silan skill rm       移除已装的 skill 包
```

> skill 包是**派生物**,非真相源 —— 同 `portfolio.db`,可由 `silan skill
> emit` 随时重建。`silan init` **不**自动 emit:skill 是「让协作 agent 用」
> 的可选层,需 silan 显式开启(同 `site deploy` 默认关闭的纪律)。skill 不
> 内含能力,它指挥 Claude 去连 `silan mcp serve` 的 server —— 完整机制、
> SKILL.md 形态、自动触发说明书见 `13-skill-分发.md`。

### 顶层命令

```
silan init                初始化项目于 ~/.silan-viking/(--path 改址);见 06 §6.2
silan config edit         编辑项目配置;--global 编辑 ~/.config/silan/config.toml
silan doctor              跨层健康检查
silan completion <shell>  shell 补全
```

---

## 设计要点

- **命令组总览**:6 个 type 专属组(`idea`/`blog`/`project`/`episode`/
  `resume`/`update`)+ 7 个工具组(`content`/`index`/`relation`/`site`/
  `stats`/`proposal`/`mcp`)+ 4 个顶层命令(`init`/`config`/`doctor`/
  `completion`)。(6 type 见 10 §10.4 裁决 #3。)
- **为什么 type 专属组,不用泛型 `content --type`**:idea/update 有生命
  周期(`status`)、blog/episode 有发布(`publish`)、project 有进展维护
  (`progress`)、resume 有多 Part 维度的 `edit <part>` —— 这些**类型专属
  操作泛型动词盖不住**。专属组让命令贴合每种内容的真实操作;增删改查六
  动词各组同名,学一组通其余组,不增记忆负担。
- CLI 是 owner 的操作面 —— **不**承担「agent 理解 owner」,那是 MCP 的事
  (`03-mcp服务.md`)。
- **人专属动词**:`site publish`、`proposal accept/reject/rebase`、所有
  `rm` —— 决定内容公开、草稿合入真相源、删除,不暴露给 agent(#13 安全边界)。
- 代码落点:`silan-viking-cli/groups/` 一个名词一个文件(`01` §1.9)。
