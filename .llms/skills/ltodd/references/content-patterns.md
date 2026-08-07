# LToDD Content Patterns

Read this reference when planning a new chapter, reorganizing a chapter, or
publishing a prototype image. The patterns illustrate useful shapes for
different subjects. They are not templates, required headings, or reusable game
content.

## Contents

- [Choosing a shape](#choosing-a-shape)
- [Part and primary-chapter pattern](#part-and-primary-chapter-pattern)
- [Gameplay-system pattern](#gameplay-system-pattern)
- [Screen-and-flow pattern](#screen-and-flow-pattern)
- [Supplemental deep-dive pattern](#supplemental-deep-dive-pattern)
- [Cross-cutting-principle pattern](#cross-cutting-principle-pattern)
- [Opening scope paragraphs](#opening-scope-paragraphs)
- [Index catalog entries](#index-catalog-entries)
- [Glossary entries](#glossary-entries)
- [Prototype images](#prototype-images)

## Choosing a shape

Find the chapter's central reader question before choosing headings. A useful
structure makes the answer and its rationale easy to locate. Combine or discard
the patterns when the subject demands a different sequence.

Prefer sections that name a meaningful decision or phase of play. Avoid
long component inventories, one heading per source module, and generic buckets
that separate every rule from its rationale.

## Part and primary-chapter pattern

Start a part with the primary chapter whose filename mirrors the part
directory. Give that chapter the full conceptual span of the part. A useful
progression is:

1. Establish the subject's purpose and place in Dreamtides.
2. Define its player-facing concepts, authored inputs, and durable state.
3. Explain its major flows and algorithms in the order readers need them.
4. Keep each consequential decision beside its rationale and effects.
5. Orient the reader to relevant screens without detailing presentation.
6. Close local loops, edge cases, and handoffs so the chapter stands alone.

Do not structure the primary around supplements that might be written later.
Once it is complete, identify a few unusually complex systems or algorithms
that could support a deeper treatment, and present those candidates outside the
book for the user's judgment.

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
8. Link each phase to the concise screen coverage that orients prototype use.

Good section titles name the decisions: “Offers preserve commitment,” “Payment
follows selection,” or “The result persists at departure.” They tell the reader
more than “Logic,” “State,” or “Implementation.”

## Screen-and-flow pattern

Use this shape when the chapter explains one player destination and the flow
through it.

Start with the screen's role in the larger journey and the state on arrival.
Then supplement the prototype without transcribing it:

1. Describe the screen's role, principal interaction, and handoff in one or two
   sentences.
2. Briefly name every visible Cumulus component without explaining its API.
3. Give every distinct player choice or outcome a one-sentence semantic result.
4. Explain the state or algorithm that selects what the player sees.
5. Fully specify non-obvious placement, safe-area, responsive, reveal,
   collision, priority, or interruption algorithms.
6. State the flow's animation and choreography philosophy once near the top.
7. Use a representative screenshot only when it adds useful orientation.
8. End at the handoff into the next canonical game state.

Keep the component inventory brief. Do not reproduce normal component behavior,
detailed composition, or shot-by-shot presentation that readers can inspect in
the prototype and Cumulus documentation.

## Supplemental deep-dive pattern

Use this shape only after the owning primary chapter exists and the user has
selected a complex system or algorithm for deeper treatment:

1. Open with the exact contract being deepened and link back to the primary.
2. Identify inputs, outputs, state ownership, and preconditions.
3. Explain evaluation or resolution in consequential order.
4. State formulas, constants, random domains, invariants, and persistence.
5. Cover meaningful edge cases and interruption or failure boundaries.
6. Give a compact worked example when it clarifies multiple state changes.
7. Link back to the primary for the surrounding system and player experience.

Revise the primary in the same change so it summarizes the algorithm's place
and links to the supplement. Keep the supplement focused: detailed screen
presentation and ordinary Cumulus behavior remain outside LToDD.

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
> commitment, or the handoff into a site. Use the prototype for detailed screen
> presentation and the Cumulus documentation for standard component behavior.

Adapt the prose to the subject. Do not repeat these sentences mechanically.

## Index catalog entries

Group chapter entries beneath part headings. Give each part a concise sentence
explaining its purpose in the overall book. List the matching primary chapter
first, followed by any supplements. Write the exact chapter title, stable
underscore path, role label, and one sentence explaining when to read it.

Use these shapes:

> 1. **Primary:** [Part Title](part_name/part_name.md) — Read this chapter when
>    building or understanding the part as a whole.
> 2. **Supplement:** [Algorithm Title](part_name/algorithm_name.md) — Read this
>    chapter when implementing the focused algorithm in full detail.

Keep the parts and their entries in authoritative reading order. Include the
root `glossary.md` exactly once as a book-level reference. Keep planning state,
authorship, dates, and chapter numbers out of entries, directories, and
filenames.

## Glossary entries

Use one level-two heading per term and sort headings alphabetically. Define the
user-facing term in one compact paragraph. Link the primary chapter that owns
its complete rules or design significance.

Prefer definitions that distinguish nearby concepts and state their gameplay
role. Avoid source synonyms, abbreviations that players never see, and copied
catalog entries.

## Prototype images

Place a selective representative image exactly where it orients the reader or
clarifies a spatial or algorithmic relationship. Use the reference-style
Markdown printed by
`.llms/skills/ltodd/scripts/publish-image.mjs`:

```markdown
![One destination awaiting the player's choice][img-4df53c0d8f1a]

_The available destination holds visual focus before commitment._

[img-4df53c0d8f1a]: https://storage.googleapis.com/redacted-firebase-project.firebasestorage.app/ltodd/sites/site_arrival/destination-choice-4df53c0d8f1a.png
```

The publisher supplies the content hash in the reference label and URL. Keep
the image and italic caption together. The reference definition may live at the
end of the chapter when that makes the prose easier to scan. Do not add images
for every state, outcome, viewport, or animation key moment. Add a second image
only when it communicates a distinct fact that prototype play does not make
easy to locate.

Alt text describes the visible evidence in 10-59 characters. The caption states
why that evidence matters in context without repeating the alt text. Review the
surrounding prose after inspecting the capture and correct any factual mismatch
the image reveals.
