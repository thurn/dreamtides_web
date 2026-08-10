# Exploration template rebalancing strategy

## Objective and measurement

The catalog has 1,042 actions across 82 source templates. A perfectly even fixed-size
catalog would place every template at 12 or 13 uses. Treat that as a direction, not a
reason to replace a narratively excellent action.

Measure progress after every batch with four values:

- templates represented at least once;
- minimum and median template count;
- maximum template count; and
- the largest-to-smallest nonzero count ratio.

Every redesign transfers one use from a donor template to a recipient template.
Adding encounters raises the denominator and is not the default rebalancing tool.

## Preservation-first selection

For each recipient template, audition three existing encounters. Each candidate
contributes one nominated action from an overrepresented donor template. Show the
designer the full-size image, encounter prose, both current actions, recipient
template, and nominated donor action.

Select the candidate where the recipient template is visibly grounded in the art
and creates a meaningful choice against the preserved action. Preserve prose and
the other action. If none fit, reject the candidate set and draw three more; do not
substitute a different recipient template.

Prefer donor templates in this initial order, recomputing counts after every batch:

`14, 38, 39, 64, 60, 79, 74, 55, 83, 65, 61, 16, 66, 84, 15, 17, 81, 36`

Within a donor template, preserve exceptional art/action pairings and nominate the
weakest or most generic pairings first.

## Initial recipient order

The first pass establishes coverage and shared implementation foundations. Run two
to four recipients from one row per batch.

| Wave | Template IDs | Shared implementation focus |
| --- | --- | --- |
| 0 | `6` | Existing multi-purge path; validate the preservation workflow |
| 1 | `1, 2, 68` | Essence mutation, deterministic random amounts, proportional essence |
| 2 | `29, 30, 63, 69, 71, 76` | Dreamsign offers, replacement, randomization, Nightmare bundles |
| 3 | `32, 33, 34, 35, 24, 25` | Stable starter-card identity, random/all starter operations |
| 4 | `20, 21, 22, 23, 8, 52, 54` | Chosen/random multi-card targeting and per-target outcomes |
| 5 | `41, 42, 43, 44, 45, 46` | Typed site insertion and site-type chooser |
| 6 | `56, 82` | Persisted shop discounts and purchase counters |
| 7 | `48, 53, 72` | Random/fixed replacement, card-type conversion, legendary predicate |
| 8 | `40, 75, 77, 78, 80` | Compound deck-wide transformations and multi-stage replay |

This order covers every currently absent template. Template 21 joins wave 4 because
its general counted form shares the same infrastructure and is represented only by
a single-action special case.

## Iterative equalization

After every template appears at least once:

1. Validate `references/template-assignments.json` against generated Exploration and
   compute counts from that ledger.
2. Choose recipient templates at the current minimum count.
3. Choose donor templates at the current maximum count.
4. Build three art candidates for each recipient from donor actions.
5. Replace one action per assignment and verify the `+1/-1` count delta.
6. Repeat until every template reaches the next floor: first 2, then 4, then 6.

At each floor, stop for a qualitative review before continuing. Inspect balance,
encounter diversity, action-choice tension, and whether repeated implementations
need value or predicate variation. A practical medium-term target is full coverage,
a minimum count of 4, and a maximum count below 30. Exact 12/13 parity would require
hundreds of action replacements and should be approached only through repeated
quality-preserving passes.

## Candidate quality rubric

Rank candidate replacements in this order:

1. visible narrative grounding in the artwork;
2. causal clarity of the new action label;
3. meaningful contrast with the preserved action;
4. deck and archetype relevance;
5. balance and replay value; and
6. implementation leverage shared with the current wave.

An arithmetic improvement that weakens the encounter is not a winning candidate.
