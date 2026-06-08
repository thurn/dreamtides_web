# Affinity-Corpus Distillation: a committed card-embedding for `sigseed`

Status: design / handoff. Author: design exploration, 2026-06-08.

> This document is a self-contained handoff for an implementing agent with **no
> prior context** on Dreamtides draft-pool construction. Sections 1–4 are
> orientation and evidence; Sections 5–9 are the design and the work to do;
> Sections 10+ are reference. Read it top to bottom.

---

## 0. One-paragraph summary

The `sigseed` draft-pool generator (the shipping default) derives a card×card
"affinity corpus" — a synergy matrix plus a play-rate prior — from a large set of
historical draft records. That corpus is the **only** thing the generator derives
from those records; pool generation is otherwise a deterministic function of
`(corpus, signature, seed)`. Because the corpus is built entirely from historical
play, the generator cannot accommodate a **new** card (it has no synergy data), a
**changed** card (its data is stale), or a designer's intent ("this card plays like
A, B, C") — the only lever is to collect more real drafts. This migration distills
the corpus into a **committed per-card embedding** (`data/affinity_embedding.json`):
each card becomes a pair of vectors plus a prior — a true card vector database —
checked into version control and loaded directly by the generator. New and changed
cards are authored in a **committed overlay** of "resembles" recipes that are folded
into the embedding at bake time. The historical records become an upstream bake
input rather than the live source. The embedding is a low-rank distillation of the
record-derived synergy, validated as **metric-equivalent** to the exact generator
against the existing `buildaround-support-experiment.mjs` quality metric.

> Motivation is **editability**, not artifact size: this prototype is not served
> over the internet, so the byte size of the records is not itself a concern. The
> goal is to decouple the generator from the historical dataset so cards can be
> added and changed directly.

---

## 1. Domain background (what these words mean)

**Dreamtides** is a digital card game. The **quest prototype** (this repo) is its
single-player roguelike shell. During a run the player drafts a deck from a
**draft pool**: a fixed multiset of ~150–200 card copies (each distinct card
appears 1 or 2 times — the "2-copy cap"). The pool is generated per **Dreamcaller**
(the run's hero, 32 of them) and is meant to feel coherent — built around a
recognizable strategy ("warriors", "discard", "survivors", …) rather than a random
pile.

Each Dreamcaller has a **signature**: a short list (~3–6) of distinctive card
UUIDs that define its identity (e.g. Kell Tarn's signature includes "Duskreaper").
A pool generator can **steer** toward a signature so the pool supports that hero's
strategy.

**Cards are identified by stable UUIDs**, never by display name. A card's printed
name can be re-skinned; the UUID (`data/tabula/cards_v2.toml`, field `id`) is the
permanent identity. All draft data, signatures, and metadata key on these UUIDs.

There are many **pool-generation variants** (algorithms), selectable at runtime via
the `?algo=` URL parameter. The current default is **`sigseed`**
(`src/draft/pool/types.ts` → `DEFAULT_POOL_VARIANT`). A family of variants —
`pickfit`, `pickcohere`, `picksig`, `sigseed`, `pickearly`, `pickpos`,
`pickchoice` — all share one engine (the "affinity grower") and one data source
(the draft-record-derived affinity corpus). This migration is about **that shared
corpus**.

---

## 2. How `sigseed` works today (current system)

### 2.1 Data inputs (build-time → runtime)

`scripts/setup-assets.mjs` runs at build/dev start and produces the runtime JSON
assets in `public/` (all gitignored — they are regenerated from the checked-in
sources in `data/` and `docs/`):

| Source (checked in) | Built asset (`public/`, gitignored) | Role |
|---|---|---|
| `data/tabula/cards_v2.toml` | `cards_v2-data.json` (516 KB) | card catalog (519 cards: id, name, …) |
| `docs/draft_records_adapted/*.jsonc` (1061 files) | `draft-records-data.json` (**19 MB**) | 993 real draft "seats", each 30 picks with the full pack offered at each pick |
| `docs/draft_records_adapted/*` (mainboards) | `decklists-data.json` (709 KB) | finished decklists (used by other variants) |
| `data/tabula/dreamcallers_v2.toml` | `dreamcallers-v2-data.json` (23 KB) | the 32 Dreamcallers + their signatures |
| `data/buildaround_support.json` (checked in) | (read directly) | per-card theme metadata for the **quality metric** (Section 4) |

`buildDraftRecords` (`scripts/setup-assets.mjs:228`) bundles the adapted records
into `draft-records-data.json`. Each seat carries `packIds[i]` (UUIDs offered at
pick `i`) and `pickIds[i]` (UUIDs taken), aligned index-for-index — the
"taken-over-passed" signal.

### 2.2 Runtime path (browser)

1. `loadDraftRecords()` (`src/data/cards-v2-database.ts:~66`) `fetch`es
   `/draft-records-data.json` — the 19 MB records bundle.
2. `quest-content.ts:~421` calls
   `buildPoolData(cards, decklists, draftRecords.map(r => ({packs: r.packIds, picks: r.pickIds})))`
   (`src/draft/pool/pool-data.ts:46`) → a `PoolData` carrying `draftRecords`.
3. Per Dreamcaller, `generateDreamcallerPool` (`quest-content.ts:136`) calls
   `generatePoolFromData(poolData, seed, …, "sigseed", …, signatureCards)`
   (`src/draft/pool/generate.ts:60`), which builds a seeded RNG
   (`makeRng`, mulberry32, `rng.ts:4`) and dispatches to the `sigseed` strategy.
4. `generateSigSeed` (`src/draft/pool/variant-sigseed.ts:97`):
   - `buildSigSeedCorpus` → `buildPickfitCorpus` (`variant-pickfit.ts:77`) →
     `buildExcessLiftCorpus(accumulatePickStats(records))`
     (`src/draft/pool/pick-stats.ts:59` and `:127`). **This is the only place the
     records are consumed.** Memoized in a `WeakMap` keyed by `poolData`
     (`variant-pickfit.ts:71`), so it is built once per page load.
   - `resolveSignatureToCorpus` (`variant-picksig.ts:90`) maps the signature
     names→UUIDs and intersects with the corpus.
   - `drawSignatureSubset` (`variant-sigseed.ts:72`) draws a random 1–4 of them.
   - `growAffinityPoolFromSeeds` (`affinity-grower.ts:86`) greedily grows the pool
     to `SIGSEED.targetSize` (150 copies) by blended affinity.
   - If no signature card resolves, it falls back to `pickcohere`
     (`variant-pickcohere.ts`) on the same corpus.

### 2.3 The central object: `AffinityCorpus`

Defined in `src/draft/pool/affinity-grower.ts:34`:

```ts
interface AffinityCorpus {
  cards: string[];                          // N card-key universe (UUIDs)
  affinity: Map<string, Map<string, number>>; // affinity[d][c] = synergy of c given d
  prior: Map<string, number>;               // availability-corrected pick rate, [0,1]
}
```

- `prior(c) = taken(c) / offered(c)` — how desirable c is, corrected for how often
  it was offered.
- `affinity[d][c]` = shrunk **excess** conditional pick rate: how much more likely
  drafters were to take `c` once `d` was in their pool, above `c`'s baseline,
  floored at 0. Isolates *synergy* from raw power (power lives in the prior).
  Asymmetric; each row normalized by its own source card.

The grower (`affinity-grower.ts:86`) scores each candidate as
`score(c) = w·seedAffinity(c) + (1−w)·poolAffinity(c) + p·prior(c)` and adds the
argmax each step, capping copies at 2. **It reads nothing but the corpus, the seed
set, and the tuning constants.** Tie-breaks are by `(fewer copies, then lower
card-key)` — independent of the order of `corpus.cards`.

### 2.4 The load-bearing fact

> Everything `sigseed` derives from the 19 MB of records is captured in the
> `AffinityCorpus`. Given that corpus, a signature, and a seed, pool generation is
> fully deterministic. The records are never read again.

This is what makes the migration possible and safe.

### 2.5 Measured shape of the corpus

- Universe: **501 cards** (cards ever taken), out of 519 in the catalog.
- Affinity matrix: **103,211 nonzero entries**, 41.1 % dense (avg 206 partners/row).
- Prior: 501 floats.

---

## 3. The problem this migration solves

**The generator's behavior is locked inside a large historical dataset; there is no
file a designer can edit to change it.** The corpus is keyed entirely by historical
card UUIDs and built solely from past play, so:

- a **new** card has no row/column and cannot enter a pool at all;
- a **changed** card keeps its stale historical synergies;
- design intent — "this new card plays like A, B, C, so place it near them" — has
  nowhere to live.

The only lever today is to collect more real drafts and re-bundle. The goal of this
migration is an **editable, committed file** that defines additions and changes to
drafting behavior, so evolving the card set is a text edit plus a re-bake rather
than a data-collection exercise. (This is about editability; the prototype is not
served over the internet, so the records' byte size is not itself a concern.)

---

## 4. Validated findings (evidence base — reproduce, do not re-derive)

A throwaway harness rebuilt `sigseed` against swappable corpora and scored each
with the **existing** quality metric (`scripts/buildaround-support-experiment.mjs`,
see Section 11). The metric simulates every Dreamcaller × N seeds and reports, per
generator:

- **adequacy** (0–100): when a build-around payoff is in a pool, is its supporting
  theme present densely enough? Higher better.
- **adequacy (steered)**: same, restricted to Dreamcallers with a real signature.
- **traps/pool**: expected count of payoff cards the pool *cannot* support (lower
  better).
- **themeEvenness** (0–100): are the standalone archetypes draftable at even rates,
  or does the generator collapse onto one (higher = more even)?
- **#cards**: distinct cards appearing across all pools (coverage proxy).

Result (25 seeds × 32 Dreamcallers = 800 pools per corpus):

| corpus | adeq | adeq(steer) | traps | themeEven | #cards | size (gz) |
|---|---|---|---|---|---|---|
| **exact (live, 19 MB records)** | 98.2 | 97.2 | 0.74 | 96.0 | 491 | 4.5 MB (records) |
| in-memory matrix, rounded 5-digit | 98.2 | 97.2 | 0.74 | 96.0 | 491 | 385 KB |
| **embedding, rank 16** | 98.1 | 97.2 | 0.80 | 95.6 | 466 | **52 KB** |
| **embedding, rank 32** | 97.9 | 96.9 | 0.69 | 95.7 | 472 | **88 KB** |
| embedding, rank 8 | 97.7 | 97.2 | 0.91 | 93.8 | 465 | 34 KB |
| embedding, rank 64 | 97.6 | 96.3 | 0.94 | 96.4 | 485 | 160 KB |
| _CTRL: synergy shuffled_ | 84.7 | 84.4 | 4.57 | 43.0 | 481 | — |
| _CTRL: prior-only (no synergy)_ | 93.2 | 93.3 | 3.70 | 43.1 | 236 | — |

**Conclusions:**

1. **The record→matrix step is exactly lossless.** A rounded in-memory matrix
   equals the live numbers on every metric, and a per-pool byte-identity check
   matched the official `generatePoolFromData(..., "sigseed", ...)` output **5/5**
   for a sample of `(Dreamcaller, seed)`. This is the reference the embedding is
   measured against.
2. **The metric genuinely discriminates** (so ~97 is preserved signal, not a
   saturated ceiling): shuffling synergy tanks adequacy to 84.7 and traps to 4.57;
   dropping synergy (prior-only) collapses theme-evenness to 43 and distinct cards
   to 236.
3. **The embedding is metric-equivalent to the exact generator.** Rank 16 (52 KB
   gz) and rank 32 (88 KB gz) are indistinguishable from exact on every metric.
   The synergy matrix is effectively low-rank with respect to pool quality, so a
   per-card vector representation loses nothing that matters. **This is what
   licenses making the embedding the committed runtime artifact.**

The size column is incidental, not a goal (the prototype is not served over the
internet). It is reported only because a committed artifact should be comfortable
to diff and review: the rank-32 embedding is ~88 KB gz (a few hundred KB raw),
versus the 1.4 MB in-memory matrix it is fit from.

---

## 5. Target architecture

The committed **embedding** is the runtime artifact and the core of this design.
Separate three concerns that the current system fuses:

| Concern | Current | Target |
|---|---|---|
| **Upstream data** | historical records, recompiled at runtime | records, read **only at bake time** |
| **Runtime artifact** | matrix rebuilt in-browser from records | committed **embedding** `data/affinity_embedding.json`, served and loaded directly |
| **Card edits / new cards** | (impossible without new records) | committed **overlay** of "resembles" recipes, folded into the embedding at bake time |

### 5.1 The runtime substrate is the committed embedding

Each card is `(U[card], V[card], prior[card])`, where `U`/`V` are rank-`R` vectors
(default **R = 32**), and synergy is reconstructed as
`affinity(d, c) = max(0, U[d]·V[c])`. The loader turns the embedding back into an
in-memory `AffinityCorpus`, so **the grower and every variant are untouched** —
they keep consuming `AffinityCorpus` exactly as today.

The embedding is **checked into version control** at `data/affinity_embedding.json`
(alongside other committed derived artifacts like `data/buildaround_support.json`).
`scripts/setup-assets.mjs` copies it to `public/affinity-corpus-data.json` (a
gitignored served asset) the same way it emits the other `public/` JSON, and the
generator loads that copy. Loading the committed embedding — rather than rebuilding
the corpus from records at runtime — is what makes the overlay-authored cards and
edits take effect; a from-records rebuild would not contain them.

The record-derived **matrix is a build-time intermediate**: it is materialized
in-memory during the bake to fit the embedding, and during validation as the exact
reference (Section 10). It is not shipped and need not be checked in. The records
(`docs/draft_records_adapted`) remain the upstream input used when re-baking.

### 5.2 Card edits are recipes, not hand-tuned vectors

The overlay (`data/affinity_overlay.jsonc`) is **the human-editable surface — the
file a designer opens to evolve the card set.** The embedding is baked from it and
is not hand-edited (opaque float vectors). A card addition/edit is stored as a
**recipe** ("X resembles A, B, C") in the overlay, applied to the in-memory matrix
**at bake time**, before the embedding is fit. This is essential: SVD axes are
arbitrary up to rotation, so hand-tuned latent vectors would not survive a re-bake
from updated records, whereas a recipe re-applies in any basis. Adding a card to
the overlay and re-running the bake yields a new committed embedding in which the
card has a consistent vector.

### 5.3 Scope — what this covers and what it does not

**Covers** the affinity-corpus consumers: `sigseed` (default) and the rest of the
affinity-grown family (`pickfit`, `pickcohere`, `picksig`, `pickearly`, `pickpos`,
`pickchoice`) — see `POOL_VARIANTS_NEEDING_RECORDS` (`quest-content.ts:84`).

**Does not cover** two other runtime consumers of `draft-records-data.json`, which
keep working as-is:

- **Record-replay draft mode** replays actual recorded drafts and fundamentally
  needs the raw seats (`loadDraftRecords` → `quest-state-actions.ts:~414`,
  `App.tsx:~96`).
- **The `replay` fit-model** is built from record *mainboards*
  (`buildFitModel(draftRecords.map(r => r.mainboard))`, `quest-content.ts:~440`) —
  a different corpus, separately distillable later.

**Runtime dependency:** the pool path loads the committed embedding rather than the
records. The records are still loaded when a run uses record-replay mode or the
`replay` fit-model. The pool fetch is gated by `poolVariantNeedsRecords`; extend
that gate so a corpus-driven variant loads the embedding. (Whether the records are
still loaded for those other features is a scope/correctness matter, not a size
one.)

---

## 6. Data formats (precise schemas)

Two committed files. Both key cards by lowercase UUID; floats rounded to 5 decimals.

### 6.1 The embedding — `data/affinity_embedding.json` (committed; the artifact)

```jsonc
{
  "version": 1,
  "kind": "embedding",
  "rank": 32,
  "cards": ["<uuid0>", "<uuid1>", ...],   // length N; the card-key universe
  "prior": [0.42, 0.0, ...],              // length N, aligned to `cards`
  "U": [[...rank floats...], ...],        // N x rank — source ("what this card pulls")
  "V": [[...rank floats...], ...]         // N x rank — target ("what pulls this card")
}
// Reconstruct: affinity(d, c) = max(0, sum_r U[d][r] * V[c][r])
```

The loader (`deserializeCorpus`) reconstructs the `AffinityCorpus`: `prior` and
`cards` map straight across; `affinity` is densified from the dot products, keeping
entries `> 1e-6`. N = 501, rank ≤ 32 → a few MB transient memory and a per-step row
fold ~2.4× wider than the native sparse matrix — negligible for 32 pools per run.

`setup-assets.mjs` copies this file verbatim to
`public/affinity-corpus-data.json`; add that served path to `.gitignore`.

### 6.2 Authoring overlay — `data/affinity_overlay.jsonc` (committed; human-edited)

```jsonc
{
  // New cards not present in the historical records.
  "add": [
    {
      "id": "<new-card-uuid>",
      "resembles": ["<uuidA>", "<uuidB>", "<uuidC>"],
      "priorScale": 1.0   // optional, default 1.0
    }
  ],
  // Re-point or rescale an existing card's behavior.
  "edit": [
    { "id": "<existing-uuid>", "resembles": ["<uuidX>", "<uuidY>"], "priorScale": 0.8 }
  ]
}
```

`resembles` UUIDs may reference any card already present (base or a previously
processed overlay entry), enabling composition. Adding a card here changes how it
**drafts**; to make it count in the **quality metric**, also add its theme entry to
`data/buildaround_support.json` (the two metadata systems are independent).

### 6.3 Optional matrix dump (debug only, not committed)

For inspecting raw synergies, the bake may optionally emit the in-memory matrix in
an index-keyed sparse form (`{cards, prior:[...], affinity:[[d,[[c,v],...]],...]}`,
indices into `cards`). This is a debugging convenience, not a shipped or committed
artifact.

---

## 7. The blend ("resembles") algorithm

Applied to the in-memory matrix at bake time, after building the base corpus from
records and **before** the embedding fit. Process `add` then `edit`, each in array
order. Let `R = resembles`, `s = priorScale ?? 1`, and `mean_r f(r)` average over
`r ∈ R`.

For an **add** `{id: X, resembles: R, priorScale: s}` (error if X already present):

1. Append `X` to `cards`.
2. `prior[X] = s · mean_r prior[r]`.
3. Outgoing row — for every existing target `c`:
   `affinity[X][c] = mean_r affinity[r][c]` (drop zeros).
4. Incoming column — for every existing source `d`:
   `affinity[d][X] = mean_r affinity[d][r]` (drop zeros).
5. `affinity[X][X] = 0` (no self-pairing).

For an **edit** `{id: X, resembles?: R, priorScale?: s}` (X must exist): recompute
`prior[X]`, `row(X)`, `col(X)` by the same formulas when `R` is given; when only
`priorScale` is given, multiply the existing `prior[X]` by `s`.

Rationale: a card's *outgoing* row is "what I pull into the pool"; its *incoming*
column is "what pulls me in". Averaging neighbors' rows/columns places `X` in the
synergy geometry next to A/B/C, so a signature or pool containing A/B/C-like cards
pulls `X`, and `X` pulls their partners. Because the embedding is fit *after* this
step, the new card receives a consistent latent vector automatically.

---

## 8. The embedding fit

1. Materialize the post-overlay matrix `A` (N×N dense, row = source, col = target).
2. Randomized truncated SVD at rank `R` (default **32**). Standard recipe, no
   external deps (a ~120-line implementation is in the validation harness,
   Section 11):
   - `Ω` = N×(R+p) deterministic pseudo-Gaussian (p ≈ 12 oversampling; **seed it —
     do not use `Math.random`**).
   - `Y = AΩ`; orthonormalize `Y → Q` (modified Gram–Schmidt).
   - `B = QᵀA`; symmetric `S = BBᵀ` (small); Jacobi eigendecomposition of `S`.
   - Left singular vectors `u_i = Q w_i`; `B^T w_i = σ_i v_i`.
   - Split σ evenly into the stored vectors: `U[:,i] = u_i·√σ_i`,
     `V[:,i] = (B^T w_i)/√σ_i`.
3. Write `data/affinity_embedding.json` (Section 6.1). Reconstruction clamps
   negatives to 0 at load.

Determinism: seed the SVD's random projection from a fixed constant so re-bakes are
reproducible. `rank` is tunable; **16–32 is the validated band, 32 is the default**
(the safest fidelity in that band — see Section 4).

---

## 9. Implementation plan (file-by-file)

### Phase 1 — the committed embedding, baked and loaded (the core)

1. **New `scripts/bake-affinity-corpus.mjs`** + `npm` script
   `bake-affinity-corpus`. Loads the same inputs as the metric's `loadContext`;
   builds the base corpus via `buildPoolData` + `buildPickfitCorpus`; applies the
   overlay (Section 7); fits the embedding (Section 8); writes
   **`data/affinity_embedding.json`**. This command is run **on demand** (when
   records or the overlay change) and its output is **committed** — it is not run
   by `setup-assets`, so the committed embedding stays authoritative (like a
   lockfile).
2. **New `src/draft/pool/affinity-corpus-io.ts`**: `serializeEmbedding(...)` and
   `deserializeCorpus(json): AffinityCorpus` (densifies vectors → `Map<Map>`).
   Pure, unit-tested.
3. **Thread a prebuilt corpus through `PoolData`.** Add optional
   `affinityCorpus?: AffinityCorpus` to `PoolData` (`types.ts:84`). In
   `buildPickfitCorpus` (`variant-pickfit.ts:77`), return `poolData.affinityCorpus`
   when present, else build from `draftRecords` (preserves every test/experiment
   that passes raw records). The `WeakMap` cache still applies.
4. **Runtime loader.** Add `loadAffinityCorpus()` to `cards-v2-database.ts` (fetch
   `/affinity-corpus-data.json`, `deserializeCorpus`). In `quest-content.ts`
   (~line 421), when the active variant is corpus-driven, load the embedding and
   set `poolData.affinityCorpus`; the pool path then no longer calls
   `loadDraftRecords` (records are loaded only for record-replay mode / the
   fit-model). Extend the `poolVariantNeedsRecords` gate accordingly.
5. **Wire `setup-assets.mjs`** to copy `data/affinity_embedding.json` →
   `public/affinity-corpus-data.json` (do **not** regenerate it there). Add the
   served path to `.gitignore`.

### Phase 2 — the editable overlay (the core value)

6. **New committed `data/affinity_overlay.jsonc`** (Section 6.2), initially
   `{add:[],edit:[]}`.
7. **Apply it in the bake** (Section 7), after the base corpus, before the
   embedding fit. Unit-test the blend math on a tiny synthetic corpus. Document the
   author workflow: edit the overlay (and `buildaround_support.json` for metric
   credit) → `npm run bake-affinity-corpus` → commit the updated embedding.

### Phase 3 — authoring index (quality-of-life)

8. A small tool that, given a card's vectors, returns nearest neighbors (cosine
   over `U`/`V`) to **suggest** `resembles` targets when authoring a new card.

---

## 10. Validation & acceptance criteria

The metric is `scripts/buildaround-support-experiment.mjs`
(`npm run buildaround-metric`). Add a committed acceptance script
(`scripts/affinity-corpus-parity.mjs`, adapted from Section 11) asserting:

1. **Bake-pipeline fidelity (the matrix step must be exact).** Build the matrix
   in-memory from records (no embedding) and confirm pools generated from it are
   **byte-identical** to `generatePoolFromData(..., "sigseed", ..., signature)` on
   the live records path, for ≥10 `(Dreamcaller, seed)` pairs (harness achieved
   5/5; require 100 %). This isolates the SVD as the only approximation.
2. **Embedding metric parity (the shipping bar).** Run adequacy + traps + diversity
   for the committed embedding and for the live corpus over ≥25 seeds × 32
   Dreamcallers. Acceptance for rank ≥ 16: **adequacy ≥ 97.5, traps ≤ 1.0,
   themeEvenness ≥ 95.0, #cards ≥ 460** (Section 4 rank-16/32 rows).
3. **Negative controls retained.** Keep the `shuffled` and `prior-only` controls as
   guards that the metric still discriminates (adequacy must drop to ~85 / ~93). If
   a change lets a control score as well as the real embedding, the metric or
   harness has broken.

Run the standard checks from `AGENTS.md` after code changes:
`npm run lint && npm run typecheck && npm test`.

---

## 11. Reference: the validation harness used to produce Section 4

This throwaway harness produced the evidence; commit a cleaned version as the
Section-10 acceptance script. It (a) cross-checks a from-scratch `sigseed` replica
against the official path, (b) builds the rounded matrix, low-rank embeddings, and
controls, and (c) scores each with the metric's **exported** pure functions
(`scorePool`, `trapCards`, `buildableThemes`, `dominantSignatureTheme`,
`STANDALONE_THEMES`, `TIER_TARGET`, `normalizedEntropy`). Notes:

- Run with `node` (Node 24 strips TypeScript, so `.mjs` imports `.ts` directly).
  Place the script at repo root or in `scripts/` so relative `./src/...` imports
  resolve.
- Reproduce `sigseed` from an arbitrary corpus: `makeRng(seed)` →
  `resolveSignatureToCorpus` → (empty ⇒ `growPoolFromCorpus(..., PICKCOHERE)`
  fallback) → `drawSignatureSubset` → `growAffinityPoolFromSeeds(corpus, seeds,
  SIGSEED.targetSize, SIGSEED)` → map keys to names via `poolData.cardNameById`.
  This matched the official generator 5/5, proving the replica is faithful.
- Build the dense matrix in `corpus.cards` index order; keep that order for every
  derived corpus so determinism holds.
- Randomized SVD + Jacobi eigensolver are ~120 lines, no dependencies; seed the
  Gaussian projection deterministically.
- Controls: **shuffled** = permute each row's target keys (preserves the value
  distribution, destroys which-partners-which); **prior-only** = empty affinity map.
- Avoid `Math.random`, `Date.now`, `new Date()` anywhere in the bake/validation —
  seed all randomness from constants so artifacts are reproducible.

---

## 12. Risks, edge cases, open questions

- **The embedding is the live generator.** Because it ships, pool *contents* differ
  from a hypothetical exact-matrix generator; the *quality distribution* is what is
  preserved, and Section 10.2 is the bar that holds it. Section 10.1 keeps the
  matrix step exact so the embedding is the *only* approximation in the chain.
- **Committed-artifact diffs.** `data/affinity_embedding.json` is a generated file;
  a re-bake rewrites all vectors wholesale (SVD basis rotation), so review it for
  size/sanity and metric parity, not line-by-line. The human-meaningful diffs live
  in `data/affinity_overlay.jsonc` and the records.
- **Re-bake stability.** Recipes (not vectors) are the stored edit form so they
  survive re-fits; new overlay cards become part of the matrix and get consistent
  vectors automatically.
- **Two metadata systems.** Adding/altering a card touches both the affinity overlay
  (how it drafts) and `data/buildaround_support.json` (themes it pays off/supports,
  for the metric). Document this for card authors.
- **Other record consumers (Section 5.3).** Do not break record-replay mode or the
  `replay` fit-model; only the *pool* path stops fetching records.
- **Universe order.** Emit `cards` in the corpus's natural `[...taken.keys()]` order
  and read adapted records in sorted filename order, so the embedding is
  reproducible and the matrix fidelity test stays exact.
- **`targetSize` quirk to preserve.** `sigseed` ignores the `targetSize` passed by
  callers and uses `SIGSEED.targetSize` (150). The metric labels pools "200" but
  they are ~150 copies; the baked path reproduces this (same grower, same tuning).
- **Rank as a tuning knob.** Default 32; 16 is validated and smaller. If a future
  card set needs higher fidelity, raise `rank` and re-run Section 10.

---

## Appendix A. Key references

**Committed artifacts (new):** `data/affinity_embedding.json` (the embedding),
`data/affinity_overlay.jsonc` (recipes). **Served (gitignored):**
`public/affinity-corpus-data.json` (copy of the embedding).

| Symbol | Location | Role |
|---|---|---|
| `AffinityCorpus` | `affinity-grower.ts:34` | what the loader reconstructs |
| `growAffinityPoolFromSeeds` | `affinity-grower.ts:86` | growth engine (untouched) |
| `growPoolFromCorpus` | `affinity-grower.ts:317` | best-of-K wrapper (pickcohere fallback) |
| `buildExcessLiftCorpus` / `accumulatePickStats` | `pick-stats.ts:127` / `:59` | records → matrix (bake step) |
| `buildPickfitCorpus` (+ `WeakMap`) | `variant-pickfit.ts:77` / `:71` | corpus provider to patch (prefer `poolData.affinityCorpus`) |
| `generateSigSeed` / `drawSignatureSubset` / `SIGSEED` | `variant-sigseed.ts:97` / `:72` / `:47` | the variant |
| `resolveSignatureToCorpus` | `variant-picksig.ts:90` | signature → corpus keys |
| `generatePickCohere` / `PICKCOHERE` | `variant-pickcohere.ts:56` / `:36` | no-signature fallback |
| `buildPoolData` / `PoolData` | `pool-data.ts:46` / `types.ts:84` | add `affinityCorpus` here |
| `generatePoolFromData` / `makeRng` | `generate.ts:60` / `rng.ts:4` | entry point + RNG |
| runtime fetch / build | `cards-v2-database.ts:~66` / `quest-content.ts:~421` | where the 19 MB loads today |
| variant gate | `quest-content.ts:84` (`POOL_VARIANTS_NEEDING_RECORDS`) | extend to fetch the embedding |
| asset bake | `setup-assets.mjs:228`, `:599` | wire the copy-to-public here |
| quality metric | `buildaround-support-experiment.mjs` (`npm run buildaround-metric`) | acceptance oracle |
| metric card metadata | `data/buildaround_support.json` | add entries for new cards |

## Appendix B. Glossary

- **Dreamcaller** — the run's hero; 32 exist; each may have a signature.
- **Signature** — a Dreamcaller's defining card UUIDs; steers the pool.
- **Pool** — the drafted-from multiset (~150–200 copies, ≤2 each).
- **Affinity corpus** — `{cards, affinity, prior}`; the in-memory object the grower
  reads.
- **Embedding** — the committed per-card vectors `(U, V, prior)`; the runtime
  artifact, from which affinity is reconstructed as `max(0, U[d]·V[c])`.
- **Prior** — availability-corrected pick rate (card desirability).
- **Affinity / excess lift** — synergy: extra pick rate of `c` once `d` is held.
- **Grower** — the greedy blended-affinity pool expander; reads only the corpus.
- **Recipe / overlay** — a declarative "card X resembles A, B, C" edit, applied at
  bake time before the embedding is fit.
- **Build-around / adequacy / trap** — quality-metric concepts (Section 4).
