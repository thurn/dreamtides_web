# picksig: Signature-Steered Seed Selection for Pick-Record Pools

## 1. Purpose and summary

In the draft test mode a player first chooses a **Dream Avatar** (a character
that defines how their deck wants to play) and is then handed a **card pool** — a
multiset of card copies — to draft a deck from. The experience depends on the
pool *matching* the Dream Avatar: an aggressive warrior Dream Avatar should be
handed a pool full of warriors and combat tricks, and the pool should still feel
*different* each time, so one Dream Avatar offers many distinct decks to build —
warrior aggro one run, warrior combo the next — rather than a single fixed list.

`picksig` is a pool-construction algorithm that meets both goals. It is the
`pickcohere` algorithm with exactly one change: where `pickcohere` draws its
candidate seed cards **uniformly** at random, `picksig` draws them from a
distribution **biased toward the chosen Dream Avatar's signature** — a short list
of distinctive card UUIDs (`dreamAvatar.signatureCards`) that captures what the
Dream Avatar is about. Everything downstream — the affinity-grown pool, the
best-of-K coherence selection — is `pickcohere`'s, unchanged.

The signature is the only new input the algorithm reads; it consults no colors,
mechanic tags, or archetype labels. With no signature it reduces, with no
separate code path, to plain `pickcohere`.

This document is self-contained: Section 2 covers the `pickcohere` foundations
`picksig` rests on, Section 3 explains the idea, Section 4 specifies the
algorithm, Section 5 reports the validation, and Appendix A records the
alternatives weighed.

---

## 2. Background: how `pickcohere` builds a pool

### 2.1 The pick-record corpus

The raw material is the set of **real draft pick records** in
`docs/draft_records_adapted/`: for every pick a real drafter made, the full pack
they were offered and the card they took. Everything is keyed by stable cards_v2
**UUID** — the same rename-proof identity throughout — so a card rename never
shifts a draw, a growth step, or a piece of provenance.

From the records two statistics are computed (`buildPickfitCorpus`, shared with
`pickfit`):

- an **availability-corrected play-rate prior**, `pickRate(c) = taken(c) /
  offered(c)` — a card's desirability, controlling for how often it was even
  offered; and
- a **behavioural synergy affinity**, the *excess* pick rate of `c` when `d` is
  already in the drafter's pool: `condRate(c | d earlier) − baseline(c)`, shrunk
  by the evidence behind the pair and floored at zero. This isolates synergy from
  raw power — a strong card has a high baseline, so it registers affinity to `d`
  only when holding `d` makes drafters take it *more* than usual.

`affinity[a][b]` reads as "how strongly `b` partners `a`"; each row is normalised
by its own source card, so the relation is asymmetric in general.

### 2.2 Growing a pool from one seed

`growAffinityPool` draws one **seed** card and grows a pool around it by greedy
blended affinity. At each step it adds the not-yet-maxed card whose blend is
highest:

```
score(c) = w · affinityToSeed(c) + (1 − w) · affinityToPool(c) + p · prior(c)
```

`affinityToPool` is recomputed against the cards already chosen, so the pool
stays coherent with itself as it grows. Copies are capped at two: a card earns
its second copy only when its discounted affinity still beats fresh first copies.

### 2.3 Best-of-K coherence selection

`pickcohere` draws not one seed but **K** (default 5), grows a pool from each, and
keeps the one with the highest **internal coherence** — the mean affinity over
every ordered pair of distinct cards in the pool (`poolCoherence`). A generic
glue seed (premium removal, card draw) grows a loose, low-coherence pool that
carries payoffs it cannot support; best-of-K steers away from those. All K draws
are consumed regardless of the winner, so the result is deterministic in the
seed.

The seed is the **only** lever on the whole pool: it determines which region of
the card space the pool grows in. That is the lever `picksig` reaches for.

---

## 3. The idea: bias the seed toward the signature

`pickcohere` draws its K seeds uniformly from the whole corpus, so its pools land
anywhere — they are not about any particular Dream Avatar. `picksig` keeps
everything else and changes only the seed distribution: it draws the K candidate
seeds from a distribution weighted toward the cards that **partner the
signature**, so the grown pool lands on the Dream Avatar's region of the card
space.

This mirrors `idf3`'s signature scheme (the "A″" design in
`idf3_signature_design.md`), but in pick-affinity space rather than
decklist-cosine space, and the match is *direct*: signature UUIDs and the pick
corpus share the same key space, so a signature card is located in the corpus by
identity. (At load time a Dream Avatar's signature is resolved to current card
names; `picksig` resolves those names back to UUIDs via the pool's name→UUID map
before steering.)

The two design pressures pull against each other, and the scheme resolves them
the way `idf3` does:

- **On-theme.** The pool must be unmistakably the Dream Avatar's. A signature card
  and its strong partners should dominate the seed draw.
- **Variety.** One Dream Avatar must offer *many* distinct pools leaning in
  different directions (warrior aggro vs warrior combo), not one fixed list. If
  the draw collapsed onto the single most central card, every run would grow the
  same pool.

The resolution is a **saturating cap** on the affinity (Section 4). Every
strongly on-theme card competes at the *same* top weight, so the draw spreads
across the whole identity instead of concentrating on its most central card. A
combo seed and an aggro seed both sit at the cap, and either can win a given run.

---

## 4. The algorithm

Let the signature resolve to a set `S` of corpus UUIDs (the **anchors**).

**Step 1 — signature affinity.** For each corpus card `c`, its raw signature
affinity is its strongest partnership to any anchor, in either direction:

```
rawAff(c) = max over s in S of  max( affinity[s][c], affinity[c][s] )
```

Anchors take `rawAff = ∞`. The non-anchor raws are normalised so the strongest
on-theme partner maps to 1; anchors map to 1 as well. Call the result
`sigAffinity(c) ∈ [0, 1]`.

**Step 2 — seed weight.** Apply the capped-affinity formula:

```
weight(c) = ( sigEps + min( sigAffinity(c), sigCap ) ) ^ sigAlpha
```

with `sigAlpha = 2`, `sigCap = 0.4`, `sigEps = 0.05`.

- `sigCap` **saturates** the affinity — the variety lever. Every card at or above
  the cap shares the same top weight, so the on-theme region stays wide.
- `sigAlpha` is the **strength** — how sharply on-theme cards out-weigh the rest.
- `sigEps` is a **floor** — off-theme cards keep a small share, so the pool is
  mostly on-theme without being pathologically narrow.

**Step 3 — best-of-K, unchanged.** Draw K candidate seeds from the categorical
distribution proportional to `weight(·)` (one `rng()` per draw, exactly as the
uniform draw consumes), grow a pool from each with `growAffinityPool`, and keep
the most coherent — `pickcohere`'s procedure verbatim.

**Fallback.** With an empty signature, or one whose cards are all absent from the
corpus, every `sigAffinity` is 0, every `weight` is the constant `sigEps ^
sigAlpha`, and a weighted draw with all-equal weights is exactly the uniform
draw. So `picksig` with no signature reproduces `pickcohere` bit-for-bit, with no
separate code path — the same way `idf3` reduces to `idf2`.

`picksig` shares every grower and best-of-K tuning field with `PICKCOHERE`; the
three `sig*` dials are the only additions, so the steered seed draw is the single
deliberate difference between the two algorithms.

---

## 5. Validation

`scripts/picksig-signature-experiment.mjs` runs the real `generatePoolFromData`
against the bundled pick corpus and the real Dream Avatar signatures — no
re-implementation — and measures, per Dream Avatar, over many seeds:

- **Variety** — the number of distinct pools (a pool is its sorted multiset of
  card UUIDs). The design target is ≥ 50 distinct pools per Dream Avatar.
- **On-theme** — the mean signature affinity of the pooled cards (the same
  affinity the algorithm steers on), against the `pickcohere` baseline on the
  same seeds.
- **Lean spread** — the mean pairwise Jaccard distance between distinct pools:
  above zero means the pools genuinely differ (a combo lean vs an aggro lean);
  not near one means they still share a common on-theme core.

Over the 20 Dream Avatars with an in-corpus signature, 200 seeds each:

- **Variety**: every Dream Avatar produces ≥ 50 distinct pools (55–126 across just
  200 seeds — more seeds yield more pools).
- **On-theme**: mean signature affinity 0.33 for `picksig` vs 0.21 for
  `pickcohere` — a 1.6× mean lift, positive for every Dream Avatar (1.1×–2.2×).
- **Lean spread**: mean pairwise Jaccard distance 0.54 — the pools of one
  Dream Avatar differ substantially while sharing an on-theme core.
- **Fallback**: with an empty signature, `picksig` reproduces `pickcohere`
  bit-for-bit on every checked seed.

Run it with `node scripts/picksig-signature-experiment.mjs`; `--dream-avatar
"<name>"` narrows to one, `--seeds N` sets the sample, `--json` emits raw rows.

---

## Appendix A. Alternatives weighed

- **Pre-seed the pool with the signature cards directly, then grow.** Rejected:
  it makes the same handful of cards appear in *every* pool of a Dream Avatar,
  flattening variety — the opposite of the goal.
- **No cap (multiply weight by `affinity^alpha`).** Rejected: the single most
  central on-theme card dominates the draw, so best-of-K converges on one cluster
  and variety collapses. The cap is what keeps the on-theme region wide; it is the
  same soft gate `idf3` settled on.
- **Steer the growth blend instead of the seed.** Rejected as unnecessary: the
  seed already determines the pool's region, and `growAffinityPool`'s internal
  coherence keeps the grown pool on-theme once seeded there. Changing only the
  seed distribution keeps `picksig` a clean, single-lever variant of `pickcohere`
  and an exact apples-to-apples comparison against it.
