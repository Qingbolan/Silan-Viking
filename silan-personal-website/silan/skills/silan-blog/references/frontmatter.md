# YAML Frontmatter

Every content Markdown file begins with a YAML frontmatter block delimited by `---`. These fields map directly to database columns during `silan db-sync`. **Never delete or corrupt this block** — the parser (`base_parser.py` and per-type parsers) reads it to populate the DB; the `_remove_frontmatter()` step strips it only from the rendered body.

## General shape

```markdown
---
title: "My Post Title"
description: "Short summary used for SEO and listings"
date: 2026-05-16
status: published          # draft | published | archived
tags: [ai, tutorial]
category: "Engineering"
language: en               # en | zh
---

# Body content starts here
```

## Field guidance by content type

### Blog
```yaml
title, description, date, status, tags, category
type: post | vlog | tutorial   # subtype
series: "series-slug"           # optional, for multi-part series
```

### Project
```yaml
title, description, status, tags
technologies: [React, Go, Python]
github_url, demo_url, website_url
featured: true
start_date, end_date
```

### Idea
```yaml
title, description, status        # status: concept | in-progress | completed
tags, category
collaborators: []
```

### Episode (series)
```yaml
title, description, series, episode_number
date, status, tags
```

### Resume
```yaml
title, language
# resume content is largely structured Markdown sections;
# the resume parser also reads section headings
```

## Rules

- Quote strings containing colons, `#`, or special characters.
- Dates in `YYYY-MM-DD` format.
- `status` controls visibility — `draft` content typically does not appear on the live site.
- Lists can be `[a, b]` inline or block style.
- When editing a file, keep all existing frontmatter keys unless intentionally removing a field; add new keys rather than reformatting the whole block.
- After changing frontmatter, run `silan db-sync --dry-run` to confirm the parser accepts it.
