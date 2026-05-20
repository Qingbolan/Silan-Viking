# silan-viking 使用手册（普通人版）

> 你只需要写 markdown。silan-viking 把它变成可部署的个人网站，并让任何
> 协作 agent 都能读懂你的 context。**单租户、单设备、内容驱动。**

要安装的东西就一样：**Docker**。

下面所有命令都能直接复制粘贴。

---

## 0. 一次性安装

```bash
# 选一种：

# 方案 A：从 crates.io 装（推荐 — 全自动）
cargo install silan-viking

# 方案 B：从源码装（开发者）
git clone https://github.com/Silan-Hu/Silan-Personal-Website.git
cd Silan-Personal-Website/engine
cargo install --path crates/silan-viking-cli

# 方案 C：脚本一键（最简）
curl -fsSL https://raw.githubusercontent.com/Silan-Hu/Silan-Personal-Website/main/engine/install.sh | sh
```

装完后 `silan-viking` 二进制以 `silan` 之名进 PATH（如果脚本/cargo 没自动挂，你可以加一个 alias）。

验证：

```bash
silan-viking --version    # 应该打印版本号
```

---

## 1. 新建一个项目

```bash
silan-viking init
```

默认在 `~/.silan-viking/` 铺好整个项目。要换地方：

```bash
silan-viking --content /path/to/project/content \
             --db      /path/to/project/_deploy/portfolio.db \
             init
```

跑完之后，你的项目长这样：

```
~/.silan-viking/
├── silan-viking.toml           # 项目配置（identity / database / deploy）
├── content/                    # ← 你写 markdown 的地方（git 仓）
│   ├── SCHEMA.md               # 6 个 content type 的定义（别动）
│   ├── resources/
│   │   ├── blog/      ideas/      projects/
│   │   ├── episode/   resume/     update/
│   └── agent/                  # agent 自己的 context 记忆
└── _deploy/
    └── portfolio.db            # 派生缓存（可重建）
```

---

## 2. 写第一篇内容

### 写一篇 blog

```bash
silan-viking blog new my-first-post
```

它会生成：
```
content/resources/blog/my-first-post/
└── parts/
    └── body/
        ├── meta.toml
        └── en.md             # ← 编辑这个
```

打开 `en.md`，写 markdown，保存。同步进数据库：

```bash
silan-viking index sync
```

### 写一个 idea（半成形的想法）

```bash
silan-viking idea new kv-store-on-iouring
# 编辑 content/resources/ideas/kv-store-on-iouring/parts/overview/en.md
silan-viking index sync
```

### 维护一个 project

```bash
silan-viking project new silan-viking
# 编辑 content/resources/projects/silan-viking/parts/overview/en.md
silan-viking index sync
```

---

## 3. 内容生命周期 — 6 个 status

| status | 用在 | 含义 |
|---|---|---|
| `draft` | blog/idea/project | 草稿，不公开 |
| `hypothesis` | idea | 已有假设 |
| `experimenting` | idea | 在做实验 |
| `validating` | idea | 在验证 |
| `published` | blog/idea | 公开 |
| `concluded` | idea | 结束 |

直接编辑 `parts/<role>/en.md` 顶部 frontmatter：

```yaml
---
slug: my-first-post
title: My First Post
kind: blog
status: published        # ← 改这里
visibility: public       # ← 改这里
---
```

然后 `silan-viking index sync`。**只有 `visibility: public` 的内容会上线。**

---

## 4. 查看 / 列出 / 检查

```bash
# 列出所有 ideas
silan-viking idea list

# 看一个具体内容
silan-viking content show silan://resources/blog/my-first-post

# 浏览整个内容树
silan-viking content tree

# 跑健康检查（content 一致性 + 文档漂移）
silan-viking content lint
silan-viking content lint --drift    # 只在源码仓内有效
```

---

## 5. 部署上线

### 5.1 配置部署目标

编辑 `silan-viking.toml`：

```toml
[deploy]
mode      = "ssh"                 # 或 "local" 自托管
host      = "your-server.com"
ssh_user  = "deploy"
ssh_key_path = "~/.ssh/id_ed25519"
ssh_port  = 22                    # 自定义端口在这改
remote_dir = "~/silan-viking"     # 推荐选用户家目录的子路径
```

### 5.2 一条命令上线

```bash
silan-viking site deploy --confirm
```

会做：
1. 解出引擎自带的 frontend/backend/deploy tar
2. `docker compose` 多阶段构建（容器里跑 npm/go，主机不需要装）
3. `docker save` 镜像 → SSH `scp` 到目标机
4. 目标机 `docker load` + `compose up`
5. promote 派生表（运行时数据不动）
6. 重启 backend + proxy

**对目标机的要求：Docker + sshd。** 不需要 Node / Go / 源码。

### 5.3 单机模式（在你自己电脑上跑）

```toml
[deploy]
mode = "local"
host = "localhost"
```

然后 `silan-viking site deploy --confirm`。本地起 docker compose。访问 `http://localhost:8080`。

### 5.4 部署排查

如果失败：

| 报错 | 解决 |
|---|---|
| `remote_dir 'xxx' is not writable by the deploy user` | 提示已经告诉你了：要么 `sudo chown $USER xxx`，要么把 `remote_dir` 改到用户家目录 |
| `ssh: connection refused` | 检查 `ssh_port`、目标机 sshd、防火墙 |
| `docker save failed` | 本地 Docker daemon 没起 |
| backend 起来但前端打不开 | 等约 30 秒，proxy 需要时间识别新 backend |

---

## 6. 让 AI agent 读懂你的 context

### 6.1 给 Claude 装 silan-viking skill

```bash
silan-viking skill install
```

这会在 `~/.claude/skills/silan-viking/` 铺一个 skill 包。打开 Claude，它就能自动发现并接入 MCP。

### 6.2 自己起 MCP server

```bash
# 给本地脚本/工具调
silan-viking mcp serve --stdio

# 让 agent 维护网站（默认不开）
silan-viking mcp serve --stdio --enable-deploy

# 让 agent 帮你演化 SCHEMA（默认不开）
silan-viking mcp serve --stdio --enable-evolve
```

工具数：默认 17 / `--enable-deploy` 18 / `--enable-evolve` +3 = 21。

### 6.3 验证 MCP 起来了

```bash
silan-viking mcp serve | grep '^tool=' | wc -l   # 应该 17
silan-viking mcp status                          # 自检
```

### 6.4 审阅 agent 写的提案

agent 通过 MCP 写内容时，是先建一个 git 分支 `proposal/<ulid>`，不直接合并主仓。你审：

```bash
silan-viking proposal list           # 看待审提案
silan-viking proposal show <id>      # 看 diff
silan-viking proposal accept <id>    # 接受 → 合并 → 触发 sync
silan-viking proposal reject <id>    # 丢弃
```

---

## 7. 看访客数据（部署之后）

服务器才有访客 / 评论数据。本地拉下来缓存查：

```bash
# 同步一次（拉服务器统计到本地缓存）
silan-viking stats sync silan://resources/blog/my-first-post

# 看
silan-viking stats show     silan://resources/blog/my-first-post
silan-viking stats visitors silan://resources/blog/my-first-post
silan-viking stats crawlers silan://resources/blog/my-first-post
silan-viking stats sources  silan://resources/blog/my-first-post
```

会告诉你访客类型（human / search_bot / ai_bot / unknown）和来源（search / social / ai_chat / direct / internal）。

---

## 8. 在新机器上恢复

```bash
git clone <your-content-repo>  ~/.silan-viking/content
cd ~/.silan-viking
silan-viking init --here       # 只生成 silan-viking.toml + _deploy/
silan-viking index sync        # 重建本地数据库
```

**注意**：评论 / 访客统计是服务器原生的，本地数据库不会自动有它们。要看就用 `silan-viking stats sync`。

---

## 9. 常见操作对照表

| 你想做 | 命令 |
|---|---|
| 写新 blog | `silan-viking blog new <slug>` |
| 写新 idea | `silan-viking idea new <slug>` |
| 同步进数据库 | `silan-viking index sync` |
| 完整重建 db | `rm _deploy/portfolio.db && silan-viking index sync` |
| 上线 | `silan-viking site deploy --confirm` |
| 本地预览 | `silan-viking site preview` |
| 健康检查 | `silan-viking content lint` |
| 看下一步该干啥 | `silan-viking guide` |
| 起 MCP | `silan-viking mcp serve --stdio` |
| 装 Claude skill | `silan-viking skill install` |
| 看访客 | `silan-viking stats sync <uri> && silan-viking stats show <uri>` |
| 看版本 | `silan-viking --version` |
| 看帮助 | `silan-viking --help` 或 `silan-viking <noun> --help` |

---

## 10. 不要做的事

1. **不要手动改 `_deploy/portfolio.db`** — 它是派生的，任何一次 `silan-viking index sync` 都会覆盖你的改动。改 markdown，让 sync 自己做事。
2. **不要把 `content/` 文件夹放在 git 仓库外** — content 就是你的真相源，没 git 等于没历史。
3. **不要在服务器上手改 `portfolio.db`** — 它的内容表是 promote 时覆盖的；要改内容，改本地 markdown，sync，部署。
4. **不要用本地 `portfolio.db` 直接覆盖服务器的** — 服务器的运行时表（评论、访客）只在那一份；覆盖 = 丢评论。`silan site promote` 已经帮你处理这件事。
5. **不要给 `silan` 加 sudo** — 它不需要 root。需要 root 的只有目标机的 `chown remote_dir`（一次性）。

---

## 11. 当你陷入麻烦

```bash
# 第一步：让 silan 告诉你它觉得下一步该干啥
silan-viking guide

# 第二步：跑健康检查
silan-viking content lint

# 第三步：看自检
silan-viking mcp status
silan-viking site status

# 第四步：完全重建本地 db（不影响真相源）
rm _deploy/portfolio.db
silan-viking index sync
```

如果还不行，去看 `docs/silan-viking/GOAL.md`（终局图）和 `docs/silan-viking/OVERVIEW.md`（总览）。
