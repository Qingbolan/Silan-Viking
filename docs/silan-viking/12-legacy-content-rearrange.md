# 12 · 旧内容离线重排

> 这一章补全一处**文档真空** —— silan 指出:文档定了「不兼容旧布局」,
> 但**没有规则**说旧的 `README.md` / `NOTES.md` / `resume.md` 怎么一次性
> 搬进新结构 `content/resources/{type}/{item}/parts/<role>/`。本章给出这份
> 规则规格。
>
> **本章地位**:M0 与 M0.5 之间的一次性动作。它产出一个**离线重排脚本**
> 的规格 —— 脚本把旧内容搬到最新结构,**跑完即弃**。
>
> **三条铁律**(承 `04` 里程碑、`08` §8.1/§8.7):
> 1. 重排是**一次性**的。运行时 parser **没有**旧布局兼容分支。
> 2. 重排脚本读旧结构、写新结构,**不是** silan-viking 引擎的一部分,
>    可以是独立 Python/脚本(它本就要读旧 Python 仓的布局)。
> 3. 重排产物必须能通过 M0 `SCHEMA.md`(`10`)的全部 `fatal` 校验 ——
>    否则重排没完成。

---

## 12.1 旧内容当前不在本工作树 —— 一个必须先说清的事实

核查本仓(`Silan-Personal-Website`)后:**旧的 markdown 内容仓当前不在这个
工作树里**。本仓现在是 Go backend + React frontend + Python `silan` 包;
真实的 ideas/blog/projects markdown 由内容 owner 在别处单独维护。

因此本章的规则**基于 Python parser 已验证的旧布局**(`silan/parsers/` 的
docstring 与解析逻辑就是旧内容形态的事实证据 —— parser 能解析的结构,
就是旧内容的真实结构)。

> **M0 重排执行前的一步**:silan 把旧内容仓接入(或指出路径),按本章
> §12.6 的核校清单跑一遍,确认实际旧文件名/布局与 §12.2 一致;有出入则
> 本章 §12.2 的映射表当场补正。**不拿真实旧内容核过,不算重排完成。**

---

## 12.2 旧布局 → 新布局 映射表

旧布局(从 Python parser docstring 抽取的事实):

```
idea:     <idea-folder>/  README.md  NOTES.md  results.md  REFERENCES.md
                          experiments.md  assets/  .silan-cache
project:  <project-folder>/  README.md  RELEASES.md|CHANGELOG.md
                             QUICKSTART.md  requirements.txt|package.json
blog:     <blog-folder>/  <name>.md  (+ series 靠文件夹前缀 / frontmatter)
resume:   resume.md  (单文件,7 个 ## 段:Education / Work Experience /
                      Publications / Awards / Skills / Research / Recent Updates)
```

新布局(`01` §1.3.1 + `10` §10.4):

```
content/resources/{type}/{item-slug}/
├── parts/<role>/meta.toml      # part_id 由重排脚本生成
└── parts/<role>/<lang>.<ext>  # prose 用 .md;结构化 Part 用 .toml
```

**逐 type 映射** —— 旧文件的哪部分,落新结构的哪里:

### idea

| 旧来源 | 新去处 | 说明 |
|---|---|---|
| `README.md` frontmatter | `parts/overview/<lang>.md` 的 frontmatter | Item 级字段 |
| `README.md` 正文 | `parts/overview/<lang>.md` 正文 | abstract → overview Part |
| `NOTES.md` 正文 | `parts/progress/<lang>.md` 正文 | progress Part |
| `results.md` 正文 | `parts/result/<lang>.md` 正文 | result Part |
| `REFERENCES.md` 正文 | `parts/reference/<lang>.md` 正文 | reference Part |
| `experiments.md` | **丢弃或并入 progress** | 新 SCHEMA 无 experiments Part(`10`§10.4.1)—— 重排时并入 progress 末尾,或人工裁 |
| 旧 `.silan-cache` | **丢弃** | 引擎重新生成(`08`§8.2:`.silan-cache` 引擎写) |
| `assets/` | `parts/overview/assets/` 或 Item 级 `assets/` | 图片资源跟随 |

### project

| 旧来源 | 新去处 |
|---|---|
| `README.md` frontmatter | `parts/overview/<lang>.md` frontmatter |
| `README.md` 正文 | `parts/overview/<lang>.md` 正文 |
| `RELEASES.md`/`CHANGELOG.md` | `parts/release_notes/<lang>.md` 正文 |
| `QUICKSTART.md` | `parts/quick_start/<lang>.md` 正文 |
| `requirements.txt`/`package.json` | **不进 content** | 依赖清单是代码产物,不是内容;`license`/`version` 进 overview frontmatter |
| README 里的 goals/challenges 段落 | 拆进 `parts/goals/`、`parts/challenges/` 等 | 旧 README 若把这些写在一篇里,重排时**人工切分**(见 §12.4)|

### blog

| 旧来源 | 新去处 |
|---|---|
| `<name>.md` frontmatter | `parts/body/<lang>.md` frontmatter |
| `<name>.md` 正文 | `parts/body/<lang>.md` 正文 |

### episode(独立 type —— 最终裁决 #1)

> episode 是独立 type、独立容器系列(`10`§10.4.4)。重排目标结构是
> `content/resources/episode/<series-slug>/<episode-slug>/parts/body/`,
> 不是 `blog_posts` 的行。

| 旧来源 | 新去处 |
|---|---|
| 旧容器系列目录(`series/` 或 `episode-*/`)| `content/resources/episode/<series-slug>/` |
| 旧系列的描述文件 / 配置 | `<series-slug>/series.toml`(容器系列元数据)|
| 每个旧 episode 文件 `episode-NN-*.md` frontmatter | `<episode-slug>/parts/body/<lang>.md` frontmatter,含 `series` + `episode_number` |
| 每个旧 episode 文件正文 | `<episode-slug>/parts/body/<lang>.md` 正文 |

> ⚠️ 旧设计文档(`06`/`05`)曾把 episode 写成「容器系列旧布局
> `README.md + episode-01-*.md`、不走 parts」。**那是旧形态,作废** ——
> 重排目标只认上表的新结构。`06`/`05` 的旧 episode 描述在 `15` 回写阶段
> 一并更正。

### resume(配置驱动 Part —— 最终裁决 #2)

> resume 旧的是**单文件 7 段**,新的是**单 Item + 配置驱动的 Part**
> (`10`§10.4.5)。每段重排进对应 Part;`entry_list` shape 的 Part(education
> 等)的条目要解析成 schema-validated 的 entry,落 `part_entry`。

| 旧 `resume.md` 段 | 新 Part | shape |
|---|---|---|
| 文件 frontmatter + 顶部个人信息 | `parts/summary/<lang>.md` | prose |
| `## Education` | `parts/education/` | entry_list |
| `## Work Experience` | `parts/experience/` | entry_list |
| `## Publications` | `parts/publications/` | entry_list |
| `## Awards` | `parts/awards/` | entry_list |
| `## Research Experience` | `parts/research/` | entry_list |
| `## Skills` | `parts/skills/` | key_value_list |
| `## Recent Updates` | **重排为独立 `update` Item** | —— 见下 |

> `entry_list` Part 的重排:旧 `## Education` 下每个 `### Institution` 子段
> → 一条 entry → 按 `10`§10.4.5 的 `entry_fields` 解析。**产出物是
> `parts/<role>/<lang>.toml`**(TOML array-of-tables,不是 `.md`),每条
> entry 一个 `[[entry]]` 块,字段按 entry_fields。重排脚本**为每条 entry
> 生成 `entry_id = "e_<ulid>"`** 写进 TOML 块 —— 同一条 education 的
> `en.toml` / `zh.toml` 用同一个 `entry_id`(多语言对齐靠 id,不靠下标)。
> 解析不出 `required` 字段的条目 → 标记待人工(§12.4)。
>
> `## Recent Updates` **不再丢弃**(最终裁决 #3:`update` 是第 6 type)——
> 旧 resume 里 Recent Updates 段的每条,重排成 `content/resources/update/`
> 下的独立 `update` Item,见下「update」段。

### update(第 6 type —— 最终裁决 #3)

> update 是第 6 种 content type(`10`§10.4.6)。旧 update 内容有两个来源:
> 旧 Python `update_parser` 处理的 update 文件,以及旧 `resume.md` 的
> `## Recent Updates` 段。

| 旧来源 | 新去处 |
|---|---|
| 旧 update 文件(`YYYY-MM-DD-slug.md` 等)frontmatter | `content/resources/update/<slug>/parts/body/<lang>.md` frontmatter |
| 旧 update 文件正文 | `parts/body/<lang>.md` 正文 |
| 旧 `resume.md` 的 `## Recent Updates` 每个 `### Type: Title` 子段 | 一个独立 `update` Item:子段标题→`title`,`*Type*`→`update_type`,`*Date*`→`date`,正文→`parts/body` |

> 旧 update 的 `type` 值按 Python `update_parser` 的 mapping 归一到 `10`
> §10.4.6 的 8 值 `update_type` enum;归一不到的标记待人工(§12.4)。

---

## 12.3 语言变体的重排

旧内容的多语言(Python parser 的 `file_info.language`)如何落新结构:

- 旧的每个语言版本(若旧仓用 `README.zh.md` / `README.en.md` 或子目录区分)
  → 落同一个 `parts/<role>/` 下的 `<lang>.<ext>`(`zh.md` / `en.md` 或
  `zh.toml` / `en.toml`)。
- `meta.toml` 的 `canonical_lang` = 旧内容里标记为主语言的那个(默认 `en`)。
- 二期翻译元数据(`translation_of`/`source_hash`/`stale`)**留空**
  (`01`§1.3.2 第一阶段)—— 重排脚本不填,只建好字段位。

> 旧仓若**没有**多语言区分(只有一个语言),重排后该 Part 只有一个
> `<canonical_lang>.md` —— 这是合法的(`10`§10.6 `info: canonical_lang_only`)。

---

## 12.4 自动重排 vs 人工切分 —— 划清边界

不是所有重排都能脚本化。**脚本能做的**和**必须人工的**要分清:

**脚本自动做**:
- 文件搬位置(`README.md` → `parts/overview/en.md`)。
- `meta.toml` 生成 + `part_id`(`p_<ulid>`)。
- frontmatter 字段名归一(旧 `featured_image`/`image`/`banner` → 新 `featured_image_url`,
  按 `10` 的字段表)。
- enum 值归一(旧 project `status: ACTIVE` → 新 `active`;旧 idea
  `status: idea` → 新 `hypothesis`,按 Python parser 的 status mapping)。
- slug 校验 / 生成(旧无 slug 则从 title 派生,`10` 的 slug pattern)。

**必须人工切分**(脚本只标记、不猜):
- 旧 project 的 `README.md` 若把 overview/goals/challenges/solutions
  **写在一篇连续 markdown 里**,脚本无法可靠切成 4 个 Part —— 脚本把整篇
  落 `parts/overview/`,并在重排报告里**标记**「此 project 的 README 需人工
  拆 Part」。silan 事后手工切。
- 旧 idea 的 `experiments.md`(新 SCHEMA 无此 Part)—— 脚本并入 progress
  末尾并标记,silan 决定保留还是删。
- 任何 enum mapping 落到「Default」分支的(旧值无法归一)—— 标记待人工确认。

> **原则**:脚本**宁可标记不猜**。一个被错切的 Part,比一个「整篇落
> overview + 待人工切」的标记更难发现、更难修。

---

## 12.5 重排脚本的产物与校验

脚本按 5 个阶段写,每阶段都有可落日志,避免“跑完才发现搬错”:

1. **scan**:只读旧内容仓,生成 `old-inventory.json`。记录每个旧 Item 的
   type、slug、候选语言、旧文件列表、未知文件列表。
2. **plan**:按 §12.2 映射生成 `migration-plan.json`。每个旧文件必须有
   `move` / `merge` / `drop` / `manual` 四种动作之一;未知文件不得静默跳过。
3. **emit**:写新结构到临时目录,生成 `part_id` / `entry_id`,复制 assets。
   此阶段不得修改旧内容仓。
4. **validate**:对临时目录跑 M0 `SCHEMA.md` fatal 校验;失败则不覆盖正式
   `content/`。
5. **promote**:人工确认报告后,把临时目录移动到正式目标路径。

重排脚本跑完,产出两样:

1. **新结构的 `content/resources/`** —— 全部 `parts/<role>/` 布局。
2. **重排报告 `migration-report.md`** —— 列出:
   - 每个 Item 的「旧路径 → 新路径」。
   - 所有「待人工切分/确认」标记(§12.4)。
   - 所有 enum mapping 落 Default 的条目。
   - 丢弃的文件清单(`experiments.md` / 旧 `.silan-cache`)。
     注:`## Recent Updates` 段**不丢弃** —— 重排为 `update` type Item。

**重排完成的判据**(承 `08` §8.7):
- [ ] 重排产物放进 `engine/tests/fixtures/content/` 或正式 `content/`,
      **全部是新结构**,无旧路径残留。
- [ ] 对重排产物跑 M0 `SCHEMA.md`(`10`)校验:**零 `fatal` 错误**。
      `warn` 允许存在但需在报告里列清。
- [ ] `migration-report.md` 的「待人工切分」标记**全部已被评审处理**
      (切分完成,或确认不切)。
- [ ] 重排脚本本身**不进** `engine/` —— 它是一次性工具,放
      `tools/` 或 `scripts/`,跑完归档。运行时 parser 无旧布局分支
      (`08`§8.1)。

---

## 12.6 给执行者的核校清单

silan 接入真实旧内容仓后,M0 重排执行前先核:

- [ ] 真实旧 idea 文件夹的文件名,与 §12.2 idea 表一致?(`README.md` /
      `NOTES.md` / `results.md` / `REFERENCES.md`)有出入 → 补 §12.2 映射。
- [ ] 真实旧 project README 是「一篇连续」还是「已分段」?决定 §12.4 的
      人工切分量级。
- [ ] 旧仓多语言怎么区分(文件名后缀 / 子目录 / 单语言)?对应 §12.3。
- [ ] 旧 `resume.md` 真有 7 个 `##` 段,还是更多/更少?核 §12.2 resume 表。
- [ ] 旧 episode/系列怎么组织(容器目录 / `episode-*.md` 命名 / 系列配置
      文件)?对应 §12.2 episode 段的容器系列重排。
- [ ] 旧 update 内容散在哪(独立 update 文件 / `resume.md` 的 Recent
      Updates 段 / 两者都有)?对应 §12.2 update 段。
- [ ] 旧内容里有没有 §12.2 没覆盖的文件类型?有 → 本章当场补一行映射。

> 核校清单跑完、§12.2 映射表与真实旧内容对齐 —— 才动重排脚本。
> 不对着真实旧内容核过就写死脚本,等于在猜,违反「不从现状外推」。
