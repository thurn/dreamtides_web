# Complete Exploration template library

A complete design-only library of all 82 entries from /tmp/templates.json, with implementation annotations used by the encounter-redesign pipeline.

The ID and template-concept columns preserve the source list. This is a design
reference, not runtime game data. `data/exploration.ron` owns
action presentation and typed behavior. A `vertical_slice` idea requires a complete
new or extended implementation before it can be authored live.

| ID | Mechanic concept | Balance | Current implementation |
| ---: | --- | --- | --- |
| 1 | Gain {essence} essence | standard | reuse `GainEssence` |
| 2 | Gain a random amount of essence between {essence1} and {essence2} | standard | reuse `GainRandomEssence` |
| 3 | Purge a chosen card | standard | reuse `PurgeSelected` |
| 4 | Purge a chosen {predicate} card | standard | reuse `PurgeSelected` |
| 5 | Purge up to {count} chosen cards | standard | reuse `PurgeSelected` |
| 6 | Purge up to {count} chosen {predicate} cards | standard | reuse `PurgeSelected` |
| 7 | Purge a chosen {predicate} card and gain a random {predicate} replacement | standard | reuse `ReplaceSelected` |
| 8 | Purge up to {count} chosen {predicate} cards and gain a random {predicate} replacement for each card purged | standard | reuse `ReplaceSelected` |
| 9 | Gain a random {predicate} card | standard | reuse `GainRandomCards` |
| 10 | Gain {card_id} | standard | reuse `GainNamedCard` |
| 11 | Gain $OFFERED_CARD | standard | reuse `GainGeneratedCard` |
| 12 | Gain {count} copies of $OFFERED_CARD | standard | reuse `GainGeneratedCard` |
| 13 | Gain {count} random {predicate} cards | standard | reuse `GainRandomCards` |
| 14 | Draft a {predicate} from {offer_count} choices | standard | reuse `DraftCard` |
| 15 | Draft a {predicate} from {offer_count} choices and gain {count} copies of it | standard | reuse `DraftCard` |
| 16 | Take any number of {predicate} cards from {offer_count} choices | standard | reuse `TakeCards` |
| 17 | Apply a transfiguration to a chosen card | standard | reuse `TransfigureSelected` |
| 18 | Apply {transfiguration} to a chosen card | standard | reuse `TransfigureFixedSelected` |
| 19 | Apply {transfiguration} to $DECK_CARD | standard | reuse `TransfigureFixedSelected` |
| 20 | Apply a transfiguration to {count} chosen {predicate} cards | standard | reuse `TransfigureSelected` |
| 21 | Apply {transfiguration} to {count} chosen {predicate} cards | standard | reuse `TransfigureFixedSelected` |
| 22 | Apply a transfiguration to {count} random {predicate} cards | standard | reuse `TransfigureRandomCards` |
| 23 | Apply {transfiguration} to {count} random {predicate} cards | standard | reuse `TransfigureFixedRandomCards` |
| 24 | Transfigure {count} random starter cards | standard | reuse `TransfigureRandomStarterCards` |
| 25 | Transfigure all starter cards | standard | reuse `TransfigureAllStarterCards` |
| 27 | Gain {dreamsign_name} | standard | reuse `GainDreamsign` |
| 28 | Gain a random dreamsign | standard | reuse `GainRandomDreamsign` |
| 29 | Gain one of 3 offered dreamsigns | standard | reuse `GainOfferedDreamsign` |
| 30 | Replace a chosen dreamsign with one of 3 offered dreamsigns | standard | reuse `ReplaceSelectedDreamsignWithOffered` |
| 32 | Purge $STARTER_CARD | standard | reuse `PurgeStarterCard` |
| 33 | Purge a random starter card | standard | reuse `PurgeRandomStarterCard` |
| 34 | Purge a random starter card and gain a {predicate} card | standard | reuse `PurgeRandomStarterAndGainCard` |
| 35 | Purge all starter cards and replace each one with a {predicate} card | standard | reuse `ReplaceAllStarterCards` |
| 36 | Choose one of {pack_count} packs of {pack_size} {predicate} cards to add to your deck | standard | reuse `ChoosePack` |
| 37 | The next draft or shop site you visit will contain transfigured cards | standard | reuse `TransfigureNextDraftOrShop` |
| 38 | Draw {count} additional cards at the start of your next battle | standard | reuse `NextBattleOpeningHand` |
| 39 | Gain {count} additional energy at the start of your next battle | standard | reuse `NextBattleStartingEnergy` |
| 40 | Transfigure all cards in your deck | unique_effect | reuse `TransfigureAllCards` |
| 41 | Add a duplication site to this dreamscape | standard | reuse `AddFixedSite` |
| 42 | Add a card market site to this dreamscape | standard | reuse `AddFixedSite` |
| 43 | Add a dreamsign bazaar site to this dreamscape | standard | reuse `AddFixedSite` |
| 44 | Add a transfiguration site to this dreamscape | standard | reuse `AddFixedSite` |
| 45 | Add a purge site to this dreamscape. | standard | reuse `AddFixedSite` |
| 46 | Choose one of three site types to add to this dreamscape. | standard | reuse `ChooseSiteType` |
| 47 | Choose a card to purge and replace it with {card_id} | standard | reuse `ReplaceSelectedWithCard` |
| 48 | Purge a random {predicate} card and replace it with {card_id} | standard | reuse `ReplaceRandomWithCard` |
| 49 | Gain {count} copies of $DECK_CARD | standard | reuse `CopySelectedCard` |
| 50 | Gain {count} copies of a chosen card | standard | reuse `CopySelectedCard` |
| 51 | Gain one copy of each of {count} chosen cards | standard | reuse `CopySelectedCards` |
| 52 | Gain one copy of each of {count} random {predicate} cards | standard | reuse `CopyRandomCards` |
| 53 | Change $DECK_CARD to become a {card_type} | standard | reuse `ChangeCardTypeSelected` |
| 54 | Modify {count} random cards to become {card_type} cards | standard | reuse `ChangeRandomCardType` |
| 55 | Draw 4 cards from your deck and choose one to gain a copy of. | standard | reuse `CopyOfferedDeckCard` |
| 56 | All items in the next shop you visit are free | standard | reuse `FreeNextShop` |
| 57 | Pick a new Dream Avatar from 3 choices | standard | reuse `ChooseDreamAvatar` |
| 58 | Change a chosen character card to be a {subtype} | standard | reuse `ChangeSubtypeSelected` |
| 59 | Gain {essence_per_card} essence for each {predicate} card in your deck | standard | reuse `GainEssencePerCard` |
| 60 | Purge a chosen card and gain {essence_per_spark} essence for each ✦ it had | standard | reuse `PurgeForEssence` |
| 61 | Purge a chosen card and gain a copy of another chosen card in your deck | standard | reuse `PurgeAndCopy` |
| 62 | Purge a chosen dreamsign and gain {essence} essence | standard | reuse `PurgeDreamsignForEssence` |
| 63 | Replace all of your dreamsigns with random dreamsigns | standard | reuse `ReplaceAllDreamsignsRandom` |
| 64 | All characters in your deck gain +{spark_bonus}✦ | unique_effect | reuse `IncreaseSparkAll` |
| 65 | All cards in your deck are reduced in cost by {energy_cost_reduction}●. Gain {nightmare_count} Nightmare cards. | unique_effect | reuse `ReduceCostAllAndGainNightmares` |
| 66 | All cards in your deck become ❖ (fast) | unique_effect | reuse `MakeFastAll` |
| 67 | All characters in your deck become the subtype of your choice. | unique_effect | reuse `ChangeSubtypeAll` |
| 68 | Double your current essence. | standard | reuse `DoubleEssence` |
| 69 | Gain {count} Nightmare cards. Gain {dreamsign}. | standard | reuse `GainNightmareAndDreamsign` |
| 70 | Gain {nightmare_count} Nightmare cards. Gain {card_name}. | standard | reuse `GainNightmareAndCard` |
| 71 | Gain {count} Nightmare cards. Gain one of 3 offered dreamsigns. | standard | reuse `GainNightmareAndOfferedDreamsign` |
| 72 | Gain a random legendary card. | standard | reuse `GainRandomCards` |
| 73 | Lose {essence} essence. Apply {transfiguration} to every eligible {predicate} card in your deck. | unique_effect | reuse `TransfigureAllForEssence` |
| 74 | Purge a random {subtype} character. Every other {subtype} character in your deck gains +1✦. | unique_effect | reuse `PurgeRandomSubtypeAndIncreaseSpark` |
| 75 | Purge $DECK_CARD. Apply {transfiguration} to every other eligible card in your deck with the same card type. | unique_effect | reuse `PurgeDisclosedAndTransfigureSameType` |
| 76 | Purge a chosen dreamsign. Gain 3 random dreamsigns. | standard | reuse `PurgeSelectedDreamsignAndGainRandom` |
| 77 | Every {predicate} card in your deck becomes ❖ (fast). Gain {count} Nightmare cards. | unique_effect | reuse `MakePredicateFastAndGainNightmares` |
| 78 | Gain any number of {predicate} cards from 4 choices and apply {transfiguration} to each eligible card gained. Gain {count} Nightmare cards. | standard | reuse `TakeTransfiguredCardsAndGainNightmares` |
| 79 | Purge all copies of every duplicated card from your deck. Every card remaining in your deck gains reclaim. | unique_effect | reuse `PurgeDuplicatesAndGrantReclaim` |
| 80 | Select 4 random cards from your deck and choose one to purge. Apply {transfiguration} to the other 3 eligible cards, then gain a copy of each. | standard | reuse `PurgeOneTransfigureAndCopyOthers` |
| 81 | Draw one fewer card at the start of your next battle. All cards cost 1● less during that battle. | unique_effect | reuse `NextBattleSmallerHandAndCostDiscount` |
| 82 | Lose half your current essence. The next {count} items you purchase are free. | standard | reuse `LoseHalfEssenceAndFreePurchases` |
| 83 | Draft a transfigured {predicate} from {offer_count} choices. | standard | reuse `TransfiguredCardDraft` |
| 84 | Add a disclosed site to the current Dreamscape. | standard | reuse `AddSite` |
