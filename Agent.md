# Silan Viking 项目与 Agent 开发指南

本文件是仓库级 Agent 指令的唯一真源。`AGENTS.md` 只负责标准工具发现，
不复制这里的内容。

## 1. 先建立正确心智模型

Silan Viking 是 local-first 的研究内容工作空间，不是一个以线上数据库为
编辑真源的 CMS。正常数据流是：

```text
content/ Markdown + TOML + media（可编辑真源）
  -> Rust engine 校验、索引、组装发布包
  -> Go content-deploy 状态机验证并投影到运行时数据库
  -> Frontend 生成并原子切换静态发布版本
```

SQLite、PostgreSQL、API 响应、网站 HTML、SEO 文件和统计数据都是投影或
运行时事实，不能反向成为作者内容真源。`content/agent/` 是私有上下文，绝不
进入公开发布包。完整跨设备工作空间以私有 Git remote 为主；生产站点恢复只
包含已部署的公开 `SCHEMA.md + resources/`，不包含 `agent/` 或原 Git 历史。

## 2. 仓库边界与所有权

| 路径 | 责任 |
|---|---|
| `engine/` | Rust 核心：内容模型、校验、索引、提案、MCP、CLI、恢复和交付编排。 |
| `engine/crates/silan-viking-base` | 无领域依赖的纯工具层。 |
| `engine/crates/silan-viking-content` | 内容领域对象和 schema 语义。 |
| `engine/crates/silan-viking-entities` | 派生数据库实体边界。 |
| `engine/crates/silan-viking-app` | 用例与状态机；不得依赖 CLI/桌面/HTTP 表现层。 |
| `engine/crates/silan-viking-{cli,mcp,site}` | L4 adapter，只做输入输出适配和用例装配。 |
| `backend/` | Go API、认证、运行时事实与生产内容 promotion 状态机。 |
| `frontend/` | 公开读取与静态渲染；不拥有内容写入。 |
| `desktop/` | Tauri + React 本地编辑工作台；调用共享用例，不复制领域规则。 |
| `deploy/` | Nginx/systemd、Docker 本地预览和部署配置。 |
| `content/` | 独立且被主仓库忽略的作者工作空间；操作前单独检查其 Git 状态。 |
| `docs/silan-viking/` | 已结论化的架构、CLI、测试和交付设计。 |

Rust 依赖方向必须保持：

```text
cli / mcp / site -> app -> entities / content -> base
```

不允许反向依赖，不允许把业务规则塞进 adapter，也不允许前端、桌面端和 CLI
各自复制一套状态判断。

## 3. 本机编译和重装最新引擎

整个项目的构建版本由 TideMark 管理。`.tidemark.toml` 是版本策略，annotated
`v*` tag 是 release anchor，当前 Git 坐标必须通过以下命令获取：

```sh
tide mark
tide mark --explain
./scripts/tide-version.sh
```

禁止把 Cargo、npm、Tauri 或 Go manifest 中的静态 package version 当成当前
build identity，也禁止为了“同步版本”逐个手改这些文件。manifest version 表示
package/release compatibility anchor；Tide coordinate 表示整个 Git revision 的唯一
构建坐标。引擎、完整本机构建和发布打包入口都会导出 `SILAN_BUILD_VERSION`。

仓库源码构建的唯一 engine-only 入口是：

```sh
./engine/install-dev.sh
```

它默认执行完整 Rust workspace 测试、使用 `Cargo.lock` release 编译、校验构建产物、原子替换
`~/.local/bin/silan-viking`，并维护 `silan`、`svk` 两个软链接。安装来源、Git
commit、Tide coordinate、源码状态和二进制 SHA-256 记录在：

```text
~/.local/state/silan-viking/install-receipt
```

常用变体：

```sh
./engine/install-dev.sh --prefix /custom/bin
./engine/install-dev.sh --debug
./engine/install-dev.sh --skip-tests   # 仅限明确的快速本地迭代，交付前不能使用
```

`engine/install.sh` 面向发布版用户，会下载 GitHub Release；它不保证包含 main
分支尚未发布的功能。`packaging/release/dev-install-local.sh` 用于同时构建 CLI
和 macOS Desktop，不是引擎重装的替代入口。

Desktop 命令有两个不可混用的生命周期：

```sh
silan desktop       # 启动已安装、已编译的 Silan Context System.app
silan destop        # 保留的历史拼写，行为相同
silan desktop dev   # 唯一的 Tauri/Vite 开发服务器入口
```

默认命令不得探测源码 `package.json`、调用 npm 或启动开发服务器。安装或更新桌面
bundle 使用 `packaging/release/dev-install-local.sh --desktop-only --user-apps`。
CLI 和 Desktop 必须共同遵守最近项目配置中的 `[project].content_dir`；恢复后的
content repository 可以使用 `silan.tech` 等设备本地目录名，不能重新硬编码为
`content/`。
通过 CLI 成功打开的本机项目必须自动写入 Desktop 的设备级工作空间记录；显式启动
目录优先于上次选择，同一目录重复打开保留设备配置，无效目录不得覆盖已保存记录。
之后从应用图标启动时恢复该工作空间，bootstrap 必须返回真实项目路径和名称。

安装后至少验证：

```sh
silan --version
silan site recover --help
cat ~/.local/state/silan-viking/install-receipt
```

## 4. 关键生命周期必须是显式状态机

- 内容交付：`receiving -> validated -> promoting -> verifying -> rendering -> complete`；
  任意非终态失败进入 `failed`。
- 站点恢复：`authenticate -> download -> verify provenance -> stage -> validate -> initialize Git -> activate`；
  失败必须保持目标目录不变。
- 作者工作流：`capture -> structure -> connect -> review -> publish -> deploy -> verify`；
  publish 与 deploy 是两个显式动作。
- 编辑、部署就绪度和工作空间 bootstrap 也必须集中为单一状态模型；不要在多个
  UI component 或 handler 中堆叠相互矛盾的布尔量。

涉及生命周期时，先定义状态、合法迁移、终态和失败后的资源不变量，再连接
I/O。不要用散落的条件分支模拟状态机。

## 5. 内容恢复与新设备场景

优先级必须明确：

1. **完整换机**：从私有 content Git remote clone/fetch，保留 private source、
   `agent/` 和完整历史。
2. **灾难恢复**：当本地和私有备份都不可用时，执行：

   ```sh
   silan site recover --from https://silan.tech --to ./content
   ```

   CLI 使用 `SILAN_STATS_SYNC_TOKEN`（进程环境或目标项目 `.env`，缺失时安全提示）
   调用 `GET /api/v1/content/source`，验证 release commit、SHA-256、tar 路径安全和
   schema 后，再原子激活一个新的 Git 仓库。目标必须不存在或为空。

生产站点不是私有工作空间备份，不得通过新增 fallback 声称能恢复 `agent/`、
未发布草稿或原 Git object graph。

## 6. 变更方法

1. 先读根 `Agent.md`，再读离任务最近的设计文档和测试；先用 `rg` 找现有所有者。
2. 开始和结束都检查根仓库 `git status --short`。操作 `content/` 时，另行执行
   `git -C content status --short`，不要把两个仓库混为一谈。
3. 保持公共命令和公共接口兼容，但内部重构应收敛到职责明确的对象和模块。
4. 优先解决根因并删除迁移后的旧实现。除非 SPEC 明确要求，不保留 compatibility
   layer，不添加只为延续旧架构的 fallback。
5. 不直接修改派生数据库或生产表来修复作者内容；修复真源并重建投影。
6. Agent 可读、分析、生成可审查 proposal；接受 proposal、publish、生产 deploy、
   rollback 和凭据操作必须由所有者明确执行或授权。
7. 不提交 `.env`、token、私钥、恢复包或私有 `content/agent/`。日志也不得打印凭据。
8. 保留用户已有的未提交改动，不用 destructive Git 命令覆盖它们。

## 7. 最低验证矩阵

只运行与变更范围相称的集合，但改动跨边界时必须组合验证：

```sh
# Rust engine
cd engine
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --locked

# Go backend
cd backend
gofmt -w <changed-go-files>
go test ./...

# Public frontend
cd frontend
npm ci
npm run lint
npm run build

# Desktop
cd desktop
npm ci
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

安装脚本改动还要执行 `bash -n engine/install-dev.sh`、检查 `--help`，并至少完整
运行一次 release 安装，比较 receipt SHA-256 与安装文件哈希。

## 8. 维护指令

- 架构目标是高内聚、低耦合、工业教材式边界；命名必须表达领域责任和所有权。
- 数据模型、parser、mapper、sink、transport、UI 之间使用显式接口，不跨层读取
  对方内部状态。
- 同一 invariant 只有一个执行点；测试覆盖该 owner，而不是在调用者重复断言实现。
- schema、bundle 或协议升级必须版本化、拒绝不兼容输入，并提供一次性迁移工具；
  迁移完成后删除旧路径。
- 生产 code delivery 只从已提交 Git revision 物化；content delivery 只从干净且
  已提交的 content revision 组包。不要把 mutable worktree 或整套源码藏进 CLI。
- 所有产品构建版本只调用 `tide mark`（脚本内调用 `scripts/tide-version.sh`）；不再
  维护第二套 commit-count、日期版本或手工自增逻辑。schema/protocol version 是兼容
  性协议，不得与 Tide build coordinate 混用。
- 提交代码时作者身份只能是 `Silan.Hu <silan.hu@u.nus.edu>`，使用 conventional
  commit，并在交付说明中列出实际执行的验证。
- 架构权威入口：`docs/TECHNICAL-OVERVIEW.md`、
  `docs/silan-viking/01-oop-structure.md`、`02-cli-service.md`、`05-testing.md`、
  `16-terminal-artifact-delivery-deploy.md`。实现与文档冲突时，不猜测；先确认当前
  settled decision，再同步实现、测试和文档。
