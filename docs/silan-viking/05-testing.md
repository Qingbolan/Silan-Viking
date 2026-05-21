# 05 · 测试场景

> 测试覆盖**从需求基线 `#1–#16` 和对象模型逐条倒推** —— 不是「我觉得该测什么」,
> 是「每条需求、每个关键对象,对应哪个场景必须绿」。
> 测试代码落点见 `01-oop结构.md` §1.9 的 `engine/tests/`。

## 5.1 四层测试结构

| 层 | 工具 | 测什么 | 落点 |
|---|---|---|---|
| L1 单元 | `#[cfg(test)]` | 单个对象的契约(`SilanUri::parse`、`Part` 角色推断…)| 各 crate 内 |
| L2 快照 | `insta` | parser 产物、`SeoEmitter` 产物的稳定性 | `silan-viking-app` |
| L3 e2e | `assert_cmd` | `silan` 命令端到端跑真实 fixture 仓 | `engine/tests/` |
| L4 契约 | 自定义 | Rust `silan index sync` 产出的 db 与 Go ent schema / 前端读取契约逐项对齐 | `engine/tests/` |

异步路径(MCP server)用 `tokio::time::timeout` 包裹,失败模式是「测试失败」不是「CI 挂起」。

## 5.2 测试 fixture —— 一个迷你 content/ 仓

`engine/tests/fixtures/content/` 是一个刻意构造的最小内容仓,**每种结构都有一例**,
让场景测试有真实输入:

```
fixtures/content/
├── resources/
│   ├── blog/
│   │   ├── hello-world/  parts/body/{meta.toml, en.md, zh.md}   # 普通博文,双语
│   │   └── my-vlog/      parts/body/{meta.toml, en.md}          # content_type=vlog,单语
│   ├── ideas/
│   │   └── multi-tab-idea/  parts/
│   │         ├── overview/{meta.toml, en.md}
│   │         ├── progress/{meta.toml, en.md, zh.md}   # ★ 一个 Part 含多语言变体
│   │         ├── reference/{meta.toml, en.md}
│   │         └── result/{meta.toml, en.md}
│   ├── projects/
│   │   └── sample-project/  parts/{overview, progress}/  # 每个 Part 一个 meta.toml + en.md
│   ├── episode/
│   │   └── tutorial-series/                            # episode 是独立 content type(裁决 2)
│   │         ├── episode-01-intro/   parts/body/{meta.toml, en.md, zh.md}
│   │         └── episode-02-deep/    parts/body/{meta.toml, en.md}
│   ├── update/
│   │   └── changelog-2026-q2/  parts/body/{meta.toml, en.md}   # update 是第 6 种 content type(裁决 3)
│   └── resume/  parts/                                 # resume 是多 Part(裁决 1),非单 body Part
│         ├── summary/      en.md,   zh.md              # prose Part → .md
│         ├── education/    en.toml, zh.toml            # entry_list Part → .toml(array-of-tables)
│         ├── experience/   en.toml, zh.toml            # entry_list Part → .toml
│         ├── publications/ en.toml, zh.toml            # entry_list Part → .toml
│         ├── awards/       en.toml, zh.toml            # entry_list Part → .toml
│         ├── research/     en.toml, zh.toml            # entry_list Part → .toml
│         └── skills/       en.toml, zh.toml            # key_value_list Part → .toml
└── agent/
    ├── project/understanding.md      # agent 对项目的理解(ctx_brief 的素材)
    ├── notes/sample-note.md
    ├── owner/silan-profile.md         # agent 对 owner 的理解(reflect 写入目标)
    └── sessions/sample.md

# resume 的 Part 按 shape 分两类源文件(裁决 1,扩展名规则见 10§10.4.5):
#   summary 是 prose shape → parts/summary/<lang>.md(markdown);
#   education/experience/publications/awards/research 是 entry_list
#   → TOML array-of-tables,每条 entry 有 entry_id=e_<ulid>;
#   skills 是 key_value_list → TOML 顶层分类 key -> list<string>;
#   两者都落库 part_entry + part_entry_translation。
# 另有 resume 边界 fixture(测 validate 分级):
#   resume-no-name/    缺 full_name      → 期望 error
#   resume-no-email/   缺 email          → 期望 warning(非 error)
#   resume-bad-dates/  education entry 的 start > end → 期望 error
# frontmatter 里刻意埋:一对 idea→blog→project 演化边、一个双向声明的边(测 canonicalization)
```

## 5.3 场景测试 —— 按需求逐条倒推

每条需求至少一个场景。`★` 标的是你近期点出的、必须重点钉住的。

### 内容结构与解析(#2)

| 场景 | 测什么 | 期望 |
|---|---|---|
| ★ **idea 多 tab parse** | parse `multi-tab-idea/`,Part 模型(§1.3)| 解析出 4 个 `Part`(overview/progress/reference/result),`Progress` 这个 Part 下有 en/zh 两个 `File` —— **Part 维与 Lang 维不混** |
| ★ **可配置文件树** | 给 SCHEMA 的 idea 定义临时加一个 `Part`(discussion)+ fixture 加 `Discussion.md` | parser **不改代码**就解析出第 5 个 Part —— 证明 §1.3.1 配置驱动 |
| ★ **缺非必需 Part** | `sample-project` 只有 README+Progress,无 Reference | parse 成功,缺的 Part 标记为 absent,不报错(`required: false`)|
| 缺必需 Part | fixture 造一个没有 README 的 idea | parse 报错,退出码非 0,指明缺哪个 `required` Part |
| 语言变体 = Part 内 representation | `parts/progress/` 下 `en.md`+`zh.md` | 同属 Part `progress`(同 `meta.toml` 的 part_id),en/zh 两个 representation |
| Collection/Item/File 三层 | `silan content tree` | 输出层级与磁盘结构一致 |

### 5.3.1 `ResumeParser` 验证切片 —— 一个 parser 走通全测试

> 对应 `01-oop结构.md` §1.5.1 的 `ResumeParser`。用一个真实 parser 验证
> 「parser 方法 + 测试」端到端跑通。fixture:`fixtures/content/resources/resume/`。

**L1 单元测试**(`silan-viking-app/src/parser/resume.rs` 内 `#[cfg(test)]`):

```rust
#[test]
fn content_type_is_resume() {
    assert_eq!(ResumeParser::default().content_type(), ContentKind::Resume);
}

#[test]
fn parser_registry_dispatches_by_item_kind() {
    let registry = ParserRegistry::new();
    let item = load_fixture_item("resume/");
    assert_eq!(item.kind(), ContentKind::Resume);

    let parser = registry.parser_for(&item).unwrap();
    assert_eq!(parser.content_type(), ContentKind::Resume);
}

#[test]
fn scanner_rejects_unknown_content_kind_before_registry() {
    let err = scan_fixture("resources/unknown-type/example").unwrap_err();
    assert!(matches!(err, ScanError::UnknownContentKind { .. }));
}

#[test]
fn parsed_builder_is_not_public_api() {
    // compile-fail doctest / trybuild:
    // 外部模块不能调用 Parsed::builder 或 ParsedBuilder mutator。
    // Parsed 只能由 parser module 内部 finish() 产出,mapper 只能读 getter。
}

#[test]
fn parse_full_resume_extracts_seven_parts() {
    // resume 是多 Part 类型(裁决 1):summary/education/experience/
    // publications/awards/research/skills。源文件扩展名按 shape:
    // summary 是 prose → <lang>.md;其余结构化 Part → <lang>.toml。
    let item = load_fixture_item("resume/");
    let parsed = ResumeParser::default().parse(&item).unwrap();
    assert_eq!(parsed.main().get("personal.full_name"), Some("Example User"));
    // 7 个 Part 都解析出来。结构化 Part 用 entry_list/key_value_list shape,
    // 每条 entry 有 entry_id=e_<ulid>(裁决 1)。
    for role in ["education","experience","publications","awards",
                 "research"] {
        let entries = parsed.entries(role);
        assert!(!entries.is_empty(), "{role} Part 的 entry_list 应非空");
        // 每条 entry 必须带 entry_id,前缀 e_
        assert!(entries.iter().all(|e| e.entry_id().starts_with("e_")),
                "{role} 的每条 entry 应有 entry_id=e_<ulid>");
    }
    assert!(!parsed.key_values("skills").is_empty(), "skills 是 key_value_list");
    // summary 是普通 Part(非 entry_list)
    assert!(parsed.text("en", "summary").is_some());
}

#[test]
fn resume_parses_both_languages() {
    // ★ 钉住评审 R1 修复:每个 Part 目录下 en + zh 两个语言变体都被解析进
    // Parsed.langs —— 不丢任何语言。(summary 是 .md,其余结构化 Part 是 .toml)
    let item = load_fixture_item("resume/");     // fixture: summary/{en,zh}.md + 其余 parts/<role>/{en,zh}.toml
    let parsed = ResumeParser::default().parse(&item).unwrap();
    // 两个语言变体都在
    assert_eq!(parsed.langs().count(), 2);
    assert!(parsed.lang("en").is_some());
    assert!(parsed.lang("zh").is_some());
    // zh 变体的内容是中文的、且非空 —— 证明 zh 没被 primary_file() 吞掉
    let zh = parsed.lang("zh").unwrap();
    assert!(zh.get("personal.title").is_some());
    assert!(!parsed.entries_for_lang("zh", "education").is_empty());
    // main(语言无关)只从 canonical_lang 读取(§1.8.0 不变量)
    assert_eq!(parsed.main().slug(), "resume");
}

#[test]
fn missing_full_name_is_error() {
    let item = load_fixture_item("resume-no-name/");   // fixture:故意去掉姓名
    let parser = ResumeParser::default();
    let issues = parser.validate(&parser.parse(&item).unwrap());
    assert!(issues.iter().any(|i| i.is_error() && i.msg().contains("full_name")));
}

#[test]
fn missing_email_is_warning_not_error() {
    let item = load_fixture_item("resume-no-email/");
    let parser = ResumeParser::default();
    let issues = parser.validate(&parser.parse(&item).unwrap());
    assert!(issues.iter().any(|i| i.is_warn() && i.msg().contains("email")));
    assert!(!issues.iter().any(|i| i.is_error()));   // 缺 email 不该是 error
}

#[test]
fn invalid_education_date_range_is_error() {
    let item = load_fixture_item("resume-bad-dates/");  // education entry start > end
    let parser = ResumeParser::default();
    let issues = parser.validate(&parser.parse(&item).unwrap());
    assert!(issues.iter().any(|i| i.is_error() && i.msg().contains("education 日期")));
}

#[test]
fn resume_is_multi_part_entry_list() {
    // resume 是多 Part 类型(裁决 1):summary + 5 个 entry_list Part + skills key_value_list。
    // 验证 Part 模型对「多 Part 的 resume」也成立 —— 不再是单 body Part。
    let item = load_fixture_item("resume/");
    for role in ["summary","education","experience","publications",
                 "awards","research","skills"] {
        assert!(item.part(role).is_some(), "resume 应有 {role} Part");
    }
    assert!(item.part("body").is_none());   // resume 没有旧的单 body Part
}
```

**L2 快照测试**(`insta`):

```rust
#[test]
fn resume_parsed_snapshot() {
    let parsed = ResumeParser::default().parse(&load_fixture_item("resume/")).unwrap();
    insta::assert_yaml_snapshot!(parsed);   // 解析产物结构稳定,改逻辑一眼看 diff
}
```

**L3 e2e**(`assert_cmd`,跑真实 `silan`):

```
silan index sync           → resume 的 7 个 Part 正确写进表:summary 等普通 Part
                           写 item_part + item_part_translation;5 个 entry_list
                           Part 的每条 entry 写 part_entry + part_entry_translation,
                           skills 作为 key_value_list 写 part_entry
                           (裁决 1)
silan content show silan://resources/resume → 输出含姓名、各 Part 条目数
```

**Mapper / Registry 单元测试**:

```rust
#[test]
fn mapper_registry_dispatches_by_parsed_kind() {
    let parser = ParserRegistry::new()
        .get(ContentKind::Resume)
        .unwrap();
    let parsed = parser.parse(&load_fixture_item("resume/")).unwrap();

    let mapper = MapperRegistry::new().mapper_for(&parsed).unwrap();
    assert_eq!(mapper.content_type(), ContentKind::Resume);
}

#[test]
fn resume_mapper_outputs_identity_and_translation_rows() {
    let parsed = ResumeParser::default()
        .parse(&load_fixture_item("resume/"))
        .unwrap();
    let rows = ResumeMapper::default().map(&parsed).unwrap();

    assert!(rows.item_parts().any(|r| r.role == "summary"));
    assert!(rows.part_entries().any(|r| r.role == "education"));
    assert!(rows.part_entries().any(|r| r.role == "skills"));
    assert!(rows.part_entry_translations().any(|r| r.lang == "en"));
    assert!(rows.part_entry_translations().any(|r| r.lang == "zh"));
}
```

**L4 契约**:同一份 resume(`parts/<role>/` 下 en/zh 的 .toml),Rust `silan`
产出的 resume 相关表必须满足当前 Go ent schema 与前端读取契约 —— 含
`part_entry` 主表**与 `part_entry_translation` 译文表**(双语都要对得上),
entry_list 每条 entry 的 `entry_id` 在主表与译文表间一致;skills
key_value_list 的分类 key 在主表与译文表间一致。

**这个切片证明**:`ResumeParser` 的三个 public 契约方法
(`content_type`/`parse`/`validate`)各有测试钉住;`ParserRegistry`
按 `Item.kind()` 闭集分派;`Parsed` 的构造只能走 parser-only builder;
`validate` 的 error vs warning 分级(缺姓名=error、缺邮箱=warn)被精确验证;
`Part` 模型对「多 Part 的 resume」和「多 Part 的 idea」统一适用,
resume 的 5 个 entry_list Part 与 skills key_value_list 落 `part_entry` +
`part_entry_translation`(裁决 1);`parse` 遍历多语言 `File`、`Parsed` 承载多语言变体(§1.8.0)被
`resume_parses_both_languages` 钉住 —— 评审 R1 不会复发。

### 系列(#3 #5)

> episode 是独立 content type(裁决 2):磁盘形态
> `content/resources/episode/<series-slug>/<episode-slug>/parts/body/`,
> 独立 ent 表 `episodes` / `episode_series`。

| 场景 | 测什么 | 期望 |
|---|---|---|
| episode 系列有序 | parse `episode/tutorial-series/` | 各 episode 按 `episode-NN` slug 前缀有序,挂同一 `episode_series` |
| episode 落独立表 | sync `episode/tutorial-series/` | episode 写 `episodes` 表、系列写 `episode_series` 表,不混入 blog 主表(裁决 2)|
| episode 不进 blog 列表 | `silan content ls blog` | episode 条目**不出现**在 blog 列表 |

### 演化关系(#4)

| 场景 | 测什么 | 期望 |
|---|---|---|
| ★ **canonicalization** | fixture 里 idea 写 `evolved-into: blog-X`、blog-X 写 `evolved-from: idea`(同一条边两端各声明)| sync 后 `content_relation` 表**只有一行**,不撞 `UNIQUE`、不报错(§1.8.2)|
| 演化链贯通 | sync 后查 idea→blog→project | 三段边都在,正反向都查得到 |
| 悬空边检测 | fixture 造一条指向不存在 Item 的边 | `silan index lint` 报出该悬空边 |

### 持久化(#1 #6 #7)

| 场景 | 测什么 | 期望 |
|---|---|---|
| ★ **item_part 落库** | sync `multi-tab-idea`,查 `item_part` + `item_part_translation` 表 | progress 在 `item_part` **只一行**(identity);`item_part_translation` 才是 en/zh 各一行,`lang`/`body` 在译文表(裁决 4 拆表)|
| sync 全量 | `silan index sync` | 内容主表 + translation + `item_part` + `item_part_translation` + `content_relation` 数据正确 |
| sync 增量 | 改一个 Item 重 sync | 只该 Item 重建,其余 `.meta` hash 不变 |
| rebuild 幂等 | `silan index rebuild` | 结果与首次 sync **逐字节一致** |
| 运行时数据不被 sync 碰 | 预置带评论/打点的 db,再 sync | `comment`/`content_interaction` 数据**原样保留**(派生 vs 运行时边界)|

### 打点与访客识别(#15)

| 场景 | 测什么 | 期望 |
|---|---|---|
| ★ **爬虫三分类** | 喂 Googlebot / GPTBot / 真人 三种 user_agent | `visitor_kind` 分别判为 search_crawler / ai_crawler / human |
| ★ **AI 对话来源** | referrer 来自 chatgpt.com / google.com / 直接 | `referrer_kind` 分别判为 ai_chat / search / direct(裁决 5:全仓统一 `ai_chat`)|
| 章节级打点 | 打点带 section_anchor | `content_interaction` 行记录到具体章节 |
| 交互统计查询(远程)| `silan stats show <uri>` 打到一个 stub 的 Go API stats endpoint | `silan stats` 发 HTTP 请求到 `[deploy].host` 的 `/api/v1/stats`,解析返回;**不查本地 db**;`--json` 可解析。未配 `[deploy]` 时报错 |
| view+like 同表 | 一次 view、一次 like | `content_interaction` 两行,`kind` 分别 view/like |

### 批注与评论(批注 / 评论)

| 场景 | 测什么 | 期望 |
|---|---|---|
| 三类批注 | 写入 reader/owner/agent 三种 `author_kind` 的 annotation | 各自落库,owner 批注默认 `visibility=private` |
| annotation vs comment 边界 | 一条带 anchor、一条不带 | 带 anchor → `annotation`;不带 → `comment`(§修订 E FLAG 6)|

### CLI(#8 #9)

| 场景 | 测什么 | 期望 |
|---|---|---|
| `silan` noun-first | `silan --help` | 6 个 type 组 + 8 个工具组(`content`/`index`/`relation`/`site`/`stats`/`proposal`/`mcp`/`skill`)都在 |
| 命名一致性(#9)| `silan --version`、binary 名、`silan://` URI 解析 | binary = `silan-viking` 以 `silan` 进 PATH;所有 URI 前缀 `silan://`;crate 名 `silan-viking-*` |
| type 组动词统一 | idea/blog/project/update 各跑 `new/list/show/edit/rm/archive` | 六动词同名同义,行为一致 |

### MCP 档 1 只读 —— 工具逐一倒推(#10 #12 #15)

> `03-mcp服务.md` 档 1 有 9 个工具。每个工具一个场景,缺一个 = 缺口。

| 场景 | 测什么 | 期望 |
|---|---|---|
| MCP `recall` | 已知 query 走默认 SQLite FTS5 lexical index | 无网络、无 Embedder 时命中预期 Item,返回摘要与 matched_parts |
| MCP `recall` fallback | 配置 ApiEmbedder 但 stub 返回错误 | 降级 lexical-only,span 标 `embedder=fallback`,工具仍成功 |
| ★ **MCP `list`** | `list("project", {status:"building"})` | 只返回 status=building 的 project,带 slug/标题/status/演化关系;与 CLI `silan project list --status building` **结果一致** |
| MCP `browse` | `browse("silan://resources/")` | 返回目录结构,与磁盘一致 |
| MCP `read` | `read` 一个 Item URI | 返回该 Item 正文 |
| MCP `context_brief` | 空会话调 `context_brief()` | 返回浓缩简报,含 silan 当前在想的内容 |
| MCP `lint` | `lint()` | 返回体检报告,与 `silan index lint` 同结果 |
| MCP `stats`/`visitors` | 打到 stub Go API | 远程查询,不查本地 db,与 CLI `silan stats show/visitors` 同构 |
| ★ **MCP `crawler_breakdown`/`source_breakdown`** | 打到 stub Go API | 两工具分别按访客类型 / 来源聚合;与 CLI `silan stats crawlers/sources` **逐一同构、同结果** |

### MCP 档 2 / 2.5 —— 捕捉与 agent context(#12)

| 场景 | 测什么 | 期望 |
|---|---|---|
| MCP `capture` | agent `capture(note, "idea")` | 起一个 `proposal/<ulid>` 分支,新 Item 按正式结构写入;真相源主分支未动 |
| ★ **`ctx_write` 直写 agent/** | `ctx_write("silan://agent/notes/x", ...)` | 直接写入,**不**起提案分支;只 stage `content/agent/**`,生成 `agent: ctx_write ...` commit |
| ★ **`ctx_write` 并发锁** | 两个 ctx_write 同时写同一 agent 文件 | `agent-write.lock` 串行化;无半写文件,commit trailer 含 `Agent-Tool`/`Agent-Uri`/`Content-Hash` |
| ★ **`ctx_write` 拒写 resources/** | `ctx_write("silan://resources/ideas/x", ...)` | 被 Namespace 层拒绝(`ResourceNamespace.accepts_direct_write()==false`)|
| `ctx_read` | 读 `silan://agent/` 下文件 | 返回内容 |
| `ctx_brief` | 新 agent 调 `ctx_brief()` | 返回「上一个 agent 留下的项目理解」简报 |
| `reflect` | 会话末 `reflect(session)` | 写不可变 `agent/sessions/YYYY/MM/DD/<ulid>.md`,并按规则更新 `agent/owner/` 与 `agent/project/` |
| ★ **`agent/` 永不发布** | `agent/` 下放内容后跑 `silan site build` | 网站产物中 `agent/` 一字不出现(`is_publishable()==false`)|

### MCP 档 3 / 4 —— 提案与危险副作用(#10 #11 #13)

| 场景 | 测什么 | 期望 |
|---|---|---|
| MCP 提案隔离 | agent `propose` 后查真相源 | 真相源(主分支)未变,草稿在 `proposal/<id>` 分支;`accept` 后才 merge 入主分支 |
| `summarize_updates` | agent 生成 changelog 草稿 | 走提案分支,不直接落库 |
| ★ **`deploy` 默认关闭** | 未加 `--enable-deploy` 时 agent 调 `deploy()` | 拒绝;加 `--enable-deploy` 后仍强制 dry-run + owner 确认 |
| MCP 不能 accept/publish | agent 调 `accept`/`publish` | 拒绝 —— 人专属(#13);二者不在 MCP 工具表 |
| ★ **提案锚到 Part** | agent `propose` 一个 idea 的 `progress` Part | 提案分支只动 `parts/progress/` 一个 Part 目录,其余 Part 不变(`git diff` 验证)|
| ★ **校验关卡挡脏数据** | agent 提交一个 frontmatter 残缺的提案 | 校验①标红;`silan proposal accept` 被拒,主分支不变 |
| 提案校验通过可 accept | agent 提交结构合规的提案 | 校验绿,`accept` = merge + 重校验 成功,主分支出现新内容 |
| ★ **提案陈旧 → accept 冲突** | 切提案分支后,silan 改主分支同一文件并提交,再 accept | 临时区 merge 冲突 → `accept` 报错退出、**主分支 HEAD 一字未动**;`silan proposal show` 列冲突文件 |
| ★ **accept 时重校验(校验②)** | 提案提交时校验①过,但之后 silan 删了提案引用的 Item | 临时区 merge 后校验②不过 → 丢弃临时 worktree,**主分支 HEAD 从头没动过**(非"动了又回滚")|
| ★ **accept 原子性** | accept 成功一次 | 主分支指针一次性指到已验证的 merge commit(含 1 个 merge commit);失败路径下 `git reflog` 主分支无任何痕迹 |
| 临时 worktree 不泄漏 | accept 三条出口(成功/校验失败/冲突)各跑一次 | 每条出口后 `git worktree list` 无残留临时 worktree |
| 陈旧提案 rebase | `silan proposal rebase <id>` 后再 accept | rebase 重对基线后,无冲突则 accept 成功 |

### skill 分发(#16)

> 对应 `13-skill-分发.md`。`silan skill` 命令组与 skill 包产物的契约。

| 场景 | 测什么 | 期望 |
|---|---|---|
| ★ **`silan skill emit` 产物** | 跑 `silan skill emit --path t` | `t/silan-viking/` 下生成 `SKILL.md`(frontmatter 含 name/description)+ `reference/mcp-tools.md`;退出码 0 |
| SKILL.md frontmatter 合规 | 解析 emit 出的 `SKILL.md` | frontmatter 有 `name`/`description`;description 是固定模板、覆盖自然语言触发面 |
| skill 正文嵌入项目状态 | emit 后读 `SKILL.md` 正文 | 含当前 6 个 type 清单 + MCP 本机解析规则;同步包不含绝对路径/固定端口 |
| ★ **MCP 坐标本机解析** | 在机器 A emit 后复制到机器 B,机器 B 跑 `silan skill status` + `silan mcp status --json` | 用机器 B 的 `silan mcp serve --stdio` 解析接入;若二进制/项目/Schema hash 不匹配,明确报 `binary_found`/`mcp_available`/`schema_hash_match` 等失败项 |
| ★ **emit 是派生、可重建** | 改 `SCHEMA.md` 后重 `emit` | skill 包覆盖更新,与新项目状态一致;不残留旧 type 清单 |
| `silan skill status` 一致性 | emit 后改 `SCHEMA.md`,跑 `skill status` | 检出不一致(ContentHash 比对),提示重 emit |
| `silan init` 不自动 emit | 全新 `silan init` 后查 `~/.claude/skills/` | 无 silan-viking skill —— emit 需显式调(默认不开,同 deploy)|
| `silan skill rm` | emit 后 `skill rm` | skill 包目录被移除 |
| skill 红线进正文 | 读 emit 出的 `SKILL.md` 正文 | 含三条安全红线(resources/ 只走提案、accept/publish/deploy 人专属、agent/ 不发布)—— `03` 安全总则已投影进 agent 视野 |

### 端到端主线:init / 配置 / 部署(`06`)

> 对应 `06-端到端.md`。这些用例钉住「从安装到部署」整条主线的每一步契约。

| 场景 | 测什么 | 期望 |
|---|---|---|
| ★ **`silan init` 产物** | 空目录跑 `silan init --path t` | 生成 `content/` 六 type 目录(blog/projects/ideas/episode/resume/update,裁决 3)+ 三示例条目(welcome blog / ai-content-optimizer idea / sample-project)+ `SCHEMA.md` + `silan-viking.toml` + `git` 仓含首次 commit;退出码 0 |
| `silan init` 目录非空 | 非空目录跑 `silan init` | 退出码 1,报错;`--here` 模式则只补缺失项 |
| ★ **toml 完整解析** | 解析 §6.2.2 的完整 `silan-viking.toml` | `[project]/[identity]/[database]/[mcp]/[deploy]` 全段字段解析正确 |
| toml 缺必填段 | `silan-viking.toml` 删掉 `[deploy]` | `silan site deploy` 退出码 1,报错指明缺 `[deploy]` |
| ★ **SSH key 路径不存在** | `[deploy].ssh_key_path` 指向不存在的文件 | `silan site deploy` 退出码 1,报错提示生成 key;**不**尝试连服务器 |
| SSH key 权限不对 | key 文件权限非 600 | `silan site deploy` 报错,提示 `chmod 600` |
| ★ **identity 播种 resume** | `silan init` 后查 `content/resources/resume/parts/summary/en.md` | summary 是 prose Part → `.md`;name/title/email 来自 `[identity]`;改 `parts/experience/en.toml`(entry_list Part → `.toml`)加一条 entry 后 sync,`part_entry` / `part_entry_translation` 表跟着变(markdown/toml 真相源,裁决 1)|
| `deploy --dry-run` | 默认 `silan site deploy` | 打印六步计划,**不连服务器、不动线上**;退出码 0 |
| `deploy --confirm` 链路 | `silan site deploy --confirm` | sync→build→package→ship→promote→up 六步执行;线上 content commit 更新,运行时表不被覆盖 |
| ★ **deploy 不覆盖运行时数据** | 线上 DB 预置 comment/content_interaction,再 promote 新派生库 | 派生表更新;comment/content_interaction/reader annotation 原样保留(`08` §8.3) |
| 主线指令退出码 | init/sync/serve/accept/deploy 各跑成功与失败 | 退出码符合 §6.8(0 成功 / 1 用户可修复 / 2 环境错)|
| ★ **SeoEmitter 产物** | `silan site build` | 生成 sitemap.xml/robots.txt/JSON-LD/预渲染 HTML/meta;快照比对(#14)|
| 可见性投影 | 一个 private、一个 public 的 Item | 只有 public 被投影到网站产物 |

## 5.4 契约测试 —— 只验最新结构(#6)

同一份 `fixtures/content/`:Rust `silan index sync` 产出 `portfolio.db`。
断言它满足三组最新契约:

- Go ent schema:所有派生表字段、enum、索引、外键与 `backend/internal/ent/schema/`
  一致 —— 含 `item_part`/`item_part_translation`(裁决 4)、`part_entry`/
  `part_entry_translation`(裁决 1)、`episodes`/`episode_series`(裁决 2)拆表后的
  形态,`referrer_kind` enum 用 `ai_chat`(裁决 5)。
- 前端读取契约:Go API 实际使用的查询能从新库读出 6 种 content type
  (blog / projects / ideas / episode / resume / update,裁决 3)+ relation +
  item_part(译文走 `item_part_translation`)。
- 内容不变量:只从 `content/resources/` 派生,`content/agent/` 永不进库。

旧 Python `silan` 只作为 M0 抽取事实的参考材料,**不作为对拍目标**。本轮是直接
落最新结构,不保旧磁盘布局、不保旧 Python 输出库逐表等价。

## 5.5 CI

```
cargo test --workspace                       # L1 + L2 + L3
cargo clippy -- -D warnings -D unwrap_used    # 09 §9.1:非测试代码零 unwrap
cargo fmt --check
<contract job>                               # L4,Go ent + 前端读取契约
<criterion bench job>                        # 09 §9.5:性能基准,> 基线×1.5 警告 ×2 失败
```

## 5.6 测试覆盖 ↔ 需求映射(自查表)

| 需求 | 对应场景 |
|---|---|
| #1 markdown 真相源 | sync 全量 / 增量 / rebuild 幂等 |
| #2 内容结构 | idea 多 tab / 可配置文件树 / 三层 tree / 语言推断 / resume 多 Part(7 Part,裁决 1)/ update 第 6 type(裁决 3)|
| #3 #5 系列 | episode 系列有序 / episode 落独立表 / episode 不进 blog 列表(裁决 2)|
| #4 演化关系 | canonicalization / 演化链贯通 / 悬空边 |
| #6 Rust 重写 | 契约测试(含 item_part 拆表、part_entry、episode 独立表);`silan init` 产物六 type(全新 Rust,不依赖 Python、不兼容旧结构)|
| #7 OOP | L1 单元(各对象契约)|
| #8 CLI | `silan` noun-first / 6 type 组 + 8 工具组 / 动词统一 |
| #9 命名一致 | 命名一致性(binary / URI 前缀 / crate 名)|
| #10 #12 MCP | `recall` / `list` / `browse` / `read` / `context_brief` / `capture` / `ctx_*` / `ctx_brief` / `reflect` / 提案隔离 / 提案锚 Part / 校验关卡 / accept 原子性 |
| #11 #13 | `lint` / `summarize_updates` / `deploy` 默认关闭 / MCP 不能 accept/publish / `agent/` 永不发布 / 可见性投影 |
| #14 爬虫产物 | SeoEmitter 产物快照 |
| #15 打点 | 爬虫三分类 / AI 来源 / 章节打点 / stats / visitors / crawler_breakdown / source_breakdown(CLI 与 MCP 同构)|
| #16 skill 分发 | `silan skill emit` 产物 / SKILL.md frontmatter / emit 可重建 / `skill status` 一致性 / init 不自动 emit / 红线进正文 |
| 端到端主线(`06`)| `silan init` 产物 / toml 完整解析 / SSH key 校验 / identity 播种 / deploy dry-run / 指令退出码 |

> 一条需求若在此表找不到对应场景 = 测试有缺口。M0/M1 实施时此表必须保持满覆盖。
