# The Augury and Exploration Sites

Augury and Exploration are one-use Dream Sites that turn the current journey
into a persistent reward or modification. **Augury** presents two generated
visions chosen for the player's current deck and inventory. **Exploration**
opens one authored scene built around a card's art, then asks the player to
choose between two actions. Both sites may add or remove cards, change
particular
[card instances](../dreamtides/dreamtides.md#card-definitions-and-instances),
grant [Dreamsigns](../dreamtides/dreamtides.md#dream-avatars-and-dreamsigns), or
create effects for a later site or battle.

The sites share one reward-selection system, but use it differently. Augury
assembles its offers from reusable reward families. Exploration starts from
authored prose and actions, then uses the same policies to prepare any cards,
Dreamsigns, deck entries, Dream Avatars, or site types those actions need. Both
sites prepare random results before the player chooses. Acceptance validates the
prepared result, applies one outcome atomically, and records enough identity to
reconstruct what happened.

## Preparing a reward

Reward preparation begins from a snapshot of the journey at site entry. The
snapshot includes the journey seed, site identity, effective deck, owned and
available Dreamsigns, resolved draft pool, Dream Avatar, and relevant authored
content. Selection uses card UUIDs and concrete deck-entry IDs; names are
display text only.

A **selection policy** defines how one mechanic ranks and samples its legal
candidates. The principal policies consider:

- Card fit: how well a card works with the effective current deck.
- Card quality: an authored, deck-independent strength signal, sometimes blended
  with normalized fit.
- Deck-entry centrality: how strongly one card instance contributes to the
  deck's existing relationships.
- Purge or duplicate value: the benefit of removing or copying a particular
  entry, including the resulting change in deck fit.
- Transfiguration value: the benefit of an applicable form combined with the
  target card's centrality.
- Dreamsign match: the relationship between an unowned Dreamsign's authored
  features and the effective deck.
- Fixed or uniform selection for authored targets and choices that need no
  scoring.

A scored policy ranks candidates by score, breaks ties by stable identity, keeps
a configured top band, and samples uniformly from that band without replacement.
The standard band contains the larger of one quarter of the legal pool or five
candidates, capped by the pool size; individual mechanics may use a narrower or
wider band. Bundle selection instead chooses a seed card, then grows the bundle
from cards that relate well to the seed, the growing bundle, and the player's
deck.

Each selection receives an independent deterministic stream derived from the
journey seed, site identity, stable selection key, policy, and draw purpose.
Preparing one action therefore does not consume randomness belonging to another.
The prepared result records its rules version, content revision, candidate
digest, scores, band, selected identities, fallbacks, and draw count. These
traces make a production choice reconstructible even when several fit or
fallback rules contributed to it.

## Augury

Augury is hosted by Aldric, the Seer. On entry, Aldric appears with two circular
Offer Tiles. Each is a symbolic summary of one reward: card or Dreamsign art, an
operation mark, or a site glyph identifies the kind of change. Activating a tile
opens its full details. A direct offer can then be confirmed; an offer with
several candidates first requires a choice. The player can return to the
two-tile comparison before confirming. When the encounter permits it, the player
may decline both visions and complete the site without a reward.

An **offer archetype** is a reusable recipe with an eligibility rule, reward
family, lottery weight, target-selection policy, and reward parameters. Authored
configuration enables or disables each archetype. Only enabled archetypes with
legal targets enter the lottery. If a recipe cannot finish building a reward,
Augury removes it from that slot's pool and draws again.

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

The first offer is a weighted draw from all eligible archetypes. The second is a
separate weighted draw after excluding the first offer's family. The player
therefore compares two different kinds of reward even when one family contains
many archetypes. Grant candidates normally exclude starter, special, and
already-owned cards; category drafts also stay within the journey's resolved
draft pool. Deck-changing offers use concrete card instances so an improvement,
purge, or duplication applies to the copy that was evaluated.

The prepared encounter has a signature derived from the journey snapshot and the
two visible offers. Confirmation names the encounter, offer, archetype, and any
nested choice. The game rejects a stale signature, mismatched offer, absent
choice, or illegal target. A valid payload applies as one reward. Composite
rewards either apply in full or leave the journey unchanged. The site then
completes and the player returns to the dreamscape.

## Exploration encounters

An **Exploration encounter** is an authored scene keyed by a source card UUID.
The source card supplies the framed card shown on arrival and the full art used
inside the scene. It owns one prose passage and exactly two authored actions.
The card is a narrative and visual anchor: it need not be in the player's deck,
and entering its scene does not itself acquire, remove, or modify that card.

Each action has a stable ID, label, concise effect text, effect kind, and the
parameters required by that mechanic. Its text may refer to a prepared card or
Dreamsign as an inspectable game object. An action may resolve immediately,
require a follow-up choice, or contain both a prepared target and a later
selection. Follow-ups can choose card instances, catalog cards, packs, a
transfiguration, a subtype, a Dreamsign to gain or replace, or a Dream Avatar.

At site entry, Exploration deterministically shuffles the valid encounter
catalog. It tries encounters in that order while preparing both actions. An
encounter is used only when its source card exists and both actions can prepare
their required offers. If a draft lacks enough eligible cards, a Dreamsign
cannot be granted, or another target is unavailable, Exploration tries the next
encounter. The presented pair is therefore fully actionable.

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

The persisted resolution records the action and player selection, every card or
Dreamsign gained or purged, affected deck-entry IDs, Essence gained, chosen
transfiguration or subtype, and any future-site or next-battle modifier. A
purged card keeps its pre-resolution deck-entry snapshot so the outcome can show
exactly what left the deck. New copies receive new entry IDs, while
modifications retain the targeted instance's identity.

The scene remains open after the state change while presenting the outcome.
Cards and Dreamsigns appear as tangible objects and travel toward their journey
destinations; purges, copies, transfigurations, Essence gains, deck-wide
changes, Dream Avatar changes, and future modifiers use choreography suited to
the recorded result. Presentation reads the persisted resolution instead of
running selection again, so a resumed journey reconstructs the same outcome.
Once the outcome presentation finishes, the full art collapses into the card,
the card returns toward the deck, the site completes, and the player returns to
the dreamscape.
