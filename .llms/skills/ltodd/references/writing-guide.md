# LToDD Writing Guide

Read this guide before researching, creating, or revising any LToDD chapter. It
defines the book's canon, editorial standard, presentation boundary, and
navigation contract.

## Contents

- [Canon and scope](#canon-and-scope)
- [Clean design from prototype evidence](#clean-design-from-prototype-evidence)
- [Information density and precision](#information-density-and-precision)
- [Terminology and authored data](#terminology-and-authored-data)
- [Screens, outcomes, and Cumulus](#screens-outcomes-and-cumulus)
- [Chapter organization](#chapter-organization)
- [Discovery and cross-references](#discovery-and-cross-references)
- [Worked examples](#worked-examples)
- [Prototype images](#prototype-images)
- [Completion standard](#completion-standard)

## Canon and scope

Describe the intended production game presented at the root, `/main`,
`/loading`, and `/tutorial` routes. Cover the default single-player experience:
its rules, algorithms, state, content semantics, interaction outcomes,
game-design philosophy, and non-obvious UI algorithms and philosophy.

LToDD supplements the playable prototype and Cumulus documentation. Assume the
reader uses the prototype for detailed visual and interaction behavior and the
Cumulus documentation for component appearance, standard behavior, and APIs.
Give each meaningful screen and outcome enough concise coverage to orient that
research, but do not duplicate what those companion references make obvious.

Describe one canonical design. Do not discuss alternative implementations,
discarded behavior, editor tools, scripts, test infrastructure, debug controls,
or multiplayer and co-op behavior. Treat a deliberately designed loading state
as game content. Treat incidental network, invalid-data, and prototype recovery
states as implementation concerns unless the user explicitly establishes one as
part of the game design.

Treat Tide membership as manually curated authored data. Do not describe draft
records, document frequency, IDF, the construction of `tides4`, or any algorithm
derived from those materials. When production logic currently depends on such an
algorithm, describe the clean version-controlled TOML input that supplies the
resulting design behavior.

Assume the shipped TOML files, playable prototype, and Cumulus documentation
accompany LToDD as part of the implementation package. A chapter may name a
stable TOML file or key when that helps define the interface between authored
data and game behavior. Explain the key's meaning, constraints, and
consumption. Do not copy its current value or enumerate its entries. State fixed
design constants in prose when they are intrinsic rules rather than mutable
authored configuration.

## Clean design from prototype evidence

Use the prototype to determine observable behavior and terminology, not
architecture. The production UI is the reader's detailed reference for screens,
interactions, and motion. Code and data expose rules and non-obvious UI
algorithms that playing cannot. Logs can reveal how a production algorithm
reached a particular decision.

Do not assume source modules, types, identifiers, or data shapes form a good
explanatory model. Replace legacy iteration with the simplest coherent model
that reproduces the intended behavior. Preserve consequential ordering,
randomness, state transitions, persistence, and algorithmic choices even when
the new description groups them differently.

When observed behavior, source logic, existing chapters, and apparent intent
conflict, stop and ask the user which design is canonical. Do not canonize a bug
or silently substitute an inferred ideal. Publish only the resolved design.

Keep research provenance out of the book. Do not cite source files, symbols,
legacy Markdown, temporary notes, test fixtures, or debug routes. Link to TOML
interfaces, other LToDD chapters, and durable external design references only
when they are part of the clean implementation package.

## Information density and precision

Write for an expert implementer who knows game development, can play the
prototype, and can read Cumulus component documentation, but does not know
Dreamtides or its TypeScript source. Introduce concepts with compact sentences,
then use bullets, numbered lists, or narrow tables when enumeration is clearer.
Prefer one precise statement over several qualifying sentences.

Make every non-obvious rule, algorithm, state transition, and design decision
explicit. The prototype may own visible presentation detail, and Cumulus may
own standard component behavior. Do not rely on genre convention,
implementation habits, or the reader's intuition to supply an unstated gameplay
or algorithmic requirement.

Describe behavior in plain, active, present-tense prose. Do not use RFC
keywords, discuss permitted variants, or present multiple designs. Put each
decision beside the rationale and consequences that make it intelligible.

Specify all details needed to reproduce the canonical system, including:

- inputs, outputs, preconditions, and state ownership;
- rules, invariants, and meaningful edge cases;
- evaluation and resolution order;
- random selection domains and when randomness is sampled;
- persistence boundaries and transitions between durable states;
- algorithmic structure and internal models that materially explain behavior;
- a concise description of every meaningful player choice and outcome;
- non-obvious UI selection, placement, coordination, and interruption rules;
- the design goal or player experience behind consequential decisions.

Include implementation detail when it expresses a stable, useful clean-rewrite
contract. Exclude details that merely recite TypeScript, React, DOM structure,
source file ownership, normal component composition, or temporary prototype
machinery. Describe an algorithm through exact prose, ordered steps, equations,
or compact tables at the highest level that preserves its contract. Do not write
pseudocode.

Do not include source code, pseudocode, diagrams, or Mermaid. Use exact prose,
ordered steps, equations, or compact tables when an algorithm needs formal
detail. Keep tables narrow enough for the 80-column limit; use lists when a
table would become wide or sparse.

Remove repetition, throat-clearing, generic advice, and implementation trivia.
Split a chapter only when it contains genuinely separate subjects after this
editing pass. A complete short chapter is preferable to padding toward the
typical length of roughly 250 lines.

## Terminology and authored data

Use the names players see in the game. Never substitute a source-only label
because it is convenient or familiar to the current implementation. When the UI
has no term for a concept necessary to explain the design, introduce one clear
implementation-neutral term, define it immediately, and add it to the glossary.

Functionally exclude references to specific cards, Dream Avatars, Dreamsigns,
Tides, encounters, or other authored entries. The accompanying TOML catalogs own
that content. Use abstract fixtures when an example needs an entry: “assume a
Dreamsign exists with this ability.” Do not reproduce names, UUIDs, catalog
values, or current curated lists.

Use `glossary.md` as the canonical alphabetical terminology catalog. Give each
term a concise definition and link its primary chapter. Still explain an
essential term in local context when a reader needs it to understand the
surrounding section.

## Screens, outcomes, and Cumulus

Treat the prototype and Cumulus documentation as companion parts of the design.
Read the Cumulus skill and relevant references before describing a screen or
interaction. Use established Cumulus names rather than inventing nearly
equivalent visual concepts.

For each meaningful screen or screen family:

- give one or two sentences explaining its role, principal interaction, and
  handoff;
- briefly name every Cumulus component visible on it;
- describe each distinct player choice or outcome in one concise sentence,
  including the semantic result and durable consequence; and
- use a representative screenshot selectively when it materially helps the
  reader recognize the screen or understand a spatial relationship.

Delegate component appearance, APIs, material, typography, spacing, ordinary
press and focus behavior, and generic motion to Cumulus. Do not explain normal
React composition or restate how a component works.

State the governing animation and choreography philosophy once near the start
of the relevant chapter or flow. Individual screens and outcomes do not need
shot-by-shot motion, timing, easing, or routine transition descriptions. Explain
motion locally only when it communicates a hidden rule, changes gameplay state,
or participates in a non-obvious coordination algorithm.

Fully specify UI algorithms that cannot be recovered simply by playing. Common
examples include safe-area avoidance, responsive mode selection, object and
Info Card positioning, collision resolution, reveal coordination, priority,
interruption, and focus or input routing with game-specific consequences. Give
their inputs, ordering, invariants, meaningful constants, edge cases, and
rationale in exact high-level prose rather than pseudocode.

Discuss mouse, keyboard, touch, controller, or accessibility behavior when it
changes the canonical interaction or relies on a non-obvious screen-specific
rule. Delegate standard input, focus, contrast, text scaling, and reduced-motion
contracts to Cumulus. Avoid web-platform concepts such as CSS layout, DOM
events, browser storage, and React component structure.

## Chapter organization

Keep `ltodd/index.md` and `ltodd/glossary.md` at the book root. Place every
ordinary chapter exactly one level down as
`ltodd/<part_name>/<chapter_name>.md`. Use lowercase underscore names without
numeric prefixes for both parts and chapters. A chapter contains no YAML
frontmatter, version label, update date, authorship, research notes, or design
history. Git owns history.

Make each part a coherent, discoverable subject area such as Cumulus or sites.
Reuse an existing part whenever its scope fits. Create a part when the new
subject would otherwise make an existing part incoherent; do not create a
directory merely to hold one arbitrarily isolated chapter.

Begin each chapter with exactly one level-one title. Follow it with a compact
opening paragraph that answers:

- what the chapter specifies;
- when an implementer should read it; and
- which adjacent chapters own prerequisites or intentionally separated detail.

Choose the remaining structure around the subject's important design decisions.
Do not force universal headings or include empty sections. Use the structural
patterns in `content-patterns.md` as adaptable examples.

Keep every physical line at 80 columns or fewer. An unbreakable external URL in
a reference definition is the sole exception. Keep every chapter, including
blank lines and published images, at 500 lines or fewer. The line cap applies
to `glossary.md`; `index.md` is the book catalog rather than a chapter.

## Discovery and cross-references

Make `index.md` the authoritative reading order and discovery map. Start it with
the book title and a compact “How to read this book” paragraph that tells an
implementer to choose a part and chapter by scope, then follow local links for
prerequisites or deeper systems.

Give every part a heading, a concise scope statement, and an ordered list of its
chapters in canonical reading order. List every ordinary chapter exactly once
under its part. Give each entry the chapter's exact title, its stable path link,
and a short scope statement answering “when should I read this?” List
`glossary.md` exactly once as a book-level reference. Do not place authorship,
status, planning notes, or dates in the index.

Give each concept a primary chapter, then repeat the exact facts and constraints
a reader needs locally. Link to the primary chapter for the complete system.
Never force a reader to assemble a critical rule from scattered references. When
a repeated fact changes, update every occurrence in the same change.

Prefer links that clarify ownership or reading order. Avoid link density that
turns ordinary prose into a navigation list.

## Worked examples

Add a concrete one- or two-sentence example when a gameplay flow, algorithm, or
interaction has multiple state changes. Use another example only to reveal a
materially different branch or edge case. Omit an example when it would simply
repeat a static description.

Use abstract content fixtures rather than named catalog entries. State the
minimum initial conditions, walk through the meaningful change, and name the
observable result. Keep examples canonical; do not introduce a hypothetical
variant of the design.

## Prototype images

Include a live prototype screenshot when it materially helps the reader
recognize a screen, follow a flow, or understand a spatial relationship or
non-obvious UI algorithm. Use images selectively. A chapter or screen family
usually needs no more than one representative view; add another only when it
communicates a distinct fact that prose and hands-on use of the prototype do not
make clear. Do not document every outcome, viewport, transient state, or motion
key moment with an image.

Every image shows canonical player-facing presentation at a deliberate desktop
or narrow viewport. Exclude debug controls, browser chrome, annotations,
pointer highlights, and incidental loading or error states. Capture at 2x device
scale, verify the dimensions, inspect the rendered image, and confirm the
prototype error buffer is empty before publishing it.

Publish the inspected binary with the skill's `publish-image.mjs` helper. It
stores the image in the project's public Google Cloud Storage bucket beneath
the chapter's content-addressed `ltodd/<part>/<chapter>/` namespace and prints
the required reference-style Markdown. Keep binaries outside version control.

Place the image beside the prose it supports, followed immediately by a concise
italic caption. Give the image useful alt text that describes the visible
evidence. Keep its generated URL reference in the same chapter. Screenshots may
carry ordinary visual detail because the prototype is a companion reference;
all non-obvious rules and algorithms still belong in prose.

Every committed image link resolves to the project's public bucket. Do not
commit image-plan comments, local file paths, invented URLs, expiring signed
URLs, or output from the publisher's dry-run mode. When a suitable canonical
capture is unavailable, omit the image and report the blocker outside the book.

## Completion standard

Before finishing an LToDD change, confirm that:

- the prose describes one resolved canonical design;
- every affected chapter and duplicated rule agrees;
- the index scope statements and reading order remain accurate;
- the glossary contains every introduced or changed project term;
- non-obvious behavior, algorithms, and rationale are locally complete;
- every gameplay and algorithmic requirement is explicit rather than implied;
- consequential game-design and UI-design philosophy is stated beside the
  behavior it explains;
- every meaningful screen and outcome has concise orienting coverage;
- screens briefly name their visible Cumulus components and delegate standard
  behavior and APIs to Cumulus documentation;
- detailed presentation and choreography are left to the prototype;
- UI algorithms are specified with enough precision to reproduce their
  decisions without reading TypeScript;
- TOML references describe stable interfaces without copying current values;
- no specific authored content, excluded system, or web implementation leaks
  into the chapter;
- every worked example and prototype image adds distinct information;
- no TODO, alternative, uncertainty, or speculative claim remains; and
- the formatter and checker pass after all warnings are reviewed.
