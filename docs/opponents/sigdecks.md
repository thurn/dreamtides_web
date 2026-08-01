# Signature decks (`/sigdecks`)

`/sigdecks` is a debug visualization that, for each Dream Avatar carrying a
signature, finds the single real draft deck in the adapted draft corpus most
strongly correlated with that Dream Avatar and renders its whole mainboard. This
document describes, in detail, how those decklists are selected.

Source: [`src/debug/SignatureDecksApp.tsx`](../../src/debug/SignatureDecksApp.tsx)
(route wired in [`src/main.tsx`](../../src/main.tsx) at path `/sigdecks`).

The selection runs **live in the browser** every time the screen loads, from the
same journey content the battle integration consumes. There is no precomputed
artifact: the result tracks the current card data and signature lists.

## Inputs

### Draft corpus

The deck pool is the adapted Cube Cobra draft corpus in
[`docs/draft_records_adapted`](../draft_records_adapted). Each `*-records.jsonc`
file holds several seats, and each seat's `mainboard` is one deck. `scripts/setup-assets.mjs`
(`buildDraftRecords`) bundles these into `public/draft-records-data.json`, one
entry per seat. A seat is included only when it yields exactly 30 trimmed picks
(first three packs, first ten picks each); seats that do not are dropped. This
yields **993 seats** at time of writing.

Each bundled record carries both names and stable UUIDs, index-aligned:

- `mainboard: string[]` — the kept cards as current display names.
- `mainboardIds: string[]` — the matching cards_v2 UUIDs, position-for-position.

`/sigdecks` reads `mainboardIds`.

### Dream Avatar signatures

Signatures come from the `signature-cards` lists in
[`data/tabula/dream_avatars.toml`](../../data/tabula/dream_avatars.toml),
authored as stable cards_v2 UUIDs. `setup-assets.mjs` resolves each to its current
display name and emits both, index-aligned, on every Dream Avatar in
`public/dream-avatars-v2-data.json`:

- `signatureCards: string[]` — display names (consumed by the name-based idf3
  pool engine).
- `signatureCardIds: string[]` — the matching UUIDs.

`/sigdecks` reads `signatureCardIds`. Of the 32 Dream Avatars, 20 carry a
signature; the other 12 are skipped.

## Identify by UUID, never by name

Every comparison, count, and lookup keys on the cards_v2 UUID. This is required
for correctness, not stylistic: **24 cards share a display name with another,
distinct card** (e.g. two "Barrage Specialist", "Grim Reclaimer", "Shadowbinder",
"Wreckborn"). Name-based identity would conflate the colliding pairs — corrupting
the document-frequency and similarity math — and render the wrong card. The
`mainboardIds` and `signatureCardIds` bundle fields exist for this reason. UUIDs
are lowercased before use so casing differences never split a card in two.

## Corpus filter: deck size

Mainboards larger than **`MAX_DECK_SIZE = 28`** cards are excluded from
consideration entirely. The corpus contains sprawling draft piles (up to ~68
cards); such a deck correlates with a Dream Avatar mostly by holding more of
everything, which makes it a misleading "signature deck". Filtering to ≤ 28 cards
leaves **206 of the 993** seats. Every signature-carrying avatar still has a
qualifying deck. All statistics below (document frequency, IDF, deck norms,
neighbour counts) are computed over this filtered corpus, so `N` denotes the
number of decks at or below the size cap.

## The correlation metric: IDF cosine similarity

Each deck and each signature is treated as a sparse vector over card UUIDs,
weighted by inverse document frequency.

### Document frequency and IDF

For each card UUID `c`, `df(c)` is the number of filtered-corpus mainboards (as
deduplicated sets) that contain it, and

```
idf(c) = ln(N / df(c))
```

so a rare card carries more weight than a common one — the same steering idea the
idf3 pool variant uses. A signature card shared with a deck therefore counts for
more when that card is distinctive.

### Vectors and norms

- **Deck vector**: each deck's distinct card UUIDs, each component weighted by its
  IDF. Its L2 norm is `‖D‖ = sqrt(Σ idf(c)² over the deck's cards)`.
- **Signature vector**: the Dream Avatar's signature UUIDs, each weighted by its
  IDF. Its norm is `‖S‖ = sqrt(Σ idf(s)² over the signature cards)`.

### Cosine fit

For a deck `D` and signature `S`, the cosine fit is the IDF overlap normalized by
both norms:

```
fit(S, D) = ( Σ idf(c) over signature cards present in D ) / ( ‖D‖ · ‖S‖ )
```

Normalizing by the **deck norm** is what makes the metric scale-invariant: a raw
overlap sum favours large decks (more slots to contain any given signature card),
whereas the cosine measures correlation independent of deck size. Including the
signature norm (constant across decks for one Dream Avatar, so it does not affect
ranking) keeps the reported value a true cosine in `[0, 1]`, comparable across
Dream Avatars.

### Deck–deck cosine

Similarity between two decks uses the same IDF-vector cosine:

```
cos(A, B) = ( Σ idf(c)² over cards in both A and B ) / ( ‖A‖ · ‖B‖ )
```

This drives both the `typical` selection mode and the neighbour count.

## Candidate set

For a given Dream Avatar, the candidates are every filtered-corpus deck that
contains **at least one** of its signature cards, each tagged with its `fit` to
the signature and the set of signature UUIDs it matched. A Dream Avatar with no
candidate (no deck contains any of its signatures) produces no row.

## Selection modes

The screen exposes two selection goals via a header toggle, mirrored to the
`?mode=` URL parameter (`?mode=match` is the default and is written as a bare URL;
`?mode=typical` is explicit, making any view a shareable link).

### `match` — closest single deck (default)

Picks the candidate with the highest `fit(S, D)`. Ties break toward the deck that
matched more distinct signature cards. This is a pointwise nearest-neighbour to
the signature: it answers "which one deck best matches these cards?" and can land
on an idiosyncratic outlier that happens to align.

### `typical` — most representative deck

Among the candidates, picks the one most central to the cluster of
signature-fitting decks — the deck with the highest **fit-weighted centrality**:

```
centrality(X) = Σ over all candidates Y of [ fit(Y) · cos(X, Y) ]
```

Ties break toward the candidate with the higher raw `fit`. This rewards "the
common way this signature gets built" and is robust to one-off outliers, at the
cost of some literal fit. Where a Dream Avatar's best literal match is a quirky
deck, the two modes diverge; where the best match also sits in a dense region,
they agree.

## Neighbour count

For the chosen deck, the screen reports how many **other** filtered-corpus decks
are similar to it: the count of decks whose deck–deck cosine with the winner is at
least **`SIMILAR_THRESHOLD = 0.45`**. This number makes the difference between the
two modes legible — a `match`-mode winner is sometimes a near-isolated outlier
(zero neighbours), while a `typical`-mode winner tends to have a real cluster
around it. The corpus is fairly sparse at this threshold, so neighbour counts are
small.

## Per-Dream Avatar independence

Each Dream Avatar's deck is chosen **independently**: the algorithm takes the
argmax over the corpus for that Dream Avatar alone, with no cross-Dream Avatar
deduplication or repulsion. The IDF weighting measures card rarity across the deck
corpus, not how distinctive one Dream Avatar is from another. A consequence is that
two Dream Avatars with overlapping signatures can be assigned the same deck — the
presence of one never affects the other's result.

## Rendering

The winning deck's `mainboardIds` are resolved to card records through a
UUID-keyed lookup built from the runtime card catalog and rendered with the shared
`CardView`. Hovering a card enlarges it in place through GameCard/CardView's
built-in hover-zoom, and hovering a Dream Avatar's portrait or name shows
a card with its ability (`DreamAvatarPopover`). Signature-card chips above each
deck mark which signatures the chosen deck contains (filled) versus missed
(faint), and key on UUID.

## Tunable constants

| Constant | Value | Effect |
| --- | --- | --- |
| `MAX_DECK_SIZE` | 28 | Decks with more cards are excluded from the corpus. |
| `SIMILAR_THRESHOLD` | 0.45 | Deck–deck cosine at or above this counts as a neighbour and shapes the `typical` clustering signal. |

Both live at the top of `computeSignatureDecks` in
[`src/debug/SignatureDecksApp.tsx`](../../src/debug/SignatureDecksApp.tsx).
