# The Augury and Exploration Sites

Augury and Exploration are Dream Sites built around consequential choices.
**Augury** presents two generated visions tailored to the current deck and
inventory. **Exploration** opens an authored scene built around a card's art,
then asks the player to choose between two actions.

Their rewards can:

- Add cards or
  [Dreamsigns](../dreamtides/dreamtides.md#dream-avatars-and-dreamsigns).
- Remove or modify specific
  [card instances](../dreamtides/dreamtides.md#card-definitions-and-instances).
- Change the deck as a whole.
- Create an effect for a later site or battle.

Both sites separate preparation from resolution:

- Entering the site prepares a deterministic encounter and its random targets.
- The player sees the prepared possibilities and makes one choice.
- Resolution validates that choice and applies the complete outcome atomically.
- The journey records the result so it can be reconstructed after resuming.

## How Augury builds its offers

Augury constructs each vision in two stages:

1. **Choose an offer archetype.** An offer archetype is a reusable recipe with
   an eligibility rule, reward family, lottery weight, selection policy, and
   reward parameters. Only enabled archetypes with legal targets enter the
   weighted lottery.
2. **Select the concrete targets.** The chosen archetype runs its selection
   policy to determine the particular card, deck entry, Dreamsign, or site in
   the offer. If the recipe cannot produce a complete reward, Augury removes it
   from that slot's pool and tries another archetype.

The first offer draws from all eligible archetypes. The second draws after
excluding the first offer's entire family. A completed Augury encounter
therefore contains two different kinds of reward, even when one family contains
many archetypes.

### Selection policies

A **selection policy** defines how one mechanic filters, ranks, and samples its
legal targets. Production uses several policies because “a good card to gain,”
“a good card to copy,” and “a good card to remove” are different questions:

- **Fixed** validates and uses a target named by authored content.
- **Uniform** samples equally from the legal candidates.
- **Card fit** favors cards that work with the effective current deck.
- **Card fit and quality** blends deck fit with an authored, deck-independent
  strength signal.
- **Card bundle** chooses a seed card, then adds cards that relate to the seed,
  the growing bundle, and the player's deck.
- **Purge misfit** favors starters and entries whose removal least harms deck
  fit.
- **Duplicate value** favors entries whose additional copy combines card quality
  with strong contribution to deck fit.
- **Deck-entry centrality** favors an instance that contributes strongly to the
  deck's relationships.
- **Transfiguration value** favors an applicable form with high mechanical
  benefit on a central card.
- **Dreamsign match** compares an unowned Dreamsign's authored features with the
  effective deck.
- **Site uniform** samples equally from the utility site types allowed for an
  add-site reward.

Augury assigns one of these policies to every offer archetype. Exploration uses
the same policy engine to select an encounter uniformly and to prepare any card,
deck entry, Dreamsign, Dream Avatar, or site required by an authored action. The
author still defines the scene, its two actions, and their effect kinds;
selection policy supplies only the variable targets required by those rules.

### Ranking and reproducibility

Reward preparation starts from a snapshot of the journey at site entry. It
includes the journey seed, site identity, effective deck, owned and available
Dreamsigns, resolved draft pool, Dream Avatar, and relevant authored content.
Selection uses card UUIDs and concrete deck-entry IDs; names are display text
only.

A scored policy:

- Ranks candidates by score and breaks ties by stable identity.
- Keeps a configured leading band of candidates.
- Samples uniformly from that band without replacement.

The standard band contains the larger of one quarter of the legal pool or five
candidates, capped by the pool size. Individual mechanics can use a narrower or
wider band. This keeps rewards responsive to the deck without always producing
the single highest score.

Each selection receives an independent deterministic stream derived from the
journey seed, site identity, selection key, policy, and draw purpose. Preparing
one action does not consume randomness belonging to another. Its trace records:

- Rules and content versions.
- Candidate count, digest, scores, and sampled band.
- Selected identities and any fallbacks.
- Randomness scope and draw count.

These records make a production choice reconstructible when several ranking or
fallback rules contributed to it.

## Presenting and resolving Augury

Augury is hosted by Aldric, the Seer. On entry, Aldric appears with two circular
Offer Tiles. Each is a symbolic summary of one reward: card or Dreamsign art, an
operation mark, or a site glyph identifies the kind of change. Activating a tile
opens its full details. A direct offer can then be confirmed; an offer with
several candidates first requires a choice. The player can return to the
two-tile comparison before confirming. When the encounter permits it, the player
may decline both visions and complete the site without a reward.

Every archetype belongs to one **offer family**:

- **Grant:** Gain a fitted or strong card, draft from a short list or category,
  receive several copies, gain a coherent bundle, or draft a transfigured card.
- **Improve:** Transfigure one useful card instance or a small set of eligible
  starter cards.
- **Remove:** Purge a starter or poorly fitting card instance.
- **Duplicate:** Choose among high-value non-starter card instances and copy
  one.
- **Dreamsign:** Gain an unowned Dreamsign selected for the current deck.
- **Site:** Add one eligible utility site to the current dreamscape.

Grant candidates normally exclude starter, special, and already-owned cards;
category drafts also stay within the journey's resolved draft pool.
Deck-changing offers use concrete card instances so an improvement, purge, or
duplication applies to the copy that was evaluated.

The prepared encounter has a signature derived from the journey snapshot and the
two visible offers. Confirmation names the encounter, offer, archetype, and any
nested choice. The game rejects a stale signature, mismatched offer, absent
choice, or illegal target. A valid payload applies as one reward. Composite
rewards either apply in full or leave the journey unchanged. The site then
completes and the player returns to the dreamscape.

## Exploration encounters

An **Exploration encounter** is an authored scene containing:

- A source card UUID.
- One prose passage.
- Exactly two authored actions.

The source card supplies the framed card shown on arrival and the full art used
inside the scene. It is a narrative and visual anchor: it need not be in the
player's deck, and entering its scene does not itself acquire, remove, or modify
that card.

Each action defines:

- A stable ID.
- A player-facing label and concise effect text.
- An effect kind.
- The quantities, predicates, fixed objects, or other parameters required by
  that effect.
- Any prepared card or Dreamsign that its text presents as an inspectable game
  object.

An action may resolve immediately, require a follow-up choice, or combine a
prepared target with a later player selection. A follow-up can ask for:

- One or more card instances or catalog cards.
- A card pack, transfiguration, or subtype.
- A Dreamsign to gain, replace, or give up.
- A new Dream Avatar.

At site entry, Exploration:

1. Filters the catalog to encounters whose source card exists.
2. Deterministically shuffles those encounters with the uniform policy.
3. Tries them in that order while preparing both actions.
4. Uses the first encounter for which both actions can produce their required
   offers.

If a draft lacks enough eligible cards, a Dreamsign cannot be granted, or
another target is unavailable, Exploration tries the next encounter. The
presented pair is therefore fully actionable.

Prepared card rewards normally draw from unowned, non-special cards in the
resolved draft pool and exclude the source card. Prepared deck targets use the
effective cards and their concrete entry IDs. Fixed authored card and Dreamsign
rewards still validate their UUIDs and current availability. Every prepared
choice is stored with the encounter so the same visible action cannot resolve to
a different hidden reward later.

## Entering and resolving the scene

"Layaway" presents the source card beside the site's dialogue. The card travels
from the journey-deck area, turns face up, and waits for the player to Delve.
Delving breaks the frame open and expands the full art across the viewport. The
encounter prose appears over the scene, followed by its two actions. The player
may collapse the scene and inspect the card again before choosing.

An action without a follow-up submits its prepared selection directly.
Otherwise, the scene opens a focused picker and remains unresolved until the
required identities are chosen. Card-instance pickers use entry IDs, catalog
choices use card UUIDs, and other game objects use their stable IDs. Resolution
checks those identities against the prepared offer and current eligibility.

Exploration effects fall into several gameplay groups:

- Card acquisition and exchange: gain or draft cards, choose a bundle, gain a
  pre-transfigured card, replace a card instance, or gain cards with Nightmares.
- Card-instance changes: purge, copy, purge and copy, transfigure, change a
  subtype, or exchange a card for Essence based on its Spark.
- Deck-wide changes: add Spark, make cards Fast, change Character subtypes,
  reduce costs while adding Nightmares, or purge duplicate definitions and grant
  Reclaim to the unique survivors.
- Inventory and economy: gain or exchange Dreamsigns, purge one for Essence, or
  gain Essence for matching cards in the deck.
- Future journey changes: add a site or transfigure cards in the next eligible
  draft or shop offer.
- Next-battle changes: adjust the next opening hand or starting Energy, or
  exchange one opening card for a one-Energy discount during that battle.
- Dream Avatar change: choose a new Dream Avatar from a prepared set while
  keeping the rest of the journey.

These groups are a mechanic vocabulary, not a fixed menu for every scene. Each
encounter chooses the two effects that fit its art and prose and supplies their
quantities, predicates, fixed objects, or subtype options.

## Atomic outcomes and departure

One Exploration action may resolve per visit. Resolution validates the action,
encounter signature, selection-rules version, and submitted identities before
calculating and applying the complete result. Multi-object gains, mass deck
changes, purge-and-copy exchanges, and effects with both benefits and Nightmares
cannot partially succeed.

The persisted resolution records:

- The action and player selection.
- Every card or Dreamsign gained or purged.
- Affected deck-entry IDs and any pre-resolution snapshot needed to show what
  left the deck.
- Essence gained and the chosen transfiguration or subtype.
- Any future-site or next-battle modifier.

New copies receive new entry IDs, while modifications retain the targeted
instance's identity.

The scene remains open after the state change while presenting the outcome.
Cards and Dreamsigns appear as tangible objects and travel toward their journey
destinations; purges, copies, transfigurations, Essence gains, deck-wide
changes, Dream Avatar changes, and future modifiers use choreography suited to
the recorded result. Presentation reads the persisted resolution instead of
running selection again, so a resumed journey reconstructs the same outcome.
Once the outcome presentation finishes, the full art collapses into the card,
the card returns toward the deck, the site completes, and the player returns to
the dreamscape.
