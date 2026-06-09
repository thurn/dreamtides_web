# Dream Merchant v3 Design

Rewrite of the dream merchant encounter system in `src/journey_v2`. The merchant
offers the player two free, immediate, permanent rewards; the player accepts one
or declines. Offer generation is driven by corpus-derived signals from the
~1,061 adapted draft records rather than curated tags, and selection is a
two-stage seeded lottery designed so that variance is a measurable, tunable
property of the system.

## Goals

- Every offered choice is something the player would plausibly want.
- Behavior is varied: roughly 50+ distinct outcomes at the first-dreamscape
  merchant, measured by a simulation harness.
- Minimal externally curated data. The only curated file is a small dreamsign
  profile TOML; everything about cards is derived from hard card data and the
  draft-record corpus.
- All rewards are free, immediate, and permanent.

## Non-goals

- Time-limited journey effects (effects scoped to the next N battles).
- Essence as a currency at the merchant (no prices, no locked offers, no
  essence-granting rewards).
- Card type conversion (character/event conversion rewards).
- Regex- or tag-based inference of card function (removal, draw, payoff tiers).

## Encounter structure

- Exactly two offers, `A` and `B`. The player accepts at most one or declines.
  Accepting or declining completes the site.
- Both offers are free. There is no pricing, locking, or payment step.
- Generation is deterministic per (quest seed, site id, deck state). The
  regenerate-and-validate-on-accept pattern from the current implementation is
  retained: acceptance rebuilds the encounter from current state, validates the
  encounter signature and offer identity, applies the reward, and completes the
  site.
- Any chooser shown to the player contains at most 4 cards.

### Commit-then-reveal for hidden drafts

Two archetypes (`category_draft_known`, `premium_draft`) hide their candidate
cards until the player commits. Accepting one of these is two steps:

1. **Commit mutation**: records the committed offer id in quest state and
   forfeits the other offer. The site is not yet complete. The commit flag
   exists so a reload cannot recover the forfeited offer; deterministic
   generation guarantees the revealed candidates are stable across reload.
2. **Reveal/pick mutation**: the player picks one of the revealed cards; the
   pick is validated against the regenerated candidate set, applied, and the
   site completes.

Fully face-up archetypes keep the single accept-with-choice mutation.

## Generation pipeline

```
buildMerchantContext(questState, questContent)
  -> MerchantContext { deck, dreamsigns, cardDatabase, corpus signals }

Stage 1: archetype roll
  - Evaluate eligibility predicates for all archetypes against deck state.
  - Seeded weighted draw over eligible archetypes for slot A.
  - Seeded weighted draw over remaining eligible archetypes for slot B,
    constrained to a different archetype than A.

Stage 2: target sampling (per offer)
  - Build the archetype's candidate list, ranked by its corpus signal.
  - Keep the top quantile (default: top 25%, minimum 5 candidates where the
    pool allows; top 10% for premium_draft).
  - Seeded-sample the target (or the 4-card chooser set) uniformly from the
    band.

Dialogue: one merchant line (<=10 words) hinting at one seeded-chosen offer.
Resolve: regenerate, validate, apply, complete site.
```

Seeds derive from (quest seed, site id, slot, salt) via stable hashing, so each
roll is independent and reproducible. The same run always shows the same offers
at a given merchant; different runs diverge heavily.

### Why two-stage sampling

An argmax selection rule maps a given deck state to a single outcome. Here,
"plausibly want it" comes from the quantile floor (only the top band of corpus-ranked candidates is offerable) and
"never know what you'll get" comes from sampling within that band and from the
archetype lottery above it. Eleven archetypes give up to 110 ordered (A, B)
pairs before target variance multiplies in.

## Offer archetypes

Each archetype has a base weight (constants in code), an eligibility predicate,
and a target signal. Weights and quantile constants are tuning levers for the
metrics harness.

| Archetype | Player-facing shape | Visibility | Target signal |
|---|---|---|---|
| `fit_card_grant` | Receive one named card that fits your deck | Face-up | Fit-model score |
| `fit_card_draft` | Draft 1 of 4 cards that fit your deck | Face-up | Fit-model score |
| `strong_card` | Receive one named premium card | Face-up | Corpus quality rating |
| `category_draft_known` | "Draft a Warrior" / "Draft an Event" / "Draft a cheap character" / "Draft from the *Skull Weaver* package" — pick 1 of 4 | Category visible, cards hidden until commit | Fit score within the sampled category |
| `premium_draft` | Draft 1 of 4 exceptionally strong cards | Cards hidden until commit | Corpus quality rating (top 10% band), lightly blended with fit |
| `card_bundle` | Gain 2–3 cards that work together and with your deck | Face-up | Affinity growth from a sampled seed card (reuses affinity-grower logic) |
| `transfigure` | Permanently improve a deck card | Face-up with preview | Transfiguration benefit score; non-starters strongly preferred |
| `keyword_mod` | Add Reclaim to an event / make an event fast / reduce a Reclaim cost | Face-up with preview | Sampling among eligible events |
| `purge` | Remove a weak card from your deck | Face-up | Starters plus bottom-decile leave-one-out misfit |
| `duplicate` | Add a copy of a deck card | Face-up | Corpus multiplicity × fit |
| `dreamsign` | Gain a dreamsign suited to your deck | Face-up | Curated-profile match against deck hard data |

### Eligibility notes

- `purge`: requires a starter card or a bottom-decile misfit card in the deck,
  and a minimum deck size.
- `duplicate`: requires a deck card with meaningful corpus multiplicity signal.
- `transfigure`: requires a non-starter deck entry with a beneficial,
  not-yet-applied transfiguration; starters qualify only when no non-starter
  does.
- `keyword_mod`: requires an eligible event (without Reclaim, not fast, or with
  reducible Reclaim cost respectively).
- Fit-based archetypes (`fit_card_grant`, `fit_card_draft`) require a minimum
  deck size for the fit signal to be informative.
- Always-eligible archetypes: `strong_card`, `category_draft_known`,
  `premium_draft`, `card_bundle`, `dreamsign` (while unheld dreamsigns with
  matching or neutral profiles exist). A visit with zero drafted cards
  therefore still has real variety.

### Category sources for `category_draft_known`

Categories come from two tag-free sources:

1. **Hard card data**: card type, subtype (Warrior, Spirit Animal, ...), energy
   cost band, spark band, fast/interrupt.
2. **Corpus clusters**: communities mined from the affinity graph — "cards that
   travel together." Each cluster is presented by its flagship card (highest
   IDF × quality member): "the *Skull Weaver* package." Self-describing, with
   no curated names.

The category for a given encounter is seeded-sampled from categories where the
deck shows affinity, with a minority chance of a deliberately off-profile
category for variety.

## Corpus signal layer

New module `src/journey_v2/signals/`, leaning on existing draft code. All deck
understanding is mechanical; cards are identified by UUID throughout.

- **Fit** — `FitModel` from `src/draft/replay/fit-model.ts`, used as-is
  (neighbor-CF + IDF co-occurrence + prior; recall@4 ≈ 80%). Ranks pool cards
  for grants, drafts, and category shelves.
- **Quality** — the conditional-logit `quality[c]` term from
  `src/draft/pool/variant-pickchoice.ts` (taken-over-passed strength). Powers
  `strong_card` and `premium_draft`. Baked offline.
- **Misfit** — leave-one-out score per deck entry: mean IDF-weighted
  co-occurrence between a card and the rest of the deck, computed at runtime
  from the affinity matrix. Bottom decile plus the starter rarity flag drives
  `purge`; also down-weights transfigure targets.
- **Multiplicity** — `P(deck runs 2+ copies | runs >= 1)` per card, computed
  offline from corpus mainboards. Drives `duplicate`.
- **Clusters** — offline community detection over the affinity graph, with a
  flagship card per cluster. Drives `category_draft_known`.

### Baked artifact

One committed file, `data/merchant_corpus.json`, holding quality ratings,
multiplicity, and cluster assignments — same pattern as the affinity corpus:
a bake script regenerates it from `docs/draft_records_adapted/`, and a parity
check validates the committed artifact against a live rebuild. Runtime never
re-derives these from draft records.

### The one curated file

`data/tabula/dreamsign_profiles.toml`. Dreamsigns never appear in draft
records, so they get no corpus signal. A subagent deep-reads each dreamsign's
ability text (no regexes) and records a structured profile, reviewed by hand:

```toml
[[dreamsigns]]
id = "<dreamsign uuid>"
# Hard deck features this dreamsign rewards.
subtypes = ["Warrior"]
card-types = []
cost-bands = []          # e.g. ["cheap"]
keywords = []            # e.g. ["reclaim"]
quality = 2              # 1 = premium, 2 = solid, 3 = niche
```

The merchant matches profiles against the deck's actual composition (hard data
only) and samples from the top-matching band. At ~32 dreamsigns this is cheap
to maintain.

## Dialogue

Each encounter renders exactly one merchant line of at most 10 words, hinting
at the motivation for one seeded-chosen offer — e.g. "That direwolf of yours
could be so much more." Small per-archetype template banks (6–10 lines each),
slot-filled with at most the target's name. One short accept reaction (at most
6 words). Nothing else: no greetings, price framing, walk-away lines, or
decline reactions.

## Metrics harness

`scripts/merchant-experiment.mjs`, exposed as `npm run merchant-metric`,
following the pool-experiment pattern. Simulated decks are prefixes of real
adapted draft records (a record truncated at picks 0/5/10/20 models a player at
that stage), so measurements reflect real deck states.

1. **Distinct outcomes** — generate first-dreamscape encounters across many
   seeds per deck state; count distinct (archetype + target identity) offer
   pairs. Target: >= 50 distinct outcomes, reported alongside effective outcome
   count (perplexity) so one dominant pair cannot hide behind a long tail.
2. **Desirability** — for card offers, the offered card's fit percentile
   against the full eligible pool (target: median >= 75th percentile, floor >=
   50th); for purges, the target's misfit percentile; per-archetype
   definitions.
3. **Repetition** — probability that two random seeds yield an identical offer
   pair for the same deck state. Target: < 2%.
4. **Archetype coverage** — empirical distribution of shown archetypes across
   seeds and deck states; no archetype starved or dominant beyond its intended
   weight.

Archetype weights and quantile constants are tuned against these metrics, the
same way pool generation is tuned today.

## Module changes

Retained (adapted):

- UI shell: `DreamMerchantScreen`, `OfferCard`, `MerchantChooserPanel`,
  `MerchantGameObjectView` — with pricing/locked-offer UI removed and the
  commit-then-reveal flow added.
- `buildMerchantContext` shape — support metadata replaced by corpus signals.
- `resolveMerchantOffer` validation pattern (encounter signature,
  regenerate-validate-apply), extended with the commit mutation.
- Transfiguration and keyword-modification application code
  (`data/transfiguration`, `data/card-type-change` keyword paths).

New:

- `src/journey_v2/signals/` — fit/quality/misfit/multiplicity/cluster access.
- Stage-1 archetype roll and stage-2 target sampling in
  `encounter/generateMerchantEncounter.ts` (rewritten).
- `data/merchant_corpus.json` + bake script + parity check.
- `data/tabula/dreamsign_profiles.toml` + subagent curation pass.
- `scripts/merchant-experiment.mjs` + `merchant-metric` npm script.

Deleted:

- `read/deckRead.ts` (needs engine: under_supported_payoff, missing_role,
  curve_problem, weak_card, dreamsign_gap detection and the role regexes).
- `catalog/pricing.ts` and every essence cost, locked-offer, and payment path.
- `gain_essence` and `raise_essence_cap` reward builders.
- `convert_event_to_role` and the `change_deck_entry_type` merchant payload.
- The seven-beat dialogue grammar and its template banks.
- The merchant's consumption of `data/buildaround_support.json`.

## Testing

- Unit tests run against fixture corpora and fixture cards; they never assert
  on production TOML or draft-record contents.
- Determinism: same (seed, site, deck state) produces an identical encounter.
- Eligibility gates: each archetype's predicate, including the empty-deck
  visit, which must still yield two valid offers.
- Quantile floor: no offered card falls below its archetype's band.
- Commit-then-reveal: commit forfeits the other offer, reveal validates the
  pick against regenerated candidates, stale signatures are rejected without
  mutation.
- Chooser size: no chooser ever exceeds 4 cards.
- Browser QA through the normal player workflow on a non-5173 Vite port, per
  the standard QA process.
