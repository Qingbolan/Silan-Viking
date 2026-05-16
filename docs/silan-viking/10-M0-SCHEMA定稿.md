# 10 · M0 — `content/SCHEMA.md` 定稿

> 这一章把 `08-工程审查补充.md` §8.2 的 SCHEMA **骨架**,下沉成
> **可编码级**的定稿规格 —— 让 parser 不用猜、CLI/MCP/测试 fixture
> 按同一契约生成与校验。
>
> **本章地位**:它是 M0 的产物规格。M0 完成 = 仓库里真有一份
> `content/SCHEMA.md`,逐字段如本章所定。本章不是 `SCHEMA.md` 本身,
> 是「`SCHEMA.md` 该长成什么样」的设计与裁决依据。
>
> **字段来源纪律**(承 `00` §0.3):每个字段都标注它的事实来源 ——
> `[py]` = 现 Python parser 读取的字段,`[ent]` = 现 Go ent 表字段,
> `[new]` = 本设计新增。**没有 `[new]` 标注的字段不许凭空出现。**
>
> **裁决权纪律**(承 `VISION.md` §4「owner 是作者」):本章涉及 6-type
> 体系、enum 取值、磁盘形态这类**基线之上的裁决**,设计草案只作候选方案,
> **由最终评审拍板**。§10.1.1 是裁决账本 —— 每条裁决标明是否经最终确认。
> 本轮收口后账本不再保留 ⏳ 项;新增待定只能另开评审项,不能混进 M0 定稿表。

---

## 10.1 为什么必须有这一章 —— 三套 enum 在打架

抽取现 Python parser(`silan-personal-website/silan/parsers/`)与现 Go ent
(`backend/internal/ent/schema/`)后,发现**同一个 enum,三处三套值**。
这就是「parser 只能猜」问题的根。SCHEMA 定稿的第一价值 = **一次裁死**。

| enum | Python parser | Go ent | `08`§8.2 旧稿 | **裁决** |
|---|---|---|---|---|
| `idea.status` | draft/hypothesis/experimenting/validating/published/concluded | 同左(6 值) | hypothesis/exploring/building/shipped/archived | **采 Python+ent 的 6 值**(见 §10.4.1) |
| `blog.content_type` | article/podcast/vlog/episode/tutorial(5) | article/vlog/episode(3) | — | **4 值 article/podcast/vlog/tutorial** —— 留 podcast、去 episode(episode 独立成 type) |
| `blog.status` | draft/published/private | draft/published/archived | — | **status 与 visibility 拆开**;`status` ∈ draft/published/archived,`private` 归 visibility(见 §10.3) |
| `project.status` | ACTIVE/COMPLETED/PAUSED/CANCELLED(大写) | active/completed/paused/cancelled | — | **采小写 4 值**(磁盘契约统一小写) |

> **裁决原则**:① enum 取值以「Python parser ∩ Go ent」为基线,差集逐个
> 由最终评审裁定;② 大小写统一小写;③ `status`(生命周期)与 `visibility`
> (可见性)永不混用(承 `08` §8.2 硬规则)。每条裁决在 §10.4 给理由。

### 10.1.1 裁决账本 —— M0 定稿裁决

> 早期草案曾把以下裁决直接定死。经工程评审,**两条被推翻**。
> 本账本是「实施者据此动工前必须看的第一张表」。本轮收口后账本不再保留
> ⏳ 项;新增待定只能另开评审项,不能混进 M0 定稿表。

| # | 裁决点 | 早期草案 | **最终裁决** | 状态 |
|---|---|---|---|---|
| 1 | episode 形态 | blog_posts 行 + content_type | **独立内容主表 + 容器系列** | ✅ 已定 |
| 2 | resume 模型 | 7 个写死异构 Part + 7 张专用表 | **配置驱动 `entry_list` + 通用 `part_entry` 表;不为 resume 建专用 ent 表** | ✅ 已定 |
| 3 | update/recent_update | 不进 type 体系 | **保留为第 6 种 type** | ✅ 已定 |
| 4 | blog.content_type | 4 值(去 podcast) | **5 值(留 podcast)** | ✅ 已定 |
| 5 | is_public 字段 | 删,用 visibility 取代 | **删,用 visibility 取代** | ✅ 已定 |
| 6 | blog.content_type 是否含 `episode` | 含 | **去掉 `episode`** —— episode 已独立成 type;blog content_type = `article/podcast/vlog/tutorial`(4 值) | ✅ 已定 |
| 7 | `request_logs` 收编 | 待定 | **独立成正式 ent 表** —— 它是 API/访问日志,与内容交互语义不同 | ✅ 已定 |
| 8 | `referrer_kind` enum 命名 | `ai_chat` | **统一用 `ai_chat`** —— 需求文案即「AI 对话来源」,全仓一律 `ai_chat` | ✅ 已定 |
| 9 | project `priority`/`complexity` | 不引入 | **不引入** —— 它们是项目管理排序属性,不是内容本体属性;`status` + `is_featured` 已覆盖当前排序需求 | ✅ 已定 |

---

## 10.2 `SCHEMA.md` 的顶层结构

`content/SCHEMA.md` 是一份 **YAML(带 markdown 说明)** 文档,引擎只解析其中
fenced ` ```yaml ` 块。顶层六段:

```yaml
version: 1               # SCHEMA 版本,parser 用它判断能否解析
layout: latest-only      # 只认 parts/<role>/ 结构,无旧布局兼容

namespaces: { ... }      # 两个命名空间(§10.2.1)
field_types: { ... }     # 字段类型词表(§10.2.2)
types: { ... }           # 6 个 content type 定义(§10.4)—— 本章主体
relations: { ... }       # 关系类型与规范化(§10.5)
errors: { ... }          # 错误分级(§10.6)
```

### 10.2.1 namespaces

承 `01` §1.2.1、`08` §8.2,不变:

```yaml
namespaces:
  resources:
    root: content/resources
    publishable: true
    direct_agent_write: false      # agent 改发布内容只能走提案
  agent:
    root: content/agent
    publishable: false             # SiteProjector 永不碰
    direct_agent_write: true       # agent 经 ctx_write 直接写
```

### 10.2.2 field_types —— 字段类型词表

parser 校验字段时按这张表判类型。**这是 parser 的类型契约**:

| type | 磁盘表示 | 校验规则 | Rust 落点 |
|---|---|---|---|
| `string` | TOML/frontmatter 字符串 | 非空(若 required) | `String` |
| `text` | markdown 正文块 | — | `String` |
| `int` | TOML 整数 | i64 范围 | `i64` |
| `float` | TOML 浮点 | f64 | `f64` |
| `bool` | TOML 布尔 | true/false | `bool` |
| `date` | `YYYY-MM-DD` 字符串 | 严格 ISO-8601 日期 | `time::Date` |
| `datetime` | RFC-3339 字符串 | 严格 RFC-3339 | `time::OffsetDateTime` |
| `slug` | 字符串 | `^[a-z0-9][a-z0-9-]*$` | `Slug`(`base` 值对象) |
| `enum(...)` | 字符串 | 必须 ∈ 括号内取值 | 各 type 专属枚举 |
| `list<T>` | TOML 数组 | 每项是 T | `Vec<T>` |
| `ulid` | 字符串 | `p_` / `i_` 前缀 + ULID | `PartID` / `ItemID` |

---

## 10.3 frontmatter vs Part 正文 vs entry vs item_part —— 一个字段落哪

这是 M0 必须讲死的分配规则,否则 parser 不知道一个字段从哪读、写哪张表。

```
一个 Item 的数据,物理上分处存放(prose Part 三处;entry_list Part 见下):

  ┌─ Item 级 frontmatter ──→ parts/<主Part>/<lang>.md 的 YAML 头
  │    放:slug / title / status / visibility / kind / 关系声明 / 结构化属性
  │    特点:语言无关字段进 main;有译文的(title)进各 lang 变体
  │    落库:内容主表(blog_posts / ideas / projects ...)+ *_translations
  │
  ├─ prose Part 正文 ───────→ parts/<role>/<lang>.md 的 markdown 体
  │    放:每个 tab 的长文本(overview / progress / body ...)
  │    落库:item_part 表(修订 G)+ 其 translation
  │
  ├─ entry_list / key_value_list Part ──→ parts/<role>/<lang>.toml(TOML)
  │    放:entry_list 是 N 条同构 [[entry]];key_value_list 是分类 key → list
  │    特点:entry_list 字段由 SCHEMA 的 entry_fields 定义;key_value_list
  │          由 role 专属契约定义;translatable=false 进 shared_payload,
  │          translatable=true 进 localized_payload
  │    落库:part_entry 表 + part_entry_translation(见 11§11.5.1)
  │
  └─ Part meta.toml ─────────→ parts/<role>/meta.toml
       放:part_id / type / shape / canonical_lang / 翻译元数据(二期)
       落库:item_part 表的 identity 列;不进内容主表
```

**裁决规则**(parser 据此分配):

1. **结构化、可枚举、可索引** 的字段 → frontmatter → 内容主表的列。
   例:`status`、`is_featured`、`start_date`、`github_url`。
2. **prose Part 的长文本、按 tab 组织** 的内容 → Part 正文(`.md` body)
   → `item_part` 表。例:idea 的 overview/progress、project 的 challenges。
3. **identity 与翻译元数据** → `meta.toml` → `item_part` 的 identity 列。
4. **`entry_list` / `key_value_list` Part** 没有 markdown body。`entry_list`
   从 `.toml` 的 `[[entry]]` 块按 `entry_fields` 契约读;`key_value_list`
   从 `.toml` 的顶层分类 key 读。两者都落 `part_entry`
   (+ `part_entry_translation`)。仅 resume 有这类 Part(`10`§10.4.5)。
5. **语言无关字段只从 `canonical_lang` 读**。若 `zh.toml` / `zh.md`
   等非 canonical 语言文件也写了 `slug`、`date`、enum、url、bool 等
   语言无关字段,parser 一律忽略其值并报 `warn: main_field_lang_mismatch`。
   不做跨语言比对裁决,也不做“后写者胜出”: `meta.toml` 的
   `canonical_lang` 是 main 字段的唯一真相源,其它语言文件只贡献译文字段。
6. **`status` 与 `visibility` 必须是两个字段**(承 `08` §8.2):
   - `status` = 内容生命周期(draft → published → archived)。
   - `visibility` ∈ `private` / `unlisted` / `public`;**只有 `public`
     才允许 `SiteProjector` 投影到网站**。
   - `blog publish` 命令可同时写 `status=published` + `visibility=public`,
     但 SCHEMA 里它们是独立字段,不许合并。

---

## 10.4 六个 type 的逐字段定稿

> 每个 type 给三张表:**A. frontmatter 字段表**、**B. Part 清单**、
> **C. enum 裁决理由**。字段来源标 `[py]`/`[ent]`/`[new]`。
> `req` 列:✔=必填,空=可选。`default` 空 = 无默认(可选字段缺省即 None)。

### 10.4.1 type: `idea`

**A. frontmatter 字段**(落 `ideas` 表 + `idea_translations`)

| 字段 | type | req | default | 来源 | 落库列 |
|---|---|---|---|---|---|
| `slug` | slug | ✔ | — | [py][ent] | ideas.slug (unique) |
| `title` | string | ✔ | — | [py][ent] | ideas.title + translation.title |
| `kind` | enum(idea) | ✔ | idea | [new] | — (类型判别,不落库) |
| `status` | enum(见下) | ✔ | draft | [py][ent] | ideas.status |
| `visibility` | enum(private,unlisted,public) | ✔ | private | [new] | ideas.is_public 派生(public→true) |
| `priority` | enum(high,medium,low) | | medium | [py] | idea_details.* 或新列 |
| `category` | string | | — | [py][ent] | ideas.category |
| `abstract` | text | | — | [py][ent] | ideas.abstract + translation |
| `collaboration_needed` | bool | | false | [py][ent] | idea_details.collaboration_needed |
| `funding_required` | bool | | false | [py][ent] | idea_details.funding_required |
| `estimated_duration_months` | int | | — | [py][ent] | idea_details.estimated_duration_months |
| `estimated_budget` | float | | — | [py][ent] | idea_details.estimated_budget |
| `relations` | list<relation> | | [] | [new] | content_relation(§10.5) |

**B. Part 清单**(承 `01` §1.3.1)

| role | required | order | 正文落 | 对应 ent 旧字段 |
|---|---|---|---|---|
| `overview` | ✔ | 10 | item_part | idea_details / idea_translations.abstract |
| `progress` | | 20 | item_part | idea_details.progress |
| `reference` | | 30 | item_part | idea_details.references([py] REFERENCES.md) |
| `result` | | 40 | item_part | idea_details.results |

**C. `idea.status` enum 裁决**

```
status: enum(draft, hypothesis, experimenting, validating, published, concluded)
```
- 采 Python parser ∩ Go ent 的 6 值 —— 两处真相源一致,无歧义。
- `08`§8.2 旧稿写的 `exploring/building/shipped/archived` 是凭空造的,作废。
- **F1 待定项关闭**(`04` 里程碑遗留):`update`/`recent_update` 不再是
  idea 的 status,它是独立的关系来源(见 §10.5 与 §10.4.6 注)。

### 10.4.2 type: `blog`

**A. frontmatter 字段**(落 `blog_posts` 表 + `blog_post_translations`)

| 字段 | type | req | default | 来源 | 落库列 |
|---|---|---|---|---|---|
| `slug` | slug | ✔ | — | [py][ent] | blog_posts.slug (unique) |
| `title` | string | ✔ | — | [py][ent] | blog_posts.title + translation |
| `kind` | enum(blog) | ✔ | blog | [new] | — |
| `content_type` | enum(article,podcast,vlog,tutorial) | | article | [py][ent] | blog_posts.content_type |
| `status` | enum(draft,published,archived) | ✔ | draft | [py][ent] | blog_posts.status |
| `visibility` | enum(private,unlisted,public) | ✔ | private | [new] | — (新列,见 §11) |
| `excerpt` | text | | — | [py][ent] | blog_posts.excerpt + translation |
| `is_featured` | bool | | false | [py][ent] | blog_posts.is_featured |
| `featured_image_url` | string | | — | [py][ent] | blog_posts.featured_image_url |
| `published_at` | datetime | | — | [py][ent] | blog_posts.published_at |
| `category` | string | | — | [py][ent] | blog_posts.category_id(经 blog_categories) |
| `tags` | list<string> | | [] | [py][ent] | blog_post_tags |
| `series` | string(slug) | | — | [py][ent] | blog_posts.series_id |
| `series_order` | int | | — | [py][ent] | blog_posts.series_order |
| `relations` | list<relation> | | [] | [new] | content_relation |

> `reading_time_minutes` / `view_count` / `like_count` / `comment_count`
> **不进 frontmatter** —— `reading_time` 由引擎从正文算(派生),后三者是
> 运行时数据(只在服务器,`01`§1.10)。parser 不读、不写它们。

**B. Part 清单**

| role | required | order | 正文落 |
|---|---|---|---|
| `body` | ✔ | 10 | item_part / blog_post_translations.content |

**C. `blog.content_type` enum 裁决**

```
content_type: enum(article, podcast, vlog, tutorial)
```
- Python 给 5 值(含 `podcast`、`tutorial`),Go ent 给 3 值(`article/vlog/episode`)。
- **最终裁决(账本 #4)**:留 `podcast`(早期草案曾擅自去掉,被推翻)。
- **最终裁决(账本 #6)**:**去掉 `episode`** —— episode 已是独立 type
  (§10.4.4),blog 不再用 `content_type=episode` 表达剧集。最终 4 值:
  `article/podcast/vlog/tutorial`。
- M0.5 改 Go ent `blog_posts.content_type` 枚举为这 4 值(见 `11`)。

### 10.4.3 type: `project`

**A. frontmatter 字段**(落 `projects` + `project_translations` + `project_details`)

| 字段 | type | req | default | 来源 | 落库列 |
|---|---|---|---|---|---|
| `slug` | slug | ✔ | — | [py][ent] | projects.slug (unique) |
| `title` | string | ✔ | — | [py][ent] | projects.title + translation |
| `kind` | enum(project) | ✔ | project | [new] | — |
| `status` | enum(active,completed,paused,cancelled) | ✔ | active | [py][ent] | projects.status |
| `visibility` | enum(private,unlisted,public) | ✔ | private | [new] | projects.is_public 派生 |
| `description` | text | | — | [py][ent] | projects.description + translation |
| `project_type` | string | | Web Application | [py][ent] | projects.project_type |
| `start_date` | date | | — | [py][ent] | projects.start_date |
| `end_date` | date | | — | [py][ent] | projects.end_date |
| `is_featured` | bool | | false | [py][ent] | projects.is_featured |
| `github_url` | string | | — | [py][ent] | projects.github_url |
| `demo_url` | string | | — | [py][ent] | projects.demo_url |
| `documentation_url` | string | | — | [py][ent] | projects.documentation_url |
| `thumbnail_url` | string | | — | [py][ent] | projects.thumbnail_url |
| `tech_stack` | list<string> | | [] | [py][ent] | project_technologies |
| `license` | string(SPDX) | | — | [py][ent] | project_details.license |
| `version` | string | | — | [py][ent] | project_details.version |
| `tags` | list<string> | | [] | [py] | (经 content_relation 或新表,M0.5 定) |
| `relations` | list<relation> | | [] | [new] | content_relation |

**B. Part 清单**

| role | required | order | 正文落 | 对应 ent 旧字段 |
|---|---|---|---|---|
| `overview` | ✔ | 10 | item_part | project_detail_translations.detailed_description |
| `goals` | | 20 | item_part | project_detail_translations.goals |
| `challenges` | | 30 | item_part | project_detail_translations.challenges |
| `solutions` | | 40 | item_part | project_detail_translations.solutions |
| `lessons` | | 50 | item_part | project_detail_translations.lessons_learned |
| `quick_start` | | 60 | item_part | project_details.quick_start |
| `release_notes` | | 70 | item_part | project_details.release_notes |

> **最终裁决(账本 #9)**:`priority`/`complexity` 不进入 M0,也不保留为
> 后续候选。它们是项目管理排序属性,不是 silan-viking 的内容本体属性;
> 现有内容使用稀疏,而 `status` + `is_featured` 已足够支撑当前展示与筛选。
> 若未来真要项目管理视图,应作为独立需求重新建模,不借 project 主表偷渡。
>
> **裁决范围仅限 `project`**:`idea.priority`(§10.4.1)与 `update.priority`
> (§10.4.6)是 `[py]` 已有的真实字段,语义上是该 type 自身的内容属性
> (idea 的推进优先级、update 的重要程度),**保留**,不受账本 #9 波及。
> #9 只裁掉「为 project 主表新增一个未被使用的管理列」这一件事。

### 10.4.4 type: `episode`

> **最终裁决(账本 #1)**:episode 是**独立内容主表**,不是 `blog_posts`
> 的行。早期草案曾把 episode 塞进 `blog_posts` 用 `content_type=episode`
> 区分 —— 被推翻。理由:容器系列(`#5`:episode 强归属系列、不进 blog
> 列表)是一等概念;塞进 `blog_posts` 靠一个标记位区分,正是 `VISION.md`
> §3.1 说的「加特例、打补丁」,不优美。episode 独立成 type 才是「天然落进
> 本体论」。

**磁盘形态** —— episode 强归属一个容器系列,系列是目录层级:

```
content/resources/episode/<series-slug>/
├── series.toml                     # 容器系列的元数据(series identity)
└── <episode-slug>/                 # 每个 episode 是一个 Item
    └── parts/body/
        ├── meta.toml
        └── <lang>.md
```

**A. series.toml —— 容器系列元数据**

| 字段 | type | req | default | 来源 | 落库 |
|---|---|---|---|---|---|
| `series_id` | ulid | ✔ | (引擎生成) | [new] | blog_series.id 风格的独立表 |
| `title` | string | ✔ | — | [py] | episode_series.title + translation |
| `slug` | slug | ✔ | — | [py] | episode_series.slug |
| `description` | text | | — | [py] | episode_series.description |
| `status` | enum(ongoing,completed,archived) | ✔ | ongoing | [py] | episode_series.status |

**B. 每个 episode Item 的 frontmatter 字段**(落 `episodes` 独立表)

| 字段 | type | req | default | 来源 | 落库列 |
|---|---|---|---|---|---|
| `slug` | slug | ✔ | — | [py] | episodes.slug |
| `title` | string | ✔ | — | [py] | episodes.title + translation |
| `kind` | enum(episode) | ✔ | episode | [new] | — |
| `series` | string(slug) | ✔ | — | [py] | episodes.series_id → episode_series |
| `episode_number` | int | ✔ | — | [py] | episodes.episode_number |
| `status` | enum(draft,published,archived) | ✔ | draft | [py] | episodes.status |
| `visibility` | enum(private,unlisted,public) | ✔ | private | [new] | episodes.visibility |
| `published_at` | datetime | | — | [py] | episodes.published_at |
| `duration_minutes` | int | | — | [py] | episodes.duration_minutes |
| `relations` | list<relation> | | [] | [new] | content_relation |

**C. Part 清单**

| role | required | order | 正文落 |
|---|---|---|---|
| `body` | ✔ | 10 | item_part |

> **`#5` 不变量**:episode 强归属本系列,**不进 blog 列表** —— 因为 episode
> 是独立 type、独立表(`episodes`),它天然不在 `blog_posts` 查询结果里,
> 这个不变量由「独立表」结构保证,不靠过滤条件。这正是裁决 #1 选独立表的
> 收益:不变量从「记得加 WHERE content_type != 'episode'」变成结构性保证。
>
> Python episode parser 的 `status` 取值 `PUBLISHED/DRAFT/REVIEW/SCHEDULED`
> **作废** —— `REVIEW`/`SCHEDULED` 是工作流态,不是内容生命周期态;
> episode `status` 对齐内容生命周期三态 `draft/published/archived`。
> 排期发布用 `published_at` 未来时间表达。
>
> M0.5 新增 `episodes` + `episode_series`(+各 translation)独立表,见 `11`。

### 10.4.5 type: `resume`

> resume 是**单 Item**(`silan init` 建,不增不删,`02` §一)。它是 6 个
> type 里结构最复杂的 —— Python resume parser 解析 7 个块。

**A. frontmatter 字段**(落 `personal_info` 表)

| 字段 | type | req | default | 来源 | 落库列 |
|---|---|---|---|---|---|
| `full_name` | string | ✔ | — | [py][ent] | personal_info.full_name |
| `title` | string | ✔ | — | [py][ent] | personal_info.title |
| `kind` | enum(resume) | ✔ | resume | [new] | — |
| `visibility` | enum(private,unlisted,public) | ✔ | private | [new] | — |
| `current_status` | text | | — | [py][ent] | personal_info.current_status |
| `email` | string | | — | [py][ent] | personal_info.email |
| `phone` | string | | — | [py][ent] | personal_info.phone |
| `location` | string | | — | [py][ent] | personal_info.location |
| `website` | string | | — | [py][ent] | personal_info.website |
| `avatar_url` | string | | — | [py][ent] | personal_info.avatar_url |
| `social_links` | list<{platform,url,display_name}> | | [] | [py][ent] | social_links |

> resume 无 `status`(它不是生命周期内容);它有 `visibility` —— 简历可
> 选择不公开。
>
> **A 段字段的落库**:resume 顶层个人信息(full_name/email/…)是**单条
> 记录**,不是 entry_list —— 它保留落 `personal_info` 主表(+ translation)。
> `social_links` 是个小列表,**并进 `summary` Part 或 personal_info**,
> 不单独建表(同裁决 #2 精神:不为 resume 的子结构铺专用表)。
> `personal_info` 是 resume 这个单 Item 的内容主表,与裁决 #2「不为 resume
> 的**结构化 Part**建专用表」不矛盾 —— #2 针对的是 education 等 entry_list
> Part,不是 resume 的 Item 主表。

**B. Part 清单 —— 配置驱动的 `entry_list`(最终裁决 #2)**

> **最终裁决(账本 #2)**:早期草案曾把 resume 的 Part 写死成 7 个异构
> Part、各落一张专用 ent 表 —— **被推翻**。原裁决:
>
> > silan-viking 的核心是个人 context 内容系统,不是 HR 简历检索系统。
> > resume 的条目结构需要被校验、渲染、被 agent 安全编辑,但没有强需求做
> > 「按 institution/start_date/company 独立 SQL 查询」。为每个 Part 建独立
> > ent 表,会把 resume 变成 schema 扩展阻塞点:以后加 `talks`、`teaching`、
> > `patents`、`service` 都要改 Go ent、迁移、Rust entity、mapper、API。
> >
> > resume 的结构化 Part 使用 `entry_list` shape。`SCHEMA.md` 是条目字段
> > 真相源;Rust 负责把 markdown/frontmatter 解析为 schema-validated JSON
> > entry;DB 使用通用 `part_entry` / `part_entry_translation`。M0.5 不再
> > 新增 resume 专属 ent 表,旧 `education/work_experience/...` 表若保留,
> > 只能作为迁移期输入事实或二期 projection,不是新系统真相源。

**resume 的每个 Part 有一个 `shape`**:

| shape | 含义 | 语言文件扩展名 | 落库 |
|---|---|---|---|
| `prose` | 自由 markdown 正文(同 blog body) | **`<lang>.md`** | `item_part` + `item_part_translation` |
| `entry_list` | 一组同构条目的有序列表(N 条 education…)| **`<lang>.toml`** | `part_entry` + `part_entry_translation` |
| `key_value_list` | 分类键值列表(skills:`category: a, b, c`)| **`<lang>.toml`** | `part_entry`(payload 为 kv 结构)|

> **扩展名规则(载重契约 —— loader / parser / CLI 三处都按它)**:
> Part 的语言文件扩展名**由 `shape` 决定**,不是 Part 一律 `.md`:
> `shape=prose` → `<lang>.md`(内容是 markdown);
> `shape=entry_list` / `key_value_list` → `<lang>.toml`(内容是 TOML)。
> 文件名诚实反映内容格式。引擎 loader 读 `meta.toml` 的 `shape`、CLI
> `resume edit <part>` 打开文件,**都先查 `shape` 再决定扩展名** ——
> 不能假设 Part 文件总是 `.md`。
> blog/idea/project/episode/update 的 Part 全是 `prose`,故都是 `.md`;
> 只有 resume 有 `entry_list`/`key_value_list` 的 Part 用 `.toml`。

**resume 的 Part 清单**(全部在 `SCHEMA.md` 配置,加一种 Part 不改 Rust):

| role | required | order | shape |
|---|---|---|---|
| `summary` | ✔ | 10 | prose |
| `education` | | 20 | entry_list |
| `experience` | | 30 | entry_list |
| `publications` | | 40 | entry_list |
| `awards` | | 50 | entry_list |
| `research` | | 60 | entry_list |
| `skills` | | 70 | key_value_list |

> 未来加 `talks`/`patents`/`service` = 在 `SCHEMA.md` resume 的 parts 下加
> 一段 `{role, shape, entry_fields}` 配置。**不改 Rust、不加 ent 表、不写
> 迁移、不动 mapper/API。** 这是裁决 #2 选配置驱动而非专用表的根本收益。

**`entry_list` Part 的 `entry_fields` —— 条目字段的 declarative schema**

每个 `entry_list` Part 在 `SCHEMA.md` 里声明 `entry_fields`,它是该 Part
条目的**字段契约**。Rust sync 写库前**必须按它 validate**(payload 不是
无约束 blob —— 这是 silan 加的硬约束)。每个 entry_field 的属性:

```yaml
entry_fields:
  - { name: <字段名>, type: <field_type>, required: <bool>,
      translatable: <bool> }   # translatable=true → 落 part_entry_translation
```

- `translatable: false`(语言无关:date/url/logo/order/id)→ `part_entry`
  的 `shared_payload`(JSON)。
- `translatable: true`(语言相关:title/details/description)→
  `part_entry_translation` 的 `localized_payload`(JSON)。

**`education` Part 的 `entry_fields`**(字段来源 `[py][ent]`,详见
`archive/extraction-report.md`)

| 字段 | type | req | translatable | 旧 ent 列(仅迁移期参考)|
|---|---|---|---|---|
| `institution` | string | ✔ | ✔ | education.institution |
| `degree` | string | ✔ | ✔ | education.degree |
| `field_of_study` | string | | ✔ | education.field_of_study |
| `start_date` | date | | ✗ | education.start_date |
| `end_date` | date | | ✗ | education.end_date |
| `is_current` | bool | | ✗ | education.is_current |
| `gpa` | string | | ✗ | education.gpa |
| `location` | string | | ✔ | education.location |
| `institution_website` | string | | ✗ | education.institution_website |
| `institution_logo_url` | string | | ✗ | education.institution_logo_url |
| `details` | list<text> | | ✔ | education_details.detail_text |

> **「旧 ent 列」一列只在迁移期(`12`)有意义** —— 它告诉重排脚本数据从
> 哪来。新系统**不**落 `education` 表;`institution` 等进 `part_entry`。
>
**`experience` Part 的 `entry_fields`**

| 字段 | type | req | translatable | 旧 ent 列(仅迁移期参考)|
|---|---|---|---|---|
| `company` | string | ✔ | ✔ | work_experience.company |
| `position` | string | ✔ | ✔ | work_experience.position |
| `start_date` | date | | ✗ | work_experience.start_date |
| `end_date` | date | | ✗ | work_experience.end_date |
| `is_current` | bool | | ✗ | work_experience.is_current |
| `location` | string | | ✔ | work_experience.location |
| `company_website` | string | | ✗ | work_experience.company_website |
| `company_logo_url` | string | | ✗ | work_experience.company_logo_url |
| `details` | list<text> | | ✔ | work_experience_details.detail_text |

**`publications` Part 的 `entry_fields`**

| 字段 | type | req | translatable | 旧 ent 列(仅迁移期参考)|
|---|---|---|---|---|
| `title` | string | ✔ | ✔ | publications.title + publication_translations.title |
| `authors` | list<string> | | ✗ | publication_authors.author_name |
| `journal_name` | string | | ✔ | publications.journal_name + publication_translations.journal_name |
| `conference_name` | string | | ✔ | publications.conference_name + publication_translations.conference_name |
| `publication_type` | enum(journal,conference,workshop,preprint) | | ✗ | publications.publication_type |
| `publication_date` | date | | ✗ | publications.publication_date |
| `doi` | string | | ✗ | publications.doi |
| `url` | string | | ✗ | publications.url |
| `pdf_url` | string | | ✗ | publications.pdf_url |
| `citation_count` | int | | ✗ | publications.citation_count |
| `is_peer_reviewed` | bool | | ✗ | publications.is_peer_reviewed |
| `sort_order` | int | | ✗ | publications.sort_order |

**`awards` Part 的 `entry_fields`**

| 字段 | type | req | translatable | 旧 ent 列(仅迁移期参考)|
|---|---|---|---|---|
| `title` | string | ✔ | ✔ | awards.title + award_translations.title |
| `awarding_organization` | string | ✔ | ✔ | awards.awarding_organization + award_translations.awarding_organization |
| `award_date` | date | | ✗ | awards.award_date |
| `award_type` | string | | ✔ | awards.award_type + award_translations.award_type |
| `amount` | float | | ✗ | awards.amount |
| `description` | text | | ✔ | awards.description + award_translations.description |
| `certificate_url` | string | | ✗ | awards.certificate_url |
| `sort_order` | int | | ✗ | awards.sort_order |

**`research` Part 的 `entry_fields`**

| 字段 | type | req | translatable | 旧 ent 列(仅迁移期参考)|
|---|---|---|---|---|
| `title` | string | ✔ | ✔ | research_projects.title + research_project_translations.title |
| `start_date` | date | | ✗ | research_projects.start_date |
| `end_date` | date | | ✗ | research_projects.end_date |
| `is_ongoing` | bool | | ✗ | research_projects.is_ongoing |
| `location` | string | | ✔ | research_projects.location + research_project_translations.location |
| `research_type` | string | | ✔ | research_projects.research_type + research_project_translations.research_type |
| `funding_source` | string | | ✔ | research_projects.funding_source + research_project_translations.funding_source |
| `funding_amount` | float | | ✗ | research_projects.funding_amount |
| `details` | list<text> | | ✔ | research_project_details.detail_text |
| `sort_order` | int | | ✗ | research_projects.sort_order |

**`skills` Part 的 `key_value_list` 契约**

`skills` 不是 `entry_list`:它的真实形态是「分类 → 技能列表」,例如
`Languages = ["Rust", "Go", "Python"]`。源文件仍是 `parts/skills/<lang>.toml`,
但不用 `[[entry]]`;每个顶层 key 是分类名,值是 `list<string>`。

```toml
Languages = ["Rust", "Go", "Python"]
Systems = ["Linux", "SQLite", "MCP"]
```

落库时每个分类生成一条 `part_entry`:分类 key 是稳定条目 key;分类名进
`localized_payload.category`,技能数组进 `localized_payload.items`。当前
Go API 的 `resume.skills` 仍从 project technologies 派生,这是旧站点兼容
路径;M0 的 resume schema 以本 `key_value_list` 为准。

**`entry_list` Part 的源文件语法(最终裁决:TOML array-of-tables)**

> `prose` shape 的 Part 是 markdown(`<lang>.md`)。`entry_list` shape 的
> Part **不是 markdown** —— 一条条目是结构化数据,用 **TOML array-of-tables**。
> 文件名诚实反映内容:**`entry_list` Part 的语言文件是 `parts/<role>/<lang>.toml`**
> (不是 `.md`)。`meta.toml` 的 `shape` 字段告诉引擎按哪种解析。

```toml
# parts/education/en.toml  —— education 这个 entry_list Part 的英文变体
# 文件顶部无内容;每个 [[entry]] 块是一条 education。

[[entry]]
entry_id    = "e_01H8X7..."          # ★ 稳定锚点,引擎生成,见下
institution = "National University of Singapore"
degree      = "B.S. Computer Science"
start_date  = 2019-08-01
end_date    = 2023-05-01
gpa         = "4.8/5.0"
details     = [                       # list<text>,长文本用数组
  "Dean's List 2020–2023",
  "Final-year thesis on distributed consensus",
]

[[entry]]
entry_id    = "e_01H8X8..."
institution = "..."
# ...
```

**`entry_id` —— 条目的稳定锚点(评审 P1 裁决)**

- 每条 entry 有 `entry_id = "e_<ulid>"`,**引擎生成、终生不变**,写进
  entry 自己的 TOML 块。它之于 entry,等同 `PartID` 之于 Part。
- **为什么必须有**:没有它,重排、排序、agent 改单条 education 时没有
  稳定锚点,sync 只能 delete+insert 整个 Part —— 一改全表重写,且 agent
  提案的 `git diff` 噪声巨大。有 `entry_id`,sync 能精确定位「这一条变了」。
- `part_entry` 表加 `entry_id` 列 + `(item_part_id, entry_id)` 唯一约束
  (见 `11` §11.5.1)。
- **多语言对齐**:同一条 education 的 `en.toml` 和 `zh.toml` 用**同一个
  `entry_id`** —— 这是「这两条 TOML 块是同一条 education 的两个语言」的
  显式绑定,不靠数组下标对齐(下标会因增删错位)。
- 缺 `entry_id` 的处理同 `PartID`(`08`§8.2):`silan` 命令 / 离线重排
  脚本补,`index sync` 不偷偷生成回写。

### 10.4.6 type: `update`(第 6 个 type)

> **最终裁决(账本 #3)**:早期草案曾把 `update` 排除出 type 体系
> (理由是 `00` §0.2 字面写「5 type」)—— **被推翻**。最终裁决 `update`
> **保留为第 6 种 content type**。它有独立 parser、独立 `ContentKind::Update`、
> 独立 mapper。`recent_updates` 是它的内容主表,不是派生表。
>
> **连带影响(实施者注意)**:`00` §0.2 需求 #2 已更正为「6 type」;
> `01` 的 `ContentKind` 保留 `Update`;`04` 里程碑保留 6 个 parser /
> 6 个 mapper。后续文档不得再把 `update` 写成关系附属物或 resume 子块。

**A. frontmatter 字段**(落 `recent_updates` 表 + `recent_update_translations`)

| 字段 | type | req | default | 来源 | 落库列 |
|---|---|---|---|---|---|
| `slug` | slug | ✔ | — | [py] | recent_updates 需补 slug 列(M0.5)|
| `title` | string | ✔ | — | [py][ent] | recent_updates.title + translation |
| `kind` | enum(update) | ✔ | update | [new] | — |
| `update_type` | enum(见下) | ✔ | progress | [py] | recent_updates.type |
| `status` | enum(active,ongoing,completed) | ✔ | active | [py][ent] | recent_updates.status |
| `priority` | enum(high,medium,low) | | medium | [py][ent] | recent_updates.priority |
| `visibility` | enum(private,unlisted,public) | ✔ | private | [new] | (M0.5 新列)|
| `date` | date | ✔ | — | [py][ent] | recent_updates.date |
| `tags` | list<string> | | [] | [py][ent] | recent_updates.tags(JSON)|
| `relations` | list<relation> | | [] | [new] | content_relation |

**B. Part 清单**

| role | required | order | shape |
|---|---|---|---|
| `body` | ✔ | 10 | prose |

**C. `update_type` enum 裁决**

```
update_type: enum(milestone, achievement, progress, release,
                   announcement, insight, learning, reflection)
```
- 采 Python `update_parser` 的 8 值(Python 是唯一事实源 —— Go ent
  `recent_updates.type` 现有 enum 是 `work/education/research/publication/
  project`,语义不同,那是「更新关于什么」,不是「更新是什么类型」)。
- ⚠️ **实施者注意**:`recent_updates.type` 的 Go ent enum 与 Python
  `update_type` **语义冲突**,M0.5 要裁:`recent_updates` 表加一个新列
  承载 `update_type` 的 8 值,旧 `type` 列(work/education/…)的去留在
  `11` 处理。本条记为 M0.5 的一个修订点。

---

## 10.5 relations —— 关系声明语法与规范化

承 `01` §1.10 修订 A(`content_relation` 表)、`08` §8.2。

**frontmatter 里的 `relations` 声明语法**:

```yaml
relations:
  - { type: evolved_from, to: "silan://resources/ideas/rust-context-engine" }
  - { type: documents,    to: "silan://resources/projects/silan-viking" }
```

**relations 段在 SCHEMA.md 的定义**:

```yaml
relations:
  types: [evolved_into, evolved_from, documents, references, supersedes, part_of]
  # 规范化:有向边统一存成一个 canonical 方向,反向边查询时翻转
  canonical:
    evolved_from: { store_as: evolved_into, flip: true }
    evolved_into: { store_as: evolved_into, flip: false }
    documents:    { store_as: documents,    flip: false }
    references:   { store_as: references,   flip: false }
    supersedes:   { store_as: supersedes,   flip: false }
    part_of:      { store_as: part_of,      flip: false }
  ordered: [part_of]          # 这些关系类型用 content_relation.sort_order
```

- **F2 待定项关闭**(`04` 里程碑遗留):`idea_details.references`(自由文本)
  与 `content_relation` 的 `references` 边 —— **裁决:两者不同物**。
  `content_relation.references` 是 Item↔Item 的结构化引用边;
  idea 的 `reference` **Part 正文**(§10.4.1 Part 清单)是自由文本参考资料。
  前者进 `content_relation` 表,后者进 `item_part` 表。命名上 Part role
  用 `reference`(单数),关系类型用 `references`(复数),不撞。

---

## 10.6 错误分级

parser / CLI / MCP 校验内容时,错误按三级处理。`SCHEMA.md` 的 `errors` 段
定义每条规则的级别:

```yaml
errors:
  # fatal —— 阻断:该 Item 不进 RowSet,sync 报错退出
  fatal:
    - missing_required_frontmatter   # 缺 slug/title/status/visibility 等 req 字段
    - invalid_enum_value             # status 等 enum 取了非法值
    - kind_mismatch                  # 路径 type 与 frontmatter kind 不一致
    - slug_pattern_violation         # slug 不匹配 ^[a-z0-9][a-z0-9-]*$
    - missing_required_part          # 缺 required Part(idea 缺 overview)
    - missing_part_id                # meta.toml 无 part_id 且非首次 scaffold
    - relation_target_not_found      # relations.to 指向不存在的 Item
    - entry_field_violation          # entry_list/key_value_list Part 违反
                                     #   schema 契约(缺 required / 类型错)—— payload
                                     #   不是无约束 blob,sync 写库前必校验
  # warn —— 不阻断:Item 仍进 RowSet,但 sync 末尾汇总告警
  warn:
    - main_field_lang_mismatch       # zh 与 en 的语言无关字段(slug/date)冲突
    - empty_optional_part_dir        # parts/<role>/ 目录存在但无任何 <lang>.<ext>
    - unknown_frontmatter_field      # 出现 SCHEMA 未定义的字段(不报错,忽略)
  # info —— 仅记录:不影响 sync
  info:
    - canonical_lang_only            # Part 只有 canonical_lang 一种语言(无译文)
```

> **载重不变量**:`fatal` 错误使 sync 成为「全或无」—— 有 fatal 则该 Item
> 完全不写库,不留半行。承 `03` §3.1「主分支只有两态」的同一精神。

---

## 10.7 M0 验收清单

承 `08` §8.7 的 M0 完成定义,本章把它细化成可勾选项:

- [ ] `content/SCHEMA.md` 存在,含 §10.2 的六个顶层段。
- [ ] 6 个 type(idea/blog/project/episode/resume/update)各有完整 frontmatter
      字段表 + Part 清单,字段与本章 §10.4 一致。
- [ ] resume 每个 Part 标 `shape`(prose/entry_list/key_value_list);
      每个 `entry_list` Part 有完整 `entry_fields`, `skills` 有完整
      `key_value_list` 契约。
- [ ] §10.1 的 enum 冲突在 `SCHEMA.md` 里取裁决值(账本 #1–#9
      已全部定稿)。
- [ ] `status` 与 `visibility` 是两个独立字段,所有 type 一致。
- [ ] `relations` 段含 types / canonical / ordered。
- [ ] `errors` 段含 fatal/warn/info 三级。
- [ ] `engine/tests/fixtures/content/` 全部按 `parts/<role>/` 最新结构,
      无旧路径样例(`08` §8.7)。
- [ ] 每个字段可指回 `00` §0.2 的某条需求 `#`,或标 `[new]` 并给理由。

---

## 10.8 后续里程碑的契约依赖 —— 出口清单

> 评审明确:Go API 读取契约、MCP 实现级细节,**依赖 M0 SCHEMA 落地后
> 才有事实**。本节列「实现前必须核对什么」。MCP schema 与 promote
> DDL 已有实现级来源;Go API 读取矩阵初稿见
> `docs/backend-frontend-migration/01-后端迁移.md` §1.10,但仍必须等
> M0.5a 后从真实 `backend.api`/handler/ent 表名核对。

### 10.8.1 Go API 读取契约(M4/M9 前置,矩阵初稿待实码核对)

Rust sync 产出的 `portfolio.db` 要被 Go API 读。契约骨架:

- [ ] **逐 endpoint 表**:每个 `/api/v1/*` endpoint 依赖哪些表、哪些列、
      排序键、过滤语义 —— 待 SCHEMA 定稿 + M0.5 ent 落地后,从 Go API
      现有 handler 反向抽取,列成 endpoint↔表↔字段矩阵。
- [ ] **契约测试锚点**:`05` L4 契约测试要逐 endpoint 对拍,清单 = 上表。
- TODO owner:M4 验收出口。M4 生成 entities 后必须产出 endpoint↔表↔字段
  矩阵初稿,供 M5/M6 的 L4 对拍和 M9 site adapter 使用。

### 10.8.2 MCP 协议实现级细节(M9 前置,已定源)

实现级合同来源是 `03-mcp服务.md` §3.2。M8 验收只做一致性核对:

- [x] 每个 MCP tool 的 **JSON input/output schema**(参数名、类型、必填):
      `03` §3.2。
- [x] **错误码表**:权限失败 / 校验失败 / 找不到资源 各返回什么 code:
      `03` §3.2。
- [x] `initialize` 响应的 `instructions` 字段**确切内容模板**:`03` §3.2。
- [x] resource URI 列表(`silan://schema` 等)的 **MIME 类型与返回体**:
      `03` §3.2。
- [ ] M8 核对:按最终 `content/SCHEMA.md` 的 type/field 名回扫 `03` §3.2,
      不一致先改文档,再写 `silan-viking-mcp`。

### 10.8.3 deploy promote job 细节(M9 前置,已定源)

`08` §8.3 给策略,`11` §11.11 给实现级 SQL 顺序与白名单。M8 验收只做
真实表名核对:

- [x] **派生表白名单**确切表名清单:`11` §11.11 过渡态/终态两份。
- [x] promote 事务的 **DDL 顺序**:删派生表行 → 写新行 → 更新 sync_meta:
      `11` §11.11。
- [x] **失败回滚**:事务未提交即线上 DB 不变:`11` §11.11。
- [x] SQLite **WAL 模式 + busy_timeout**:`11` §11.11。
- [ ] M8 核对:用 M0.5a 后真实 ent 表名重扫白名单;新增/删改表必须先更新
      `11` §11.11,否则不得开 M9 deploy promote 实现。
