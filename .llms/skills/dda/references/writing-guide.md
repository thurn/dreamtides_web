# DDA writing guide

Read this guide before researching, creating, or revising a Dreamtides Design
Anthology essay. It defines the anthology's audience, evidence rules,
explanatory style, terminology, and completion standard.

## Contents

- [Audience and purpose](#audience-and-purpose)
- [Canon and research evidence](#canon-and-research-evidence)
- [Choose a narrow question](#choose-a-narrow-question)
- [Plain technical prose](#plain-technical-prose)
- [Terminology and first use](#terminology-and-first-use)
- [Technical models earn their names](#technical-models-earn-their-names)
- [Implementation-neutral contracts](#implementation-neutral-contracts)
- [Algorithms, rules, and rationale](#algorithms-rules-and-rationale)
- [Authored data](#authored-data)
- [Screens, outcomes, and Cumulus](#screens-outcomes-and-cumulus)
- [Anthology structure and size](#anthology-structure-and-size)
- [Cross-references and the index](#cross-references-and-the-index)
- [Examples, tables, and symbols](#examples-tables-and-symbols)
- [Prototype images](#prototype-images)
- [Editorial audit](#editorial-audit)

## Audience and purpose

Write for a technical contributor who understands software and game
development but has no prior Dreamtides context. The reader should not need to
know the source tree, internal type names, or project history.

DDA explains selected parts of the intended production game whose rules,
algorithms, boundaries, or rationale benefit from sustained treatment. Each
essay covers one difficult subject well. The anthology is not a complete game
manual, a source inventory, a product pitch, or a transcript of the prototype.

Give enough surrounding game context to make the essay stand alone. Leave
routine neighboring rules to the game, another essay, or trusted project
documentation. If a detail does not help the reader understand or reproduce
the focused design, omit it.

## Canon and research evidence

Use the production flow to learn observable behavior and terminology. Use
code, data, and logs to uncover hidden rules, ordering, random choices, state
changes, and edge cases. Research across modules rather than assuming one type
or directory owns the concept.

Treat evidence as follows:

- Explicit user decisions define the intended design.
- Production behavior and authored data establish the current system.
- Code and logs explain behavior that cannot be learned by playing.
- An existing DDA essay is authoritative within its declared scope unless the
  request revises it or stronger evidence exposes a conflict.
- Battle rules are a trusted secondary source for battle.
- Other Markdown documents are research leads that require verification.

Ask the user only when unresolved evidence supports materially different
designs. State the exact conflict and show a concrete example of the differing
result. Do not ask broad questions about goals or experience when a specific
rule needs a decision.

Present the resolved design, not the research trail. Do not cite source files,
symbols, tests, debug routes, temporary notes, or legacy documents in an essay.
Do not describe removed behavior or compare the current design with an older
version.

Use neutral language when current behavior differs from intended design. Do
not label a status, unusual data value, or implementation difference a bug
unless that classification has been established.

## Choose a narrow question

An essay begins with a design question that justifies focused explanation. It
may concern a complete algorithm, a difficult boundary between systems, a
family of rules that must be understood together, a non-obvious interaction
model, or the rationale for an exact constraint.

The opening paragraphs should answer:

- What does this system or rule do?
- When does it operate?
- What does the player do or observe?
- Why is a focused account useful?
- Which adjacent rules are outside this essay's scope?

Continue in dependency order. Introduce core objects and resources only when
the argument first needs them. Explain choices, transitions, and results in
the order they occur. Put exact rules beside the phase where they operate.

Do not broaden the opening into an introduction to the whole game. Do not add
sections merely because a complete book would contain them. Research depth
does not determine prose emphasis: an intricate source subsystem may need one
paragraph, while a small but crucial rule may need most of the essay.

Follow a player-facing object's real lifecycle and use the corresponding
gameplay verb. If a site draws a card from the deck, say that it draws the
card. A data-shape description such as “the encounter contains a source card”
can conceal a materially different selection rule.

## Plain technical prose

Write direct, active, present-tense sentences. Prefer concrete nouns, state
changes, conditions, and results. Match the tone of
`docs/journeys/journeys.md` and `docs/battle_rules/battle_rules.md`.

Avoid promotional, literary, or abstract design-theory language. Adjectives
such as “meaningful,” “legible,” “transformative,” “consequential,” or
“tactical” do not explain a system by themselves. Replace them with the exact
rule or result.

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

Remove throat-clearing and roadmap prose. “This essay explores the systems that
govern cards” does not help unless it names a concrete dependency or reading
choice.

Use parentheses, commas, or separate sentences for parenthetical information.
Do not enclose a parenthetical aside with em dashes. An em dash may act as a
simple separator in an index entry.

Use sentence case for headings. Capitalize proper names such as Dreamtides and
Dream Atlas. Write common game terms such as card, battle, journey, status, and
ability in lowercase.

Prefer lists when prose carries an inventory. Turn three or more sibling
attributes, choices, effect categories, or output fields into bullets. Use
numbered steps for an ordered algorithm. Keep prose when one clause explains
why another is true.

Formatting to 80 columns is necessary but not sufficient. Inspect the Markdown
after formatting. Rewrite links or coordinated phrases that wrap into jagged
hanging fragments.

## Terminology and first use

Never require a new reader to infer a project term from context. At first use,
define the term, give a short parenthetical explanation and a useful link, or
defer it until the definition matters.

Bold a canonical term once, at its first real definition. Do not bold ordinary
uses, capitalize a term to make it look canonical, or turn every source type
into design vocabulary.

DDA has no glossary. Each essay must define the terms needed to follow its
argument. A link to another essay does not excuse an unexplained first use.

Prefer the shortest unambiguous name. If “card instance” and “battle card”
distinguish two real lifetimes, use them. Do not lengthen them mechanically when
the shorter terms are clear.

Before finishing, search for every named resource, symbol, status, keyword,
algorithm, object category, and identity distinction. Inspect its first
occurrence. Name a technical algorithm by kind on first use, such as “the
Xoshiro256PlusPlus pseudorandom number generator.”

Do not name-drop lists of keywords, status values, or ability categories that
the essay does not explain. Define the items that matter or refer to the owning
system in general terms.

## Technical models earn their names

Source code names helper values, resolved views, adapters, and temporary
objects. These are not automatically concepts in the game design.

Create a design noun only when the distinction has at least one of these
properties:

- distinct identity that rules can refer to;
- state with a different lifetime or owner;
- multiplicity that changes behavior;
- rules that treat the object differently from nearby concepts; or
- a boundary a clean implementation must preserve.

For a policy, strategy, or mode, also check whether its value varies
independently in authored production content. When almost every effect fixes
one obvious value, describe target selection as part of that effect. Do not
promote a one-to-one configuration seam into a major design concept because the
implementation makes it reusable.

For example, a persistent card instance and a battle card are distinct when
one card instance can produce several battle cards with independent
battle-local state. A calculated set of card values is not necessarily another
object. Explain it as the card's resolved values unless rules give it separate
identity or behavior.

Prefer composition over invented entities. State that a definition, persistent
modifications, and current context determine a card's resolved values. Do not
create another noun solely because the implementation has a type for the
calculation.

## Implementation-neutral contracts

Describe the game independently of platform, application framework, and
storage format. A valid implementation may use different runtime and
persistence machinery while preserving the same design.

State what must remain true:

- which identity persists across phases;
- which state is temporary and which affects later play;
- which values must be restored to continue the same game;
- which random generator and full generator state determine future results;
- which operations create independent copies; and
- which ordering affects the result.

Routine correctness is implicit. Do not document that the game validates an
ordinary submitted choice, applies a reward completely, saves a completed
action, or can reload recorded state unless that behavior introduces a
non-obvious rule, interruption boundary, or later gameplay consequence.

Do not prescribe browser actions, URLs, framework state, event-log reduction,
database layout, file format, or serialization strategy. Avoid implementation
terms when the design requirement is simply that a game can resume with the
same state.

A stable authored data key may be named when it forms part of the
implementation contract. Explain its meaning and constraints without letting
the source shape dictate the essay's conceptual model.

## Algorithms, rules, and rationale

Explain an algorithm at the highest level that lets a clean implementation
reproduce the intended result. Include only relevant parts of this contract:

- inputs and preconditions;
- output or state change;
- evaluation and resolution order;
- selection pool and exclusions;
- when randomness is sampled;
- fixed constants that are intrinsic rules;
- edge cases that change an outcome; and
- the reason for a non-obvious constraint.

Begin with one plain sentence: what gameplay question does the algorithm
answer? State when it runs and distinguish it from the effect that consumes its
output. If the distinction remains abstract, give one concrete example before
listing variants or scoring inputs.

Use ordered steps when order matters, equations when a formula is clearest,
and narrow tables for exact mappings. Do not write source code, pseudocode,
type signatures, or source-oriented control flow.

Keep a rule beside the phase where it operates. Do not collect unrelated rules
into an “invariants” section merely because they are easy to enumerate. Explain
randomness beside the choice it affects and distinguish deterministic
reproduction from a persistence mechanism.

## Authored data

Treat authored catalogs as accompanying implementation inputs. Explain stable
fields when they are needed to implement the rules. Do not reproduce mutable
catalog entries or curated lists in prose.

Use abstract examples when an authored entry helps. Describe “a card with a
cost-reduction ability” rather than naming a current card. Card names are not
unique and never identify cards in technical reasoning.

Treat Tide membership as manually curated authored data. Do not describe draft
record corpora, historical derivation, or experimental pool construction when
the essay concerns the production draft input.

## Screens, outcomes, and Cumulus

Use the prototype to understand visible behavior and handoffs between game
states. Use Cumulus documentation for standard component presentation and
interaction.

For each screen or screen family that materially helps explain the subject:

- state its role in the larger system;
- describe the principal choice or interaction;
- state the semantic result and any later effect; and
- explain only non-obvious selection, placement, coordination, or interruption
  algorithms.

Name Cumulus components only when the name connects the essay to the shared
design system. Do not inventory components, reproduce APIs, or narrate routine
presentation and motion.

Discuss input methods or accessibility behavior only when a game-specific rule
changes. Leave standard focus, contrast, text scaling, and reduced-motion
contracts to Cumulus.

## Anthology structure and size

Keep the anthology flat beneath `dda/`. Store `index.md` and every essay at the
root. Use one lowercase underscore filename per essay and no subdirectories.

The index is a discovery list. It records only essays that exist. It does not
claim full coverage, define ownership, group essays into parts, prescribe an
order, reserve future subjects, or maintain a glossary.

Begin every essay with exactly one level-one title followed by a plain prose
opening. Use no frontmatter, dates, authorship, research notes, changelog, or
design history. Keep physical lines at 80 columns except for unbreakable
external URLs.

Use 20,000 Unicode characters as a loose planning reference. A focused essay
may be much shorter. Never add examples, tables, rationale, or neighboring
systems to approach that size. The hard limit is 40,000 characters.

When the user requests a target length, that request replaces the planning
reference. Remove low-value detail before exceeding the requested scale.

## Cross-references and the index

List every existing essay once in `index.md`. Use its exact title and one
sentence that tells a reader when it is useful. Keep one flat numbered list
under the `## Essays` heading.

Use this form:

> 1. [Algorithm title](algorithm_title.md) — Read this essay when implementing
>    the focused algorithm or reasoning about its results.

Link between essays when the dependency is real:

- Link an early brief definition to a fuller treatment.
- Link to an essay that explains a prerequisite or adjacent boundary.
- Link a repeated local fact to the essay that gives the complete rule.

Do not use links as a substitute for the sentence needed to understand the
current paragraph. Do not scatter a critical rule across essays. Avoid dense
navigation lists and do not create placeholder links for subjects DDA may cover
later.

## Examples, tables, and symbols

Use a concrete example when it clarifies multiple state changes, identity,
multiplicity, ordering, an edge case, or the boundary between easily confused
abstractions. State the minimum initial conditions, walk through the relevant
change, and name the result. Omit examples that repeat the preceding sentence.

Use tables for exact mappings and comparisons. Put a symbol directly in the
table that defines it. Do not explain a missing row in prose.

Keep examples abstract rather than naming authored catalog entries. Use actual
parentheses for short clarifications when they improve first-use definitions.

## Prototype images

Use a live prototype image only when it helps the reader recognize a screen or
understand a spatial relationship that prose cannot convey efficiently. Most
essays need no image.

Show canonical player-facing presentation without debug controls,
annotations, pointer highlights, or platform chrome. Inspect the image before
publishing and confirm the prototype reports no render or console errors. Keep
image binaries outside version control.

Publish through the skill helper. Place its reference-style Markdown beside
the supporting prose, with useful alt text and a concise italic caption. Do not
commit local paths, invented URLs, temporary links, or image placeholders.

## Editorial audit

Read the completed essay once as a newcomer and once as an implementer.

During the newcomer pass, verify:

- the opening identifies the design problem and its place in the game;
- specialized vocabulary appears only after enough context to understand it;
- the essay stays focused instead of surveying adjacent systems;
- every specialized term is defined, briefly explained and linked, or deferred
  at first use;
- common game terms are lowercase and first definitions are bolded once;
- no vague roadmap, pitch language, or ornamental phrasing remains;
- dense inventories use readable bullets or numbered steps; and
- links and coordinated phrases do not leave jagged hanging fragments.

During the implementation pass, verify:

- rules, inputs, ordering, state changes, and edge cases are exact where needed;
- source helpers have not become unnecessary design concepts;
- identity distinctions correspond to real lifetime, multiplicity, or behavior;
- platform, framework, storage, and serialization choices do not leak in;
- user decisions are represented even when implementation evidence differs;
- examples add information rather than padding;
- routine correctness details are omitted; and
- no TODO, alternative design, uncertainty, or speculative claim remains.

Finally, search DDA for changed terms and duplicated rules, update the flat
index when needed, run the formatter and checker, and inspect every warning.
