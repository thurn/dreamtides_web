# Dreamtides Quests: Master Design Document

This is the master design document for the Dreamtides "quests" system. Quests
are the meta layer in which the user navigates various encounters on a map
screen in order to improve their deck, while battles are individual card
matches. Quests are similar to "runs" in other roguelike deckbuilding games,
while battles are similar to "fights". Quests will be at least as complicated to
implement as battles, and almost every existing line of code for supporting
battles will require an equivalent for quests.

This document is the high level "vision" for quests, other documents in this
directory provide more detailed gameplay & technical breakdowns of the feature.
The document at [battle_rules](../../battle_rules/battle_rules.md) provides more
information about the actual rules of the game.

## The Golden Rule: Configuration via TOML

The rest of this document goes into detail about specific game systems. To the
maximum extent possible, though, Dreamtides gameplay is intended to be
completely configurable via TOML file changes. If a section in the plan says
"shops contain 6 items", this is implied to be configured in TOML. Whenever
reasonable, we should even allow more complex algorithmic changes via data
(dreamscape generation, draft pool rules, battle rewards, etc). When
implementing any rules engine feature, we should ask the question "could we make
this configurable?"

This rule applies to user interface behavior as well as game design: things like
particle effects, sound effects, and animations are always configured in TOML
when possible.

## Overview

Quests revolve primarily around drafting and refining a deck to bring into
future battles. Quests use a single currency, **essence**, which is spent at
shops and in various other ways. Players begin each quest by choosing a
Dreamcaller, then review their fixed starter deck and starting dreamscape. By
default, quests have a maximum essence cap of 500; any essence gained beyond
this cap is lost unless the cap has been increased by an effect such as a Dream
Augury reward. Dreamtides does not use an explicit rarity system for cards,
except for certain powerful cards that are designated as legendary cards.

In addition to deck cards, users during a quest will select 1 of 3 Dreamcallers
to lead their deck and may have some number of Dreamsigns:

- **Dreamcaller:** An animated 3D character who starts each battle already in
  play for both participants in a battle. Each Dreamcaller has powerful ongoing,
  triggered, or activated abilities and seeds the run's draft pool, Dreamsign
  pool, and default reward bias as described in
  [Draft Pool Construction](#draft-pool-construction).
- **Dreamsigns:** Cards with 2D illustrations of objects which provide more
  minor ongoing effects. Dreamsign effects can apply during battles, on the
  quest map, or both. Dreamsigns are pulled from a shared run pool and are spent
  as soon as they are shown to the player.

Quests display a top-level 3D screen called the [Dream Atlas](#dream-atlas), an
interconnected web of locations called **dreamscapes**. Each dreamscape has a
randomly-generated collection of **sites** available, which provide services to
the player to let them modify their deck. The user navigates from dreamscape to
dreamscape, visiting sites and fighting battles to improve their deck on the way
to the final boss.

## Dreamscapes and Dream Guides

A quest takes place on the Dream Atlas, an interconnected web of dreamscapes.
Each dreamscape is a named, themed location with a fixed aesthetic, a collection
of sites, and (for every dreamscape except the starting one) a **Dream Guide**
and an **affiliation**.

- **Dream Guides** are the NPCs who provide services to the player. Most sites
  are paired with a specific guide (for example, every Card Shop is run by
  Tobias Tanglefur). A guide can be found in *any* dreamscape where their site
  appears, and is always found in their **home** dreamscape. When a guide is in
  their home dreamscape, their power is enhanced and the site they offer is more
  powerful (see [Home Specialties](#home-specialties)).
- **Affiliations** are a type of card a dreamscape is most connected to. Cards
  matching the affiliation are slightly more likely to appear in random card
  draws within that dreamscape, as described in [Affiliations](#affiliations).

The 10 non-starter dreamscapes can appear more than once on the Dream Atlas, but
the same dreamscape is never connected directly to a copy of itself. Dreamscapes
are drawn without replacement from a pool as part of Atlas generation, making it
less likely (but not impossible) that repeats are generated until every
dreamscape has been seen. See [Dream Atlas Generation](#dream-atlas-generation)
for the assignment algorithm.

The full set of dreamscapes follows. The guide's signature site is always
present and enhanced in their home dreamscape; the same site can also appear,
non-enhanced, in the random fill of other dreamscapes.

### Firstlight Meadow

The starting dreamscape of every dream quest. Firstlight Meadow has no Dream
Guide and no affiliation, and its sites are fixed, giving every run an identical,
uniform on-ramp. Its sites are two [Draft](#draft) sites, a [Dreamsign
Revelation](#dreamsign-revelation) offering a choice of 3 dreamsigns, a
[Purge](#purge) site, and a [Battle](#battle) site fought to 10 points. No fill
sites appear and no site is enhanced.

- **Aesthetic:** A tranquil meadow at sunrise.

### Tumbleleaf Village

*A warm village of travelers and spirit animals, where the card shop offers new
companions, old charms, and small wonders for the road ahead.*

- **Dream Guide:** Tobias Tanglefur
- **Signature Site:** [Card Shop](#card-shop)
- **Aesthetic:** A fantasy village with anthropomorphic animals.
- **Affiliation:** Spirit Animals
- **Site Icon:** `game-icons.net/sbed/shop`

### Pharaoh's Gate

*A sun-baked realm of tombs and golden gods, where the dreamsign market deals in
ancient bargains and cards drift into the void only to rise again.*

- **Dream Guide:** Amunet, the Tomb-Keeper
- **Signature Site:** [Dreamsign Market](#dreamsign-market)
- **Aesthetic:** An ancient Egyptian realm.
- **Affiliation:** Erode, Void matters
- **Site Icon:** `game-icons.net/sbed/great-pyramid`

### Winterwake Fjords

- **Dream Guide:** Sigrún
- **Signature Site:** [Dreamsign Revelation](#dreamsign-revelation)
- **Aesthetic:** A snowy viking village.
- **Affiliation:** Removal, Dissolve / Banish effects
- **Site Icon:** `game-icons.net/sbed/fire`

### Frostforge

- **Dream Guide:** Durgan Forgehammer
- **Signature Site:** [Transfiguration](#transfiguration)
- **Aesthetic:** A dwarven fortress.
- **Affiliation:** Storm / Events matter
- **Site Icon:** `game-icons.net/sbed/anvil-impact`

### Hope's End

- **Dream Guide:** Deacon Holt
- **Signature Site:** [Duplication](#duplication)
- **Aesthetic:** A rural town experiencing a zombie apocalypse.
- **Affiliation:** Inexpensive Characters
- **Site Icon:** Custom `stack.svg`

### Tsukiren

- **Dream Guide:** Master Takeshi
- **Signature Site:** [Purge](#purge)
- **Aesthetic:** A samurai-era Japanese kingdom.
- **Affiliation:** Warriors
- **Site Icon:** `game-icons.net/sbed/small-fire`

### Blackthorn Keep

- **Dream Guide:** Aldric, the Seer
- **Signature Site:** [Dream Augury](#dream-augury)
- **Aesthetic:** A dark fantasy castle.
- **Affiliation:** Abandon / Sacrifice
- **Site Icon:** `game-icons.net/sbed/crystal-ball`

### The Rust Expanse

- **Dream Guide:** Maddox
- **Signature Site:** [Tempting Offer](#tempting-offer)
- **Aesthetic:** A "Mad Max" post-apocalyptic wasteland.
- **Affiliation:** Survivors
- **Site Icon:** `game-icons.net/sbed/scales`

### Farpoint Station

- **Dream Guide:** Gravok
- **Signature Site:** [Gamble](#gamble)
- **Aesthetic:** A sci-fi outpost on a distant planet, populated by humans and
  aliens (such as Gravok, a crystal/rock creature).
- **Affiliation:** Figments
- **Site Icon:** `game-icons.net/sbed/two-coins`

### Grid City

- **Dream Guide:** "Layaway"
- **Signature Site:** [Temporal Fork](#temporal-fork)
- **Aesthetic:** A cyberpunk city.
- **Affiliation:** Discard
- **Site Icon:** `game-icons.net/sbed/sands-of-time`

## Affiliations

Each non-starter dreamscape has an affiliation: a type of card it is most
connected to (for example, Spirit Animals or Warriors). An affiliation is
represented as a signature card set, scored using the same IDF / card-similarity
analysis that the [tides4](#tides) algorithm uses.

An affiliation nudges random card selection throughout its dreamscape:

- The nudge applies **dreamscape-wide**, to every random card or dreamsign draw
  at any site within that dreamscape: draft offers, Card Shop stock, dreamsign
  selection, transfiguration and duplication candidates, augury reward cards,
  and so on.
- The nudge is **similarity-weighted reweighting**. Each candidate card's
  selection weight is multiplied by a factor derived from its similarity to the
  affiliation's signature card set; cards more similar to the affiliation become
  more likely to appear.
- The nudge does **not** modify pool membership, the overall draft pool, or the
  tides4 algorithm. It only shifts draw probabilities; any card that could
  appear can still appear, and affiliated cards simply appear more often.

Affiliations are flavor-aligned with their dreamscape (Tumbleleaf Village leans
toward Spirit Animals, Tsukiren toward Warriors), but mechanically they are just
signature card sets and corresponding similarity weights configured in TOML.

## Tides

Quest content uses the layered tide system described in
[Tides](../../tides/tides.md) and implemented by the **tides4** draft pool
algorithm. Each tide is a preconstructed deck of cards with one of three roles:

- **Signature tides** define a Dreamcaller's identity floor and are always
  joined when present.
- **Facet tides** are single-anchor variety engines; a random subset is drawn
  for each run to vary the pool.
- **Neutral tides** are broad fill packages joined as needed to reach the target
  pool size.

Cards are assigned to tides by battle function, not by flavor or surface
terminology. A single card may belong to multiple tides.

For quests, the important consequences are:

- Each Dreamcaller maps to a signature tide (or none), a set of facet tides, and
  a set of neutral tides.
- At the start of a quest, the player picks 1 of 3 Dreamcallers, and that
  Dreamcaller's tides determine the draft pool for the quest as described in
  [Draft Pool Construction](#draft-pool-construction).
- Draft pools, Dreamsign pools, shops, and reward generators all key off these
  tides.
- Battles themselves use the core
  [battle rules](../../battle_rules/battle_rules.md) resource model: cards are
  paid for with **energy**, and energy production comes from the shared
  **Dreamwell** rather than from tide-specific resources.

Cards and Dreamsigns are tagged with tides.

## Quest Start & Dreamcaller Selection

Dreamcaller selection is the quest-start screen shown before the player enters
the Dream Atlas. The player is presented with 3 Dreamcallers and chooses one to
define the run.

Selecting a Dreamcaller performs all run bootstrap work immediately:

- Add the fixed starter deck.
- Build the draft pool and Dreamsign pool from the Dreamcaller's tides.
- Generate the initial atlas.
- Make the starting deck available through the deck UI.
- Set Firstlight Meadow as the current destination and enter it directly.

**UI:** Dreamcallers are shown in their full-body "card" representation, with
ability text displayed alongside their 3D models and highlighted tides. The
Dreamcaller cards animate in from a small size in the center of the screen. Each
Dreamcaller does a different humanoid animation within its card frame. A primary
action button appears below each Dreamcaller allowing it to be selected. The
selected Dreamcaller animates to the bottom left of the screen to appear in a
square frame (head only). The other cards animate back to a small size.

## Rarity

Dreamtides does *not* have card rarity, except for the "legendary" status on
certain powerful cards.

## Draft Pool Construction

The draft pool is a fixed multiset built from the selected Dreamcaller's tides
using the tides4 algorithm. The same algorithm runs deterministically from a
per-run seed so a given Dreamcaller and seed always produce the same pool.

### Pool Generation Algorithm

At quest start, choosing a Dreamcaller resolves the run's draft pool as follows:

1. Join the Dreamcaller's signature tide, if it has one.
2. Draw a uniformly-random subset of 1 to 3 of the Dreamcaller's facet tides and
   join them. This is the main source of run-to-run variety.
3. Top the bag up with the Dreamcaller's neutral tides until a full pool can be
   dealt.
4. Shuffle the combined bag and deal it into the draft multiset, capped at 2
   copies of any single card. The default deal size is 150 cards.
5. Exclude the Dreamcaller's starter cards from the pool.

The resulting multiset is stored as `draftPoolCopiesByCard`. Because facet
selection is random per run, two players with the same Dreamcaller still draft
from different pools.

The same resolution step also builds the run's initial Dreamsign pool from the
Dreamsign templates associated with the selected tides.

Pool size, copy cap, and the facet draw range are configured in TOML; assume all
of these values are subject to change.

### Draft Pick Generation

The draft state stores `remainingCopiesByCard` for the resolved multiset and
generates draft pick offers directly from that data:

- Each pick shows **4 unique cards** when at least 4 unique cards remain.
- Cards are sampled **without replacement**, weighted by their remaining copy
  counts (and by [affiliation](#affiliations) similarity in affiliated
  dreamscapes).
- The shown offer is **spent immediately** from the pool. Unpicked cards are
  burned; they do not return to the pool later.
- The player pick adds the chosen card to the deck but does not otherwise alter
  the already-spent offer.
- The draft multiset is recreated from `draftPoolCopiesByCard` when it runs out
  of cards.

### Draft Sites On The Map

Each [Draft site](#draft) provides **5 picks** from the ongoing multiset. Early
dreamscapes provide more opportunities to draft than late dreamscapes:

| Completion Level | Draft Sites |
| ---------------- | ----------- |
| 0, 1             | 2           |
| 2, 3             | 1           |
| 4+               | 0           |

Because the draft pool is persistent and finite, each draft site is spending
real run inventory. Offer quality naturally shifts over time as cards are
consumed.

## Dreamscape Sites

Sites are the encounters within a dreamscape. Sites can generally be visited in
any order, with the exception that the "Battle" site must be visited last. Each
site must be visited exactly once and cannot be returned to. Dreamscapes contain
between 3 and 6 total sites (including battle and draft sites, configured in
TOML) as described in [Dreamscape Generation](#dreamscape-generation).

Most sites are paired with a [Dream Guide](#dreamscapes-and-dream-guides). The
guide is the same character for a given site type everywhere it appears (every
Card Shop is Tobias), and the guide character appears wherever their site
appears, home or not. Their behavior and dialog are configured via TOML. For
sites with a guide, portrait mode frames the guide at the top of the screen with
content below, while landscape mode places the guide to one side with content
beside them.

When a guide site appears in its guide's home dreamscape it is **enhanced** with
a stronger version of its ability, the guide's [Home
Specialty](#home-specialties). The same site appearing elsewhere uses its
standard, non-enhanced behavior.

Three sites — Battle, Draft, and Essence — have no guide and are never enhanced.

### Battle

The Battle site is the core gameplay element of Dreamtides, and it allows users
to play a match against an AI opponent. Each battle has an assigned opponent
dreamcaller with their own deck, derived randomly from that dreamcaller's tides.
Before the battle begins, the opposing dreamcaller is displayed so the user can
understand any special abilities they have. Opposing dreamsigns are also shown.
When the battle completes, the [Victory or Defeat](#victory--defeat) screen is
shown along with any associated battle rewards. Battles use the rules from
[Battle Rules](../../battle_rules/battle_rules.md). Quests are single elimination
by default, so losing this battle ends the run.

**UI:** The camera pans in to the battle scene. The "full body" card
representation of the enemy dreamcaller animates in from a small size at the
center of the battle area. The enemy's deck is present in the center of the
scene. The dreamcaller character within the card performs an animation. The
rules text on the enemy dreamcaller is displayed, along with any enemy
dreamsigns. A "start battle" button is shown. Clicking the start battle button
causes the enemy dreamcaller to animate to their battle position in the small
dreamcaller card format (head only, no text). The user dreamcaller and user
quest deck animate to their starting positions. The enemy quest deck animates to
its starting position. An opening hand of cards is dealt to both players.

Icon: `game-icons.net/lorc/swords-emblem`

### Draft

The Draft site allows users to add cards to their deck via the
[Draft Pool Construction](#draft-pool-construction) system. Each draft site
provides 5 picks from the ongoing run multiset. Each pick shows 4 unique cards
sampled from the remaining pool, weighted by remaining copies and affiliation
similarity. Revealed cards are spent immediately whether or not they are chosen,
so a Draft site always burns real run inventory.

**UI:** The cards available for the current pick are shown in multiple rows. The
available cards animate in to be selected. Clicking a card animates it to the
quest deck, and the remaining cards animate away as the next offer arrives.
After all picks at a draft site are completed, the camera automatically pulls
back to the map view. Cards are shown with an orange outline.

Icon: `game-icons.net/sbed/card-pick` (modified)

### Essence

An essence site grants the user a fixed amount of essence, often around 200-300.
Essence is capped at 500 by default, and any amount above the current cap is
lost. Effects such as Dream Augury rewards may increase this cap.

**UI:** Unlike with other sites, the camera does not zoom in to essence sites.
Instead the button simply vanishes on click and a purple particle effect
appears, animating in a winding path to the user's essence total and then plays
a 'hit' particle effect when it reaches the bottom left essence total and
updates the quantity of essence shown.

Icon: "Diamond"

### Card Shop

The Card Shop is run by **Tobias Tanglefur** (home: Tumbleleaf Village). It is
the primary site for spending essence on cards. The shop offers individual cards
for purchase plus a restock option that refreshes the available choices once,
also for essence.

Shop cards are drawn from the run's tide-based draft pool, in the same manner as
draft picks, and are removed from the draft pool even if not selected. A Card
Shop always shows 5 cards to purchase plus a restock option.

Shop base prices and the overall essence economy are defined in TOML. The shop
implements a random "discount" system where one or more items can be displayed as
being on sale, for between 30% and 90% cost reduction. Effects such as dreamsigns
or augury effects can also modify shop prices.

**Home Specialty.** In Tumbleleaf Village, Tobias sells powerful cards at a
discount, drawn directly from the player's Dreamcaller signature tide.

**UI:** Tobias performs an animation and displays a speech bubble with some
dialog when the camera arrives at this site. The items are displayed in a row,
along with a close button — beside Tobias in landscape mode and below him in
portrait mode. Each item has a purple button under it showing its essence cost.
Clicking the button for a card animates it to the quest deck. One of the options
is a "restock" option; when selected, the items do a staggered scale-down
animation, then the new options perform a scale-up animation in-place. Clicking
the close button completes the site visit and pulls the camera back to the map
screen. The items remain in place visually rather than animating away, but the
site cannot be revisited.

Icon: `game-icons.net/sbed/shop`

### Dreamsign Market

The Dreamsign Market is run by **Amunet, the Tomb-Keeper** (home: Pharaoh's
Gate). It is the site for purchasing dreamsigns with essence, and offers a
restock option that refreshes the available choices once for essence. A Dreamsign
Market always shows 3 dreamsigns to purchase plus a restock option.

Dreamsigns are drawn from the run's shared Dreamsign pool, which was seeded from
the selected Dreamcaller's tides, and are removed from that pool when shown.

**Home Specialty.** In Pharaoh's Gate, Amunet allows the player to restock the
dreamsign choices once for free.

**UI:** Amunet performs an animation and displays a speech bubble when the camera
arrives. Dreamsigns for purchase are displayed in a row with a close button,
beside Amunet in landscape and below her in portrait. Each dreamsign has a purple
button showing its essence cost; purchasing animates it to the dreamsign display
in the bottom right corner of the screen. A restock option refreshes the choices
with a staggered scale animation. Clicking the close button completes the visit
and returns to the map.

Icon: `game-icons.net/sbed/great-pyramid`

### Dreamsign Revelation

Dreamsign Revelation is run by **Sigrún** (home: Winterwake Fjords). The player
receives 1 random dreamsign, or sometimes picks 1 of 3. The offered dreamsigns
are drawn from the run's shared Dreamsign pool and are removed from the pool as
soon as they are shown, so declining does not return them to the run.

**Home Specialty.** In Winterwake Fjords, Sigrún offers improved dreamsigns
specifically tailored to the player's current deck, with more choices. In her
home dreamscape she always offers a choice of dreamsigns rather than a single
random one.

**UI:** Sigrún performs an animation and displays a speech bubble. For a single
offer, the dreamsign animates to screen center at a small scale with a purple
accept button and a gray reject button; it animates to the bottom-right dreamsign
display if accepted and back to a small scale if rejected. For a choice, the
dreamsigns animate in at full size in a single row with a purple accept button
below each and a close button at top left.

Icon: `game-icons.net/sbed/fire`

### Transfiguration

Transfiguration is run by **Durgan Forgehammer** (home: Frostforge). The site
shows the user 4 random cards from their deck, each with a random transfiguration
proposed, and the user may select one to apply, modifying that card's rules text.
Each card can only receive a single transfiguration; cards that have already been
transfigured are not eligible. If multiple transfigurations are applicable to a
card, a random one is selected to suggest. The candidate cards are subject to the
dreamscape's [affiliation](#affiliations) nudge.

Each transfiguration carries an emblem icon shown in the card's name bar and a
tint color; the card name and any modified rules text display in that tint to
indicate the transfiguration. Possible transfigurations include:

- Empowered Transfiguration: Reduces the energy cost of the card by 50%, rounded
  to the nearest whole number (4->2, 3->2, 2->1, 1->0, etc). Not available for
  cards which cost 0.
- Amplified Transfiguration: Improves the effect of the card by increasing or
  decreasing a number in its rules text by 1. Only available for cards with
  numbers in their text. The amplified variant of each card is defined in TOML.
- Kindled Transfiguration: Doubles the base spark of a character, or sets it to
  1 for characters with 0 spark. Only available for characters.
- Resonant Transfiguration: Increases the frequency of named card triggers,
  changing:
  - A "materialized" trigger to also happen when the card dissolves
  - A "dawn" trigger to also happen when the card is materialized
  - A "once per turn" trigger to happen any number of times per turn
- Inspired Transfiguration: Appends "draw a card" to the text of an event card.
  Only available for events.
- Enduring Transfiguration: Adds "reclaim" to the text of an event card. Only
  available for events.
- Attuned Transfiguration: Reduces the cost of an activated ability by 1. Only
  available for cards with activated abilities that cost energy.
- Perfected Transfiguration: Adds all of the above transfigurations to a card
  which are available. Only available for cards which are eligible for 2 or more
  transfigurations.

**Home Specialty.** In Frostforge, Durgan allows the player to pick any card in
their deck and apply a transfiguration of their choice to it.

**UI:** Durgan performs an animation and displays a speech bubble. 4 cards from
the quest deck animate to appear in a row via a staggered move animation (they
flip face-up), beside Durgan in landscape and below him in portrait. Each card is
augmented to show the transfigured version being offered, with the card name and
text tinted to the new color. Each card gets a purple "Transfigure" button. When
clicked the other cards fall away, then the selected card animates to screen
center, displays a visual effect specific to the transfiguration, flips over, and
returns to the quest deck in the bottom right. A close button allows the user to
decline.

Icon: `game-icons.net/sbed/anvil-impact`

### Duplication

Duplication is run by **Deacon Holt** (home: Hope's End). The site shows the user
4 random cards from their deck, and the user may choose one to duplicate, adding a
copy to their deck. The candidate cards are subject to the dreamscape's
[affiliation](#affiliations) nudge.

**Home Specialty.** In Hope's End, Deacon Holt allows the player to pick any card
in their deck to duplicate.

**UI:** Deacon performs an animation and displays a speech bubble. 4 cards from
the quest deck animate to appear in a row via a staggered move animation. A purple
"Duplicate" button appears under each one. Clicking it causes the other cards to
fall away, then a particle effect plays and a copy of the card emerges from the
selected card. The copies animate to the quest deck, and the camera pulls back to
the map. A close button allows the user to decline.

Icon: "Copy"

### Purge

Purge is run by **Master Takeshi** (home: Tsukiren). It lets the user pay essence
to permanently remove cards from their deck, thinning out cards that don't fit
their gameplan. Purge also removes [Banes](#banes): bane cards can be selected for
removal alongside ordinary cards, and are removed cheaply or for free so that a
bad bane is always shakeable.

A Purge site is guaranteed in the starting dreamscape and the next two
(completion levels 0, 1, and 2), so early-game deck-thinning is always available.
From completion level 3 onward, Purge is no longer guaranteed but can still appear
in the random fill of a dreamscape. Tsukiren always offers an enhanced Purge.

**Pricing.** Purge cost escalates with each card removed in a single visit, and
the counter resets every dreamscape. The Nth card removed in a visit costs
`30 + 5 * N * (N + 1)` essence:

| Card # | Marginal cost | Cumulative |
| ------ | ------------- | ---------- |
| 1      | 40            | 40         |
| 2      | 60            | 100        |
| 3      | 90            | 190        |
| 4      | 130           | 320        |
| 5      | 180           | 500        |
| 6      | 240           | 740        |

Removing one or two cards is cheap, three or four is a real commitment, and five
or more requires arriving with a nearly full essence bar. Two anchors tie the
curve to the rest of the economy: two cards cost the same as one standard shop
card (100 essence), and five cards cost the full default essence cap (500). Up to
six cards may be removed in a single visit. Essence discounts also reduce purge
prices. The pricing logic lives in `src/purge/purge-pricing.ts`.

**Home Specialty.** In Tsukiren, Master Takeshi allows the player to remove up to
3 cards (ordinary cards or banes) at no cost.

**UI:** The user's quest deck opens its browser view, showing every card.
Selecting a card gives it a red outline and a price chip showing what that card
costs in the current selection order. A running summary shows the number
selected, the total essence cost, the essence remaining afterward, and the price
of the next card. Cards the player cannot yet afford are dimmed. A red "Purge N
Cards" button at the bottom confirms the removal: essence is spent and the
selected cards are permanently removed.

Icon: `game-icons.net/sbed/small-fire`

### Dream Augury

Dream Augury is run by **Aldric, the Seer** (home: Blackthorn Keep). It functions
like a random event in other roguelike deckbuilding games: the player chooses
between two reward options to claim. Dream Augury rewards are pure upside, and
this is where the biggest random effects live — effects that can structurally
change a quest or modify the user's entire deck. The amount of information
revealed about an effect is variable, and some auguries have highly random effects
not disclosed in advance. A close button allows the user to reject the options,
though some auguries explicitly remove it.

**Home Specialty.** In Blackthorn Keep, Aldric offers bigger rewards highly
curated to the player's current deck (for example, transfiguring more cards,
offering more draft choices, or offering more curated strong cards).

**UI:** Aldric performs an animation and displays a speech bubble. The augury
cards animate from the center of Aldric's chest at a small size and are shown
side-by-side (next to him in landscape, below in portrait). A purple button under
each accepts it. Accepting animates the chosen card up to screen center, then
plays a dissolve animation, then shows the effect via a custom animation (for
example, cards fading in and animating to the quest deck for an "add 3 cards"
effect). Once the effect animation completes, the camera pulls back to the map. A
augury card is a circular image that displays its rules text on hover/long press.
For auguries with multiple effects, each animation plays in sequence.

Icon: `game-icons.net/sbed/crystal-ball`

### Tempting Offer

Tempting Offer is run by **Maddox** (home: The Rust Expanse). The player may take
a powerful reward, but it comes at a cost: paying essence, gaining a
[Bane](#banes), or losing something (such as a card from their deck). Tempting
Offer is the primary source of banes during a quest.

**Home Specialty.** In The Rust Expanse, Maddox offers the player their choice of
two tempting offers.

**UI:** Maddox performs an animation and displays a speech bubble. The offer
card(s) animate in from the center of his chest and are shown beside him in
landscape, below in portrait, with the reward and its cost both displayed. A
purple button accepts the offer; the cost and reward animations play in sequence
(for example, essence draining away and then a reward animating to the quest
deck). A close button allows the user to decline.

Icon: `game-icons.net/sbed/scales`

### Gamble

Gamble is run by **Gravok** (home: Farpoint Station). The player engages in one of
a few wager or "push your luck" style games to win rewards. A wager can win a
larger payout or lose the stake.

**Home Specialty.** In Farpoint Station, Gravok charges no initial fee and offers
bigger payouts.

**UI:** Gravok performs an animation and displays a speech bubble. The wager
interface appears beside him in landscape and below in portrait, showing the bet,
the odds, and the potential reward. The player commits to a wager, an outcome
animation resolves the result (a win animates the reward to the quest deck or
essence total; a loss plays a failure animation), and the camera pulls back to the
map. A close button allows the user to decline before wagering.

Icon: `game-icons.net/sbed/two-coins`

### Temporal Fork

Temporal Fork is run by **"Layaway"** (home: Grid City). The player is offered a
choice of two time-based effects: temporary modifications to the player's deck or
game rules, or rewards that arrive in the future. This is where time-limited big
effects live.

**Home Specialty.** In Grid City, Layaway offers effects with a longer duration,
or future rewards that arrive sooner.

**UI:** Layaway performs an animation and displays a speech bubble. The two effect
cards animate in beside him in landscape and below in portrait, each showing its
effect and its duration or timing. A purple button accepts an effect; the
not-selected card animates away, and the chosen effect plays a custom animation
(for example, a clock motif marking when a future reward will arrive). The camera
then pulls back to the map. A close button allows the user to decline.

Icon: `game-icons.net/sbed/sands-of-time`

## Home Specialties

When a Dream Guide is in their home dreamscape, their site is enhanced. The
enhancements are:

| Guide | Home Dreamscape | Site | Enhancement |
| ----- | --------------- | ---- | ----------- |
| Tobias Tanglefur | Tumbleleaf Village | Card Shop | Discounted cards drawn from the player's Dreamcaller signature tide |
| Amunet, the Tomb-Keeper | Pharaoh's Gate | Dreamsign Market | Restock the choices once for free |
| Sigrún | Winterwake Fjords | Dreamsign Revelation | Always a choice (never a single random dreamsign), more choices, tailored to the deck |
| Durgan Forgehammer | Frostforge | Transfiguration | Pick any card and any applicable transfiguration |
| Deacon Holt | Hope's End | Duplication | Pick any card to duplicate |
| Master Takeshi | Tsukiren | Purge | Remove up to 3 cards or banes for free |
| Aldric, the Seer | Blackthorn Keep | Dream Augury | Bigger rewards, curated to the deck |
| Maddox | The Rust Expanse | Tempting Offer | Choose between two offers |
| Gravok | Farpoint Station | Gamble | No initial fee, bigger payouts |
| "Layaway" | Grid City | Temporal Fork | Longer duration / sooner future rewards |

The guide's signature site is always present and enhanced in the home dreamscape.
The same site can also appear in the random fill of other dreamscapes, where the
guide still presents it but the enhancement does not apply. Enhancement details
are configured in TOML.

## Victory & Defeat

By default, quests are single elimination: if the user loses any battle, the
quest ends immediately in defeat. As described in the
[Meta Progression](meta_progression.md) document, the user may eventually unlock
an exception that allows continuing after a first loss, but that is a
meta-progression reward layered on top of the base rule.

**UI:** When a battle ends, a particle effect plays alongside a sound effect, and
the word "Victory" or "Defeat" is displayed at screen center. The text then
animates upward to reveal a summary panel showing battle rewards earned, quest
statistics, and a button to continue to the Dream Atlas (on victory) or to end
the quest (on defeat).

A Quest ends in victory if the user wins 7 battles. The 4th battle they face is
against a miniboss, and the 7th battle is against the final boss of Dreamtides.
Bosses are dreamcallers that have their own unique abilities, dreamsigns, or
custom cards in their decks. See [Boss Dreamcallers](bosses.md) for details.

### Battle Rewards

Completing a battle always grants an essence reward, which increases as the user
completes more dreamscapes.

## Limits

Quest decks can contain a maximum of 50 cards during battles. If this limit is
exceeded, before the battle starts the user gains the ability to purge cards of
their choice to get back down under 50 cards.

Quest runs also have a maximum essence cap of 500 by default. If the player would
gain essence above their current cap, the excess is lost. This cap can be
increased by effects such as Dream Augury rewards.

Quest decks must contain a minimum of 25 cards. If the user has not completed
enough drafts to reach this threshold, additional copies of their deck are added
during a battle until they exceed 25 (for example, a player with 9 cards in their
deck will end up with 27 cards during a battle).

Users can have a maximum of 12 dreamsigns at any time. If they would receive
another dreamsign, an overlay is shown and they must immediately purge a
dreamsign.

Users may have only 1 dreamcaller.

## Banes

Certain cards, called "banes", can be given to the user during a quest, typically
as the cost side of a [Tempting Offer](#tempting-offer) or as the downside of a
losing [Gamble](#gamble). Bane cards generally have negative effects when drawn.
Bane cards can be removed at a [Purge](#purge) site, which removes banes cheaply
or for free alongside ordinary cards. See [Banes](banes.md) for more information.

## Dream Atlas

The Dream Atlas is the world map players navigate after Dreamcaller selection. It
shows a 3D map of dreamscapes represented as circular miniature "worlds,"
connected by dotted lines. For later dreamscape choices, the player can hover over
or long-press a dreamscape to preview it, then click it again to zoom the camera
in to that dreamscape.

Each dreamscape can be in one of three states:

- **Completed**: The player has already visited this dreamscape and finished its
  battle.
- **Available**: The player can choose this dreamscape as their next destination.
- **Unavailable**: The player cannot choose this dreamscape yet.

The player begins inside **Firstlight Meadow**, the starting dreamscape, which
sits at the center of the Dream Atlas. The player enters it directly when the run
begins; the Atlas screen marks it "You started here" with a slight visual
emphasis so the player keeps their bearings.

After the player visits a dreamscape and completes its battle, that dreamscape
becomes **Completed**. Any dreamscapes directly connected to it then also become
**Available**. The number of dreamscapes the user has completed is called the
'Completion Level' for that quest. In other words, a dreamscape is **Available**
only if it is connected to at least one **Completed** dreamscape.

Each dreamscape displays exactly one site icon on the atlas to preview it: the
icon of its home guide's signature site (the enhanced site). Firstlight Meadow is
special — it shows its own flag glyph rather than a site icon. Hovering a
dreamscape describes what is special about it: its guide, its affiliation, and its
home specialty. Site icons use the game-icons.net glyphs and custom SVGs listed
per site above. Winning the 7th battle causes the player to win the quest.

### Dream Atlas Generation

The dream atlas is a branching tree that grows outward from Firstlight Meadow,
keeping a two-deep look-ahead so the player can always see their immediate choices
and where each choice leads. The initial atlas holds the starting dreamscape, its
two direct children (the first two choices, which are guaranteed to show different
site icons), and two grandchildren beneath each child. Every node but the start
begins 'unavailable'.

Completing a dreamscape marks it 'completed' and turns its direct children into
the newly 'available' choices. Each newly available dreamscape is then topped up
to two forward branches: a dreamscape that already carries its children (such as
the initial choices) generates nothing new, while a deeper dreamscape that has no
children of its own sprouts two onward branches the moment it becomes a live
choice. New dreamscapes attach only to the newly available nodes, never directly
to the completed node, so they stay 'unavailable' until their own parent is
completed.

Every dreamscape is placed in a collision-free slot, fanned around its parent's
outward direction and kept at least a fixed minimum distance from every other
dreamscape, so the atlas never renders overlapping nodes. The atlas is purely
additive and is never pruned; the player will visit 7 dreamscapes in a typical
quest (or 8 with the battle-skip meta progression unlock).

**Assigning dreamscapes to nodes.** Which named dreamscape fills each new node is
drawn from a shuffled bag of the 10 non-starter dreamscapes. Each node draws
without replacement from the bag; when the bag empties it is refilled and
reshuffled. A draw that would place a dreamscape directly adjacent to a copy of
itself is rejected and redrawn. Because the bag is exhausted before it refills,
the first batch of placements is all-distinct and repeats only begin to appear
once the bag has cycled — so within a single typical quest the player usually sees
distinct dreamscapes, with repeats possible but uncommon.

## Dreamscape Generation

Within a dreamscape, sites are generated by drawing from a pool, in a similar
manner to how draft picks are generated. Sites are selected when the dreamscape
becomes available. Each dreamscape contains between 3 and 6 total sites
(configured in TOML).

The contents of a non-starter dreamscape are assembled as follows:

1. **Mandatory sites** are placed first:
   - Exactly one Battle site (visited last).
   - The home guide's signature site, enhanced.
   - A Purge site, if the completion level is 0, 1, or 2.
   - Draft sites according to the completion-level table below.
2. **Fill sites** are then drawn to reach the target site count (within the 3–6
   range) from a pool of the 9 other guides' signature sites (each bringing its
   guide, non-enhanced) plus the generic Essence site. The pool for fill
   generation changes over time, with new options shuffled in after each
   dreamscape is completed as defined in TOML for that completion level;
   Transfiguration and Duplication, for example, become more common later in the
   quest.

All site types can appear a maximum of 1 time in a dreamscape, with the exception
that there can be up to 2 Draft sites.

Draft sites are deterministic by completion level:

| Completion Level | Draft Sites |
| ---------------- | ----------- |
| 0, 1             | 2           |
| 2, 3             | 1           |
| 4+               | 0           |

Firstlight Meadow does not use this generation process: its sites are fixed at
two Draft sites, a Dreamsign Revelation offering a choice of 3 dreamsigns, a
Purge site, and a Battle site fought to 10 points, with no fill and no
enhancement.

## Implementation Strategy and QA

The overall implementation strategy for the Quests game mode is to rely heavily
on both *integration testing* and *manual QA*. The integration testing philosophy
should follow what we use for the battle game mode, writing tests that operate
against the real QuestView/Commands interface. Philosophically, Dreamtides does
not employ unit testing.

The manual QA strategy here is based on validating all changes against a running
instance of the Unity editor using the [abu](../../abu/abu.md) tool. *Every*
change to the Quest game mode should interact with Unity, perform the required
user interactions, and take screenshots of the new UI to check for display
issues. Testing *must* be at minimum performed once on a landscape/desktop
display resolution and once on a mobile/portrait display resolution. The device
can be configured before entering play mode via the `abu set-device` command:
`abu set-device landscape-16x10` or `abu set-device iphone-se`. We should be
interactively building a high-quality `DreamtidesSceneWalker.Quest.cs` scene
`abu` representation during development.
