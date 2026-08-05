# Dreamtides Journeys: Master Design Document

This is the master design document for the Dreamtides "journeys" system. Journeys
are the meta layer in which the user navigates various encounters on a map
screen in order to improve their deck, while battles are individual card
matches. Journeys are similar to "runs" in other roguelike deckbuilding games,
while battles are similar to "fights". Journeys will be at least as complicated to
implement as battles, and almost every existing line of code for supporting
battles will require an equivalent for journeys.

This document is the high level "vision" for journeys, other documents in this
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

Journeys revolve primarily around drafting and refining a deck to bring into
future battles. Journeys use a single currency, **essence**, which is spent at
shops and in various other ways. Players begin each journey with 200 essence by
default, then choose a Dream Avatar and review their fixed starter deck and
starting dreamscape. Dreamtides does not use an explicit rarity system for cards,
except for certain powerful cards that are designated as legendary cards.

In addition to deck cards, users during a journey will select 1 of 3 Dream Avatars
to lead their deck and may have some number of Dreamsigns:

- **Dream Avatar:** An animated 3D character who is already in play when each
  battle begins. The player and their opponent each bring their own Dream Avatar,
  which starts in play on its owner's side. Each Dream Avatar has powerful
  ongoing, triggered, or activated abilities and seeds the run's draft pool,
  Dreamsign pool, and default reward bias as described in
  [Draft Pool Construction](#draft-pool-construction).
- **Dreamsigns:** Cards with 2D illustrations of objects which provide more
  minor ongoing effects, defined in `data/tabula/dreamsigns.toml`. A dreamsign
  the player gains is kept for the rest of the run; its effect can apply during
  battles, on the journey map, or both (for example, a battle effect such as "Once
  per turn, when you discard a card, your next card this turn costs 2 less," or a
  map effect such as "Double the essence you gain from essence sites"). Dreamsigns
  are drawn from a shared run pool, and each entry is removed from that pool as
  soon as it is offered — whether or not the player takes it — so the same
  dreamsign is never offered twice in a run.

Journeys display a top-level 3D screen called the [Dream Atlas](#dream-atlas), an
interconnected web of locations called **dreamscapes**. Each dreamscape has a
randomly-generated collection of **sites** available, which provide services to
the player to let them modify their deck. The user navigates from dreamscape to
dreamscape, visiting sites and fighting battles to improve their deck on the way
to the final boss.

## Dreamscapes and Dream Guides

A journey takes place on the Dream Atlas, an interconnected web of dreamscapes.
Each dreamscape is a named, themed location with a fixed aesthetic and a
collection of sites. Every dreamscape between the start and the final boss also
has a **Dream Guide** and an **affiliation**; the two fixed endpoints —
Firstlight Meadow at the start and Limbo at the final boss — have neither.

- **Dream Guides** are the NPCs who provide services to the player. Most sites
  are paired with a specific guide (for example, every Card Shop is run by
  Tobias Tanglefur). A guide can be found in *any* dreamscape where their site
  appears, and is always found in their **home** dreamscape. When a guide is in
  their home dreamscape, their power is enhanced and the site they offer is more
  powerful (see [Home Specialties](#home-specialties)).
- **Affiliations** are a type of card a dreamscape is most connected to. Cards
  matching the affiliation are slightly more likely to appear in random card
  draws within that dreamscape, as described in [Affiliations](#affiliations).

The 10 guide dreamscapes fill the layers between Firstlight Meadow and Limbo.
They can appear more than once on the Dream Atlas, but the same dreamscape is
never connected directly to a copy of itself. When a new node is filled,
dreamscapes the player has not yet seen are weighted more heavily than ones that
have already appeared, so repeats are less likely than fresh dreamscapes — but a
repeat can occur at any point, even before all 10 have been seen. See [Dream
Atlas Generation](#dream-atlas-generation) for the assignment algorithm.

The full set of dreamscapes follows. The guide's signature site is always
present and enhanced in their home dreamscape; the same site can also appear,
non-enhanced, in the random fill of other dreamscapes.

### Firstlight Meadow

The starting dreamscape of every dream journey. Firstlight Meadow has no Dream
Guide and no affiliation, and its sites are fixed, giving every run an identical,
uniform on-ramp. Its sites are two [Draft](#draft) sites, a [Dreamsign
Revelation](#dreamsign-revelation) offering a choice of 3 dreamsigns, a
[Purge](#purge) site, and a [Battle](#battle) site fought to 10 points. No fill
sites appear and no site is enhanced.

- **Aesthetic:** A tranquil meadow at sunrise.

### Tumbleleaf Village

- **Dream Guide:** Tobias Tanglefur
- **Signature Site:** [Card Shop](#card-shop)
- **Aesthetic:** A fantasy village with anthropomorphic animals.
- **Affiliation:** Spirit Animals
- **Site Icon:** `boxicons3/store-alt-2`

### Pharaoh's Gate

- **Dream Guide:** Amunet, the Tomb-Keeper
- **Signature Site:** [Dreamsign Market](#dreamsign-market)
- **Aesthetic:** An ancient Egyptian realm.
- **Affiliation:** Erode, Void matters
- **Site Icon:** `boxicons3/pyramid`

### Winterwake Fjords

- **Dream Guide:** Sigrún
- **Signature Site:** [Dreamsign Revelation](#dreamsign-revelation)
- **Aesthetic:** A snowy viking village.
- **Affiliation:** Removal, Dissolve / Banish effects
- **Site Icon:** `boxicons3/meteor`

### Frostforge

- **Dream Guide:** Durgan Forgehammer
- **Signature Site:** [Transfiguration](#transfiguration)
- **Aesthetic:** A dwarven fortress.
- **Affiliation:** Storm / Events matter
- **Site Icon:** `fontawesome/hammer`

### Hope's End

- **Dream Guide:** Deacon Holt
- **Signature Site:** [Duplication](#duplication)
- **Aesthetic:** A rural town experiencing a zombie apocalypse.
- **Affiliation:** Inexpensive Characters
- **Site Icon:** `boxicons3/copy`

### Tsukiren

- **Dream Guide:** Master Takeshi
- **Signature Site:** [Purge](#purge)
- **Aesthetic:** A samurai-era Japanese kingdom.
- **Affiliation:** Warriors
- **Site Icon:** `boxicons3/hot`

### Wilderveil

- **Dream Guide:** Aldric, the Seer
- **Signature Site:** [Augury](#augury)
- **Aesthetic:** An enchanted forest.
- **Affiliation:** Abandon / Sacrifice
- **Site Icon:** `boxicons3/eye`

### The Rust Expanse

- **Dream Guide:** Maddox
- **Signature Site:** [Random Site](#random-site)
- **Aesthetic:** A "Mad Max" post-apocalyptic wasteland.
- **Affiliation:** Survivors
- **Site Icon:** `?`

### Farpoint Station

- **Dream Guide:** Gravok
- **Signature Site:** [Gamble](#gamble)
- **Aesthetic:** A sci-fi outpost on a distant planet, populated by humans and
  aliens (such as Gravok, a crystal/rock creature).
- **Affiliation:** Figments
- **Site Icon:** `boxicons3/coin`

### Grid City

- **Dream Guide:** "Layaway"
- **Signature Site:** [Exploration](#exploration)
- **Aesthetic:** A cyberpunk city.
- **Affiliation:** Discard
- **Site Icon:** `boxicons3/compass` (filled)

### Limbo

The final dreamscape of every dream journey, always occupying Layer 7. Limbo has
no Dream Guide and no affiliation. Instead it is home to **Apollyon, the Doom of
Humanity**, the final boss of Dreamtides. Apollyon appears in many different
forms — each form plays a different deck and takes on its own unique abilities
(see [Boss Dream Avatars](bosses.md)) — but it is always the same named
character. Otherwise Limbo functions like a normal dreamscape: it generates a
random collection of [sites](#dreamscape-generation) drawn from the fill pool,
culminating in the final [Battle](#battle) against Apollyon, which is visited
last. Because Limbo has no home guide, none of its sites are enhanced, and
because it has no affiliation, no affiliation nudge applies to its draws.

- **Aesthetic:** A dark fantasy void at the end of all dreams.

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

An affiliation also influences the opponent encountered at the dreamscape's
[Battle](#battle) site: the assigned opponent Dream Avatar is more likely to bring
a deck matching the affiliation. A battle in Tumbleleaf Village, for example, is
more likely to be against a Spirit Animals deck.

Affiliations are flavor-aligned with their dreamscape (Tumbleleaf Village leans
toward Spirit Animals, Tsukiren toward Warriors), but mechanically they are just
signature card sets and corresponding similarity weights configured in TOML.

## Tides

Journey content uses the layered tide system described in
[Tides](../../tides/tides.md) and implemented by the **tides4** draft pool
algorithm. Each tide is a preconstructed deck of cards with one of three roles:

- **Signature tides** define a Dream Avatar's identity floor and are always
  joined when present.
- **Facet tides** are single-anchor variety engines; a random subset is drawn
  for each run to vary the pool.
- **Neutral tides** are broad fill packages joined as needed to reach the target
  pool size.

Cards are assigned to tides by battle function, not by flavor or surface
terminology. A single card may belong to multiple tides.

For journeys, the important consequences are:

- Each Dream Avatar maps to a signature tide (or none), a set of facet tides, and
  a set of neutral tides.
- At the start of a journey, the player picks 1 of 3 Dream Avatars, and that
  Dream Avatar's tides determine the draft pool for the journey as described in
  [Draft Pool Construction](#draft-pool-construction).
- Draft pools, Dreamsign pools, shops, and reward generators all key off these
  tides.
- Battles themselves use the core
  [battle rules](../../battle_rules/battle_rules.md) resource model: cards are
  paid for with **energy**, and energy production comes from the shared
  **Dreamwell** rather than from tide-specific resources.

Cards and Dreamsigns are tagged with tides.

## Journey Start & Dream Avatar Selection

Dream Avatar selection is the journey-start screen shown before the player enters
the Dream Atlas. The player is presented with 3 Dream Avatars and chooses one to
define the run.

Selecting a Dream Avatar performs all run bootstrap work immediately:

- Add the fixed starter deck.
- Grant the starting essence (200 by default).
- Build the draft pool and Dreamsign pool from the Dream Avatar's tides.
- Generate the initial atlas.
- Make the starting deck available through the deck UI.
- Set Firstlight Meadow as the current destination and enter it directly.

**UI:** Dream Avatars are shown in their full-body "card" representation, with
ability text displayed alongside their 3D models and highlighted tides. The
Dream Avatar cards animate in from a small size in the center of the screen. Each
Dream Avatar does a different humanoid animation within its card frame. A primary
action button appears below each Dream Avatar allowing it to be selected. The
selected Dream Avatar animates to the bottom left of the screen to appear in a
square frame (head only). The other cards animate back to a small size.

## Rarity

Dreamtides does *not* have card rarity. The one exception is a **legendary** tag
applied to certain very strong cards. A card with the legendary tag is capped at
a single copy in a run's draft pool, and the tag is referenced by reward effects
such as Augury offers; it carries no other rarity mechanics.

## Draft Pool Construction

The draft pool is a fixed multiset built from the selected Dream Avatar's tides
using the tides4 algorithm. The same algorithm runs deterministically from a
per-run seed so a given Dream Avatar and seed always produce the same pool.

### Pool Generation Algorithm

At journey start, choosing a Dream Avatar resolves the run's draft pool as follows:

1. Join the Dream Avatar's signature tide, if it has one.
2. Draw a uniformly-random subset of 1 to 3 of the Dream Avatar's facet tides and
   join them. This is the main source of run-to-run variety.
3. Top the bag up with the Dream Avatar's neutral tides until a full pool can be
   dealt.
4. Shuffle the combined bag and deal it into the draft multiset, capped at 2
   copies of any single card (1 copy for [legendary](#rarity) cards). The default
   deal size is 150 cards.
5. Exclude the Dream Avatar's starter cards from the pool.

The resulting multiset is stored as `draftPoolCopiesByCard`. Because facet
selection is random per run, two players with the same Dream Avatar still draft
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
- The draft pool cannot run out: when the multiset is exhausted it is recreated
  from `draftPoolCopiesByCard`, so draft and shop sites can always make an offer.

### Draft Sites On The Map

Each [Draft site](#draft) provides **5 picks** from the ongoing multiset. Early
dreamscapes provide more opportunities to draft than late dreamscapes:

| Layer | Draft Sites |
| ----- | ----------- |
| 1, 2  | 2           |
| 3, 4  | 1           |
| 5, 6  | 0           |

Draft picks and shop stock both spend from this shared multiset. When the multiset
is exhausted it is recreated from `draftPoolCopiesByCard`, so the pool never runs
dry and every draft and shop site can present a full offer. A future iteration may
replace this recreate-on-exhaustion step with a continuous refill algorithm.

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

Four sites — Battle, Draft, Essence, and Dreamsign Reward — have no guide and are
never enhanced.

### Battle

The Battle site is the core gameplay element of Dreamtides, and it allows users
to play a match against an AI opponent. Each battle has an assigned opponent
dream avatar with their own deck. The deck is built programmatically by emulating
the player's own journey — running a simulated journey with that dream avatar's tides
up to the equivalent point in the run, biased toward the dreamscape's
[affiliation](#affiliations) — so the decks the player faces grow stronger as the
journey progresses. Opponents carry no dreamsigns in the early battles of a journey;
from the midpoint onward each opponent brings a single dreamsign, up until the
final boss.
Before the battle begins, the opposing dream avatar is displayed so the user can
understand any special abilities they have. Opposing dreamsigns are also shown.
When the battle completes, the [Victory or Defeat](#victory--defeat) screen is
shown along with any associated battle rewards. Battles use the rules from
[Battle Rules](../../battle_rules/battle_rules.md). Journeys are single elimination
by default, so losing this battle ends the run.

**UI:** The camera pans in to the battle scene. The "full body" card
representation of the enemy dream avatar animates in from a small size at the
center of the battle area. The enemy's deck is present in the center of the
scene. The dream avatar character within the card performs an animation. The
rules text on the enemy dream avatar is displayed, along with any enemy
dreamsigns. A "start battle" button is shown. Clicking the start battle button
causes the enemy dream avatar to animate to their battle position in the small
dream avatar card format (head only, no text). The user dream avatar and user
journey deck animate to their starting positions. The enemy journey deck animates to
its starting position. An opening hand of cards is dealt to both players.

Icon: `boxicons3/sword-alt`

### Draft

The Draft site allows users to add cards to their deck via the
[Draft Pool Construction](#draft-pool-construction) system. Each draft site
provides 5 picks from the ongoing run multiset. Each pick shows 4 unique cards
sampled from the remaining pool, weighted by remaining copies and affiliation
similarity. Revealed cards are spent immediately from the current multiset
whether or not they are chosen; the multiset is rebuilt when exhausted, so the
pool never runs dry.

**UI:** The cards available for the current pick are shown in multiple rows. The
available cards animate in to be selected. Clicking a card animates it to the
journey deck, and the remaining cards animate away as the next offer arrives.
After all picks at a draft site are completed, the camera automatically pulls
back to the map view. Cards are shown with an orange outline.

Icon: `boxicons3/rectangle-vertical`

### Essence

An essence site grants the user a fixed amount of essence, often around 200-300.

**UI:** Unlike with other sites, the camera does not zoom in to essence sites.
Instead the button simply vanishes on click and a purple particle effect
appears, animating in a winding path to the user's essence total and then plays
a 'hit' particle effect when it reaches the bottom left essence total and
updates the quantity of essence shown.

Icon: `boxicons3/diamond-alt`

### Card Shop

The Card Shop is run by **Tobias Tanglefur** (home: Tumbleleaf Village). It is
the primary site for spending essence on cards. The shop offers individual cards
for purchase plus a restock option that refreshes the available choices once,
also for essence.

Shop cards are drawn from the run's tide-based draft pool, in the same manner as
draft picks, and are removed from the draft pool even if not selected. A Card
Shop always shows 5 cards to purchase plus a restock option.

Shop base prices and the overall essence economy are defined in TOML. A card's
median price is around 100 essence, and the restock option always costs 50
essence. The shop implements a random "discount" system where one or more items
can be displayed as being on sale, for between 30% and 90% cost reduction. Effects such as dreamsigns
or augury effects can also modify shop prices.

**Home Specialty.** In Tumbleleaf Village, Tobias sells powerful cards at a
discount, drawn directly from the player's Dream Avatar signature tide.

**UI:** Tobias performs an animation and displays a speech bubble with some
dialog when the camera arrives at this site. The items are displayed in a row,
along with a close button — beside Tobias in landscape mode and below him in
portrait mode. Each item has a purple button under it showing its essence cost.
Clicking the button for a card animates it to the journey deck. One of the options
is a "restock" option; when selected, the items do a staggered scale-down
animation, then the new options perform a scale-up animation in-place. Clicking
the close button completes the site visit and pulls the camera back to the map
screen. The items remain in place visually rather than animating away, but the
site cannot be revisited.

Icon: `boxicons3/store-alt-2`

### Dreamsign Market

The Dreamsign Market is run by **Amunet, the Tomb-Keeper** (home: Pharaoh's
Gate). It is the site for purchasing dreamsigns with essence, and offers a
restock option that refreshes the available choices once for essence. A dreamsign's
median price is around 100 essence, and the restock option always costs 50 essence.
A Dreamsign Market always shows 3 dreamsigns to purchase plus a restock option.

Dreamsigns are drawn from the run's shared Dreamsign pool, which was seeded from
the selected Dream Avatar's tides, and are removed from that pool when shown.

**Home Specialty.** In Pharaoh's Gate, Amunet allows the player to restock the
dreamsign choices once for free.

**UI:** Amunet performs an animation and displays a speech bubble when the camera
arrives. Dreamsigns for purchase are displayed in a row with a close button,
beside Amunet in landscape and below her in portrait. Each dreamsign has a purple
button showing its essence cost; purchasing animates it to the dreamsign display
in the bottom right corner of the screen. A restock option refreshes the choices
with a staggered scale animation. Clicking the close button completes the visit
and returns to the map.

Icon: `boxicons3/pyramid`

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

Icon: `boxicons3/meteor`

### Dreamsign Reward

A Dreamsign Reward site grants the player a specific, pre-disclosed
[known dreamsign](#known-dreamsigns) for free on visit. It has no guide and is
never enhanced. The site appears only on the rare carrier nodes that the atlas
flags with a known dreamsign, where it takes one of the dreamscape's fill slots.
The granted dreamsign was drawn from the run's shared Dreamsign pool when the atlas
was generated, so it is shown on the Atlas node in advance and the player can plan
toward claiming it.

**UI:** On arrival the known dreamsign animates from screen center at a small scale
and then to the dreamsign display in the bottom-right corner of the screen, playing
its acquisition particle effect, after which the camera pulls back to the map.

Icon: `boxicons3/treasure-chest`

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
the journey deck animate to appear in a row via a staggered move animation (they
flip face-up), beside Durgan in landscape and below him in portrait. Each card is
augmented to show the transfigured version being offered, with the card name and
text tinted to the new color. Each card gets a purple "Transfigure" button. When
clicked the other cards fall away, then the selected card animates to screen
center, displays a visual effect specific to the transfiguration, flips over, and
returns to the journey deck in the bottom right. A close button allows the user to
decline.

Icon: `fontawesome/hammer`

### Duplication

Duplication is run by **Deacon Holt** (home: Hope's End). The site shows the user
4 random cards from their deck, and the user may choose one to duplicate, adding a
copy to their deck. The candidate cards are subject to the dreamscape's
[affiliation](#affiliations) nudge.

**Home Specialty.** In Hope's End, Deacon Holt allows the player to pick any card
in their deck to duplicate.

**UI:** Deacon performs an animation and displays a speech bubble. 4 cards from
the journey deck animate to appear in a row via a staggered move animation. A purple
"Duplicate" button appears under each one. Clicking it causes the other cards to
fall away, then a particle effect plays and a copy of the card emerges from the
selected card. The copies animate to the journey deck, and the camera pulls back to
the map. A close button allows the user to decline.

Icon: `boxicons3/copy`

### Purge

Purge is run by **Master Takeshi** (home: Tsukiren). It lets the user pay essence
to permanently remove cards from their deck, thinning out cards that don't fit
their gameplan. Purge also removes [Nightmare](#nightmare): Nightmare cards can
be selected alongside ordinary cards and are removed cheaply or for free.

A Purge site is guaranteed in layers 1, 2, and 3, so early-game deck-thinning is
always available. From layer 4 onward, Purge is not guaranteed but can still appear
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
or more requires a substantial essence reserve. Two cards cost the same as one
standard shop card (100 essence). Up to six cards may be removed in a single
visit. Essence discounts also reduce purge prices. The pricing logic lives in
`src/purge/purge-pricing.ts`.

**Home Specialty.** In Tsukiren, Master Takeshi allows the player to remove up to
3 cards, including Nightmare cards, at no cost.

**UI:** The user's journey deck opens its browser view, showing every card.
Selecting a card gives it a red outline and a price chip showing what that card
costs in the current selection order. A running summary shows the number
selected, the total essence cost, the essence remaining afterward, and the price
of the next card. Cards the player cannot yet afford are dimmed. A red "Purge N
Cards" button at the bottom confirms the removal: essence is spent and the
selected cards are permanently removed.

Icon: `boxicons3/hot`

### Augury

Augury is run by **Aldric, the Seer** (home: Wilderveil). It functions
like a random event in other roguelike deckbuilding games: the player chooses
between two reward options to claim. Augury rewards are pure upside, and
this is where the biggest random effects live — effects that can structurally
change a journey or modify the user's entire deck. The amount of information
revealed about an effect is variable, and some auguries have highly random effects
not disclosed in advance. A close button allows the user to reject the options,
though some auguries explicitly remove it.

**Home Specialty.** In Wilderveil, Aldric offers bigger rewards highly
curated to the player's current deck (for example, transfiguring more cards,
offering more draft choices, or offering more curated strong cards).

**UI:** Aldric performs an animation and displays a speech bubble. The augury
cards animate from the center of Aldric's chest at a small size and are shown
side-by-side (next to him in landscape, below in portrait). A purple button under
each accepts it. Accepting animates the chosen card up to screen center, then
plays a dissolve animation, then shows the effect via a custom animation (for
example, cards fading in and animating to the journey deck for an "add 3 cards"
effect). Once the effect animation completes, the camera pulls back to the map. A
augury card is a circular image that displays its rules text on hover/long press.
For auguries with multiple effects, each animation plays in sequence.

Icon: `boxicons3/eye`

### Random Site

Random Site is hosted by **Maddox** (home: The Rust Expanse). Outside his home,
the site appears as a `?` and deterministically conceals one enhanced site drawn
uniformly from the other Dream Guides' site types. Entering it reveals the
stored destination, preserves the site id, and opens that site's normal
interface with Maddox in place of its resident guide.

**Home Specialty.** In The Rust Expanse, entering Random Site presents Maddox
and three distinct eligible destinations in a glass panel. Each circle exposes
the destination's normal site information on hover, focus, or touch. The player
must choose one; the selected destination opens enhanced with Maddox as host.

Icon: `?`

### Gamble

Gamble is run by **Gravok** (home: Farpoint Station). The player engages in one of
a few wager or "push your luck" style games to win rewards. A wager can win a
larger payout or lose the stake.

**Home Specialty.** In Farpoint Station, Gravok charges no initial fee and offers
bigger payouts.

**UI:** Gravok performs an animation and displays a speech bubble. The wager
interface appears beside him in landscape and below in portrait, showing the bet,
the odds, and the potential reward. The player commits to a wager, an outcome
animation resolves the result (a win animates the reward to the journey deck or
essence total; a loss plays a failure animation), and the camera pulls back to the
map. A close button allows the user to decline before wagering.

Icon: `boxicons3/coin`

### Exploration

Exploration is run by **"Layaway"** (home: Grid City). The player is offered a
card drawn from their deck, then journeys within it by delving into the dream
the card contains.

**Home Specialty.** In Grid City, the site is presented as Enhanced Exploration.

**UI:** Layaway displays a speech bubble while one card rises from the player's
deck, turns face up, and settles beside him in landscape or below him in portrait.
Channeling the card breaks its frame open until the card's dream fills the
viewport. Leaving the dream collapses the art back into the card and returns it
to the deck before the player returns to the map.

Icon: `boxicons3/compass` (filled)

## Home Specialties

When a Dream Guide is in their home dreamscape, their site is enhanced. The
enhancements are:

| Guide | Home Dreamscape | Site | Enhancement |
| ----- | --------------- | ---- | ----------- |
| Tobias Tanglefur | Tumbleleaf Village | Card Shop | Discounted cards drawn from the player's Dream Avatar signature tide |
| Amunet, the Tomb-Keeper | Pharaoh's Gate | Dreamsign Market | Restock the choices once for free |
| Sigrún | Winterwake Fjords | Dreamsign Revelation | Always a choice (never a single random dreamsign), more choices, tailored to the deck |
| Durgan Forgehammer | Frostforge | Transfiguration | Pick any card and any applicable transfiguration |
| Deacon Holt | Hope's End | Duplication | Pick any card to duplicate |
| Master Takeshi | Tsukiren | Purge | Remove up to 3 cards, including Nightmare, for free |
| Aldric, the Seer | Wilderveil | Augury | Bigger rewards, curated to the deck |
| Maddox | The Rust Expanse | Random Site | Choose one of three random enhanced sites |
| Gravok | Farpoint Station | Gamble | No initial fee, bigger payouts |
| "Layaway" | Grid City | Exploration | Enhanced Exploration presentation |

The guide's signature site is always present and enhanced in the home dreamscape.
The same site can also appear in the random fill of other dreamscapes, where the
guide still presents it but the enhancement does not apply. Enhancement details
are configured in TOML.

## Victory & Defeat

By default, journeys are single elimination: if the user loses any battle, the
journey ends immediately in defeat. As described in the
[Meta Progression](meta_progression.md) document, the user may eventually unlock
an exception that allows continuing after a first loss, but that is a
meta-progression reward layered on top of the base rule.

**UI:** When a battle ends, a particle effect plays alongside a sound effect, and
the word "Victory" or "Defeat" is displayed at screen center. The text then
animates upward to reveal a summary panel showing battle rewards earned, journey
statistics, and a button to continue to the Dream Atlas (on victory) or to end
the journey (on defeat).

A Journey ends in victory if the user wins 7 battles. The 7th battle takes place in
Limbo against **Apollyon, the Doom of Humanity**, the final boss of Dreamtides.
Apollyon appears in one of many forms, each with its own unique abilities,
dreamsigns, or custom cards in its deck. See [Boss Dream Avatars](bosses.md) for
details.

### Battle Rewards

Completing a battle always grants an essence reward, which increases as the user
completes more dreamscapes.

## Limits

A journey deck is tuned to land at roughly 30 cards by the end of a run; the limits
below bracket that target.

Journey decks can contain a maximum of 50 cards during battles. If this limit is
exceeded, before the battle starts the user gains the ability to purge cards of
their choice to get back down under 50 cards.

Journey decks must contain a minimum of 25 cards. If the user has not completed
enough drafts to reach this threshold, additional copies of their deck are added
during a battle until they exceed 25 (for example, a player with 9 cards in their
deck will end up with 27 cards during a battle).

Users can have a maximum of 12 dreamsigns at any time. If they would receive
another dreamsign, an overlay is shown and they must immediately purge a
dreamsign.

Users may have only 1 dream avatar.

## Nightmare

[Nightmare](banes.md) is the sole Bane card. It can be given to the user during
a journey through authored effects or as the downside of a losing
[Gamble](#gamble). Nightmare can be removed cheaply
or for free at a [Purge](#purge) site alongside ordinary cards.

## Dream Atlas

The Dream Atlas is the world map players navigate after Dream Avatar selection. It
is a layered, branching path that flows from **Firstlight Meadow** to the **final
boss**, rendered as a 3D web of circular miniature "worlds" joined by glowing
lines. The player carves a single route through it, one dreamscape at a time.

The Atlas is organized into **7 layers**, each a vertical column of stacked
dreamscape nodes. The player visits exactly one node per layer, advancing in
sequence; once a layer is completed the player proceeds to the next layer and the
other nodes in the completed layer are gone for good, with no backtracking. The
default layer shape — itself a TOML layer-spec list, described with concrete
defaults here to show the intended shape — is:

| Layer | Width | Notes |
| ----- | ----- | ----- |
| 1 | 1 | Always Firstlight Meadow, the starting dreamscape |
| 2 | 2 | Both nodes connect back to Firstlight Meadow |
| 3 | 3 | |
| 4 | 3–4 | |
| 5 | 3–5 | |
| 6 | 3–5 | |
| 7 | 1 | Always Limbo, home to the final boss; every layer-6 node connects to it |

The variable widths (layers 4–6) are rolled once at journey start when the atlas
skeleton is built. Because a journey is 7 layers long, the player threads through 7
dreamscapes and fights 7 battles on the way to the final boss. (A meta-progression
unlock can waive Firstlight Meadow's battle; see
[Meta Progression](meta_progression.md).)

Layers are **interconnected** rather than a clean tree. Each node connects forward
to a subset of the next layer's nodes via **forward connections**, so the node the
player picks now determines which nodes become reachable next. Two different
choices in the current layer can still funnel toward some of the same later nodes,
and the routes braid together as they approach the final boss. Connections target
an average of 2 forward edges per node and obey one hard rule: **connections never
cross**. A monotonic backbone guarantees every node has at least one forward and
one backward connection — no orphans or dead-ends — after which extra non-crossing
edges are added at random toward the average, which is a soft target the geometry
may undershoot.

Each node can be in one of five states:

- **Unrevealed**: The skeleton and its connections are drawn, but the node shows an
  empty gray circle instead of a dreamscape icon.
- **Revealed-locked**: The node's dreamscape is shown, but it lies in a future
  layer the player cannot pick yet.
- **Available**: The node is reachable from the player's just-completed node and
  can be chosen as the next destination.
- **Completed**: The player has visited this dreamscape and won its battle.
- **Forgone**: The node was revealed or reachable, but the player committed to a
  different route, so it can never be visited; it renders dimmed.

The player begins inside Firstlight Meadow and enters it directly when the run
begins; the Atlas marks it "You started here" with a slight visual emphasis.
Dreamscapes are revealed by layer: completing layer 1 reveals layers 2 and 3, and
completing each later layer reveals the layer two ahead of it, so the player always
sees the current pick-layer plus one layer of look-ahead. Connections are
**always** visible; only the dreamscape icon inside a node is hidden until the
node's layer is revealed. The final-boss node in layer 7 is **always revealed**
from the start so the player can see their destination. In addition, a bell-curve
random count of **0 to 2** extra nodes (1 being most common), drawn from layers
5–6, is revealed at journey start to allow for planning; these reveals persist for
the rest of the run.

For revealed forward nodes the player can hover or long-press to preview, then
click to zoom the camera in. Each dreamscape previews itself with one primary site
icon on the Atlas: the icon of its home guide's signature site (the enhanced site
it is guaranteed to offer). The dreamscape's name communicates both that
specialized site and its affiliation. Firstlight Meadow is special — it shows its
own flag glyph rather than a site icon. Hovering a dreamscape describes what is
special about it: its guide, its affiliation, and its home specialty. A node that
carries a [known dreamsign](#known-dreamsigns) additionally shows that dreamsign in
its corner and on hover. Site icons use the game-icons.net glyphs and custom SVGs
listed per site above. Winning the final battle wins the journey.

### Dream Atlas Generation

The Dream Atlas is laid out as the 7-layer skeleton described above, generated in
full at journey start: every layer's width is rolled, every node is placed, and all
forward connections are wired before the run begins, so the player can see the
shape of the map immediately. Layer 1 is always Firstlight Meadow and layer 7 is
always Limbo, home to the final boss. Connections follow the non-crossing,
average-2,
backbone-guaranteed-reachability rules described above; layer 1 connects to both
layer-2 nodes, and every layer-6 node connects to the single layer-7 boss.

The skeleton is laid out up front, while the named dreamscape filling each node is
revealed only as its layer is revealed — completing layer 1 reveals layers 2 and 3,
and completing each later layer reveals the layer two ahead of it. Nodes start
**unrevealed**; completing a dreamscape marks it **completed** and promotes the
nodes it connects forward to into the **available** choices, while the other nodes
in the completed layer become **forgone**. The map is never pruned: forgone nodes
remain visible, and the player travels through exactly one node per layer.

**Assigning dreamscapes to nodes.** Which named dreamscape fills each node in
layers 2–6 is chosen, as the node is revealed, by a weighted random draw from the
10 guide dreamscapes (Firstlight Meadow and Limbo are fixed at layers 1 and 7 and
are not part of this draw). Each dreamscape carries a weight that is reduced each
time it is
placed, so not-yet-seen dreamscapes are strongly favored and already-placed ones
become progressively less likely. Every dreamscape keeps a nonzero weight, so a
repeat is possible at any point — even before all 10 have appeared — just much less
likely than a fresh dreamscape. A draw that would place a dreamscape directly
adjacent to a copy of itself is rejected and redrawn. The two layer-2 choices out
of Firstlight Meadow are guaranteed to show different site icons. The layer widths,
the weighting, the connection average, the reveal counts, and how sharply repeats
are discouraged are configured in TOML.

### Known Dreamsigns

A node may rarely carry a **known dreamsign**: a specific, pre-disclosed dreamsign
the player is guaranteed to receive for free upon visiting that dreamscape, awarded
through a [Dreamsign Reward](#dreamsign-reward) site that takes one of the
dreamscape's fill slots. At most **2** known dreamsigns appear on an atlas. Carrier
nodes are eligible in layers 3–6 and are placed with a low probability, hard-capped
at 2 per atlas. The granted dreamsign is drawn from the run's shared Dreamsign pool
and removed from the pool at generation time, so it is never offered elsewhere.
Placement is biased so that, when possible, one carrier lands among the nodes
revealed at journey start, letting the player plan toward it. A carrier node keeps
its guide's signature site icon as its primary Atlas icon and shows the known
dreamsign in its corner and on hover, visible as soon as the node is revealed.

## Dreamscape Generation

Within a dreamscape, sites are generated by drawing from a pool, in a similar
manner to how draft picks are generated. Sites are selected when the dreamscape
becomes available. Each dreamscape contains between 3 and 6 total sites
(configured in TOML).

The contents of a non-starter dreamscape are assembled as follows:

1. **Mandatory sites** are placed first:
   - Exactly one Battle site (visited last).
   - The home guide's signature site, enhanced.
   - A Purge site, in layers 2 and 3 (layer 1, Firstlight Meadow, has its own
     fixed Purge site).
   - Draft sites according to the layer table below.
2. **Fill sites** are then drawn to reach the target site count (within the 3–6
   range) from a pool of the 9 other guides' signature sites (each bringing its
   guide, non-enhanced) plus the generic Essence site. The pool for fill generation
   changes by layer, with new options shuffled in after each dreamscape is
   completed as defined in TOML for that layer; Transfiguration and Duplication, for
   example, become more common later in the journey. When the node carries a
   [known dreamsign](#known-dreamsigns), a [Dreamsign Reward](#dreamsign-reward)
   site takes one of these fill slots.

Limbo uses this same generation process, with two adjustments that follow from
its lack of a Dream Guide: it has no enhanced home-guide signature site among its
mandatory sites, and every fill site it draws is non-enhanced. Its mandatory
sites are therefore just the final Battle against Apollyon (visited last), and
the remaining slots are drawn from the fill pool.

All site types can appear a maximum of 1 time in a dreamscape, with the exception
that there can be up to 2 Draft sites.

Draft sites are deterministic by layer:

| Layer | Draft Sites |
| ----- | ----------- |
| 1, 2  | 2           |
| 3, 4  | 1           |
| 5, 6  | 0           |

Firstlight Meadow does not use this generation process: its sites are fixed at
two Draft sites, a Dreamsign Revelation offering a choice of 3 dreamsigns, a
Purge site, and a Battle site fought to 10 points, with no fill and no
enhancement.

## Implementation Strategy and QA

The overall implementation strategy for the Journeys game mode is to rely heavily
on both *integration testing* and *manual QA*. The integration testing philosophy
should follow what we use for the battle game mode, writing tests that operate
against the real JourneyView/Commands interface. Philosophically, Dreamtides does
not employ unit testing.

The manual QA strategy here is based on validating all changes against a running
instance of the Unity editor using the [abu](../../abu/abu.md) tool. *Every*
change to the Journey game mode should interact with Unity, perform the required
user interactions, and take screenshots of the new UI to check for display
issues. Testing *must* be at minimum performed once on a landscape/desktop
display resolution and once on a mobile/portrait display resolution. The device
can be configured before entering play mode via the `abu set-device` command:
`abu set-device landscape-16x10` or `abu set-device iphone-se`. We should be
interactively building a high-quality `DreamtidesSceneWalker.Journey.cs` scene
`abu` representation during development.
