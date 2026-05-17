# silan-viking M0 resume 字段抽取报告

> 本报告是 `10-M0-SCHEMA定稿.md` §10.4.5 的事实附录。它只记录当前
> Python parser、旧 Python sync、Go ent/API 的实际字段面,不新增设计。

## 抽取来源

| 来源 | 文件 |
|---|---|
| Python parser | `silan-personal-website/silan/parsers/resume_parser.py` |
| Python legacy sync | `silan-personal-website/silan/logic/database_sync_logic/mixins/resume.py` |
| Python SQLAlchemy model | `silan-personal-website/silan/models/education.py`, `experience.py`, `research.py` |
| Go ent schema | `backend/internal/ent/schema/{publication,award,researchproject,...}.go` |
| Go resume API | `backend/api/backend.api`, `backend/internal/logic/resume/getresumedatalogic.go` |

## 事实边界

- `ResumeParser` 已抽取 `education`、`experience`、`publications`、`awards`、
  `research`、`skills`、`recent_updates`。
- 旧 Python `_sync_resume` 主路径当前只同步 `education`、`experience`、
  `awards`;同文件里有 `_sync_publications`、`_sync_research_projects`
  helper,但主路径没有调用它们。
- 当前 Go API 的 `resume.skills` 不是来自 resume 文件,而是从 public
  project technologies 去重派生。
- M0 新 schema 不继承这些旧路径的缺口;它只用本报告确定字段契约,真正落库
  统一走 `part_entry` / `part_entry_translation`。

## education

| 字段 | parser 来源 | 旧落点 |
|---|---|---|
| `institution` | block 第一行 | `education.institution` |
| `degree` | `**...**` 行 | `education.degree` |
| `field_of_study` | degree 括号内容 | `education.field_of_study` |
| `start_date` / `end_date` | 斜体日期范围 | `education.start_date` / `education.end_date` |
| `is_current` | 日期范围含 `Future` 或无结束日期 | `education.is_current` |
| `gpa` | `GPA` 行 | `education.gpa` |
| `location` | 非日期斜体行 | `education.location` |
| `institution_website` | `*Website*:` 或 metadata match | `education.institution_website` |
| `institution_logo_url` | `*Logo*:` 或 metadata match | `education.institution_logo_url` |
| `details` | `- ...` 行 | `education_details.detail_text` |

## experience

| 字段 | parser 来源 | 旧落点 |
|---|---|---|
| `company` | block 第一行 | `work_experience.company` |
| `position` | `**...**` 行 | `work_experience.position` |
| `start_date` / `end_date` | 斜体日期范围 | `work_experience.start_date` / `work_experience.end_date` |
| `is_current` | 日期范围含 `Now` 或无结束日期 | `work_experience.is_current` |
| `location` | 非日期斜体行 | `work_experience.location` |
| `company_website` | `*Website*:` 或 metadata match | `work_experience.company_website` |
| `company_logo_url` | `*Logo*:` 或 metadata match | `work_experience.company_logo_url` |
| `details` | `- ...` 行 | `work_experience_details.detail_text` |

## publications

| 字段 | parser 来源 | 旧落点 |
|---|---|---|
| `title` | 引号标题或 fallback | `publications.title` |
| `authors` | 标题前作者串 | `publication_authors.author_name` |
| `journal_name` | venue regex | `publications.journal_name` |
| `conference_name` | Go ent/API 字段,parser 当前未单独拆出 | `publications.conference_name` |
| `publication_type` | keyword: conference/journal/workshop/arxiv | `publications.publication_type` |
| `publication_date` | 年份括号转 `YYYY-01-01` | `publications.publication_date` |
| `doi` | DOI regex | `publications.doi` |
| `url` / `pdf_url` | Go ent 字段,parser 当前未抽 | `publications.url` / `publications.pdf_url` |
| `citation_count` | Go ent/API 字段,parser 当前未抽 | `publications.citation_count` |
| `is_peer_reviewed` | parser 默认 `true` | `publications.is_peer_reviewed` |
| `sort_order` | parser 当前默认 `0`;sync 可按条目顺序写 | `publications.sort_order` |

## awards

| 字段 | parser 来源 | 旧落点 |
|---|---|---|
| `title` | 去掉月份年份与 `by ...` 后的文本 | `awards.title` |
| `awarding_organization` | `by ...` | `awards.awarding_organization` |
| `award_date` | 月份年份 | `awards.award_date` |
| `award_type` | Go ent/API 字段,parser 当前未抽 | `awards.award_type` |
| `amount` | Go ent 字段,parser 当前未抽 | `awards.amount` |
| `description` | 原始 award 行 | `awards.description` |
| `certificate_url` | parser 默认空 | `awards.certificate_url` |
| `sort_order` | parser 当前默认 `0`;sync 可按条目顺序写 | `awards.sort_order` |

## research

| 字段 | parser 来源 | 旧落点 |
|---|---|---|
| `title` | block 第一行 | `research_projects.title` |
| `start_date` / `end_date` | 斜体日期范围 | `research_projects.start_date` / `research_projects.end_date` |
| `is_ongoing` | 无结束日期 | `research_projects.is_ongoing` |
| `location` | 非日期斜体行 | `research_projects.location` |
| `research_type` | parser 默认 `individual`;sync 旧 helper 曾从 position/research_area 取 | `research_projects.research_type` |
| `funding_source` | parser 默认空 | `research_projects.funding_source` |
| `funding_amount` | parser 默认空 | `research_projects.funding_amount` |
| `details` | 其余正文聚合 | `research_project_details.detail_text` |
| `sort_order` | parser 当前默认 `0`;sync 可按条目顺序写 | `research_projects.sort_order` |

## skills

| 字段 | parser 来源 | 旧落点 |
|---|---|---|
| `programming_languages` | 分类名含 programming/language | 无 resume 专用 ent;当前 Go API 从 project technologies 派生 |
| `frameworks` | 分类名含 framework/technology | 同上 |
| `tools` | 分类名含 tool | 同上 |
| `soft_skills` | 分类名含 soft | 同上 |
| `technologies` | 其它分类 + 上面技术类去重合集 | 同上 |

M0 裁决: `skills` 用 `key_value_list`,保留原始分类名与分类下的
`list<string>`;不要压平为单一 `skills: []`,否则会丢失分类结构。
