# GOAL · silan-viking 终局（锐化版）

> 本文件是 silan-viking 的**单页目标钉子**。任何 PR、任何文档、任何 agent 行为，
> 都要能指回这里某一条；指不回 = 删。
> 详细推导见 `00-终局与需求.md` / `16-终局制品交付部署.md` / `17-单一事实源.md`。

---

## 1. 一句话

**silan-viking 是 silan 一个人的 context 系统。**
markdown 是真相源，Rust 引擎 (`silan`) 把它增量同步成 SQLite 派生缓存喂网站，
协作 agent 经 MCP 读写这套 context，个人网站是 context 中 `visibility=public`
内容的一层对外投影。**单租户、单设备、内容驱动、agent-native。**

**非目标（挡漂移用）**
- ❌ 不是 CMS — owner 管"想法"，不"管理网站"
- ❌ 不是多租户 SaaS — 单租户钉死（`17` §17.3）
- ❌ 不是跨设备一致性系统 — 多设备靠 Git 手工同步
- ❌ 不是旧 Python `silan` 的兼容层 — 旧仓库仅归档

---

## 2. 终局运行画面（owner 视角）

```
$ cargo install silan-viking         # 或 curl|sh / pip install silan-viking
$ silan init                          # 在 ~/.silan-viking/ 铺 content/ + toml + git
$ silan idea new "kv-store-on-iouring"
$ vim .../parts/overview/zh.md
$ silan index sync                    # 增量同步进 _deploy/portfolio.db
$ silan site deploy --confirm         # 单/跨机 Docker 部署，零 Node、零 Go
```

agent 那边（装了 silan skill 的 Claude）：
说出念头 → `recall` 找到旧 idea → `ctx_write` 续上
→ 几天后 `capture` 起草 → proposal 分支 → owner `silan proposal accept <ulid>`
→ 内容成熟 → agent 把 `visibility=public`（提案）→ accept → `silan site deploy`
→ 站点上线（sitemap/robots/JSON-LD/per-page meta/预渲染 HTML 齐）
→ 访客评论/浏览只落服务器 → owner `silan stats <slug>` 远程查访客指纹+来源识别。

---

## 3. 磁盘终局（四摊东西，混了就漂移）

```
① /usr/local/bin/silan                   binary=silan-viking，以 silan 之名进 PATH
② ~/.config/silan/config.toml            跨项目配置 (XDG)
③ ~/.silan-viking/                       内容项目（--path 可改）
   ├─ silan-viking.toml                  [identity]/[database]/[deploy]
   ├─ _deploy/portfolio.db               ★ 派生缓存，可重建
   └─ content/                           ★ 唯一真相源，git 仓
      ├─ SCHEMA.md  index.md  log.md
      ├─ resources/{blog,ideas,projects,episode,resume,update}/<item>/parts/<role>/{meta.toml,<lang>.<ext>}
      └─ agent/{project,notes,silan,sessions}/     ← 永不发布
④ engine/crates/silan-viking-{base,content,entities,app,cli,mcp,site}  仅引擎开发者有
```

---

## 4. 对象模型（L1–L4 严格单向，crate 边界物理保证）

| 层 | crate | 核心 |
|---|---|---|
| L1 base | `silan-viking-base` | 错误/URI/ULID/hash/fs/tracing |
| L2 content | `silan-viking-content` | `Namespace`/`Collection`/`Item`/`Part`/`File`、SCHEMA 解析、Part shape 闭集 `prose / entry_list / key_value_list` |
| L3 app | `silan-viking-app` | `Workspace`/`Parser`(6 impl)/`Mapper`/`Sink`/`RowSet`/`WriteLock` trait（`FileWriteLock` 唯一 impl） |
| L4 adapter | `silan-viking-{cli,mcp,site}` | 三个对外面，互不依赖 |

**6 个 content type 是编译期闭集**：`idea / blog / project / episode / resume / update`。
加 type = 改 L2/L3 + 重编 + bump major。
**加 tab 不重编**：改 `content/SCHEMA.md` 的 `parts` 列表，Parser 配置驱动。

---

## 5. 服务面

### CLI `silan` —— 给人
- **8 工具组**：`content / index / relation / site / stats / proposal / mcp / skill`
- **6 type 组**：`idea / blog / project / episode / resume / update`，各带 `new/list/show/edit/rm/archive` + 专属操作
- 样式锁死 **noun-first**：`silan <noun> <verb>`（对齐 EasyNet-Cli）

### MCP `silan mcp serve` —— 给 agent
工具数闭集，权威表 `17` §17.2：

| 阶段 | 工具数 |
|---|---|
| **M9（当前终局）** | **18** |
| E1 | 21（+`suggest_relations/parts/lifecycle`） |
| E2 | 22（+`propose_schema`）|

`deploy` 默认隐藏，`--enable-deploy` 才入闭集。握手即推 `silan://schema` + `silan://overview` + `silan://agent/brief`。

### Site `silan site deploy` —— 给世界
唯一形态：**二进制自带制品 tar + Docker 多阶段隔离构建**（`16`）。
- `build.rs` 编译期把 `frontend.tar.gz / backend.tar.gz / deploy.tar.gz` `include_bytes!` 进二进制
- deploy = 解 tar 到 staging → `docker compose` 多阶段构建 → 启动
- 用户依赖收敛到 **1 个**：Docker（跨机 +SSH）
- 自动产出爬虫产物：sitemap + robots + JSON-LD + per-page meta + public 页预渲染 HTML

### Skill `silan skill install` —— 零配置 agent 接入
生成 skill 包 → 装进 Claude → 自动发现 MCP → owner 说话/写作/推进项目时自动调用。

---

## 6. 数据流（grep 可验）

### 内容（双向，git 仓为真相源）
```
owner 写 md ─┐
             ├─▶ content/*.md (git commit)
agent propose┘                │ silan index sync (增量按 hash)
                              ▼
                    _deploy/portfolio.db (派生缓存)
                              │ silan site deploy
                              ▼
                    服务器 portfolio.db (内容表) + 前端
```
agent 写路径：`ctx_write` / `reflect` / `propose` 走 `proposal/<ulid>` 分支
+ `agent-write.lock` 文件锁 + `expected_head` 乐观锁，`silan proposal accept` 才 merge。

### 运行时数据（单向，只在服务器）
访客评论/浏览打点/识别（人/搜索引擎/AI 爬虫）→ 服务器 `portfolio.db` 的
`comment / content_interaction / request_logs / stats_cache_*` →
`silan stats` / MCP `stats` 远程查询。
**运行时数据本地永远是空，是设计不是 bug。**

### promote 白名单（铁律）
- **派生表**（`blog_posts / ideas / projects / episodes / episode_series / resume / recent_updates / item_part / part_entry / content_relation / annotation / …`）→ **被替换**
- **运行时表**（`comment / content_interaction / request_logs / stats_cache_*`）→ **保留**
- `site promote` 必须在**控制机本地** scp 拉/换/推；用本地 db 直接覆盖线上 = 丢评论 = 禁止（`16` §16.5 bug #6）。

---

## 7. 验收矩阵（每条对应 `00` §0.2 一个 `#`）

| # | 验收点 | 机械验证 |
|---|---|---|
| 1 | md→SQLite→Docker | `silan init && silan index sync && sqlite3 portfolio.db "select count(*) from blog_posts"` |
| 2 | 6 type + parts/role | 6 个目录全在；CLI 拒绝第 7 种 |
| 3 | 容器+合集系列并存 | `episode/<series>/<ep>/` 解析进 `episode_series + episodes`，promote 不撞 FK |
| 4 | idea→blog→project 演化 | `content_relation` 有三独立条目 + `evolves_into` 边 |
| 5 | 容器系列 ep 不进 blog 列表 | `/api/v1/blog/posts` 不返回 episode 行 |
| 6 | Rust engine + Go 后端 + Python 归档 | `engine/` 跑通，`silan/` 仅 docs 引用 |
| 7 | OOP + SCHEMA 先行 | `crates/` 四层物理边界；`SCHEMA.md` 进 git |
| 8 | noun-first CLI | `silan idea new` 通；`silan new idea` 报错 |
| 9 | 命名 | binary=`silan-viking`，PATH=`silan`，协议=`silan://` |
| 10 | agent 读/写/发布 | MCP 18 工具齐，propose→accept 走 git 分支 |
| 11 | agent 维护网站 | MCP `deploy`（`--enable-deploy`）通 |
| 12 | 捕捉→写作→项目→部署 | §2 剧本端到端通 |
| 13 | 单租户 | `agent-write.lock` 文件锁；文档不声称跨设备 |
| 14 | 爬虫产物 | sitemap/robots/JSON-LD/per-page meta/预渲染 逐文件存在 |
| 15 | 实时数据 + 访客识别 | `silan stats <slug>` 返回 `referrer_kind ∈ {search,social,ai_chat,direct,internal}` |
| 16 | skill 零配置 | `silan skill install` 装进 Claude 后能自发现 MCP |

---

## 8. 当前 → 终局：执行 checklist

### 🔴 阻塞终局（必做）
- [x] **M0.5b · Go ent 跟进**：切到 `content_tag` + `tag` 统一 ent；删除 `BlogTag`/`IdeaTag`/`BlogPostTag` 三 schema；移除 blogpost.go / idea.go 的旧 edges；新增 `stats_cache_{item,visitor,crawler,source}` 4 张 ent；`ent generate` 重生成
- [x] **M0.5b · Go logic 适配**：`getblogtagslogic` / `getideatagslogic` 已走 `internal/contenttag` raw SQL 读 `content_tag` 表（早先实现），与 engine 写入一致
- [ ] ~~**M0.5b · 前端 resume 重构**：消费新 `item_part / part_entry` 模型~~（前端工作，单独 PR）
- [x] ~~**M0.5b · 一次性迁移脚本**~~：审查发现 `blog_tags`/`idea_tags` 旧表本来就空（没人写），engine 重 sync 自然写 `content_tag`，无需脚本
- [x] ~~**非 blog 详情 handlers**~~：审查发现 5 月 17 日已补齐 — `episode/:slug`、`update/:slug`、`idea/:id`(→已统一 `:slug`)、`project/:slug`、`resume`(单 Item 类型无需 :slug) 全部 working
- [x] **统一 idea 详情为 `:slug`**：对齐 blog/episode/update/project 的命名约定；`api/backend.api` + `types.go` + `routes.go` + `getidealogic.go` 改完编译过
- [x] **deploy #1**：`silan-viking-cli/src/main.rs` ssh 闭包升级到 `.output()` 捕获 stderr，识别 `Permission denied` 后给出 `chown` 指引
- [x] **deploy #2**：`[4/6] ship` 步在 `mkdir -p` 之后插一段 `rm -rf images.tar snapshot.db docker-compose.yml proxy.conf`，清掉前次失败留下的同名目录

### 🟡 E 阶段（自我演化）
> **超出当前 GOAL 范围**：GOAL §5 明确 M9=18 工具 = 当前终局；E1/E2/E3 是 `04` 排在 M9 之后的下一阶段。文档 (`15`) 与 JSON schema (`15` §15.5.1) 已就绪，**实施属于下一阶段工程而非 GOAL 收尾**。规模评估见 §11.
- [x] **M9 闭集补 `deploy`** ← GOAL §5 真实缺口：原 `tool_specs()` 只 17 项，与文档钉死的 18 不符。加 `ToolTier::Deploy` + `deploy` ToolSpec + dispatch arm（默认拒绝调用，提示走 CLI `silan site deploy`）；新增 `ToolGate { deploy, evolve }` + `advertised_tool_specs(gate)`，server 默认过滤 deploy/evolve 出 `tools/list`
- [x] **E1 三工具 stub**：`suggest_{relations,parts,lifecycle}` 按 `15` §15.5.1 JSON schema 落 ToolSpec + dispatch；返回空 `suggestions[]`（schema 合法）；同样 gated（`evolve: true` 才通告）；让 closed_set=21 在代码侧成立
- [x] **MCP gate 测试钉死**：closed_set=21、default surface=17、6 tiers 覆盖（ReadOnly/Capture/AgentContext/Proposal/Deploy/Evolve），与 17 §17.2 表一致
- [ ] **E1 算法实装**（下阶段）：把三个 stub 的 suggestions 从 `[]` 变成实际推理 —— ~500-600 行 Rust
- [ ] **E2**（下阶段）：MCP +1 `propose_schema` + `silan schema check` 三方一致性闸门 + `schema-proposal` 提案子类 —— ~1500-2000 行 Rust
- [x] **漂移自检上 CI**：`17` §17.4 清单跑成检查 — `engine/scripts/check_docs_drift.py` 落地（6 个检查：6 type 闭集、MCP 工具数 M9/E1/E2、idea.status enum、referrer_kind 拼写、Part shape 闭集、8 CLI 命令组），挂进 `engine-ci` 的 `docs-drift` job；docs 改动也触发

### 🟢 不阻塞但记账
- [x] 跨平台容器 cargo 增量缓存陷阱 — `16` §16.7 升级为"已修/已记账"段，给出具体规避命令（独立 `CARGO_TARGET_DIR`）
- [x] `silan content lint --drift` — `content lint [<uri>] [--drift]` 上线；`--drift` 调 `engine/scripts/check_docs_drift.py`，仓外执行时给清晰降级提示

---

## 9. 不变量（违反 = 直接 reject）

1. **6 type 是编译期闭集** — 加第 7 种要改 Rust + bump major
2. **真相源是 `content/` git 仓** — `portfolio.db` 任何时刻能 `rm && silan index sync` 重建
3. **运行时数据只在服务器** — 本地运行时表永远空，不"同步回本地"
4. **用户依赖只有 Docker**（跨机 +SSH）— 不允许"用户机器装 Node/Go"
5. **agent 写内容必经提案**（git 分支 + `expected_head` + `agent-write.lock`）— 不允许直写主分支
6. **单设备假设** — 任何"跨设备一致性"承诺必须显式注明"靠 Git 手动同步"
7. **CLI noun-first；MCP 工具数闭集**（M9=18）— 加工具必须同步改 `17` §17.2 + `03` §3.2 + `04` E 阶段验收
8. **promote 只换派生表**，运行时表保留 — 不通过 = 丢线上评论
9. **`build.rs` 只打 tar**，不跑 npm/go — 真正编译进 Docker 多阶段
10. **跨机 ship 不传二进制**（架构可能不匹配）— `promote` 在控制机本地 scp 拉/换/推

---

## 10. 一句话总结

> **装 Docker 的人，三条命令（`cargo install` → `silan init` → `silan site deploy`）让自己的网站上线。**
> **写 markdown 就是更新网站；对 agent 说话就是续上自己的 context；agent 经提案改内容、owner 一句 accept 就发布。**
> **整个过程没有"管理网站"这件事，只有"管理想法"。**
