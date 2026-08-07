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

## Augury

Augury is hosted by Aldric, the Seer. On entry, Aldric appears with two circular
Offer Tiles. Each is a symbolic summary of one reward: card or Dreamsign art, an
operation mark, or a site glyph identifies the kind of change. Activating a tile
opens its full details. A direct offer can then be confirmed; an offer with
several candidates first requires a choice. The player can return to the
two-tile comparison before confirming. When the encounter permits it, the player
may decline both visions and complete the site without a reward.

Augury's possible rewards are grouped into six **offer families**:

- **Grant:** Gain a fitted or strong card, draft from a short list or category,
  receive several copies, gain a coherent bundle, or draft a transfigured card.
- **Improve:** Transfigure one useful card instance or a small set of eligible
  starter cards.
- **Remove:** Purge a starter or poorly fitting card instance.
- **Duplicate:** Choose among high-value non-starter card instances and copy
  one.
- **Dreamsign:** Gain an unowned Dreamsign selected for the current deck.
- **Site:** Add one eligible utility site to the current dreamscape.

### How the two visions are prepared

Augury builds each vision from two separate rules:

- The **offer archetype** says what the reward does, such as “purge a card,”
  “gain a Dreamsign,” or “draft a transfigured card.” It also defines the offer
  family, eligibility requirements, lottery weight, and reward quantity.
- The **selection policy** says how that reward chooses its concrete target from
  the legal candidates. It might choose one card automatically or prepare a
  short list for the player.

For example, suppose Augury prepares a Purge vision:

1. The weighted archetype lottery chooses **Purge** from the eligible recipes.
2. The effect establishes the legal targets: card instances that may be removed
   from the current deck.
3. The **purge misfit** policy favors starter cards and cards whose removal does
   the least damage to the deck's relationships.
4. The policy chooses one of its leading candidates. The Offer Tile can now say
   exactly which card Augury proposes to remove.
5. If the player accepts, the purge effect removes that prepared card instance.

The effect and policy answer different questions: **Purge** says what will
happen; **purge misfit** decides which card the offer targets.

The first vision draws from every eligible archetype. The second draws after
excluding the first vision's entire offer family. The two tiles therefore
present different kinds of reward. If an archetype cannot produce a complete
offer, Augury tries another recipe for that slot.

Grant candidates normally exclude starter, special, and already-owned cards.
Category drafts also remain within the journey's resolved draft pool.
Deck-changing offers use concrete card instances so an improvement, purge, or
duplication applies to the copy that was evaluated.

### Accepting a vision

When the player confirms a vision, the game checks that the prepared offer and
any required choice are still valid. It then applies the reward, completes the
site, and returns the player to the dreamscape.

## Exploration

Exploration draws an eligible card from the player's deck. That card determines
the authored encounter and supplies both the framed card shown on arrival and
the full art used inside the scene. Drawing the card for Exploration does not
remove it from the deck or change it; an action must explicitly do so.

### Encounter structure

Each eligible card has an authored **Exploration encounter** containing:

- One prose passage inspired by the card's art.
- Exactly two actions for the player to choose between.

Each action defines:

- A player-facing label and concise effect text.
- The effect that occurs when chosen.
- Any quantities, eligible targets, or fixed game objects required by that
  effect.

An action may resolve immediately or ask the player to choose something else,
such as:

- One or more cards from the deck or card catalog.
- A card pack, transfiguration, or Character subtype.
- A Dreamsign to gain, replace, or give up.
- A new Dream Avatar.

Exploration prepares both actions before showing the encounter. If either action
cannot be fulfilled, it draws another eligible encounter card. The two actions
presented to the player are therefore usable in the current journey.

Prepared card rewards normally come from unowned, non-special cards in the
resolved draft pool. Prepared deck targets refer to specific card instances.
Fixed authored cards and Dreamsigns must still be available when the encounter
is prepared.

### Entering the scene

"Layaway" presents the drawn card beside the site's dialogue. The card travels
from the journey deck, turns face up, and waits for the player to Delve. Delving
breaks the frame open and expands the full art across the viewport. The
encounter prose appears over the scene, followed by its two actions. The player
may collapse the scene and inspect the card again before choosing.

### Choosing an action

An action without a follow-up resolves directly. Otherwise, the scene opens a
focused picker and waits for the required choice. Cards, Dreamsigns, and Dream
Avatars shown by an action remain inspectable before confirmation.

Exploration effects fall into several groups:

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

### Leaving the scene

After the choice, Exploration presents the result. Cards and Dreamsigns travel
toward their journey destinations, while purges, copies, transfigurations,
Essence gains, deck-wide changes, Dream Avatar changes, and future modifiers use
outcome-specific choreography. The full art then collapses into the drawn card,
the card returns to the deck, and the player returns to the dreamscape.

## Selection policy reference

A **selection policy** is an algorithm for picking the card or other game object
to use for a given effect. The effect says what happens; its policy determines
which legal target or targets it uses.

Policies are separate from effects so a shared effect can support different
offer designs. “Gain a card,” for example, can mean:

- Gain one particular authored card.
- Gain a card fitted to the current deck.
- Gain a card chosen for both deck fit and general strength.
- Gain a bundle of cards chosen to work together.

In current authored content, an effect or Augury archetype normally determines
the appropriate policy. The player does not choose a policy, and designers do
not combine them freely. The separation lets several rewards reuse the same
target-selection algorithms; it is not a separate player-facing rule.

Other effect-specific policies choose a weak card to purge, a valuable card to
duplicate, a central card to transfigure, a matching Dreamsign, or a random
eligible utility site. Authored targets and choices that need no scoring use
fixed or uniform selection.
