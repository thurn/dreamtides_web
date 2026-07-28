# Gravok Gamble Mechanics Brainstorm

Status: unified exploratory design proposal, not an implementation
specification.

Gravok runs the **Gamble** site from Farpoint Station. His site should feel like
a collection of wagers rather than a shop with uncertain prices: the player
knows what is at stake, understands the outcome envelope, and chooses how much
variance or commitment to accept.

This is the authoritative design catalog for Gravok's Gamble mechanics. It
contains both the foundational wagers and the more experimental directions;
the catalog is a content pool, not a recommendation to ship every proposal at
once.

The proposals draw primarily from the supplied Monster Train and Slay the Spire
event catalog, with additional patterns from Roguebook, Wildfrost, and Banners
of Ruin. The broader
[push-your-luck survey](../journey2/gambling-push-your-luck-mechanics.md)
provides supporting genre context.

## Executive recommendation

Gravok should not have one universal dice game. Build a small family of wager
topologies that can wrap state-aware rewards:

1. **A one-shot odds choice** for a fast, legible baseline.
2. **A bank-or-press sequence** for the site's signature emotional peak.
3. **An asset-collateral wager** in which the player chooses what they might
   lose.
4. **A lightweight information minigame** with no dexterity requirement.
5. **A deferred contract** whose result depends on later player behavior.

The recommended launch set is **Crystal Roll**, **Pressure Vault**, **Figment
Reactor**, **Contraband Array**, and **Deck Cut**. Together they establish a
fast one-shot wager, the site's signature bank-or-press scene, chosen
collateral, purchasable information, and player-shaped odds. **Escrow Orbit**
is the recommended first expansion after the game supports deferred contracts.

The other proposals are alternate content and later design space. In
particular, **The Orbit Book** is a richer prize-driven successor to Crystal
Roll, while **Salvage Lock** is a gentler content variant of Pressure Vault.
They should coexist as distinct encounters only if testing confirms that their
different stakes and loss envelopes create meaningfully different decisions.

## What Dream Augury already provides

The current Dream Augury implementation is a strong prize generator but not a
wager generator.

- The Augury builds exactly two free offers, `A` and `B`. The player accepts
  one or declines, and either decision completes the site.
- Seventeen reward archetypes are grouped into six families: grant, improve,
  remove, duplicate, dreamsign, and site. The second offer must come from a
  different family than the first.
- Eligibility and targeting react to the player's run. Card rewards are drawn
  from the resolved draft pool when available; fit, card quality, deck
  centrality, and Dreamsign profiles steer offers toward plausible top-band
  candidates.
- Rewards include individual cards, card drafts, card bundles, transfigured
  cards, card modifications, purges, purge-and-replace offers, duplication,
  Dreamsigns, and new sites.
- Generation is deterministic from the quest seed, site id, deck, held
  Dreamsigns, and debug nonce. Accepting regenerates the encounter and checks
  its signature, offer id, archetype, and selected candidate before applying
  the payload.
- Offer generation logs the eligible archetypes, roll attempts, selected
  families, candidate scores, bands, and targets. This makes a shown reward
  reconstructable from a production log.
- The persisted Augury runtime is intentionally small: completion plus debug
  reroll and forced-archetype fields. The encounter itself is derived from
  current quest state.
- Gamble currently routes to the shared work-in-progress site screen and has
  no wager runtime.

The clean reuse boundary is:

| Reuse from Augury                                   | Add for Gamble                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| State-aware reward archetypes and score signals     | Stakes, affordability, odds, and payout scaling                                |
| Card/Dreamsign chooser models                       | Multi-step phases such as commit, reveal, press, and bank                      |
| Deterministic signatures and stale-action rejection | Persisted pots, collateral, escrow, contracts, and resolved rolls              |
| Atomic reward payloads and composite rewards        | Cost and liability effects such as essence loss, Banes, and temporary rules    |
| Explainability traces                               | Wager logs containing published odds, the actual roll, and before/after assets |

The Gamble site can therefore use Augury archetypes as a **prize oracle**. It
should ask for a suitable prize or prize family, place that prize inside a
wager topology, and freeze the combined wager before the player commits. It
should not take an ordinary Augury offer and apply a generic numeric
multiplier: duplicating an arbitrary payload can become invalid after its first
child resolves, and different reward families scale in different ways.

The current Augury context carries essence but its generator does not use it.
Gamble will need explicit stake eligibility and affordability. It also needs a
broader effect vocabulary than the Augury payload currently exposes, even
though the quest reducer already represents some useful future-facing effects
such as temporary Banes, future battle-reward reductions, shop modifiers, and
Dreamscape site modifiers.

## Site identity

The four offer-and-decision sites closest to this design space have a useful
division. They are a subset of the game's guide-led sites:

- **Dream Augury:** choose one of two pure upsides.
- **Tempting Offer:** exchange a known cost for a known reward.
- **Gamble:** accept uncertainty, escalation, or a performance condition in
  exchange for a larger reward.
- **Temporal Fork:** choose between time horizons or temporary effects.

If both cost and reward are fully determined at the moment of acceptance, the
idea usually belongs to Maddox. If the only tension is waiting, it usually
belongs to Layaway. A Gravok event earns its place by asking the player to price
variance, decide when to stop, risk chosen collateral, act under partial
information, or make a falsifiable bet about future play.

The canonical site definitions in [Quests](../quests/quests.md) assign
temporary deck or game-rule changes and future rewards to Temporal Fork.
Gravok may use the same state primitives only when uncertainty or a performance
condition is the heart of the scene. Remove that wager and the content should
route to Layaway instead.

## Design contracts

### Publish the important uncertainty

Show exact odds when the game can express them cleanly. When specific outcomes
remain hidden, show the complete outcome classes and their counts: “one clean
crate, two crates with a Bane,” not “something bad may happen.” Randomness
should test judgment under uncertainty rather than the player's trust in the
UI.

### Let the player own the risk

Prefer a chosen card, chosen Dreamsign, selected rule, or selected risk tier
over “lose a random valuable thing.” The player should be able to explain why
they made the bet even when the roll goes badly.

### Separate attrition from collapse

Attrition events repeatedly charge a known cost. Collapse events can erase a
banked pot or convert it into a liability. Both are useful, but they produce
very different moods and should be labeled and tuned separately.

### Give pressing and stopping real value

Each step of a push-your-luck event should change both the possible return and
the reason to stop. If taking every step is obviously correct, it is a reward
ladder rather than a wager.

### Price catastrophe with a risk premium

A 25% chance to gain a Bane feels worse than one quarter of a Bane's nominal
value. Balance with expected value plus a variance premium, and keep a few
high-impact losses rare enough to stay memorable.

### Protect the run from accidental invalidation

Every gamble needs a decline path before commitment. Losses should respect deck
floors, Dreamsign capacity, essence affordability, and target availability.
The highest-risk branches may be severe, but the player should never discover
after clicking that the game selected an illegal or irreplaceable target.

### Make the house attractive

A Gamble site consumes a site visit and exposes the run to variance, so its
average return should be positive before considering player preference for
reliability. “The house always wins” is good characterization and poor route
balance if declining every Gravok visit is optimal.

## Immediate and push-your-luck wagers

### 1. Crystal Roll

The simplest Gravok encounter asks for a 50 essence ante, then offers two
published bets:

- **Safe crystal:** 65% chance to receive 120 essence; otherwise the ante is
  lost.
- **Long crystal:** 25% chance to receive 320 essence; otherwise the ante is
  lost.

The values are illustrative tuning targets. What matters is that the player can
compare a reliable modest return with a volatile jackpot in seconds. Because
both branches use the same stake and reward type, Crystal Roll is the cleanest
way to teach Gravok's vocabulary, verify odds presentation, and establish the
site's deterministic resolution and logging contracts.

Crystal Roll should remain a fast encounter rather than grow prize families or
side rules. At Farpoint, Gravok waives the ante and raises both payouts while
preserving their odds. The Orbit Book is the appropriate evolution when this
one-dimensional wager becomes too repetitive.

### 2. The Orbit Book

Gravok shows three face-up prize contracts generated from different reward
families. Each has a published chance and payout scale:

- **Low orbit:** high chance, ordinary reward.
- **Transfer orbit:** medium chance, enhanced reward.
- **Escape trajectory:** low chance, exceptional or composite reward.

The player may place one fixed essence stake on one contract or decline. A miss
loses the stake. This is the direct descendant of Slay the Spire's **The
Joust**, but the object of the bet is a reward family the current deck values
rather than only a gold multiple.

Variant: give the player five equal chips and let them split the stake across
the three contracts. Each funded contract receives one independent roll at its
published chance. Chips on successful contracts pay their listed multiplier;
chips on failed contracts are lost. Diversifying chips lowers variance while
concentrating on the long shot creates the jackpot.

### 3. Loaded Blessing

A valuable prize is guaranteed, but its rider is not. Before accepting, the
player chooses one of three liability envelopes:

- 70% no rider / 30% lose essence.
- 80% no rider / 20% gain a Bane.
- 90% no rider / 10% lose the selected collateral card.

The prize stays constant, so the decision is purely about which kind of tail
risk the run can absorb. This borrows the guaranteed-relic/random-curse shape
of **The Mausoleum** and the “take the treasure, then choose the consequence”
shape of **Golden Idol**.

### 4. Pressure Vault

Gravok seals essence behind a series of pressure locks. After each successful
crack, the player may bank the entire pot or attempt the next lock:

| Lock | Pot if opened | Collapse chance |
| ---- | ------------: | --------------: |
| 1    |    60 essence |              0% |
| 2    |   140 essence |             15% |
| 3    |   240 essence |             35% |
| 4    |   380 essence |             60% |

On collapse, the unbanked pot is lost and the player gains one disclosed Bane.
The first lock guarantees a small floor, while each later lock increases both
the return and the severity of walking away empty. These figures are starting
points for testing, not final balance.

Pressure Vault is Gravok's canonical high-drama bank-or-press encounter. Its
identity is a single fungible pot and a sharp collapse penalty. At Farpoint,
collapse chances drop by one tuning band and the final lock gains a larger pot;
the possibility of losing the unbanked pot remains intact.

### 5. Salvage Lock

Gravok opens a derelict station one compartment at a time. Each successful
search adds a visible reward to the unbanked haul. Before every new compartment
the UI shows its collapse chance and the next possible reward tier. The player
may bank the haul or press deeper.

A collapse loses the unbanked haul and ends the visit; the player's existing
assets remain safe. Later variants may add a small Bane or essence cleanup fee
on the deepest compartments.

This combines **Scrap Ooze**, **Dead Adventurer**, and Monster Train's
**Clipped Wings**. It is the lower-severity, content-rich counterpart to
Pressure Vault: the appeal is seeing a heterogeneous haul grow, while collapse
threatens only that compartment's unbanked rewards.

### 6. Guaranteed Burn

The player pays for repeated attempts at one premium prize. Each miss increases
the next attempt's cost and success chance; maximum commitment guarantees the
prize.

Example curve:

| Attempt |        Cost | Chance this attempt |
| ------- | ----------: | ------------------: |
| 1       |  30 essence |                 20% |
| 2       |  50 essence |                 35% |
| 3       |  80 essence |                 55% |
| 4       | 120 essence |                100% |

The player may leave after any miss. This combines Monster Train's **Archus**
and **Cave of a Thousand Eyes** with Roguebook's escalating **Magic Carpet**
odds and the three-attempt cap of Banners of Ruin's **Gambler**. The guarantee
makes maximum commitment a budget decision instead of an unbounded streak of
bad luck.

### 7. The Sixfold Wheel

The wheel contains six fully disclosed wedges built for the current run:

- a strong reward;
- a modest reward;
- essence;
- a useful card transformation;
- an immediate liability;
- a temporary rules liability.

Before spinning, the player may pay essence to rotate one adjacent pair of
wedges, replacing one liability with a weaker reward while also reducing the
jackpot. The minigame is deciding whether to buy down variance, not timing a
physical spinner.

This keeps the spectacle of **Wheel of Change** and Roguebook's **Wheel of
Chaos**, while adding one strategic action before the random resolution.

### 8. The Conveyor

Gravok presents a deterministic reward line whose prices accelerate faster
than its rewards. After every purchase, the player may stop or unlock the next
offer:

| Pull |        Cost | Guaranteed reward             |
| ---- | ----------: | ----------------------------- |
| 1    |  30 essence | one card chosen from four     |
| 2    |  50 essence | one card from a stronger pool |
| 3    |  70 essence | one card plus 60 essence      |
| 4    | 100 essence | one Dreamsign                 |

The exact rewards are frozen before the first purchase. The tension is
attrition rather than collapse: each pull is individually acceptable, but
buying the entire line may consume the resources needed for later sites. The
UI should keep total spend visible beside the next marginal cost so the wager
is about budget discipline, not arithmetic.

The Conveyor belongs at Gamble because the player repeatedly decides whether
to escalate exposure after seeing what they have already won. If tuning makes
the whole sequence an obvious purchase, it has become a Tempting Offer and
should be redesigned. At Farpoint, the first pull is free and the later reward
tiers improve, while their escalating costs remain.

### 9. Overclock Wager

Gravok places 80 essence in a capacitor. The player may cash out or overclock
it through a visible sequence—80, 160, 320, then the 500 essence cap—gaining
one Bane with every overclock.

There is no random roll. The risk is converting immediate wealth into
cumulative deck pollution whose future cost depends on the run. Before each
decision, the UI shows the next payout, every Bane that will be added, and the
total Banes already accepted. This is a wager on whether the deck can absorb
the liability, not a disguised purchase with an obscured price.

Overclock Wager is the deterministic extreme of Gravok's escalation identity.
It should be tuned so at least two stopping points are defensible for common
deck states. At Farpoint, the first overclock adds no Bane and the last tier
may pay a non-essence premium when the essence cap would flatten the decision.

## Asset-collateral wagers

### 10. Figment Reactor

Gravok displays four eligible deck entries and asks the player to stake one.
The selected entry is frozen by id before the reactor resolves:

- 50%: return the original and add one duplicate.
- 50%: remove the selected deck entry.

After a successful duplication, the player may stop or overcharge the reactor.
Overcharge has a 35% chance to add a second duplicate and apply one disclosed
transfiguration to all resulting copies; on failure, one added copy is removed
and the original remains intact.

This is the launch set's clearest chosen-collateral wager. The first roll has a
severe but legible downside, while the second decision risks only newly created
value. Eligibility must protect deck floors and exclude entries the rules do
not permit removing or duplicating. At Farpoint, the first duplication chance
rises to 70% and a failed first roll returns the original unchanged.

### 11. Collateral Auction

The player offers one deck card or Dreamsign as collateral. Gravok evaluates
the asset's quality band and reveals a correspondingly scaled prize. The roll
then produces one of three published outcomes:

- collateral returned and prize granted;
- collateral exchanged for the prize;
- collateral returned in a modified form and the prize reduced.

Scaling the offer from the selected asset prevents the degenerate strategy of
staking a disposable starter for a premium jackpot. This draws from **Bonfire
Spirits**, **N'loth**, and Monster Train's relic traders, where the identity and
value of the sacrificed object matter.

### 12. Fivefold Mirror

Gravok offers a chosen card two reflections:

- **Stable reflection:** gain one ordinary duplicate.
- **Shatter the mirror:** gain five temporary duplicates for the next two
  battles, then roll how many become permanent; a bad roll also scars one
  retained copy with a disclosed negative modification.

The original card is protected. The risky branch creates a short burst of
power and a chance at lasting value without turning one failed click into the
loss of the player's build-around card. This riffs on Monster Train's
**Mysterious Mirror** and **Fissure**.

### 13. The House Chooses the Category

The player chooses a sacrifice class—starter, Event, Character, transfigured
card, or Dreamsign—and sees the prize before committing. Gravok then selects a
random eligible object within that class.

Narrower, more valuable classes buy stronger rewards. The category is player
controlled while the exact asset is at risk, producing a middle ground between
chosen and fully random loss. The UI must show every currently eligible object
before the player commits.

## Information and tabletop minigames

### 14. Contraband Array

Three face-down cargo crates contain desirable card or Dreamsign rewards. Two
also contain a Junk/Bane rider; one is clean. The player may:

1. scan one crate for free;
2. pay essence to scan another;
3. take one revealed or unrevealed crate; or
4. walk away.

The distribution is public and frozen before interaction. This directly adapts
Wildfrost's **Gnome Traveller**, but lets the player purchase information
instead of making the hidden penalty a pure guess.

### 15. Match and Keep

Lay out twelve face-down tokens: several reward pairs, one Bane pair, and one
mixed “wild” pair. The player gets five attempts to reveal two tokens. Matching
a pair banks it; unmatched tokens turn face-down again. The player may stop
after any successful match.

This is the Slay the Spire **Match and Keep** event adapted to Dreamtides
objects. It is a deliberately more game-like Gamble scene, but remains
turn-based, touch-friendly, deterministic, and easy to replay from the room
log.

### 16. Signal Auction

Two face-down, state-aware Augury prizes are generated and frozen. Gravok gives
one poetic clue about each prize's family or target. The player can spend
essence to reveal increasingly precise facts:

- reward family;
- target class or quantity;
- exact reward.

The player may claim one prize at any point, with earlier claims receiving a
bonus multiplier. The gamble is whether to preserve value by acting on partial
information or pay to eliminate uncertainty.

This turns the existing reward algorithm's explainability data into a player
facing information game. It is especially on-theme for a dream guide who knows
the odds but enjoys selling certainty.

### 17. Quantum Hand

Deal five face-up symbols derived from real card attributes: card type,
subtype, energy band, Fast, Reclaim, and transfiguration color. The player may
hold any symbols and pay once to redraw the rest. Reward quality follows
published combinations such as:

- pair: essence;
- three matching card types: curated draft;
- three distinct subtypes: transfiguration;
- low/mid/high energy straight: premium card modification;
- five-symbol “constellation”: premium Dreamsign or composite reward.

The hand does not add the dealt cards to the deck; it only determines the prize
table. This is a poker-like minigame using vocabulary the player already reads
in deckbuilding, without reaction timing or opaque probability.

## Deferred and performance wagers

### 18. Escrow Orbit

The player gives Gravok a chosen card for two battles. It is absent from the
deck while escrowed. The exact maturity table is visible before acceptance:

- Recall after one battle: the card returns with a modest improvement.
- Wait for two battles: roll between a premium transfiguration, a synergistic
  duplicate, and the original card plus an essence consolation.
- Pay essence at any time to break escrow and recover the original immediately.

This adapts Monster Train's **Abandoned Winged → Heaven's Aid → Heaven's
Finest** and **Lifemother's Remnant**. The risk is playing short-handed now
plus a published maturity roll. If the outcome becomes fixed and the only
decision is how long to wait, the concept belongs to Temporal Fork.

### 19. The Bane Bond

Gravok adds one visible temporary Bane to the deck and opens a bond:

- after one victory, cash it for a modest prize;
- after two victories, cash it for a strong prize;
- after three victories, the Bane transforms into a unique positive card or
  Dreamsign.

Purging the Bane closes the bond with no payout. The player is betting that
they can tolerate deck pollution long enough to reach maturity. This borrows
the “keep this object for several battles” commitment of **Armageddon
Battlefield** while giving Purge a meaningful early-exit interaction. Gravok's
version should add a published chance of bond default at each maturity step;
without that uncertainty, this is Temporal Fork content.

### 20. Borrowed Victory

Take a premium reward immediately. In exchange, Gravok receives a percentage
of the next two battle payouts. The exact future payment depends on how rich
those battles would have been, and the UI shows a pessimistic and optimistic
range.

The player is effectively short-selling future rewards to stabilize the deck
now. This uses a future battle-reward modifier the quest state can already
represent, but frames it as a wager on the unknown size of those future
payouts. A fixed future payment for a fixed reward belongs to Tempting Offer or
Temporal Fork.

### 21. Next-Battle Contract

Choose one visible contract for the next battle:

- win with a reduced opening hand;
- win while carrying two temporary Banes;
- win with a lower essence reward guaranteed and a large bonus for reaching a
  score margin;
- win after selecting one card to keep in escrow.

The contract pays only if its condition survives to battle completion. The
player chooses the handicap that their deck is best positioned to beat. This
captures the self-selected difficulty of **Battleworn Dummy** and the
double-or-nothing escalation of **The Colosseum** without starting a battle
inside the site.

### 22. Open-Deck Parlay

Gravok proposes three measurable feats based on the current deck, such as
playing three distinct Events, scoring with a chosen card, materializing a
specified number of Figments, or ending a battle with no Banes in hand. The
player chooses one feat and stakes essence on completing it during the next
battle.

Harder feats pay a generated Augury reward; easier feats pay essence. Internally
all card references use UUID and deck entry id, resolving names only for
display. A contract is offered only when its trigger is observable and
achievable from the current deck.

## Ambitious and unexpected directions

### 23. House Rules

Gravok reveals three temporary rules changes and the premium reward attached to
each. Examples:

- both sides draw an extra card, but the player's hand limit is lower;
- all Characters enter with a Figment, but Figments count against a new
  instability threshold;
- unused energy carries between turns, but the opponent begins closer to the
  score target;
- every Event is Fast, but Reclaim costs are increased.

The player is not gambling on a hidden roll; they are gambling that their deck
exploits a systemic rule better than the opponent. Gravok's version must attach
a falsifiable performance contract—for example, the premium reward pays only
if the player wins above a score margin under the selected rule. A temporary
rule granted for a deterministic price belongs to Temporal Fork. This is
high-leverage, memorable design space and should be built from a small authored
rule library, not arbitrary effect composition.

### 24. Gravity Sling

Gravok enhances one known future Dreamscape node with a premium site or reward,
then locks the player's next Atlas choice to that node. The wager trades route
optionality and matchup choice for visible power.

A riskier version lets the player choose between two locked destinations:
one receives a guaranteed ordinary reward, while the other receives a random
premium site drawn from a disclosed pool. This treats navigation freedom as a
real asset rather than another essence denomination.

### 25. Pilot and Navigator

In a two-player room, one player controls the stake or risk tier while the
other controls whether to bank or press after each result. Roles swap after
each step. Either player can end the wager, but neither can unilaterally choose
both exposure and greed.

The mechanic uses visible sequential decisions rather than secret votes, so it
fits the shared room event log. In solo play, the player chooses both roles.
This is less about probability depth than making co-op negotiation part of the
wager.

### 26. Gravok's Running Jackpot

A portion of every lost essence stake enters a run-local jackpot. Future Gamble
visits show the pot, and rare wager outcomes can claim it. If the route contains
no later Gamble, a bounded fraction converts into a final-boss or quest-end
payout.

The jackpot gives bad luck memory and creates a run-spanning relationship with
Gravok. It also acts as a soft pity system without changing the published odds.
This needs careful caps so deliberately losing small bets cannot manufacture a
dominant future reward.

### 27. The Algorithm's Tell

Gravok displays three proposed rewards and three short explanations of why the
Augury algorithm values them for the current deck. Two explanations are
accurate and one is fabricated. The player picks the false explanation:

- correct: choose one of the three rewards;
- incorrect: receive the associated reward with a disclosed liability;
- pay essence: eliminate one explanation before answering.

This is a deck-knowledge puzzle built from real fit, centrality, and Dreamsign
coverage signals. It would need plain-language clues and strong accessibility
testing, but it is a distinctive way to turn internal recommendation logic into
play.

### 28. Deck Cut

Gravok calculates exact odds from the player's current deck, then cuts the
shuffled deck once. The top card's visible property resolves the wager:

- Event versus Character;
- low, mid, or high energy;
- a selected subtype versus every other subtype;
- Fast or Reclaim versus neither.

The player chooses which property to bet on and sees its exact frequency before
committing essence. Payouts rise as the matching portion of the deck shrinks.
This makes deckbuilding itself a form of odds-crafting: the player owns the
distribution rather than merely choosing from a house-authored table.

The reducer should select by deck entry id from a deterministic shuffle. Card
UUIDs and entry ids remain the authoritative identity even when several copies
share a displayed name.

### 29. Sealed Reserve

Gravok shows the family and quality band of a hidden prize. The player names an
essence bid. A hidden reserve price is drawn from a fully published
distribution:

- bid at least the reserve: pay the bid and receive the prize;
- bid below the reserve: lose a small listing fee and reveal the reserve;
- pay for one appraisal clue before bidding, or walk away.

This is a valuation game rather than an odds-selection game. The player weighs
how much the partially described reward is worth to this run and how
aggressively to avoid missing it.

### 30. Bad-Omen Hedge

Before the next battle, bet on an outcome the player does not want: the opponent
reaching a score threshold, the battle lasting past a turn limit, or a
temporary Bane being drawn. If the run begins to go badly, the wager pays
essence or a recovery effect; if the battle goes cleanly, Gravok keeps the
stake.

This is genuine insurance rather than another success bonus. It diversifies the
site's emotional texture because the payout softens a bad battle instead of
compounding a winning run.

### 31. Buyback

Offer a reward already claimed earlier in the run as collateral. Gravok rolls
for a strictly better version from the same family:

- an ordinary card becomes a transfigured copy;
- a Dreamsign becomes a premium matched Dreamsign;
- an added site becomes enhanced;
- a duplicate becomes a curated two-card package.

A failed buyback returns the original in a temporary weakened state or charges
the disclosed essence stake. This turns the player's own history and possible
regret into the wager instead of generating another unrelated prize.

## Insurance side bets

Any immediate Gravok wager may optionally expose a small, consistently priced
hedge: pay essence to convert the worst outcome into a partial refund, protect
chosen collateral, or keep the first banked reward on a bust. Insurance should
not change the published odds; it changes the loss severity.

This second-order decision lets risk-averse players engage with the site and
gives Gravok another characterization beat: he sells both danger and certainty.
The premium must be calculated from the exact wager manifest so buying
insurance is a tradeoff rather than an automatic click.

## Gravok's Farpoint specialty

Farpoint should improve each topology in a way that preserves its decision:

- waive an initial ante, but keep any press costs;
- improve published success odds by one tuning band;
- protect the first banked reward from collapse;
- provide one free scan or clue in information games;
- return collateral unchanged on the worst result;
- add a premium payout tier rather than simply doubling essence;
- offer three contracts instead of two.

The specialty should make Gravok feel generous at home without turning the site
into a second Dream Augury.

## Recommended delivery portfolio

The launch set should prove five distinct contracts without requiring deferred
effects:

| Encounter        | What it proves                                                  |
| ---------------- | --------------------------------------------------------------- |
| Crystal Roll     | odds display, stake payment, deterministic resolution, and logs |
| Pressure Vault   | persisted press-or-bank state, pot growth, and collapse         |
| Figment Reactor  | chosen card collateral, target validation, and atomic mutation  |
| Contraband Array | frozen hidden information, paid reveals, and touch interaction  |
| Deck Cut         | exact state-derived odds and deck-entry-based resolution        |

This set is deliberately small enough that each encounter can have a distinct
presentation and result cadence. Crystal Roll is the implementation control
case; Pressure Vault is the emotional centerpiece; the other three prevent the
site from reading as an essence casino.

The first expansion should add **Escrow Orbit** to prove card custody and
battle-count callbacks, then **The Orbit Book** to connect wagers to the full
Augury prize generator. **Salvage Lock** is valuable after Pressure Vault has
established whether heterogeneous reward pots feel different enough to justify
a second collapse encounter.

The remaining catalog can be selected according to the system it exercises:
information scenes (**Match and Keep**, **Signal Auction**, **Quantum Hand**),
future battle contracts (**Bane Bond**, **Borrowed Victory**, **Next-Battle
Contract**, **Open-Deck Parlay**, **Bad-Omen Hedge**), and high-cost bespoke
content (**House Rules**, **Gravity Sling**, **Pilot and Navigator**,
**Gravok's Running Jackpot**, **The Algorithm's Tell**).

## Generation and persistence implications

The Gamble site needs a persisted manifest or an equivalently signed,
deterministically regenerable state machine. A useful conceptual shape is:

- wager type and tuning version;
- exact prize specifications;
- exact stake and eligible target ids;
- published outcome table;
- phase and step;
- banked and unbanked value;
- committed collateral or escrow ids;
- resolved random draws;
- completion state.

Anything both players must agree on belongs in the room event log. UI animation,
hovered crates, and local previews can remain presentation state. Suggested
intent events include:

- open or initialize wager;
- choose stake or collateral;
- commit;
- reveal or purchase information;
- press, bank, or recall;
- accept a future contract;
- resolve the current wager step.

Random outcomes should be produced inside the deterministic reducer/provider
path, never from React state or `Math.random()`. Resolution should apply stake,
liability, and reward atomically so two clients cannot observe a paid stake
without its result.

Every production wager should answer these questions from logs alone:

- What wager and tuning version appeared?
- What state made it eligible?
- What odds and outcome classes were shown?
- What asset ids did the player stake?
- What decision did each player submit, and at which sequence number?
- What random draw resolved the wager?
- What was banked, lost, returned, or deferred?
- Which reward-generation trace produced the prize?

Card identity in state and logs should remain UUID- and entry-id-based. Names
are display-only.

## Tuning questions

The most important playtest questions are:

1. How positive must baseline expected value be before players willingly route
   through Gamble?
2. Which loss type creates exciting regret rather than run-killing resentment:
   essence, a Bane, temporary weakness, future reward tax, or chosen collateral?
3. How often should Gravok present a one-shot wager versus a multi-step scene?
4. Should the exact outcome roll occur at site generation, at commitment, or
   step by step? The player-facing result is identical, but logging,
   multiplayer contention, and preview stability differ.
5. Can information games remain fast on repeat visits, or should they be rare
   showcase events?
6. Which contracts can be validated as achievable without making the game solve
   the deck for the player?
7. How much of the Augury prize generator can be reused directly before Gamble
   needs its own magnitude-aware prize recipes?
8. Which future-facing and rules-changing concepts remain recognizably Gravok
   after applying the Temporal Fork boundary?
