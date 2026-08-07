# LToDD content patterns

Read this reference when creating or substantially reorganizing a chapter. The
patterns show useful explanatory sequences. They are not required headings or
templates.

## Contents

- [Choose a reader question](#choose-a-reader-question)
- [Foundational primary chapter](#foundational-primary-chapter)
- [Gameplay system](#gameplay-system)
- [Screen and flow](#screen-and-flow)
- [Supplemental deep dive](#supplemental-deep-dive)
- [Opening paragraphs](#opening-paragraphs)
- [Definitions and early references](#definitions-and-early-references)
- [Index entries](#index-entries)
- [Glossary entries](#glossary-entries)
- [Prototype images](#prototype-images)

## Choose a reader question

Decide what a new technical contributor should understand after reading the
chapter. Build the section order from the prerequisites of that answer.

Prefer headings that name a recognizable concept, phase, or rule. Avoid one
heading per source module, generic buckets such as “Implementation” or “State,”
and long inventories that separate rules from the flow where they operate.

Do not let a technically intricate research area dominate an overview unless
it also dominates the reader's understanding of the system.

## Foundational primary chapter

Use this pattern for a part that introduces a broad game system or Dreamtides
itself:

1. Explain the subject in one or two plain paragraphs.
2. Walk through its normal lifecycle at a high level.
3. Define the core objects and resources when the lifecycle first needs them.
4. Explain each major phase, choice, and result in order.
5. Add the rules and algorithms that govern those phases.
6. Explain identity, persistent and temporary state, copying, derived values,
   and deterministic randomness after their purpose is clear.
7. Link to adjacent chapters that own deeper rules.

For a chapter about Dreamtides, the reader should learn what kind of game it is
and how a journey proceeds before learning how card identifiers work. For a
chapter about battles, the reader should learn the objective and turn flow
before learning the exact lifetime of a battle card.

End when the part's promised conceptual account is complete. Do not append a
generic invariant list or extra technical sections solely to increase length.

## Gameplay system

Use this pattern for rules or an algorithm that operates across several phases:

1. State what the system does and when it runs.
2. Define the minimum state needed to follow it.
3. Explain the normal sequence in resolution order.
4. Put choices, constraints, and results beside the relevant step.
5. State random sampling and ordering where they affect the result.
6. Cover edge cases that produce a materially different outcome.
7. Give one short example if several state changes are otherwise hard to track.
8. Link to the chapter that owns the surrounding lifecycle.

Headings should make the flow easy to scan. “Choose an offer,” “Pay its cost,”
and “Apply the result” are usually clearer than “Selection logic,” “Economy,”
and “Persistence.”

## Screen and flow

Use this pattern when a screen is the clearest way to explain one destination
or interaction:

1. State the screen's role in the larger game flow.
2. State what information is present when the player arrives.
3. Explain the principal choice and each distinct semantic outcome.
4. Explain the state or algorithm that selects what appears.
5. Specify non-obvious placement, coordination, priority, or interruption rules.
6. End with the handoff into the next game state.

Name shared Cumulus components only when that helps connect the flow to the
design system. Leave routine presentation, component APIs, and motion details
to Cumulus and the prototype.

## Supplemental deep dive

Use this pattern only after the owning primary chapter exists and the user has
selected a focused complex system:

1. Name the exact contract being deepened and link to the primary chapter.
2. State inputs, output, state ownership, and preconditions.
3. Explain evaluation or resolution in order.
4. State exact selection domains, formulas, constants, and random draws.
5. Cover edge cases and interruption boundaries that change the result.
6. Give a compact example when it clarifies several transitions.
7. Link back to the primary for the surrounding game flow.

Revise the primary chapter in the same change so it explains where the deep
dive fits. Keep presentation details and source structure out of the
supplement.

## Opening paragraphs

A primary chapter opening should first answer what the subject is. It may then
identify the surrounding flow and useful adjacent chapters.

Useful shape:

> A dream journey is one complete run of Dreamtides. The player builds a deck,
> travels through a generated Dream Atlas, resolves sites and battles, and
> either defeats the final opponent or loses the journey. This chapter explains
> that lifecycle and the state carried between its phases.

A focused chapter can open more narrowly:

> A battle is a turn-based contest between the player's deck and an opponent's
> deck. This chapter defines its objective, turn sequence, legal actions, and
> result. Read the battle setup chapter for opponent and starting-state
> selection.

Do not open with a catalog of authored definitions, runtime objects, source
types, or internal IDs unless the chapter's declared subject is the data model
itself.

## Definitions and early references

Define a term where the reader first needs it:

> **Essence** (◆) is the currency spent at sites.

If a term appears before its full section, add a short explanation and link:

> The player chooses a **Dream Avatar**, the character that supplies the
> starting deck and abilities. See [Dream Avatars](#dream-avatars).

Do not rely on capitalization to signal vocabulary. Bold the first definition,
then write the term normally. Do not introduce a named keyword or status merely
to demonstrate that such categories exist.

For a calculation without separate identity, use ordinary prose:

> The card definition, persistent modifications, and current context determine
> the card's resolved values.

Do not invent a new object name for the result unless rules refer to that result
as an independent object.

## Index entries

Group entries beneath part headings. Give each part one concise purpose
sentence. List the matching primary chapter first, followed by selected
supplements. Use the exact chapter title, stable path, role label, and a sentence
that tells the reader when to use it.

Use these shapes:

> 1. **Primary:** [Part title](part_name/part_name.md) — Read this chapter when
>    learning or implementing the part as a whole.
> 2. **Supplement:** [Algorithm title](part_name/algorithm_name.md) — Read this
>    chapter when implementing the focused algorithm in full detail.

The em dash in an index entry is a separator, not a parenthetical aside. Keep
planning notes, dates, status, and possible future chapters out of the index.

## Glossary entries

Use one level-two heading per stable project term and sort entries
alphabetically. Define the term in one compact paragraph and link the primary
chapter that owns its rules.

Do not add source-only synonyms, helper object names, or a separate term for
every derived value. The glossary catalogs reusable Dreamtides vocabulary, not
all bold text in the book.

## Prototype images

Place an image only where it gives useful visual orientation. Use the
reference-style Markdown printed by the publishing helper:

```markdown
![One destination awaiting a choice][img-4df53c0d8f1a]

_The available destination is ready for selection._

[img-4df53c0d8f1a]: https://storage.googleapis.com/redacted-firebase-project.firebasestorage.app/ltodd/sites/site_arrival/destination-choice-4df53c0d8f1a.png
```

Keep the image and italic caption together. The reference definition may live
at the end of the chapter. Alt text describes the visible evidence. The caption
states why the image is useful without repeating the alt text.

Do not add images for every state, viewport, or animation moment. Add another
image only when it communicates a distinct fact that is hard to locate in the
prototype.
