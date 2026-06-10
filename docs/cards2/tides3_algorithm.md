# The `tides3` draft-pool algorithm

`tides3` is the human-legible counterpart of `sigseed`. Where `sigseed`
(`src/draft/pool/variant-sigseed.ts`) grows each Dreamcaller's 150-card draft
pool live — from a random subset of the Dreamcaller's signature cards, expanded
through the pick-affinity corpus — `tides3` bakes that growth offline into **32
preconstructed decks called tides** a player can go read, and a quest combines a
few of them into the pool. It is selectable with `?algo=tides3`.

Player story:

> "There are 32 preconstructed decks called tides — each has a known decklist
> you can go read. We combine a few of them at the start of a quest: your
> Dreamcaller's own signature tide leads, shuffled together with broad tides
> until there are enough cards, and we deal the first 150 — never more than 2
> copies of a card."

Like the other tide algorithms it has two halves: an **offline bake** that writes
the committed tide lists, and a **runtime** that combines them into one pool.

## 1. The bake (`scripts/bake-tides3.mjs`, `npm run bake-tides3`)

The bake is a pure function of the bundled cards, draft records, and Dreamcaller
signatures (no randomness; sorted tie-breaks throughout), so re-running it on the
same inputs writes a byte-identical body. It writes `data/tides3.jsonc` (the
machine-readable artifact, keyed by cards_v2 UUID) and the rendered
`docs/cards2/tides3_decklists.md`.

1. **The corpus.** Build the exact pick-affinity corpus `sigseed` grows from
   (`buildSigSeedCorpus` — the availability-corrected pick-rate prior and shrunk
   excess-lift synergy of `pickfit`). Every tide is grown with the shared
   affinity grower (`growAffinityPoolFromSeeds`) under the `SIGSEED` tuning, so a
   tide is grown exactly the way `sigseed` grows a pool.

2. **20 signature tides — one per signatured Dreamcaller.** Resolve the
   Dreamcaller's full signature onto the corpus and grow a 150-copy pool from all
   of those signature cards as the seed set. This is the deterministic centre of
   the pools `sigseed` grows for that Dreamcaller (whose per-run variety is a
   random signature *subset* of the same set). 150 copies matches `sigseed`'s own
   pool size: it is the purity sweet spot, since growing a tide larger pulls in a
   less-on-theme affinity tail that reads as off-theme traps.

3. **12 neutral tides — broad, format-spanning decks.** Choose 12 seed cards by
   farthest-point sampling over the corpus affinity (each new seed is the played
   card most distant from those already chosen), then grow a small 30-copy pool
   from each. They are the generic tail every signatured pool mixes in, and they
   keep the format's less-signatured cards covered.

4. **`tidePoolByDreamcaller`.** Per Dreamcaller, two lists — **leads** (one drawn
   at random per run, always joined) and **fill** (the broad tail):
   - A **signatured** Dreamcaller has one lead candidate — its own signature tide
     — and fills from the nearest broad tides (by tide-cosine). Broad fill carries
     the generic tail without adding a second theme; an allied *signature* tide
     would pull the pool toward another Dreamcaller's identity and is not used.
   - A **neutral** Dreamcaller has *every signature tide* as a lead candidate, so
     each run draws a different coherent archetype to lean on — the way `sigseed`
     reduces to a coherent, randomly-themed `pickcohere` pool for a signatureless
     Dreamcaller. Leading with a whole coherent archetype (rather than a broad,
     themeless deck combined with unrelated tides) is what keeps a neutral pool
     from playing as a disjointed grab-bag; measured pool coherence confirms a
     neutral pool is as internally coherent as a signatured one.

`data/tides3.jsonc` carries both the decklists and the per-Dreamcaller pools in
one file. Because the pools reference tide ids, `validateTides3Decks`
(`src/draft/pool/tides3-io.ts`) throws on any dangling id, so a stale combination
cannot ship silently. The bake's tuning dials (signature/neutral tide size, the
neutral count and seed floor) live in the `TUNING` block at the top of the bake.

## 2. The runtime (`src/draft/pool/variant-tides3.ts`, `generateTides3`)

`tides3` pins its pool size to `sigseed`'s 150 copies (it ignores the quest's
200-copy request, exactly as `sigseed`/`pickfit` ignore it), so it reproduces the
pools `sigseed` actually ships.

1. **Lead.** Draw one lead tide at random and always join it — a fixed choice for
   a signatured Dreamcaller (one candidate), a different coherent archetype each
   run for a neutral one.
2. **Fill.** Shuffle the broad fill tides and join them until the deal size is
   dealable. Whether a tail tide is *forced* depends on where the pool's variety
   comes from. A signatured pool has a fixed lead, so it forces in one broad tide
   even though the 150-copy signature lead could fill the deal alone: the larger
   bag means dealing 150 from it drops a different handful of cards each run. A
   neutral pool already varies through its random archetype lead, so it forces no
   tail and stays a pure, coherent archetype rather than one diluted by an
   off-theme broad deck. (Either still joins more tides if a lead cannot fill the
   pool by itself.)
3. **Deal.** Map each card's UUID to its current display name through
   `poolData.cardNameById` (skipping cards no longer in the catalog), shuffle the
   combined bag once, and deal 150 copies with at most 2 of any one card.

`dealable` counts the copies the deal can actually use (`min(2, copies across the
joined tides)`), so overlapping tides keep joining until a full pool is reachable.
The `selected` label records the algorithm and the joined tide ids, logged as
`tideDeckIds` on `draft_pool_constructed`.

## 3. Measured similarity to `sigseed`

Measured on the real-draft simulation (every Dreamcaller, full signature) with
`scripts/pool-metrics.mjs` at 100 seeds, alongside `sigseed`:

| Metric | `tides3` | `sigseed` |
| --- | --- | --- |
| Dreamcaller (signature-theme delivery) | 87.7 | 89.2 |
| Adequacy (build-around support) | 93.2 | 96.7 |
| Expected traps per pool | 1.10 | 1.06 |
| Diversity headline | 96.3 | 96.5 |
| — card-utilization evenness | 0.97 | 0.97 |
| — theme-spread evenness | 0.96 | 0.96 |

```bash
npm run pool-metrics -- --variant tides3 --seeds 200 --metric dreamcaller
npm run pool-metrics -- --variant tides3 --seeds 200            # adequacy
npm run pool-metrics -- --variant tides3 --seeds 200 --metric traps
npm run pool-metrics -- --variant tides3 --seeds 100 --metric diversity
npm run tides-similarity -- --a tides3 --b sigseed --seeds 100
```

On the headline **dreamcaller** metric — the question "does each pool deliver the
theme its Dreamcaller was built to play?" — `tides3` (87.7) is by far the closest
preconstructed-deck algorithm to `sigseed` (89.2); `tides` and `tides2` score in
the mid-50s because they reproduce `idf3`'s broad archetype mix rather than
`sigseed`'s signature-pure pools. The per-card inclusion-frequency cosine to
`sigseed` is ~0.82 (normalized against `sigseed`'s own seed-split self-ceiling):
`tides3` pools are a touch broader than `sigseed`'s (a baked all-signatures tide
spans more cards than `sigseed`'s random-subset pools), which is the gap between a
fixed readable deck and a freshly grown one.

## 4. Re-bake workflow

```bash
npm run bake-tides3       # rewrites data/tides3.jsonc + docs/cards2/tides3_decklists.md
npm run setup-assets      # copies it to public/tides3-data.json
npm run pool-metrics -- --variant tides3 --seeds 200 --metric dreamcaller
```
