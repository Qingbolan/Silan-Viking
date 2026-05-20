# 16 · 终局制品交付部署 —— deploy 管线第一性原理重构

> 决策人:CTO Silan.Hu(终局拍板) · 架构:凉冰 · 状态:实施中
> 日期:2026-05-17

## 16.1 问题

`silan site deploy` 当前是**源码部署**,不是**制品部署**。整条管线
和两个 Dockerfile 都隐含假设「目标机器上有完整的源码仓库」:

- `run_vite_build` 要求 `frontend/package.json`,现场 `npm ci && npm run build`
- `web.Dockerfile` `COPY frontend/ ./` 后现场构建 Vite bundle
- `backend.Dockerfile` `COPY backend/ ./` 后现场 `go build`
- `docker-compose.yml` 的 `build.context: ..` 把整个仓库当构建上下文

而真实用户 `cargo install silan-viking` / `pip install silan` 之后,
手上**没有 `frontend/`、没有 `backend/`、没有 Dockerfile、没有
compose.yml** —— 这些只在产品仓库里。`silan site deploy` 对他直接
报错 `front-end not found`。

## 16.2 第一性原理推演

**产品是什么:** AI 驱动的个人作品集平台。**用户是谁:** 想要个人
网站的人,不是 clone 仓库的贡献者。**他的资产只有** `content/` 里的
markdown 和 `silan-viking.toml`。前端 / 后端是**产品**,不是用户资产。

这与 Hugo / Zola 同构:用户从不碰主题源码,主题随引擎走。

**因此终局形态唯一解:**

> `cargo install silan-viking` → `silan init` 铺项目 → 写 markdown
> → `silan site deploy` 一条命令上线。全程零前端源码、零 Node、零 Go。

**这把所有"选择题"锁死成唯一解:**

1. **后端必须预构建。** 用户机器上没有 Go 源码,现场 `go build`
   逻辑上不成立。
2. **前端必须是引擎自带的制品。** 与 `silan init` 内嵌 `SCHEMA.md`
   完全同构 —— 引擎自带 canonical schema,就该自带 canonical 前端
   bundle 和 Docker 资产。
3. **registry vs 内嵌:** registry 需要维护 Docker Hub / CI 推送 /
   用户能访问 registry —— 是托管服务的运维负担。终局可以有 registry,
   但**当前唯一正确解是 CLI 二进制自带预构建制品**:把"用户能部署"
   的依赖收敛到零 —— 只要有 Docker。

**结论:`run_vite_build` 这个函数在终局形态里是伪命题,应当删除。**

## 16.3 终局架构 —— 内嵌源码 tar + Docker 隔离构建

**核心判断:不变量是「用户机器无需源码仓库」,不是「绝不编译」。**
Docker 多阶段构建是封闭、可重现、与用户宿主环境隔离的 —— 在容器里
`npm run build` / `go build` 完全正当。`run_vite_build` 之所以错,
是它在**用户的宿主机、用用户的 npm** 编,这才是要消除的。

引擎构建期(`build.rs`)把以下打包,`include_bytes!` 进二进制:

| 制品 | 来源 | 排除 |
|---|---|---|
| `frontend.tar.gz` | `frontend/` 源码(~4.9M) | `node_modules`、`dist`、`.git` |
| `backend.tar.gz` | `backend/` 源码(~11.3M) | 编译二进制、`*.db`、`*.log` |
| `deploy.tar.gz` | `deploy/`:compose、两个 Dockerfile、nginx/proxy 配置、entrypoint | — |

总计约 16M 源码,压缩后更小;内嵌后 `silan-viking` 约 25M,可接受
(Hugo 量级)。**为什么内嵌源码 tar 而非 `frontend/dist` 构建产物:**
`dist/` 是 git-ignored 的产物,提交进 `assets/` 等于把构建产物塞进
版本控制,且每次前端改动要手动同步。`build.rs` 在编译期打 tar,
保证制品与当前源码一致,不污染 git。

**为什么用 `build.rs` 打 tar 而非 `npm run build`:** 若 `build.rs`
跑 npm,每次 `cargo build` 都被迫装 Node —— 违反「开发者 build CLI
不该依赖 Node」。`build.rs` 只做 `tar` 打包(纯 Rust / 系统 tar),
真正的 npm/go 构建推迟到 Docker 多阶段里。

`silan site deploy`:把三个内嵌 tar 解到临时 staging 目录 → docker
compose 在那里多阶段构建(node 阶段编前端、golang 阶段编后端,全在
容器隔离环境)→ 启动。用户侧依赖收敛到只剩一个:**有 Docker**。

## 16.4 后端镜像策略

后端用 `mattn/go-sqlite3`(CGO)。`backend.Dockerfile` 保留
`golang:1.24-bookworm` 构建阶段(已装 gcc + libc6-dev),从 staging
目录里解出的 `backend/` 源码构建。与前端 `node:20` 构建阶段对称 ——
两者都是「引擎内嵌源码 tar → Docker 多阶段隔离构建」,架构一致。
不预编译跨架构二进制:Go/Node 容器构建快、可重现,免去多架构分发。

## 16.5 已发现的真实 bug(终局跑通的阻塞项)

实施 + 端到端验证过程中抓到并修复的 4 个 bug:

1. **healthcheck 端点曾走旁路:** `/api/v1/health` 之前是手写
   `server.AddRoute` 注册在 `backend.go`,绕过了 goctl。`.api` 文件
   是后端 HTTP 契约的唯一真相源。**已修:** 在 `backend.api` 加
   `health` group + `Health` handler,`goctl api go` 重新生成,移除
   `backend.go` 的旁路 `AddRoute`。
2. **仓库卫生债:** 4 个编译二进制(含一个误生成在 `internal/ent/`
   的 99M ar-archive)被 git 跟踪,污染将要内嵌的 backend 源码 tar。
   **已修:** `git rm --cached` + 补 `.gitignore`,删除垃圾文件。
3. **`build.rs` 排除规则误伤源码:** `tar --exclude=migrate` 用裸
   basename,把源码包 `backend/internal/ent/migrate/` 也一起排除,
   导致镜像内 `go build` 报 `package ... migrate is not in std`。
   **已修:** 排除模式改为路径锚定(`backend/migrate`)。
4. **healthcheck 探针工具缺失:** `debian:bookworm-slim` runtime 镜像
   既无 `wget` 也无 `curl`,compose healthcheck 用 `wget` → `exit
   127` → 容器永久 unhealthy。**已修:** runtime stage 装 `curl`,
   healthcheck 改用 `curl -fsS`。

5. **跨机 ship 漏传 `proxy.conf`:** `proxy` 服务 bind-mount
   `./proxy.conf` 进 nginx 容器,但跨机 ship 阶段只 scp 了 compose
   文件,没传 `proxy.conf`。Docker 见源路径不存在 → 把它创建成同名
   目录 → 挂载到容器内文件路径失败。**已修:** ship 阶段补 scp
   `proxy.conf`(与 compose 同放 remote_dir 根)。
6. **跨机传二进制是错的:** 旧跨机路径把控制机的 `silan-viking`
   二进制 scp 到目标机执行 `site promote`。控制机二进制按控制机
   OS/架构编译,目标机可能跑不了(macOS→Linux,glibc↔musl)。
   **已修:** promote 是纯 SQLite 操作 —— 改为在控制机本地做:从
   目标机 scp 出 live db、本地 promote、再 scp 回去。不再传二进制。
7. **SSH host-key 策略缺失:** `ssh`/`scp` 未设 `StrictHostKeyChecking`,
   首次连一台新服务器会交互式卡死。**已修:** 4 个 ssh/scp 调用点
   统一加 `StrictHostKeyChecking=accept-new`(首次接受+记录、之后
   严格验证,比 `=no` 安全)。
8. **`[deploy]` 不支持自定义 SSH 端口:** 真实服务器常把 sshd 移出
   22 端口。**已修:** `[deploy]` 加可选 `ssh_port`(默认 22),
   `ssh -p` / `scp -P` 全部带上。
9. **`index sync` 漏写 `episode_series` → promote 撞 FK:** 扫描
   `episode/<series>/<episode>/` 时,`scan_episode_type` 完全忽略了
   series 目录里的 `series.toml`,从不产生 `episode_series` 行;但
   `ProseMapper` 给每条 `episodes` 行写了 `series_id`(= series slug)。
   live 库(Go ent migration)的 `episodes.series_id` 是指向
   `episode_series.id` 的外键 —— 父行不存在,promote 在 COMMIT 报
   裸 `FOREIGN KEY constraint failed`。**已修:** `scan` 读
   `series.toml` 进新结构 `ScannedSeries`(slug 取目录名,即 FK 目标);
   `run.rs` 在 `build_batch` 末尾按 series 产出 `episode_series` 行 ——
   放在批次层而非 per-Item mapper,因为 series 是多个 episode 共享的
   父行,从 mapper 产出会每集重复一次、sink 的裸 INSERT 撞主键。
10. **backend 容器重建后 proxy 缓存了旧 IP → 502:** deploy 第 5 步
    `compose up -d` 用新镜像**重建** backend 容器(新网络 IP),但
    第 6 步只 `restart backend`。nginx 在 worker 启动时解析一次
    `backend` upstream 并缓存 IP,旧 proxy 指向已死的旧容器,持续
    返回 502。**已修:** 第 6 步改为 `restart backend proxy`,单机
    与跨机两条路径都刷新 proxy 的 upstream。

## 16.6 验收结果 —— 终局已跑通(2026-05-17)

**单机模式** —— 在一个完全无源码的全新目录用 `silan-viking` 二进制:
`init` → `[deploy] host=localhost` → `deploy --confirm` → 六步管线
全过、站点在本机 Docker 上线。

**跨机模式** —— 两个隔离的 Docker 容器,字面意义的「两台电脑」:
- 控制机 `sv-control`:只有 `silan-viking` 二进制 + Docker + SSH
  client,**零源码**(模拟 `cargo install` 后的操作员机器)。
- 目标机 `sv-target`:DinD + sshd,只有 Docker + SSH(模拟真实
  远程服务器)。
- 控制机 `init` 全新项目 → 配 `[deploy]` 指向 `sv-target` →
  `deploy --confirm` → 镜像构建/打包/`docker save`/scp 跨 SSH 传到
  目标机 → 目标机 `docker load`/`up` → promote → 站点上线。

两种模式验收全绿:

| 检查 | 结果 |
|---|---|
| `/api/v1/health` | `{"status":"ok"}` |
| 前端首页 | HTTP 200 |
| `/api/v1/resume` | 返回真实数据 |
| `/api/v1/blog/posts` | HTTP 200 |
| backend 容器健康 | `healthy` |
| promote | `tables=11 rows=17`,运行时表保留 |

CTO 最初的问题 —— 「一台机器安装配置,部署到另一台(Docker)」——
答案:**能,且已端到端实测。** 引擎二进制自带全套制品,目标侧只
需 Docker + SSH。单机与跨机两条路径都跑通。

CTO 指令:**按终局一步到位,要真正跑通的结果。** 已达成。

## 16.7 待优化(不阻塞终局,记录备查)

- ✅ **已修(GOAL §8 deploy #1)**:`remote_dir` 若指向 `deploy` 用户无
  写权限的路径(如 `/srv` 下),`ssh` 闭包捕获 `Permission denied` 后
  抛出指引消息,提示管理员预先 `sudo chown $USER <dir>` 或把
  `remote_dir` 选在用户家目录下。落点
  `engine/crates/silan-viking-cli/src/main.rs` 的 `ssh` 闭包。
- ✅ **已修(GOAL §8 deploy #2)**:跨机 ship 前清空 `remote_dir` 的旧
  文件 —— `[4/6] ship` 步在 `mkdir -p` 之后插入
  `rm -rf images.tar snapshot.db docker-compose.yml proxy.conf`,清掉
  上次失败留下的同名目录,避免后续 scp 被卡(`rm -f` 删不掉目录)。
- ⚠️ **已知陷阱(开发者自留)**:跨平台容器构建(macOS 主机 + Linux
  容器共享挂载卷)**不能信 cargo 增量缓存** —— host 写入的 fingerprint
  与容器内 glibc/libc 版本不匹配,增量复用错的 `.rmeta` 会出现
  「symbol not found」一类的离奇错误。
  - **症状**:从 macOS host 跑 `cargo build` 成功;立刻 `docker run`
    挂载 host `target/` 进 Linux 容器再 build,链接失败或运行时崩。
  - **规避**:容器构建用**独立的** `CARGO_TARGET_DIR`(例:
    `CARGO_TARGET_DIR=/tmp/target-linux cargo build`),不和 host
    `target/` 共享;Docker 多阶段构建本来就是隔离卷,这条主要针对
    开发者自己在 host 与容器之间手动来回切的场景。
  - **不变量**:`build.rs` 的 tar 打包(`silan-viking-cli/build.rs`)
    在 host 上跑 —— 它只 tar 源码、不调 cargo,因此免疫此陷阱
    (符合 GOAL §9 不变量 #9)。
