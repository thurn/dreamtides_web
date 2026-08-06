# LToDD Content Patterns

Read this reference when planning a new chapter, reorganizing a chapter, or
adding an image brief. The patterns illustrate useful shapes for different
subjects. They are not templates, required headings, or reusable game content.

## Contents

- [Choosing a shape](#choosing-a-shape)
- [Gameplay-system pattern](#gameplay-system-pattern)
- [Screen-and-flow pattern](#screen-and-flow-pattern)
- [Cross-cutting-principle pattern](#cross-cutting-principle-pattern)
- [Opening scope paragraphs](#opening-scope-paragraphs)
- [Index catalog entries](#index-catalog-entries)
- [Glossary entries](#glossary-entries)
- [Image briefs](#image-briefs)

## Choosing a shape

Find the chapter's central reader question before choosing headings. A useful
structure makes the answer and its rationale easy to locate. Combine or discard
the patterns when the subject demands a different sequence.

Prefer sections that name a meaningful decision or phase of play. Avoid
component inventories, one heading per source module, and generic buckets that
separate every rule from its rationale.

## Gameplay-system pattern

Use this shape when the chapter explains rules, state, or an algorithm that
operates across several screens.

A compact progression often works:

1. Open with the system's purpose and when it matters to the player.
2. Establish the player-facing concepts and durable state.
3. Explain the normal sequence in resolution order.
4. Place each major choice or constraint beside its design reason.
5. Describe randomness, ordering, and persistence near the step they affect.
6. Cover only edge cases that materially change an outcome.
7. Close a complex sequence with a one- or two-sentence worked example.
8. Link presentation-heavy phases to the chapters that own their screens.

Good section titles name the decisions: “Offers preserve commitment,” “Payment
follows selection,” or “The result persists at departure.” They tell the reader
more than “Logic,” “State,” or “Implementation.”

## Screen-and-flow pattern

Use this shape when the chapter explains one player destination and the flow
through it.

Start with the screen's role in the larger journey and the state on arrival.
Then follow the player's attention and actions:

1. Establish the initial composition and strongest visual focus.
2. Explain what information is visible before interaction and why.
3. Follow the normal action sequence in player order.
4. Describe state-dependent composition at the point where state changes.
5. Name standard Cumulus primitives and animations instead of restating them.
6. Explain screen-specific layout, transition, and interruption logic.
7. Integrate desktop or narrow-layout differences beside the affected element.
8. End at the handoff into the next canonical game state.

Do not turn the chapter into a list of visible components. The composition
exists to support decisions, attention, anticipation, and feedback; explain
those relationships.

## Cross-cutting-principle pattern

Use this shape for a design rule that governs many systems, such as information
disclosure, commitment, pacing, or the physical treatment of game objects.

Lead with the principle and the player experience it protects. Organize the body
around its consequences:

1. Define the principle in concrete Dreamtides terms.
2. Explain the pressure or failure mode it addresses without recounting design
   history.
3. State how the principle constrains rules, presentation, and interaction.
4. Show its application in a few distinct contexts through internal links.
5. Define genuine boundaries so authors do not overapply it.

Repeat a locally necessary constraint in each affected chapter. Use this chapter
as the primary explanation of why those repeated constraints form one system.

## Opening scope paragraphs

Place a compact paragraph immediately after the level-one title. Answer what the
chapter specifies, when to read it, and where adjacent detail lives.

An effective paragraph has this information shape:

> This chapter specifies how a journey chooses and resolves its next
> destination. Read it when implementing destination availability, player
> commitment, or the handoff into a site. Read the linked presentation chapter
> for the shared map primitives and their standard motion.

Adapt the prose to the subject. Do not repeat these sentences mechanically.

## Index catalog entries

Use one ordered-list entry for every chapter. Write the exact chapter title,
stable underscore filename, and one sentence explaining when to read it.

Use this shape:

> 1. [Chapter Title](chapter_name.md) — Read this chapter when building the
>    behavior named by its concise scope statement.

Keep the entries in authoritative reading order. Include `glossary.md` exactly
once. Keep planning state, authorship, dates, and chapter numbers out of entries
and filenames.

## Glossary entries

Use one level-two heading per term and sort headings alphabetically. Define the
user-facing term in one compact paragraph. Link the primary chapter that owns
its complete rules or presentation.

Prefer definitions that distinguish nearby concepts and state their gameplay
role. Avoid source synonyms, abbreviations that players never see, and copied
catalog entries.

## Image briefs

Place a brief exactly where the later image should appear. Use this syntax:

```markdown
<!-- ltodd-image
Purpose: Why this image materially improves implementation confidence.
State: The exact game state and action needed to stage the image.
Framing: Viewport, crop, and spatial focus.
Details: The visible relationships or motion key moment that must be clear.
Alt text: Concise replacement text describing the evidence in the image.
Caption: Concise context that complements rather than repeats the prose.
-->
```

Keep every field on one physical line and within 80 columns. Use multiple briefs
instead of overloading one field with several states. The checker rejects
missing, reordered, empty, duplicated, or unknown fields.

When durable image hosting is available, replace the complete comment with a
Markdown image using the proposed alt text and stable external URL. Put the
caption immediately below it. Keep the surrounding prose unchanged unless the
image review exposes a factual error.
