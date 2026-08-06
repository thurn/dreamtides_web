---
name: ltodd
description: >-
  Author and revise the Living Tome of Dreamtides Design in the repository's
  top-level ltodd directory. Use only when the user explicitly invokes $ltodd to
  create chapters, propagate a game-design change through every affected
  chapter, or change canonical terminology or models across the book. Never
  invoke this skill implicitly and never edit LToDD without explicit invocation.
---

# Living Tome of Dreamtides Design

The Living Tome of Dreamtides Design, or LToDD, is the canonical book describing
how the production game works and why its major design decisions exist. An
expert unfamiliar with this repository should be able to reimplement Dreamtides
from the book and its companion TOML catalogs.

Write the canonical, implementation-grade account of Dreamtides. Preserve the
production game's intended behavior while presenting its rules, presentation,
and rationale as a coherent clean design rather than an account of the current
codebase.

## Load the authoring guidance

Read [references/writing-guide.md](references/writing-guide.md) completely
before researching or editing LToDD.

Read [references/content-patterns.md](references/content-patterns.md) before
creating a chapter or substantially reorganizing one. Use its patterns as
examples, not templates.

When the subject includes presentation or interaction, read the project-local
`.llms/skills/cumulus/SKILL.md` and only the Cumulus references relevant to the
primitives and behaviors involved. When the subject includes battle rules, read
`docs/battle_rules/battle_rules.md` as a trusted secondary source.

## Authoring workflow

### 1. Establish the book and requested change

Work only in the top-level `ltodd/` directory. Keep `index.md` and `glossary.md`
at the book root. Place every ordinary chapter exactly one level down at
`ltodd/<part>/<chapter>.md`. Name part directories and chapters with stable
lowercase underscore names.

If the book does not exist when the first chapter is requested, create these
files as part of that authoring request:

- `ltodd/index.md`, containing a short “How to read this book” passage and the
  authoritative chapter catalog grouped into ordered parts;
- `ltodd/glossary.md`, containing the alphabetical canonical terminology
  catalog; and
- the requested part directory and chapter.

Do not create the book merely to install or test this skill.

Treat one invocation as one coherent design change, not as one chapter. Update
every affected chapter, index entry, glossary definition, and cross-reference.
Avoid unrelated editorial cleanup.

### 2. Discover relevant chapters

Read `ltodd/index.md` first. Use its part descriptions and chapter scope
statements to identify candidates. Search the corpus for relevant titles,
opening scope paragraphs, headings, links, user-facing terms, rules, and
duplicated constraints. Fully read every primary or plausibly affected chapter
before editing it.

Do not load the entire book by default. Use the index and search results as
routing metadata, then follow relevant chapter links. After editing, repeat the
corpus search to find stale terms or repeated rules that also need revision.

### 3. Research the design

Resolve facts in this order:

1. Observe the relevant production game flow locally when doing so will reveal
   behavior more effectively than source inspection.
2. Inspect production data and code for hidden rules, ordering, state, and exact
   behavior.
3. Inspect `logs/journey-log.jsonl` when reconstructing an algorithmic decision
   from a production game is useful.
4. Treat existing LToDD chapters as canonical except where the requested change
   revises them.
5. Use `docs/battle_rules/battle_rules.md` as a trusted secondary source for
   battle.
6. Treat every other Markdown document as a lead that requires verification.
7. Ask the user to resolve contradictions, design intent, or rationale that the
   artifacts cannot establish.

Use production routes and player behavior as research evidence. Do not turn
debug entry points, test fixtures, editor tools, or source organization into
book content.

### 4. Interview before writing

Complete the discoverable research first. Then ask one batch of three to five
intent-dependent questions before writing. Prefer questions about:

- the intended player experience or design objective;
- which behavior is canonical when evidence conflicts;
- the rationale or tradeoff behind a consequential decision;
- edge cases that materially change the design; and
- clean terminology or modeling choices required for a rewrite.

Include the evidence behind each question and a recommended answer. Ask fewer
questions, or none, when a small change is already fully specified. Never ask
for facts that the running game, data, code, logs, or existing LToDD can answer.

After the user answers, state a compact writing plan and proceed. Pause again
only when a material choice remains unresolved.

### 5. Write the canonical design

Preserve exact intended behavior while replacing incidental source structure
with a clean, internally coherent model. Use user-facing terminology. Define a
new implementation-neutral term only when the UI provides none and the concept
is necessary to explain the design.

Write around decisions and keep each decision beside its rationale and
consequences. Specify enough behavioral, algorithmic, state, presentation, and
motion detail for an expert unfamiliar with this repository to implement the
system in a non-web client.

Do not leave TODOs, alternatives, uncertainty, or speculative explanations in a
chapter. Inline image briefs are the sole intentional placeholder.

If a chapter approaches the 500-line limit, remove bloat first. Split it only
when its genuine subject contains multiple coherent scopes. Update the index and
every affected link in the same change.

### 6. Format and validate

Run the formatter, then the checker from the repository root:

```bash
node .llms/skills/ltodd/scripts/format-markdown.mjs --write
node .llms/skills/ltodd/scripts/format-markdown.mjs --check
```

Resolve every error. Inspect and resolve every implementation-leakage warning;
do not ignore warnings merely because they are non-fatal. Review the formatted
diff for factual accuracy, local completeness, information density, link
quality, and accidental changes outside the requested design.

Finish only when the affected rules are consistent across the corpus, the index
and glossary are current, no material question remains, and the checker passes.
