# Card Associations in Draft Decks

For each card below, this lists the five cards **most uniquely associated** with it
across the real draft decklists — each seat's mainboard in
`docs/draft_records_adapted` (bundled by UUID to `public/decklist-ids-data.json`). The goal is
to surface the cards that specifically signal a card's archetype, not the
generically powerful staples that show up in every deck.

## Method

Each deck is treated as a set of unique card names. For a target card `A` and a
candidate `B`, the association score is **lift**:

```
lift(A, B) = P(B | A) / P(B)
```

A lift of 1.0 means `B` appears alongside `A` no more often than chance; higher means
`B` is disproportionately drawn toward decks running `A`. Because lift divides out a
card's overall popularity, ubiquitous staples (Sol Ring, fetchlands, Lightning Bolt,
basic lands) score low and archetype-defining payoffs score high.

To keep the signal meaningful, a candidate must co-occur with the target in at least
`max(3, 15% of the target's decks)` decks and appear in at least 4 decks overall;
this filters out one-off cards that would otherwise post inflated lift on tiny samples.

Counts read as `co = X/Y`: the candidate appears in `X` of the `Y` decks that run the
target.

---

## Luminarch Aspirant
_(87 decks — White aggro / hatebears)_

1. **Giver of Runes** — lift 7.53, co 38/87
2. **Skyclave Apparition** — lift 7.10, co 39/87
3. **Thalia, Guardian of Thraben** — lift 6.47, co 36/87
4. **Anafenza, Kin-Tree Spirit** — lift 6.38, co 27/87
5. **Spirited Companion** — lift 6.29, co 28/87

## Lurrus of the Dream-Den
_(73 decks — Orzhov aristocrats / value)_

1. **Cruel Celebrant** — lift 6.93, co 22/73
2. **Hidden Stockpile** — lift 6.35, co 17/73
3. **Tidehollow Sculler** — lift 5.62, co 14/73
4. **Dreams of Steel and Oil** — lift 4.72, co 10/73
5. **Zulaport Cutthroat** — lift 4.67, co 23/73

## Viscera Seer
_(52 decks — Black aristocrats / sacrifice)_

1. **Cruel Celebrant** — lift 7.07, co 16/52
2. **Gravecrawler** — lift 7.02, co 24/52
3. **Flare of Malice** — lift 6.90, co 15/52
4. **Shambling Ghast** — lift 6.89, co 11/52
5. **Midnight Reaper** — lift 6.67, co 21/52

## Phyrexian Altar
_(43 decks — sacrifice combo engines)_

1. **Spawning Pit** — lift 11.68, co 6/43
2. **Vizier of Remedies** — lift 6.81, co 8/43
3. **Fecundity** — lift 5.84, co 6/43
4. **Chatterfang, Squirrel General** — lift 5.45, co 8/43
5. **Witch's Oven** — lift 5.28, co 6/43

## Inti, Seneschal of the Sun
_(70 decks — Rakdos aggro / discard-attack)_

1. **Anax, Hardened in the Forge** — lift 8.93, co 16/70
2. **Chandra, Acolyte of Flame** — lift 7.49, co 17/70
3. **Blazing Rootwalla** — lift 6.98, co 15/70
4. **Dragon's Rage Channeler** — lift 6.18, co 24/70
5. **Grim Lavamancer** — lift 6.17, co 21/70

## Vengevine
_(46 decks — graveyard recursion / Hogaak)_

1. **Basking Rootwalla** — lift 11.89, co 7/46
2. **Insidious Roots** — lift 10.31, co 17/46
3. **Scourge of Nel Toth** — lift 7.73, co 17/46
4. **Bridge from Below** — lift 7.46, co 12/46
5. **Fecundity** — lift 7.28, co 8/46

## Containment Construct
_(31 decks — Rakdos discard / madness)_

1. **The Underworld Cookbook** — lift 11.63, co 8/31
2. **Monument to Endurance** — lift 10.08, co 8/31
3. **Conflagrate** — lift 9.45, co 6/31
4. **Anje's Ravager** — lift 8.90, co 8/31
5. **Squee, Goblin Nabob** — lift 8.27, co 7/31

## Zombie Infestation
_(36 decks — discard / reanimator outlets)_

1. **Putrid Imp** — lift 10.85, co 8/36
2. **Oona's Prowler** — lift 9.87, co 10/36
3. **Korvold, Fae-Cursed King** — lift 8.62, co 9/36
4. **Master of Death** — lift 7.44, co 8/36
5. **Hogaak, Arisen Necropolis** — lift 7.42, co 13/36

## Cryptbreaker
_(60 decks — Zombies / black tribal)_

1. **Relentless Dead** — lift 8.04, co 21/60
2. **Undead Augur** — lift 6.95, co 16/60
3. **Zulaport Cutthroat** — lift 6.18, co 25/60
4. **Rotting Rats** — lift 6.17, co 12/60
5. **Viscera Seer** — lift 6.01, co 16/60

## Yuriko, the Tiger's Shadow
_(44 decks — Ninjas)_

1. **Ingenious Infiltrator** — lift 15.63, co 27/44
2. **Thousand-Faced Shadow** — lift 13.68, co 19/44
3. **Kaito Shizuki** — lift 13.32, co 26/44
4. **Moon-Circuit Hacker** — lift 13.02, co 22/44
5. **Sneaky Snacker** — lift 10.20, co 18/44

## Snapcaster Mage
_(86 decks — Izzet/Dimir spells & tempo)_

1. **Yuriko, the Tiger's Shadow** — lift 5.88, co 19/86
2. **Faerie Seer** — lift 5.39, co 17/86
3. **Thousand-Faced Shadow** — lift 5.16, co 14/86
4. **Kaito Shizuki** — lift 4.98, co 19/86
5. **Spellstutter Sprite** — lift 4.90, co 23/86

## Bonus Round
_(75 decks — Storm combo)_

1. **Cabal Ritual** — lift 7.06, co 33/75
2. **Past in Flames** — lift 7.03, co 36/75
3. **Empty the Warrens** — lift 6.79, co 33/75
4. **Mystical Tutor** — lift 6.76, co 29/75
5. **Seething Song** — lift 6.63, co 28/75

## Dragon's Rage Channeler
_(65 decks — Izzet/Rakdos delirium tempo)_

1. **Grim Lavamancer** — lift 7.28, co 23/65
2. **Fiery Confluence** — lift 6.35, co 25/65
3. **Inti, Seneschal of the Sun** — lift 6.18, co 24/65
4. **Young Pyromancer** — lift 5.69, co 24/65
5. **Incinerate** — lift 5.55, co 20/65

## Young Pyromancer
_(76 decks — Izzet spells / token swarm)_

1. **Pinnacle Monk** — lift 8.30, co 28/76
2. **Dreadhorde Arcanist** — lift 7.14, co 31/76
3. **Firebolt** — lift 6.12, co 23/76
4. **Lava Dart** — lift 5.89, co 21/76
5. **Izzet Charm** — lift 5.75, co 22/76

## Priest of Titania
_(92 decks — Elves)_

1. **Heritage Druid** — lift 6.82, co 45/92
2. **Elvish Archdruid** — lift 6.62, co 40/92
3. **Rofellos, Llanowar Emissary** — lift 6.57, co 50/92
4. **Nettle Sentinel** — lift 6.56, co 35/92
5. **Quirion Ranger** — lift 6.37, co 41/92

## Aluren
_(72 decks — Elf combo / Glimpse storm)_

1. **Birchlore Rangers** — lift 6.80, co 28/72
2. **Devoted Druid** — lift 6.05, co 29/72
3. **Glimpse of Nature** — lift 6.03, co 30/72
4. **Scryb Ranger** — lift 5.62, co 19/72
5. **Ineffable Blessing** — lift 5.52, co 19/72

## Glimpse of Nature
_(81 decks — Elf combo / draw engine)_

1. **Nettle Sentinel** — lift 7.23, co 34/81
2. **Wirewood Symbiote** — lift 6.80, co 39/81
3. **Heritage Druid** — lift 6.03, co 35/81
4. **Aluren** — lift 6.03, co 30/81
5. **Devoted Druid** — lift 5.94, co 32/81

## Urza, Lord High Artificer
_(77 decks — artifact combo / Thopter-Sword)_

1. **Thopter Foundry** — lift 5.36, co 25/77
2. **Aether Spellbomb** — lift 5.18, co 16/77
3. **Sai, Master Thopterist** — lift 5.14, co 26/77
4. **Retrofitter Foundry** — lift 5.07, co 25/77
5. **Master of Etherium** — lift 5.00, co 22/77

## Mishra's Workshop
_(100 decks — heavy artifacts / Krark-Clan Ironworks)_

1. **Scrap Trawler** — lift 5.63, co 37/100
2. **Goblin Engineer** — lift 5.62, co 23/100
3. **Retrofitter Foundry** — lift 5.31, co 34/100
4. **Junk Diver** — lift 5.28, co 32/100
5. **Perilous Myr** — lift 5.24, co 21/100

## Emry, Lurker of the Loch
_(84 decks — artifact value / Thopter-Sword)_

1. **Sai, Master Thopterist** — lift 6.34, co 35/84
2. **Thought Monitor** — lift 6.14, co 33/84
3. **Ichor Wellspring** — lift 6.07, co 20/84
4. **Workshop Assistant** — lift 5.95, co 29/84
5. **Memnite** — lift 5.83, co 28/84

---

_Note: "Emry, Lurker **of** the Loch" is the name as it appears in the decklists. The
requested list spelled it "in the Loch"; the data uses "of the Loch"._
