# Silan Personal Website — 用户手册

> **语言 / Language**:**中文** · [English](./MANUAL.en.md)

> 一份读完就能从零跑通的手册:**这套系统是什么 → 怎么装 → 怎么用 → 怎么发布**。
>
> 配套设计文档在 `docs/silan-viking/`(`OVERVIEW.md` 是设计总入口,
> `07-操作手册.md` 是逐行剧本)。本手册是**面向使用者的精炼版**。

---

## 1. 这套系统是什么

Silan Personal Website 是一个 **以 markdown 文件为真相源** 的个人网站平台。
你在本地写 markdown,引擎把它同步进数据库,再部署成线上网站;协作 AI agent
可以经 MCP 接口读你的内容、帮你起草,但发布类内容一律走提案、由你确认。

```
            ┌──────────────── 本地机器 ────────────────┐
你写 md ──▶  content/        markdown 真相源(Git 仓)
                 │  silan-viking index sync
                 ▼
            portfolio.db     派生数据库(可重建,不手改)
                 │
 AI agent ◀─▶  silan-viking mcp serve   (MCP:读内容 / 写 agent context / 提案)
                 │  silan-viking site deploy
            └────┼──────────────────────────────────────┘
                 ▼
            ┌──────────────── 服务器 ──────────────────┐
            Go API  +  portfolio.db  +  React 前端
                 │
            访客浏览 → 评论 / 点赞 → 运行时数据只在这里产生
            └───────────────────────────────────────────┘
```

### 三个组成部分

| 部分 | 目录 | 技术 | 作用 |
|---|---|---|---|
| **引擎 CLI** | `engine/` | Rust(`silan-viking`)| 内容管理、同步、建站、部署、MCP 服务 |
| **后端 API** | `backend/` | Go + Go-Zero + Ent ORM | 给前端供数,处理评论/点赞等运行时数据 |
| **前端站点** | `frontend/` | React 18 + TypeScript + Vite + Tailwind | 访客看到的网站 |

> 历史说明:旧版本用 Python CLI(README.md 里仍有旧描述)。**当前版本的
> CLI 是 Rust 实现的 `silan-viking`** —— 本手册以它为准。

### 内容类型

引擎管理六种内容类型,定义在 `content/SCHEMA.md`:

`blog`(博文)· `project`(项目)· `idea`(想法)· `episode`(连载片段)·
`resume`(简历)· `update`(动态)

- `blog` 是**单 Part**(一个正文文件 `body`)。
- `idea` / `project` 是**多 Part**(`overview` / `progress` / `reference`…),
  每个 Part 是 `parts/<role>/` 目录,含 `meta.toml` + 各语言 `.md`。
- 内容分两个命名空间:`content/resources/`(可发布)与 `content/agent/`
  (agent 私有 context,网站永不展示)。

---

## 2. 安装

### 2.1 安装引擎 CLI(终端用户)

一行安装 —— 自动识别系统(macOS / Linux,Intel / ARM),下载预编译二进制:

```sh
curl -fsSL https://raw.githubusercontent.com/Qingbolan/Silan-Personal-Website/main/engine/install.sh | sh
```

安装脚本会:① 识别 OS/CPU;② 从 GitHub Releases 下载匹配二进制;
③ 装到 `~/.local/bin/silan-viking`;④ 打印下一步命令。
若你的平台没有预编译包,脚本会**回退到 cargo 从源码编译**(需 Rust 工具链,
见 [rustup.rs](https://rustup.rs))。

**可选参数**(通过环境变量):

```sh
# 装到别处
curl -fsSL .../install.sh | SILAN_INSTALL_DIR="$HOME/bin" sh
# 锁定某个发布版本
curl -fsSL .../install.sh | SILAN_VERSION="v0.1.0" sh
```

**加入 PATH** —— 若安装器提示 `~/.local/bin` 不在 PATH,在 `~/.zshrc`
或 `~/.bashrc` 里加这行后重启 shell:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

验证:

```sh
silan-viking --help        # 列出全部命令
```

### 2.2 引擎开发者(从仓库源码构建)

```sh
cd engine
./install-dev.sh           # 用 cargo 从当前 checkout 构建并安装
```

详见 `engine/INSTALL.md`。

### 2.3 后端 / 前端的依赖

仅在你要本地跑或自行部署后端/前端时需要:

- **后端**:Go 1.21+(`backend/` 下 `go build`)
- **前端**:Node.js 18+(`frontend/` 下 `npm install`)
- **部署**:Docker + Docker Compose(`deploy/docker-compose.yml`)

---

## 3. 从零到一个能跑的站点

`silan-viking` 会一路引导你 —— 不用背命令。核心命令是 **`guide`**:任何时候
运行它,它会读取项目状态、告诉你下一步。

```sh
mkdir my-site && cd my-site

silan-viking init          # 脚手架:建好 content/ + 配置 + SCHEMA.md,
                           # 结尾打印下一步

silan-viking guide         # “我现在该做什么?” —— 随时可重跑

silan-viking index sync    # 从 content/ 构建派生数据库

silan-viking site preview  # 本地构建并预览站点
```

`init` 会铺好 `content/`(六个内容类型 + 三个示例条目:一篇 welcome blog、
一个 idea、一个 project)、一个 `silan-viking.toml` 配置文件、一份
`SCHEMA.md`。之后 `guide` 会根据项目状态指向正确的下一步命令。

![silan-viking init 的脚手架输出](images/02-init.png)
*`silan-viking init` —— 打印出建好的文件树和编号的下一步*

![silan-viking guide 的下一步提示](images/03-guide.png)
*`silan-viking guide` —— 随时重跑,它读取项目状态告诉你接下来做什么*

> 完整的「从零搭站」逐步走查见 **§10 案例 1**。

---

## 4. 命令参考

### 4.1 内容类型命令(六组,各自带 new/list/show/edit/rm/archive)

```sh
silan-viking blog    new <slug>      # 新建一篇博文
silan-viking project new <slug>      # 新建一个项目
silan-viking idea    new <slug>      # 新建一个想法
silan-viking episode new <slug>      # 新建一个连载片段
silan-viking resume                  # 管理简历
silan-viking update                  # 管理动态

silan-viking blog list               # 列出某类型的全部内容
silan-viking project show <slug>     # 查看某条内容详情
```

### 4.2 工具命令组

| 命令 | 作用 |
|---|---|
| `silan-viking init` | 初始化项目脚手架 |
| `silan-viking guide` | 阶段感知的下一步提示 |
| `silan-viking index sync` | 从 `content/` 重建派生数据库 |
| `silan-viking content show <silan://...>` | 按 URI 查看内容 |
| `silan-viking site preview` | 本地构建并预览 |
| `silan-viking site build` | 构建站点产物 |
| `silan-viking site deploy` | 部署到服务器 |
| `silan-viking stats` | 查询远程运行时数据(评论/点赞/打点)|
| `silan-viking proposal list / show / accept / reject` | 管理 agent 提案 |
| `silan-viking mcp serve` | 启动 MCP server,供 agent 接入(16 个工具,详见 §5.4)|
| `silan-viking skill emit / status / rm` | 安装 / 查看 / 移除 agent skill,零配置接入(详见 §5.5)|
| `silan-viking doctor` | 配置与环境体检 |
| `silan-viking config edit [--global]` | 编辑配置文件 |
| `silan-viking uninstall [--purge]` | 卸载安装足迹 |

---

## 5. 常见任务剧本

### 5.1 配置 CLI

`init` 后有两个配置文件:全局 `~/.config/silan/config.toml`、
项目级 `silan-viking.toml`。

```sh
silan-viking config edit --global    # 全局配置(可选填 [llm] 段)
silan-viking config edit             # 项目配置(填 [deploy] 段)
silan-viking doctor                  # 逐项 ✓/⚠/✗ 体检
```

引擎**默认纯本地**,不配 LLM 也能跑(用规则法生成内容摘要)。
想让 agent 的摘要更聪明才填 `[llm]` 段(API key 存在 `~/.config/silan/`
下,不进任何 Git)。

项目配置 `silan-viking.toml` 关键段:

```toml
[project]
name        = "my-site"
content_dir = "content"

[database]
path = "_deploy/api/portfolio.db"

[deploy]                          # 仅 site deploy 需要
host         = "silan.tech"
user         = "deploy"
ssh_key_path = "~/.ssh/silan_deploy_ed25519"   # 只填路径,永不填密钥本身
```

### 5.2 写一篇 blog

```sh
silan-viking blog new 2026-rust-notes    # 脚手架 content/resources/blog/2026-rust-notes/
# 编辑 en.md 正文,frontmatter 模板已生成
silan-viking index sync                  # 同步进库
```

发布:把 frontmatter 的 `status` 改为 `published`,再 `index sync`。

### 5.3 开一个 idea / project

```sh
silan-viking idea new rust-context-engine
# 编辑 parts/overview/en.md
silan-viking index sync
```

idea/project 是多 Part:更新项目进展 = 写 `progress` Part。

### 5.4 让 AI agent 接入(MCP)

这是这套系统**最强大的部分**:你的内容不只是静态文件,而是一个 AI agent
可以**安全读写的活的上下文**。agent 能帮你检索全部历史内容、把灵感落成草稿、
推进项目、看访客数据 —— 但任何会发布出去的改动都先变成提案,由你拍板。

#### MCP 是什么

`silan-viking mcp serve` 启动一个 **MCP server**(Model Context Protocol —
让 AI 客户端连接外部能力的标准协议)。agent 接入后立刻握手,server 推送
`SCHEMA` 和项目概览。agent 从此能用下面 16 个工具操作你的内容。

```sh
silan-viking mcp serve           # 启动 MCP server(默认端口见 silan-viking.toml [mcp])
```

![silan-viking mcp serve 启动后的输出](images/08-mcp-serve.png)
*MCP server 启动,等待 agent 接入*

#### 16 个 MCP 工具,按权限分四档

工具按「能造成多大影响」分四档 —— **档位越高,越靠近你的真相源,门槛越高**。

**档 1 · 只读(10 个)** —— 纯查询,永不改动任何东西:

| 工具 | agent 用它来做什么 |
|---|---|
| `recall` | 语义检索全部内容(「我以前写过 Rust 的东西吗」)|
| `list` | 按类型 + 状态结构化列出(「哪些 project 在进行中」)|
| `browse` | 浏览内容树 |
| `read` | 读单条内容的摘要 |
| `context_brief` | 拉取 owner/项目概要 —— **agent 接入后第一件事就调它**,先搞清你在想什么再动手 |
| `lint` | parser 与 schema 健康检查 |
| `stats` | 浏览 / 点赞 / 评论计数 |
| `visitors` | 去标识化的访客列表 |
| `crawler_breakdown` | 访客类型分布(真人 vs 爬虫)|
| `source_breakdown` | 流量来源 referrer 分布 |

**档 2 · 捕捉(1 个)** —— 把念头先存下来,不碰发布内容:

| 工具 | 作用 |
|---|---|
| `capture` | 把一段自由文本笔记落进**提案**(放 `agent/notes/`)。你冒出半成形的想法时,agent 用它先接住,不直接提交 |

**档 3 · agent 私有记忆(4 个)** —— 写在 `silan://agent/` 命名空间,**直接生效、不走提案**(因为它永远不会出现在网站上):

| 工具 | 作用 |
|---|---|
| `ctx_read` | 读 agent 自己的 context |
| `ctx_write` | 写 agent 自己的 context(「记住我偏好简洁的写法」就落在这)|
| `ctx_brief` | agent 记忆概要 |
| `reflect` | 会话结束时,把这次学到的东西沉淀进长期记忆 |

**档 4 · 发布内容提案(2 个)** —— 改的是会上线给访客看的内容,**必须经你确认**:

| 工具 | 作用 |
|---|---|
| `propose` | 起草一份内容提案(参数 `uri, draft, lang?=en`),锚定到某个具体 Item 或 Part;`lang` 可起非英文版本 |
| `summarize_updates` | 起草一份「近期动态」摘要提案 |

#### 不可逾越的红线

这是整套权限模型的核心,只有一句话:

> **agent 改自己的记忆(`silan://agent/`)直接生效;agent 改任何会发布的内容
> (简历 / blog / project / idea …)一律落到 Git 提案分支,只有你
> `proposal accept` 之后才进入真相源。**

所以你永远不会「醒来发现 agent 偷偷改了你的简历」。它最多给你递一份草稿。

#### 提案怎么收

agent 用 `capture` / `propose` 起草后,改动停在一个 `proposal/<id>` Git 分支上,
等你处理:

```sh
silan-viking proposal list                 # 看所有待处理提案
silan-viking proposal show <id>             # 看某份提案的具体改动
silan-viking proposal accept <id>           # 收下:merge 进主分支,落地为真相源
silan-viking proposal reject <id>           # 拒绝
```

`accept` 之后记得 `silan-viking index sync`,再 `site build/deploy` 才会上线。

### 5.5 零配置接入:silan-viking skill

§5.4 是「手动 `mcp serve` + 在 agent 里配连接」。**skill 是同一套能力的零配置
形态** —— 你装一个 skill,Claude 这类 agent 自动发现、自动接上,你不用碰任何
连接配置。两条路能力**完全一致**,差别只在「怎么接上」。

```sh
silan-viking skill emit          # 渲染并安装 skill 到 ~/.claude/skills/silan-viking/
silan-viking skill status        # 查看安装状态
silan-viking skill rm            # 移除 skill
```

![silan-viking skill emit 的输出](images/09-skill-emit.png)
*`skill emit` —— 把 skill 渲染进 `~/.claude/skills/`,Claude 下次启动自动发现*

**skill 是什么**:它是 `~/.claude/skills/silan-viking/` 下的一个小目录,含
`SKILL.md`(skill 定义)和 `reference/mcp-tools.md`(MCP 连接说明 + 工具表)。

**它为什么不会过时**:skill 是个**派生制品** —— `skill emit` 从你的真相源
(`silan-viking.toml` + `content/SCHEMA.md`)实时渲染出来。你的内容类型变了,
重跑一次 `skill emit`,它自动跟着变,永不漂移。

**它怎么被触发**:`SKILL.md` 里描述的是**你的自然语言**(「我冒出一个想法」
「想写篇文章」「看看有多少人读了」),不是工具名。Claude 靠匹配「你正在做
什么」来挂载这个 skill —— 你不需要记任何命令,正常说话即可,agent 自己翻译成
对应的 MCP 工具调用。

> 一句话:`mcp serve` 给你能力,`skill emit` 让这份能力**对 agent 自动可见**。
> 日常推荐直接用 skill。

---

## 6. 发布上线

```sh
silan-viking site build          # 构建站点产物
silan-viking site deploy         # 部署到 silan-viking.toml [deploy] 指定的服务器
```

部署管线基于 Docker(`deploy/docker-compose.yml`):后端 Go API + 前端 +
`portfolio.db`。**运行时数据(访客评论、点赞、打点)只在服务器产生**,
本地的 `portfolio.db` 不含它们。要查看运行时数据:

```sh
silan-viking stats               # 远程查询服务器侧的运行时数据
```

---

## 7. 卸载

```sh
silan-viking uninstall           # 移除 skill + 派生文件,保留你的 content/
silan-viking uninstall --purge   # 连 content/ 和配置一并删除
```

`uninstall` 会先打印将删除什么并要求确认。它**不会**删除 `silan-viking`
二进制本身 —— 手动 `rm ~/.local/bin/silan-viking`。

---

## 8. 排障

| 现象 | 处理 |
|---|---|
| `silan-viking: command not found` | `~/.local/bin` 未加入 PATH,见 §2.1 |
| 不确定配置对不对 | 跑 `silan-viking doctor`,按 ✓/⚠/✗ 逐项排查 |
| 不知道下一步该干嘛 | 跑 `silan-viking guide` |
| 内容改了但网站没变 | 改完要 `silan-viking index sync`,再 `site build/deploy` |
| 部署报 SSH 失败 | 检查 `[deploy]` 段的 `ssh_key_path` 文件是否存在 |
| 看不到访客评论/点赞 | 那是运行时数据,只在服务器侧;用 `silan-viking stats` 查 |

---

## 9. 延伸文档

| 文件 | 内容 |
|---|---|
| `docs/silan-viking/OVERVIEW.md` | 设计总入口,逐条回答“系统怎么转” |
| `docs/silan-viking/07-操作手册.md` | 逐行命令 + 屏幕输出 + 文件变化的完整剧本 |
| `docs/silan-viking/02-cli服务.md` | CLI 全命令清单 |
| `docs/silan-viking/03-mcp服务.md` | MCP 工具与权限模型 |
| `docs/silan-viking/06-端到端.md` | 安装→部署主线骨架 |
| `engine/INSTALL.md` | 引擎安装详解 |
| `content/SCHEMA.md` | 内容契约(parser/CLI/MCP 共享的真相源)|

---

## 10. 案例篇 —— 三个完整场景

> 前面各节是「命令清单」,这一节是「照着走能跑通的剧本」。每个案例从一个
> 真实诉求起头,逐步给出敲什么、屏幕回什么、配哪张图。

### 案例 1 · 从零搭一个能上线的站点

**诉求**:我刚装好 `silan-viking`,想把它变成一个真的网站。

**第 1 步 —— 建项目目录并初始化**

```sh
mkdir my-site && cd my-site
silan-viking init
```

`init` 铺好 `content/`(六个内容类型 + 三个示例条目)、`silan-viking.toml`、
`SCHEMA.md`,并 `git init`。屏幕打印文件树和编号下一步。

![init 输出](images/02-init.png)

**第 2 步 —— 不确定下一步就问 guide**

```sh
silan-viking guide
```

![guide 输出](images/03-guide.png)

**第 3 步 —— 写第一篇 blog**

```sh
silan-viking blog new my-first-post
# 用编辑器打开 content/resources/blog/my-first-post/en.md,
# frontmatter 模板已生成,填正文;发布就把 status 改成 published
```

![blog new 输出](images/04-blog-new.png)

**第 4 步 —— 同步进派生数据库**

```sh
silan-viking index sync
```

![index sync 输出](images/05-index-sync.png)

**第 5 步 —— 本地预览**

```sh
silan-viking site preview
# 浏览器打开它给出的本地地址,确认页面没问题
```

![site preview + 浏览器里的站点](images/06-site-preview.png)

**第 6 步 —— 部署上线**

先在 `silan-viking.toml` 填好 `[deploy]` 段(见 §5.1),然后:

```sh
silan-viking site deploy --confirm
```

![site deploy 输出](images/14-site-deploy.png)

至此,`silan.tech` 这样的线上站点就跑起来了。之后每次改内容,重复
「编辑 → `index sync` → `site deploy`」即可。

---

### 案例 2 · 让 AI agent 帮你把灵感变成草稿

**诉求**:我脑子里有个想法,懒得自己从头写,想让 agent 接住、起草,我只做最后确认。

**第 1 步 —— 安装 skill,让 Claude 自动接入**

```sh
silan-viking skill emit
silan-viking skill status        # 确认 status=installed
```

![skill emit 输出](images/09-skill-emit.png)

**第 2 步 —— 启动 MCP server**

```sh
silan-viking mcp serve
```

![mcp serve 输出](images/08-mcp-serve.png)

**第 3 步 —— 在 Claude 里直接说人话**

你不用记任何工具名,正常说话即可。agent 接入后第一件事会调 `context_brief()`
搞清你在想什么,然后把你的想法用 `capture` 落成提案:

```
你:我有个想法 —— 用 Rust 写一个上下文引擎,帮我记下来。
Claude:(调用 capture)已为你起草一个 idea「用 Rust 写一个上下文引擎」,
        放在提案分支里,你可以 silan-viking proposal show 看看。
```

![与 agent 的对话](images/10-agent-chat.png)

**第 4 步 —— 审阅提案**

agent 起草的发布类内容停在 Git 提案分支上,等你拍板:

```sh
silan-viking proposal list
silan-viking proposal show <id>
```

![proposal list](images/11-proposal-list.png)
![proposal show 的 diff](images/12-proposal-show.png)

**第 5 步 —— 收下或拒绝**

```sh
silan-viking proposal accept <id>    # 收下:merge 进真相源
silan-viking index sync              # 同步进库
```

> 全程 agent 没有任何一步绕过你 —— 它能起草,但「发布与否」永远是你点头。

---

### 案例 3 · 日常内容维护

**诉求**:站点已经在线了,我想日常更新它、并看看有没有人在读。

**更新一个项目的进展**

```sh
silan-viking project progress silan-viking
# 编辑 progress Part 的 markdown,写下这次进展
silan-viking index sync
silan-viking site deploy --confirm
```

**给一篇已有内容加中文版**

```sh
silan-viking blog add-lang my-first-post zh
# 编辑新生成的 zh.md,写中文正文
silan-viking index sync
```

**查访客数据**

运行时数据(浏览、点赞、评论)只在服务器侧产生,本地用 `stats` 远程查询:

```sh
silan-viking stats
```

![stats 输出](images/13-stats.png)

**拿不准状态时的两条万能命令**

```sh
silan-viking guide      # 我现在该做什么
silan-viking doctor     # 配置和环境有没有问题
```

> 日常循环就一句话:**编辑 markdown → `index sync` → `site deploy`**。
> 其余的交给 `guide` 和 `doctor` 兜底。
