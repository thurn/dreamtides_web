# Corpus opponent-deck algorithm — design

A second, **switchable** opponent-generation algorithm, surfaced in the
`/opponent` debug view alongside today's "coherent draft." Instead of
simulating a fresh draft, it **selects a real known-good decklist that fits the
opponent's Dreamcaller (and, secondarily, the dreamscape affiliation), then
tunes that deck by run layer** to control difficulty and progression.

Scope for this iteration is **the debug view only**. Live battles keep using the
existing `buildOpponentDeck` coherent-draft generator. The new algorithm is built
so it *can* later become the live path, but no battle wiring is in scope here.

## Background and current state

- `/opponent` renders `OpponentDebugApp`
  ([src/debug/OpponentDebugApp.tsx](../../src/debug/OpponentDebugApp.tsx)),
  which today shows a single fixed algorithm: the simulated coherent draft in
  [src/battle/integration/opponent-deck.ts](../../src/battle/integration/opponent-deck.ts)
  (`buildOpponentDeck`). There is no algorithm switcher.
- `/sigdecks` ([src/debug/SignatureDecksApp.tsx](../../src/debug/SignatureDecksApp.tsx))
  already does the *selection* half we want: it picks the real corpus deck that
  best fits a Dreamcaller's signature using an **IDF-cosine `fit`** metric, with
  `match` and `typical` modes. Its IDF-cosine logic is implemented locally in that
  file (a near-duplicate of `idfCosine` in
  [src/draft/pool/variant-idf.ts](../../src/draft/pool/variant-idf.ts)).
- Runs progress through a fixed **7-layer** Dream Atlas, **0-indexed**, with
  exactly **one battle per layer**: layer 0 = first battle (starter dreamscape),
  layer 6 = boss.
- Dreamscapes carry an `affiliation-id`; affiliations
  ([data/tabula/affiliations.toml](../../data/tabula/affiliations.toml)) carry a
  curated `signatureCards` UUID list.
- 32 Dreamcallers; **20 carry `signature-card-ids`**, 12 do not.
- Cards have `rarity` of `""`, `"Starter"` (10 cards), or `"Legendary"` (8 cards);
  `isStarter` is the runtime flag.
- 154 dreamsigns; opponents currently receive a **random** dreamsign from the
  run midpoint onward.

## Inputs

All of these are available at runtime (some require a new generated artifact, noted below):

- **Known-good decklist corpus** (new artifact) — see "Deck corpus" below.
- **IDF statistics** computed over the known-good corpus (document frequency,
  per-card IDF, per-deck L2 norms).
- **Dreamcaller signatures** — `signatureCardIds` from
  [data/tabula/dreamcallers_v2.toml](../../data/tabula/dreamcallers_v2.toml).
- **Affiliation signatures** — `signatureCards` from
  [data/tabula/affiliations.toml](../../data/tabula/affiliations.toml); the
  dreamscape's affiliation is resolved the same way `buildOpponentDeck` does today.
- **Card catalog** — for `rarity` / `isStarter` (`public/cards_v2-data.json`).
- **Dreamsign signature data** (new artifact) — see "Dreamsign synergy" below.
- **Battle seed** and **layer index** — drive the seeded sampling and the
  layer-tuning schedule.

## Deck corpus: known-good decklists only

The base-deck pool is **exactly** the 497 curated decklists in
[docs/known_good_decklists.json](../../docs/known_good_decklists.json), and
**nothing else**. This replaces the sigdecks ≤28-card / 206-deck filtered corpus
for this algorithm.

The manifest is an allowlist: each entry identifies a deck by `draftId`, `seat`,
`name`, and source `file`, but does **not** contain card lists. Resolve each to
mainboard **UUIDs** from `docs/draft_records_adapted/`:

- Build the set of `"<draftId>#<seat>"` keys from the manifest.
- Call the existing
  `buildDraftRecords(draftRecordsAdaptedDir, cardMaps, { seatFilter, requireFullPicks: false })`
  in [scripts/setup-assets.mjs](../../scripts/setup-assets.mjs). The `seatFilter`
  keeps only allowlisted seats; `requireFullPicks: false` keeps seats regardless
  of trimmed-pick count (the default `true` would drop the 44 known-good decks
  whose drafts never yield exactly 30 trimmed picks).
- Emit a dedicated artifact **`public/known-good-decklists-data.json`**, one entry
  per known-good seat: `{ id, draftId, seat, name, mainboardIds }`.

Verification already run against live data: all **497/497** decks resolve, with
**0** card UUIDs dropped. Resolved deck sizes run **7–43, median 29**.

### Open fidelity item (resolved in the plan)

Resolved sizes sit slightly above each manifest's `nonlandSize` (e.g. "WG Value
Midrange" resolves to 27 vs `nonlandSize` 26; "URG" to 36 vs 26) — a small tail of
land-equivalent cards survives adaptation. Because the fit metric is
size-normalized and land-equivalents are common (low IDF), this does not distort
selection, but a plan step will reconcile the gap and decide whether to trim those
surviving cards so a corpus deck equals its curated nonland deck.

### IDF over the known-good corpus

All document frequencies, per-card IDF, and per-deck norms are computed over this
**497-deck known-good set** — not the broader 993-seat corpus. Identity is always
by lowercased cards_v2 **UUID**, never by name (24 cards share a display name).

## The fit metric (unified IDF cosine)

Reuse the IDF-cosine `fit` `/sigdecks` uses. For a query card set `Q` (a set of
UUIDs, each weighted by its IDF over the known-good corpus) and a deck `D`:

```
fit(Q, D) = ( Σ idf(c) over c in Q present in D ) / ( ‖D‖ · ‖Q‖ )
```

Both selection fits are this same metric with different query sets — the design
deliberately drops the separate per-card affinity-weights path so there is one fit
implementation:

- `signatureFit(D)` = `fit(dreamcaller.signatureCardIds, D)`
- `affiliationFit(D)` = `fit(affiliation.signatureCards, D)`

### Targeted cleanup

Extract the IDF-corpus + cosine `fit` logic currently duplicated inside
`SignatureDecksApp.tsx` into a shared module (e.g.
`src/draft/replay/idf-fit.ts` or similar) consumed by both `/sigdecks` and the new
algorithm, so there is a single implementation. This is in-scope because the new
algorithm needs the same logic and the duplication would otherwise grow.

## Stage A — base deck selection

1. Compute `signatureFit(D)` and `affiliationFit(D)` for every known-good deck.
2. `combined(D) = signatureFit(D) + λ · affiliationFit(D)`, with **λ = 0.25**
   (tunable constant; keeps the signature primary and the affiliation a secondary
   nudge).
3. **Candidate set** = decks that share at least one signature card with the
   Dreamcaller (the same candidate rule sigdecks uses).
4. Rank candidates by `combined`, descending; take the **top K = 8** (tunable).
5. **Seeded top-K sample**: pick one of the top-K using the battle seed. Same seed
   ⇒ same base deck (reproducible); a different seed / the `/opponent` "Refresh"
   button ⇒ a different strong-fit deck.

### Edge cases

- **Dreamcaller without signatures** (12 of 32): rank by `affiliationFit` alone,
  take top-K, seeded-sample.
- **Neutral starter dreamscape** (layer 0, no affiliation): use `signatureFit`
  alone.
- **Neither available** (no signature and no affiliation): seeded-random over the
  full known-good corpus.

## Stage B — layer tuning

Applied as a deterministic, seeded pipeline to the selected base deck. Layers are
0-indexed (layer 0 = first battle … layer 6 = boss).

| Modification | Layer 0 | Layer 1 | Layer 2 | Layer 3 | Layer 4 | Layer 5 | Layer 6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dreamcaller ability active | no | yes | yes | yes | yes | yes | yes |
| Legendary cards allowed | no | no | no | no | no | yes | yes |
| Least-synergistic cards → Starters | 10 | 5 | 0 | 0 | 0 | 0 | 0 |
| Dreamsign assigned | 0 | 0 | 0 | 1 | 1 | 1 | 1 |

Pipeline order (deterministic):

1. **Legendary suppression** (layers 0–4): remove every `Legendary`-rarity card.
   Each removed card is **replaced** so deck size is preserved: the replacement is
   the non-Legendary card with the highest IDF co-occurrence to the current deck
   (the inverse of the least-synergistic metric), drawn from cards that appear in
   the top-K candidate decks but are not already in the deck; seeded tie-break.
   (Tunable: could instead drop Legendaries without replacement.) Allowed from
   layer 5+.
2. **Starter dilution** (layers 0–1): remove the **N least-synergistic non-starter
   cards** and add **N Starter cards**, preserving deck size. N = 10 at layer 0,
   5 at layer 1, 0 afterwards. Layer 0 adds all 10 Starters; layer 1 adds the 5
   Starters that best fit the diluted deck (seeded tie-break).
3. **Dreamsign assignment** (layers 3+): assign exactly **1** dreamsign that best
   fits the tuned deck (see below). None on layers 0–2.
4. **Dreamcaller ability flag**: active on layers 1+, inactive at layer 0
   (surfaced as a flag in the debug view; battle enforcement is out of scope).

### "Least synergistic" metric

Reuse the existing co-occurrence / coherence scoring in
[src/battle/integration/coherence.ts](../../src/battle/integration/coherence.ts).
The least-synergistic card is the one with the **lowest IDF-weighted mean
co-occurrence with the rest of the deck**, recomputed iteratively after each
removal (the same approach `buildOpponentDeck`'s post-draft removal uses), now
computed over the known-good corpus. Starter cards are never candidates for
removal during dilution.

## Dreamsign synergy

Dreamsigns are either **neutral** (broadly useful in any deck) or **tailored**
(meaningfully stronger in a specific build). Each tailored dreamsign gets a
`signature-card-ids` UUID list — the cards most indicative that a deck wants it —
mirroring how Dreamcallers carry signature cards.

### New artifact

`data/tabula/dreamsign_signatures.toml`, one entry per dreamsign:

```toml
[[dreamsign]]
id = "<dreamsign UUID>"
category = "neutral"        # or "tailored"
signature-card-ids = []     # populated for tailored dreamsigns
```

Wired through `setup-assets.mjs` into `public/dreamsign-signatures-data.json`
(following the existing `dreamsign_profiles.toml` → `dreamsign-profiles-data.json`
pattern).

### How the artifact is produced (a step in the implementation plan)

A subagent team classifies all 154 dreamsigns and assigns signature cards to the
tailored ones, grounded strictly in real data:

- Each agent works from the dreamsign's rendered text and the full 519-card pool;
  the existing `dreamsign_profiles.toml` features are passed as a weak prior.
- Pipeline: **classify → independent adversarial verify → consistency review →
  re-adjudicate flagged disagreements**.
- Agents copy card UUIDs verbatim from the catalog; every returned UUID is then
  validated programmatically against `cards_v2` (drop/flag any that do not match,
  check name↔id consistency).

### Dreamsign → deck fit

Score each **tailored** dreamsign by `fit(dreamsign.signatureCardIds, deck)` using
the same IDF-cosine over the known-good corpus. From layer 3+, assign the
highest-fitting tailored dreamsign. The default fit threshold is **permissive**:
take the best tailored dreamsign whose `signatureCardIds` overlap the deck by at
least one card (`fit > 0`); if none overlap, fall back to a seeded **neutral**
dreamsign. The threshold is a tunable constant to be calibrated against logged
selections during implementation.

## `/opponent` UI

- Add an **algorithm switcher** (mirroring the `/sigdecks` mode toggle), mirrored
  to a `?algo=` URL parameter for shareable links: `?algo=coherent` (default) and
  `?algo=corpus`.
- In `corpus` mode, the panel additionally shows:
  - the selected source seat (`name`, `draftId#seat`, source file);
  - `signatureFit`, `affiliationFit`, `combined`, candidate count, and the top-K
    window;
  - a **diff** of the layer modifications (Legendaries pulled, cards cut, Starters
    added);
  - the assigned dreamsign (or "none — layer < 3");
  - whether the Dreamcaller ability is active.
- Keep the existing layer, dreamscape, and Refresh controls. Refresh re-rolls the
  seed → a new top-K sample and new seeded modifications.
- Structure the debug view around a small **algorithm registry** so future
  algorithms slot in without bespoke wiring.

## Code structure

- New `src/battle/integration/corpus-opponent-deck.ts` exporting
  `buildCorpusOpponentDeck(args)`, parallel to `buildOpponentDeck`. It returns the
  **same opponent shape** as the existing generator (deck card UUIDs, dreamsigns,
  ability-active flag) plus a provenance object the debug view renders.
- Reuse: the extracted shared IDF-fit module, the coherence co-occurrence scoring,
  the Starter-card list, and the new dreamsign-signature artifact.
- `buildKnownGoodDecklists` step in `setup-assets.mjs` producing
  `public/known-good-decklists-data.json`.

## Logging

Per the project logging requirement, log to `logs/quest-log.jsonl` so any
generated opponent is reconstructable: the chosen source deck (`draftId#seat`,
fits, combined score, candidate count, top-K window, seed), every Stage B
modification (Legendaries removed, cards cut with their synergy scores, Starters
added), and the assigned dreamsign with its fit. "If someone asked me to
reconstruct what this algorithm did in a given production game, would I be able
to?" — yes.

## Tunable constants (single source at the top of the module)

| Constant | Default | Effect |
| --- | --- | --- |
| `AFFILIATION_WEIGHT` (λ) | 0.25 | Weight of affiliation fit relative to signature fit in `combined`. |
| `TOP_K` | 8 | Size of the strong-fit window the seed samples from. |
| `STARTER_DILUTION` | `[10, 5, 0, 0, 0, 0, 0]` | Cards swapped for Starters, indexed by layer. |
| `LEGENDARY_ALLOWED_FROM_LAYER` | 5 | First layer at which Legendaries are kept. |
| `ABILITY_ACTIVE_FROM_LAYER` | 1 | First layer at which the Dreamcaller ability is active. |
| `DREAMSIGN_FROM_LAYER` | 3 | First layer at which a dreamsign is assigned. |
| `DREAMSIGN_FIT_THRESHOLD` | `> 0` (≥1 shared card) | Minimum tailored-dreamsign fit before falling back to a neutral dreamsign; calibrated against logs. |

## Out of scope (YAGNI)

- Wiring the new algorithm into live battles (debug-view-only this iteration).
- Removing or retiring the coherent-draft algorithm.
- A layer-scaled deck-size curve (the base deck keeps its natural size; difficulty
  is tuned via the Stage B levers above).

## Implementation plan steps (high level — detailed plan follows separately)

1. Add `buildKnownGoodDecklists` to `setup-assets.mjs`; emit
   `public/known-good-decklists-data.json`; reconcile the resolved-vs-nonland size
   gap.
2. Extract the shared IDF-fit module; refactor `/sigdecks` onto it.
3. Run the dreamsign classification subagent workflow; produce and validate
   `data/tabula/dreamsign_signatures.toml`; wire it through `setup-assets.mjs`.
4. Implement `buildCorpusOpponentDeck` (Stage A + Stage B) with logging.
5. Add the algorithm registry + switcher + provenance panel to `OpponentDebugApp`.
6. Verification: lint, typecheck, tests, and browser QA of `/opponent` in both
   `?algo=` modes across layers and dreamscapes.
