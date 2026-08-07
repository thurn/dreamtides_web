---
name: dda
description: >-
  Author and revise essays in the Dreamtides Design Anthology in the
  repository's top-level dda directory. Use only when the user explicitly
  invokes $dda to create a focused essay about a complex part of the design,
  revise an existing essay, or reconcile a design change with directly
  affected essays. Never invoke this skill implicitly and never edit DDA
  without explicit invocation.
---

# Dreamtides Design Anthology

DDA is a selective collection of standalone technical essays about the most
complex parts of Dreamtides design. It is intentionally incomplete. The
anthology has no parts, primary chapters, supplements, glossary, prescribed
reading order, or claim to own every design subject.

Each essay explains one difficult design question in implementation-neutral
prose. A technical contributor who does not know the game or repository should
be able to understand the essay's subject and reproduce the behavior it
describes without reverse-engineering the TypeScript source.

## Load the authoring guidance

Read [references/writing-guide.md](references/writing-guide.md) completely
before researching or editing DDA.

Read [references/essay-patterns.md](references/essay-patterns.md) before
creating an essay or substantially reorganizing one. Use its patterns as
examples, not templates.

Read [references/source-research-guide.md](references/source-research-guide.md)
when choosing where to begin source research. Follow behavior across module
boundaries rather than treating the guide as an ownership map.

When the subject includes journey structure or battle, read
`docs/journeys/journeys.md` or `docs/battle_rules/battle_rules.md` as relevant.
Treat the battle rules as a trusted secondary source.

When the subject includes a screen or interaction, read the project-local
`.llms/skills/cumulus/SKILL.md` and only the references needed for that screen.
Use Cumulus to identify established component names and shared presentation
contracts. Do not reproduce component APIs in DDA.

## Authoring workflow

### 1. Establish the requested essay

Work only in the top-level `dda/` directory. It contains a flat catalog and a
flat set of essays:

- `dda/index.md` lists the essays that exist.
- `dda/<subject>.md` contains one essay.

Use stable lowercase underscore filenames. Do not create subdirectories,
glossaries, part overviews, placeholder essays, or reserved gaps.

If DDA does not exist when the first essay is requested, create `index.md` and
the requested essay together. Do not create the anthology merely to test the
skill.

Treat one invocation as one focused essay change. Update the index when an
essay is added, renamed, or removed. Update another essay only when the change
would otherwise leave a direct contradiction or a broken reading dependency.
Do not propagate a change through the anthology merely to make it look
comprehensive.

### 2. Discover the relevant surface

Read `dda/index.md` first, then the requested essay and any essays named by its
links. Search the anthology for the changed terms, duplicated rules, and direct
contradictions before and after editing.

Do not load every essay by default. The index is a discovery list, not a
reading order or authority map. Overlap is acceptable when each essay needs
enough local context to stand alone.

### 3. Research the behavior

Use evidence in this order:

1. Use explicit user decisions as the intended design, even when the current
   implementation has not reached that design.
2. Use the production game flow to learn what the player observes and which
   terms the game presents.
3. Inspect production data and code for hidden rules, ordering, state changes,
   exact algorithms, and edge cases.
4. Inspect `logs/journey-log.jsonl` when reconstructing a production decision
   would explain how an algorithm behaved.
5. Treat an existing DDA essay as authoritative within its declared scope
   unless the request revises it or stronger evidence exposes a conflict.
6. Use the battle rules as a trusted secondary source for battle.
7. Treat other Markdown documents as leads that require verification.

Research across module boundaries. Source ownership, type names, adapters,
routes, debug tools, and fixtures are evidence, not an essay outline. Trace a
player-facing object through its full flow: where it comes from, how it is
selected, what the player sees, what the player does with it, and where it goes
next. Prefer the gameplay verb established by that flow.

When evidence conflicts with a user decision, write the user's design. Record
the implementation mismatch outside DDA when repository instructions require
it. When evidence conflicts internally and no intent is known, ask the user to
choose before presenting the disputed behavior as resolved.

### 4. Ask only material, concrete questions

Do not require an interview. Ask only when the answer changes the essay's
design claim, available evidence does not settle it, and choosing without the
user creates a material risk of describing the wrong system.

Identify the exact object or transition, explain the conflicting evidence, and
give a concrete example of how the answers differ. Ask for the smallest useful
choice. After the answer, proceed unless a new material conflict appears.

### 5. Frame the essay

Write a short private outline around one reader question. The opening should
establish:

- what design problem or system the essay examines;
- where it appears in Dreamtides;
- why the subject needs a focused explanation; and
- what the essay deliberately leaves to adjacent systems.

Build the heading tree from the prerequisites of that question. Organize rules
beside the phase where they operate. Do not imitate source directories or
inflate the essay into a general survey.

An essay may explain a complete algorithm, a difficult system boundary, an
interaction model, a family of related rules, or the rationale behind a
non-obvious constraint. It does not need to introduce all of Dreamtides or
enumerate every neighboring rule.

### 6. Write the resolved design

Write plain, active, present-tense prose for a technical audience. Introduce
the game context before internal machinery. Use specific nouns and gameplay
verbs. Prefer a direct rule or state transition over a claim about experience,
clarity, importance, or philosophy.

Explain algorithms through their gameplay question, inputs, output, ordering,
selection domain, and visible or persistent results. Include constants and
edge cases only when an implementation needs them to reproduce the behavior.
Do not write source code or pseudocode.

Keep the essay independent of implementation platform and storage strategy.
Do not promote each source type or helper into a design concept. Name a
technical object only when it has distinct identity, state, behavior,
multiplicity, or a boundary a clean implementation must preserve.

State rationale after the rule it explains. Preserve exactness without
recording the research trail, implementation history, rejected alternatives,
or unresolved possibilities.

Prefer bullets for three or more sibling attributes, options, effects, or
recorded facts. Use numbered steps when order matters. Keep causal explanation
in prose.

### 7. Audit terminology and links

At each specialized term's first useful occurrence, define it, give a brief
parenthetical explanation, or link to the essay or project document that
defines it. Bold a term once when the prose gives its first real definition.
Write common game terms in lowercase and reserve capitals for proper names.

DDA has no central glossary. Each essay must provide enough local context to
stand alone. Add cross-links only when they remove duplicated explanation or
give the reader a genuine next step. Do not make an essay depend on an imagined
complete anthology.

### 8. Use prototype images selectively

Publish an image only when it materially helps a reader recognize a screen or
understand a spatial relationship. Follow
`docs/journey_prototype/qa_tooling.md`, capture canonical player-facing output
without debug or platform chrome, and inspect it. Keep the local binary outside
the repository.

Run the publisher with the arguments shown by:

```bash
node .llms/skills/dda/scripts/publish-image.mjs --help
```

Paste its reference-style Markdown beside the prose it supports. Never invent
a URL, commit an image binary, or leave an image placeholder. If publishing is
unavailable, omit the image and report the blocker outside DDA.

### 9. Format and validate

Run from the repository root:

```bash
node .llms/skills/dda/scripts/measure-essays.mjs
node .llms/skills/dda/scripts/format-markdown.mjs --write
node .llms/skills/dda/scripts/format-markdown.mjs --check
```

Resolve every error and inspect every warning. Review the formatted diff for
factual accuracy, focus, undefined terms, accidental title case, platform
leakage, vague prose, unnecessary repetition, and broken reading paths.

Perform four final checks:

- **Focus:** The essay answers one difficult design question and does not
  expand toward comprehensive coverage.
- **Opening:** The opening gives enough game context to understand the subject
  before introducing specialized machinery.
- **Abstraction:** Every named algorithm or object represents a real design
  distinction rather than mirroring source structure.
- **Resolution:** The essay presents one resolved design without TODOs,
  alternatives, speculation, or an implementation diary.

Finish only when the essay stands alone at its chosen scope, the technical
depth is proportional to the design problem, every specialized term is handled
at first use, directly affected essays agree, the index lists the essay, and
the checker passes.
