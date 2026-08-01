# Warrior Combo — Card Pool

A companion to [warrior-combo.md](warrior-combo.md), listing every CardsV2 card with a specific affinity for the Warrior Combo archetype — the cards you would prioritize drafting when building this deck. Cards are drawn from `data/tabula/cards.toml`.

## Recursion engines

1. Burning Revenant — The core engine: when an allied warrior is dissolved, returns a lesser-cost warrior from void to hand, turning each abandon into a descending value chain.
2. Starbound Striker — Cheapest ▸Dissolved returner ("Return another warrior from your void to your hand"); pairs with Burning Revenant for two returns per abandon.
3. Infernal Cavalier — ▸Dissolved returns another warrior with cost 4● or less, covering nearly the whole curve.
4. Tranquil Duelist — Vengeful warrior that ▸Dissolved returns another warrior; trades up in combat and refills on the way out.
5. Prism Caller — "When you play a warrior, you may materialize a character ≤2● from your void" — replays cheap bodies into play for free, firing their ▸Materialized triggers.
6. The Deathsworn — Recurs itself from void whenever you materialize a 1✦ character, riding the figment-maker engine.
7. Scorched Crusader — Stores ⧗ on non-figment materialize, then "3⧗: Return a warrior from your void to your hand" — a recursion engine off the wide board.
8. Dune Reaper — "2●, Banish a card from void: Materialize this from your void" — self-recurring warrior body.
9. Dream Garden Visitor — "Once per turn, you may play a warrior from your void" plus self-eroding ▸Dawn to seed it.
10. Wreckheap Survivor — Pays 2● to return itself from void to play with a challenger out — cheap recursion fodder.
11. Ruptured Dynamo — "Abandon a character: Return a character from your void to your hand" — a repeatable recursion outlet.

## Welders (return to play)

12. Dreaming Obelisk — "☪, Abandon a warrior: Materialize a warrior from your void" — recycles warriors with ▸Materialized/▸Dissolved triggers.
13. Pit Descender — "☪, Abandon a warrior: Materialize a warrior ≤2● from your void," with ▸Materialized Erode 3 to stock the void.
14. Veilseeker — "Abandon this character: Return all characters ≤2● from your void to play" — a mass warrior reanimation finisher.
15. Radiant Convergence — Materializes a ≤2● character from void, with reclaim by abandoning two characters.

## Abandon outlets

16. Spirit Reaping — The gold-standard outlet: "Abandon a warrior: Gain 2●," no ☪ and no per-turn cap, fueling unbounded loops.
17. Arc Disciple — "Abandon another character: Gain 2●," the redundant uncapped energy outlet.
18. Infernal Ascendant — "Abandon another character: Gain 1●," the same uncapped engine at a lower rate.
19. Forsworn Champion — "Abandon a warrior: This character gains +1✦," a spark-paying Interrupt-speed outlet that grows lethal across a combo turn.
20. Spellweaver — "1●, Abandon a non-figment warrior: Materialize a 1✦ warrior figment" — converts real warriors into figment fodder while firing ▸Dissolved.
21. Grim Reclaimer — "2●, Abandon 2 warriors: Draw a card" — an abandon outlet that converts bodies into cards.
22. Nightmare Manifest — "☪, Abandon a character: Gain 1●" plus ▸Dawn energy — repeatable abandon energy outlet.
23. Virtuoso of Harmony — "Abandon a character ≤2●: Gain 1●" — a free repeatable outlet for cheap fodder.
24. Soulbinder — "Abandon a character: Store 1⧗" / "2⧗: Gain 1●" — abandon outlet that banks toward energy.
25. Herald of the Last Light — Grows on every abandon and "3●, Abandon a character: Draw a card" — an abandon outlet and payoff in one.
26. Thundercatcher — "2●, Abandon a 1✦ ally: Draw 2 cards" — turns figments into card advantage.
27. Specter of Silent Snow — "When you abandon a character, draw a card and gains +1✦," with a ▸Dawn self-abandon to prime it.
28. Pyrewatcher — "Abandon this character: Gain 3●," a warrior abandon that refuels and triggers Burning Revenant.

## Tutors and assembly

29. Aftermath Bloom — "Abandon a warrior. Discover a warrior with higher cost, then materialize it" — the warrior tutor and combo fail-safe.
30. Mirror Protocol — "☪, Abandon a warrior: Discover a warrior 1● higher and materialize it" — a tutor on a stick that climbs the curve.

## Figment / board makers

31. Voidsire — "When you play a warrior, materialize a 1✦ warrior figment" — widens the board and feeds every abandon and Prism Caller trigger.
32. Forge-Twin — Materializes a figment copy of Blade of Unity, a scaling Unstoppable warrior that feeds the count.
33. Crescendo Channeler — ▸Dawn warrior figment plus "2●, ☪: Gain 1● for each allied warrior" — the energy engine that refunds laps of the loop.
34. Worldbreacher — "☪: Materialize a 1✦ warrior figment" — a repeatable figment maker.
35. Standard Bearer — "When you play a character, materialize a 1✦ warrior figment" — broad figment engine for the loop.
36. Fathomscourge — "When an allied warrior is dissolved, materialize a 1✦ warrior figment" — replaces abandoned bodies with fresh fodder.
37. Inferno's Herald — ▸Dissolved makes a warrior figment per ✦ it has — a death payoff that refills the board.
38. Phantasmal Recruiter — "Abandon a character: Store 1⧗" / "2●, 2⧗: Materialize two 1✦ warrior figments" — abandon-fueled figment engine.
39. Harborwarden — "☪, Discard: Materialize a warrior figment" plus "Abandon 2 warriors: Dissolve an enemy ≤4✦" — figment maker and abandon-powered removal.

## Drain / death payoffs (finishers)

40. Silent Avenger — "When a character is dissolved, gain 1⍟" — turns a near-infinite abandon chain into near-infinite ⍟.
41. Soulrender — "Abandon a character: Chosen player erodes X (that character's cost)" — converts the chain into deck erosion or a Terminus setup.
42. Nineborn Specter — "▸Dissolved: Gain 2⍟," a warrior that rewards every body you sacrifice.
43. Twilight Suppressor — "When you play a character, store 1⧗" / "1⧗, Abandon a character: Gain 1⍟" — banks both halves of the loop into points.
44. Junkfield Renegade — "1●, Abandon this character: Gain 2⍟ or draw" — a self-contained warrior closer that doubles as recursion fodder.
45. Intermezzo Balladeer — "When you play a card, gain 1⍟ for each other card played this turn" — rewards the replay-heavy combo turn.
46. Burst of Obliteration — "Gain X⍟ or dissolve an enemy with X✦" — the flexible finisher for an overflowing energy pool.
47. Terminus — "If you have no cards in your deck, you win" — the deterministic out for the self-erosion build.
48. Fathomless Maw — "When you abandon a character, gain 1⍟" — a pure drain payoff for the abandon loop.
49. Skull Weaver — "When an ally leaves play, gain 1⍟" — Blood-Artist drain payoff on every body that leaves.
50. Duskreaper — "When an ally is dissolved, gain 1⍟" — drain payoff covering the dissolve half of the loop.
51. Avatar of Cosmic Reckoning — "When an ally is dissolved, gain 1⍟" plus a free ethereal figment — drain payoff and body.
52. Saltless Mariner — "Abandon a character: Gain 1⍟" — a self-contained abandon-to-points outlet.
53. The Forsaker — "Abandon a character ≤2●: Gain 1⍟" — a cheap abandon drain payoff (shared with the Wake/Shadow shell).
54. Cinderheart — Grows on each abandon and "▸Dissolved: Gain ⍟ equal to its ✦" — banks abandons into a single ⍟ burst.

## Cheap warrior fodder

55. Conduit of Ashes — 0● body, "Abandon this character: Gain 1●" — the cheapest fodder to keep the energy math positive.
56. Dread Arbiter — 0● warrior, "Abandon this character: Reveal opponent's hand. Draw a card" — free fodder that draws.
57. Spent Courier — "▸Materialized, ▸Dissolved: Draw a card with ephemeral" — draws on both halves of any return loop.
58. Ossuary Overlord — "▸Materialized, ▸Dissolved: Draw a card" — ideal fuel for the welders and Burning Revenant.
59. Sigil Analyst — "▸Materialized: Draw 2 cards" — a fat payoff to land off Prism Caller or a welder.
60. Winterbough Monk — "▸Materialized: Return a card from your void to your hand" — a non-abandon way to recur a key event.
61. Rebirth Ritualist — 0● warrior, "Abandon this character: Draw a card with ephemeral" — cheap draw fodder.
62. Blightmaw — 1● warrior, "Abandon this character: Draw a card" — cheap draw fodder.
63. Starshot Gunner — 1● warrior, "1●, Abandon this character: Return a character to hand" — fodder that recurs a body.
64. Ochre Prospector — Warrior, "Abandon: Gain 1●" plus "▸Dissolved: Draw" — fodder that pays energy and draws.
65. Marrow Mimic — Warrior, "Abandon: Erode 1" plus "▸Dissolved: Draw" — fodder that self-mills and draws.
66. Ironclad Marksman — "Abandon this character: Shuffle up to 3 from void into deck. Draw" — recycles the void and refuels against decking out.
67. Sandglider — 0● fast warrior with no ability — pure cheap body to feed the loop and Burning Revenant.
68. Aspiring Guardian — 0● warrior with no ability — free fodder for the abandon chain.

## Value bodies and warrior card advantage

69. Invoker of Myths — "Once per turn, when you materialize a warrior, draw a card" — card advantage off Prism Caller, welders, and figment makers.
70. Reforged Automaton — "▸Materialized: Draw a warrior" and grows on each non-figment warrior — refuels the warrior count.
71. Smoldering Ancient — Grows on warrior dissolves and "☪, Abandon a warrior: Gain 1⍟" — abandon outlet and drain payoff.

## Cost reduction (enables the replay loop)

72. Tethered Hollow — "The first warrior you play each turn costs 3● less" — keeps replayed warriors cheap enough to loop.
73. Sundown Ronin — "Warriors cost you 1● less" — flat reduction that helps every lap stay net-positive.
74. Dreadmount Sovereign — Costs 1● less per allied warrior and supports +3✦ — a discounted top-end body for the wide board.

## Wide-board scalers (shared with Warrior Aggro)

75. Skyflame Commander — Supports +1✦ for each allied warrior — the anthem the wide figment board wants.
76. Momentum's Edge — Sets a chosen type and gives +1✦ to it — flexible warrior-board buff.
77. Shadow Reflection — "Give an ally +1✦ for each allied warrior" — a burst pump off the wide board.
78. Colossal Convergence — "☪, Abandon a character: Give an ally +X✦ (abandoned ✦)" — an abandon outlet that converts bodies to spark.
79. Wolfbond Chieftain — "☪: Gain 1● for each allied warrior" — the re-awakenable energy engine for combo turns.

## Burst energy

80. Glimpse of Infinity — "Gain 3●" for 0● — explosive fast energy to power a loop a turn early.
81. Pulse of Sacrifice — "Discard your hand. Gain 3●" — pays for the turn and dumps recursion targets into the void.

## Mass return and self-mill

82. Shadow March — "Materialize all characters ≤2● in your void which dissolved this turn" — a mass-return blowout for the cheap-warrior shell.
83. Wake the Fallen — "Materialize all characters which dissolved this turn" — the broader mass-return for the abandon board.
84. Heroic Rescue — "Materialize up to three chosen characters which dissolved this turn" — a cheap fast-speed mass return.
85. Speaker for the Forgotten — "5●: Erode 1. That card gains reclaim 0●" — self-mills loop fodder into the void for replay or Terminus.

## Disruption and removal

86. Vault Infiltrator — "Players may only play one card per turn" — slows the opponent while you assemble (deploy once the engine runs on free materializations).
87. Ordained Collapse — "Dissolve each character with cost X●" — a sweeper that can intentionally dissolve your own cheap warriors to trigger Burning Revenant en masse.
88. Eclipse Herald — "3●: Store 1⧗" / "X⧗: Dissolve an enemy with ✦ X or less" — repeatable removal that keeps challengers off the engine.
89. Kindlehorn — "When you abandon a character, store 1⧗" / "X⧗: Dissolve an enemy with X✦" — converts the abandon loop into removal.
90. Obliterator of Worlds — "Abandon a character: Store 1⧗" / "X⧗: Dissolve an enemy with X✦" — another abandon-to-removal converter.
