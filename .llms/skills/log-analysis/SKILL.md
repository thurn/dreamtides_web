---
name: log-analysis
description: Answer "why did the algorithm do X?" questions by reconstructing behavior from logs/quest-log.jsonl. Focuses on draft pool construction and dream journey / merchant offer construction. Triggers on log analysis, why did my draft pool, why was this card offered, draft pool debugging, dream journey debugging, merchant offer debugging, reconstruct algorithm, quest-log.jsonl.
---

# Log Analysis Skill

Quest logs live in `logs/quest-log.jsonl` — one JSON object per line. The guiding
question this skill answers: *"If someone asked me to reconstruct what this
algorithm did in a given production game, would I be able to?"* Read the logs;
never argue about algorithm behavior from the source code alone when a
production trace exists.

This skill targets two question families:

1. **Draft pool construction** — "Why is *Terminus* in my warriors draft pool?"
2. **Dream journey / merchant construction** — "Why did my dream journey offer me
   to draft a Synth card?"

## Phase 0: Orient before answering

Every line has an `event` field. Most lines also have `seq` (a per-event-stream
counter) and a `timestamp`. **Cards are identified by `cardNumber` (an int) or
`cardUuid`, plus a human `name`/`cardName` for convenience** — always reason and
report by UUID/number, per the repo convention, and treat names as labels only.

The single most important pivot key is **`gameId`** (a short token like
`7koodm`). Newer logs stamp it on most events; older logs predate it. Always
start by isolating the game in question, then read its events in `seq`/timestamp
order.

```bash
# Find recent games and their construction algo/seed
grep '"event":"draft_pool_constructed"' logs/quest-log.jsonl | tail -20

# Pull every line for one game, in file order
grep '"gameId":"7koodm"' logs/quest-log.jsonl | python3 -m json.tool --json-lines 2>/dev/null \
  || grep '"gameId":"7koodm"' logs/quest-log.jsonl
```

If a question references a game with no `gameId` on its events, fall back to the
nearest timestamp window and the relevant `dreamcallerId` / `siteId`.

Always pretty-print with `python3 -c` reading the file — avoid `cat`/`sed`/`head`
on raw JSONL when you actually need a field.

## Phase 1: Draft pool questions

### Key events (in order of construction)

| Event | What it records |
|---|---|
| `dreamcaller_package_validation_summary` / `dreamcaller_package_skipped` | Which dreamcallers were eligible to seed a pool and which were rejected, **with the `reason`** (e.g. `mandatory-only pool size 109 is outside 110-150`). This is the first gate — a card's dreamcaller may never have qualified. |
| `draft_pool_constructed` | The authoritative provenance record: `algo`, `seed`, `dreamcallerId`, `poolSize`, `distinctCardCount`, and **algo-specific provenance** (see below). |
| `draft_pool_initialized` | Tide/color breakdown of the finished pool (`cardCountByTide`, `selectedPackageTides`). |
| `draft_offer_revealed` / `draft_site_entered` | The actual 4-card offers (`offerCards` = card numbers) shown at each `pickNumber`. |
| `draft_pick_player` | What the player picked from each offer. |

### Reading `draft_pool_constructed` provenance

The shape depends on `algo`. The two affinity-based algos (`pickearly`,
`pickcohere`) are the richest and directly answer "why is card X here":

- `seedCardName` / `seedCardNumber` / `seedAffinityWeight` — the pool was grown
  outward from this seed card.
- `topPartners` — the cards most affined to the seed.
- `topCards[]` — for each included card: `addOrder` (when it entered the pool),
  `copies` (1 or 2 — `doubledCardCount` totals the 2-copy cards), `seedAffinity`
  (similarity to the seed card), `poolAffinity` (similarity to the pool so far),
  and `blendedScore` (the ranking that got it in, weighted by
  `seedAffinityWeight`).

So "Why is *Terminus* in my warriors pool?" → find the game's
`draft_pool_constructed`, confirm the `algo`, find Terminus in `topCards` by its
`cardNumber`, and read its `seedAffinity` / `poolAffinity` / `blendedScore` /
`addOrder`. A high `seedAffinity` means it resembles the seed card; a high
`poolAffinity` with low `seedAffinity` means it was pulled in because it matched
cards *already added*, not the seed. **`topCards` is truncated to the top N** —
if the card isn't listed, it was a lower-scoring inclusion; report that and use
`poolSize`/`distinctCardCount` to bound the tail rather than claiming it's
absent.

Other algos carry lighter provenance:
- `tides` — `tideDeckIds` (which baked tide decks were unioned).
- `idf3` — `algo`/`seed`/sizes only; reconstruct ranking by re-running the algo
  with that `seed` if deeper detail is needed.

An **empty or missing provenance block** (just `algo`/`seed`/sizes with no
`seedCard*`/`topCards`) means a random or fallback construction path — say so
rather than inventing a rationale.

### Determinism

`algo` + `seed` + `dreamcallerId` fully determine the pool. To reproduce or dig
deeper than the log captures, re-run construction with that seed.

## Phase 2: Dream journey & merchant offer questions

A "dream journey" assembles the map (dreamscapes, sites) and the offers inside
sites (drafts, dreamsign offerings, merchants). "Why did my journey offer me to
draft a Synth card?" usually resolves to either a **journey template** that rolled
a category draft, or a **merchant offer** whose builder targeted a subtype.

### Map / site generation

| Event | What it records |
|---|---|
| `dreamscape_generated` | `biomeName`, the ordered `siteTypes` for the dreamscape, and `enhancedSiteType`. Tells you *which* sites exist and in what order. |
| `atlas_node_generated` | Node graph: `nodeId`, `connections`, `position`. |
| `dream_journey_applied` | A journey effect resolved at a site: `shapeId` (the journey shape, e.g. `random_rewards`, `random_trades`, `one_target_many_operations`), `templateIds` (e.g. `draft_predicate_cards_from_4`), `optionNumber`. **This is the direct answer to "why was I offered to draft X" when the offer came from a journey shape** — the `templateIds` name the operation and the predicate. |

### Dreamsign offerings

| Event | What it records |
|---|---|
| `dreamsign_pool_updated` | `source`, `remainingDreamsignPoolSize`, and the full `remainingDreamsignPool` (UUIDs) — the draw bag state. |
| `dreamsign_acquired` | What was taken: `name`, `isBane`, `sourceSiteType`. |

### Merchant offers (the richest explainability trace)

Merchant construction logs three events per encounter. Read them in this order:

1. **`merchant_encounter_generated`** — the roll. `debug.eligibleArchetypeIds`
   lists every offer archetype that *could* have appeared; `debug.rolledA` /
   `debug.rolledB` are the two that did. `offerCount`, `encounterSignature`
   (stable hash to correlate the other two events).
2. **`merchant_offer_built`** — *why these specific cards*. Key fields:
   - `archetypeId` (e.g. `category_draft_known`), `family` (e.g. `grant`).
   - `targetKey` — **what the offer is keyed to**. A value like
     `subtype:Synth:<uuid>,<uuid>,...` is the literal answer to "why a Synth
     card": the builder picked the *Synth subtype* as its target and the UUIDs
     are the candidate cards.
   - `needId` (also on `merchant_offer_shown`) — the deck *need* that motivated
     the offer, e.g. `need:missing-role:interaction` or
     `need:upgrade-target:deck-3:<uuid>:Scarlet`. This is the "what gap in my
     deck is this addressing" signal.
   - `trace` — the scoring detail: `trace.decision` (e.g. `scored_cards`),
     `trace.band` (`poolSize`, `bandSize`, `bandFraction`, `selectedCount` — the
     top-band selection cut), and `trace.candidates[]` with per-card `score`,
     `components` (e.g. `fit`), `inBand`, and `selected`. To answer "why *this*
     card and not that one", compare `score`/`components` across candidates and
     note the `band` cutoff.
3. **`merchant_offer_shown`** — the final surfaced offer: `offerId`,
   `rewardBuilderId`, `needId`, `price`, `locked`.

Correlate all three by `gameId` + `siteId` + `encounterSignature`.

So "Why did the merchant offer me a Synth draft?" →
`merchant_encounter_generated` shows `category_draft_known` was rolled →
`merchant_offer_built` shows `needId` (the deck gap) and
`targetKey: subtype:Synth:...` (the builder resolved that need to the Synth
subtype) → `trace.candidates` shows which Synth cards scored highest and made the
band.

## Phase 3: Answer

Structure the answer as a reconstruction, not an assertion:

1. **Identify the game** (`gameId`, `dreamcallerId`, `seed`).
2. **Cite the deciding event(s)** by `event` name and the specific fields that
   drove the outcome (quote the `blendedScore`, `targetKey`, `needId`,
   `reason`, etc.).
3. **State the causal chain** — gate → roll → target → score — in the algorithm's
   own terms.
4. **Flag gaps honestly** — if provenance is truncated, missing, or the game
   predates `gameId`/a given field, say what you could and couldn't recover, and
   what re-running with the logged `seed` would reveal.

## Adding logging

If a question *can't* be answered because the deciding step isn't logged, that is
itself the finding: per `AGENTS.md`, every feature should log enough to
reconstruct its behavior. Recommend the specific event/field to add (seed,
score components, the predicate that was rolled, the need that was resolved)
rather than guessing at intent.
