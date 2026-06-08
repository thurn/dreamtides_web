# Affinity-Corpus Distillation: decoupling `sigseed` from the raw draft records

Status: design / handoff. Author: design exploration, 2026-06-08.

> This document is a self-contained handoff for an implementing agent with **no
> prior context** on Dreamtides draft-pool construction. Sections 1–4 are
> orientation and evidence; Sections 5–9 are the design and the work to do;
> Sections 10+ are reference. Read it top to bottom.

---

## 0. One-paragraph summary

The `sigseed` draft-pool generator (the shipping default) reads a 19 MB bundle of
historical draft records at runtime and rebuilds, in the browser, a card×card
"affinity corpus" every time. That corpus — a synergy matrix plus a play-rate
prior — is the **only** thing the generator derives from those records; pool
generation is otherwise a deterministic function of `(corpus, signature, seed)`.
This migration **bakes the corpus once at build time** into a small JSON artifact
(~385 KB gzip, exact) and loads that instead of the 19 MB records, and adds a
small **declarative overlay** so new or changed cards can be authored as "this
card plays like cards A, B, C" without touching the historical data. An optional
**embedding** form compresses the artifact further (~50–90 KB gzip) and turns it
into a true per-card vector database, at the cost of being an approximation
(validated as metric-equivalent). All of this is validated against the existing
`buildaround-support-experiment.mjs` quality metric.

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
assets in `public/`:

| Source (checked in) | Built asset (`public/`) | Role |
|---|---|---|
| `data/tabula/cards_v2.toml` | `cards_v2-data.json` (516 KB) | card catalog (519 cards: id, name, …) |
| `docs/draft_records_adapted/*.jsonc` (1061 files) | `draft-records-data.json` (**19 MB**) | 993 real draft "seats", each 30 picks with the full pack offered at each pick |
| `docs/draft_records_adapted/*` (mainboards) | `decklists-data.json` (709 KB) | finished decklists (used by other variants) |
| `data/tabula/dreamcallers_v2.toml` | `dreamcallers-v2-data.json` (23 KB) | the 32 Dreamcallers + their signatures |
| (first-principles card read) | `data/buildaround_support.json` (99 KB) | per-card theme metadata for the **quality metric** (Section 4) |

`buildDraftRecords` (`scripts/setup-assets.mjs:228`) is what bundles the adapted
records into `draft-records-data.json`. Each seat record carries `packIds[i]`
(the UUIDs offered at pick `i`) and `pickIds[i]` (the UUIDs the human took),
aligned index-for-index — the "taken-over-passed" signal.

### 2.2 Runtime path (browser)

1. `loadDraftRecords()` (`src/data/cards-v2-database.ts:~66`) `fetch`es
   `/draft-records-data.json` — **the 19 MB download**.
2. `quest-content.ts:~421` calls
   `buildPoolData(cards, decklists, draftRecords.map(r => ({packs: r.packIds, picks: r.pickIds})))`
   (`src/draft/pool/pool-data.ts:46`) → a `PoolData` object carrying
   `draftRecords` (UUID-keyed `PickRecord[]`).
3. Per Dreamcaller, `generateDreamcallerPool` (`quest-content.ts:136`) calls
   `generatePoolFromData(poolData, seed, …, "sigseed", …, signatureCards)`
   (`src/draft/pool/generate.ts:60`), which builds a seeded RNG
   (`makeRng`, mulberry32, `rng.ts:4`) and dispatches to the `sigseed` strategy.
4. `generateSigSeed` (`src/draft/pool/variant-sigseed.ts:97`):
   - `buildSigSeedCorpus` → `buildPickfitCorpus` (`variant-pickfit.ts:77`) →
     `buildExcessLiftCorpus(accumulatePickStats(records))`
     (`src/draft/pool/pick-stats.ts:59` and `:127`). **This is the only place the
     records are consumed.** The result is memoized in a `WeakMap` keyed by
     `poolData` (`variant-pickfit.ts:71`), so it is rebuilt once per page load.
   - `resolveSignatureToCorpus` (`variant-picksig.ts:90`) maps the signature
     names→UUIDs and intersects with the corpus.
   - `drawSignatureSubset` (`variant-sigseed.ts:72`) draws a random 1–4 of the
     signature cards.
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
  it was even offered.
- `affinity[d][c]` = shrunk **excess** conditional pick rate: how much more likely
  drafters were to take `c` once `d` was already in their pool, above `c`'s
  baseline rate, floored at 0. This isolates *synergy* from raw card power (power
  lives in the prior). Asymmetric; each row normalized by its own source card.

The grower (`affinity-grower.ts:86`) scores each candidate card as
`score(c) = w·seedAffinity(c) + (1−w)·poolAffinity(c) + p·prior(c)` and adds the
argmax each step, capping copies at 2. **It reads nothing but the corpus, the seed
set, and the tuning constants.** Tie-breaks are by `(fewer copies, then lower
card-key)` — i.e. independent of the order of `corpus.cards`.

### 2.4 The load-bearing fact

> Everything `sigseed` derives from the 19 MB of records is captured in the
> `AffinityCorpus`. Given that corpus, a Dreamcaller's signature, and a seed, pool
> generation is fully deterministic. The records themselves are never read again.

This is what makes the migration possible and safe.

### 2.5 Measured shape of the corpus

- Universe: **501 cards** (cards ever taken), out of 519 in the catalog.
- Affinity matrix: **103,211 nonzero entries**, 41.1 % dense (avg 206 partners/row).
- Prior: 501 floats.

---

## 3. The problem this migration solves

1. **Data volume.** The 19 MB records are downloaded by the client and the corpus
   is recomputed in-browser on every load. This is the dominant payload of the
   pool feature.
2. **Extensibility coupling.** The corpus is keyed entirely by historical card
   UUIDs. A **new** card has no row/column and cannot enter a pool. A **changed**
   card keeps its stale historical synergies. There is no first-class way to say
   "this new card plays like A, B, C, so place it near them" — the only lever is
   to collect more real drafts and re-bundle.

---

## 4. Validated findings (evidence base — do not re-derive, but do reproduce)

A throwaway harness rebuilt `sigseed` against swappable corpora and scored each
with the **existing** quality metric (`scripts/buildaround-support-experiment.mjs`,
see Section 11). The metric simulates every Dreamcaller × N seeds and reports, per
pool generator:

- **adequacy** (0–100): when a build-around payoff is in a pool, is its supporting
  theme present densely enough? Higher is better.
- **adequacy (steered)**: same, restricted to Dreamcallers with a real signature
  identity.
- **traps/pool**: expected count of payoff cards the pool *cannot* support (lower
  better).
- **themeEvenness** (0–100): are the standalone archetypes draftable at even rates,
  or does the generator collapse onto one (higher = more even)?
- **#cards**: distinct cards appearing across all pools (coverage proxy).

Result (25 seeds × 32 Dreamcallers = 800 pools per corpus):

| corpus | adeq | adeq(steer) | traps | themeEven | #cards | size (gz) |
|---|---|---|---|---|---|---|
| **exact (live, 19 MB records)** | 98.2 | 97.2 | 0.74 | 96.0 | 491 | 4.5 MB (records) |
| frozen corpus, rounded 5-digit | 98.2 | 97.2 | 0.74 | 96.0 | 491 | **385 KB** |
| embedding, rank 8 | 97.7 | 97.2 | 0.91 | 93.8 | 465 | **34 KB** |
| embedding, rank 16 | 98.1 | 97.2 | 0.80 | 95.6 | 466 | **52 KB** |
| embedding, rank 32 | 97.9 | 96.9 | 0.69 | 95.7 | 472 | **88 KB** |
| embedding, rank 64 | 97.6 | 96.3 | 0.94 | 96.4 | 485 | 160 KB |
| _CTRL: synergy shuffled_ | 84.7 | 84.4 | 4.57 | 43.0 | 481 | — |
| _CTRL: prior-only (no synergy)_ | 93.2 | 93.3 | 3.70 | 43.1 | 236 | — |

**Conclusions:**

1. **Freezing the corpus is exactly lossless.** The rounded-corpus row equals the
   live row on every metric, and a per-pool byte-identity check matched the
   official `generatePoolFromData(..., "sigseed", ...)` output **5/5** for a
   sample of `(Dreamcaller, seed)`. Freezing is a pure caching refactor.
2. **The metric genuinely discriminates** (so ~97 is preserved signal, not a
   saturated ceiling): shuffling the synergy entries tanks adequacy to 84.7 and
   traps to 4.57; dropping synergy entirely (prior-only) collapses theme-evenness
   to 43 and distinct cards to 236 (near-identical pools every time).
3. **Low-rank embeddings preserve the metric down to rank ~16** (52 KB gz), and
   rank 32 (88 KB gz) is indistinguishable from exact. The synergy matrix is
   effectively low-rank with respect to pool quality.

Sizes for reference: raw records 19 MB / 4.5 MB gz; explicit corpus (index-keyed,
5-digit floats) 1.4 MB / 385 KB gz; naive UUID-keyed object form 6 MB / 1.5 MB gz
(avoid — use the index-keyed form).

---

## 5. Target architecture

Separate three concerns that the current system fuses:

| Concern | Current | Target |
|---|---|---|
| **Source of truth** | 19 MB records, re-read at runtime | records, read **only at build time** to bake the corpus |
| **Runtime artifact** | rebuilt in-browser from records | a small baked JSON corpus, fetched directly |
| **How card edits are stored** | (impossible without new records) | a checked-in **declarative overlay** of "resembles" recipes |

### 5.1 Substrate choice (a documented decision, both validated)

The runtime artifact can be either:

- **Explicit matrix** (recommended default): the corpus verbatim, 385 KB gz.
  **Exact** — byte-identical pools to today. Zero behavioral risk.
- **Embedding** (optional): per-card vectors `U`, `V` (rank ~16–32) with
  `affinity(d,c) = max(0, U[d]·V[c])`, 52–88 KB gz. **Approximate** but
  metric-equivalent (Section 4). Also usable as a similarity index for authoring
  (Section 5.3).

These are interchangeable because the **loader produces an `AffinityCorpus` either
way, and the grower is untouched.** Implement the explicit path first; add the
embedding path behind the same loader interface. Choose per build via a flag.

> The embedding is *derived from* the explicit matrix and *validated against* it.
> Keep the explicit matrix as the bake target and reference even if you ship the
> embedding. "Replace the shipped artifact" — yes. "Delete the matrix from the
> pipeline" — no.

### 5.2 Edits as recipes, not baked vectors

A card addition/edit is stored as a **recipe** ("X resembles A, B, C"), applied to
the explicit matrix **at bake time**, before any embedding fit. This is essential:
SVD axes are arbitrary up to rotation, so hand-tuned latent vectors would not
survive a re-bake from updated records, whereas a recipe re-applies in any basis.
Recipes also work identically on both substrates.

### 5.3 Scope — what this covers and what it does not

**Covers** the affinity-corpus consumers: `sigseed` (default) and the rest of the
affinity-grown family (`pickfit`, `pickcohere`, `picksig`, `pickearly`,
`pickpos`, `pickchoice`) — see `POOL_VARIANTS_NEEDING_RECORDS`
(`quest-content.ts:84`).

**Does not cover** two other runtime consumers of `draft-records-data.json`, which
are out of scope and keep working as-is:

- **Record-replay draft mode** replays actual recorded drafts and fundamentally
  needs the raw seats (`loadDraftRecords` → `quest-state-actions.ts:~414`,
  `App.tsx:~96`).
- **The `replay` fit-model** is built from record *mainboards*
  (`buildFitModel(draftRecords.map(r => r.mainboard))`, `quest-content.ts:~440`) —
  a different corpus (decklists), separately distillable later.

**Implication for the payload win:** the client can skip the 19 MB fetch whenever
the active pool variant is corpus-driven **and** neither record-replay mode nor the
`replay` fit-model is in use. Gate the fetch on actual need (it is already gated by
`poolVariantNeedsRecords`; extend that gate so a corpus-driven variant fetches the
**baked corpus** instead of the records). When a run does use record-replay, it
still fetches the records — that is expected and unrelated to pool quality.

---

## 6. Data formats (precise schemas)

All three files key cards by lowercase UUID. Floats rounded to 5 decimals.

### 6.1 Explicit corpus — `public/affinity-corpus-data.json`

Index-keyed to avoid repeating 36-char UUIDs in every matrix entry:

```jsonc
{
  "version": 1,
  "kind": "explicit",
  "cards": ["<uuid0>", "<uuid1>", ...],   // length N; the card-key universe
  "prior": [0.42, 0.0, ...],              // length N, aligned to `cards`
  "affinity": [                            // sparse rows
    [d, [[c, v], [c2, v2], ...]],          // d, c, c2 are INDICES into `cards`
    ...                                     // v in (0,1]; omit zeros
  ]
}
```

Deserialize to `AffinityCorpus` by mapping indices back through `cards`.
**Emit `cards` in the corpus's natural `[...taken.keys()]` order** to guarantee
byte-identical output to today (grower tie-breaks are key-based, so order does not
change pool output, but preserving it keeps the parity test trivially green and the
file diff-stable). Ensure the bake reads `docs/draft_records_adapted` in sorted
filename order so the universe order is stable across machines.

### 6.2 Embedding corpus — same filename, `kind: "embedding"`

```jsonc
{
  "version": 1,
  "kind": "embedding",
  "rank": 16,
  "cards": ["<uuid0>", ...],   // length N
  "prior": [0.42, ...],        // length N
  "U": [[...rank floats...], ...],   // N x rank — source ("what this card pulls")
  "V": [[...rank floats...], ...]    // N x rank — target ("what pulls this card")
}
// Reconstruct: affinity(d, c) = max(0, sum_r U[d][r] * V[c][r])
```

Loader densifies into the sparse `Map<Map>` shape the grower expects (keep entries
> 1e-6). N=501, rank≤32 → a few MB of transient memory; acceptable. The grower's
per-step row fold is ~2.4× wider on a densified matrix than on the native sparse
one, which is negligible for 32 pools/run.

### 6.3 Authoring overlay — `data/affinity_overlay.jsonc` (checked in, editable)

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

---

## 7. The blend ("resembles") algorithm

Applied to the explicit matrix at bake time, after building the base corpus from
records and **before** any embedding fit. Process `add` then `edit`, each in array
order. Let `R = resembles`, `s = priorScale ?? 1`, and let `mean_r f(r)` average
over `r ∈ R`.

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
will pull `X`, and `X` will pull their partners.

---

## 8. The embedding fit (if shipping `kind: "embedding"`)

1. Materialize the post-overlay matrix `A` (N×N dense, row=source, col=target).
2. Randomized truncated SVD at rank `k` (k≈16–32). Standard recipe, no external
   deps (a ~120-line implementation exists in the validation harness, Section 11):
   - `Ω` = N×(k+p) deterministic pseudo-Gaussian (p≈12 oversampling; seed it — do
     not use `Math.random`).
   - `Y = AΩ`; orthonormalize `Y → Q` (modified Gram–Schmidt).
   - `B = QᵀA`; symmetric `S = BBᵀ` (small); Jacobi eigendecomposition of `S`.
   - Left singular vectors `u_i = Q w_i`; `B^T w_i = σ_i v_i`.
   - Per-card vectors split σ evenly: `U[:,i] = u_i·√σ_i`, `V[:,i] = (B^T w_i)/√σ_i`.
3. Store `U`, `V`, `prior`, `cards`. Reconstruction clamps negatives to 0 at load.

Determinism: seed the SVD's random projection from a fixed constant so re-bakes
are reproducible.

---

## 9. Implementation plan (file-by-file)

Sequence in three phases; each is independently shippable and independently
validated by Section 10.

### Phase 1 — bake + load the explicit matrix (exact, low risk)

1. **New `scripts/bake-affinity-corpus.mjs`.** Imports `buildPoolData`
   (`src/draft/pool/index.ts`) and `buildPickfitCorpus`
   (`src/draft/pool/variant-pickfit.ts`); loads the same inputs as the metric's
   `loadContext`; builds the base corpus; (Phase 2) applies the overlay; (Phase 3)
   fits the embedding; serializes per Section 6 to `public/affinity-corpus-data.json`.
2. **New serialization module** `src/draft/pool/affinity-corpus-io.ts`:
   `serializeCorpus(corpus): string` and `deserializeCorpus(json): AffinityCorpus`
   (handles both `kind`s). Pure, unit-tested.
3. **Thread a prebuilt corpus through `PoolData`.** Add optional
   `affinityCorpus?: AffinityCorpus` to `PoolData` (`types.ts:84`). In
   `buildPickfitCorpus` (`variant-pickfit.ts:77`), return
   `poolData.affinityCorpus` when present, else fall back to building from
   `draftRecords` (preserves every test/experiment that passes raw records). The
   `WeakMap` cache still applies.
4. **Runtime loader.** Add `loadAffinityCorpus()` to
   `src/data/cards-v2-database.ts` (fetch `/affinity-corpus-data.json`,
   `deserializeCorpus`). In `quest-content.ts` (~line 421), when the active
   variant is corpus-driven, fetch the baked corpus and set
   `poolData.affinityCorpus`, and **skip the 19 MB `loadDraftRecords` fetch** for
   pool purposes (keep it only for record-replay mode / fit-model). Extend the
   existing `poolVariantNeedsRecords` gate accordingly.
5. **Wire into `scripts/setup-assets.mjs`** so `affinity-corpus-data.json` is
   regenerated alongside the other assets (after `draft-records-data.json` is
   built — it reads from the same adapted records). Add an `npm` script
   `bake-affinity-corpus`.

### Phase 2 — declarative overlay (extensibility)

6. **New `data/affinity_overlay.jsonc`** (Section 6.3), initially `{add:[],edit:[]}`.
7. **Apply it in the bake** (Section 7), after the base corpus, before embedding.
   Unit-test the blend math on a tiny synthetic corpus.

### Phase 3 — embedding substrate (optional compression + vector DB)

8. **Embedding fit in the bake** (Section 8), behind a `--kind embedding --rank N`
   flag. Loader already handles `kind: "embedding"` from step 2.
9. **(Optional) authoring index.** A small tool that, given a card's vectors,
   returns its nearest neighbors (cosine over `U`/`V`) to *suggest* `resembles`
   targets for new cards.

---

## 10. Validation & acceptance criteria

The metric is `scripts/buildaround-support-experiment.mjs`
(`npm run buildaround-metric`). Add a committed acceptance script
(`scripts/affinity-corpus-parity.mjs`, adapted from Section 11) that asserts:

1. **Fidelity (explicit substrate must be exact).** For a sample of ≥10
   `(Dreamcaller, seed)` pairs, pools generated from the baked explicit corpus are
   **byte-identical** to `generatePoolFromData(..., "sigseed", ..., signature)` on
   the live records path. (The harness already achieved 5/5; require 100 %.)
2. **Metric parity.** Run adequacy + traps + diversity for the baked corpus and the
   live corpus over ≥25 seeds × 32 Dreamcallers. Acceptance:
   - explicit substrate: **identical** headline numbers (Section 4 row 2).
   - embedding substrate (rank ≥16): within tolerance of exact — adequacy ≥ 97.5,
     traps ≤ 1.0, themeEvenness ≥ 95.0 (Section 4 rows for rank 16/32).
3. **Negative controls present.** Keep the `shuffled` and `prior-only` controls in
   the acceptance script as guards that the metric still discriminates (adequacy
   must drop to ~85 / ~93 respectively); if a code change makes the controls score
   as well as the real corpus, the metric or harness has broken.

Also run the standard checks from `AGENTS.md` after code changes:
`npm run lint && npm run typecheck && npm test`.

---

## 11. Reference: the validation harness used to produce Section 4

This is the throwaway harness that produced the evidence. Commit a cleaned version
as the Section-10 acceptance script. It (a) cross-checks a from-scratch `sigseed`
replica against the official path, (b) builds rounded / low-rank / control
corpora, and (c) scores each with the metric's **exported** pure functions
(`scorePool`, `trapCards`, `buildableThemes`, `dominantSignatureTheme`,
`STANDALONE_THEMES`, `TIER_TARGET`, `normalizedEntropy`). Key implementation notes:

- Run with `node` (Node 24 strips TypeScript, so `.mjs` can import `.ts` directly).
  Place the script at repo root or in `scripts/` so relative `./src/...` imports
  resolve.
- Reproduce `sigseed` from an arbitrary corpus: `makeRng(seed)` →
  `resolveSignatureToCorpus` → (empty ⇒ `growPoolFromCorpus(..., PICKCOHERE)`
  fallback) → `drawSignatureSubset` → `growAffinityPoolFromSeeds(corpus, seeds,
  SIGSEED.targetSize, SIGSEED)` → map keys to names via `poolData.cardNameById`.
  This matched the official generator exactly, proving the replica is faithful.
- Build the dense matrix in `corpus.cards` index order; keep that exact order for
  every derived corpus so determinism holds.
- Randomized SVD + Jacobi eigensolver are ~120 lines, no dependencies; seed the
  Gaussian projection deterministically.
- Negative controls: **shuffled** = permute each row's target keys (preserves value
  distribution, destroys which-partners-which); **prior-only** = empty affinity map
  (pools grow on the prior alone).

> Note: `Math.random`, `Date.now`, and `new Date()` should be avoided in any baked
> pipeline that must be reproducible; seed all randomness from constants.

---

## 12. Risks, edge cases, open questions

- **Other record consumers (Section 5.3).** Do not break record-replay mode or the
  `replay` fit-model. Only the *pool* path stops fetching records; gate carefully.
- **Re-bake stability.** Recipes (not vectors) must be the stored edit form so they
  survive re-fits. New cards added via overlay are part of the matrix, so the SVD
  gives them consistent vectors automatically.
- **Two metadata systems.** Adding/altering a card touches both the affinity overlay
  (how it drafts) and `data/buildaround_support.json` (what themes it pays
  off/supports, for the metric). Document this for card authors.
- **Embedding is approximate.** Shipping it redefines the live generator as
  embedding-`sigseed`; pools differ in contents from today (quality distribution
  preserved). This is a conscious product decision, not a free compression — prefer
  the explicit substrate unless the 88 KB / vector-DB ergonomics are specifically
  wanted.
- **Float precision.** 5 decimals were validated as lossless on the metric. If you
  prune small affinity entries to shrink the explicit file, treat that as a
  separate change and re-run parity — pruning is not the same as low-rank.
- **Universe order.** Emit `cards` in the corpus's natural order and read adapted
  records in sorted filename order, so the baked file is reproducible and the
  fidelity test stays exact.
- **`targetSize` quirk to preserve.** `sigseed` ignores the `targetSize` passed by
  callers and uses `SIGSEED.targetSize` (150). The metric labels pools "200" but
  they are ~150 copies; the baked path must reproduce this (it will, since it runs
  the same grower with the same tuning).

---

## Appendix A. Key code references

| Symbol | Location | Role |
|---|---|---|
| `AffinityCorpus` | `affinity-grower.ts:34` | the object to bake |
| `growAffinityPoolFromSeeds` | `affinity-grower.ts:86` | growth engine (untouched) |
| `growPoolFromCorpus` | `affinity-grower.ts:317` | best-of-K wrapper (pickcohere fallback) |
| `buildExcessLiftCorpus` / `accumulatePickStats` | `pick-stats.ts:127` / `:59` | records → corpus (bake step) |
| `buildPickfitCorpus` (+ `WeakMap` cache) | `variant-pickfit.ts:77` / `:71` | corpus provider to patch |
| `generateSigSeed` / `drawSignatureSubset` / `SIGSEED` | `variant-sigseed.ts:97` / `:72` / `:47` | the variant |
| `resolveSignatureToCorpus` | `variant-picksig.ts:90` | signature → corpus keys |
| `generatePickCohere` / `PICKCOHERE` | `variant-pickcohere.ts:56` / `:36` | no-signature fallback |
| `buildPoolData` / `PoolData` | `pool-data.ts:46` / `types.ts:84` | add `affinityCorpus` here |
| `generatePoolFromData` / `makeRng` | `generate.ts:60` / `rng.ts:4` | entry point + RNG |
| runtime fetch / build | `cards-v2-database.ts:~66` / `quest-content.ts:~421` | where the 19 MB loads today |
| variant gate | `quest-content.ts:84` (`POOL_VARIANTS_NEEDING_RECORDS`) | extend to fetch baked corpus |
| asset bake | `setup-assets.mjs:228` (`buildDraftRecords`), `:599` | wire the new bake in here |
| quality metric | `buildaround-support-experiment.mjs` (`npm run buildaround-metric`) | acceptance oracle |
| metric card metadata | `data/buildaround_support.json` | add entries for new cards |

## Appendix B. Glossary

- **Dreamcaller** — the run's hero; 32 exist; each may have a signature.
- **Signature** — a Dreamcaller's defining card UUIDs; steers the pool.
- **Pool** — the drafted-from multiset (~150–200 copies, ≤2 each).
- **Affinity corpus** — `{cards, affinity, prior}`; the baked artifact.
- **Prior** — availability-corrected pick rate (card desirability).
- **Affinity / excess lift** — synergy: extra pick rate of `c` once `d` is held.
- **Grower** — the greedy blended-affinity pool expander; reads only the corpus.
- **Substrate** — the runtime form of the corpus: explicit matrix or embedding.
- **Recipe / overlay** — a declarative "card X resembles A, B, C" edit, applied at
  bake time.
- **Build-around / adequacy / trap** — quality-metric concepts (Section 4).
