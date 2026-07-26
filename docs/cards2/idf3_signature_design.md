# idf3: Signature-Steered Starter Selection for Draft Pools

## 1. Purpose and summary

In the draft test mode a player first chooses a **Dream Avatar** (a character
that defines how their deck wants to play) and is then handed a **card pool** —
a multiset of roughly a hundred card copies — to draft a deck from. The quality
of that experience depends on the pool *matching* the Dream Avatar: an aggressive
warrior Dream Avatar should be handed a pool full of warriors and combat tricks,
not a random assortment.

`idf3` is a pool-construction algorithm that builds the pool out of **real,
human-built decklists** and steers it toward the chosen Dream Avatar using a tiny
piece of new data: a **signature**, a short list of card names that captures
what the Dream Avatar is about. The signature is the only new input the algorithm
needs; it reads no colors, mechanic tags, archetype labels, or other metadata.

The core move is this. Building a pool from real decks comes down to picking one
**starter** decklist and then growing the pool out of the decks most similar to
it. `idf3` biases *which starter is picked* toward the decks that resemble the
Dream Avatar's signature — while still spreading the choice broadly across the
many decks that fit, so the player gets a pool that is unmistakably the
Dream Avatar's, but a different one each time they play.

This document is self-contained: Section 2 explains the foundations the
algorithm rests on, Section 3 explains the idea, Section 4 explains how to write
a signature for each Dream Avatar, Section 5 specifies the algorithm precisely
enough to implement, Section 6 walks a full example, and Section 7 describes how
the design was validated. Appendix A records the alternatives that were weighed
and why this one was chosen.

---

## 2. Background: how a pool is built from real decks

### 2.1 The corpus of real decklists

The raw material is a **corpus** of real decks that people actually drafted and
saved — on the order of a thousand of them. Each is a plain list of card names.
Before use, the corpus is filtered for hygiene: a deck is kept only if its number
of distinct cards falls in a sensible band (between 16 and 34). This drops two
kinds of junk: near-empty partial files (too little signal to be useful) and a
few oversized aggregate files that are not really single drafted decks. What
survives is the working corpus; call its size *n*.

A deck, for the algorithm's purposes, is just the **set of card names** it
contains.

### 2.2 IDF weighting and "distinctive" cards

Not all shared cards mean the same thing. Two decks that both run a universal
staple have told you almost nothing; two decks that both run the same rare payoff
are almost certainly the same kind of deck. To capture that, every card is given
an **inverse-document-frequency (IDF) weight**.

Let *df(c)* be the number of corpus decks that contain card *c*. The weight is

```
idf(c) = ln( (n + 1) / df(c) )
```

A card in nearly every deck has *df(c)* close to *n*, so its weight is close to
zero; a card in only a handful of decks has a large weight. Two further rules
keep the weights clean:

- Cards that are too rare or too common to carry signal are **zeroed**: if *df(c)*
  is below a small floor, or above a large fraction of *n*, then *idf(c) = 0*.
  Such a card cannot influence any similarity score, though it can still end up in
  a pool.
- The weight may optionally be raised to a power (`idfPower`) to sharpen the
  emphasis on rarity. At `idfPower = 1` it is the plain log above.

The intuition to hold onto: **IDF makes "two decks are similar" mean "they share
distinctive cards," not "they share popular cards."** This property does a great
deal of work later — in particular, it makes a signature self-cleaning, because a
staple accidentally placed in a signature carries near-zero weight and is
effectively ignored.

### 2.3 IDF-cosine similarity

The similarity between two decks *A* and *B* is the **IDF-weighted cosine**:
sum, over the cards they share, of *idf(c)²*, divided by the product of the two
decks' norms (a deck's norm is the square root of the sum of *idf(c)²* over its
cards). The result is a number between 0 and 1: 1 for identical decks, 0 for
decks that share no weighted cards. Because the shared term uses IDF weights, two
decks sharing only staples score near 0, while two decks sharing rare payoffs
score high. Each deck's norm is computed once so similarity is a cheap dot
product.

### 2.4 Starter-and-grow: the only choice is the starter

A pool is built in two phases:

1. **Pick a starter.** Choose one real decklist from the corpus to be the seed.
2. **Grow.** Rank every other deck by IDF-cosine similarity to the starter, then
   fold whole decks into the pool best-first — most similar first — adding one
   copy of each of a deck's cards (capped at two copies of any card). Decks are
   added whole, never truncated mid-list. After each added deck the running pool
   is a candidate; the algorithm keeps the candidate whose total copy count lands
   closest to a target size (about 100 copies, within a tolerance of 10) and stops
   once adding another deck would only move further past the target.

The decisive fact for everything below: **growth is fully determined by the
starter.** Given a starter, the ranking, the folding order, and the final pool
are all fixed — there is no further randomness. So the *only* decision that
shapes a pool is which deck becomes the starter. Whatever an algorithm wants to
control about the pool, it controls by controlling the starter draw.

### 2.5 Diversity in the starter draw

If the starter were drawn uniformly at random, a problem appears: the corpus is
**lopsided**. A popular archetype is recorded as dozens of near-duplicate decks,
while a fringe archetype has only a handful. A uniform draw therefore lands in the
big near-duplicate clusters far more often, and the player keeps being handed the
same kind of pool.

The fix already in use weights the starter draw against crowded clusters. For
each deck, count its **near-twins**: how many other decks lie within a similarity
threshold `twinTau` (0.5) of it. A deck deep inside a 40-deck cluster has dozens
of near-twins; a one-of-a-kind deck has none. The starter is then drawn with
weight

```
div(deck) = 1 / (1 + nearTwins(deck)) ^ diversityBeta        (diversityBeta = 0.5)
```

so a deck competes for probability against its own near-duplicates, and the big
clusters stop dominating. This `div(deck)` weight — the **diversity weight** — is
the baseline `idf3` builds on. (An algorithm that draws the starter purely by
`div` and then grows as in 2.4 is the predecessor `idf3` extends; `idf3` is that
algorithm plus one more factor on the starter weight.)

### 2.6 The gap idf3 fills

The diversity weight makes pools *varied*, but it reads nothing about the
Dream Avatar — it draws the same broad distribution of starters no matter who the
player picked. So the pools are coherent and varied but **not matched** to the
Dream Avatar. Closing that gap is the entire job of `idf3`.

---

## 3. The idf3 idea: the Dream Avatar as a signature

The algorithm speaks exactly one language: a deck is a bag of cards, and decks
are compared by IDF-cosine. To steer toward a Dream Avatar, `idf3` expresses the
Dream Avatar in that same language — as a **signature**, a tiny bag of cards
standing in for "what this avatar wants to do." The signature is not a deck
and never becomes the pool; it is a *query* used to score how well each real deck
fits the Dream Avatar. That fit is folded into the starter draw as one more factor
on top of the diversity weight.

Two refinements make this work well, and they are the substance of the design:

1. **Affinity is measured against a full anchor deck, not against the signature
   directly.** A signature is only a handful of cards, so most of the decks that
   genuinely fit the Dream Avatar contain *none* of those exact cards — measuring
   fit by literal overlap with the signature would see only a thin, biased slice
   of the good decks. Instead, the signature is used to find the **anchor(s)**:
   the real deck (or few decks) most similar to it. Fit is then measured as
   similarity to the anchor. Because an anchor is a whole ~25-card deck, the
   decks that resemble it are the *entire* archetype, whether or not they run the
   literal signature cards. This makes the fit signal **dense** — it reaches all
   the good decks — rather than sparse.

2. **The fit is capped before it weights the draw.** If fit entered the draw in
   raw proportion, the few decks most similar to the anchor (its near-duplicates)
   would soak up nearly all the probability, and the pool would collapse onto a
   tiny set — the very thing the diversity weight exists to prevent. So fit is
   **saturated at a cap**: once a deck is clearly on-identity, it stops being
   rewarded for being *even more* on-identity. Past the cap, on-identity decks
   compete with one another purely on the diversity weight, which spreads the
   choice across the whole identity. The cap behaves as a **soft gate**: strongly
   prefer the Dream Avatar's region, then pick broadly within it.

The result, named after its place in the design space (see Appendix A), is the
**A″** scheme: **anchor-based affinity, saturated by a cap, multiplied into the
diversity weight.** In one line, the starter is drawn with weight

```
weight(deck) = ( eps + min( anchorAffinity(deck), cap ) ) ^ alpha  ×  div(deck)
```

The next two sections make "anchorAffinity", the constants, and the surrounding
machinery precise.

---

## 4. Assigning a signature to each Dream Avatar

### 4.1 The signature table

The new data is a per-Dream Avatar `signature-cards` field, a card list:

```
signature-cards : cardName[]   # one per [[dreamAvatar]] in dream_avatars_v2.toml
```

It lives in `data/tabula/dream_avatars_v2.toml` alongside each Dream Avatar's name,
title, and ability, and flows into the loaded Dream Avatar records as
`signatureCards`. Its values are **card names only** — the algorithm's native
vocabulary. A typical entry is a handful of names:

```
Kragg:  [ "<a distinctive sacrifice payoff>",
          "<a key Abandon enabler>",
          "<a recurring black-red finisher>" ]
```

### 4.2 What makes a good signature card

The test for a signature card is simple: **if you saw this card in a deck, would
it make you confident the deck is trying to do what this avatar does?** Good
signature cards are the distinctive build-arounds, payoffs, and key enablers of
the Dream Avatar's strategy. Poor choices are:

- **Universal staples and mana/fixing.** A card in almost every deck carries a
  near-zero IDF weight, so it contributes nothing to the fit score regardless of
  how central it feels. Including one does no harm, but it does no work either.
- **Generically good cards** that show up across many unrelated archetypes. They
  pull the anchor toward whatever is most common, not toward the Dream Avatar.

Because fit is IDF-weighted, the signature is **self-cleaning**: only the
genuinely distinctive cards in it actually steer the draw, so a list does not
have to be perfectly curated to work. Note one interaction with the IDF rules of
Section 2.2: a card that is too common or too rare is zeroed and contributes
nothing. Choose cards that are **distinctive but not vanishingly rare** — the
cards that recur across the Dream Avatar's decks without being everywhere.

### 4.3 How many cards

A signature does one job — locate the anchor — so it needs only enough cards to
point reliably at the right region of the corpus. Measurement shows that with
anchor-based affinity the choice of starter is **remarkably insensitive to
signature length**: anywhere from one card to a dozen produces essentially the
same match and the same spread, as long as the cards are genuinely
characteristic. A single strong card already localizes the anchor; adding more
yields only a mild reduction in how often any one deck dominates.

The practical recommendation is therefore **three to six cards**, chosen for
human legibility and a little redundancy (so one weak or later-removed card does
not undo the steering), not because the number is critical. Do not push toward
very long lists: a handful of characteristic cards is a signature, while dozens
amount to transcribing a deck, and a long list that mixes cards from genuinely
different strategies can pull the anchor toward an incoherent middle.

### 4.4 A practical recipe for authoring a signature

Signatures are written from design intent — you know what a Dream Avatar is for.
When you want a reproducible starting point, this mechanical recipe produces a
solid first draft that you then trim by hand:

1. Gather a set of decks that embody the Dream Avatar (decks you would point to and
   say "that's a Kragg deck").
2. For each card appearing in those decks, score it by **(fraction of those decks
   that contain it) × (the card's IDF weight)** — i.e. cards that are both
   characteristic of the group and distinctive in the corpus at large.
3. Take the top few by that score; drop any that, on inspection, are generic.

This recipe uses knowledge about archetypes that the *running algorithm* never
touches; once the list of card names is written into the table, the algorithm
reads nothing but those names. Authoring is unconstrained — the algorithm's
clean-room property is about what it consumes at run time, the final card list.

### 4.5 Multi-modal identities

Some Dream Avatars span more than one sub-strategy (for example a black-red
sacrifice build and a black-green sacrifice build that share a core but diverge in
color). Handle this not by lengthening the signature but by including a couple of
distinctive cards from *each* mode and letting the algorithm take **several
anchors** (Section 5.4): the anchors then center on each mode, and fit — measured
as similarity to the *nearest* anchor — covers both regions. The number of
anchors, `anchorCount`, should be at least the number of modes you expect.

### 4.6 Dream Avatars without a signature

A Dream Avatar that has no entry in the table needs no special handling. With an
empty signature there are no anchors, every deck's affinity is zero, and the
starter weight reduces to the plain diversity weight of Section 2.5 — the broad,
identity-agnostic behavior. This falls directly out of the formula (Section 5.6),
with no separate code path. So you write signatures only for the Dream Avatars you
want steered; the rest get the well-understood general-pool behavior for free.

---

## 5. The algorithm in detail

### 5.1 Tuning constants

`idf3` introduces four constants and reuses the corpus and diversity constants of
the algorithms it builds on. The values below are the validated operating point
(Section 7); they can be retuned with the experiment of Section 7.

| Constant | Value | Meaning |
|---|---|---|
| `sigAlpha` (alpha) | 2 | Exponent on the capped affinity. The strength dial. `0` makes `idf3` identical to the diversity-only draw. |
| `sigCap` (cap) | 0.4 | Saturation cap on affinity — the soft gate. Affinity at or above this counts the same. |
| `anchorCount` (m) | 3 | Number of nearest real decks taken as anchors. Raise it for multi-modal identities. |
| `sigEps` (eps) | 0.05 | Affinity floor, so off-identity decks keep a small, diversity-shaped share rather than dropping to zero. |
| `twinTau` | 0.5 | Similarity at/above which two decks count as near-twins (for the diversity weight). |
| `diversityBeta` | 0.5 | Strength of the near-twin diversity weight. |
| corpus + sizing | — | `targetSize` 100, `targetTolerance` 10, copy cap 2, `idfPower` 1, df floor 1, df ceiling fraction 1, deck-size band 16–34. |

### 5.2 Step 0 — corpus, IDF, and the diversity weight

Build (once, and cache) the working corpus of Section 2.1: filter decks to the
size band, compute *idf(c)* for every card with the rare/common zeroing of
Section 2.2, and precompute each deck's norm. In the same pass that the diversity
weighting already needs, compute every deck's near-twin count and from it the
**diversity weight** `div(i) = 1 / (1 + nearTwins(i)) ^ diversityBeta`. This is
shared, unchanged, with the predecessor algorithm; `idf3` reuses it rather than
recomputing it.

### 5.3 Step 1 — the signature probe

From the Dream Avatar's signature card list, form the **probe**: the set of
signature cards that exist in the corpus with a positive IDF weight (cards that
are absent, or zeroed for being too rare/common, are dropped). Treat the probe as
a synthetic deck so the standard IDF-cosine of Section 2.3 applies to it: its norm
is the square root of the sum of *idf(c)²* over the probe's cards.

If the probe is empty — no signature, or none of its cards carry weight — there
are no anchors and the algorithm proceeds with all affinities zero, which yields
the diversity-only draw (Section 4.6).

### 5.4 Step 2 — anchors

Score every corpus deck by IDF-cosine to the probe. The **anchors** are the up to
`anchorCount` decks with the *highest positive* probe-cosine. Decks with zero
probe-cosine are never anchors; if fewer than `anchorCount` decks have positive
cosine, take only those; if none do, the anchor set is empty.

The anchors are the real decks that most embody the signature — "the most
Kragg-like real decks." They are region centers, not the starter.

### 5.5 Step 3 — anchor affinity

For each corpus deck *i*, its **anchor affinity** is its greatest similarity to
any anchor:

```
anchorAffinity(i) = max over anchors a of  cosine(deck i, anchor a)
```

with a deck's similarity to itself taken as 1 (so an anchor's own affinity is 1).
If the anchor set is empty, `anchorAffinity(i) = 0` for every deck. Because an
anchor is a full deck, this score is **dense**: every deck in the Dream Avatar's
archetype scores high, not only the few that contain literal signature cards.

### 5.6 Step 4 — the starter weight (the A″ formula)

Each deck's starter weight combines its capped affinity with the diversity
weight:

```
weight(i) = ( sigEps + min( anchorAffinity(i), sigCap ) ) ^ sigAlpha  ×  div(i)
```

Reading the formula:

- **The cap** (`min(..., sigCap)`) is the soft gate. Every deck at or above the
  cap's similarity to an anchor gets the identical affinity factor, so among them
  the weight is just `div(i)` — they spread across the identity by the diversity
  weight rather than concentrating on the single most anchor-like deck.
- **The exponent** (`sigAlpha`) sets how strongly affinity matters. With the
  recommended values, an on-identity deck (affinity ≥ cap) carries an affinity
  factor of `(0.05 + 0.4)² ≈ 0.20`, while an off-identity deck (affinity ≈ 0)
  carries `0.05² ≈ 0.0025` — about an 80× preference for the Dream Avatar's region,
  before the diversity weight is applied. Off-identity decks keep a small share
  (the `sigEps` floor) rather than being excluded, so the pool retains a broad
  base.
- **The product with `div(i)`** gives the diversity weight a focused role:
  affinity has already committed the draw to one identity, so the diversity weight
  spreads it across the decks *within* the Dream Avatar's identity — the player gets
  a different deck of the right kind each run.
- **Setting `sigAlpha = 0`**, or supplying no signature, collapses the affinity
  factor to a constant that cancels under normalization, leaving exactly the
  diversity-only draw. `idf3` thus strictly generalizes its predecessor.

### 5.7 Step 5 — draw the starter

Draw one deck as the starter from the categorical distribution proportional to
`weight(i)`, consuming a single random number from the run's seeded generator
(the same single-draw structure the diversity-only algorithm uses). A given seed
therefore reproduces a pool exactly, and different seeds give different starters —
the algorithm's only randomness.

### 5.8 Step 6 — grow the pool

Grow the pool from the chosen starter using the shared growth procedure of
Section 2.4, unchanged: rank the remaining decks by IDF-cosine to the starter,
fold whole decks in best-first bumping copy counts (capped at two), and keep the
whole-deck boundary whose size lands closest to the target. Because the starter is
on-identity and growth pulls in the decks most similar to it, the grown pool is
on-identity as well — steering the starter alone is sufficient, which is why
`idf3` needs no second hook into growth.

### 5.9 Identity, labels, and fallback

- **Color identity.** `idf3` reports no color identity. Deriving one would mean
  reading color metadata, which this algorithm does not consume; the identity
  string is left empty.
- **Labels.** The pool records that it was produced by `idf3`, which Dream Avatar
  drove it, and which corpus deck was the starter — enough to reproduce and
  inspect a pool.
- **Fallback to the diversity-only draw** happens automatically whenever the probe
  is empty (Section 4.6 / 5.3): the weights become proportional to `div(i)`. No
  branch is required, though an implementation may short-circuit for clarity.
- **Fallback when the corpus is unusable** (no bundled decklists) follows the same
  rule the decklist-based algorithms use: fall back to the default synthesized
  pool.

### 5.10 Wiring and data flow

The pieces fit into the existing pool-construction flow as follows:

1. **The data.** Add a `signature-cards` card list to each `[[dreamAvatar]]` in
   `dream_avatars_v2.toml`.
2. **Load it.** The asset build carries `signature-cards` into the generated
   Dream Avatar JSON as `signatureCards` (an empty list when absent), and the
   records expose it like other per-Dream Avatar guidance.
3. **Thread it through.** Pass `signatureCards` into pool generation alongside the
   other per-Dream Avatar arguments, and register a new `idf3` variant that the
   dispatcher routes to. Expose it for manual testing via the pool-variant
   selector (e.g. an `?algo=idf3` URL parameter).
4. **Reuse, do not duplicate.** The `idf3` variant reuses the existing IDF corpus,
   the IDF-cosine routine, the near-twin diversity weights, and the growth
   procedure; its own code is just Steps 1–5 above.

### 5.11 Cost

The near-twin diversity weights cost one O(*n*²) similarity pass, which is shared
with the predecessor algorithm and computed once. Per pool, `idf3` adds only the
probe-cosine scan and the anchor-affinity scan — O(*n* × *m*) plus O(*n*) — both
negligible. The grown pool for a starter is independent of the Dream Avatar, so
nothing about steering changes growth's cost.

---

## 6. Worked example: Kragg

Suppose Kragg is a black-red sacrifice Dream Avatar whose decks lean on Abandon
payoffs. An author writes a three-to-six card signature of Kragg's distinctive
sacrifice payoffs and Abandon enablers — not the format's staples or mana, which
would be zeroed anyway — and records it as `signature-cards` on the `Kragg`
entry in `dream_avatars_v2.toml`.

At run time, the player picks Kragg. The probe is formed from those signature
cards (Step 1). The algorithm scores every real deck by similarity to the probe
and takes the three most Kragg-like real decks as anchors (Step 2) — concretely,
the black-red sacrifice decks that most feature those payoffs. Each corpus deck's
affinity is its similarity to the nearest of those anchors (Step 3); because the
anchors are whole sacrifice decks, *every* black-red (and adjacent) sacrifice deck
scores high, including the many that do not happen to run the exact signature
cards. The hundred-odd genuine Kragg decks therefore all land above the cap.

The starter weight (Step 4) gives every above-cap Kragg deck the same affinity
factor, so they compete for the starter slot purely on the diversity weight —
which spreads the draw across them and damps the crowded near-duplicate clusters
among them. Off-identity decks keep only the small `sigEps` share. The draw (Step
5) therefore almost always lands on *some* Kragg sacrifice deck, but a different
one each run. Growth (Step 6) folds in that starter's most similar neighbors —
more sacrifice decks — yielding a roughly hundred-copy black-red sacrifice pool
that is unmistakably Kragg, grown from real sacrifice decks, and different each
time. A Dream Avatar with no signature would instead get the broad,
identity-agnostic draw.

---

## 7. How the design was validated

The design was settled by simulation rather than argument. The validation
re-implements the corpus, the diversity draw, and the growth procedure, and
**proves they reproduce the real predecessor algorithm bit-for-bit** across ten
seeds before trusting any measurement. Because growth is deterministic given the
starter, every metric is computed *exactly* as a weighted sum over the starter
distribution, with no sampling noise.

To test steering without circular reasoning, the validation uses each
Dream Avatar's real archetype as ground truth (information the algorithm under test
never sees): it derives a realistic signature from the distinctive recurring cards
of that Dream Avatar's decks, and it splits the signature in half — steering with
one half and measuring whether the *other* half, never steered on, shows up in the
pool. It reports, per scheme, averaged over twenty themed Dream Avatars (each with
~200 fitting decks in the corpus):

- **onIdentity** — probability the drawn starter is one of the Dream Avatar's decks
  (match).
- **heldout** — recall of the held-out signature half (match, without the
  circularity).
- **effGood** — the effective number of *distinct* fitting decks the starter draw
  spreads across (spread; higher is broader).
- **maxShare** — the single most-drawn fitting deck's share (spread; lower is
  better).
- **cohesion** — expected similarity of folded decks to the starter (a guard
  against incoherent pools).

At the recommended operating point (`sigAlpha = 2`, `sigCap = 0.4`,
`anchorCount = 3`, `sigEps = 0.05`), A″ raised held-out recall from the unsteered
baseline of ~0.16 to ~0.54 (a pool that genuinely captures the identity) while
still spreading the starter across ~100 distinct fitting decks and keeping the
single-deck share to ~0.02 — the lowest dominance of any scheme that matched the
Dream Avatar. Cohesion did not fall; steering toward identity slightly raised it.
The accompanying signature-length sweep is the evidence behind Section 4.3.

---

## Appendix A: alternatives considered, and why A″

Steering the starter draw from a signature has two independent design choices.
The first is **how a deck's fit to the signature is scored**:

- *Literal* — the IDF-weighted overlap with the signature cards themselves. This
  is **sparse**: a handful of signature cards appear in only a thin, often
  single-sub-archetype slice of the decks that actually fit, so most good decks
  score zero and the steering is biased toward whichever corner the literal cards
  live in.
- *Anchor* — similarity to the full real deck(s) most like the signature. This is
  **dense**: a whole anchor deck is shared across the entire archetype, so every
  fitting deck scores high. `idf3` uses this.

The second choice is **how the fit enters the single starter draw**:

- *Proportional* — multiply the diversity weight by fit raised to a power. Match
  and spread are then coupled through one dial: leaning hard enough to match well
  also concentrates the draw onto the few best-fitting decks.
- *Gated* — keep only decks above a fit threshold (a hard slice) and draw the
  diversity weight within. This decouples match from spread in principle.
- *Capped* — saturate fit at a cap, then weight proportionally. The cap is a
  *soft* gate: it gets the decoupling without a hard cliff. `idf3` uses this.

The four combinations were compared on the metrics of Section 7:

- **A = literal + proportional.** The sparse score means the steering bonus lands
  only on the decks that contain the exact signature cards — a biased subset — so
  it matches a narrow corner rather than the whole identity.
- **A′ = anchor + proportional (uncapped).** Dense and a clear improvement on A,
  but with no cap the draw over-rewards the decks most similar to the anchor (its
  near-duplicates), giving a higher single-deck share than necessary.
- **B = anchor + gated.** Produces the strongest match of all — but it **collapses
  spread**. The hard slice around an anchor is itself a crowded near-twin cluster,
  so drawing the diversity weight *within* it cannot broaden much: the effective
  number of distinct starters fell to the teens-to-forties and the single most
  common deck reached ~11% of all draws. That is precisely the "keep handing me
  the same few decks" failure the design exists to avoid, so B's extra match is
  not worth its loss of variety.
- **A″ = anchor + capped.** The chosen scheme. It keeps A′'s dense, complete
  identity signal and adds the cap, which holds the single-deck share to the
  lowest of any matching scheme while preserving a broad spread across the
  Dream Avatar's decks. It delivers strong match at high spread, never erodes
  cohesion, and stays the simplest in spirit — a single extra factor on the
  starter weight, with no slice, threshold, or fallback machinery beyond what
  falls out of the formula.

A separate finding shaped Section 4.3: with anchor-based affinity, the result is
nearly **insensitive to signature length** from one card up to a dozen, provided
the cards are genuinely characteristic. The count is far less important than using
anchor (dense) affinity and capping it; a short, well-chosen signature is all the
algorithm needs.
