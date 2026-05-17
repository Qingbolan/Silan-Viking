# Silan Personal Website — 完整架构设计

> 从个人知识管理(markdown)到远程服务器发布维护的端到端架构。
> 范式参考:Karpathy 的 LLM Wiki（markdown 为真相源，LLM 负责加工与维护）。
>
> 状态:本文档为设计基线。P0 安全修复已完成(见末尾「已完成」)。

---

## 1. 设计决策(已与 owner 对齐)

| 决策点 | 选择 | 含义 |
|---|---|---|
| 内容真相源 | **Markdown 为准 + DB 缓存层** | `content/*.md` 是唯一真相;`portfolio.db` 是可随时重建的只读派生物 |
| 生产数据库 | **SQLite** | DB 只是只读缓存,单文件零运维即可;放弃在线编辑后台 |
| 发布方式 | **Docker Compose 手动** | 构建镜像 → 服务器 `docker compose pull && up` |
| 本次范围 | **先修 P0 安全 + 出本设计文档** | 实施分阶段进行 |

核心原则:**单向数据流**。markdown → ingest → SQLite → Go API → 前端。
DB 永不被在线写回内容(评论/点赞等互动数据是唯一例外,见 §4)。

---

## 2. 系统全景

```
┌─────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  [1] 知识管理    │   │  [2] Ingest      │   │  [3] 运行时       │
│                 │   │                  │   │                  │
│  content/       │──▶│  silan CLI       │──▶│  portfolio.db    │
│   blog/*.md     │   │  (Python)        │   │  (SQLite, 只读)  │
│   ideas/*.md    │   │                  │   │       │          │
│   projects/*.md │   │  parsers/ →      │   │       ▼          │
│   resume/*.md   │   │  models/ →       │   │  Go backend-api  │
│   index.md      │   │  database_sync/  │   │  (go-zero :5200) │
│   (LLM 维护)    │   │                  │   │       │          │
└─────────────────┘   └──────────────────┘   └───────┼──────────┘
        ▲                                            ▼
        │  LLM: ingest / query / lint        ┌──────────────────┐
        │  (Karpathy wiki 操作)              │  [4] 前端 (React) │
        └────────────────────────────────────│  Vite build      │
                                             └──────────────────┘
                                                     │
                                             ┌──────────────────┐
                                             │  [5] 发布         │
                                             │  Docker Compose   │
                                             │  → 远程服务器     │
                                             └──────────────────┘
```

现状对照:`silan-personal-website/silan/` 这个 Python 包**已经实现了 [2] 的骨架** ——
`parsers/`(markdown→结构)、`models/`(领域模型)、`logic/database_sync_logic/`(写库)。
本架构是把它**正式确立为 ingest 管线**,并补齐 index/lint/三层摘要。

---

## 3. [1] 知识管理层 — content 目录

```
content/
  index.md                  # LLM 维护的全站目录(Karpathy index.md)
  log.md                    # append-only 操作日志(ingest/lint 记录)
  blog/
    <slug>.md               # frontmatter + 正文(L2)
  ideas/
    <slug>.md
  projects/
    <slug>.md
  resume/
    personal.md
    education.md
    experience.md
    ...
  .schema.md                # 约定:frontmatter 字段、命名、链接规则(给 LLM 看)
```

### Frontmatter 约定(每个 .md 文件)

```yaml
---
title: 文章标题
slug: my-post                 # 唯一寻址,= 文件名
lang: en                      # 主语言
tags: [go, architecture]
summary: 一段话概述            # L1
tldr: 一句话                   # L0(列表/导航用)
date: 2026-05-16
status: published             # draft | published
links: [project/silan-website] # 双向引用,跨类型(Karpathy wikilink)
---
```

### 三层内容(L0/L1/L2)

| 层 | 来源 | 用途 | 接口 |
|---|---|---|---|
| L0 `tldr` | LLM 生成 | 列表卡片、index.md、sitemap | 列表接口 |
| L1 `summary` | 人写或 LLM 生成 | hover/预览、搜索结果 | 列表接口 |
| L2 正文 | 人写(markdown body) | 详情阅读 | **仅详情接口** |

> 当前问题:列表接口 `GetBlogPosts` 直接返回完整 `content[]`(L2)。
> 整改后列表只返回 L0+L1,详情接口才给 L2。

### LLM 维护操作(Karpathy 模式)

- **ingest**:新增/修改 .md → LLM 补 `tldr`、翻译、抽 tags → 更新 `index.md` → 写 `log.md`
- **query**:基于 `index.md` + L1 摘要回答问题(内容量小,无需向量库)
- **lint**:定期扫描 —— `status=active` 但 `date` 过期的 idea、无 collaborator 的开放协作项、孤立无 `links` 的页面

---

## 4. [2] Ingest 层 — silan CLI

复用现有 `silan-personal-website/silan/` 包,职责收敛为**一条命令**:

```
silan ingest [--content ./content] [--db ./portfolio.db] [--full|--incremental]
```

流程:
1. `parsers/` 读 content/*.md → 解析 frontmatter + body
2. (可选)调 LLM 补全 `tldr` / 翻译表 / tags —— 写回 .md(幂等)
3. `models/` 组装领域模型
4. `database_sync_logic/` 写入 SQLite:**先 DROP/重建内容表,再全量插入**

关键约束:
- ingest **只写内容表**(blog/project/idea/resume + translation 表)
- ingest **绝不碰互动表**(`comment` / `commentlike` / `projectlike` / `projectview` / `user_identities` / `request_logs`)—— 这些是运行时用户数据,DB 在这一类表上是真相源
- 因此 SQLite 文件 = 内容(派生) + 互动(真相),ingest 是分区写入

> 这解决了「markdown 为准」和「评论需要持久化」的矛盾:
> 内容单向派生,互动数据独立留存。

---

## 5. [3] 运行时 — Go 后端

- go-zero REST,端口 5200,Ent + SQLite
- **配置外置**:`backend-api.yaml` 里的绝对路径 `DB_SOURCE` 改为相对路径或环境变量
  (现状写死 `/Users/macbook.silan.tech/...`,换机即挂)
- 数据库驱动保持 sqlite3;并发只读无锁问题,互动表写入量小可接受

### 安全(P0 — 已修复)

| 项 | 状态 | 说明 |
|---|---|---|
| Google JWT 验签 | ✅ 已修 | 新增 `internal/auth` 包,JWKS 验签 + iss/aud/exp 校验 |
| GoogleClaims 副本 | ✅ 已修 | 两处副本合并到 `internal/auth`,单一实现 |
| 写接口鉴权 | ⚠️ 非漏洞 | create/update/delete project/idea **未注册路由**,无暴露面 |
| 评论删除靠 fingerprint | 🔲 待办(P1) | 应改服务端校验 user_identity;IP 从请求头取 |

---

## 6. [5] 发布 — Docker Compose

```
deploy/
  docker-compose.yml
  Dockerfile.backend        # 多阶段:go build → 精简运行镜像
  Caddyfile                 # 反代 + 自动 HTTPS(或 nginx)
```

`docker-compose.yml` 三个服务:

| 服务 | 镜像 | 职责 |
|---|---|---|
| `backend` | 自建 Go 镜像 | API :5200,挂载 `portfolio.db` 卷 |
| `web` | nginx/caddy | 托管前端静态产物 + 反代 `/api` 到 backend |
| (`ingest`) | 自建 Python 镜像 | 一次性任务,`docker compose run ingest` 重建 DB |

发布流程(手动):
1. 本地 `silan ingest` 生成最新 `portfolio.db`
2. `docker build` 后端/前端镜像,push 到 registry
3. 服务器:`scp portfolio.db` → `docker compose pull && docker compose up -d`
4. `portfolio.db` 用 named volume,ingest 与 backend 共享

> 互动数据保护:发布新内容时**不要覆盖整个 db 文件**(会丢评论)。
> 方案:服务器上跑 `docker compose run ingest`(只重建内容表),
> 或本地 ingest 前先从服务器拉回最新 db。

---

## 7. 分阶段实施路线

| 阶段 | 内容 | 依赖 |
|---|---|---|
| **P0** ✅ | Google JWT 验签 + auth 公共包 | 完成 |
| **P1-a** | 配置去绝对路径(env/相对路径) | 无,1 步 |
| **P1-b** | 评论删除服务端鉴权;IP 从请求头取 | 无 |
| **P1-c** | API 修 `reference_Zh` typo;列表接口去 L2 | 改 .api 重新生成 |
| **P1-d** | projects 路由顺序冲突(`/search` vs `/:slug`) | 改 .api |
| **P2-a** | content/ 目录 + frontmatter 约定 + `.schema.md` | 无 |
| **P2-b** | silan CLI 收敛为 `silan ingest`,分区写入 | P2-a |
| **P2-c** | `GET /api/v1/index` 全站内容地图 | P1-c |
| **P2-d** | LLM ingest/lint 脚本 | P2-b |
| **P3** | Docker Compose + 发布流程 | P2-b |

---

## 8. 已完成(本次)

`backend/internal/auth/` 新增公共包:

- `google.go` — `VerifyGoogleIDToken`:拉取并缓存 Google JWKS(1h TTL),
  RS256 验签,校验 issuer / audience / expiry / email_verified。纯标准库实现,无新依赖。
- `identity.go` — `UpsertGoogleIdentity` / `NewUserID`:验证后的 claims → UserIdentity 落库,单一实现。

改造:
- `logic/auth/googleverifylogic.go` — 删除 `ParseUnverified`,改调公共包
- `logic/blog/createblogcommentlogic.go` — 删除 `ParseUnverified`、本地 `GoogleClaims`、
  `verifyAndGetUser`、`generateUserID`,改调公共包

`go build ./...` 与 `go vet` 通过。
