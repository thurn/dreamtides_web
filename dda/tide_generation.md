# How tides are generated

During a journey, **tides** are preconstructed multisets of cards that supply
the player's draft pool. A Dream Avatar does not point directly at one fixed
pool. It points at several tides with different roles, allowing later pool
construction to preserve the Avatar's identity while varying its emphasis from
one journey to another.

The committed Tide catalog is generated before a journey begins. Its generator
turns complete human draft records and authored Dream Avatar signatures into a
deterministic library of decklists, then records which decklists belong to each
Avatar. This essay explains that generation process. It stops at the catalog
boundary: choosing tides for a particular journey, shuffling their cards, and
dealing a draft pool are separate rules.

## The three kinds of tide

Every generated tide has one of three roles:

- A **signature tide** is the dense identity floor for one Dream Avatar. Its
  **seed cards**, the starting cards from which the tide grows, are all of that
  Avatar's signature cards that occur in the draft corpus.
- A **facet tide** is a smaller, directional variation grown from one signature
  card. Facets form a shared library, and an Avatar receives the facets most
  closely related to its signature.
- A **neutral tide** is a broad deck grown from a well-played card selected to
  be unlike the other neutral seeds. Neutral tides provide coverage outside an
  Avatar's closest themes.

The current recipe targets 110 card copies for each signature tide, 45 for each
facet tide, and 30 for each neutral tide. It creates at most 32 facet tides and
exactly 12 neutral tides when the corpus contains enough eligible seeds. These
are deck-construction targets rather than final invariants: curated additions
and removals occur after the statistical growth and may change a tide's size.

Cards have stable identities throughout the process. Names, subtypes, and rules
text accompany the final decklists for readers and presentation, but neither
card comparison nor membership depends on a name.

## Learning affinity from drafts

The generator begins with adapted records of human drafts. A usable draft seat
has a nonempty final deck and exactly 30 retained picks: the first ten picks
from each of the first three packs. Each pick supplies the offered cards, the
chosen cards, and the set of distinct cards chosen earlier by that player.
Repeated copies within any one of those sets count once for the affinity
observation.

The resulting **card affinity** measures whether players choose one card more
often after they have already chosen another. It deliberately measures the
increase over a card's ordinary popularity rather than raw co-occurrence.

For every card `c`, the generator first calculates its **prior selection rate**:

\[ p(c) = \frac{\text{number of offers in which } c \text{ was chosen}}
{\text{number of offers containing } c} \]

The prior distinguishes a true partnership from a card that players select
frequently in every context. A popular card can occur often after another card
without the earlier card providing useful evidence of a relationship.

The generator next considers each ordered pair of different cards `a` and `c`.
An observation belongs to that pair when `a` was already among the player's
earlier picks and `c` appeared in the current offer. The pair's support `s` is
the number of those observations, and `q(a,c)` is the fraction in which the
player chose `c`.

Pairs with fewer than three observations have no affinity. Every other pair
receives the following directed affinity:

\[ A(a,c) = \max\left(0, \frac{s}{s + 5}\left(q(a,c) - p(c)\right) \right) \]

The subtraction keeps only the increase over `c`'s ordinary selection rate. The
support factor shrinks small samples toward zero, with five observations as the
shrinkage constant. Negative and zero increases are discarded. Affinity is
directed because choosing `c` after `a` and choosing `a` after `c` are different
observations.

All retained picks contribute with equal weight. A card joins the corpus only if
it was chosen at least once, although offers of unchosen cards still contribute
to priors and conditional rates for cards that do join it.

## Growing one tide

Signature, facet, and neutral tides use the same greedy growth rule after their
seed cards have been chosen. The rule answers which card copy best extends the
coherence of the current partial deck.

Each distinct seed enters the tide with one copy. The generator then adds one
copy at a time until the tide reaches its target size or no eligible card has a
positive score. The statistical grow allows at most two copies of a card.

For each candidate card, the next-copy score combines three quantities:

- **Seed affinity** is the candidate's strongest directed affinity from any
  seed. Each seed's affinity row is normalized so its strongest partner has
  value one before the maximum is taken.
- **Pool affinity** is the candidate's accumulated directed affinity from all
  distinct cards already in the tide, divided by the number of distinct cards.
  The resulting values are normalized so the strongest currently eligible
  candidate has value one.
- The candidate's prior selection rate rewards cards with evidence of being
  generally playable.

For the first copy of a candidate, the base score is

\[ \begin{aligned} B(c) ={}& 0.4 \times \text{seed affinity} \\ &+ 0.6 \times
\text{pool affinity} \\ &+ 0.1 \times \text{prior selection rate}. \end{aligned}
\]

A second copy receives 55 percent of that score. This penalty makes a strong new
partner compete favorably with duplicating a card already present, while still
allowing the most characteristic cards to reach two copies.

After the generator adds a new distinct card, that card's outgoing affinities
become part of the pool-affinity calculation for later choices. Adding a second
copy does not change that context because the relationship model is based on
distinct cards. This feedback lets a seed grow into a connected cluster rather
than merely collecting its individually strongest neighbors.

The highest marginal score wins each step. Exact ties prefer the candidate with
fewer copies already in the tide, then the lower stable card identifier. These
tie-breakers, and all ordering rules elsewhere in the bake, make the result
reproducible without sampling randomness.

## Choosing signature and facet seeds

For each Dream Avatar with signature cards represented in the corpus, the
generator creates one signature tide. All represented signature cards seed the
same growth to 110 copies. A signature card absent from the corpus cannot
contribute affinity and is omitted from the seeds. If none of an Avatar's
signature cards occur in the corpus, that Avatar receives no signature tide.

Facet tides must cover many Avatars without producing one deck for every
signature card. The generator therefore selects at most 32 distinct facet
anchors through a round-robin allocation:

1. Within each Avatar, represented signature cards are ordered by descending
   prior selection rate, then by stable card identifier.
2. Avatars are ordered by their stable identifiers.
3. In the first round, each Avatar contributes its highest-ranked signature
   card. In the second round, each contributes its next card, and so on.
4. A shared card already selected by another Avatar is skipped, and selection
   stops when the 32-anchor budget is full or every list is exhausted.

This allocation gives every Avatar's strongest represented signature cards a
chance to become facets before filling the budget with weaker anchors from any
one Avatar. Each selected anchor seeds one 45-copy facet tide.

## Spreading the neutral seeds

Neutral tides need breadth, so their seeds are selected for distance from one
another rather than proximity to an Avatar. Only cards whose prior selection
rate is at least 25 percent of the corpus's maximum prior are eligible. This
prevents a scarcely played card from becoming the center of a broad tide merely
because little is known about it.

For neutral selection, the relationship between two cards is the larger of the
two directed affinities. Their distance is one minus that relationship. The
first neutral seed is the eligible card with the highest prior selection rate.
Each later seed is chosen by farthest-point sampling:

1. For each eligible candidate, find its distance to the nearest seed already
   chosen.
2. Choose the candidate whose nearest seed is farthest away.
3. Break ties by higher prior selection rate, then lower stable card identifier.

This maximin rule spreads the 12 seeds across the observed draft environment.
Each seed then grows into a 30-copy neutral tide through the same greedy rule as
the other roles.

## Curating relationships the corpus cannot express

Pick affinity observes that cards travel together, but it does not understand
that two designed combo halves may be useful only as a pair. After every tide
has grown, a curated override layer adjusts these relationships. It has two
ordered forms.

A **combo pairing** names enabler cards, payoff cards, and a target number of
home tides. Every tide containing either half is a candidate home. Candidates
are ranked by these criteria, in order:

1. already containing at least one enabler and one payoff;
2. containing more distinct payoff cards;
3. containing more total payoff copies; and
4. having the lower stable tide identifier.

The highest-ranked candidates become the homes. A home missing an enabler gains
the pairing's primary enabler at the authored copy count. A home containing only
an enabler gains the first payoff. Every enabler and payoff is removed from
every non-home tide. Consequently, each surviving occurrence presents both sides
of the designed relationship rather than a single unusable half. If fewer
candidate tides exist than the requested number, every candidate becomes a home.

Specific per-tide additions and removals run after combo pairings and therefore
have the final word. Both override forms identify cards by stable identifier.
They alter the generated card lists without changing how the statistical corpus
or the three tide roles are constructed.

## Assigning tides to Dream Avatars

The catalog records a Tide menu for every Dream Avatar after curation. A menu
contains a starter tide, a ranked facet list, and a ranked neutral list.

For an Avatar with a signature tide, each candidate facet anchor receives a
signature-affinity score. The score is the largest affinity in either direction
between that anchor and any of the Avatar's represented signature cards. These
raw values are normalized against the strongest nonsignature card in the corpus.
An Avatar's own signature cards receive score one directly.

A facet qualifies when it uses one of the Avatar's own signature cards or its
normalized score is at least 0.15. Qualified facets are ordered by descending
score and then by tide identifier; the first eight form the Avatar's facet list.
If no facet qualifies, the first eight facets in the shared library form a
deterministic fallback. The Avatar's signature tide becomes its starter.

All neutral tides remain available to a signatured Avatar, but their order is
specific to that Avatar. The generator treats each tide as a vector of card-copy
counts and orders neutral tides by descending cosine similarity to the final,
curated signature tide. Stable tide identifier breaks an exact tie. Later pool
construction can therefore consume the most related broad decks before more
distant ones.

An Avatar without a usable signature receives a null starter, the complete facet
library, and the complete neutral library in their generated orders. The catalog
expresses the available material; the separate journey-time pool rules decide
how a particular run uses it.

## Stable identity and authored interpretation

Statistical generation determines the card memberships, copy counts, roles, and
Avatar menus. Human authors provide the interpretation that players see. Before
replacing the catalog, the generator carries these fields forward by stable tide
identifier:

- a short mechanical label;
- a thematic display name and short display description;
- a technical summary and longer description;
- one of five Tide colors; and
- checkable claims about the tide's dominant tribe and mechanics.

A first-time tide receives a deterministic color derived from its identifier; an
authored color replaces that default on later bakes. Claims are validated
against the resulting deck so an interpretation that has drifted away from the
cards can be rejected for review.

The generated catalog identifies signature tides by their Dream Avatar and facet
or neutral tides by their anchor card. Deck entries identify every card and copy
count. Current names, subtypes, and rules text are refreshed for human use, but
stable identifiers remain the authority.

The same inputs, tuning values, overrides, and carried annotations produce the
same catalog in the same order. Regeneration can therefore serve as a freshness
check: any unexplained difference in generated membership, copy counts, or
Avatar menus indicates that the committed catalog does not represent the current
recipe. This deterministic boundary is what lets journey-time Tide selection
introduce variety without making the definition of a Tide itself random.
