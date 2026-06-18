# Common Dreamtides Draft Archetypes

This document identifies the most common deck structures in the adapted draft
records and gives each structure a concise strategic description. The analysis
finds ten recurring groups that each account for approximately 6% or more of
the analyzed decks.

## Method

The source corpus is `docs/draft_records_adapted/`. Each mainboard was reduced
to the set of current card UUIDs it contained, and decks with 16–60 resolved
cards were retained, producing 1,049 decks from 1,101 nonempty mainboards. Card
names and authored metadata were not features in the analysis.

The primary model represented each deck as a binary card-incidence vector,
weighted each UUID by inverse deck frequency, and applied spherical k-means
with 12 independent initializations. A second model represented decks using
only current rules features from `data/tabula/cards_v2.toml`: card type,
subtype, cost, and terms and phrases from rendered rules text. The two models
had normalized mutual information of 0.692, with especially strong agreement
on event chains, discard, cheap-character recursion, Outsiders, reclaim loops,
Survivor/abandon decks, and Spirit Animals.

The labels below were assigned after clustering by reading the current rules of
the UUIDs with the greatest lift in each group. Percentages are approximate
exclusive cluster occupancy: a hybrid deck is assigned to its closest group,
even though its cards may support several strategies.

## Archetypes

1. **Spirit Animal Flood (approximately 16%)** — Floods the board with cheap Spirit Animals, converts their numbers into energy and figments, then wins through collective spark scaling.

2. **Event Chain/Storm (approximately 13%)** — Chains energy-producing, copied, discovered, and reclaimed events into a resource-positive turn with a scalable payoff.

3. **Warrior Support Aggro (approximately 9%)** — Builds a wide Warrior board and uses Support, cost reduction, and tribal spark bonuses to apply rapid pressure.

4. **Abandon/Survivor Replenishment (approximately 8.5%)** — Abandons or dissolves characters for resources while Survivor recursion and replacement figments continually rebuild the board.

5. **Cheap-Character Recursion (approximately 8.3%)** — Replays characters costing 2● or less from the void to repeatedly generate ▸Materialized, ▸Dissolved, and abandon value.

6. **Reclaim Loop (approximately 7.9%)** — Cycles Reclaim 0● characters through play and the void to repeatedly trigger energy, scoring, erosion, or card-generation effects.

7. **Discard/Reclaim (approximately 7.1%)** — Turns discard into card selection, temporary power, and void setup before recovering the discarded resources through reclaim.

8. **Void-Density Recursion (approximately 7%)** — Rapidly fills the void through erosion and discard, then profits by playing cards from it or triggering effects when they leave it.

9. **Outsider Tempo (approximately 6.3%)** — Uses Phasing, positional movement, and return-to-hand effects to score safely while disrupting the opponent and generating cards.

10. **Event/Awaken Warriors (approximately 6%)** — Combines Warrior bodies with event-driven awakening, draw-discard effects, and reusable ☪ abilities to produce repeated value and explosive turns.

## Interpretation

Spirit Animal Flood remained a single coherent large group: recursive splits
separated a character-chain hybrid, but the main tribal core stayed above 10%
and did not divide consistently across the UUID and rules-feature models.
Warrior decks supported a more useful division between direct Support aggro and
an event-driven awaken/value plan. The broad void ecosystem separated into four
different resource engines: Survivor replenishment, cheap-character recursion,
reclaim loops, and general void-density recursion.

These groups describe dominant deck plans, not rigid card partitions. The
strongest overlap occurs among the four void-oriented strategies, while Spirit
Animal, Warrior, and event shells frequently supply secondary engines to one
another.
