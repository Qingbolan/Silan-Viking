# 00 · 终局与需求

> silan-viking 设计的第一章 —— 一切从这里倒推。

## §0.1 终局

silan-viking 不是一个网站,也不是一个内容引擎。

> **它是 silan 一个人的 context 系统:持续捕捉、结构化他的想法 —— 从一闪而过的
> 灵感,到正在思考的文章,到已经成形的项目 —— 并让任何与他协作的 agent 都能
> 理解他。个人网站,是这个 context 中成熟内容的、可选择性发布的对外投影。**

### 终局的画面

silan 对一个装了 silan-viking 的设备、或一个带这个 skill 的 agent 说话。
他不"录入内容",他只是**想**:

- 说出一个半成形的念头 → agent 捕捉它,进 context。
- 过几天又提到它 → agent 知道这不是新念头,陪他想深,它变成一篇文章。
- 它成熟了 → agent 帮他落成项目,维护进展。
- 他说"这个可以公开了" → agent 把它**选择性投影**到个人网站。
- 与此同时,任何新 agent 来协作 → 先读他的 context,一上来就懂他。

这个画面里**没有"管理网站"这件事**。网站是 context 长熟后溢出的一层皮。
silan 管理的永远只是「他的想法」。

### 三个面

silan-viking = 想法的**载体** + 想法对 agent 的**服务层** + 想法对世界的**投影层**。
对应到实现:

- 载体 → `content/` + 数据库(见 `01-oop结构.md`)
- 服务层 → MCP(见 `03-mcp服务.md`)
- 投影层 → 网站(`SiteProjector`)

## §0.2 需求基线 —— 已确认需求逐条收拢(不新增)

| # | 需求 |
|---|---|
| 1 | markdown 为真相源 + SQLite 只读缓存 + Docker 部署 |
| 2 | 最新内容结构:`content/resources/{type}/{item}/parts/<role>/{meta.toml,<lang>.<ext>}` + `content/agent/` + `.silan-cache` 注册表;**6 type:blog/projects/ideas/episode/resume/update**(见下注)|
| 3 | 单篇 → 系列;两类系列并存(容器型 + 合集型)|
| 4 | idea→blog→project 有向演化边(三独立条目 + 演化关系)|
| 5 | 容器系列的 episode 只属系列,不进 blog 列表 |
| 6 | Rust 重写,新文件夹 `engine/`;Go 后端保留并适配新派生库;旧 Python `silan` 仅作事实参考/归档,不作运行时 fallback、不要求兼容旧磁盘结构 |
| 7 | OOP 结构;先定 SCHEMA 再写代码 |
| 8 | CLI 样式对齐 EasyNet-Cli(noun-first `<binary> <noun> <verb>`)|
| 9 | 命名:项目/binary/crate = `silan-viking`(`silan-viking-*`),用户命令 = `silan`,协议 = `silan://` |
| 10 | agent 能 检索 / 更新记忆 / 更新发布内容(经提案)|
| 11 | agent 能维护网站(体检/起草/汇总 + 选择性部署)|
| 12 | 终局:与设备/agent 沟通捕捉想法 → 协助写文章 → 转项目 → 选择性部署;增强协作 agent 对 owner 的理解(context 增强)|
| 13 | 单租户,只服务 owner 一人 |
| 14 | `silan site` 与 MCP 部署时,自动为前端生成爬虫可见性产物:sitemap.xml + robots.txt、JSON-LD 结构化数据、public 页预渲染静态 HTML、per-page meta(含 OG/Twitter Card)|
| 15 | CLI 与 MCP 能查指定内容的实时交互数据 —— 某 idea/blog 页、某章节的浏览/评论统计;能查到访客的浏览器指纹与 IP;能识别访问者类型(人类 / 搜索引擎爬虫 / AI 爬虫)与访问来源类型(搜索 / 社交 / AI 对话 / 直接 / 站内引荐)|
| 16 | 协作 agent 经 skill 零配置接入 —— `silan` 能生成一个 skill 包,装到 Claude agent 后,agent 自动发现 silan-viking、在 silan「说出想法 / 写作 / 推进项目」时自动经 MCP 调用,无需手动配置 MCP 接入 |

> **设计纪律**:任何对象 / 命令 / 接口,必须能指回上面某一条 `#`。指不回 → 删。
> 本目录每一章都标注它服务哪条需求。
>
> **#2 的 type 数修正**:需求 #2 早期写「5 type」。`update` 其实是 silan
> 早已在用的内容形态(Python 有 `update_parser`、Go ent 有 `recent_updates`
> 表),收拢需求基线时被漏出。最终已裁定 `update` 是第 6 种 content type
> (见 `10`§10.4.6 裁决账本 #3)。#2 据此更正为 6 type。容器系列(`#3`/`#5`)
> 由 `episode` 这个独立 type 承载(见 `10`§10.4.4 裁决 #1)。
>
> **#16 的补入**:终局画面(§0.1)写明「与一个**带这个 skill 的 agent**
> 说话」,但早期需求基线只列到 #15,skill 分发这件事既被终局画面要求、
> 又无对应 `#` —— 是基线的一处遗漏。审查中补入为 #16。它不是 #12 的实现
> 细节:#12 是「agent 有捕捉/写作/部署的能力」,#16 是「这套能力如何零配置
> 抵达 agent」,是独立的分发面。`silan skill` 命令组与 skill 包产物据此
> 指回 #16(见 `13-skill-分发.md`)。

## §0.3 已有抽象(从 Python `silan` 读出,不是发明)

silan-viking 的 OOP 不是凭空设计 —— Python `silan` 已经跑着一套验证过的抽象,
Rust 重写是把它翻译 + 增强,不是盘古开天:

- `ParserFactory` —— 按 content_type 派发(工厂模式)
- `BaseParser`(抽象基类)→ 6 个具体 parser:resume/project/blog/idea/update/episode
- `ExtractedContent` —— 解析产物:main_entity + translations + tags + images + hash
- `.silan-cache` —— 每个 collection / item 的 YAML 注册表(`sync_metadata` + 文件清单)
- `database_sync_logic/` —— SQLAlchemy ORM + 5 个 sync mixin,把解析产物写库

> Rust 重写 = 把这套已验证的抽象用 Rust trait/struct 表达 + 补 CLI/MCP 两个面。
> 详见 `01-oop结构.md`。

## §0.4 磁盘全景 —— silan-viking 装完跑起来,磁盘上有什么

> 文档里目录树画了三处(代码树在 `01` §1.9、内容树在 `06` §6.2.1、测试仓在
> `05` §5.2)。本节是**它们的拼图盒** —— 一张总图,新读者先在这看清「装完
> 之后磁盘上一共有哪几摊东西、各自是什么、谁是真相源谁是派生」,再进细节。

一个用完整跑起来的 silan-viking,磁盘上是**四摊东西**,分属三个位置:

```
① 二进制         /usr/local/bin/silan          安装的可执行文件(binary 名 silan-viking,
                                                以 silan 之名进 PATH)

② 全局配置       ~/.config/silan/               跨项目、装一次配一次(XDG 标准位置)
                 └── config.toml                [project].path / [llm] / [mcp]

③ 内容项目       ~/.silan-viking/               ★ 真相源在这里。默认地址,--path 可改
                 ├── silan-viking.toml          项目配置([identity]/[database]/[deploy]…)
                 ├── .gitignore
                 ├── _deploy/
                 │   └── portfolio.db           ← 派生缓存:content/ sync 出来的,可重建
                 └── content/                   ← 真相源:一个 git 仓,markdown 在此
                     ├── SCHEMA.md   index.md   log.md
                     ├── resources/                  ← 命名空间①:发布内容
                     │   └── blog/ ideas/ projects/ episode/ resume/ update/
                     │       └── <item>/parts/<role>/<lang>.<ext>  (详见 06 §6.2.3)
                     └── agent/                      ← 命名空间②:agent context,永不发布
                         └── project/ notes/ silan/ sessions/   (详见 01 §1.2.1)

   agent 提案区不是磁盘目录,是 content/ 仓里的一组 Git 分支(proposal/<ulid>),
   不进主分支(见 03 §3.1)。

④ 引擎源码       <silan-viking 仓>/engine/       开发引擎本身才需要;最终用户没有这摊
                 └── crates/ silan-viking-{base,content,entities,app,cli,mcp,site}
                                                (7 个成员 crate + workspace root,详见 01 §1.9)
```

**四摊东西,谁是什么 —— 一句话各自定位**:

| 摊 | 位置 | 是什么 | 谁产生、能否重建 |
|---|---|---|---|
| ① 二进制 | `/usr/local/bin/silan` | 可执行文件 | 安装产生 |
| ② 全局配置 | `~/.config/silan/config.toml` | 跨项目配置 | `silan init` 安装时生成,人改 |
| ③a 内容真相源 | `~/.silan-viking/content/` | **唯一真相源**,markdown,git 仓 | 人写 / agent 经提案改 |
| ③b 派生缓存 | `~/.silan-viking/_deploy/portfolio.db` | SQLite,Go API 只读消费 | `silan index sync` 从 ③a 生成,**可随时重建** |
| ③c 项目配置 | `~/.silan-viking/silan-viking.toml` | 项目级配置 | `silan init` 生成,人改 |
| ④ 引擎源码 | `engine/crates/` | Rust 7 个成员 crate(+ workspace root)| 只有开发引擎的人有;最终用户无 |

**载重判断 —— 一句话**:`content/` 是真相源,`portfolio.db` 是它的派生缓存,
删了能用 `silan index sync` 重建;配置分两层(全局 `~/.config/silan/` + 项目
`silan-viking.toml`);引擎源码与用户的内容项目是两回事,最终用户只有 ①②③。

> 三处细节树各管一段:**代码** → `01` §1.9;**内容** → `06` §6.2.1;
> **测试仓** → `05` §5.2。本节是它们的总入口 —— 先看这张图,知道有几摊、
> 各在哪,再按需进对应细节树。
