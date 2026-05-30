# Card Duplicate and Near-Duplicate Analysis — `cards_v2.csv`

This report analyzes the 502 card definitions in `docs/cards_v2.csv` for
duplicate and near-duplicate designs, read against the rules in
`docs/battle_rules/battle_rules.md`.

A card's identity for this analysis is its **function** — its rules text plus
the cost, spark, type, and timing (Fast/Interrupt) that text operates on. The
`MTG Name` column is a flavor reference only and is not part of the card's
definition; many rows share a function under different names, and many rows have
no name at all. Cards are referenced below by name where one exists, otherwise as
`(unnamed)`, always followed by their stat line `[cost●/spark✦ type]`.

"Duplicate" and "near-duplicate" are distinguished as:

- **Exact functional duplicate** — identical rules text. Two such cards differ
  only in name and possibly in cost/spark/type/timing. Where even those match,
  the cards are fully interchangeable.
- **Near-duplicate** — the same core effect with a small, deliberate variation
  (a different numeric threshold, an extra rider, a different cost or timing).
  Near-duplicates are grouped into *families*; within a family the cards form a
  design gradient rather than redundant copies, but tightly-clustered members
  are worth reviewing for consolidation.

---

## Part 1 — Exact functional duplicates (identical rules text)

These groups share byte-for-byte identical rules text (after whitespace
normalization). They are the strongest candidates for consolidation or
intentional differentiation.

### 1.1 `▸Dawn: Gain 1●.` — nine cards

The single largest exact-duplicate cluster. All are 1● Spirit Animals; the only
difference is printed spark (0✦ vs 1✦):

| Card | Cost | Spark |
| --- | --- | --- |
| Noble Hierarch | 1 | 0 |
| Arbor Elf | 1 | 0 |
| Elves of Deep Shadow | 1 | 0 |
| Elvish Mystic | 1 | 0 |
| Ignoble Hierarch | 1 | 1 |
| Llanowar Elves | 1 | 1 |
| Boreal Druid | 1 | 1 |
| Fyndhorn Elves | 1 | 1 |
| Birds of Paradise | 1 | 1 |

Functionally there are only **two** distinct cards here: a 1●/0✦ Dawn-ramp dork
and a 1●/1✦ Dawn-ramp dork, each printed four-to-five times. See §2.1 for the
wider mana-dork family (these plus several typo and rider variants).

### 1.2 `When an ally is dissolved, gain 1⍟.` — three cards

| Card | Cost | Spark |
| --- | --- | --- |
| Marionette Apprentice | 2 | 1 |
| Cruel Celebrant | 2 | 1 |
| Zulaport Cutthroat | 2 | 2 |

Marionette Apprentice and Cruel Celebrant are fully interchangeable (same text,
cost, spark, type). Zulaport Cutthroat differs only by +1 printed spark.

### 1.3 `▸Materialized: Draw a card.` — three cards

| Card | Cost | Spark | Type |
| --- | --- | --- | --- |
| Spirited Companion | 2 | 1 | Warrior |
| Elvish Visionary | 2 | 1 | Spirit Animal |
| Wall of Omens | 2 | 0 | Other |

Spirited Companion and Elvish Visionary share identical stats and differ only by
type (Warrior vs Spirit Animal), which matters only to tribal payoffs. Wall of
Omens is the same card at 0✦. See §2.3 for the broader "ETB: draw a card" family.

### 1.4 `Once per turn, you may play a character with cost 2● or less from your void.`

| Card | Cost | Spark |
| --- | --- | --- |
| Lurrus of the Dream-Den | 2 | 2 |
| Ramunap Excavator | 3 | 3 |

Same recursion engine; Ramunap Excavator is a strictly costlier, higher-spark
edition of Lurrus.

### 1.5 `▸Materialized: Banish a chosen card from the opponent's hand until this character leaves play.`

| Card | Cost | Spark | Type |
| --- | --- | --- | --- |
| Tidehollow Sculler | 2 | 2 | Survivor |
| Deep-Cavern Bat | 2 | 2 | Other |

Identical except type. Fully interchangeable outside tribal contexts.

### 1.6 `☪: Draw a card, then discard a card.`

| Card | Cost | Spark |
| --- | --- | --- |
| (unnamed) | 2 | 1 |
| Jace, Vryn's Prodigy // Jace, Telepath Unbound | 2 | 2 |

Identical looter ability; differs only by +1 spark. (The "Merfolk Looter" tag
also covers Conspiracy Theorist, which gates the same effect behind a 2●+discard
cost — see §2.10.)

### 1.7 `Abandon another character: Gain 1●.`

| Card | Cost | Spark | Type |
| --- | --- | --- | --- |
| Warren Soultrader | 3 | 1 | Survivor |
| Phyrexian Altar | 3 | 1 | Other |

Identical free sacrifice-for-energy outlet; differs only by type. Squandered
Resources (§2.8) is the near-duplicate with a cost cap on the abandoned
character.

### 1.8 `Vengeful` + `▸Materialized: Draw a card.`

| Card | Cost | Spark | Timing |
| --- | --- | --- | --- |
| Baleful Strix | 2 | 1 | — |
| Ice-Fang Coatl | 2 | 1 | Fast |

Identical text and stats; Ice-Fang Coatl differs only by being Fast (and its Type
cell is blank — a data issue, see Part 3).

### 1.9 `Gain 3●.`

| Card | Cost | Type |
| --- | --- | --- |
| Black Lotus | 0 | Event |
| Dark Ritual | 1 | Event |

Same ritual effect; Black Lotus is the 0● (net +3) version, Dark Ritual the 1●
(net +2) version. Part of the ritual family in §2.6.

### 1.10 `(no ability)`

| Card | Cost | Spark | Type | Timing |
| --- | --- | --- | --- | --- |
| Ornithopter | 0 | 0 | Other | Fast |
| Memnite | 0 | 1 | Warrior | — |

Two vanilla 0● bodies. Distinct enough (spark, type, Fast) to be intentional.

---

## Part 2 — Near-duplicate effect families

Each family below shares a core effect. Members are listed as a gradient; the
notes call out which members are close enough to read as redundant.

### 2.1 Mana dorks — `▸Dawn: Gain 1●` (≈12 cards)

Beyond the nine exact duplicates of §1.1, the following carry the same Dawn-ramp
core with minor riders:

- **Avacyn's Pilgrim** `[1●/1✦ Spirit Animal]` — text reads `▸Dawn: Gain ●.`
  This is the 1●/1✦ dork with a typo (missing the `1`); functionally identical to
  Llanowar Elves et al. See Part 3.
- **(unnamed)** `[1●/1✦ Other]` — `This character has all character types. ▸Dawn:
  Gain 1●.` The Dawn dork as a changeling.
- **Ornithopter of Paradise** `[2●/2✦ Other]` — `Awakened` + `▸Dawn: Gain 1●.`
  The same dork at 2●/2✦ with Awakened.
- **Sol Ring** `[1●/0✦ Spirit Animal]` — `▸Materialized, Dawn: Gain 2●.` Larger
  payout that also triggers on entry.
- **Mox Opal** `[0●/0✦]`, **Chrome Mox** `[0●/0✦]`, **Mox Diamond** `[0●/0✦]` —
  0-cost dorks delivering the same per-turn 1● via Dawn (Mox Opal gated on three
  spirit animals; Chrome Mox/Mox Diamond pay a banish/discard cost to enter).

**Assessment:** This is by far the most over-represented effect in the file. A
1●-for-recurring-1● dork exists in at least a dozen printings differing only by
spark, type, or a small entry condition. Strong consolidation candidate.

### 2.2 Single-target burn — `Dissolve an enemy with N✦ or less` (≈10 cards)

| Card | Cost | Threshold | Timing / Rider |
| --- | --- | --- | --- |
| Lightning Bolt | 1 | 3✦ | Fast/Interrupt |
| Incinerate | 2 | 3✦ | — |
| Reclamation Sage | 3 (2✦ body) | 2✦ | ▸Materialized |
| Burst Lightning | 1 | 2✦ (5✦ if +3● paid) | Fast |
| Blast from the Past | 2 | 2✦ | Fast, Reclaim |
| (unnamed) | 1 | 1✦ | Reclaim 1● |
| Lava Dart | 1 | 1✦ | Reclaim–discard |
| Prismari Command | 3 | 2✦ | modal Fast |
| Living Twister | 3 (body) | 2✦ | activated, discard cost |
| Asmoranomardicadaistinaculdacar | 2 (body) | 4✦ | activated, abandon cost |

**Assessment:** A healthy gradient by cost/threshold/timing. The closest pair is
the two 1●/1✦-threshold Reclaim burns ((unnamed) `Dissolve…1✦ or less. Reclaim
1●` and Lava Dart `…Reclaim – Discard a card`), which differ only in Reclaim
mode.

### 2.3 ETB card draw — `▸Materialized: Draw a card` (≈6 cards)

Beyond the three exact duplicates of §1.3:

- **Baleful Strix** / **Ice-Fang Coatl** `[2●/1✦]` — add `Vengeful` (see §1.8).
- **Llanowar Visionary** `[3●/2✦ Spirit Animal]` — adds `▸Dawn: Gain 1●`.

The body-draws-a-card-on-entry effect spans 0✦–2✦ at 2●–3●. Spirited Companion
and Elvish Visionary remain the redundant pair.

### 2.4 Materialize **and** Dissolve: draw

| Card | Cost | Spark | Note |
| --- | --- | --- | --- |
| Ichor Wellspring | 2 | 1 | `▸Materialized, Dissolved: Draw a card.` |
| Experimental Synthesizer | 1 | 1 | same, but cards drawn gain Ephemeral |

Near-identical two-for-one draw bodies; Experimental Synthesizer is the cheaper,
downside (Ephemeral) version.

### 2.5 Counters / Prevent (≈14 cards)

All share `Prevent a played card`-type text and are Fast/Interrupt Events (plus
two character-bodied counters). The differentiators are the tax/condition:

| Card | Cost | Differentiator |
| --- | --- | --- |
| Counterspell | 2 | unconditional |
| Force of Will | 5 | Offering, unconditional |
| Force of Negation | 4 | Offering, events only |
| Spell Pierce | 1 | events only, unless pay 2● |
| Spell Snare | 1 | cost ≤2● only |
| Stern Scolding | 1 | character ≤2✦ only |
| Mana Tithe | 1 | unless pay 1● |
| Daze | 2 | Offering, unless pay 1● |
| Mana Leak | 2 | unless abandon ≥3● character |
| Memory Lapse | 2 | + to top of deck |
| Mana Drain | 2 | + card to your hand |
| Remand | 2 | + return to hand, draw |
| Spellstutter Sprite | 2 (1✦) | ▸Materialized, cost ≤2● |
| Flare of Denial | 5 (3✦) | Offering, ▸Materialized |

**Assessment:** A well-spread design space. The two "unless the opponent pays
N●" soft counters (Mana Tithe at 1●, Daze at 2●+Offering) are the most similar
pair conceptually.

### 2.6 Energy rituals — `Gain N●` (≈7 cards)

| Card | Cost | Gain | Net | Note |
| --- | --- | --- | --- | --- |
| Black Lotus | 0 | 3● | +3 | §1.9 |
| Rite of Flame | 1 | 2● | +1 | |
| Dark Ritual | 1 | 3● | +2 | §1.9 |
| Incandescent Ritual | 1 | 4● | +3 | |
| Seething Song | 3 | 5● | +2 | |
| Cabal Ritual | 2 | 5● | +3 | requires 3 events in void |
| Manamorphose | 2 | 2● + draw | 0 + card | cantrip ritual |

**Assessment:** Several of these collapse to the same net energy. Rite of Flame
(net +1) and the various net +2/+3 rituals overlap heavily; Incandescent Ritual
(1●→4●) and Black Lotus (0●→3●) are both net +3.

### 2.7 Hand disruption — discard from opponent's hand (≈6 cards)

| Card | Cost | Scope |
| --- | --- | --- |
| Thoughtseize | 1 | any chosen card |
| Duress | 1 | chosen event |
| Inquisition of Kozilek | 1 | chosen card cost ≤2● |
| Cabal Therapy | 2 | any chosen card, Reclaim 1● |
| Dreams of Steel and Oil | 1 | chosen character, banished |
| Vendilion Clique | 2 (2✦ body) | ▸Materialized, they redraw |

A clean gradient by restriction. Thoughtseize is the unconditional baseline;
the others narrow scope or add a body/recursion.

### 2.8 Sacrifice outlets — abandon a character for value (≈9, "Free Sacrifice")

| Card | Cost | Output |
| --- | --- | --- |
| Warren Soultrader | 3 | Gain 1● (§1.7) |
| Phyrexian Altar | 3 | Gain 1● (§1.7) |
| Squandered Resources | 2 | Gain 1● (abandoned ≤2●) |
| (unnamed) `[3●/2✦]` | 3 | Gain 1⍟ (abandoned ≤2●) |
| Zuran Orb | 1 | Erode 1 (abandoned ≤2●) |
| Umbral Collar Zealot | 2 | Erode 2 |
| Mons's Goblin Waiters | 1 | Store ⧗ → 2⧗: Gain 1● |
| Lotus Petal | 0 | Gain 1● (abandon self) |
| Ashnod's Altar | 3 | Gain 2● (abandon other) |

The three "abandon → Gain 1●" outlets (Warren Soultrader, Phyrexian Altar,
Squandered Resources) are the tight cluster; the rest vary the resource produced.

### 2.9 Self-sacrifice for energy — `Abandon this character: Gain N●`

| Card | Cost | Spark | Gain |
| --- | --- | --- | --- |
| Lotus Petal | 0 | 0 | 1● |
| Lotus Bloom | 2 | 2 | 3● |
| Chromatic Sphere / Urza's Bauble | 1 / 0 | 1 | draw a card (variant output) |

Lotus Petal and Lotus Bloom are the same "sacrifice ritual rock" at two points on
the cost curve.

### 2.10 Looters — draw then discard on tap (≈3, "Merfolk Looter")

The two free `☪: Draw a card, then discard a card` printings (§1.6) plus
Conspiracy Theorist, which gates the same wheel behind `2●, ☪, Discard a card`
and adds a Reclaim rider.

### 2.11 Cantrips — dig + draw Events (≈6, "Cantrips")

| Card | Cost | Effect |
| --- | --- | --- |
| Opt | 1 | Foresee 1, draw |
| Preordain | 1 | Foresee 2, draw |
| Serum Visions | 1 | draw, Foresee 2 |
| Consider | 1 | Foresee 1, draw, Reclaim 4● |
| Ponder | 1 | reorder top 3, draw |
| Thought Scour | 1 | Erode 3, draw |

Preordain and Serum Visions are functionally the same card (Foresee 2 + draw,
order of clauses aside). Opt and Consider differ only by Foresee depth and a
Reclaim rider.

### 2.12 Single-target banish — `Banish an enemy` (≈10 cards)

| Card | Cost | Scope |
| --- | --- | --- |
| Swords to Plowshares | 1 | unconditional |
| Path to Exile | 1 | unconditional, opp gains 5⍟ |
| Solitude | 5 (4✦) | Offering, ▸Materialized |
| Prismatic Ending | X | cost X● |
| March of Otherworldly Light | 2 | Offering, cost ≤3● |
| Portable Hole | 2 (body) | cost ≤2●, until leaves play |
| Skyclave Apparition | 3 (body) | cost ≤4● |
| (unnamed) `[5●/3✦]` | 5 (body) | cost ≤2● |
| Masked Vandal | 2 (body) | warrior only |

Swords to Plowshares and Path to Exile are the closest pair — both 1● Fast
unconditional banish, Path adding the opponent-gains-points drawback.

### 2.13 Cost-based removal — `Dissolve an enemy with cost N● or less` (≈4)

Abrupt Decay (2●, ≤3●), Fatal Push (1●, ≤3● after abandon), Firebolt (1●, ≤2●,
Reclaim 5●), Molten Vortex (activated, ≤2●). A gradient by cost cap and
condition.

### 2.14 Unconditional dissolve with a cost rider (≈8)

`Dissolve an enemy` gated behind an additional cost or condition: Flare of Malice
(Offering), Bone Shards (abandon/discard), Bitter Triumph (discard/5⍟), Snuff Out
(pay 5⍟), Dismember (0● for 5⍟), Galvanic Blast (3 warriors), Lethal Scheme (cost
scales), Ancient Grudge (warriors only). Same "kill anything" payload, each
buying it with a different resource.

### 2.15 Token generators by figment type

- **1✦ warrior figment** (≈7): Retrofitter Foundry, Sai Master Thopterist, Urza,
  Genesis Chamber, Thopter Foundry, Hangarback Walker, Asmoranomardicadaistinaculdacar.
- **1✦ ethereal figment** (≈8): Young Pyromancer, Torens, Lonis, Chatterstorm,
  Hidden Stockpile, Bitterbloom Bearer, Occult Epiphany, (unnamed) figment-payoff.
- **1✦ survivor figment** (≈5): Cryptbreaker, Bridge from Below, Zombie
  Infestation, Headless Rider, (unnamed) survivor.

These overlap heavily *across* types — e.g. "when you play a character,
materialize a 1✦ figment" appears as both warrior (Genesis Chamber) and ethereal
(Torens) editions, differing only in figment subtype.

### 2.16 "When you play an event" payoffs (≈9)

A shared trigger (`When you play an event, …`) with nine distinct payoffs: draw+
discard, awaken all, +1✦ this turn (Jeskai Ascendancy), Foresee 1, store ⧗
(two cards), make a 1✦ ethereal figment (Young Pyromancer), create a 1✦ warrior
figment, Gain 1● (Birgi). A design *space* rather than duplicates, but the two
`store 1⧗` members are near-twins differing only in the counter payoff.

### 2.17 "When you play a character" payoffs

Genesis Chamber (1✦ warrior figment) and Torens (1✦ ethereal figment) share
identical trigger+effect shape differing only by figment type; Blasting Station
and Paradise Mantle both read `When you play a character, store 1⧗` and differ
only in the counter sink.

### 2.18 ETB self-mill — `▸Materialized: Erode N` (≈7)

Undead Butler, Kitchen Finks, Satyr Wayfinder, Goblin Engineer, Aftermath
Analyst, Stitcher's Supplier, (unnamed `2●/2✦`). All seed the void on entry; they
differ in erode depth (1/3/4) and the attached payoff.

### 2.19 Storage-counter removal — `store ⧗ → X⧗: Dissolve an enemy with X✦`

Mayhem Devil (`When you abandon a character, store 1⧗`) and Goblin Bombardment
(`Abandon a character: store 1⧗`) reach the identical X⧗-dissolve sink by nearly
identical means; the (unnamed) `[3●/2✦ Warrior]` `3●: store 1⧗ … X⧗: Dissolve an
enemy with ✦ X or less` is the same engine with a paid store.

### 2.20 Outsider "ninja" bounce package (5)

Ingenious Infiltrator, Yuriko, Ninja of the Deep Hours, Moon-Circuit Hacker,
Thousand-Faced Shadow all share `▸Materialized: Return another ally to hand. Move
this character to that ally's position.` plus an Outsider/score payoff. This is an
intentional mechanical family (the same opening line spans 1●–4●), but the shared
clause is verbatim across all five.

### 2.21 ETB bounce an ally (3)

Whitemane Lion, Kor Skyfisher (+Awakened), Oracle of Kruphix (+rider) share
`▸Materialized: Return an ally to hand.`

### 2.22 Awaken an ally (3)

Quirion Ranger (`☪: Awaken an ally`), Scryb Ranger and Fatestitcher (both
`Awakened` + a tap-to-awaken ability with an extra cost/rider).

### 2.23 Spirit-animal energy taps & lords

- `Gain 1● for each allied spirit animal` — Priest of Titania and the (unnamed)
  `[3●/2✦ Spirit Animal]` (which adds a Support clause).
- `Gain 1● for each allied character` — Circle of Dreams Druid and Gaea's Cradle
  (Gaea's Cradle pays 1● for it); Rofellos is the Dawn-triggered, ≤2● variant.
- `Allied spirit animals have +1✦` — Elvish Archdruid and Leaf-Crowned Visionary
  (each pairs the lord with a different draw outlet).

### 2.24 Self-spark scalers

- `This character has +1✦ for each allied warrior` — Blade of Unity, Master of
  Etherium (adds a warrior anthem), and the two figment-copy makers (the unnamed
  `[3●/2✦ Warrior]` and Digsite Engineer) that *create* a Blade of Unity.
- `+1✦ for each character in your void` — Wight of the Reliquary and the
  (unnamed) `[2●/2✦ Survivor]` (which adds an abandon→erode outlet).

---

## Part 3 — Accidental near-duplicates from data-quality issues

These are cards that *should* be exact duplicates of an existing effect but read
slightly differently because of a typo or inconsistent phrasing. They inflate the
apparent variety and should be normalized.

- **Avacyn's Pilgrim** `[1●/1✦]` reads `▸Dawn: Gain ●.` — missing the `1`. It is
  the 1●/1✦ mana dork of §1.1/§2.1; the text should read `▸Dawn: Gain 1●.`
- **Scrapwork Mutt** reads `Relcaim 2●` — misspelling of `Reclaim 2●`.
- **Valakut Exporation** — name misspelling of "Exploration".
- **Aftermath Analyst** reads `▸Materialize: Erode 3` — should be `▸Materialized:`
  to match the §2.18 self-mill family.
- **One per turn** vs **Once per turn** — the (unnamed) `[2●/3✦ Warrior]` "One per
  turn, when an allied warrior is dissolved…" and Gau, Feral Youth "One per turn,
  when you reclaim a card…" use `One` where every other card uses `Once`.
- **Unholy Heat** reads `✦ less that or equal to` — `that` should be `than`.
- Several cards carry **trailing whitespace** in clauses (`Veil 2● `, `▸Dawn: Gain
  1●. ` on Llanowar Elves, Elvish Mystic, Boreal Druid, Fyndhorn Elves, Birds of
  Paradise). These normalize to the §1.1 duplicate but differ raw.
- **Blank Type cells:** Ice-Fang Coatl, Bitterbloom Bearer, Ingenious Smith,
  Spell Queller, Mons's Goblin Waiters have an empty `Type` column where their
  near-duplicates carry a type (e.g. Ice-Fang Coatl vs Baleful Strix, §1.8).
- **Blank Cost/Spark cells:** Wight of the Reliquary, Ingenious Smith, and
  Bitterbloom Bearer leave Cost and/or Spark empty, unlike their family peers.

---

## Part 4 — Summary

| Group | Cards | Type | Action to consider |
| --- | --- | --- | --- |
| §1.1 `▸Dawn: Gain 1●` dorks | 9 | Exact | Collapse to two stat lines |
| §2.1 wider mana-dork family | ≈12 | Near | Consolidate; fix Avacyn's Pilgrim text |
| §1.2 ally-dissolved → 1⍟ | 3 | Exact | Two are interchangeable |
| §1.3 / §2.3 ETB draw a card | 6 | Exact/Near | Spirited Companion ≡ Elvish Visionary |
| §1.4 play ≤2● from void | 2 | Exact | Ramunap = costlier Lurrus |
| §1.5 banish from hand (body) | 2 | Exact | Type-only difference |
| §1.6 / §2.10 ☪ looter | 3 | Exact/Near | Two free loots identical |
| §1.7 / §2.8 abandon → 1● | 3 | Exact | Warren ≡ Phyrexian Altar |
| §1.8 Vengeful + ETB draw | 2 | Exact | Fast-only difference |
| §1.9 / §2.6 rituals | 7 | Exact/Near | Several share net energy |
| §2.2 burn (N✦ threshold) | 10 | Near | Healthy gradient |
| §2.5 counters | 14 | Near | Healthy gradient |
| §2.7 hand disruption | 6 | Near | Healthy gradient |
| §2.11 cantrips | 6 | Near | Preordain ≈ Serum Visions |
| §2.12 banish enemy | 10 | Near | Swords ≈ Path to Exile |
| §2.15–2.17 token/trigger payoffs | many | Near | Overlap across figment types |
| §2.20 Outsider ninja package | 5 | Near | Intentional family, verbatim clause |

**Highest-value consolidation targets**, in order:

1. **Mana dorks (§2.1).** A dozen printings of "recurring 1● from a 1● body".
   The nine exact duplicates plus the typo/changeling/Awakened variants reduce to
   roughly two intended cards.
2. **Ritual energy (§2.6).** Multiple Events collapse to the same net energy gain.
3. **The exact-duplicate pairs in §1.2–§1.8**, each of which is two names for one
   function separated only by spark, type, or timing.
4. **Data-quality fixes (Part 3)** so that intended duplicates normalize cleanly
   and the figment-type / type-cell variants are consistent.
