---
name: ltodd
description: >-
  Author and revise the Living Tome of Dreamtides Design in the repository's
  top-level ltodd directory. Use only when the user explicitly invokes $ltodd
  to create or revise chapters, propagate a game-design change through the
  book, or change canonical terminology or models. Never invoke this skill
  implicitly and never edit LToDD without explicit invocation.
---

# Living Tome of Dreamtides Design

LToDD explains Dreamtides to technical contributors who do not know the game or
the repository. It describes the intended game in implementation-neutral prose:
the main concepts, rules, algorithms, state transitions, and reasons behind
non-obvious decisions. A contributor should be able to understand the system
and reproduce its behavior without reverse-engineering the TypeScript source.

LToDD is not source documentation, a data-model inventory, a product pitch, or
a transcript of the prototype. Write direct technical prose. Introduce the game
before its internal machinery, and explain only the technical distinctions that
the design actually needs.

## Load the authoring guidance

Read [references/writing-guide.md](references/writing-guide.md) completely
before researching or editing LToDD.

Read [references/content-patterns.md](references/content-patterns.md) before
creating a chapter or substantially reorganizing one. Use its patterns as
examples, not templates.

Read [references/source-part-map.md](references/source-part-map.md) when
deciding which part owns a subject or where to begin source research.
`ltodd/index.md` remains the authority for book ownership.

Before creating or rewriting a primary chapter, read
`docs/journeys/journeys.md` and `docs/battle_rules/battle_rules.md` for the
preferred explanatory style. Follow their directness and concept order without
copying their structure mechanically. Treat the battle rules as a trusted
secondary source when the subject includes battle.

When the subject includes a screen or interaction, read the project-local
`.llms/skills/cumulus/SKILL.md` and only the references needed for that screen.
Use Cumulus to identify established component names and shared presentation
contracts. Do not reproduce component APIs in LToDD.

## Authoring workflow

### 1. Establish the requested change

Work only in the top-level `ltodd/` directory. The book contains an ordered set
of parts, a root `index.md`, and a root `glossary.md`. Each populated part has
one primary chapter and may have supplemental chapters:

- `ltodd/<part>/<part>.md` is the primary chapter.
- `ltodd/<part>/<subject>.md` is a supplement.

Use stable lowercase underscore names for directories and files. Write the
primary chapter before any supplement. A primary chapter introduces the whole
part to a new contributor. A supplement gives a deeper account of one unusually
complex system or algorithm after the primary chapter already provides the
needed context.

If the book does not exist when the first chapter is requested, create
`index.md`, `glossary.md`, the part directory, and its primary chapter as one
change. Do not create the book merely to test the skill.

Treat one invocation as one design change rather than one file edit. Update
every affected chapter, glossary definition, index entry, and cross-reference.
Avoid unrelated cleanup.

### 2. Discover the affected book surface

Read `ltodd/index.md` first. Use its part descriptions to identify likely
owners. Read every plausibly affected primary chapter in full, followed by any
relevant supplements. Search the corpus for the changed terms, duplicated
rules, links, and nearby concepts before and after editing.

Do not load the whole book by default. Follow the index and the links from the
chapters that own the subject.

### 3. Research the behavior

Use evidence in this order:

1. Use the production game flow to learn what the player can observe and which
   terms the game presents.
2. Inspect production data and code for hidden rules, ordering, state changes,
   exact algorithms, and edge cases.
3. Inspect `logs/journey-log.jsonl` when reconstructing a production decision
   would answer how an algorithm behaved.
4. Treat existing LToDD chapters as canonical unless the requested change
   revises them.
5. Use the battle rules as a trusted secondary source for battle.
6. Treat other Markdown documents as leads that require verification.
7. Use explicit user decisions as the intended design, even when the current
   implementation has not reached that design yet.

Research across module boundaries. Source ownership, type names, helper
objects, routes, debug tools, and test fixtures are evidence, not a chapter
outline. Do not turn them into book concepts without a design reason.

When evidence conflicts with an explicit user decision, document the user's
design. When evidence conflicts internally and no intent is known, ask the user
to choose before writing the disputed behavior.

### 4. Ask only material, concrete questions

Do not require an interview. Ask a question only when all of these are true:

- the answer changes the canonical design;
- the prototype, data, code, logs, existing chapters, and prior user feedback
  do not settle it; and
- choosing without the user would create a material risk of writing the wrong
  system.

Ask the smallest useful batch. Each question must identify the exact object or
transition, describe the conflicting evidence, and give a concrete example of
how the answers differ. Ask for a specific choice. Do not ask the user to
endorse abstract goals, broad design values, or unexplained terminology.

Good question shape:

> A copied card can either retain the source card's persistent modifications or
> start from the shared card definition. The current copy rule does X, while the
> existing chapter says Y. Which behavior should LToDD specify?

After the answer, proceed. Ask again only if a new material conflict appears.

### 5. Plan the reader's path

Before drafting, write a short private outline based on what a new technical
contributor needs to learn. For a primary chapter, use this default order unless
the subject clearly needs another:

1. Answer what the system is and where it fits in Dreamtides.
2. Explain the normal lifecycle or main loop.
3. Introduce the core objects, resources, choices, and outcomes as they become
   necessary.
4. Explain important rules and algorithms beside the phase where they operate.
5. Put identity, derived values, persistence boundaries, randomness contracts,
   and other narrow technical models after the reader understands why they
   matter.
6. Link to adjacent chapters for concepts that have their full definition
   elsewhere.

Allocate space by importance to the reader, not by source line count or by how
interesting an internal mechanism is. A foundational chapter should spend most
of its space explaining the game, not card copying, identifiers, random state,
or generic invariants.

### 6. Write the canonical design

Write in plain, active, present-tense prose for a technical audience. Use
specific nouns and verbs. Prefer a direct definition or state transition over
an abstract claim about experience, clarity, importance, or philosophy.

Describe one coherent design. Preserve exact rules where exactness matters, but
do not mirror source structure. Explain algorithms through their inputs,
outputs, ordering, selection domains, and visible or persistent results. Include
constants and edge cases only when an implementation needs them to reproduce
the behavior. Do not write source code or pseudocode.

Keep the book independent of implementation platform and storage strategy.
Describe game state, identity, restoration requirements, and deterministic
randomness without naming browser behavior, application frameworks, event-log
reduction, storage formats, or serialization mechanisms. A chapter may name a
specific algorithm when the algorithm itself is part of the intended design.

Do not promote every source type or helper into a canonical noun. Before naming
a technical concept, ask whether it has distinct identity, state, or behavior
that a clean implementation must represent. If it is only a calculation or
resolved view, explain the calculation in ordinary prose. Use the shortest
unambiguous term for a real concept.

Do not call an authored status or implementation difference a defect unless the
user has established that it is a bug. Use neutral descriptions of current
state and intended design.

#### Write a primary chapter

Open with a plain explanation of the subject for a contributor with no project
context. The opening should answer what the system is before it names specialized
objects. Introduce concepts in dependency order and keep narrow technical
contracts near the end unless an earlier rule depends on them.

The chapter must stand alone at the level promised by its part. It does not need
to exhaust every implementation detail. Do not mention hypothetical
supplements, reserve gaps for them, or use generic invariant checklists to create
the appearance of completeness.

After validating a new primary chapter, propose supplemental topics only when a
specific system or algorithm genuinely needs deeper treatment. Make proposals
outside the book and do not create them without user selection.

#### Write a supplemental chapter

Open with the exact subject being deepened and link to the owning primary
chapter. Give the focused system enough context to be understood, then specify
its contract without repeating the whole part. Update the primary chapter and
index in the same change.

#### Control chapter size

Treat roughly 20,000 Unicode characters as a loose planning reference, not a
goal to hit. Complete, concise chapters may be substantially shorter. Never add
detail, examples, rationale, or sections to approach the reference size. A
chapter must not exceed 40,000 characters. Use
`node .llms/skills/ltodd/scripts/measure-chapters.mjs` to inspect counts.

### 7. Audit terminology and navigation

Perform a first-use audit after drafting:

1. List every Dreamtides-specific noun, named status, resource, symbol,
   algorithm, and technical distinction in the chapter.
2. Find its first occurrence.
3. Define it there, give a brief parenthetical explanation and link to its
   owning section, or defer the term until the definition is useful.
4. Add a glossary entry only when the term is a reusable canonical concept, not
   merely a code label or derived value.
5. Remove unexplained lists of keywords, statuses, or ability categories.

Bold a term once when the prose gives its first real definition. Write ordinary
game terms in lowercase. Reserve capitals for proper names and sentence starts.
Use sentence case for headings. If a concept is mentioned before its full
treatment, give enough meaning to continue and link directly to that section.

Use parentheses, commas, or separate sentences for asides. Do not place a
parenthetical aside between em dashes. Avoid vague roadmap sentences that say
only what later sections will discuss.

### 8. Use prototype images selectively

Capture and publish an image only when it materially helps a reader recognize a
screen or understand a spatial relationship. Follow
`docs/journey_prototype/qa_tooling.md`, capture canonical player-facing output
without debug or platform chrome, inspect it, and keep the local binary outside
the repository.

Publish with `npm run publish-ltodd-image --` and the arguments documented by
`scripts/publish-image.mjs`. Paste the generated reference-style Markdown next
to the prose it supports. Never invent a URL, commit an image binary, or leave
an image placeholder. If publishing is unavailable, omit the image and report
the blocker outside the book.

### 9. Format and validate

Run these commands from the repository root:

```bash
node .llms/skills/ltodd/scripts/measure-chapters.mjs
node .llms/skills/ltodd/scripts/format-markdown.mjs --write
node .llms/skills/ltodd/scripts/format-markdown.mjs --check
```

Resolve every error and inspect every warning. Then review the formatted diff
for factual accuracy, concept order, undefined terms, accidental title case,
platform leakage, vague prose, unnecessary repetition, and broken reading
paths.

Finish only when the change describes one resolved design, a new contributor
can follow each chapter from its opening, technical depth is proportional to
reader importance, every specialized term is handled at first use, affected
chapters agree, the index and glossary are current, and the checker passes.
