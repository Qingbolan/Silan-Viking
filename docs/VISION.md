# VISION — terminal-state polestar

> This is Silan Personal Website's polestar document.
> Every architectural decision, every PR, every trade-off answers the
> same question: **does it bring us closer to this terminal state, or
> further from it?**
>
> This document is "what we are building" and "why"; the numbered
> documents under `docs/silan-viking/` are "how" — start at
> `OVERVIEW.md`, then object model, CLI/MCP, milestones. When they
> conflict, this document wins.

---

## 1. One sentence

> **One person and one agent, jointly tending a knowledge body that
> grows by itself.**
> Outward, it is a personal website; inward, it is a second brain.

This is not a "personal website project" and not a "CMS". It is a
**knowledge organism** — it has a lifecycle, evolves, can be searched,
can tidy itself. The website is just the public-facing cross-section.

---

## 2. What it looks like in three years

Imagine an evening in 2029:

- An idea pops up; you write three lines of markdown into
  `content/resources/ideas/`.
- A few months later it has grown into a blog post; a year later into
  a project; you also recorded a vlog series in between. These are not
  four orphaned pieces of content — there are **directed evolution
  edges** between them: `project --evolved-from--> idea`. On the site,
  visitors can follow the chain and see how an idea took shape.
- You never hand-write the site's summaries, translations, indexes,
  or changelogs. An agent does that — it is the **gardener** of this
  knowledge body: it searches, lints, drafts, settles your working
  sessions into memory.
- The agent can only **propose** changes to your published content;
  you review and merge — you are always the author.
- The agent's own memory **self-evolves**: at the end of each session
  it writes what it learned into `silan://agent/`.
- The truth of the whole organism is **plain text, in Git**. Any post
  on any day can be diffed, rolled back, replayed.
- All of this runs on one Rust engine, `silan-viking`; the addressing
  language is `silan://`. Outward it drives the website; inward it is
  a skill an agent can mount.

**That evening, you do not "manage" this system. You live alongside it.**

---

## 3. What "elegant" means — the terminal-state rubric

Elegant is not pretty UI. Elegant = **the whole knowledge body follows
one ontology** — no special cases, no patches, no "for historical
reasons". Five concrete tests:

### 3.1 Content is an object, not a row in a table

blog / idea / project / series are not four tables in a database, they
are **domain objects** — with identity, methods, and encapsulation
boundaries. They share an abstract `ContextNode`. Adding a new content
type = implement a trait, not "add a table and edit ten places".

### 3.2 Relations are first-class, directed, typed

"This blog documents that idea" or "this project evolved from that
idea" — these are **directed, typed edges**, as important as the
content itself (Karpathy: "the links are as valuable as the documents").
Not a meaningless `links: [...]` list.

### 3.3 Memory and publication, one engine, two worlds

Outward-facing content (`silan://resources/`) and the agent's inward
memory (`silan://agent/`) are **two trees, one engine**. Same search,
same layering, same abilities. The only difference is one property:
`is_mutable` — published content is read-only, memory updates itself.

### 3.4 Human and agent collaborate through the same abilities

The agent is not a side-script. It uses **exactly the same ability
surface** as you do: search, lint, draft, propose. The difference is
the **authority boundary**: certain verbs (`accept` / `reject` /
`deploy`) belong to the human, enforced by encapsulation, not by
prompt wording.

### 3.5 Truth is plain text; derived artefacts are rebuildable

`content/*.md` is the only source of truth. The database, summaries,
indexes, the website — all derived. Any of them can be deleted and
rebuilt from markdown. This guarantees: Git is the version control,
rollback is deterministic, no state hides in a database somewhere.

> **One-sentence test for "elegant":** when adding something new to
> this system, if you find yourself patching, special-casing, or
> writing "for historical reasons", it is not elegant yet. Elegant =
> the new thing falls naturally into the existing ontology.

---

## 4. Three non-negotiable principles

No matter how the implementation changes, these three do not give way:

1. **Markdown is the source of truth.** You write markdown; everything
   else is derived. The agent cannot bypass it.
2. **You are the author, the agent is the gardener.** The agent can
   search, organise, draft, propose; whether something enters the
   source of truth is always your `accept`.
3. **Back-cast from the terminal state; don't forecast from today.**
   Every decision asks "what does the terminal state need?" first,
   then "how do we land that today?" "We'll just make do for now" is
   forbidden — making do is drifting from the terminal state.

---

## 5. Where we are, where we are going

| | Today | Terminal state |
|---|---|---|
| Content | scattered markdown + manual sync via Python `silan` | `silan://` knowledge body, object-shaped, with relations |
| Backend | Go API (security-fixed) reading SQLite | unchanged — SQLite is a read-only derived artefact emitted by the engine |
| Engine | Python `silan` (procedural, conventions buried in code) | Rust `silan-viking` (OOP, SCHEMA is the contract) |
| Agent | none | through MCP / EasyNet skill, gardener role |
| Memory | none | `silan://agent/` self-evolving |
| Versioning | plain Git | content in its own repo + release tags + deterministic rollback |

**Route**: `docs/silan-viking/` is the authoritative design —
`OVERVIEW.md` gives the one-glance picture; `00`–`09` expand each
piece (object model / CLI / MCP / tests / end-to-end / observability);
`04-milestones.md` lays out the implementation track. Every milestone
is independently shippable, and every step moves toward that 2029
evening in §2.

---

## 6. How to use this document

- Before a new PR or new design, re-read the five tests in §3 and
  check that you are making the system more elegant.
- When a trade-off feels unclear, re-read the three principles in §4.
- Wondering "should we build this feature?" — ask whether it serves
  the evening in §2.
- This document should evolve as understanding deepens, but §1 and §4
  are the foundation; changing them needs a very strong reason.
