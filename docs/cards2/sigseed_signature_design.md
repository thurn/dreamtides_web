# sigseed: Signature-Anchored Pool Construction

## 1. Purpose and summary

In the draft test mode a player chooses a **Dream Avatar** and is handed a **card
pool** to draft from. The pool must *match* the Dream Avatar: a disruption/tempo
Dream Avatar should be handed a disruption/tempo pool, every run.

`sigseed` is a pool-construction algorithm that guarantees that match by making a
Dream Avatar's **signature cards the only possible starting points** for the pool.
Each run seeds the pool with a random *subset* of the signature and grows outward
from there with the shared pick-affinity grower. Because the pool always starts on
actual signature cards, it can never drift onto an unrelated identity — the
failure mode `picksig` is prone to (Section 3). Run-to-run variety comes from the
subset draw: different combinations of signature anchors lean the same identity in
different directions.

The signature is the only new input the algorithm reads; it consults no colors,
mechanic tags, or archetype labels. With no signature it reduces, with no separate
code path, to plain `pickcohere`.

This document is self-contained for the parts unique to `sigseed`; it shares the
pick-record corpus and the affinity grower with `pickcohere`/`picksig`, documented
in `picksig_signature_design.md` §2, and refers there rather than repeating them.

---

## 2. Background

`sigseed` reuses, verbatim, two pieces described in `picksig_signature_design.md`:

- **The pick-record corpus** (`buildPickfitCorpus`): an availability-corrected
  play-rate prior `pickRate(c)` and a behavioural synergy affinity `affinity[a][b]`
  ("how strongly `b` partners `a`"), both computed from the real draft pick records
  in `docs/draft_records_adapted/` and keyed by stable cards_v2 UUID.
- **The affinity grower** (`growAffinityPoolFromSeeds`): grows a pool from one or
  more seed cards by greedy blended affinity,
  `score(c) = w · affinityToSeed(c) + (1 − w) · affinityToPool(c) + p · prior(c)`,
  recomputing `affinityToPool` against the cards already chosen so the pool stays
  internally coherent, copies capped at two.

It also reuses `picksig`'s **signature resolution**: a Dream Avatar's signature,
stored as rename-proof UUIDs and surfaced at load time as current card names, is
matched back onto the UUID-keyed corpus via the pool's name→UUID map
(`resolveSignatureToCorpus`). The result is a set `S` of corpus UUIDs — the
**anchors**.

---

## 3. The idea: seed exclusively from the signature

`picksig` lets the signature merely **bias** a seed draw that still ranges over the
whole corpus, then runs `pickcohere`'s best-of-K step, which keeps the candidate
pool with the highest *internal coherence* — a criterion that reads no signature at
all. For a Dream Avatar whose identity is internally **clumpy** in pick-space (ramp,
lands, aristocrats — cards reliably drafted together) this works well. For a
Dream Avatar whose identity is **spread** (tempo, disruption, control — cards that
interact with the opponent and with diverse pieces, not tightly with each other),
the coherence step systematically discards the on-theme candidate for a tighter
*off-theme* cluster, and the pool drifts onto an unrelated synergy. The drift is
worst for exactly the spread archetypes (measured: `picksig` lands a 0.57 mean
signature affinity for the clumpy ramp callers but only ~0.15–0.20 for the spread
disruption/tempo callers).

`sigseed` removes the lever that causes the drift. The starting point is **always**
a signature card (or a few), so the pool is anchored on the identity by
construction; the grower's coherence still shapes *which* partners come in, but it
can no longer relocate the pool to a different cluster.

The two design pressures are the same as `picksig`'s, resolved differently:

- **On-theme.** Guaranteed: the seeds are signature cards, and the grower's
  seed-affinity term `affinityToSeed(c)` reads `c`'s strongest tie to *any* of the
  chosen anchors, so growth stays in the signature's region.
- **Variety.** Supplied by the **random subset draw**: a single signature card
  gives a pure lean; a pair or triple blends them. Different subsets grow
  measurably different pools.

This is the deliberate counterpart to a trade-off `picksig` declined. `picksig`'s
design rejected "pre-seed the pool with the signature cards directly" because
seeding with the *whole* signature every run flattens variety. `sigseed` takes the
seed-from-the-signature idea but seeds with a *random subset*, recovering variety
at a lower ceiling than `picksig`'s in exchange for a guaranteed on-theme pool.

---

## 4. The algorithm

Let the signature resolve to the anchor set `S` (Section 2).

**Step 1 — draw the seed subset.** Draw a size `k` uniformly in
`1 … min(maxSeedCards, |S|)` with `maxSeedCards = 4`, then draw `k` distinct
anchors uniformly from `S` (a partial Fisher–Yates over the sorted anchor list).
The anchors are sorted first, so the draw is reproducible from the run seed; the
draw consumes one `rng()` for the size and one per chosen card.

**Step 2 — grow.** Seed the pool with copy 1 of every chosen anchor and grow to the
target size with `growAffinityPoolFromSeeds`. The seed-affinity term of a candidate
`c` is its strongest normalised affinity to any single chosen anchor, so multiple
anchors describe a *region* rather than a point. Growth is deterministic given the
subset, so the whole pool is a pure function of the subset draw — which is what
makes the subset the variety source.

`maxSeedCards = 4` maximises the count of distinct pools: with the ~6 signature
cards a Dream Avatar has and deterministic growth, the number of distinct
subset-seeded pools saturates there; raising it only converges pools toward the
all-anchors start without adding on-theme strength.

**Fallback.** With an empty signature, or one whose cards are all absent from the
corpus, `S` is empty — there is nothing to anchor on — so `sigseed` delegates to
`pickcohere` (the unsteered best-of-K base), exactly as `picksig` reduces to
`pickcohere` in the same case.

`sigseed` shares every grower field with `PICKFIT`/`PICKCOHERE`; `maxSeedCards` is
the only new dial, and the seed-from-a-signature-subset start is the single
deliberate difference from the other pick-corpus variants.

---

## 5. Validation

`scripts/sigseed-experiment.mjs` runs the real `generatePoolFromData` against the
bundled pick corpus and the real Dream Avatar signatures — no re-implementation —
and measures, per Dream Avatar over many seeds, the same metrics as the `picksig`
experiment (distinct-pool **variety**, mean-signature-affinity **on-theme**, and
**lean spread**), reporting `sigseed`, `picksig`, and the `pickcohere` baseline on
the same seeds.

Over the 20 Dream Avatars with an in-corpus signature, 120 seeds each:

- **On-theme**: mean signature affinity **0.52 for `sigseed`** vs 0.33 for
  `picksig` vs 0.21 for `pickcohere`. The lift is largest for exactly the spread
  archetypes `picksig` drifts on — e.g. Edran 0.39 vs 0.16, Kasane 0.45 vs 0.15,
  Rael 0.56 vs 0.19 — while the clumpy ramp callers (Grath, Radulf, Demetrios)
  hold at ~0.57 with no regression. Every Dream Avatar lands at 0.42–0.60.
- **Variety**: 13–48 distinct pools per Dream Avatar across 120 seeds. This is
  below `picksig`'s 50+, the deliberate cost of deterministic signature-only
  seeding: with ~6 anchors and deterministic growth the distinct-pool count
  saturates in the tens. Pools still differ substantially (lean spread up to ~0.44).
- **Fallback**: with an empty signature, `sigseed` reproduces `pickcohere`
  bit-for-bit on every checked seed.

Run it with `node scripts/sigseed-experiment.mjs`; `--dream-avatar "<name>"` narrows
to one, `--seeds N` sets the sample, `--json` emits raw rows. Select the algorithm
in the app with `?algo=sigseed`.

---

## Appendix A. Alternatives weighed

- **Bias the seed but keep it corpus-wide (`picksig`).** This is the existing
  variant. It maximises variety but drifts off-theme for spread archetypes, because
  its signature-blind best-of-K coherence step can discard the on-theme seed.
  `sigseed` trades some variety for a guaranteed on-theme anchor.
- **Seed with the whole signature every run.** Rejected: deterministic growth from
  a fixed seed set yields one pool per Dream Avatar — no variety. The random subset
  is what restores it.
- **Single signature card as the seed (no subsets).** Rejected: it caps variety at
  the number of signature cards (~6 pools) and offers only pure leans, no blends.
- **Stochastic growth instead of a subset draw.** A larger change to the shared
  grower that would push variety past the deterministic ceiling, at the cost of the
  grower's current determinism-given-seed guarantee. Held in reserve; the subset
  draw meets the "tens of distinct pools" bar without it.
