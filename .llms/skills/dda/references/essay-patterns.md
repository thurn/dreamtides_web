# DDA essay patterns

Read this reference when creating or substantially reorganizing an essay. The
patterns are useful explanatory sequences, not required headings or templates.

## Contents

- [Choose a reader question](#choose-a-reader-question)
- [Focused design system](#focused-design-system)
- [Algorithm](#algorithm)
- [Boundary between systems](#boundary-between-systems)
- [Screen and interaction](#screen-and-interaction)
- [Rationale for a constraint](#rationale-for-a-constraint)
- [Opening paragraphs](#opening-paragraphs)
- [Definitions and early references](#definitions-and-early-references)
- [Index entries](#index-entries)
- [Prototype images](#prototype-images)

## Choose a reader question

Decide what difficult subject a new technical contributor should understand
after reading the essay. Build the section order from the prerequisites of that
answer.

Prefer headings that name a recognizable concept, phase, question, or rule.
Avoid one heading per source module and generic buckets such as
“Implementation” or “State.” Keep rules beside the flow where they operate.

An essay earns its place by depth, not breadth. It may cover one algorithm
completely while leaving the larger system to the game or another essay.

## Focused design system

Use this pattern when several phases or rules must be understood together:

1. State what the system does and when the player encounters it.
2. Identify the design question that makes the system difficult.
3. Define the minimum objects and state needed to follow it.
4. Explain the normal sequence in resolution order.
5. Put choices, constraints, and results beside the relevant step.
6. Cover edge cases that materially change the outcome.
7. End at the handoff to the next system.

Give enough surrounding context to stand alone, but do not turn the essay into
a general chapter about every neighboring mechanic.

## Algorithm

Use this pattern for a calculation, selection process, generator, or decision
procedure:

1. State the gameplay question the algorithm answers and when it runs.
2. Distinguish its output from the effect that consumes that output.
3. Give one concrete example if the distinction remains abstract.
4. Define inputs, exclusions, and output.
5. Explain evaluation, scoring, sampling, and tie-breaking in order.
6. State exact constants and random draws that affect reproduction.
7. Cover edge cases that produce a different result.
8. Explain the reason for any non-obvious constraint.

Do not lead with policy names, source types, or a taxonomy of variants. First
make clear what game decision the algorithm exists to make.

## Boundary between systems

Use this pattern when confusion comes from two lifetimes, owners, or phases:

1. Introduce both systems through one player-facing object or action.
2. State the exact boundary and why it matters.
3. Trace identity and state as the object crosses the boundary.
4. Explain which rules operate before, during, and after the handoff.
5. Give a compact multiplicity or copying example when useful.
6. State what the receiving system may rely on.

Name a separate object only when identity, state, multiplicity, or behavior
actually changes at the boundary.

## Screen and interaction

Use this pattern when a screen is the clearest way to explain the design:

1. State the screen's role in the larger game flow.
2. State what information is present when the player arrives.
3. Explain the principal choice and distinct semantic outcomes.
4. Explain non-obvious selection or arrangement rules.
5. Specify coordination, priority, or interruption behavior that changes play.
6. End with the handoff into the next game state.

Name shared Cumulus components only when that connects the flow to the design
system. Leave routine presentation, component APIs, and motion details to
Cumulus and the prototype.

## Rationale for a constraint

Use this pattern when an exact design rule looks arbitrary without its reason:

1. State the rule in operational terms.
2. Show the ordinary case it governs.
3. Identify the precise failure or ambiguity the constraint prevents.
4. Explain how the constraint preserves the required property.
5. Cover exceptions only when they are part of the intended design.

Do not reconstruct a chronology of rejected alternatives. The reader needs the
current rule and the reason that helps implement it correctly.

## Opening paragraphs

A useful opening identifies the subject and the reason it needs focused
treatment:

> An Exploration offer pairs two choices that fit the player's current journey
> in different ways. The offer generator must compare effects with different
> costs, targets, and future consequences without collapsing them into one
> strength score. This essay explains how the generator constructs and ranks
> those pairs.

A boundary essay can open more narrowly:

> A persistent card instance becomes one or more battle cards when a battle
> begins. Persistent modifications affect every resulting battle card, while
> damage and position belong only to one battle. This essay defines that
> lifetime boundary and its copying rules.

Do not open with authored records, runtime objects, source types, or internal
identifiers unless the declared subject is the identity model itself.

## Definitions and early references

Define a term where the reader first needs it:

> **Essence** (◆) is the currency spent at sites.

If a term appears before its full treatment, explain enough to continue and
link to the relevant essay:

> The player chooses a **Dream Avatar**, the character that supplies the
> starting deck and abilities. See
> [Dream Avatar construction](dream_avatar_construction.md).

For a calculation without separate identity, use ordinary prose:

> The card definition, persistent modifications, and current context determine
> the card's resolved values.

Use the concrete gameplay verb instead of describing a source record. Say “the
site draws a card from the player's deck” when that is the rule.

## Index entries

Keep one flat numbered list under `## Essays`. Give every essay its exact title
and a sentence that tells the reader when it is useful:

> 1. [Offer pairing](offer_pairing.md) — Read this essay when implementing the
>    pairing algorithm or diagnosing why two choices appeared together.

Do not add categories, roles, reading levels, future topics, status, or implied
coverage. The index lists what exists.

## Prototype images

Place an image only where it gives useful visual orientation. Use the
reference-style Markdown printed by the publisher:

```markdown
![Two Exploration choices awaiting selection][img-4df53c0d8f1a]

_The paired choices expose distinct costs and outcomes._

[img-4df53c0d8f1a]: https://storage.googleapis.com/redacted-firebase-project.firebasestorage.app/dda/offer_pairing/paired-choices-4df53c0d8f1a.png
```

Keep the image and italic caption together. Alt text describes visible
evidence. The caption states why the image matters without repeating the alt
text. Add another image only when it communicates a distinct fact.
