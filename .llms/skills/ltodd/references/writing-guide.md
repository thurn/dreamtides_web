# LToDD Writing Guide

Read this guide before researching, creating, or revising any LToDD chapter. It
defines the book's canon, editorial standard, presentation boundary, and
navigation contract.

## Contents

- [Canon and scope](#canon-and-scope)
- [Clean design from prototype evidence](#clean-design-from-prototype-evidence)
- [Information density and precision](#information-density-and-precision)
- [Terminology and authored data](#terminology-and-authored-data)
- [Presentation through Cumulus](#presentation-through-cumulus)
- [Chapter organization](#chapter-organization)
- [Discovery and cross-references](#discovery-and-cross-references)
- [Worked examples](#worked-examples)
- [Image briefs](#image-briefs)
- [Completion standard](#completion-standard)

## Canon and scope

Describe the intended production game presented at the root, `/main`,
`/loading`, and `/tutorial` routes. Cover the default single-player experience:
its rules, algorithms, state, content semantics, interaction, visual
presentation, motion, and design philosophy.

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

Assume the shipped TOML files accompany LToDD as part of the implementation
package. A chapter may name a stable TOML file or key when that helps define the
interface between authored data and game behavior. Explain the key's meaning,
constraints, and consumption. Do not copy its current value or enumerate its
entries. State fixed design constants in prose when they are intrinsic rules
rather than mutable authored configuration.

## Clean design from prototype evidence

Use the prototype to determine behavior, not terminology or architecture. The
production UI is strong evidence for player-facing presentation and names. Code
and data expose rules that the UI cannot. Logs can reveal how a production
algorithm reached a particular decision.

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

Write for an expert implementer who knows game development but does not know
Dreamtides. Introduce concepts with compact sentences, then use bullets,
numbered lists, or narrow tables when enumeration is clearer. Prefer one precise
statement over several qualifying sentences.

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
- player choices, feedback, and consequences;
- composition, responsive changes, and meaningful motion; and
- the design goal or player experience behind consequential decisions.

Include implementation detail when it expresses a stable, useful clean-rewrite
contract. Exclude details that merely recite TypeScript, React, DOM structure,
source file ownership, or temporary prototype machinery.

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

## Presentation through Cumulus

Treat Cumulus as the canonical design language. Read its current skill and the
references for each relevant primitive before describing a screen or
interaction. Use established Cumulus names rather than inventing nearly
equivalent visual concepts.

Delegate a primitive's standard material, typography, spacing, press feedback,
focus treatment, and generic motion to Cumulus. Specify the chapter-specific
composition:

- which Cumulus primitives appear and what content each carries;
- their visual hierarchy, grouping, placement, and spatial relationships;
- the player state that selects each variation;
- meaningful responsive rearrangement or visibility changes;
- screen-specific interaction and state progression;
- meaningful transitions into, within, and out of the experience; and
- every deliberate departure that belongs to the screen rather than Cumulus.

For a standard animation, name the Cumulus animation and let its definition own
timing, easing, interruption, and generic ordering. Describe custom motion only
where screen-specific logic adds a distinct trigger, sequence, state change, or
gameplay meaning.

Describe presentation precisely enough to recreate it without images. Images
support the prose; they never carry a requirement that the prose omits. Discuss
mouse, keyboard, touch, or controller actions directly when they are part of the
canonical interaction. Avoid web-platform concepts such as CSS layout, DOM
events, browser storage, and React component structure.

Include accessibility behavior when it affects the canonical interaction or
presentation. Describe relevant input alternatives, focus order, readable
contrast, non-color cues, text scaling, reduced motion, and equivalent
communication for audio or animation. Recover or confirm the intended behavior
rather than designing an unrelated accessibility system during authoring.

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
blank lines and image briefs, at 500 lines or fewer. The line cap applies to
`glossary.md`; `index.md` is the book catalog rather than a chapter.

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

## Image briefs

Insert an image brief near the prose it will support. Add one wherever a visual
state, spatial relationship, responsive branch, or animation key moment would
materially improve implementation confidence. Use no quota.

Keep the prose independently complete. Give the brief enough information for a
later author to stage and capture the exact evidence: purpose, game state,
framing, important visible details, alt text, and caption. Follow the exact
syntax in `content-patterns.md` so the checker can validate it.

Image binaries remain outside version control. Replace a brief only after its
image has a durable external URL, useful alt text, and a concise caption.

## Completion standard

Before finishing an LToDD change, confirm that:

- the prose describes one resolved canonical design;
- every affected chapter and duplicated rule agrees;
- the index scope statements and reading order remain accurate;
- the glossary contains every introduced or changed project term;
- behavior and rationale are locally complete;
- presentation delegates standard behavior to the correct Cumulus definitions;
- TOML references describe stable interfaces without copying current values;
- no specific authored content, excluded system, or web implementation leaks
  into the chapter;
- every worked example and image brief adds distinct information;
- no TODO, alternative, uncertainty, or speculative claim remains; and
- the formatter and checker pass after all warnings are reviewed.
