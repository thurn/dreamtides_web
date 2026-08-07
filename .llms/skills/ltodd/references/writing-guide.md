# LToDD writing guide

Read this guide before researching, creating, or revising any LToDD chapter. It
defines the book's audience, evidence rules, explanatory order, prose style,
terminology, and completion standard.

## Contents

- [Audience and purpose](#audience-and-purpose)
- [Canon and research evidence](#canon-and-research-evidence)
- [Explain the game before the machinery](#explain-the-game-before-the-machinery)
- [Plain technical prose](#plain-technical-prose)
- [Terminology and first use](#terminology-and-first-use)
- [Technical models earn their names](#technical-models-earn-their-names)
- [Implementation-neutral contracts](#implementation-neutral-contracts)
- [Algorithms, rules, and rationale](#algorithms-rules-and-rationale)
- [Authored data](#authored-data)
- [Screens, outcomes, and Cumulus](#screens-outcomes-and-cumulus)
- [Parts, chapters, and size](#parts-chapters-and-size)
- [Cross-references and the glossary](#cross-references-and-the-glossary)
- [Examples, tables, and symbols](#examples-tables-and-symbols)
- [Prototype images](#prototype-images)
- [Editorial audit](#editorial-audit)

## Audience and purpose

Write for a technical contributor who understands software and game
development but has no prior Dreamtides context. The reader should not need to
know the source tree, internal type names, or project history.

LToDD explains the intended production game. Cover the concepts, lifecycle,
rules, algorithms, state changes, content semantics, and non-obvious reasons an
implementation needs. Give enough screen and interaction context to connect
those rules to the playable game. Leave detailed visual presentation and
standard component behavior to the prototype and Cumulus documentation.

The book is neither a pitch nor a complete implementation specification. Its
job is to teach the system accurately and efficiently. If a detail does not
help the reader understand or reproduce the design, omit it.

## Canon and research evidence

Use the production flow to learn observable behavior and terminology. Use code,
data, and logs to uncover hidden rules, ordering, random choices, state changes,
and edge cases. Research behavior across modules rather than assuming one type
or directory owns the concept.

Treat evidence as follows:

- Explicit user decisions define the intended design.
- Existing LToDD is canonical until the requested change revises it.
- Production behavior and authored data establish the current system.
- Code and logs explain behavior that cannot be learned by playing.
- Battle rules are a trusted secondary source for battle.
- Other Markdown documents are research leads that require verification.

Ask the user only when unresolved evidence supports materially different
designs. State the exact conflict and show a concrete example of the differing
result. Do not ask broad questions about goals, values, or experience when a
specific rule is what needs a decision.

Present the resolved design, not the research trail. Do not cite source files,
symbols, tests, debug routes, temporary notes, or legacy documents in a
chapter. Do not describe removed behavior or compare the current design with an
older version.

Use neutral language when current behavior differs from the intended design.
Do not label a status, unusual data value, or implementation difference a bug
unless that classification has been established.

## Explain the game before the machinery

A primary chapter is the entry point for a part. Its first responsibility is to
teach a newcomer what the subject is and how it fits into Dreamtides.

The opening paragraphs should answer the reader's immediate questions in plain
language:

- What is this system?
- When does it operate?
- What does the player do or observe?
- What does it produce or change?

Continue in dependency order. A reliable sequence for a foundational chapter
is:

1. Give the overall purpose and normal lifecycle.
2. Introduce the first objects and resources needed to follow that lifecycle.
3. Explain choices, resolution, and outcomes in the order they occur.
4. Add rules and algorithms beside the phase where they matter.
5. Explain technical distinctions, identity, persistence, derived values, and
   deterministic randomness after their gameplay role is clear.
6. Link to adjacent chapters for systems that own deeper rules.

Do not open a general chapter with authored data shapes, runtime instances,
identifier schemes, copying rules, durable-state inventories, randomness, or a
list of invariants. Those subjects may be important later. They are rarely the
first thing a new contributor needs.

Research depth does not determine prose emphasis. A large or intricate source
subsystem may need only one paragraph in an overview. Spend words according to
what the reader must understand, not according to source line count.

## Plain technical prose

Write direct, active, present-tense sentences. Prefer concrete nouns, state
changes, conditions, and results. Match the tone of
`docs/journeys/journeys.md` and `docs/battle_rules/battle_rules.md`.

Avoid promotional, literary, or design-theory language. Adjectives such as
“meaningful,” “legible,” “transformative,” “consequential,” or “tactical” do not
explain a system by themselves. Replace them with the exact rule or result.

Do not write:

> The loop creates a meaningful tactical rhythm in which every choice reshapes
> the experience.

Write the observable sequence:

> After each battle, the player chooses one reward. The chosen reward changes
> the deck used by later battles.

Use rationale when it explains a non-obvious rule. State the rule first, then
the specific problem it prevents or property it preserves. Omit generic claims
that a rule improves clarity, agency, pacing, or strategy unless the next
sentence identifies exactly how.

Remove throat-clearing and roadmap prose. Sentences such as “This section
explores the systems that govern cards” or “The remaining sections define
shared conventions” do not help unless they name a concrete dependency or
reading choice.

Use parentheses, commas, or separate sentences for parenthetical information.
Do not enclose a parenthetical aside with em dashes. An em dash may still act as
a simple separator in a compact catalog entry.

Use sentence case for headings. Capitalize proper names such as Dreamtides and
Dream Atlas. Write common game terms such as card, battle, journey, status, and
ability in lowercase.

## Terminology and first use

Never require a new reader to infer a project term from context. At the first
use of every specialized term, do one of the following:

- define it in the same sentence;
- give a short parenthetical explanation and link to its defining section; or
- defer the term until the definition is useful.

When a concept needs a brief early mention, explain enough to continue and link
to its full treatment. For example:

> The player first chooses a **Dream Avatar**, the character that supplies the
> journey's starting deck and abilities. See [Dream Avatars](#dream-avatars).

Do not repeatedly use a term and define it several sections later. A glossary
entry does not excuse an unexplained first use in the chapter.

Bold a canonical term once, at its first real definition. Do not bold ordinary
uses, capitalize a term to make it look canonical, or turn every source type
into book vocabulary.

Prefer the shortest name that remains unambiguous in context. If “card
instance” and “battle card” distinguish two real lifetimes, use those terms.
Do not lengthen them mechanically to “journey card instance” and “battle card
instance” when the shorter terms are clear.

Before finishing, search for every named resource, symbol, status, keyword,
algorithm, object category, and identity distinction. Inspect its first
occurrence. Name a technical algorithm by kind on first use, such as “the
Xoshiro256PlusPlus pseudorandom number generator.”

Do not name-drop lists of keywords, status values, or ability categories that
the chapter does not explain. Either define the items that matter or refer to
the owning system in general terms.

## Technical models earn their names

Source code often names helper values, resolved views, adapters, and temporary
objects. These are not automatically concepts in the game design.

Create a canonical noun only when the distinction has at least one of these
properties:

- distinct identity that rules can refer to;
- state with a different lifetime or owner;
- multiplicity that changes behavior;
- rules that treat the object differently from nearby concepts; or
- a boundary a clean implementation must preserve.

For example, a persistent card instance and a battle card are distinct because
one card instance can produce several battle cards, each with independent
battle-local state. A calculated set of card values is not necessarily another
object. Explain it as “the card's resolved values” unless the design gives that
result its own identity or behavior.

Prefer composition over invented entities. State that a definition, persistent
modifications, and current context determine a card's resolved values. Do not
create an extra canonical object solely because the implementation has a type
for that calculation.

When deciding whether state should be stored directly or derived, explain the
actual design risks: loss of the base value, fragile reversal, order-dependent
stacking, context changes, copy semantics, or poor diagnostics. Do not invent a
new noun merely to discuss those risks.

## Implementation-neutral contracts

Describe the game independently of platform, application framework, and storage
format. A valid implementation may use different runtime and persistence
machinery while preserving the same design.

State what must remain true:

- which identity persists across phases;
- which state is temporary and which affects later play;
- which values must be restored to continue the same game;
- which random generator and full generator state determine future results;
- which operations may create multiple independent copies; and
- which ordering affects the result.

Do not prescribe browser actions, URLs, framework state, event-log reduction,
database layout, file format, or serialization strategy. Avoid implementation
terms such as reload, reducer, fold, component state, or storage key when the
design requirement is simply that a game can resume with the same state.

A stable authored TOML key may be named when it forms part of the implementation
package. Explain its meaning and constraints, but do not let the source shape
dictate the chapter's conceptual model.

## Algorithms, rules, and rationale

Explain an algorithm at the highest level that still lets a clean
implementation reproduce the intended result. Include only the relevant parts
of this contract:

- inputs and preconditions;
- output or state change;
- evaluation and resolution order;
- selection pool and exclusions;
- when randomness is sampled;
- fixed constants that are intrinsic rules;
- edge cases that change an outcome; and
- the reason for a non-obvious constraint.

Use ordered steps when order matters, equations when a formula is the clearest
expression, and narrow tables for exact mappings. Do not write source code,
pseudocode, type signatures, or source-oriented control flow.

Keep a rule beside the phase where it operates. Do not collect unrelated rules
into an “invariants” section merely because they are easy to enumerate. A short
summary table is useful only when it helps compare several rules already
explained in context.

Explain randomness next to the choice it affects. Distinguish deterministic
reproduction from a persistence mechanism. State the generator and the state
that controls future draws without specifying how that state is stored.

## Authored data

Treat authored catalogs as accompanying implementation inputs. Explain the
meaning and constraints of stable fields when they are needed to implement the
rules. Do not reproduce current catalog entries, curated lists, names, UUIDs,
or mutable values in prose.

Use abstract examples when an authored entry is needed. Describe “a card with a
cost-reduction ability” rather than naming a current card. Card names are not
unique and never identify cards in technical reasoning.

Treat Tide membership as manually curated authored data. Do not describe draft
record corpora, frequency metrics, historical derivation, or experimental pool
construction. Describe the canonical authored input consumed by the game.

## Screens, outcomes, and Cumulus

Use the prototype to understand visible behavior and the handoff between game
states. Use Cumulus documentation for standard component presentation and
interaction.

For each screen or screen family that materially helps explain the flow:

- state its role in the larger system;
- describe the principal choice or interaction;
- state the semantic result and any later effect; and
- explain only the non-obvious selection, placement, coordination, or
  interruption algorithms.

Name Cumulus components only when the name helps a contributor connect the
chapter to the shared design system. Do not inventory every component by
default, reproduce APIs, or narrate routine presentation and motion.

Discuss input methods or accessibility behavior only when a game-specific rule
changes. Leave standard focus, contrast, text scaling, and reduced-motion
contracts to Cumulus.

## Parts, chapters, and size

Organize the book as part directories beneath `ltodd/`. Each part contains one
primary chapter whose filename matches the directory and may contain selected
supplements. Keep `index.md` and `glossary.md` at the root.

The primary chapter explains the complete subject at onboarding depth. It must
stand alone, but “complete” does not mean every internal edge case or data
structure. It means the reader understands what the system is, how its main
flow works, which rules define it, and where linked systems take over.

A supplement owns one focused system whose complexity would otherwise obscure
the primary chapter. It is not a place to move ordinary explanation, screen
catalogs, or source-module details.

Begin every chapter with exactly one level-one title followed by a plain prose
opening. Use lowercase underscore filenames and no frontmatter, dates,
authorship, research notes, or design history. Keep physical lines at 80
columns except for unbreakable external URLs.

Use 20,000 Unicode characters as a loose planning reference only. A clear
chapter may be much shorter. Never add examples, tables, rationale, or technical
detail to approach that size. The hard limit is 40,000 characters for an
ordinary chapter.

## Cross-references and the glossary

Use `index.md` as the authoritative reading order and ownership map. Each part
gets a short purpose statement, its primary chapter first, then selected
supplements. Scope statements should tell a reader when the chapter is useful.

Link sections when the reading dependency is real:

- Link an early brief definition to its fuller section.
- Link to another chapter that owns a prerequisite or a deeper system.
- Link repeated local facts to the chapter that owns the complete rule.

Do not use links as a substitute for the sentence needed to understand the
current paragraph. Do not scatter a critical rule across several chapters.
Avoid turning ordinary prose into a dense navigation list.

Add a glossary entry for stable Dreamtides vocabulary used across contexts.
Define the term compactly and link its owning primary chapter. Do not add source
synonyms, one-off helper labels, derived views, or every bold phrase.

## Examples, tables, and symbols

Use a concrete example when it clarifies multiple state changes, identity,
multiplicity, ordering, or an edge case. State the minimum initial conditions,
walk through the relevant change, and name the result. Omit examples that only
repeat the preceding sentence.

Use tables for exact mappings and comparisons. Put a symbol directly in the
symbol table that defines it. Do not explain a missing row in prose.

Keep examples abstract rather than naming authored catalog entries. Use actual
parentheses for short clarifications when they improve first-use definitions.

## Prototype images

Use a live prototype image only when it helps the reader recognize a screen or
understand a spatial relationship that prose does not convey efficiently. Most
chapters do not need an image for every state or flow.

Show canonical player-facing presentation without debug controls, annotations,
pointer highlights, or platform chrome. Inspect the image before publishing and
confirm the prototype reports no render or console errors. Keep image binaries
outside version control.

Publish through the skill helper. Place the generated reference-style Markdown
beside the supporting prose, with useful alt text and a concise italic caption.
Do not commit local paths, invented URLs, temporary links, or image
placeholders.

## Editorial audit

Read the completed chapter once as a newcomer and once as an implementer.

During the newcomer pass, verify:

- the opening explains the subject before using specialized vocabulary;
- the main lifecycle appears before narrow technical machinery;
- every specialized term is defined, briefly explained and linked, or deferred
  at first use;
- common game terms are lowercase and first definitions are bolded once;
- cross-links appear where a concept precedes its full treatment;
- no vague roadmap sentence, pitch language, or ornamental phrasing remains;
- parenthetical asides use parentheses, commas, or separate sentences; and
- the chapter is concise enough that the important concepts remain prominent.

During the implementation pass, verify:

- rules, inputs, ordering, state changes, and edge cases are exact where needed;
- source helpers have not become unnecessary canonical concepts;
- identity distinctions correspond to real lifetime, multiplicity, or behavior;
- platform, framework, storage, and serialization choices do not leak in;
- user decisions are represented even when implementation evidence differs;
- terminology is consistent with the glossary and adjacent chapters;
- tables contain every symbol or mapping they claim to define;
- examples add information rather than padding; and
- no TODO, alternative design, uncertainty, or speculative claim remains.

Finally, search the corpus for changed terms and duplicated rules, update the
index and glossary, run the formatter and checker, and inspect every warning.
