# Opponent Deck Construction: Coherent Draft Rewrite

## Summary

The opponent decks players face in Battle sites are currently incoherent: they
pull cards uniformly at random from a generated pool, so a deck routinely ships
build-around payoffs ("the first warrior you play each turn costs 3 less") with
almost none of the cards those payoffs need. This document specifies a
clean-room replacement for opponent deck construction.

The replacement keeps the core idea of simulating a series of draft picks for an
opponent Dream Avatar, but replaces random selection with coherence-driven
selection: at each simulated pick the opponent takes the card that best FITS the
deck it has drafted so far, where "fit" is learned entirely from the corpus of
real human draft records in `docs/draft_records_adapted/`. Difficulty scales by
giving stronger opponents a larger pick budget and more post-draft card removals,
mirroring how a player's deck tightens as a run progresses.

When the Battle takes place in an affiliated dreamscape, the opponent deck must
also belong to that affiliation. This is treated as a first-class construction
objective: the draft's starting point is steered toward the affiliation, and
construction runs several seeded drafts and keeps the one that best matches the
target affiliation while staying coherent. In a neutral dreamscape there is no
affiliation target and construction optimizes coherence alone — which is exactly
the case that produces today's worst decks.

A first-class part of this work is a programmatic validation harness that
measures whether generated decks are internally coherent, using corpus
similarity alone. No human labeling, no hand-tagged "good deck / bad deck" sets,
and no external taxonomy of archetypes are used to judge coherence. Coherence is
defined as resemblance to the real decks in the corpus, measured with the same
inverse-document-frequency (IDF) similarity machinery the project already uses
for draft replay.

All existing opponent deck-card construction code is deleted and rewritten.

## Related Information

- `docs/cards2/` — sibling design docs for the card and draft systems; this
  document lives alongside them.
- `src/draft/replay/fit-model.ts` — the existing deck-fit scoring model. It
  learns a "how well does this candidate card fit this deck" score from the
  draft-records corpus using neighbor collaborative filtering, IDF-weighted
  co-occurrence, and a global play-rate prior. This module's scoring and
  similarity functions are the reusable core of both the new picker and the new
  validation harness.
- `src/draft/replay/draft-records.ts` — loader that turns the corpus files into
  decklists and pick sequences the fit model consumes.
- `docs/draft_records_adapted/` — the authoritative corpus: ~1,000 real
  eight-seat drafts, each seat carrying its final mainboard plus a full pick
  sequence (every pack the seat saw and the card it took). Cards are identified
  by UUID and resolve to the Dreamtides card database. This is the single source
  of truth for "what coherent decks look like." Per repo convention, all new
  draft work consumes only this directory.
- `scripts/draft-replay-experiment.mjs` (`npm run draft-replay-metric`) — the
  offline harness that tuned the fit model and reports recall@4 under
  leave-one-out. The new coherence harness is a sibling of this script and
  shares its corpus-loading and IDF approach.
- `src/affiliations/affiliation-weights.ts` — the existing affiliation
  reweighting system. Each dreamscape names an affiliation; this module measures a
  card's affinity to an affiliation's curated signature probe using the same IDF
  corpus machinery as the fit model, and turns those affinities into selection
  weights. It is the corpus-grounded basis for the affiliation steering and
  affiliation-fit scoring this design relies on.
- `src/battle/integration/opponent-deck.ts` — the module being deleted and
  rewritten. Its current behavior (generate a pool, then uniform-random sample)
  is the problem this document fixes.
- `src/battle/integration/create-battle-init.ts` — the battle bootstrap that
  calls opponent construction and consumes the resulting enemy deck. Its call
  into opponent construction is rewired; the surrounding battle contract is
  unchanged.
- `AGENTS.md` — repository conventions: identify cards by UUID, treat all TOML
  game-design data as subject to change (tests must not assert specific card
  data), and log enough that any algorithm's behavior can be reconstructed from
  `logs/journey-log.jsonl`.

## Terminology

For a reader new to this system:

- Run / journey. A single playthrough. It is a seven-layer journey; each layer
  is one Battle. The layer index is the completion level, numbered zero through
  six. Completion level zero is the opening Battle, six is the final boss. The
  run midpoint is the middle layer, after which opponents grow more dangerous.
- Dream Avatar. A playable identity, like a hero or commander, that both the
  player and each opponent have. Each Dream Avatar has a small set of signature
  cards that define its archetype and seed its deck.
- Dreamsign. A modifier card an opponent carries into Battle from the run
  midpoint onward; it makes later opponents harder.
- Dreamscape. The themed location a Battle takes place in. A dreamscape may be
  tied to an affiliation (a faction with a leaning toward certain cards) or be
  neutral (no affiliation). The worst current opponent decks appear in neutral
  dreamscapes because affiliation bias is today the only coherence lever.
- Affiliation probe and affiliation fit. Each affiliation carries a curated set
  of signature cards that act as a probe deck for its faction. A card's
  affiliation affinity is how strongly the real corpus decks that hold it cohere
  with that probe, computed with the same IDF similarity machinery as the fit
  model — so affiliation fit is corpus-grounded, not a separate hand-labeled tag.
  A deck's affiliation fit is the aggregate affinity of its cards to the target
  affiliation's probe. A deck can be internally coherent yet score low
  affiliation fit (a tight archetype belonging to the wrong faction), so the two
  are distinct axes that must both be satisfied in an affiliated dreamscape.
- Fit model. The existing scoring model in `src/draft/replay/fit-model.ts`. It
  learns, from the corpus, how well a candidate card fits a partially built deck.
  It works in inverse-document-frequency (IDF) space, where each card is weighted
  by how distinctive it is across decks, and a deck is a vector; cosine
  similarity between deck vectors measures how alike two decks are. Its score
  blends three corpus-derived signals: a vote from the most similar real decks,
  the pairwise tendency of cards to co-occur, and a small global play-rate
  fallback. Its quality is measured by recall@4 — how often the model's top four
  cards include the card a human actually took — under leave-one-out testing.
- Build-around payoff, enabler, orphan. A payoff is a card that rewards having
  many of some other kind of card (for example, a card that rewards playing
  warriors); its enablers are the cards it rewards. A payoff shipped without
  enough enablers is an orphan — the exact symptom this rewrite fixes.
- Power proxy. A corpus-grounded, label-free stand-in for deck strength used only
  to check that later opponents are not weaker than earlier ones. It is computed
  from quantities already available without external judgment — for example deck
  size after removals and mean candidate fit of the kept cards.
  It is a monotonicity check, not a balance model.

## Problem and Context

A run is a seven-layer journey; each layer hosts one Battle against an opponent
Dream Avatar. The opponent's deck is meant to grow stronger as the run advances.
Today the opponent deck is built like this: a themed card pool is generated for
the opponent Dream Avatar, then a progress-scaled number of distinct cards
(currently 14 early, up to 30 late) is drawn uniformly at random from that pool,
each card given one or two copies.

Uniform random sampling is the failure. The generated pool may be thematically
coherent across its ~110 cards, but drawing roughly a tenth of it at random
destroys any theme. Payoff cards land without their enablers. A real production
trace showed an opening-battle deck with two "warriors matter" payoffs and only
three warriors total, sitting next to an unrelated survivors package and a
scattering of unconnected cards. The only coherence lever in the current builder
is an affiliation bias, and it does nothing in neutral dreamscapes — which is
exactly where the worst decks appear.

The project already solved the adjacent problem for the player. The draft replay
feature shows the player, at each pick, the cards from a fixed real pack that
best fit the deck drafted so far. That fit is learned from the corpus and scores
recall@4 around 80% — meaning the model usually ranks the card a human actually
took inside the top four. The opponent builder should make picks the same way
the replay ranks them, instead of rolling dice.

The term "coherence" throughout this document means: the degree to which a deck
resembles the real decks people actually drafted in the corpus. A coherent deck
is one whose cards co-occur in real decks, and whose overall shape is close to
the nearest real decks. This is a corpus-relative definition and requires no
external judgment about what archetypes exist or which cards are "good."

## Goals

- Replace random opponent card selection with coherence-driven selection learned
  from the `docs/draft_records_adapted/` corpus.
- Preserve the "simulate a series of draft picks for the opponent Dream Avatar"
  model as the construction frame.
- Make opponent decks visibly coherent: payoff cards arrive with a meaningful
  number of their enablers, and the deck reads as a real archetype rather than a
  grab bag.
- Scale opponent strength across the run by varying the pick budget and the
  number of post-draft card removals, emulating the player's own power curve.
- Provide a programmatic validation harness that quantifies deck coherence using
  corpus similarity alone, with no external labeling, and that demonstrates the
  new decks are far more coherent than the old random decks and close to real
  corpus decks.
- Keep construction fully deterministic in its seed, Dream Avatar, and completion
  level, and log enough to reconstruct both the pick sequence and the resulting
  coherence from `logs/journey-log.jsonl`.
- Keep opponent Dream Avatar identity meaningful: an opponent's deck should reflect
  that Dream Avatar's signature cards.
- In an affiliated dreamscape, the opponent deck must visibly belong to that
  affiliation: it must score high affiliation fit against the dreamscape's
  affiliation probe while remaining internally coherent. Affiliation fit is a
  primary objective of construction in affiliated dreamscapes, not an
  after-the-fact nudge. In a neutral dreamscape there is no affiliation target and
  construction optimizes coherence alone.

## Constraints and Requirements

- Cards are identified by UUID or card number everywhere in logic and logs;
  names are labels only.
- The corpus is the only source of coherence signal. No archetype tag lists, no
  hand-labeled deck quality, no per-card "theme" metadata from TOML may be used
  to judge or drive coherence. Card data may still be read for mechanical facts
  (energy cost, subtype, copies legality), but coherence comes from the corpus.
- All TOML game-design data is subject to change. Tests and validation thresholds
  must not hardcode specific card identities, specific archetype names, or
  assume a fixed corpus size. Derive fixtures and bounds from the live corpus and
  card database at run time.
- Construction must be deterministic: identical seed, opponent Dream Avatar, and
  completion level must always produce the identical deck.
- Construction must be reasonably cheap per battle. The fit model is expensive to
  build but pure; it must be built once and reused across battles rather than
  rebuilt per construction.
- The battle bootstrap contract is unchanged. Opponent construction must still
  return an enemy deck definition of the shape `create-battle-init` already
  consumes, and a usable fallback deck must still exist for the AI-self-play mode
  and for the case where the corpus or fit model is unavailable.
- Difficulty must be monotonically non-decreasing in completion level for both a
  power proxy and the coherence metric: a later opponent is never weaker or less
  coherent than an earlier one under the same inputs.
- The opening-battle opponent (completion level zero) remains the gentlest, and
  the final-boss opponent (completion level six) remains the strongest.

## Proposed Design

### Construction frame: a simulated coherent draft

The opponent's deck is built by simulating a draft for the opponent Dream Avatar.
The simulation runs a fixed number of picks. At each pick it is shown a pack of
candidate cards and selects one. The selection is driven by deck fit, not chance:
the chosen card is the one that best fits the cards already drafted, as scored by
the corpus-trained fit model, with a small, seeded amount of exploration so that
different seeds yield different but still coherent decks.

The deck is seeded before the first pick with the opponent Dream Avatar's
signature cards. The fit model folds these into the deck representation exactly
like drafted cards, so they steer the very first picks toward that Dream Avatar's
archetype before the deck has otherwise defined itself. This is what ties
opponent identity to the resulting deck without reintroducing a separate themed
pool.

The card universe the simulation draws from is the set of cards that appear in
the corpus — the cards real decks are actually made of. Drawing from this
universe keeps construction inside the space of cards the fit model understands
and naturally excludes cards that never see real play. A Dream Avatar's signature
cards are always allowed to seed and to be picked even if a signature card does
not itself appear in the corpus; such a card simply carries no learned fit
signal of its own and steers the deck only through the corpus cards that
co-occur with the rest of the archetype.

Packs are assembled from the card universe for each pick. The implementation
chooses how packs are formed, subject to two requirements: a pack must contain
enough distinct, corpus-known candidates for fit scoring to discriminate among
them, and pack composition across a single simulated draft must not be biased
toward any particular archetype beyond what the corpus play-rate prior implies.
Reusing the real pack structures recorded in the corpus is an acceptable and
encouraged way to satisfy this, since those packs are exactly what produced the
real decks the model learned from.

### Selection: fit with seeded exploration

At each pick, every candidate in the pack is scored against the current deck
(picked cards plus signature seeds) using the existing fit scoring. Pure
greedy selection — always take the single highest-fit card — would make every
deck for a given Dream Avatar nearly identical and would overfit to the most
popular staples. Instead, selection samples among the top-fitting candidates
using a seeded, temperature-controlled weighting: higher-fit cards are much more
likely to be taken, but the pick is not deterministic given the pack. The
temperature is a tuning knob; lower temperature yields tighter, more typical
decks, higher temperature yields more variety at some cost to coherence. The
seed makes the whole sequence reproducible.

The exploration temperature is also a difficulty lever. Stronger opponents draft
closer to greedy (lower temperature, tighter decks); weaker opponents draft with
more exploration (looser decks). This gives a second, smooth strength dial
beyond raw deck size. The two roles of temperature do not conflict: per-seed
variety is the goal at a fixed completion level (different seeds, same strength,
different decks), while the temperature floor is set by completion level. Even
the loosest early opponent must clear the coherence bar, so the early-game
temperature is chosen high enough for variety but low enough that coherence stays
above the random baseline. Monotonicity in completion level is a property of the
derived curves, verified over the generated population by the harness rather than
asserted per individual seed.

### Difficulty: pick budget and removals

Opponent strength scales with completion level by emulating the player's power
curve rather than inventing a separate one. Two levers move together:

- Pick budget. The number of simulated picks grows with completion level, so
  later opponents draft larger card pools to build from. This mirrors the player
  accumulating more cards as the run progresses.
- Card removals. After the draft, the opponent prunes the least-coherent cards
  from its drafted pool — the cards with the lowest fit against the rest of the
  deck. Removal count grows with completion level. This mirrors the player
  purging weak cards and has a double benefit: it raises both power and coherence
  at once, because the cards cut are precisely the off-theme orphans that make a
  deck feel random. The final deck size is the pick budget minus removals.

The deck is a singleton set: each kept card appears exactly once, with no
duplicate copies, matching how a drafted player deck reads. When the drafted
distinct count is below the battle deck minimum the deck is topped up with
distinct draftable cards rather than repeats, so it stays free of duplicates.

The pick-budget and removal curves should be derived from the player's own
progression constants at the equivalent point in the run, so opponent and player
strength stay in lockstep if those constants change. The exact curve shape is an
implementation choice within the monotonicity constraint. The recommendation is
to express opponent strength at completion level L as the player's expected deck
state after L equivalent battles' worth of picks and removals, then apply the
exploration-temperature dial on top for fine adjustment.

### Affiliation fit: choosing a starting point that belongs to the dreamscape

In an affiliated dreamscape the opponent deck must genuinely belong to that
affiliation, not merely lean toward it. Affiliation fit is therefore a primary
construction objective there, pursued by two cooperating mechanisms: steering the
draft's starting point toward the affiliation, and selecting among several
candidate drafts the one that best matches the target.

Steering the starting point. The deck's seed is widened beyond the Dream Avatar's
signature cards to include the dreamscape affiliation's signature probe cards, so
the very first picks are pulled toward the affiliation before the deck has
otherwise defined itself. Pack composition for the simulated draft may
additionally be biased toward affiliated cards using the existing affiliation
affinity weights, so affiliated candidates appear more often without any card
being excluded. Because both the seed and the bias are expressed through the same
corpus-grounded affinity the fit model already understands, steering raises
affiliation fit and coherence together rather than trading one for the other.

Best-of-N draft selection. Steering biases the outcome but does not guarantee it,
because the draft is stochastic. Construction therefore runs several independent
seeded drafts for the battle and keeps the one that best satisfies a combined
objective: high coherence and high affiliation fit against the dreamscape's
affiliation probe. The number of candidate drafts and the relative weight of the
two terms are tuning knobs. This is the mechanism that makes affiliation fit
reliable — a single unlucky draft that wanders off-faction is discarded in favor
of one that lands on the affiliation, while coherence keeps the winner from being
a pile of high-affinity but unsynergistic cards. The whole best-of-N process is
seeded from the battle seed, so it stays deterministic.

Neutral dreamscapes. When the dreamscape has no affiliation, the seed is the
Dream Avatar signatures alone, pack composition is unbiased, and best-of-N
optimizes coherence only. The deck is still coherent because fit selection never
depended on affiliation. This is the case that produces the worst decks today,
and it is fixed by fit selection independently of any affiliation work.

### Determinism and reconstruction logging

Construction is a pure function of the battle seed, the opponent Dream Avatar, and
the completion level. The same inputs always produce the same pick sequence,
removals, and final deck.

The `opponent_deck_constructed` log event is retained and enriched so a deck's
construction and its measured coherence can be reconstructed from
`logs/journey-log.jsonl` filtered by game. In addition to the existing fields
(opponent Dream Avatar, completion level, layer count, deck size, top
card numbers), the event records: the target affiliation, if any; the number of
candidate drafts run and the index of the winning draft; the winning deck's
coherence score and affiliation fit, and the same two scores for the runners-up
so the selection can be second-guessed; the pick budget and removal count used;
the per-pick trace of the winning draft's pack candidates, chosen card, and that
card's fit score and rank within the pack; the cards removed in the post-draft
prune and why; and the final coherence score of the deck under the validation
metric. This closes the
current gap where only the random output, not the decision process, was logged.

### Deletion and rewrite scope

All current opponent deck-card selection logic is removed: the pool generation
for opponent construction, the uniform-random weighted sampler, the
affiliation-only bias path as the sole coherence mechanism, and the associated
copy/distinct-count scaling that fed the random sampler. The new module is
written from scratch around the simulated coherent draft.

Opponent Dream Avatar selection and opponent dreamsign selection are conceptually
adjacent and may be re-implemented cleanly, but their externally observed
behavior is preserved: an opponent is still chosen deterministically per battle,
the player's own Dream Avatar is still excluded when an alternative exists, and a
single dreamsign is still carried from the run midpoint onward. The fallback deck
used for AI self-play mode and for missing-corpus situations is preserved.

## Critical Interfaces or API Surfaces

- Opponent construction entry point. A single function builds the opponent deck
  given the opponent Dream Avatar, the completion level, the run layer count, the
  battle seed, the resolved fit model, the card universe, and the target
  affiliation context (null in a neutral dreamscape). It runs best-of-N drafts
  internally and returns the winning deck's chosen distinct cards (the singleton
  deck) and a construction trace (the candidate-draft
  scores, the winning pick sequence, removals, coherence score, and affiliation
  fit) for logging. It returns a null/empty result only when no usable corpus
  or fit model is available, so the caller applies the existing fallback deck.
- Fit model provision. The fit model is built once from the corpus and shared.
  The battle bootstrap obtains the shared model (building or reusing a cached
  instance) and passes it into opponent construction. Construction never rebuilds
  the model itself.
- Battle bootstrap contract. `create-battle-init` continues to receive an enemy
  deck definition of its current shape and continues to log opponent
  construction via the existing logging seam. Only the body of construction
  changes; the inputs it already supplies (pool/corpus context, card database,
  affiliation, completion level, layer count, derived enemy seed) remain the
  inputs, with the themed-pool dependency replaced by the corpus/fit-model
  dependency.
- Coherence scorer. A pure function scores a single deck's coherence against the
  corpus and returns both an aggregate score and its components (nearest-neighbor
  similarity, mean pairwise co-occurrence, self-consistency). It is shared by the
  construction trace logging and the validation harness so both report the same
  number.

## Validation: measuring coherence from the corpus alone

Validation is a core deliverable, not an afterthought. It must demonstrate that
generated opponent decks are internally coherent, using only the corpus as
ground truth.

### Coherence metric

A deck's coherence is an aggregate of corpus-relative signals, each computed with
the same IDF machinery the fit model already uses:

- Nearest-neighbor similarity. Represent the deck as an IDF vector and measure
  its mean cosine similarity to its K most similar real corpus decks. A coherent
  deck looks like real decks; a random pile does not. This is the primary signal.
- Mean pairwise co-occurrence. Average the corpus co-occurrence strength across
  the deck's card pairs. Coherent decks are built from cards that real decks ran
  together; random decks pair cards that rarely co-occur.
- Self-consistency (held-out fit). For each card in the deck, remove it and ask
  the fit model to rank it against a set of distractor cards given the rest of
  the deck. A coherent deck is one whose own cards the model would re-pick. This
  reuses the recall-style measurement the replay harness already performs, turned
  inward on a generated deck.

These combine into a single coherence score per deck, with the components
retained for diagnosis. The exact aggregation weights are tuning, chosen so the
score cleanly separates real corpus decks from random decks.

### Baselines and acceptance

The harness generates many opponent decks across seeds and across all completion
levels, scores each, and compares the distribution against four reference
populations scored the same way:

- Real corpus decks — the upper bound. Generated decks should approach this.
- The old uniform-random construction — the regression baseline the new system
  must clearly beat.
- Size-matched random decks drawn from the card universe — the floor.
- Decks drafted greedily with zero exploration — a coherence ceiling for the new
  picker, used to confirm exploration trades coherence gracefully rather than
  collapsing it.

Acceptance criteria, all measured by the harness with no external labels:

- Generated decks score far above the random floor and the old random
  construction on every component and on the aggregate.
- Generated decks score close to real corpus decks — within a tuned margin — and
  the gap to greedy decks reflects only the intended exploration.
- The build-around orphan rate — payoff cards present without a sufficient count
  of the cards they reward, where "reward relationship" is inferred from corpus
  co-occurrence rather than from card text taxonomy — is dramatically lower than
  under the old construction. This is the direct, human-legible expression of the
  bug being fixed.
- Coherence and a power proxy are both monotonically non-decreasing in completion
  level across the generated population.
- Decks generated for an affiliated dreamscape score high affiliation fit against
  that dreamscape's affiliation probe — clearly above the affiliation fit of decks
  generated for a neutral dreamscape or for a different affiliation — while their
  coherence stays in the same range as neutral decks. This confirms affiliation
  fit was achieved without sacrificing coherence. The harness measures affiliation
  fit across every affiliation and reports the per-affiliation distribution.

The harness is runnable from the repository root as a project script, prints the
distributions and the pass/fail of each criterion, and is deterministic given a
fixed set of seeds so its output is stable across runs. It must not fail when
TOML data or the corpus changes; it derives all thresholds and fixtures from the
live corpus and recomputes baselines each run, comparing populations rather than
asserting absolute card identities or fixed numbers.

### Tuning loop

The exploration temperature, the aggregation weights of the coherence metric,
and the pick-budget and removal curves are tuned against this harness. Tuning is
a corpus-only optimization: maximize generated-deck coherence toward the
real-corpus reference while preserving the intended difficulty spread and
per-seed variety. Tuned values are committed as defaults with a comment pointing
at the harness, exactly as the fit model's defaults already point at the
draft-replay experiment.

## Alternatives Considered

- Keep the themed pool but sample by fit instead of uniformly. Rejected as the
  primary design because it preserves two coherence systems (pool theming and
  fit) that can disagree, and the pool theming is not corpus-grounded. Folding
  Dream Avatar identity into signature seeds on top of corpus-fit selection is
  simpler and keeps a single coherence source.
- Hit affiliation fit with steering alone (seed and pack bias) and no best-of-N
  selection. Rejected as insufficient: steering shifts the distribution but a
  single stochastic draft can still land off-faction, so affiliation fit would be
  unreliable. Running several drafts and keeping the best-matching one is what
  makes affiliation membership dependable while keeping coherence as a guard.
- Force affiliation purity by restricting the card universe to high-affinity
  cards. Rejected: it would starve the draft of the connective and generically
  useful cards real faction decks run, hurting coherence, and it reintroduces a
  hard exclusion rather than the corpus-grounded affinity the rest of the system
  uses.
- Replay a real human draft seat directly as the opponent deck. Rejected as the
  whole design because it cannot scale difficulty smoothly and ties every
  opponent to a fixed historical deck, but reusing the corpus's real pack
  structures as the pack source for the simulation is retained as an encouraged
  option.
- Rank by global card power or play-rate prior alone. Rejected: this rebuilds the
  "popular staples, no synergy" failure in a new form. The prior is kept only as
  the small pick-one fallback the fit model already uses.
- Hand-label archetypes and enforce archetype purity. Rejected explicitly: the
  user requirement is that coherence be measured and driven from corpus
  similarity alone, with no external labeling.

## Migration and Compatibility Requirements

- The old opponent deck-card construction module and its tests are deleted, not
  deprecated. New tests cover the new construction and the coherence harness, and
  they follow the repo rule of deriving fixtures from live data rather than
  asserting specific cards.
- The `opponent_deck_constructed` event name is retained for log continuity; its
  schema grows new fields. Older log lines lacking the new fields remain readable.
  The log-analysis reconstruction workflow is updated as part of this work to read
  the new pick trace, removals, and coherence score when present and to treat
  their absence as an old-construction line.
- The battle bootstrap and the multiplayer ensure-battle path keep their current
  logging seam (inline log versus deferred log gated on the committed init), so
  the rewrite does not change when or how often the event is emitted.
- The fallback deck path is preserved so AI self-play mode and corpus-unavailable
  situations behave as they do today.
- Determinism of the enemy deck given the derived enemy seed is preserved, so any
  existing reproducibility expectations in battle tests still hold under the new
  builder.

## Operational Considerations

- Model build cost. Building the fit model scans the full corpus and computes a
  co-occurrence lookup; it is the expensive step. It must be built once and
  cached for reuse across battles within a session. Because it is pure, the cache
  is safe. The validation harness builds it once per run.
- Per-battle cost. Each construction runs best-of-N drafts, so its cost is N
  times a single draft: a few dozen pick scorings plus a removal pass per
  candidate, all against a cached model. N is small and the model is cached, so
  this stays inexpensive; keep N no larger than affiliation fit reliability
  requires. The construction trace adds log volume; record full per-pick detail
  only for the winning draft and just the summary scores for the runners-up, and
  keep the trace compact (card numbers and scores, not full card data).
- Corpus drift. As the corpus grows or is re-adapted, coherence baselines shift.
  The harness recomputes baselines each run so it remains valid; committed tuning
  defaults should be re-checked when the corpus changes materially.
- Observability. The enriched `opponent_deck_constructed` event is the primary
  debugging surface; the log-analysis workflow that reconstructs a battle's
  opponent reads the pick trace, removals, and coherence score directly rather
  than re-running construction.

## Manual QA

Set up: run the local dev server on a non-default port so it does not collide
with a developer's own server, and boot directly into battles. Use the battle
QA entry that starts a run and lets you advance through layers, capturing the
game token so the constructed decks can be cross-referenced in
`logs/journey-log.jsonl`.

Primary flow — early battle coherence. Enter the opening Battle (completion level
zero) in a neutral dreamscape — the exact configuration that produced the
original incoherent deck. Inspect the opponent deck through the battle inspector.
Confirm the deck reads as a recognizable archetype: payoff cards have a
meaningful count of the cards they reward, and there is no scattering of
unconnected single cards. Pull the game's `opponent_deck_constructed` log line
and confirm it carries the pick trace, the removal list, and a coherence score,
and that the coherence score is well above the random baseline reported by the
harness.

Difficulty progression. Play or fast-forward through successive layers and
inspect each opponent. Confirm later opponents have larger, denser decks, draft
closer to greedy, and carry a dreamsign from the run midpoint onward. Confirm via
the logs that pick budget and removal count increase with completion level and
that the coherence score does not decrease as the run advances.

Determinism. Re-enter the same battle with the same seed and confirm the
opponent deck, pick trace, and removals are identical. Change the seed and
confirm the deck changes but remains coherent.

Affiliation behavior. Enter a battle in an affiliated dreamscape and confirm the
deck visibly belongs to that affiliation — its cards read as that faction — while
remaining coherent. Pull the `opponent_deck_constructed` log line and confirm it
records the target affiliation, the number of candidate drafts run, which one
won, and the winning deck's affiliation fit and coherence alongside the
runners-up scores; confirm the winner has the highest combined score. Visit
battles in two different affiliated dreamscapes and confirm their decks lean to
different factions. Enter a neutral dreamscape and confirm the deck is still
coherent with no affiliation target applied.

Fallback paths. Run an AI self-play battle and confirm the fallback deck is used
and the battle is playable. Simulate an unavailable corpus or fit model and
confirm construction returns the fallback rather than erroring.

Validation harness. Run the coherence validation script from the repository root
and confirm it prints the coherence distributions for generated decks, real
corpus decks, the old random construction, size-matched random decks, and greedy
decks, and that every acceptance criterion passes: generated decks far above the
random and old baselines, close to the corpus reference, a sharply reduced
build-around orphan rate, and monotonic coherence and power across completion
levels. Confirm the script is deterministic across repeated runs and does not
fail when card TOML data is edited.

Core checks. From the repository root run the lint, typecheck, and test suites
and confirm they pass, including the new construction and harness tests.
