---
name: log-analysis
description: Answer "why did the algorithm do X?" questions by reconstructing behavior from logs/journey-log.jsonl. Focuses on draft pool construction and dream journey / merchant offer construction. Triggers on log analysis, why did my draft pool, why was this card offered, draft pool debugging, dream journey debugging, merchant offer debugging, reconstruct algorithm, journey-log.jsonl.
---

# Log Analysis Skill

Journey logs live in `logs/journey-log.jsonl` — one JSON object per line. The guiding
question this skill answers: *"If someone asked me to reconstruct what this
algorithm did in a given production game, would I be able to?"* Read the logs;
never argue about algorithm behavior from the source code alone when a
production trace exists.

A run played in the browser also mirrors its log to Firebase Realtime Database,
so a deployed/production game can be reconstructed even though it never touched
`logs/journey-log.jsonl`. See **Getting production logs** below before answering a
question about a game you can't find in the local file.

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
grep '"event":"draft_pool_constructed"' logs/journey-log.jsonl | tail -20

# Pull every line for one game, in file order
grep '"gameId":"7koodm"' logs/journey-log.jsonl | python3 -m json.tool --json-lines 2>/dev/null \
  || grep '"gameId":"7koodm"' logs/journey-log.jsonl
```

If a question references a game with no `gameId` on its events, fall back to the
nearest timestamp window and the relevant `avatarId` / `siteId`.

Always pretty-print with `python3 -c` reading the file — avoid `cat`/`sed`/`head`
on raw JSONL when you actually need a field.

## Getting production logs

`logs/journey-log.jsonl` only captures runs played against the local Vite dev
server. A run played in a browser against Realtime Database — the deployed
`redacted-firebase-project.web.app` build, or a local run in a multiplayer room —
mirrors every `logEvent` into `rooms/<roomId>/logs`, where **`roomId` is the
`gameId`** (the `?game=<id>` token, e.g. `r3f7vk`). Each child is one log entry
stored as a single-line JSON string under a push key; push keys sort
chronologically. The node is bounded to the newest `ROOM_LOG_LIMIT` (2000)
entries, so for a long game the earliest events may have been pruned — say so if
the trace starts mid-run.

When a question names a deployed game (a `web.app` URL or a `?game=` id) that
isn't in the local file, fetch its log from RTDB and convert it to the same
JSONL the rest of this skill consumes. The room read rules are open, so an
unauthenticated REST `GET` works; sorting the values by key and printing them
yields valid JSONL (each value is already a JSON line):

```bash
# Production (cloud) — for the game at .../?game=r3f7vk
ROOM=r3f7vk
curl -s "https://redacted-firebase-project-default-rtdb.firebaseio.com/rooms/$ROOM/logs.json" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin) or {}; [print(d[k]) for k in sorted(d)]' \
  > "/tmp/journey-log-$ROOM.jsonl"
wc -l "/tmp/journey-log-$ROOM.jsonl"   # 0 lines ⇒ no logs stored (game predates persistence, or wrong id)

# Local emulator (npm run dev) — note the ns and that the port may vary (9000, 9002, ...)
curl -s "http://127.0.0.1:9000/rooms/$ROOM/logs.json?ns=demo-journey-prototype" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin) or {}; [print(d[k]) for k in sorted(d)]' \
  > "/tmp/journey-log-$ROOM.jsonl"
```

The database URL is `VITE_FIREBASE_DATABASE_URL` (project `redacted-firebase-project`).
Then run the rest of this skill against `/tmp/journey-log-$ROOM.jsonl` exactly as
if it were `logs/journey-log.jsonl` — every entry already carries its `gameId`, so
`grep '"gameId":"r3f7vk"'` still isolates it (the converted file holds only that
game). Non-CLI alternative: open `https://redacted-firebase-project.web.app/?viewLogs=<roomId>`
(or `http://localhost:5173/?viewLogs=<roomId>` locally) and use the viewer's
**Download .jsonl** button to get the identical file.

## Phase 1: Draft pool questions

### Key events (in order of construction)

| Event | What it records |
|---|---|
| `avatar_package_validation_summary` / `avatar_package_skipped` | Which avatars were eligible to seed a pool and which were rejected, **with the `reason`** (e.g. `mandatory-only pool size 109 is outside 110-150`). This is the first gate — a card's avatar may never have qualified. |
| `draft_pool_constructed` | The authoritative tides4 provenance record: `algo`, `seed`, `avatarId`, `poolSize`, `distinctCardCount`, `tideDeckIds`, and `tides4Tuning`. |
| `draft_pool_initialized` | Tide/color breakdown of the finished pool (`cardCountByTide`, `selectedPackageTides`). |
| `draft_offer_revealed` / `draft_site_entered` | The actual 4-card offers (`offerCards` = card numbers) shown at each `pickNumber`. |
| `draft_pick_player` | What the player picked from each offer. |

### Reading `draft_pool_constructed` provenance

The `tides4` pool is the union of the dealt tide decks in `tideDeckIds`, subject
to the logged `tides4Tuning` values (`dealSize`, `copyCap`, and `maxFacets`). The
first selected tide is the Avatar's signature tide; the remaining ids are
dealt from its authored facet/neutral tide pool. Cross-reference those ids with
`data/tides.ron` to see the exact UUID-keyed card lists.

For "Why is card UUID X in my pool?", isolate the game's
`draft_pool_constructed`, confirm its `avatarId`, then find X in the cards
of the logged `tideDeckIds`. Report the tide id and role that contributed it. If
X appears in more than one selected tide, `copyCap` explains whether it receives
an additional copy. If the trace lacks `tideDeckIds` or tuning, report the
missing provenance instead of inventing a rationale.

### Determinism

`algo` + `seed` + `avatarId` fully determine the pool. To reproduce or dig
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
| `dreamsign_acquired` | What was taken: `name`, `isNegative`, `sourceSiteType`. |

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

## Phase 2.5: Opponent (battle) deck questions

"Why did this battle's opponent run *Card X*?" / "Why is this opponent deck so
strong/coherent?" The opponent deck is built by a simulated **coherent draft**:
best-of-N seeded drafts, each picking the card that best fits the deck so far
(corpus-trained fit model), pruned of its least-coherent cards, then scored for
coherence (and, in an affiliated dreamscape, affiliation fit). One event records
the whole decision process.

### `opponent_deck_constructed`

Filter to the game and battle (`battleEntryKey`). Key fields:

- `opponentAvatarId`, `completionLevel`, `layerCount`,
  `midpointCompletionLevel`, `carriesDreamsign`, `dreamsignIds` — who the
  opponent is and the run depth that scaled it.
- `poolSeed` — the seed the whole construction is a pure function of; re-running
  with it reproduces the deck exactly.
- `pickBudget`, `removalCount`, `copiesPerCard`, `distinctCardCount`, `deckSize`
  — the difficulty levers at this completion level (all grow with the run).
- `candidateCount`, `winningDraftIndex`, `candidateSummaries` — the best-of-N
  selection. Each summary has `coherence`, `affiliationFit`, `combined`; the
  winner is the highest `combined`. Second-guess the choice by reading the
  runners-up.
- `coherenceScore` + `coherenceComponents` (`nearestNeighbor`,
  `meanPairwiseCooccur`, `selfConsistency`) — how coherent the final deck is.
  Compare against the harness baselines (`npm run opponent-coherence-metric`).
- `targetAffiliationId`, `affiliationFit` — the affiliation the deck was steered
  toward (null in a neutral dreamscape) and how well it landed.
- `pickTrace` — the winning draft's per-pick decisions: each entry is
  `{pick, chosen, fit, rank, candidates}` (the chosen card, its fit score, its
  rank in the pack, and the pack candidates). This answers "why card X": find the
  pick that took it and read its `fit`/`rank`, or confirm it was never offered.
- `removedCardNumbers` — the cards the post-draft prune cut as least-coherent.

So "Why did this opponent run *Card X*?" → find the `pickTrace` entry whose
`chosen` is X (it won its pick at the logged `fit`/`rank`), and confirm X is not
in `removedCardNumbers`. "Why this opponent and not another draft?" →
`candidateSummaries` shows the winning draft beat the others on `combined`.

`builtFromSimulation: false` means the fallback deck was used (no fit model /
corpus available, or AI self-play); the coherent-draft fields are absent. A line
that carries only the older summary fields (no `pickTrace`/`coherenceScore`)
predates this construction — reconstruct only what those fields allow.

## Phase 3: Answer

Structure the answer as a reconstruction, not an assertion:

1. **Identify the game** (`gameId`, `avatarId`, `seed`).
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
