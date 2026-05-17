# 01 · OOP 结构

> 经多轮评审 + 分层定位要求,本章已收敛。
> 服务需求 `#2 #3 #4 #5 #6 #7 #9 #11 #13 #14 #15`。

## 1.1 分层定位 —— 四层,上层依赖下层

设计要求:明确哪些是 utils、哪些是 content,content 站在 utils 之上。
落成四层,**依赖严格单向(上 → 下),下层永不知道上层存在**:

```
┌──────────────────────────────────────────────────────────┐
│ L4  adapter   silan-viking-cli / -mcp / -site             │ 对外的脸
│               CliAdapter · McpAdapter · SiteProjector     │
├──────────────────────────────────────────────────────────┤
│ L3  app       silan-viking-app                            │ 行为 / 能力
│               Workspace(聚合根)· Parser · Mapper ·       │ 解析·映射·写库·检索
│               Sink · Embedder                             │
├──────────────────────────────────────────────────────────┤
│ L2  content   silan-viking-content                        │ 领域数据
│               Namespace · Collection · Item · Part ·      │ 纯数据,
│               File · Manifest · Relation · Series ·       │ 不解析/不 IO
│               Anthology                                   │
├──────────────────────────────────────────────────────────┤
│ L1  base      silan-viking-base                           │ 纯工具
│               SilanUri · Meta · ContentHash · Lang ·      │ 无领域知识,
│               Slug · «trait» Identified                   │ 可搬到任何项目
└──────────────────────────────────────────────────────────┘
         ▲ crate 依赖只能向下;cargo 编译期保证无回边
```

**层的判定标准**(「定位」的硬规则,新东西放哪层照此判):

| 层 | 判定:属于本层 ⟺ | 不属于本层的反例 |
|---|---|---|
| L1 base | 不知道 blog/idea 是什么;搬到别的项目仍可用 | `Collection`(知道 type)→ 不在 L1 |
| L2 content | 是领域**数据**;知道 blog/idea;但**不解析、不 IO、不校验** | `Parser`(是行为)→ 不在 L2 |

> L2 内部有层级:`Namespace`(silan:// 一棵树)⊃ `Collection`(一个 type)
> ⊃ `Item` ⊃ `Part` ⊃ `File`。`Namespace` 是 L2 的**顶层结构**,见 §1.2.1。
| L3 app | 是**能力/行为**:解析、映射、写库、检索、编排 | `SilanUri`(纯工具)→ 不在 L3 |
| L4 adapter | 是对外接口形态:CLI / MCP / 网站投影 | `Workspace`(编排)→ 不在 L4 |

## 1.2 「content 继承 base」—— Rust 落地机制

设计要求的「content 继承 utils」,Rust 没有 class 继承,落地机制是
**底层定 trait,content 层 `impl` 它**:

- **L1 base 定义基础 trait** —— 行为契约,不含领域知识。
- **L2 content 的类型 `impl` 这些 trait** —— 这就是「继承抽象」。
- content 的数据结构再用 base 的**值类型**组装自己(组合)。

```
L1 base:   pub trait Identified  { fn uri(&self) -> &SilanUri; }
           pub trait HasMeta     { fn meta(&self) -> &Meta; }

L2 content:  impl Identified for Collection { ... }   ← content 继承 base 的能力
             impl Identified for Item       { ... }
             impl Identified for File       { ... }
             // Item 内部:  uri: SilanUri,  meta: Meta   ← content 组装 base 的数据
```

> 数据共性 trait(`Identified`/`HasMeta`)在 L1;**校验是行为,不在数据上 ——
> 下沉到 L3 `Parser`**。
> 数据族与能力族,不共一个祖先。

## 1.2.1 Namespace —— 两个命名空间(resources / agent)

> 早期 `Namespace` 抽象在拆分文档时丢了,只剩 `silan://resources/...`。本节
> 把它补回 —— `content/` 不是只有发布内容,它有**两个命名空间**。

`silan://` 协议下,`content/` 分两个**命名空间**,各是一棵独立的内容树:

```
silan://resources/...     发布内容 —— blog/ideas/projects/episode/resume/update
                          ★ 可被 SiteProjector 选择性投影到网站(#11 #13)

silan://agent/...         agent 的 context —— agent 对这个项目/对 owner 的理解、
                          工作笔记、记忆、会话摘要
                          ★ 永不发布;SiteProjector 绝不碰它
```

磁盘上(承 §0.4 / §6.2.3):

```
content/
├── SCHEMA.md
├── resources/            ← 命名空间①:发布内容
│   └── blog/ ideas/ projects/ episode/ resume/ update/
└── agent/                ← 命名空间②:agent context,永不发布
    ├── project/          agent 对本项目的理解(读 resources/ 后沉淀)
    ├── notes/            agent 的工作笔记 / 任务记忆
    ├── owner/            agent 对 owner 的理解(偏好/风格/判断方式)
    └── sessions/         agent 与 silan 历次对话的摘要(会话末沉淀)
```

### 对象模型 —— `Namespace` trait,两个实现

| 对象 | 是什么 | 关键不变量 |
|---|---|---|
| `«trait» Namespace` | 一棵内容树的抽象;`Workspace` 持有多个 | 每个有 `root_uri()`;有 `is_publishable()` / `accepts_direct_write()` 能力探询 |
| `ResourceNamespace` | `silan://resources/` —— 发布内容 | `is_publishable()==true`(可投影);`accepts_direct_write()==false`(agent 改它走提案,§3.1)|
| `AgentNamespace` | `silan://agent/` —— agent context | `is_publishable()==false`(**SiteProjector 永不碰**);`accepts_direct_write()==true`(agent 直接读写,不走提案)|

**两条载重不变量**:

1. **`AgentNamespace.is_publishable() == false`** —— `SiteProjector`(§1.6.1)
   只投 `ResourceNamespace` 里 `visibility=public` 的 Item;`agent/` 整个
   命名空间在投影逻辑里**不可达**。agent context 永不上网站。
2. **`accepts_direct_write` 决定改法**:`resources/` 是发布内容,agent 改它
   走提案(`03` §3.1);`agent/` 是 agent 自己的记忆,agent **直接读写**——
   这与 §3.1「记忆类直接改、内容类走提案」一致,`agent/` 就是那个「记忆类」。

**两个命名空间的内部组织不同 —— 别套同一条链**:

- `ResourceNamespace` 走严格四层:`Collection(type)→Item→Part→File`(§1.3)
  —— 因为发布内容要进数据库、要投影到网站,结构必须规整。
- `AgentNamespace` **不套这条链**。`agent/` 下的 `project/` `notes/` `silan/`
  `sessions/` 是**分类目录**,不是 `Collection`(它们不是 type、无 SCHEMA
  的 Part 配置)。目录内就是自由组织的 markdown 文件 —— agent 的记忆不需要
  Item/Part 那套规整结构,它要的是「能读能写、跨会话留存」。
- 共同点:都是 markdown、都在同一个 Git 仓。区别:`resources/` 结构规整
  (要落库),`agent/` 结构自由(只给 agent 自己读写)。

> `agent/` 是 silan 项目的一部分,只是不发布、不进 `portfolio.db`
> (`silan index sync` 只扫 `resources/`)。agent 跨会话的连续性靠它:
> 新 agent 接入,读 `agent/` 就接上了上一个 agent 的理解(`00` 终局「context 增强」)。

## 1.3 L2 content —— 领域数据对象(对应 #2 #3 #4 #5)

> 本节经两次修正。第一次:`File` 被钉死成"语言变体",补 `Part` 分出 tab。
> 第二次(本版):评审指出 **`File == Identity`** 是结构性硬伤 —— Part 的
> identity 靠 `stem` 推断、语言靠 `suffix` 推断,文件一 rename 语义链就断,
> 部分翻译 / stale 追踪 / merge 全做不了。修正:**`Part == Identity,
> File == Representation`** —— Part 有稳定的 `PartID`,语言变体只是它的
> representation。演进路线见 §1.3.2。

`ResourceNamespace`(`silan://resources/`)的内容模型是
**Collection → Item → Part → File** 四层:

```
 ResourceNamespace
   └─▶ Collection ──含N个──▶ Item ──由N个──▶ Part ──含N个──▶ File
       一个 type 目录        一个条目        一个语义部分      一个语言变体
       blog/ideas/...        + Manifest      ★有稳定 PartID★    (representation)
```

**`Part` 是 identity 的载体,不是文件名**:

- 一个 `Part` 有 `PartID`(`p_<ulid>`,引擎生成,写进 `meta.toml`)——
  **rename / move 文件都不影响 identity**。`role`(overview/progress…)是
  它的语义类型,但 identity 是 `PartID`,不是 `role`、更不是文件名。
- `Part` 下的多个 `File` 是**同一个语义部分的不同语言 representation** ——
  `en.md` / `zh.md` 是 Part `p_xxx` 的两个变体,它们的语言关系由**同处一个
  Part 目录**显式确立,不靠文件名 stem 相似度猜。
- idea 的 Part:overview / progress / reference / result —— 前端四个 tab。
- blog 的 Part:只一个 body。
- resume 的 Part:**不是单 body** —— 它是单 Item + 多 Part,每个 Part 有
  `shape`(prose / entry_list / key_value_list),结构化 Part(education /
  experience / …)用 `entry_list`,见 §1.5.1(最终裁决,见 10§10.4.5、
  10§10.1.1 账本 #2)。

**为什么必须 Part==Identity**(评审列的炸点,逐条对应):
- rename `parts/progress/zh.md → parts/progress/zh-Hans.md`:`PartID` 不变,语义链不断。
- `parts/overview/en.md` 与 `parts/overview/zh.md` 语义同一:它们在同一个 Part 目录下,
  靠 `PartID` 绑定,不靠 stem。
- 部分翻译 / stale 追踪:`meta.toml` 留了 `canonical_lang` / `translation_of`
  / `source_hash` / `stale` 字段位(§1.3.1),identity 稳定才追得动。

| L2 对象 | 是什么 | 需求 | 不变量 |
|---|---|---|---|
| `Collection` | 一个 type 目录,落盘 `content/resources/{type}/`(blog/projects/ideas/episode/resume/update,共 6 type)| #2 | 隶属 `ResourceNamespace`;由 collection 级 Manifest 注册其 Item |
| `Item` | 一个条目(目录 + 若干 Part + 一份 Manifest)| #2 | `kind: ContentKind` 区分种类 |
| `ContentKind` | 枚举:`Blog/Project/Idea/Episode/Update/Resume` | #2 | Item 的分型字段 |
| `Part` | 一个语义部分 / 前端一个 tab | #2 | **有稳定 `PartID`**;identity 不绑文件名;`role` 是语义类型 |
| `PartID` | 值对象,`p_<ulid>` | #2 | 引擎生成,终生不变,写 `meta.toml` |
| `File` | `Part` 的一个语言 **representation**(一个 `<lang>.<ext>`)| #2 | `lang` 由文件名确定;`<ext>` 由 `Part.shape` 决定 —— `prose`→`.md`,`entry_list`/`key_value_list`→`.toml`(见 §1.3.1 与 10§10.4.5)|
| `Relation` | 有向有类型的边(`from`/`to`/`type`)| #4 | `type` 封闭枚举(§1.10 修订 A)|
| `Series` | 容器系列:`episode/<series-slug>/` 下有序 `Item` | #3 #5 | episode 强归属本系列;episode 是独立 type、独立表(`episodes`/`episode_series`),天然不进 blog 列表(最终裁决,见 10§10.4.4)|
| `Anthology` | 松散合集:按序引用散落 Item | #3 | 被引 Item 仍独立 |

> 命名:`Collection` = type 目录(物理);`Anthology` = 合集语义。不撞名。

### 1.3.1 Part 的磁盘形态与可配置文件树(对应 #2)

**磁盘形态** —— Part 是一个目录,identity 在 `meta.toml`,语言变体是目录下
的 `.md`:

```
content/resources/ideas/rust-context-engine/
├── .silan-cache                  # ItemManifest
└── parts/
    ├── overview/
    │   ├── meta.toml              # ★ Part identity 在这里
    │   ├── en.md                  # 语言变体(representation)
    │   └── zh.md
    └── progress/
        ├── meta.toml
        └── en.md
```

`meta.toml` —— Part 的 identity 与翻译元数据:

```toml
# parts/overview/meta.toml
part_id        = "p_01H8X7..."     # ★ 引擎生成的 ULID,终生不变,rename 不影响
type           = "overview"        # 语义类型(= SCHEMA type 定义里的 role)
canonical_lang = "en"              # 哪个语言是源、其余是它的翻译

# 以下字段第一阶段「留好字段位、值留空」,第二阶段才填(§1.3.2):
# [variants.zh]
# translation_of = ""              # 译自哪个语言
# source_hash    = ""              # 译自的源版本 hash —— 源变了 → stale
# stale          = false           # 源更新但本译文没跟 → true
```

`canonical_lang` 也是该 Part 的 **main 字段来源**。`slug`、日期、enum、
url、bool 等语言无关字段只从 canonical 语言文件读取;其它语言文件里的同名
字段一律忽略并报 `warn: main_field_lang_mismatch`。不做跨语言“谁赢”的
仲裁,否则 parser 会把翻译差异变成状态机复杂度。

**可配置文件树** —— 每种 type 有哪些 `Part`,定义在 `content/SCHEMA.md`,
不写死代码。加 tab = 改配置:

```yaml
# content/SCHEMA.md 内,type 定义(M0 定稿)
types:
  idea:
    parts:
      - { role: overview,  required: true  }
      - { role: progress,  required: false }
      - { role: reference, required: false }
      - { role: result,    required: false }
  blog:
    parts:
      - { role: body,      required: true  }
  # project / episode / update 同理(单/多 prose Part)
  resume:
    parts:                                  # resume 的 Part 带 shape
      - { role: summary,      required: true,  shape: prose      }
      - { role: education,    required: false, shape: entry_list }
      - { role: experience,   required: false, shape: entry_list }
      # publications / awards / research(entry_list)、skills(key_value_list)同理
```

> resume 的 Part 多一个 `shape` 字段(`prose` / `entry_list` /
> `key_value_list`)—— `prose` Part 的语言文件是 `<lang>.md`,`entry_list`
> Part 的是 `<lang>.toml`(TOML array-of-tables),`key_value_list` Part
> 的也是 `<lang>.toml`(TOML 顶层分类 key → list)。详见 §1.5.1 与
> 10§10.4.5(最终裁决,见 10§10.1.1 账本 #2)。

> 注意:type 定义里**不再有 `stem`** —— Part 是 `parts/<role>/` 目录,
> 不靠文件名 stem。`role` 即目录名;`PartID` 在 `meta.toml`;语言变体是
> 目录下的 `<lang>.<ext>`(`ext` 由 `shape` 定,见下)。`stem` 那套
> (评审 R2 时引入)已被 `parts/<role>/` + `meta.toml` 取代。

**parser 配置驱动**:`Parser` 读 type 定义的 `parts` 列表 → 进每个
`parts/<role>/` 目录 → 读 `meta.toml` 拿 `PartID` 和 `shape` → 把目录下每个
语言文件作为该 Part 的一个语言 representation 解析进 `Parsed`(§1.8.0)。
**语言文件的扩展名由 `Part.shape` 决定**:`prose` shape → `<lang>.md`
(markdown 正文);`entry_list` / `key_value_list` shape → `<lang>.toml`
(前者是 TOML array-of-tables,后者是 TOML 顶层分类 key → list)。
parser 按 `shape` 选解析路径,不假设 Part 文件总是 `.md`
(blog/idea/project/episode/update 全 `prose` 故都是 `.md`;只有 resume 有
`entry_list`/`key_value_list` 的 Part 用 `.toml`)。

### 1.3.2 多语言模型的三阶段演进路线

> Part==Identity 是地基。完整的 AI-native 多语言能力分三阶段落地,
> 本设计**第一阶段**,但结构为后两阶段留好位。

| 阶段 | 做什么 | 本设计状态 |
|---|---|---|
| **一(本期)** | `PartID` 解绑 identity 与文件名;`parts/<role>/meta.toml` 落地;`canonical_lang` 填值 | ✅ 本节已定 |
| **二** | `meta.toml` 的 `translation_of` / `source_hash` / `stale` 填值 + 校验逻辑 —— 源变了自动标译文 stale,支持 translation invalidation | 🔲 字段位已留(§1.3.1),逻辑待实现 |
| **三** | block-level lineage —— Part 内拆 block,每个 block 有 variant,做段落级 semantic identity / 增量翻译 / 对齐 | 🔲 未来;第二阶段稳定后再评估 |

> 为什么不一步到位 block graph:它太重,且第一阶段(identity 解绑)就已
> 解决"rename 断链 / 语义同一认不出"这些**会立刻炸**的问题。第二阶段解决
> stale 追踪,第三阶段才碰段落级。每阶段最小改动、独立可验收。

## 1.4 注册表 —— 三个层级,各管一层

> `ResourceNamespace` 下 `Collection → Item → Part → File` 四层(§1.3),
> **每一层的「这一级有哪些下级」由该级自己的注册文件记录**。三个注册文件,
> 职责严格不重叠 —— 一个管「有哪些」,下一级再管「这个是什么」。

| 注册文件 | 落盘位置 | 注册什么 —— 即「列出本级有哪些**下一级**」|
|---|---|---|
| `CollectionManifest` | `content/resources/{type}/.silan-cache` | 该 Collection 下所有 **Item** 的清单(slug + 排序 + status)|
| `ItemManifest` | `content/resources/{type}/{item}/.silan-cache` | 该 Item 下所有 **Part** 的清单(role 列表)+ 同步元数据 |
| `Part` 的 `meta.toml` | `content/resources/{type}/{item}/parts/{role}/meta.toml` | **单个 Part 自己是什么**:`part_id`(ULID)/ `canonical_lang` / 各语言变体(§1.3.1)|

**职责边界(载重,杜绝重叠)**:

- `ItemManifest` **只列 Part 的 role 清单** —— 它回答「这个 Item 有 overview /
  progress 哪几个 tab」。它**不碰** Part 内部:不管 `part_id`、不管语言、不管
  Part 正文。
- `Part` 的 `meta.toml` **管单个 Part 的 identity 与语言** —— 它回答「这个
  overview Part 的 `part_id` 是什么、主语言是哪个、有哪些译文」。它**不知道**
  同 Item 还有别的 Part。
- 一句话:`ItemManifest` 管「有哪些 Part」,`meta.toml` 管「这个 Part 是什么」。
  `File`(`<lang>.md` 或 `<lang>.toml`,按 shape)无独立注册 —— 它由所属
  `Part` 的 `meta.toml` 的语言
  列表覆盖。

**数据结构**(L2 content,各类型字段完整,不混):

```rust
pub enum Manifest {
    Collection(CollectionManifest),  // 注册某 Collection 下所有 Item
    Item(ItemManifest),              // 注册某 Item 下所有 Part(只 role 清单)
}
// Part 的 meta.toml 是 Part 自己的元数据,不是 Manifest 的一种 —— 它属于
// Part 对象本身(§1.3.1),由 PartMeta 类型承载。
```

**三个注册文件各由谁写(最终裁决,已定)**:

| 文件 | 谁写 | 可见性 |
|---|---|---|
| `CollectionManifest`(`.silan-cache`)| **引擎派生** —— 扫 `content/` 生成,`silan index rebuild` 可全量重建。silan/工具不手写。 | crate 私有构造 |
| `ItemManifest`(`.silan-cache`)| **引擎派生** —— 同上,扫 Item 目录的 Part 生成。 | crate 私有构造 |
| `Part` 的 `meta.toml` | **可编辑契约** —— silan 和 agent 可手写/编辑。但 `part_id` **只能由 `silan init` / `silan add-part` / 离线重排工具生成**,`index sync` **不隐式写回 `part_id`**(否则 sync 从只读变成隐式改真相源,`08`§8.2)。`canonical_lang` 人写。 | `PartMeta` `pub` 可构造 |

> **载重不变量**:`.silan-cache`(两个 Manifest)是**派生物** —— 删掉能
> 从 `content/` 重建,故进 `.gitignore`、不进真相源 Git 历史;`meta.toml`
> 是**真相源的一部分**(进 Git),因为它持 `part_id` 这个稳定 identity。
> 这条区分决定 Manifest 类型 crate 私有(引擎独占构造)、`PartMeta` 类型
> `pub`(人和 agent 经它编辑)。
>
> 这是 `04` 里程碑曾列的「§1.4 待定」—— 已由最终评审裁定关闭。

## 1.5 L3 app —— 能力对象 + 公私可见性

L3 是**行为**层。每个对象**显式标注方法可见性**。Rust 里这不是
注释约定,是 `pub` / `pub(crate)` / 私有。原则是:trait 只表达外部稳定
契约,解析细节留在具体 struct 的私有 `impl`。

**Rust 事实**:Rust 的 trait **没有"私有方法"** —— trait 里的
method 都是该 trait 的公开契约。所以 `extract_*`/`analyze_*`
**不放进 `Parser` trait**,它们是各具体 parser struct(`BlogParser` 等)
`impl` 块里的**私有 `fn`**。
trait 只暴露三个契约方法:

```rust
// L3 silan-viking-app —— «trait» Parser,只暴露稳定 public 面
pub trait Parser {
    fn content_type(&self) -> ContentKind;
    fn parse(&self, item: &Item) -> Result<Parsed, ParseError>;   // 唯一入口
    fn validate(&self, parsed: &Parsed) -> Vec<Issue>;            // 校验属于此处
}

// 各具体 parser 的实现细节,是 struct 自己的私有 fn —— 不在 trait 上。
struct BlogParser { /* ... */ }
impl BlogParser {
    fn extract_sections(&self, body: &str) -> Sections { /* 私有 */ }
    fn content_hash(&self, file: &File) -> ContentHash { /* 私有 */ }
    // extract_* / analyze_* / *_hash:全是 struct 私有 fn
}
impl Parser for BlogParser { /* 只实现三个契约方法 */ }
```

| L3 对象 | 角色 | public 方法 | 私有 |
|---|---|---|---|
| `«trait» Parser` | 解析策略接口 | `content_type` / `parse` / `validate` | —(trait 无私有方法)|
| 具体 parser struct(`BlogParser` 等)| 具体 type 的解析策略 | impl `Parser` 三方法 | `extract_*` / `analyze_*` / `*_hash` 等私有 `fn` |
| `ParserRegistry` | parser 策略集 | `get(kind) -> Result<&dyn Parser, ParseError>` / `parser_for(item)` | 编译期闭集分派,无运行时注册 |
| `Parsed` | parser 产物 | 字段只读 getter | 构造经 `Parser`,外部不能裸建 |
| `«trait» Mapper` | sync 映射策略 | `content_type` / `map(&Parsed) -> RowSet` | 内部辅助私有 |
| `MapperRegistry` | mapper 策略集 | `get(kind) -> Result<&dyn Mapper, MapError>` / `mapper_for(parsed)` | 与 ParserRegistry 同构,编译期闭集分派 |
| `«trait» Sink` | 落库端口 | `write(&RowSet)` / `write_batch(RowSetBatch)` | 各实现内部 |
| `SqliteSink` | — | `write` | SQL 语句、连接 |
| `«trait» Embedder` | — | `embed(&str)` | 模型/HTTP 细节;不在 M5/M6 parser/sync 主链路 |
| `Workspace`(聚合根)| — | `scan` / `sync` / `query` / `propose` / `publish` | 持有 `namespaces: Vec<Box<dyn Namespace>>`(每个 Namespace 再含 Collection)+ `relations`;字段不 `pub`(构造经 `open()`);`canonicalize_relations` 私有(§1.8.2)|

### 1.5.Q `Workspace::query` / `Embedder` 的最小实现合同

`recall(query)` 需要语义检索,但它不能把 M5/M6 parser/sync 主线拖进模型选择。
因此查询能力按两层实现,并把默认实现钉死为 SQLite FTS5,不再留给实现者选型:

1. **M6 之前**:`Workspace::query` 只提供结构化查询(`list`/`read`/字段过滤),
   不承诺语义相似度。
2. **M7 交付**:补 `QueryIndex` + `Embedder`。默认实现是 **SQLite FTS5
   lexical index + `NullEmbedder`**,保证离线可跑、测试确定;可选
   `ApiEmbedder` 只通过配置开启,不作为默认依赖。M7 不引入 Tantivy、
   Qdrant、LanceDB 等新运行时依赖。

```rust
pub trait Embedder {
    fn embed(&self, text: &str) -> Result<Vec<f32>, QueryError>;
}

pub struct QueryHit {
    pub uri: SilanUri,
    pub title: String,
    pub summary: String,
    pub score: f32,
    pub matched_parts: Vec<String>,
}
```

#### QueryIndex 表结构与索引内容

`QueryIndex` 是 `silan-viking-app::query` 模块里的服务对象,底层复用
`portfolio.db`。M7 新增两张派生查询表,由 `sync` 重建/增量更新:

```sql
CREATE VIRTUAL TABLE query_fts USING fts5(
  uri UNINDEXED,
  kind UNINDEXED,
  title,
  tags,
  headings,
  body,
  status UNINDEXED,
  visibility UNINDEXED,
  updated_at UNINDEXED,
  tokenize = 'unicode61'
);

CREATE TABLE query_embedding (
  uri TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  vector BLOB NOT NULL
);
```

- `query_fts.uri` 指到 Item 或 Part URI;Part 粒度优先,Item 级摘要作为兜底。
- `title` 来自 Item title + Part title;`tags` 来自 frontmatter/tag relation;
  `headings` 来自 Markdown heading;`body` 是去 frontmatter 后的正文纯文本。
- `body` 单条截断到 20k 字符,避免一篇长文压垮 FTS;完整内容仍由 `read(uri)` 读。
- `query_embedding` **可选**。默认不建向量;配置开启 `ApiEmbedder` 后才写入。
  `vector` 是 little-endian `f32` 数组 BLOB,维度由 `dim` 校验。

`Workspace::query` 的排序规则:

1. 先查 FTS5:`title/tags/headings/body` 的 BM25 分数作为 lexical score。
   加权规则固定:title 命中 ×3,tags ×2,headings ×1.5,body ×1。
2. 若配置了可用 `Embedder`,查 `query_embedding` 做 cosine 召回 top N。
3. 融合采用 RRF(reciprocal rank fusion):`1/(60 + lexical_rank)` +
   `1/(60 + vector_rank)`;没有 vector 时只用 lexical rank。
4. 若 `Embedder` 不可用或返回错误,降级 lexical-only,并在 span 上记录
   `embedder="fallback"`;不让 `recall` 因模型/网络失败整体不可用。
5. `scope` 过滤先于排序,只允许 `silan://resources/...` 与
   `silan://agent/...` 两个 namespace;未知 namespace 返回 `invalid_request`。

#### lexical fallback 与语义召回的体验边界

M7 的默认 `NullEmbedder` 只保证 **lexical fallback 可用**,不是“语义记忆”
已经完成。实现者必须按下面三条写清楚能力边界:

- lexical fallback 的验收只覆盖关键词、标题、tag、heading、正文片段命中。
  它能回答“上次那篇 Kubernetes 笔记在哪”,不能可靠识别“同一个念头换了
  说法”。
- 终局体验里的“过几天又提到它,agent 知道这不是新念头”依赖可用
  `Embedder`。如果没有 `ApiEmbedder` 或未来的 `LocalEmbedder`,agent
  只能靠关键词撞上旧 Item。
- `Embedder` 是可选 adapter,但**不是高级体验可选件**。产品口径要写:
  离线默认 = 确定、可测、关键词召回;语义记忆 = 配置 Embedder 后开启。

验收边界:语义检索质量不在 M5/M6;M7 只要求 `05` 的已知 query 能命中预期
Item,且无网络环境下同样通过。真正换本地模型或远程模型属于可替换 adapter,
不改变 `Workspace::query` 与 MCP `recall` 的 JSON 合同(`03`§3.2)。M7
验收报告必须显式标注当前运行的是 `NullEmbedder`、`ApiEmbedder` 还是
`LocalEmbedder`,避免把 lexical fallback 误报成语义召回。

**公私划分总规则**(新方法照此判):
- **public** ⟺ 别人(adapter、调用方)依赖的契约。改它 = 破坏兼容。
- **`pub(crate)`** ⟺ 同 crate 别的模块要用,但不对最终用户暴露。
- **私有** ⟺ 提取/计算/分析/IO 细节。换实现不该惊动任何人。
- 状态结构体**无 `pub` 字段**;构造经构造函数 / `open()`,依赖由参数注入。

### 1.5.0 装配层 —— Registry / kind 判别 / `Parsed` 构造边界

> 这一节补的是机器怎么拼起来,不是 parser 内部怎么提取字段。设计目标:
> **闭集、显式、可测试、无生命周期花活**。6 个 content type 是 M0
> SCHEMA 的闭集;Part 可配置,但 Parser/Mapper 的 type 分派不运行时扩展。

#### `ContentKind` 从哪里来

`ContentKind` 不从 parser 猜,也不由 registry 读文件。判别发生在
`Workspace::scan`:

1. `scan` 遍历 `content/resources/{type}/{item}/`。
2. `{type}` 目录名解析成 `ContentKind`。这是 dispatch 的主来源。
3. `Item` 构造时写入私有字段 `kind: ContentKind`;外部只能读
   `item.kind()`。
4. frontmatter 里的 `kind` 是冗余自检字段:若存在且与目录 kind 不一致,
   parser 报 `fatal: kind_mismatch`;若缺失,按 SCHEMA required 规则报错。

```rust
// silan-viking-content
pub struct Item {
    id: ItemId,
    kind: ContentKind,
    slug: Slug,
    parts: Vec<Part>,
}

impl Item {
    pub fn kind(&self) -> ContentKind { self.kind }
    pub fn parts(&self) -> &[Part] { &self.parts }
}
```

这条链路保证 `ParserRegistry` 是纯分派对象,不碰磁盘、不读 frontmatter、
不承担 schema 校验。

#### `ParserRegistry` 的最终形态

`ParserRegistry` 是 `silan-viking-app` 的普通 struct,不是 trait。它不提供
运行时 `register()`。原因:content type 是闭集,运行时注册会把错误从编译期
推迟到运行期,还会引入无意义的 `Box<dyn Parser>` 生命周期管理。

```rust
// silan-viking-app/src/parser/registry.rs
pub struct ParserRegistry {
    idea: IdeaParser,
    blog: BlogParser,
    project: ProjectParser,
    episode: EpisodeParser,
    resume: ResumeParser,
    update: UpdateParser,
}

impl ParserRegistry {
    pub fn new() -> Self {
        Self {
            idea: IdeaParser::default(),
            blog: BlogParser::default(),
            project: ProjectParser::default(),
            episode: EpisodeParser::default(),
            resume: ResumeParser::default(),
            update: UpdateParser::default(),
        }
    }

    pub fn get(&self, kind: ContentKind) -> Result<&dyn Parser, ParseError> {
        Ok(match kind {
            ContentKind::Idea => &self.idea,
            ContentKind::Blog => &self.blog,
            ContentKind::Project => &self.project,
            ContentKind::Episode => &self.episode,
            ContentKind::Resume => &self.resume,
            ContentKind::Update => &self.update,
        })
    }

    pub fn parser_for(&self, item: &Item) -> Result<&dyn Parser, ParseError> {
        self.get(item.kind())
    }
}
```

找不到 parser 不 panic。若未来 `ContentKind` 新增枚举而 registry 未更新,
Rust 的 `match` 穷尽性让编译失败;若从磁盘读到未知 type 目录,错误发生在
`Workspace::scan` 的 `ContentKind::try_from_dir_name`,返回
`ScanError::UnknownContentKind`。

#### `Parsed` 只能由 parser builder 产出

`Parsed` 是 parser 的不可变产物,不是全 crate 都能随便拼的 DTO。最终规则:

- `Parsed` 字段全私有,对外只有 getter。
- `Parsed::builder(...)` 与 builder 的 mutator 只在 `crate::parser` 可见。
- 具体 parser 用 builder 组装;`finish()` 一次性校验不变量后返回 `Parsed`。
- Mapper 只能读 `Parsed`,不能补字段、不能修 parser 的产物。

```rust
// silan-viking-app/src/parser/parsed.rs
pub struct Parsed {
    kind: ContentKind,
    item_id: ItemId,
    main: LangNeutral,
    langs: BTreeMap<Lang, LangVariant>,
    relations: Vec<RelationDecl>,
}

impl Parsed {
    pub fn kind(&self) -> ContentKind { self.kind }
    pub fn item_id(&self) -> ItemId { self.item_id }
    pub fn main(&self) -> &LangNeutral { &self.main }
    pub fn langs(&self) -> &BTreeMap<Lang, LangVariant> { &self.langs }
    pub fn relations(&self) -> &[RelationDecl] { &self.relations }

    pub(in crate::parser) fn builder(kind: ContentKind, item_id: ItemId) -> ParsedBuilder {
        ParsedBuilder::new(kind, item_id)
    }
}

pub(in crate::parser) struct ParsedBuilder { /* private fields */ }

impl ParsedBuilder {
    pub(in crate::parser) fn put_main(&mut self, key: FieldKey, value: FieldValue);
    pub(in crate::parser) fn put_text(&mut self, lang: Lang, role: PartRole, body: String);
    pub(in crate::parser) fn put_entry(&mut self, lang: Lang, role: PartRole, entry: PartEntry);
    pub(in crate::parser) fn push_relation(&mut self, relation: RelationDecl);
    pub(in crate::parser) fn finish(self) -> Result<Parsed, ParseError>;
}
```

这比 `Parsed::new` + 一串 public `add_*` 更干净:构造期可变,产物期只读。
封装边界由 Rust module visibility 保证,不是靠注释承诺。

#### `MapperRegistry` 与 ParserRegistry 同构

Mapper 是 parser 之后的第二个策略族,也必须闭集分派。不要让
`Workspace::sync` 写 `match kind` 两次,也不要让每个 adapter 自己挑 mapper。

```rust
pub trait Mapper {
    fn content_type(&self) -> ContentKind;
    fn map(&self, parsed: &Parsed) -> Result<RowSet, MapError>;
}

pub struct MapperRegistry {
    idea: IdeaMapper,
    blog: BlogMapper,
    project: ProjectMapper,
    episode: EpisodeMapper,
    resume: ResumeMapper,
    update: UpdateMapper,
}

impl MapperRegistry {
    pub fn mapper_for(&self, parsed: &Parsed) -> Result<&dyn Mapper, MapError> {
        self.get(parsed.kind())
    }

    pub fn get(&self, kind: ContentKind) -> Result<&dyn Mapper, MapError> {
        Ok(match kind {
            ContentKind::Idea => &self.idea,
            ContentKind::Blog => &self.blog,
            ContentKind::Project => &self.project,
            ContentKind::Episode => &self.episode,
            ContentKind::Resume => &self.resume,
            ContentKind::Update => &self.update,
        })
    }
}
```

ParserRegistry 和 MapperRegistry 不合并成一个巨型 `PipelineRegistry`:
parser 属于“内容文件 → Parsed”,mapper 属于“Parsed → RowSet”。保持两套
小 registry,由 `Workspace` 编排,比把两个阶段塞进一个大对象更清楚。

#### `Workspace` 持有装配好的服务

`Workspace::open()` 是依赖装配点。adapter 不直接 new parser / mapper。

```rust
pub struct Workspace {
    root: WorkspaceRoot,
    schema: Schema,
    parsers: ParserRegistry,
    mappers: MapperRegistry,
    sink: Box<dyn Sink>,
}

impl Workspace {
    pub fn sync(&self) -> Result<SyncReport, SyncError> {
        let items = self.scan()?;
        let mut batch = RowSetBatch::new();

        for item in items {
            let parser = self.parsers.parser_for(&item)?;
            debug_assert_eq!(parser.content_type(), item.kind());

            let parsed = parser.parse(&item)?;
            let issues = parser.validate(&parsed);
            IssuePolicy::fatal_errors_abort(&issues)?;

            let mapper = self.mappers.mapper_for(&parsed)?;
            debug_assert_eq!(mapper.content_type(), parsed.kind());

            batch.push(mapper.map(&parsed)?);
        }

        self.sink.write_batch(batch)
    }
}
```

这条主链路是 M5/M6 的验收对象:
`scan -> item.kind -> parser_for -> parse -> validate -> mapper_for -> map -> sink`。
少任何一环都不算 parser/sync 设计完成。

#### 类型归属表

| 类型 | crate / module | 可见性 | 说明 |
|---|---|---|---|
| `ContentKind` | `silan-viking-content` | `pub` | 闭集 enum:Blog/Project/Idea/Episode/Resume/Update |
| `Item` / `Part` / `File` | `silan-viking-content` | `pub`,字段私有 | 数据对象;`Item` 持有 `kind`;`Part` 持有 `PartShape` |
| `PartShape` | `silan-viking-content` | `pub` | `Prose` / `EntryList` / `KeyValueList`;不要叫裸 `Shape` |
| `Parser` / `ParserRegistry` | `silan-viking-app::parser` | `pub` | 解析策略与闭集分派 |
| `Parsed` | `silan-viking-app::parser` | `pub`,只读 | parser 产物;builder 仅 parser module 可见 |
| `ParsedBuilder` | `silan-viking-app::parser` | `pub(in crate::parser)` | 构造期可变对象 |
| `PartEntry` | `silan-viking-app::parser` | `pub` getter | schema-validated entry payload |
| `Issue` / `ParseError` | `silan-viking-app::parser` | `pub` | parser 错误与告警 |
| `Mapper` / `MapperRegistry` | `silan-viking-app::sync` | `pub` | 映射策略与闭集分派 |
| `RowSet` / `RowSetBatch` | `silan-viking-app::sync` | `pub` getter | 落库行集合,无 IO |
| `Sink` / `SqliteSink` | `silan-viking-app::sync` | `pub` | 唯一数据库写入面 |
| `Embedder` | `silan-viking-app::query` | `pub` | 语义检索服务;不参与 M5/M6 parser/sync 主链路 |

### 1.5.1 校验切片 —— `ResumeParser`(用一个真实 parser 验证设计)

> 设计不能只停在抽象。这一节拿 `resume` 走通一遍 —— 把抽象 `Parser` 落成一个
> 具体实现,**验证 §1.3 `Part` / §1.5 公私划分 / §1.8 `Mapper` 真能落地**。
> 本切片只验证 Rust/OOP 形态:closed registry、`Item.kind()` 分派、
> parser-only builder、mapper-only RowSet。它不继承旧 Python parser 的方法形状。

> **resume 不是单 body Part**(最终裁决,见 10§10.4.5、10§10.1.1 账本 #2)。
> resume 是**单 Item + 多 Part**,Part 配置驱动:每个 Part 在 `SCHEMA.md`
> 里标一个 `shape` —— `prose`(自由 markdown,如 `summary`)/ `entry_list`
> (一组同构条目,如 education/experience/publications/awards/research)/
> `key_value_list`(skills)。`prose` Part 的源文件是 `parts/<role>/<lang>.md`;
> `entry_list` Part 的源文件是 `parts/<role>/<lang>.toml`(TOML
> array-of-tables,每条 entry 有 `entry_id = e_<ulid>` 稳定锚点)。
> 结构化 Part **不**为每种 Part 建专用 ent 表 —— 统一落通用 `part_entry` /
> `part_entry_translation`(见 §1.10)。

**Rust 形态 —— `ResumeParser` 实现 `Parser` trait**:

```rust
// silan-viking-app/src/parser/resume.rs
use silan_viking_content::{ContentKind, Item, PartShape};

/// resume 的 parser。resume 是单 Item + 多 Part —— 每个 Part 有 `shape`
/// (prose / entry_list / key_value_list,见 §1.3.1 与 10§10.4.5)。
/// `prose` Part 解析 markdown 正文,`entry_list` Part 解析 TOML 条目。
pub struct ResumeParser;

impl Parser for ResumeParser {
    // ── public 契约 1/3:固定返回 resume ──
    fn content_type(&self) -> ContentKind {
        ContentKind::Resume
    }

    // ── public 契约 2/3:唯一解析入口 ──
    // resume 是多 Part:遍历每个 Part,按其 shape 解析。prose Part 读各语言
    // <lang>.md;entry_list Part 读各语言 <lang>.toml(TOML array-of-tables)。
    fn parse(&self, item: &Item) -> Result<Parsed, ParseError> {
        if item.kind() != ContentKind::Resume {
            return Err(ParseError::KindMismatch {
                expected: ContentKind::Resume,
                actual: item.kind(),
            });
        }

        let mut p = Parsed::builder(ContentKind::Resume, item.id());
        for part in item.parts() {                    // summary / education / …
            match part.shape() {
                // prose:markdown 正文(同 blog body)
                PartShape::Prose => {
                    for file in part.files() {        // parts/summary/<lang>.md
                        p.put_text(file.lang(), part.role(), file.content().to_owned());
                    }
                }
                // entry_list:TOML array-of-tables,按 SCHEMA 的 entry_fields
                // 校验后产出 schema-validated 条目(带 entry_id)
                PartShape::EntryList => {
                    for file in part.files() {        // parts/education/<lang>.toml
                        let entries = self.parse_entries(part.role(), file)?;
                        for entry in entries {
                            p.put_entry(file.lang(), part.role(), entry);
                        }
                    }
                }
                // key_value_list:TOML 顶层分类 key -> list<string>,skills 专用
                PartShape::KeyValueList => {
                    for file in part.files() {        // parts/skills/<lang>.toml
                        let entries = self.parse_key_values(part.role(), file)?;
                        for entry in entries {
                            p.put_entry(file.lang(), part.role(), entry);
                        }
                    }
                }
            }
        }
        // resume 顶层个人信息(full_name/email/…)是单条记录,从 canonical_lang
        // 对应文件提取进 main;非 canonical 语言的同名 main 字段只告警不胜出。
        self.extract_personal_info(item, &mut p)?;
        p.finish()
    }

    // ── public 契约 3/3:校验 ──
    fn validate(&self, parsed: &Parsed) -> Vec<Issue> {
        let mut issues = Vec::new();
        // 主语言变体的人物信息
        let main = parsed.main();
        if main.get("personal.full_name").is_none() {
            issues.push(Issue::error("resume 缺 full_name"));
        }
        if main.get("personal.email").is_none() {
            issues.push(Issue::warn("resume 缺 email"));
        }
        // 教育 + 经历的日期区间合法性
        for edu in parsed.entries(PartRole::new("education")) {
            if let (Some(s), Some(e)) = (edu.start_date(), edu.end_date()) {
                if s > e { issues.push(Issue::error(format!(
                    "education 日期区间非法: {}", edu.institution()))); }
            }
        }
        for xp in parsed.entries(PartRole::new("experience")) {
            if let (Some(s), Some(e)) = (xp.start_date(), xp.end_date()) {
                if s > e { issues.push(Issue::error(format!(
                    "experience 日期区间非法: {}", xp.company()))); }
            }
        }
        issues
    }
}

// ── 私有 fn:实现细节,不在 trait 上(§1.5)──
impl ResumeParser {
    fn extract_personal_info(&self, item: &Item, out: &mut ParsedBuilder)
        -> Result<(), ParseError> { /* 解析姓名/邮箱/标题/头像进 main */ }
    // parse_entries:解析一个 entry_list Part 的 TOML 条目,按 SCHEMA
    //   该 Part 的 entry_fields 校验,违反则报 entry_field_violation。
    fn parse_entries(&self, role: &str, file: &File)
        -> Result<Vec<PartEntry>, ParseError> { /* 解析 TOML array-of-tables */ }
    fn parse_key_values(&self, role: &str, file: &File)
        -> Result<Vec<PartEntry>, ParseError> { /* 解析 TOML key -> list<string> */ }
}
```

**`ResumeMapper` —— `Parsed` → `RowSet`(§1.8)**:resume 顶层个人信息落
ent 的 `personal_info`(+translation);`prose` Part(summary)落 `item_part`
(+translation);`entry_list` / `key_value_list` Part(education / experience
/ publications / awards / research / skills)的条目**统一落通用 `part_entry`
(+`part_entry_translation`)**,**不为每种 Part 建专用 ent 表**(最终裁决,
见 10§10.4.5、§1.10)。`ResumeMapper::map(&Parsed) -> RowSet` 是纯函数,
`Sink` 落库。

```rust
// silan-viking-app/src/sync/resume.rs
pub struct ResumeMapper;

impl Mapper for ResumeMapper {
    fn content_type(&self) -> ContentKind {
        ContentKind::Resume
    }

    fn map(&self, parsed: &Parsed) -> Result<RowSet, MapError> {
        if parsed.kind() != ContentKind::Resume {
            return Err(MapError::KindMismatch {
                expected: ContentKind::Resume,
                actual: parsed.kind(),
            });
        }

        let mut rows = RowSet::for_item(parsed.kind(), parsed.item_id());

        rows.push_personal_info(self.personal_info_row(parsed.main())?);

        for (lang, variant) in parsed.langs() {
            rows.push_personal_info_translation(
                self.personal_info_translation_row(*lang, variant)?,
            );
            rows.extend_item_part_translations(
                self.prose_part_rows(*lang, variant)?,
            );
            rows.extend_part_entry_translations(
                self.entry_translation_rows(*lang, variant)?,
            );
        }

        rows.extend_item_parts(self.item_part_identity_rows(parsed)?);
        rows.extend_part_entries(self.entry_identity_rows(parsed)?);
        rows.extend_relations(self.relation_rows(parsed.relations())?);
        Ok(rows)
    }
}

impl ResumeMapper {
    fn personal_info_row(&self, main: &LangNeutral) -> Result<PersonalInfoRow, MapError> { /* ... */ }
    fn item_part_identity_rows(&self, parsed: &Parsed) -> Result<Vec<ItemPartRow>, MapError> { /* ... */ }
    fn entry_identity_rows(&self, parsed: &Parsed) -> Result<Vec<PartEntryRow>, MapError> { /* ... */ }
    fn prose_part_rows(&self, lang: Lang, variant: &LangVariant) -> Result<Vec<ItemPartTranslationRow>, MapError> { /* ... */ }
    fn entry_translation_rows(&self, lang: Lang, variant: &LangVariant) -> Result<Vec<PartEntryTranslationRow>, MapError> { /* ... */ }
}
```

Mapper 不修正 parser 产物,也不做 IO。所有 helper 都是私有 fn;公开面只有
`content_type` / `map`。这和 Parser 的公私切法一致。

> **这个切片验证了五件事**:① `ParserRegistry` 由 `Item.kind()` 闭集分派,
> 不需要运行时 register;② `Parser` 三契约方法够用 —— resume 不需要第四个
> public 方法;③ 私有实现细节是 `impl ResumeParser` 的私有 fn,不污染
> trait(§1.5 公私划分成立);④ resume 是**单 Item + 多 Part**类型,`Part`
> 模型(§1.3)对多 Part 统一适用,且 Part 的 `shape`(prose / entry_list /
> key_value_list)由 SCHEMA 配置驱动 —— 加一种结构化 Part 不改 Rust、不加
> ent 表;⑤ `parse` 遍历各 `Part` 下的多语言 `File`、经 parser-only
> builder 产出只读 `Parsed`,再由 `ResumeMapper` 纯映射为 `RowSet`——
> `Part`(角色)与 `File`(语言)两维在切片里真正跑通,不丢任何语言。

> 对应的 resume 场景测试见 `05-测试.md` §5.3 —— `resume_parse_full` /
> `resume_missing_full_name` / `resume_invalid_date_range` 等。

## 1.6 聚合根、依赖方向、三个面

```
   L4  CliAdapter      McpAdapter      SiteProjector
        (#8)            (#10 #12)       (#11 #12)
          └───────────────┼────────────────┘
                          ▼  调同一套方法,不存在两套逻辑
   L3            ┌──────────────────┐
                 │    Workspace     │  聚合根 = 一个 content/ 仓,唯一对外入口
                 │  scan/sync/query │
                 │  propose/publish │
                 └────────┬─────────┘
                          ▼ 依赖 trait 端口(依赖倒置)
                 Parser / Mapper / Sink / Embedder
   L2                     ▼ 操作
                 Collection / Item / File / Relation   (纯数据)
   L1                     ▼ 组装 / impl
                 SilanUri / Meta / Identified …        (纯工具)
```

- 依赖**严格单向向下**。L1 base 不依赖任何 crate;L2 只依赖 L1;以此类推。
- 三个 adapter(L4)调同一个 `Workspace` —— CLI 给 silan,MCP 给协作 agent,
  SiteProjector 投影到网站。这是终局三句话的落点。

### 1.6.1 `SiteProjector` 与爬虫产物(对应 #14)

`SiteProjector`(L4 `silan-viking-site`)把 `visibility=public` 的 Item 投影成
网站内容。#14 要求:投影时**一并生成爬虫可见性产物**。`SiteProjector` 内部
持有一个 `SeoEmitter`,在 `silan site build` / `deploy` 时跑:

| 产物 | `SeoEmitter` 子职责 | 数据来源 |
|---|---|---|
| `sitemap.xml` | 列出所有 public 页 URL + `lastmod` | `Workspace` query 出的 public Item + 各自 `updated_at` |
| `robots.txt` | 爬虫规则 + sitemap 指向 | 固定模板 |
| JSON-LD | 每页嵌 schema.org 结构化数据(`BlogPosting`/`Person`/`CreativeWork`)| Item 的 `kind` + 元数据 |
| 预渲染 HTML | 每个 public 页一份静态 HTML 快照(SPA 爬虫可见性)| 前端 build 产物 + Item 内容 |
| per-page meta | `<title>`/`<meta description>`/OG/Twitter Card | Item 的 L0/L1 摘要(`tldr`/`summary`)|

设计要点:
- `SeoEmitter` 是 `SiteProjector` 的**私有协作者**,不单独成 adapter ——
  爬虫产物是「投影」的一部分,不是独立的对外面。
- 它**只读** `Workspace`(query public Item),**不写**真相源、不写库 ——
  产物全部落到 `_deploy/` 静态目录。属于 §1.1 判定的 L4。
- 触发点见 `02-cli服务.md` 的 `silan site build` / `deploy`(#14 选定的时机)。
- 预渲染 HTML 依赖前端构建产物,`SeoEmitter` 在前端 `build` 之后运行 ——
  时序由 `silan site` 的 build pipeline 编排。

## 1.7 单租户与可见性(对应 #13)

无 user_id、无租户隔离、无权限矩阵。可见性控制有**两层**:

**第一层 —— Namespace 级 `is_publishable()`**(§1.2.1):
- `AgentNamespace`(`silan://agent/`)`is_publishable()==false` —— 整个命名
  空间在 `SiteProjector` 投影逻辑里**不可达**,agent context 永不上网站。
- `ResourceNamespace`(`silan://resources/`)`is_publishable()==true` ——
  其下内容**可以**被投影,但具体投不投看第二层。

**第二层 —— Item 级 `visibility`**(L2 字段,仅 `resources/` 内有意义):
`private`(默认)/ `unlisted` / `public`(最终裁决,见 10§10.3、10§10.1.1
账本 #5:删 `is_public`,统一用 `visibility` enum)。**只有内容 owner 经
`Workspace::publish` 显式置 `public`,该 Item 才被 `SiteProjector` 投影**
—— agent 无此能力。

两层合起来:`agent/` 命名空间级就挡死(永不发布);`resources/` 命名空间
放行后,再由 Item 的 `visibility` 选择性发布。这就是「选择性部署」的
"选择性"(#11),也保证 agent 的私有 context 一个字不外泄。

## 1.8 持久化映射层 —— `Parsed` → 数据库

> 此层是 parser/sync 的结构边界:`Parser` 只产领域解析结果,`Mapper` 只做
> 结果到行集合的纯映射,`Sink` 是唯一 IO 面。

Rust 侧用 ORM(选定 **`sea-orm`** —— async、与 SQLite 合拍、比 `diesel` 少编译期
负担)。`Parser → Sink` 之间有一条完整的链,不是一行:

```
L3 app:  Parser ──▶ Parsed ──▶ «trait» Mapper ──▶ RowSet ──▶ «trait» Sink ──▶ portfolio.db
         (解析)    (产物)      (产物→行,纯函数)   (ORM 行)    (落库,唯一 IO)
                                    │ 6 个实现
                       Blog/Project/Idea/Episode/Update/Resume Mapper
```

### 1.8.0 `Parsed` —— 主体 + 多语言变体(载重)

> 早期把 `Parsed` 当成「parse 一个 File 的结果」,导致切片 `parse()` 只取一个
> `primary_file()`、双语内容半边蒸发(评审 R1)。根因:`Parsed` 没想清楚怎么
> 承载多语言。本节从根上定。

**第一性依据**:`portfolio.db` 的 ent schema 早已给出多语言的标准答案 ——
**主表存语言无关结构,18 张 `*_translations` 表按 `language_code` 存每个语言的
文本**(`blog_posts` + `blog_post_translations`、`personal_info` +
`personal_info_translations`…)。`Parsed` 必须**镜像这个结构**:

```rust
// silan-viking-app/src/parsed.rs
pub struct Parsed {
    kind: ContentKind,
    main: LangNeutral,                  // 语言无关:slug / date / tags /
                                        //   外键 / 数值 / 状态…
    langs: BTreeMap<Lang, LangVariant>, // 每个语言一份变体
}

pub struct LangVariant {               // 一个语言的全部文本
    // title / 各文本块(resume 的 8 块、blog 的正文、idea 各 Part 的 body…)
}
```

- `Parser::parse` **不再吃一个 `File`**,吃整个内容条目:它遍历每个 `Part`
  下的**所有语言 `File`**(§1.3 Part×Lang),从任一语言抽 `main`(语言无关
  字段),每个语言产一个 `LangVariant`。
- `Mapper` 自然映射:`main` → 主表行;`langs` 的**每个 entry → 一个
  `*_translation` 行**。N 个语言 = N 行译文。
- 这一条同时闭合:R1(语言不再丢)、R2 的根(`parse` 本就遍历多语言)、
  并让 `ResumeMapper`「产 translation 行」的描述**真有数据可产**。

> 不变量:`Parsed.langs` 至少含一个语言(主语言);`main` 的语言无关字段只从
> `canonical_lang` 读取(§1.3.1 / 10§10.3)。parser 若发现非 canonical 语言
> 文件也写了 `slug`/`date` 等 main 字段,忽略其值并报
> `warn: main_field_lang_mismatch`,不做跨语言“谁赢”的仲裁。

| L3 对象 | 职责 |
|---|---|
| `«trait» Mapper` | `map(&Parsed) -> RowSet` —— 一份解析产物翻成若干 ORM 行 |
| 6 个 `Mapper` 实现 | 各自知道自己那几张表(blog → `blog_posts`+`blog_post_translations`+…;update → `recent_updates`+译文)|
| `Parsed` | 解析产物 = `main`(语言无关)+ `langs`(多语言变体),见 §1.8.0 |
| `RowSet` | 一份产物对应的**全部表行**集合(主表 + N 行 translation + tag + …)|
| `entities`(sea-orm Entity)| ent 表的 Rust ORM 定义(见 §1.10 真相源)|
| `«trait» Sink` | `write(&RowSet)` —— 把 RowSet 事务性写库 |
| `SqliteSink` | `Sink` 的 sea-orm 实现 |

**为什么要 `Mapper` 这一层**:`Parsed`(§1.8.0)是 parser 产物形状(主体 +
多语言变体),`RowSet` 是数据库表形状。一份 blog `Parsed` 要拆进 4+ 张表
(主表 + 每语言一行译文 + tag…)。这个“一对多拆表”是领域映射逻辑,
必须显式成对象。`Mapper` 纯函数(无 IO),`Sink` 纯 IO。

### 1.8.1 关系的写入路径(修正自相矛盾)

> 早期版本说「`Workspace` 直接写 `content_relation`」,违反「`Sink` 是唯一
> 落库者」的分层。早期版本存在此矛盾,修正如下:

`Relation` 也是一种 row。链路保持 `Sink` 唯一写库,`Workspace` 不碰 IO:

- `RowSet` 增加一个字段 `relations: Vec<ContentRelationRow>`。
- 各 `Parser` 把本 Item frontmatter 里声明的 `relations` 解析进 `Parsed`。
- `Workspace::sync` 负责**收集**散落在各 `Parsed` 里的 relation 声明,
  汇总进对应 `RowSet`(纯内存操作,无 IO)。
- **写库仍由 `Sink::write(&RowSet)` 统一做** —— `relations` 字段和主表行
  一起在同一事务里落 `content_relation`。

职责:`Parser` 解析、`Workspace` 收集汇总、`Sink` 落库。`Workspace` 不碰 IO。

### 1.8.2 关系规范化 —— canonicalization

> 评审指出:一条有向边两端都会声明它 —— `idea-A` 的 frontmatter 写
> `evolved-into: blog-B`,`blog-B` 同时写 `evolved-from: idea-A`。这是同一条
> 物理边,人两边各写一次是**可读性的需要、应鼓励**。但 `Workspace` 收集时会
> 得到两条 `ContentRelationRow` 指向同一条边,撞 `UNIQUE INDEX`,`silan index sync`
> 直接失败。

**架构决策:取 canonicalization 归一,不取 INSERT OR IGNORE。**

第一性理由:一条边在物理上只有一条。表里存两行 = 让「一条边」这个事实有两个
真相。INSERT OR IGNORE 是用数据库容错盖住语义错误 —— 盖住的迟早从别处漏出
(如 `silan relation graph` 导出会出现重复边)。canonicalization 把「一条边只有
一个表示」钉死在收集层,表里永远干净。

规则,落在 `Workspace::sync` 的收集步骤(纯内存,无 IO):

1. **方向归一**:成对的 `relation_type` 定一个 canonical 方向 ——
   `evolved-from` 一律翻转成 `evolved-into` 的反向;`documents` 保持原向
   (它本就单向);`part-of` 保持原向。归一后,表里只存 canonical 方向的边。
2. **反向查询**靠 §1.10 修订 A 的 `INDEX(to_type, to_id)` —— 不需要存反向行。
3. **去重**:归一后,`(from, to, relation_type)` 相同的多条声明合并为一条
   (取首次出现;`sort_order` 等附加字段以非默认值优先)。
4. canonical 方向表 写进 `01` 同章的 M0 待定项之外的固定附录;`relation_type`
   的成对关系:`evolved-into ↔ evolved-from`、`supersedes`(单向)、
   `documents`(单向)、`references`(单向)、`part-of`(单向)。

> 实现位置:`Workspace` 的私有 fn `canonicalize_relations(&mut RowSet)`,在
> 收集后、交 `Sink` 前调用。`Sink` 永远只看到去重后的 canonical 边。

实现级伪代码:

```rust
fn canonicalize_relations(rows: Vec<ContentRelationRow>) -> Vec<ContentRelationRow> {
    let mut by_key = BTreeMap::<RelationKey, ContentRelationRow>::new();

    for row in rows {
        let canonical = match row.relation_type {
            RelationType::EvolvedFrom => row.reversed(RelationType::EvolvedInto),
            other => row.with_type(other.canonical()),
        };

        let key = RelationKey {
            from_type: canonical.from_type,
            from_id: canonical.from_id.clone(),
            to_type: canonical.to_type,
            to_id: canonical.to_id.clone(),
            relation_type: canonical.relation_type,
        };

        by_key
            .entry(key)
            .and_modify(|existing| existing.merge_metadata_from(&canonical))
            .or_insert(canonical);
    }

    by_key.into_values().collect()
}
```

`merge_metadata_from` 只能合并非语义字段:

- `sort_order`:两边都有非默认值且不同 → `warn` issue;取较小值保证稳定。
- `source_uri`:保留声明来源列表,用于 lint 提示“同一关系被两边声明”。
- `confidence` / `note`:有值优先;两边冲突 → `warn` issue,不阻塞 sync。

这保证 canonicalization 不吞掉结构错误:端点不存在、type 不合法、跨 namespace
关系不允许,仍由 `Parser::validate` / relation validator 报 `fatal`。

## 1.9 代码目录结构 —— 四层 1:1 落成 7 个成员 crate

> **crate 计数(钉死,避免 M1 scaffold 出错)**:`engine/` 是一个 Cargo
> **workspace**,workspace root(`engine/Cargo.toml`)本身不是 crate;
> 其下有 **7 个成员 crate**(base/content/entities/app/cli/mcp/site)。
> 全文一律称「7 个成员 crate + workspace root」,不说「8 个 crate」。

```
engine/                              # 与 backend/ frontend/ 平级,新文件夹
├── Cargo.toml                       # workspace root(非 crate),含 7 个成员 crate
├── rust-toolchain.toml
└── crates/
    ├── silan-viking-base/           # ── L1:纯工具,零 silan-viking 依赖 ──
    │   └── src/{lib, uri, meta, hash, lang, slug, traits}.rs
    │
    ├── silan-viking-content/        # ── L2:领域数据,只依赖 base ──
    │   └── src/{lib, collection, item, file, manifest, relation, series, anthology}.rs
    │
    ├── silan-viking-entities/       # ── L2.5:sea-orm Entity,= ent 表反向生成 ──
    │   └── src/{lib, blog, project, idea, resume, relation, ...}.rs
    │
    ├── silan-viking-app/            # ── L3:行为,依赖 base+content+entities ──
    │   └── src/
    │       ├── {lib, workspace, parsed, rowset, query}.rs
    │       ├── parser/{mod, blog, project, idea, episode, update, resume}.rs
    │       ├── mapper/{mod, blog, project, idea, episode, update, resume}.rs
    │       ├── sink/{mod, sqlite}.rs
    │       └── embed/{mod, api, null}.rs
    │
    ├── silan-viking-cli/            # ── L4:CLI,binary 名 silan-viking,命令名 silan ──
    │   └── src/{main, banner}.rs + groups/{mod, content, index, relation, series, site, proposal, mcp}.rs
    │
    ├── silan-viking-mcp/            # ── L4:MCP server ──
    │   └── src/{lib, server, tools}.rs
    │
    └── silan-viking-site/           # ── L4:网站投影 + 爬虫产物(#14) ──
        └── src/{lib, projector, seo}.rs   # seo.rs = SeoEmitter(§1.6.1)

engine/tests/fixtures/               # 跨 crate e2e:迷你 content/ 仓
```

**crate 依赖图(严格单向,cargo 编译期保证无回边)**:

```
  cli ─┐
  mcp ─┼─▶ app ─▶ entities ─┐
  site ┘      │             ├─▶ base
              └─▶ content ──┘
```

- L1 `base` 的 `Cargo.toml` 无任何 `silan-viking-*` 依赖。
- `entities` 单独成 crate(L2.5):表结构的派生物;`app` 依赖它,但 `content`
  (纯领域数据)**不**依赖它 —— 领域数据不该知道数据库。
- 加新 adapter = 加一个 L4 crate,不动 L1–L3。
- 每个 crate 的 `lib.rs` 是门面,只做 `pub use` —— 这是 §1.5 public/private 的
  crate 级闸门。

## 1.10 数据库 schema 修订(压测 50 张 ent 表后)

> 压测现有 `portfolio.db` 的 50 张 ent 表:首轮覆盖 6 条明示需求(修订
> A/B/C),二轮补审打点 / 批注 / 评论(修订 D/E/F),三轮补 §1.3 `Part` 的
> 持久化(修订 G)。审出 schema 不够合理。
> 本节是修订设计 —— **只设计、写文档,不改 Go 代码**。

### 压测结论(首轮 —— 6 条明示需求)

| 需求 | 现状 | 证据(经核实)|
|---|---|---|
| ① 演化链 idea→blog→project | ⚠️ 断在 blog→project | `blog_posts.ideas_id` 在,但 `projects` 表无 `idea_id`/`blogpost_id`;`project_relationships` 只连 project↔project |
| ② 单篇 ↔ 系列 | ✅ 单系列归属 | `blog_posts.series_id` + `series_order` |
| ③ 版本控制 | ❌ 零支持 | 50 张表无 version/history 表 |
| ④ 语言控制 | ✅ 最完整 | `languages` 表 + 18 张 `*_translations` 表 |
| ⑤ 留言评论 | ✅ | `comments` 用 `entity_type`+`entity_id` 多态 + `parent_id` 嵌套 |
| ⑥ 引用 | ⚠️ 概念混乱 | `comments.referrence_id`(拼错)、`project_relationships`、`idea_details.references` 三处各自为政 |

**两个病根**:① 没有通用关系表;② 版本控制悬空。

### 修订 A — 新增通用关系表 `content_relation`(对应 ① ⑥)

```
表 content_relation
  id            UUID
  from_type     ENUM(blog, project, idea, episode, update, resume)   -- 评审:enum 非 TEXT
  from_id       UUID
  to_type       ENUM(blog, project, idea, episode, update, resume)   -- 评审:enum
  to_id         UUID
  relation_type ENUM(evolved_into, evolved_from, documents,           -- 评审:enum
                     references, supersedes, part_of)
  sort_order    INT      -- 评审:part_of 等有序关系用,默认 0
  created_at    TIME

  UNIQUE INDEX (from_type, from_id, to_type, to_id, relation_type)   -- 去重
  INDEX        (from_type, from_id)    -- 评审:正向查「演化出了什么」
  INDEX        (to_type, to_id)        -- 评审:反向查「从哪来的」
```

- 演化链与引用,统一成 `relation_type` 的不同取值。
- **评审**:`from_type/to_type/relation_type` 用 `ENUM`,不用裸 `TEXT` ——
  封闭集合,非法值在写入时被 ent 挡掉,不靠注释。
- **评审**:补正反向两个索引;`UNIQUE` 只去重,不替代反向索引。
- **评审**:加 `sort_order` —— `part_of`(属于系列)是有序关系,顺序有处可放。
- **废弃**:`blog_posts.ideas_id` 外键、`project_relationships` 表 —— 被
  `content_relation` 覆盖。`comments.referrence_id` 改名修拼写、语义归位。
- 对应 §1.3 的 `Relation` 对象 —— 修复了「设计有 `Relation`、schema 无表」的脱节。

### 修订 B — 版本控制靠 Git,`portfolio.db` 不建 version 表

- 真相源 `content/*.md` 进 Git 仓 → Git 历史**就是**版本史。
- `portfolio.db` **不新增** version/history 表 —— 历史是真相源职责,数据库是
  只读派生缓存,存历史是职责错位。
- 后果:网站默认不展示「文章历史版本」;silan 需要时 `git log` / `git diff`。
- `silan index sync` 写库时,在一张轻量 `sync_meta` 表记录「本次 db 派生自哪个
  content commit」—— 这是溯源,不是版本控制,成本极低。

### 修订 C — 松散合集多归属(对应 ②,按需)

`blog_posts.series_id` 单外键 = 一篇只属一个系列。`Series` 够用;`Anthology`
要求一篇可被多合集引用 —— 需一张
`anthology_member(anthology_id, item_type, item_id, sort_order)` join 表。
**优先级低**:未明确要松散合集落库;留作 M0 之后按需。

### 补充压测 —— 数据打点 / 批注 / 评论(二轮压测)

> 首轮压测只覆盖 6 条明示需求,遗漏了打点与批注两个维度。本节补审,
> 审出 3 个真问题,对应修订 D/E/F。

| 维度 | 现状 | 证据(经核实)|
|---|---|---|
| 数据打点 | ⚠️ **schema 分裂** | `request_logs` 是 `svc.go` 里裸 SQL `CREATE TABLE` 建的,**不在 ent**;`project_views` 是 ent 表(有 fingerprint/referrer/session_duration);`blog_posts`/`ideas` 只有 `view_count` 计数器,无明细表 |
| 批注 annotation | ❌ **完全不存在** | 50 张表无 annotation 表;`comments.attachment_id` 是附件,非批注 |
| 评论 comment | ⚠️ 主体可用,有历史坑 | `comments` 多态 + 嵌套对;但 `type`/`entity_type` 是裸 `String` 非 enum,`referrence_id` 拼错,`ip_address`/`user_agent` 是打点数据混入评论表 |

### 修订 D — 统一交互表 `content_interaction`(对应打点 + #15)

打点 schema **不能分裂**。现状有三个问题:① `request_logs` 是裸 SQL 建的、
游离 ent 外,`sea-orm-cli` 反向生成扫不到;② `project_views` 只有 project 有,
blog/idea 无明细表;③ `project_likes`/`comment_likes` 是和 `project_views`
**完全同构**的表(都是 `entity_id`+`fingerprint`+`ip`+`ua`+`created_at`)——
view 和 like 是同一类东西「**匿名访客的一次交互留痕**」,被切成多张专用表。

> 评审 R5 指出:旧设计只收编 `view`、留下 `project_likes`/`comment_likes`,
> schema 还是分裂的。**架构决策:取方案 A —— view 与 like 合一张带 `kind`
> 的多态交互表。** 一次交互留痕,`kind` 区分是看还是赞,不为「看」和「赞」
> 各建一族表。

```
表 content_interaction
  id               UUID
  kind             ENUM(view, like)            -- R5:一张表收编 view + like
  entity_type      ENUM(blog, project, idea, episode, ...)   -- 多态,enum 非 TEXT
  entity_id        UUID
  section_anchor   TEXT   NULL  -- #15:章节级打点 —— 命中具体章节时记锚点,否则空

  -- 访客身份
  fingerprint      TEXT        -- 浏览器指纹(#15 要查)
  user_identity_id TEXT   NULL -- 已登录访客
  ip_address       TEXT        -- (#15 要查)
  user_agent       TEXT        -- 原始串,保留

  -- 访客分类(#15)—— 判定在 Go API 写入时做,见下「判定位置」
  visitor_kind     ENUM(human, search_crawler, ai_crawler)   -- 谁来了
  crawler_name     TEXT   NULL -- 命中爬虫时的具体标识(Googlebot/GPTBot/ExampleAIBot…)

  -- 访问来源(#15)
  referrer         TEXT   NULL -- 原始 referrer URL
  referrer_kind    ENUM(search, social, ai_chat, direct, internal)
                                -- 从哪来的;ai_chat = 从 ChatGPT/Perplexity 等
                                -- AI 对话界面的链接点过来
                                -- (最终裁决,见 10§10.1.1 账本 #8:全仓统一 ai_chat)

  session_duration INT    NULL -- 秒
  created_at       TIME

  INDEX (entity_type, entity_id)        -- 查某条内容的全部交互明细
  INDEX (entity_type, entity_id, kind)  -- 查某条内容的浏览 / 点赞
  INDEX (created_at)                    -- 时间窗聚合(日/周访问量)
  INDEX (visitor_kind)                  -- 「AI 爬虫访问了多少」类查询
  INDEX (referrer_kind)                 -- 「多少流量来自搜索 / AI 对话」类查询
```

**`visitor_kind` vs `referrer_kind` —— 一对互补,别混**:
- `visitor_kind` 答「**谁**来了」:真人 / 搜索引擎爬虫(Googlebot)/ AI 爬虫
  (GPTBot 来抓内容)。判定依据 `user_agent`。
- `referrer_kind` 答「从**哪**来的」:搜索结果 / 社交 / **AI 对话界面的链接**
  / 直接 / 站内。判定依据 `referrer`。
- AI 爬虫(`visitor_kind=ai_crawler`)和 AI 对话来源(`referrer_kind=ai_chat`)
  是两件事:前者是机器人来抓,后者是真人从 ChatGPT 点链接过来。两字段各管一半。

**判定位置(架构决策)**:`visitor_kind`/`crawler_name`/`referrer_kind` 的判定
**在 Go API 写入打点时做** —— 访问发生在 Go 后端,`user_agent`/`referrer`
当场就有;判定在**数据产生处**做一次、结果存进表。不放 Rust 查询侧重算
(每查一次重判 = 浪费,且爬虫特征库要在两处维护)。特征库更新是低频事件,
值不上「判定后置」那点灵活性。`content_interaction` 表存的就是已分类结果。

**FLAG 5 闭合 —— 唯一约束取舍**:`content_interaction` 是**明细表,刻意不加
`UNIQUE`** —— 同一指纹刷新 100 次就是 100 行,明细要全量留痕。去重/防刷在
**聚合层**做:`view_count` 计数器由「按 `(entity, fingerprint)` 去重后计数」
刷新,不是裸 `COUNT(*)`。明细全留、聚合去重,职责分离。

其余:
- blog/project/idea 的 view + like 打点**全走这一张表**;各内容表的
  `view_count`/`like_count` 计数器保留作快速读取,由 `content_interaction` 聚合刷新。
- **废弃**:`project_views`、`project_likes`、`comment_likes` 三张专用表 ——
  全被 `content_interaction` 覆盖。
- **`request_logs` 收编**:最终已裁定(`10` 裁决 #7)—— **独立成正式
  ent 表**,不并入 `content_interaction`(它是 API/访问日志,与内容交互
  语义不同)。M0.5 把它从裸 SQL 正式化为 ent 表;不再继续游离 ent 外。
- 打点表进 ent → `sea-orm-cli` 能反向生成 → Rust 侧统一(承 §1.8 不变量)。

### 修订 E — 新增批注表 `annotation`(对应批注)

批注有三种来源(读者段落旁注 / owner 私人注记 / agent 批注),**统一一张表**,
来源由 `author_kind` 区分:

```
表 annotation
  id               UUID
  entity_type      ENUM(blog, project, idea, episode, ...)
  entity_id        UUID
  anchor           TEXT       -- 批注锚点:段落 id / 文本选区(M0 定锚点格式)
  body             TEXT       -- 批注内容
  author_kind      ENUM(reader, owner, agent)   -- 三种来源,区分可见性与权限
  author_ref       TEXT       -- reader→fingerprint/identity;owner→silan;agent→agent id
  visibility       ENUM(private, unlisted, public) -- owner 私人批注默认 private
                                                    -- (最终裁决:visibility enum 全仓统一,见 10§10.3)
  created_at       TIME
  updated_at       TIME

  INDEX (entity_type, entity_id)   -- 取某条内容的所有批注
```

- `author_kind=reader` → 读者段落批注(评论的变体,带 `anchor`)。
- `author_kind=owner` → owner 私人注记,默认 `private`,不投影到网站。
- `author_kind=agent` → 协作 agent 的批注,进 context;与 MCP `propose` 互补
  —— `propose` 是改内容,`annotation` 是在内容旁留注不改正文。
- `anchor` 的具体格式(段落 id 还是字符 offset)留 M0 定 —— 取决于前端
  渲染方案。

**FLAG 6 闭合 —— `annotation` 与 `comment` 的职责边界**:两张表都能装"读者
在某段下留言",必须划死,否则 M0 SCHEMA 撞。边界:

- **`comment`**:整篇维度的评论。有 `parent_id` 嵌套讨论、`is_approved` 审核、
  `likes_count`。锚定对象 = **整个 Item**。
- **`annotation`**:**段落维度**的旁注。有 `anchor`(锚到具体文本)、`author_kind`。
  锚定对象 = Item 内**某一段**。
- 判据:**有 `anchor`(锚到段落)→ `annotation`;锚到整篇 → `comment`**。
- `annotation` 本期**不做嵌套回复** —— 旁注是单层的。若日后要"回复某条旁注",
  那条回复进 `comment`(以 annotation id 作 `reference`),不在 `annotation`
  自身做树。这条划清后,两表无重叠。

### 修订 F — `comment` 老表修复(对应评论)

新表都用了 enum、修了拼写,**老 `comment` 表不能放着不管**:

- `comments.type` 和 `entity_type`:裸 `String` → `ENUM`(与 `content_relation`、
  `content_interaction` 一致,封闭集合不用 TEXT)。
- `comments.referrence_id`:拼写改 `reference_id`;语义归位 —— 若它是"评论引用
  了某内容",该走 `content_relation`,此字段废弃。M0 核实其真实用途再定。
- `comments.ip_address`/`user_agent`:这是**打点数据混入评论表**。评论的反垃圾
  确实需要 IP,可保留;但要在文档里明确「这是反垃圾用途,不是打点」——
  打点的真相源是 `content_interaction`,不是 comment 表。

### 修订 G — 通用 `item_part` 表(对应 §1.3 的 Part / 可配置 tab)

> 现状的恶果(经核实):`idea_details` 把 progress/results/references 各做成
> **一个宽表列**;`project_details` 是另一组完全不同的列;且 `project_details`
> 与 `project_detail_translations` 的字段都对不上(本表 quick_start/release_notes,
> 译文表 goals/challenges/solutions)。**每加一个 tab 就要加一列、改 ent、改
> translation 表,本表和译文表还会漂移。** 这就是「tab 写死成宽表列」的代价。

§1.3 引入了 `Part`(tab),§1.3.1 要求 tab 构成可配置。宽表列**无法支持
可配置 tab** —— 列是 schema 的一部分,加列就是改 schema。改用一对通用表:

> **`item_part` 必须拆两表**(最终裁决,见 11§11.5)。早期把 `item_part`
> 设成「一行一个语言、字段里直接有 `lang`/`body`」—— 这把 identity(part_id
> /role)和译文挤在同一行,与全仓「主表存语言无关 identity、`*_translation`
> 表一行一语言存 body」的多语言标准(§1.8.0)不一致。修正:拆成
> `item_part`(identity:`part_id`/`role`/`canonical_lang`)+
> `item_part_translation`(一行一语言,`body` 在译文表)。

```
表 item_part —— Part 的 identity(语言无关)
  id              UUID
  part_id         TEXT       -- p_<ulid>,源 meta.toml 来,稳定(§1.3.1)
  item_type       ENUM(blog, project, idea, episode, resume, update)
  item_id         UUID
  role            TEXT       -- = §1.3.1 type 定义里的 role(overview/progress/...)
                             -- 不用 enum:role 集合是 SCHEMA 可配置的,不是封闭常量
  sort_order      INT        -- tab 在前端的展示顺序(= SCHEMA Part 的 order)
  canonical_lang  TEXT       -- 哪个语言是源
  created_at      TIME
  updated_at      TIME

  UNIQUE INDEX (part_id)
  UNIQUE INDEX (item_type, item_id, role)   -- 一 Item 一 role 一行
  INDEX        (item_type, item_id)         -- 取某 Item 的所有 tab

表 item_part_translation —— Part 正文的多语言变体(一行一语言)
  id              UUID
  item_part_id    UUID       -- → item_part.id
  language_code   TEXT       -- en / zh / ...
  body            TEXT       -- 该 Part 该语言的正文
  created_at      TIME

  UNIQUE INDEX (item_part_id, language_code)   -- 一 Part 一语言一行
```

- idea 的 `overview` Part → `item_part` 一行(identity);其 `en.md` / `zh.md`
  → `item_part_translation` 两行(各语言 body)。
- **加一个 tab = `item_part` 多一行 + `item_part_translation` 多几行 + 改
  §1.3.1 的 SCHEMA 配置;不改任何表结构。** 这才让「可配置文件树」(#2、
  §1.3.1)真正成立。
- `role` 故意用 `TEXT` 不用 `ENUM` —— 与修订 A/D 的 enum 原则**有意相反**:
  那些字段是封闭集合,`role` 的取值集合是 SCHEMA 可配置的、开放的,
  用 enum 反而锁死了可配置性。约束由 SCHEMA 的 type 定义在写入时校验。
- 这对表镜像 §1.8.0 的 `Parsed`(`main` + `langs`):`item_part` ←→ `main`,
  `item_part_translation` ←→ `langs` 的每个 entry。逐字段详细设计见 11§11.5。
- **取代关系**:`idea_details` / `project_details` 及其 translation 表里的
  **文本型 tab 字段**(progress/results/references/quick_start/...)迁入
  `item_part` / `item_part_translation`。但 `idea_details` 里的**结构化字段**
  (`estimated_duration_months`/`collaboration_needed`/`estimated_budget` 等
  非文本、非 tab 的属性)**不属于 tab**,保留在 `idea_details` 作 Item 的
  扩展属性。M0 逐字段划分:哪些是 tab 正文(→ `item_part`)、哪些是结构化
  属性(留 `*_details`)。

### 修订 G′ — resume 结构化 Part 的 `part_entry` 表 + episode 独立表

> 承 §1.3 与 §1.5.1 的 最终裁决:resume 不是单 body Part,episode 不是
> `blog_posts` 的行。这两条裁决在 schema 上各引出新表 —— 本节只作**存在性
> 引用**,逐字段详细设计在 `11`(M0.5 ent schema PR)。

- **`part_entry` + `part_entry_translation`**(对应 resume 的结构化 Part):
  education / experience / publications / awards / research 是 `entry_list`,
  skills 是 `key_value_list`;**不为每种 Part 建专用 ent 表**
  —— 统一落通用 `part_entry`(语言无关字段)+ `part_entry_translation`
  (语言相关字段)。`entry_list` 的每条 entry 有 `entry_id = e_<ulid>`
  稳定锚点;`key_value_list` 以分类 key 作为稳定条目 key。
  详见 11§11.5.1(最终裁决,见 10§10.4.5、10§10.1.1 账本 #2)。
- **`episodes` + `episode_series`**(+各 translation):episode 是**独立
  content type + 独立容器系列**,不是 `blog_posts` 表里 `content_type=episode`
  的行。`episode_series` 是容器系列,`episodes` 是 episode 的内容主表。
  详见 11§11.5.2(最终裁决,见 10§10.4.4、10§10.1.1 账本 #1)。
- **`recent_updates`**:`update` 是第 6 种 content type,`recent_updates`
  是它的**内容主表**(不是派生表、不是聚合物),与 `blog_posts`/`ideas`
  同类,由 sync 从 markdown 重建。详见 11§11.7.1(最终裁决,见
  10§10.4.6、10§10.1.1 账本 #3)。

### 连带影响 §1.8

- `entities`:= ent 表
  + **新增 `content_relation`**(修订 A)、**`content_interaction`**(D)、
    **`annotation`**(E)、**`item_part` + `item_part_translation`**(G,拆两表)、
    **`part_entry` + `part_entry_translation`**(G′,resume entry_list)、
    **`episodes` + `episode_series`**(+各 translation,G′,episode 独立成表);
  + **移除 `project_relationships`**、**`project_views`**、**`project_likes`**、
    **`comment_likes`**,以及 `education`/`work_experience` 等简历专用表
    (resume 走 `part_entry`);
  + `comment` 表字段改 enum(F);`*_details` 表的文本 tab 字段迁出(G);
  + `recent_updates` 转正为 `update` type 的内容主表(详见 11§11.7.1)。
- `RowSet`:含 `relations: Vec<ContentRelationRow>` 与 `parts`(`item_part` +
  `item_part_translation` 行;resume 的 entry_list Part 另含 `part_entry` 行)
  —— `Mapper` 把一个 `Item` 的各 `Part`(§1.3)映射成对应表行。
- 派生 vs 运行时,两类数据边界:
  - **派生数据**(`silan index sync` 从 markdown 重建):内容主表(含
    `recent_updates`、`episodes`、`episode_series`)+ translation +
    `item_part`/`item_part_translation`(tab 正文)+ `part_entry`/
    `part_entry_translation`(resume entry_list 条目)+ `content_relation`。
    这些由 `Sink` 写。
  - **运行时数据**(Go API 运行时写,**不**由 sync 派生):`content_interaction`
    (打点)、`annotation`(批注)、`comment` —— 访客/agent 行为产物。
  `Sink` 只碰派生数据;运行时数据 sync 永不触碰。
- **运行时数据的物理归属 —— 只在生产服务器(载重)**:评论/打点是访客在
  **网站上**产生的,它们只存在于**服务器的** `portfolio.db`。本地机器的
  `portfolio.db` 由本地 `sync` 从 markdown 重建 —— 它的运行时表
  (`comment`/`content_interaction`/`annotation` 的 reader 部分)**是空的,
  这是预期,不是 bug**。
  - 新机器从服务器拉取:`git clone` content 仓拿到全部**内容**(markdown
    真相源),本地 `sync` 重建内容表;运行时表仍空。
  - 要看评论/访问数据 → `silan stats` / MCP `stats` **远程查询服务器**,
    不把运行时数据同步回本地。
  - 这样:本地只管内容创作,运行时数据有唯一的家(服务器),不存在
    「哪台机器的评论数据最新」这种同步难题。

> 表结构真相源仍是 Go ent。修订 A/D/E/F/G/G′ 要落地,**先改
> `backend/internal/ent/schema/`**(加 `content_relation`/`content_interaction`/
> `annotation`/`item_part`+`item_part_translation`/`part_entry`+
> `part_entry_translation`/`episodes`+`episode_series`(+各 translation)
> + 删 `projectrelationship.go`/`projectview.go`/`projectlike.go`/
> `commentlike.go` 及 `education`/`work_experience` 等简历专用表 + 改
> `comment`/`recent_updates` + `*_details` 表迁出 tab 字段),再由
> `sea-orm-cli` 反向生成 Rust entity。逐字段 PR 设计见 `11`(M0.5)——
> 本章只作设计与存在性引用,列为独立的 schema 修订 PR。

## 1.11 已关闭评审项与 M7 施工规则

评审遗留项在这里收口。F1/F2/F3 属于 schema 层,已由 `10` 关闭;F4/F5
属于 proposal/capture 链路,不阻塞 M1-M6 Rust core,但必须在 M7 施工时按下表实现。

| Flag | 问题 | 最终规则 |
|---|---|---|
| F1 | ~~`update` 是否作 relation 端~~ —— 已闭合:`update` 是第 6 种 content type(最终裁决,见 10§10.4.6),`recent_updates` 是其内容主表;它是 `content_relation` 的合法端 | —(已闭合)|
| F2 | ~~`idea_details.references`(自由文本)与 `content_relation` 的 `references` 撞名~~ —— 已闭合:两者不同物,各司其职 —— `content_relation.references` 是 Item↔Item 结构化引用边,idea 的 `reference` Part 正文是自由文本参考资料(最终裁决,见 10§10.5)| —(已闭合)|
| F3 | 已在修订 A 用 `sort_order` 解决 | — (已闭合)|
| F4 | 同一个 Part 被多个提案同时改,无锁/无提示(`03 §3.1`)| `proposal_meta.toml` 必须记录 `base_head_oid` + `touched_parts`(`kind/slug/part_id/lang/ext`)。`propose` 创建时若发现同一 Part 已有待审提案,在返回结果和 `silan proposal list` 中提示冲突风险;不阻塞创建。`accept` 必须持有 `content/.git/silan/locks/proposal-accept.lock`,校验 expected head OID,merge 到临时 worktree 后重跑校验②;失败不推进主分支。 |
| F5 | `capture` 创建新 Item 的 `slug` 来源未定(`03 §3.1`)| `capture(note,type,slug?)`:agent 可传 `slug`,引擎只接受 `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`;未传则从标题/首句 slugify 成小写 kebab-case,截断到 64 字符;若冲突,追加 `-<ulid6>`。最终 slug 写入提案元数据并在响应里返回。 |

> F1/F2/F3 已闭合(F1:`update` 转正为 content type,见 10§10.4.6;
> F2:references 自由文本与结构化边各司其职,见 10§10.5);
> F4/F5 是 M7 的实现规则,不再列为 M0 阻塞项。
