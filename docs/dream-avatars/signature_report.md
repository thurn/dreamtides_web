# Dream Avatar Signature Card Report

This report traces every Dream Avatar's signature cards from the moment signatures
were first introduced to their present state, and analyses what each change means
in game-mechanics terms.

## How to read this report

**When signatures were introduced.** Signature cards did not exist in the
original `dreamAvatars.toml` (which used legacy tide metadata) nor in the first
version of `dream_avatars.toml`. They were first added in commit `70a4f6ad`
*("Standardize on idf3: move pool metadata between toml and TypeScript",
2026-06-04)*, which gave **20 of the 32 Dream Avatars** a fixed list of **five
signature cards each, referenced by card name**. Throughout this report,
"original signatures" means that `70a4f6ad` snapshot.

**How they reached the present.** The original by-name lists were almost entirely
replaced over the following days:

- `731c9115` *(2026-06-05)* — retargeted signatures to new MTG-analog archetypes.
- `6f1c1fa2` *(2026-06-05)* — expanded the per-signature mapping to draw from the
  full card set.
- `ccb38c99` *(2026-06-07)* — re-keyed all card references onto `cards_v2` UUIDs
  instead of names (names are not unique, so the by-name lists were a latent bug).
- `a98fbb67` *(2026-06-13)* — reworked Edran around three evasive outsiders.

**Comparison method.** Original signatures are resolved by name against
`cards.toml` at `70a4f6ad` (all 100 references resolved to a single card —
no ambiguous names). Current signatures are resolved by UUID against the live
`cards.toml`. "Kept" / "removed" / "added" are computed on **card UUID**, so a
card that was merely renamed or reworded but kept its UUID counts as *kept* (and
is called out where it happens).

**Glyph legend.** ● Energy · ✦ Spark · ⍟ Victory points · ⧗ Counters ·
☪ Exhaust cost · ❖ Fast. Key keywords: *Reclaim* (play from void, then banish on
leaving) · *Ephemeral* (a card drawn with Ephemeral is banished at end of turn if
unused) · *Erode N* (mill N from deck to void) · *Foresee N* (scry-and-reorder) ·
*Offering* (play for 0● by banishing a void card) · *Veil N●* (costs the opponent
N● more to target) · *Phasing* (Materialized: bounce another ally and move) ·
*Awakened* (enters unexhausted) · *Vengeful* (kills the opposing challenger on a
loss) · *Figment* (token).

**Two structural shifts visible across the whole roster:**

1. **From shared staples to bespoke packages.** The original lists leaned on a
   small set of recycled "archetype staples" — *From the Barrow* and *Cascade of
   Reflections* anchored almost every event Dream Avatar; *Dreadweaver*, *Skull
   Weaver*, and *Kindred Sparks* were sprinkled across the sacrifice callers;
   *Celestial Reverie* and *Mountainwatch Alpha* recurred across the character/
   spirit-animal callers. The current lists are largely unique per Dream Avatar and
   built to feed each one's specific ability.
2. **From uniform-5 to variable counts.** Every signed Dream Avatar started with
   exactly five signatures. They now range from **3** (Edran) to **8** (Vrakmoth),
   reflecting deliberate per-identity tuning rather than a fixed template.

Only one Dream Avatar — **Yveth Coravel** — kept her entire original signature set.

---

# Dream Avatars with signature cards

## Kell Tarn, Wreckoner

**Ability:** Once per turn, if there are 7 or more cards in your void, you may play
a character from your void.

**Original signatures (5):** Starsea Traveler (play a ≤2● character from void),
Revenant of the Lost (grant a cheap void character reclaim), Skull Weaver (ally
leaves play → gain 1⍟), Ashborn Necromancer (abandon a character → erode 2),
Abomination of Memory (+4✦ if three or more cheap characters in void).

**Current signatures (6):** Duskreaper (ally dissolved → 1⍟), Warfield Stalwart
(Night figment + abandon → foresee), Wreckborn (Materialized: banish a card from
the opponent's hand), Collapse Protocol (banish up to three cards from the
opponent's void, draw), The Thinning (banish a character from the opponent's
hand), **Skull Weaver (kept)**.

**What changed:** Kept 1, removed 4, added 5 (5 → 6).

**Mechanics analysis:** The original package was a *self-mill-plus-reanimation*
shell — Ashborn Necromancer and Abomination of Memory actively stuffed the void
to switch on the "7+ cards in void" reanimation ability, while Starsea Traveler
and Revenant of the Lost duplicated/enabled the recursion. The current package
pivots toward **attrition and disruption**: three of the new cards (Wreckborn,
Collapse Protocol, The Thinning) attack the opponent's hand and void rather than
filling Kell Tarn's own. The throughline kept (Skull Weaver) plus Duskreaper turn
each death into points. The implication is that void-filling is now expected from
the broader drafted pool, freeing the signatures to provide a grindy
control/point identity on top of the reanimation engine.

## Caedryn, Shrouded Inquisitor

**Ability:** 2●, ☪, Abandon an ally: Materialize a random character with cost 1●
higher from your deck.

**Original signatures (5):** Harborwarden (warrior figments / abandon warriors to
dissolve), Fathomless Maw (abandon → 1⍟), Kindlehorn (abandon → store ⧗ → dissolve
by ✦), Duskwall Delver (recur on a dissolve), Maelstrom Denial (abandon or discard
to dissolve an enemy).

**Current signatures (5):** Duskreaper (ally dissolved → 1⍟), Kindred Sparks (cheap
replay with an allied survivor), Ferryman's Tithe (Offering → dissolve), Entropy
Spike (Dissolved: gain ● or max ●), Watcher in the Ruins (non-figment ally
dissolved → draw).

**What changed:** Kept 0, removed 5, added 5 (5 → 5).

**Mechanics analysis:** Both packages are death-themed, but the axis rotated from
**abandon** (you sacrifice deliberately) toward **dissolved** (broad death
triggers). Caedryn's ability abandons an ally to cheat a slightly larger random
body out of the deck; those random bodies then go to combat and *dissolve*,
switching on the new payoffs (Duskreaper, Watcher in the Ruins, Entropy Spike).
So the loop tightened into "abandon fodder → materialize a body → that body dies →
collect death value," with Ferryman's Tithe and Kindred Sparks supplying cheap,
recurring fodder. The original cards rewarded the abandon directly; the current
ones reward the downstream deaths, making the package read more like a sacrifice/
dissolve aristocrats engine.

## Kragg, Spent-Blood Chieftain

**Ability:** Once per turn, when you abandon an ally, the next character you play
this turn costs 2● less.

**Original signatures (5):** Harborwarden, Duskwall Delver, Fathomless Maw,
Maelstrom Denial, Dreadweaver (abandon two characters → +2✦ and draw 2).

**Current signatures (6):** Grim Reclaimer (abandon → store ⧗ → make warrior
figments), Titan of Forgotten Echoes (reclaimed cards are not banished on leaving),
Sunset Chronicler (ally dissolved → draw), Embersummoner (materialize a figment →
extra ethereal figment), Shardwoven Tyrant (Dawn figment + abandon figments to
dissolve), Fractured Vessel (abandon → spirit-animal figment).

**What changed:** Kept 0, removed 5, added 6 (5 → 6).

**Mechanics analysis:** The original signatures spent *real* characters for value
or removal, which fights Kragg's own engine (you need a steady supply of allies to
abandon for the discount). The current package fixes the fuel problem by becoming a
**figment/token generator** — Embersummoner, Shardwoven Tyrant, Grim Reclaimer, and
Fractured Vessel all manufacture cheap bodies that exist specifically to be
abandoned, feeding both Kragg's cost reduction and Shardwoven's "abandon figments
to dissolve." Titan of Forgotten Echoes layers in a reclaim subtheme so abandoned/
spent cards can return. The package is now self-sufficient instead of cannibalising
its own board.

## Vrakmoth, Ashbroker

**Ability:** Once per turn, when you discard a card, draw a card with ephemeral.

**Original signatures (5):** From the Barrow, Cascade of Reflections, Starfall
Communion (each player wheels their hand for 5), Across the Void (shuffle hand and
void in, draw 5), A New Adventure (draw 2 / discard 2, gain 3●). **All five were
events; the package contained no characters.**

**Current signatures (8):** Wreckborn (non-figment ally dissolved → ember figment),
Shadowbinder (awakened; make awakened ember figments), Keeper of the Lightpath
(grant a ≤3● event in void reclaim), Sorrowful Prince (X● → +X✦), Oblivion Guide
(discard this → it gains reclaim 0●), Oracle of Shifting Skies (play an event →
foresee 1), Architect of Memory (+4✦ and awakened with 3+ events in void), The
Devourer (banish 3 from void → draw).

**What changed:** Kept 0, removed 5, added 8 (5 → 8). The largest expansion on the
roster.

**Mechanics analysis:** The original list was a generic *events-matter / wheel*
package that only loosely intersected Vrakmoth's discard ability — it offered card
churn but no board and no cards that actually *want* to be discarded. The current
eight-card shell is a mixed character-and-event **discard-to-value engine** that
aligns far more tightly: Oblivion Guide is built to be discarded (it returns via
reclaim 0●), Architect of Memory and Keeper of the Lightpath reward events piling
up in the void as a byproduct of looting, and The Devourer converts that void into
cards. Crucially, the package now contains actual characters (ember figments,
Sorrowful Prince as a mana-sink finisher), giving Vrakmoth a board presence his
original all-event list completely lacked.

## Seraveth, Twice-Mourned

**Ability:** When you play your second character in a turn, a character in your
void gains reclaim 2● until end of turn.

**Original signatures (5):** Kindred Sparks, Dreadweaver, Silent Avenger (character
dissolved → 1⍟), Ashwalker (Materialized erode / Dissolved return a void
character), Veil of the Wastes (recur on materializing a survivor).

**Current signatures (6):** Ridge Vortex Explorer (discard this → materialize it),
Silent Gatherer (Veil; Dawn ● per allied figment), Flagbearer of Decay (character
leaves void → shadow figment), The Rising God (8● finisher with
reclaim), Shadowcaller (ally dissolved → survivor figment; self-reclaim),
Sunset Chronicler (ally dissolved → draw).

**What changed:** Kept 0, removed 5, added 6 (5 → 6).

**Mechanics analysis:** Seraveth's ability rewards deploying **two characters in a
turn**, so the package was retuned around reliably putting bodies onto the board:
Silent Gatherer, Flagbearer of Decay, and Shadowcaller all spawn figments, making
the second-character trigger consistent, while the granted reclaim recurs the
fallen. The Rising God adds a top-end reclaim finisher to cash the recursion into a
win. The original package was a looser sacrifice/recursion mix that didn't directly
help hit the two-characters-per-turn condition; the current one is a coherent
go-wide reanimation curve.

## Corvath, the Salvage-Born

**Ability:** Once per turn, when you discard a card, it gains reclaim until end of
turn.

**Original signatures (5):** Cascade of Reflections, From the Barrow, Starfall
Communion, Pulse of Sacrifice (discard your hand, gain 3●), Gleamharvester (discard
→ draw, +✦ on discard).

**Current signatures (6):** Shadowpaw (discard → erode; abandon → return a void
character), Torchbearer of the Abyss (discard → draw and gain 1●), Fleeting Reunion
(gain X⍟; reclaim by discarding X), Part the Veil (erode 4, keep two; discard this →
reclaim 2●), Grotto Seer (Challenge: discard hand, draw 3), Silent Gatherer
(Dawn: return this from void to hand).

**What changed:** Kept 0, removed 5, added 6 (5 → 6).

**Mechanics analysis:** Corvath's ability turns each discarded card into a
recastable resource, and the current package is built to exploit exactly that.
Several signatures are *designed to be discarded* and then reclaimed (Part the Veil,
Fleeting Reunion), and several are discard outlets that pay you for the discard
(Torchbearer draws and ramps, Shadowpaw erodes, Grotto Seer reloads). The original
list shared the generic wheel events with Vrakmoth/Kasane and only Gleamharvester
truly cared about discarding. The redesign converted a loosely-themed value pile
into a focused discard-to-reclaim loop.

## Kael Voss, Recon Commander

**Ability:** 2●, ☪, Discard a card: Materialize a 1✦ survivor figment.

**Original signatures (5):** Ashborn Necromancer, Wasteland Tamer (each player
abandons a non-figment), Dreadweaver, Skull Weaver, Kindred Sparks.

**Current signatures (6):** Emberwatch Veteran (discard → gains vengeful this turn),
Vessel of Echoes (+5✦ with 6+ void cards; reclaim 1●), Salvage Engine (discard →
+2✦), Specter of Silent Snow (Dawn abandon; abandon → draw and +1✦), Resilient
Wanderer (Dissolved draw; Dawn self-return), Paradox Enforcer (banish 7 void → play
from void).

**What changed:** Kept 0, removed 5, added 6 (5 → 6).

**Mechanics analysis:** Kael Voss pays a **discard** to make survivor figments, so
the package shifted off the original abandon staples and onto cards that either
want to be the discard fuel or reward it. Emberwatch Veteran and Salvage Engine
turn the discard cost into combat tempo; discarding fills the void, which then
powers the void payoffs (Vessel of Echoes, Paradox Enforcer). The result is a
discard → tokens → void-value chain that matches the ability, replacing a generic
sacrifice grab-bag.

## Vaela, Ember Among Remnants

**Ability:** When a card leaves your void, a random card in your void gains reclaim.

**Original signatures (5):** Skull Weaver (kept), Ashborn Necromancer, Dreadweaver,
Kindred Sparks, Harvester of Despair (abandon → +1✦).

**Current signatures (6):** Twilight Reclaimer (Dissolved → survivor in void gains
reclaim), Hope's Vanguard (Dissolved → pay 1● to return to hand), Vigil Keeper
(allied survivor dissolved → draw), **Skull Weaver (kept)**, Wasteland Arbitrator
(Materialized: each player discards; reclaim 1●), Stargazer Adrift (abandon → foresee
1).

**What changed:** Kept 1, removed 4, added 5 (5 → 6).

**Mechanics analysis:** Vaela's engine triggers whenever a card **leaves the void**,
so the package was rebuilt around constant void traffic — cards that grant reclaim
(Twilight Reclaimer), recur out of the void (Hope's Vanguard, Wasteland Arbitrator
via its own reclaim), and survivors that turn that churn into card draw (Vigil
Keeper). Each card that gets reclaimed and then leaves play re-triggers Vaela,
creating a snowball. The original list was generic abandon fodder that didn't
specifically cycle the void.

## Edran, the Invocant

**Ability:** ❖ – 4●, ☪: Materialize a 1✦ outsider figment.

**Original signatures (5):** Riftwalker (Materialized: banish a card from the
opponent's hand), Dreaming Groves (discard a chosen enemy event), Lurking Dread
(discard a cheap enemy card), Standoff (pay 5⍟ → dissolve), Keeper of the Tides
(prevent a played card; move).

**Current signatures (3):** Paradox Corps Enforcer (Phasing; allied outsider scores
⍟ → foresee 1 and draw), Vanishing Inquisitor (Phasing; scores ⍟ → draw then
discard), Abyssal Deputy (Phasing; allied outsider scores ⍟ → draw).

**What changed:** Kept 0, removed 5, added 3 (5 → 3) — the only signed Dream Avatar
whose count *shrank*, and the most complete thematic redesign (commit `a98fbb67`).

**Mechanics analysis:** The original signatures had **nothing to do with
outsiders** — they were a generic hand-disruption and removal suite that ignored
Edran's outsider-figment ability entirely. The rework replaced all five with a
tight trio of **Phasing outsiders that reward outsiders scoring victory points**.
Edran's ability manufactures the outsider bodies; the signatures convert each
outsider's points into card advantage, and Phasing keeps them evasive enough to
keep scoring. This is the clearest example in the roster of a redesign moving a
Dream Avatar from "incoherent goodstuff" to "laser-focused tribal payoff," accepting
fewer signatures (3) in exchange for perfect alignment.

## Zeva, the Dredger

**Ability:** ❖❖ – 2●, ☪, Discard a card: An event in your void gains reclaim until
end of turn.

**Original signatures (5):** Dreadwood Emissary (Materialized: grant a void event
reclaim), Break the Sequence (counter and draw), Ridgecutter (bounce and gain 2●),
Clockwork Prodigy (your hand gains offering), Echoing Denial (Offering; counter).

**Current signatures (6):** Paradox Corps Enforcer (Phasing outsider), Planetgazer
(Materialized foresee 2; fast move), Breach Artist (Phasing; return an ally →
discount it 2●), Impending Fury (Night: loot), Last Beacon (outsider figment + scoring
draw engine), Keeper of the Tides (Materialized: prevent a ≤2● card; move).

**What changed:** Kept 0, removed 5, added 6 (5 → 6).

**Mechanics analysis:** Zeva's ability is an **event-reclaim engine fed by
discarding**, and the original list supported it directly — Dreadwood Emissary
literally duplicated her ability, surrounded by counter/tempo events. The current
package is more **outsider/phasing tempo-control**, sharing cards (Paradox Corps
Enforcer, Last Beacon, Keeper of the Tides) with Edran's archetype. Bounce-and-
discount (Breach Artist) and looting (Impending Fury) still pair with the discard/
recur plan, but the package now reads as an evasive tempo shell rather than the pure
event-recursion engine of the original.

## Kasane, Wearer of the Stolen Face

**Ability:** 4●, ☪: Copy the next event you play this turn.

**Original signatures (5):** Archive of the Forgotten (grant up to two cheap void
events reclaim 0●), Cascade of Reflections, Arc Gate Opening (gain 4●), From the
Barrow (kept), Hatching Ground (erode X per card played).

**Current signatures (5):** Nebula's Wake (with 3+ events in void, gain 5●), **From
the Barrow (kept)**, Call of the Lost (figment per card played; reclaim), Inverted
Reflection (discover an event), Flash of Power (gain 5●).

**What changed:** Kept 1, removed 4, added 4 (5 → 5).

**Mechanics analysis:** Kasane wants to **copy a big event**, which costs energy to
set up, so the package leaned into **ramp and selection**: Flash of Power and
Nebula's Wake both burst 5●, letting her pay the 4● activation and still deploy a
high-impact event to copy; Inverted Reflection digs for the right one. Call of the
Lost provides a storm-style payoff (figments scaling with cards played) that the
copy can double. From the Barrow stays as the void-reclaim anchor. The package is a
refinement of the original ritual/copy idea — same skeleton, sharper ramp.

## Rael, Chain Accelerant

**Ability:** When you play your second event in a turn, foresee 2.

**Original signatures (5):** Archive of the Forgotten, Arc Gate Opening, From the
Barrow, Cascade of Reflections, Molten Duel (dissolve a ≤3✦ character).

**Current signatures (5):** The Devourer (banish 3 void → draw), Shadowprowler
(Challenge: discard → +2✦), Pattern Seeker (discard → draw with ephemeral),
Gateweaver (play an event → 1✦ ethereal figment), Scorched Reckoning (dissolve a
≤3✦ enemy).

**What changed:** Kept 0, removed 5, added 5 (5 → 5).

**Mechanics analysis:** Rael rewards **chaining events** (the second event each turn
foresees 2). Notably, the current package is *less* all-event than the original —
Gateweaver turns every event cast into a figment body, so Rael's event chains now
also build a board, and Pattern Seeker/Shadowprowler add discard-loot resilience.
Scorched Reckoning keeps cheap interaction. The shift trades the original pure
spellslinger purity for a package that converts event velocity into permanents and
card flow, giving Rael staying power beyond the combo turn.

## Ovanel, Lector of the Receding Rite

**Ability:** 2●, ☪: If you played an event this turn, draw an event.

**Original signatures (5):** Archive of the Forgotten, Arc Gate Opening, From the
Barrow, Genesis Burst (double your current ●), Broadcast Array (uncounterable; ⍟
per card played).

**Current signatures (4):** Weblight Waif (Materialized: return an event from void),
Somber Flockmaster (Dawn: grant a cheap void event reclaim 0●), Unleashed
Destruction (dissolve a cheap enemy; reclaim 5●), Fell Swoop (dissolve a ≤1✦ enemy;
reclaim by discarding).

**What changed:** Kept 0, removed 5, added 4 (5 → 4).

**Mechanics analysis:** Ovanel's ability is an **event card-advantage faucet**, and
the current package keeps the event tap flowing with recursion (Weblight Waif and
Somber Flockmaster return/reclaim events) while folding in two reclaim removal
events (Unleashed Destruction, Fell Swoop) so the deck has interaction that also
re-buys itself. The original list was more about raw ramp and points; the current
leaner four-card set is a tighter event-value-and-removal loop.

## Yveth Coravel, Scion of the Returning Tide

**Ability:** 2●, ☪: Return an ally to hand. Its cost is reduced by 1●.

**Original signatures (5):** Celestial Reverie, Ambush Operative, Featherlight
Summoner, Skyborne Jellyfish, Mountainwatch Alpha.

**Current signatures (5):** Celestial Reverie, Ambush Operative, Featherlight
Summoner, **Cloudmantle Ray** (was Skyborne Jellyfish — same UUID), **Blood Moon
Triad** (was Mountainwatch Alpha — same UUID).

**What changed:** Kept 5, removed 0, added 0 (5 → 5). **The only Dream Avatar whose
signature identity is unchanged.** Two cards were renamed and lightly reworded
(e.g. "character with cost 2● or less" → "≤2● cost character"), but every UUID is
the same.

**Mechanics analysis:** Yveth's ability bounces an ally to hand at a discount,
which is a *flicker/value* engine: the original package was already built around
Materialized payoffs worth re-triggering (Featherlight Summoner makes a 4✦ figment
on entry, Ambush Operative banishes an enemy on entry) plus a draw engine
(Celestial Reverie) and cheap-character ramp (the renamed Cloudmantle Ray / Blood
Moon Triad). Because the original design already matched the ability cleanly, the
retargeting passes that rewrote everyone else left Yveth essentially alone — a
useful signal that her initial signatures hit the intended mark.

## Grath, Packmaster

**Ability:** 4●, ☪: Gain 1● for each allied spirit animal.

**Original signatures (5):** Mountainwatch Alpha (● per spirit animal), Ethereal
Trailblazer (Dawn: gain 1●), Skyborne Jellyfish (kept, now Cloudmantle Ray), Young
Beastcaller (spirit-animal ramp and draw), Celestial Reverie.

**Current signatures (6):** Vigilant Howler (spirit animal → ⧗ → 3●), Ghostlight
Wolves (Support: +2✦ spirit animals; ● per spirit animal), Eternal Stag (Support:
+1✦ spirit animals; draw a spirit animal), **Cloudmantle Ray (kept)**, Ethereal
Courser (play a spirit animal → return self for 0●), Empyreal Light (awaken an ally).

**What changed:** Kept 1, removed 4, added 5 (5 → 6).

**Mechanics analysis:** Grath is a **spirit-animal ramp payoff**, and the package
doubled down on the tribe. The new cards add a Support backbone (Ghostlight Wolves
and Eternal Stag buff and draw spirit animals from the back rank) and more
ramp/recursion (Vigilant Howler, Ethereal Courser's free redeploys), all of which
grow the spirit-animal count that Grath's ability multiplies into energy. The
original list contained generic ramp filler (Ethereal Trailblazer, Celestial
Reverie) that didn't care about the tribe; the current one is cohesive go-wide
spirit-animal tribal.

## Radulf, Hegemon of Shattered Thrones

**Ability:** With 3 or more allied characters, the first character you play each
turn costs 1● less.

**Original signatures (5):** Ethereal Trailblazer, Celestial Reverie (kept),
Mountainwatch Alpha, Worldsong Behemoth (Dawn: gain 1●), Oathbound Pair
(Materialized/Dawn: +1✦ to an ally).

**Current signatures (5):** Dawnprowler Panther (extra spirit animals → 1●),
Nightprowler Panther (Dawn/abandon → 1●; reclaim), **Celestial Reverie (kept)**,
Mother of Flames (awakened; ☪ + bounce → awaken an ally), Lumin-Gate Seer (Veil;
materialize a character → draw).

**What changed:** Kept 1, removed 4, added 4 (5 → 5).

**Mechanics analysis:** Radulf wants a **wide board** (3+ characters) and a steady
stream of first-of-turn plays to exploit the discount. The current package supports
flooding the board cheaply and turning it into resources: the panthers ramp as you
deploy multiple characters, Lumin-Gate Seer draws as the board grows, and
Celestial Reverie converts the character spam into cards. The original list was
spirit-animal/anthem goodstuff that didn't specifically help reach or exploit the
three-character threshold.

## Demetrios, Strategos of the Phalanx

**Ability:** When you play your second character in a turn, draw a card with
ephemeral.

**Original signatures (5):** Celestial Reverie, Ethereal Trailblazer, Skyborne
Jellyfish, Mountainwatch Alpha, Sunshadow Eagle (kept, now Vigilant Howler).

**Current signatures (5):** Ethereal Courser (play a spirit animal → return self for
0●), Moonbound Wolf (awakened; ☪ + bounce → trigger an allied spirit animal's Dawn),
**Vigilant Howler (kept)**, Nexus Wayfinder (≤2● characters cost you 0●), Nightprowler
Panther.

**What changed:** Kept 1, removed 4, added 4 (5 → 5).

**Mechanics analysis:** Like Seraveth, Demetrios is paid for **playing a second
character each turn**, so the package is loaded with cheap and free redeploys that
make hitting that trigger trivial: Ethereal Courser bounces itself to replay for
0●, Nexus Wayfinder makes every cheap character free, and Moonbound Wolf re-uses
Dawn abilities. Every extra body becomes another ephemeral card. The original
spirit-animal goodstuff didn't specifically chase the two-characters-per-turn
condition; the current one is engineered for it.

## Gunnar Deepforge, The Hammer's Echo

**Ability:** 2●, ☪: Materialize a 0✦ figment copy of the last warrior you played
this turn.

**Original signatures (5):** Crucible Warlord (Materialized: draw a warrior),
Assault Leader (Dawn: +1✦ to each warrior), Flamestride Rider (warriors can't be
dissolved while challenging), Invoker of Myths (materialize a warrior → draw),
Reforged Automaton (draw a warrior; +✦ on non-figment warriors).

**Current signatures (6):** Spellweaver (abandon a warrior → warrior figment),
Riftwalker (abandon self → bounce), Grim Reclaimer (abandon two warriors → draw),
Voidsire (play a warrior → warrior figment), Worldbreacher (☪: warrior figment),
Inspiring Templar (+1✦ per allied warrior; +1✦ to other warriors).

**What changed:** Kept 0, removed 5, added 6 (5 → 6).

**Mechanics analysis:** Gunnar's ability **copies warriors into figments**, so the
package moved from a warrior "anthem and draw" goodstuff shell to a **warrior-figment
token engine** that interlocks with the ability. Voidsire, Worldbreacher, and
Spellweaver flood the board with warrior figments; Grim Reclaimer and Spellweaver
sacrifice them for value; Inspiring Templar scales with the resulting wide warrior
board. The current cards care about *making and using* warrior tokens, which is
exactly what Gunnar's copy ability produces, rather than the original's generic
warrior support.

## Tensho, Daimyo of Lacquered Fury

**Ability:** When the first card you draw in a turn is a warrior, reduce its cost
by 1●.

**Original signatures (5):** Runebound Champion (costs 1● less per warrior), Echo
Technician (event recursion), Dream Garden Visitor (play a warrior from void),
Aftermath Bloom (abandon a warrior → discover a bigger one), Grim Reclaimer.

**Current signatures (5):** Burning Revenant (allied warrior dissolved → return a
cheaper warrior from void), Pit Descender (abandon a warrior → materialize a cheap
warrior from void), Worldbreacher (☪: warrior figment), Cinderblade Legionnaire
(vengeful; Dissolved → return a warrior from void), Vengeance Taker (Dissolved →
dissolve a cheap enemy).

**What changed:** Kept 0, removed 5, added 5 (5 → 5).

**Mechanics analysis:** Tensho's discount triggers on **drawing warriors**, which
rewards a deck that keeps refilling its hand with warriors. The current package is a
**warrior attrition/recursion** shell: Burning Revenant, Cinderblade Legionnaire,
and Pit Descender all return warriors from the void to hand when they die,
reloading exactly the cards Tensho discounts on draw, while Vengeance Taker adds
combat punishment. The original list was warrior cost-reduction and value goodstuff
that didn't specifically replenish the hand; the current one is grindier and feeds
the draw-trigger.

## Valdren, Warhost Exemplar

**Ability:** 2●, ☪: A warrior in your void gains reclaim until end of turn.

**Original signatures (5):** Crucible Warlord, Assault Leader, Wolfbond Chieftain
(awakened; ● per warrior), Invoker of Myths, Flamestride Rider.

**Current signatures (7):** Grim Reclaimer (abandon two warriors → draw), Voidsire
(play a warrior → warrior figment), Dragonward (cost less per warrior; Support: +3✦
warriors), Harbor Warden (Materialized: draw 2), Bloomweaver (Materialized/
Dissolved: draw), Infernal Cavalier (Dissolved → return a warrior from void),
Aspiring Guardian (0● vanilla body).

**What changed:** Kept 0, removed 5, added 7 (5 → 7). The second-largest current
count after Vrakmoth.

**Mechanics analysis:** Valdren's ability is a **warrior-from-void reclaim engine**,
and the broadened seven-card package supplies both the fuel and the payoff: Infernal
Cavalier and Grim Reclaimer push warriors into the void (to be reclaimed), Voidsire
and Aspiring Guardian provide cheap bodies and reclaim targets, while Harbor Warden,
Bloomweaver, and Dragonward turn the recurring warrior board into card draw and a
Support anchor. The original was a tighter warrior goodstuff five; the current set
is a fuller warrior midrange toolkit oriented around the void recursion the ability
enables.

---

# Dream Avatars without signature cards

These twelve Dream Avatars were never assigned signature cards — neither at the
`70a4f6ad` introduction nor today. Their abilities are largely self-contained
engines that function without a bespoke support package; in draft terms they lean
on the general pool rather than a curated signature shell.

## Drusus Calvus, Triumphator
**Ability:** At the start of your first turn, gain 1●. — A flat opening-tempo
boost; no synergy package required.

## Threxan, the Resounding Wrath
**Ability:** At the start of your first turn, draw a card. — A flat opening
card-advantage boost; archetype-agnostic.

## Vethran, Whisperer of Wraiths
**Ability:** 3●, X●, ☪: Discover a card with cost X●. — A repeatable on-curve
tutor; works with any deck, so no fixed signatures.

## Seld Rakor, Standing Orders
**Ability:** At the start of your turn, if there are 3 or more cards in your void,
foresee 1. — A void-fueled selection trigger that supports any void-leaning build
without a dedicated package.

## Ossian, the Reckoning Blade
**Ability:** 2●, ☪, Abandon an ally with 1✦: Draw a card. — A self-contained
sacrifice-to-draw outlet.

## Kaleth, The Dreaming
**Ability:** 2●, ☪: Awaken an ally. — A generic tempo enabler (unexhaust a body to
attack/block immediately).

## Calloway Flint, Cutthroat Admiral
**Ability:** ❖❖ – 4●, ☪: Draw a card. — A fast, repeatable cantrip; archetype-
neutral.

## Senemhet, Lord of the Radiant Court
**Ability:** ▸Dawn: If you have 5●, gain 1●. — A rich-get-richer ramp trigger that
rewards holding energy rather than a specific card package.

## Karev Soltis, Breach Respondent
**Ability:** Once per turn, when the opponent scores ⍟, draw a card unless the
opponent pays 1●. — A reactive control/taxing ability that punishes opposing
scoring; independent of your own deck's theme.

## Tessa, Gleaner of Dust
**Ability:** When you play your second card in a turn, draw a card, then discard a
card. — A built-in loot engine that rewards general tempo, not a curated package.

## Serenath Veyl, Cantor of the Unreal
**Ability:** 1●, ☪: If you materialized a figment this turn, draw a card. — A
figment-payoff cantrip that slots into any figment-generating shell.

## Korrax, Iron Sovereign
**Ability:** ▸Night: Give an ally +1✦. — A recurring anthem-style buff with no
dedicated support cards.

---

# Summary of changes

| Dream Avatar | Original count | Current count | Kept | Removed | Added |
| --- | --- | --- | --- | --- | --- |
| Kell Tarn | 5 | 6 | 1 | 4 | 5 |
| Caedryn | 5 | 5 | 0 | 5 | 5 |
| Kragg | 5 | 6 | 0 | 5 | 6 |
| Vrakmoth | 5 | 8 | 0 | 5 | 8 |
| Seraveth | 5 | 6 | 0 | 5 | 6 |
| Corvath | 5 | 6 | 0 | 5 | 6 |
| Kael Voss | 5 | 6 | 0 | 5 | 6 |
| Vaela | 5 | 6 | 1 | 4 | 5 |
| Edran | 5 | 3 | 0 | 5 | 3 |
| Zeva | 5 | 6 | 0 | 5 | 6 |
| Kasane | 5 | 5 | 1 | 4 | 4 |
| Rael | 5 | 5 | 0 | 5 | 5 |
| Ovanel | 5 | 4 | 0 | 5 | 4 |
| Yveth Coravel | 5 | 5 | 5 | 0 | 0 |
| Grath | 5 | 6 | 1 | 4 | 5 |
| Radulf | 5 | 5 | 1 | 4 | 4 |
| Demetrios | 5 | 5 | 1 | 4 | 4 |
| Gunnar Deepforge | 5 | 6 | 0 | 5 | 6 |
| Tensho | 5 | 5 | 0 | 5 | 5 |
| Valdren | 5 | 7 | 0 | 5 | 7 |

**Takeaways.**

- Of 100 original signature slots, only **12 cards were retained by UUID**, and 5
  of those belong to Yveth Coravel alone. The retargeting was close to a clean
  rewrite of the signature layer.
- The dominant design direction was **alignment**: most Dream Avatars traded
  recycled archetype staples for cards that directly feed their ability's trigger
  (figment generators for the go-wide/abandon callers, discard-fuel and reclaim
  targets for the discard callers, tribal payoffs for the warrior/spirit-animal/
  outsider callers).
- **Edran** is the sharpest single redesign (generic disruption → focused
  Phasing-outsider tribal, shrinking from 5 to 3), and **Vrakmoth** the largest
  expansion (all-event wheel package → an 8-card discard-and-figment engine with an
  actual board). **Yveth Coravel** is the control case whose original design needed
  no change.
