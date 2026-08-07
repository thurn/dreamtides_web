# English source strings for the Project Fluent localization proof of concept.


### Shared Dreamtides vocabulary


# These private terms are referenced by messages and cannot be requested by the
# application directly. Countable terms expose a locale-private grammatical
# number facet. Its default is one; messages select runtime counts and pass a
# literal CLDR category such as number: "other".
#
# Keep articles, possessives, adjectives, verbs, and numerals in complete
# messages. A locale may add its own term parameters for grammatical case or
# classifiers, and private attributes for traits such as gender or initial
# sound. See docs/journey_prototype/localization.md.


## Product and named world concepts

-dreamtides = Dreamtides
-dreamwell = Dreamwell
-dream-atlas = Dream Atlas

## Countable world concepts

-journey =
    { $number ->
       *[one] Journey
        [other] Journeys
    }
-dream-avatar =
    { $number ->
       *[one] Dream Avatar
        [other] Dream Avatars
    }
-dream-guide =
    { $number ->
       *[one] Dream Guide
        [other] Dream Guides
    }
-dreamscape =
    { $number ->
       *[one] Dreamscape
        [other] Dreamscapes
    }
-dreamsign =
    { $number ->
       *[one] Dreamsign
        [other] Dreamsigns
    }
-tide =
    { $number ->
       *[one] Tide
        [other] Tides
    }
-site =
    { $number ->
       *[one] Site
        [other] Sites
    }
-reward =
    { $number ->
       *[one] Reward
        [other] Rewards
    }

## Cards and card zones

-card =
    { $number ->
       *[one] Card
        [other] Cards
    }
-character =
    { $number ->
       *[one] Character
        [other] Characters
    }
-event-card =
    { $number ->
       *[one] Event Card
        [other] Event Cards
    }
-deck =
    { $number ->
       *[one] Deck
        [other] Decks
    }
-hand =
    { $number ->
       *[one] Hand
        [other] Hands
    }
-void =
    { $number ->
       *[one] Void
        [other] Voids
    }
-figment =
    { $number ->
       *[one] Figment
        [other] Figments
    }

## Battle actors, scoring, and timing

-battle =
    { $number ->
       *[one] Battle
        [other] Battles
    }
-player =
    { $number ->
       *[one] Player
        [other] Players
    }
-opponent =
    { $number ->
       *[one] Opponent
        [other] Opponents
    }
-turn =
    { $number ->
       *[one] Turn
        [other] Turns
    }
-round =
    { $number ->
       *[one] Round
        [other] Rounds
    }
-point =
    { $number ->
       *[one] Point
        [other] Points
    }

## Resource names (count-invariant in English)

-essence = Essence
-energy = Energy
-spark = Spark
journey-complete-title = { -journey } Complete
journey-complete-new-journey = New { -journey }
journey-complete-stat-battles =
    { $count ->
        [one] { -battle(number: "one") } Won
       *[other] { -battle(number: "other") } Won
    }
journey-complete-stat-dreamscapes =
    { $count ->
        [one] { -dreamscape(number: "one") }
       *[other] { -dreamscape(number: "other") }
    }
journey-complete-stat-cards = Final { -deck }
journey-complete-stat-dreamsigns =
    { $count ->
        [one] { -dreamsign(number: "one") }
       *[other] { -dreamsign(number: "other") }
    }
journey-complete-stat-essence = { -essence } Remaining

### Deck browsing

# Title of the full-screen browser for the current player's deck. “Your”
# addresses the local player, including one participant in a cooperative room.
deck-browser-title = Your { -deck }
# Count beneath the deck-browser title. $count is the number of cards currently
# in the player's deck, is a non-negative integer, and can be zero.
deck-browser-card-count =
    { $count ->
        [one] { $count } { -card(number: "one") }
       *[other] { $count } { -card(number: "other") }
    }
# Accessible name for the icon-only control that dismisses the player's deck
# browser and returns focus to the Journey screen beneath it.
deck-browser-close = Close deck browser
# Empty state in the deck browser when the player's deck contains zero cards.
deck-browser-empty = Your deck is empty.
# Empty state when the player's non-empty deck has no cards matching the active
# filter. The player can change or clear that filter to see cards again.
deck-browser-no-filter-matches = No cards match this filter.
# Accessible name for the deck type-filter control. $selection is the displayed
# name of the active filter option; it is canonical card vocabulary or a card
# subtype name whose grammatical gender is unknown.
deck-browser-filter-accessible-name = Filter deck by { $selection }
# Accessible name for the deck sort control. $selection is the displayed name
# of the active sort order.
deck-browser-sort-accessible-name = Sort deck by { $selection }
# Accessible name for the Journey status-bar control that opens the current
# player's deck. $count is the non-negative current deck size and can be zero.
journey-status-deck-open =
    { $count ->
        [one] View deck containing { $count } { -card(number: "one") }
       *[other] View deck containing { $count } { -card(number: "other") }
    }
# Accessible name for the Journey status-bar control that opens the player's
# Dreamsign gallery. $count is the positive number of collected Dreamsigns.
journey-status-dreamsigns-open =
    { $count ->
        [one] View { $count } { -dreamsign(number: "one") }
       *[other] View { $count } { -dreamsign(number: "other") }
    }

### Battle card-zone browser

# Title for a battle zone browser owned by the local player. $zone is a semantic
# identifier: "deck" is the draw pile, "void" is the discard-like zone, and
# "banished" is the shared removed-from-play zone.
battle-zone-browser-viewer-title =
    { $zone ->
        [deck] Your { -deck }
        [void] Your { -void }
       *[banished] Your Banished Cards
    }
# Title for a battle zone browser owned by the opposing player. $zone uses the
# same "deck", "void", and "banished" semantic identifiers as the local title.
battle-zone-browser-opponent-title =
    { $zone ->
        [deck] Opponent’s { -deck }
        [void] Opponent’s { -void }
       *[banished] Opponent’s Banished Cards
    }
# Shared title for the browser that can switch between both players' banished
# cards during a battle.
battle-zone-browser-shared-banished-title = Banished Cards
# Subtitle when every card in the selected battle zone is visible. $count is
# the non-negative number of physical card entries in the zone and can be zero.
battle-zone-browser-total-count =
    { $count ->
        [one] { $count } { -card(number: "one") }
       *[other] { $count } { -card(number: "other") }
    }
# Subtitle when filters show only part of a battle zone. $visibleCount and
# $totalCount are non-negative card-entry counts; either can be zero.
battle-zone-browser-filtered-count =
    { $totalCount ->
        [one] { $visibleCount } of { $totalCount } { -card(number: "one") }
       *[other] { $visibleCount } of { $totalCount } { -card(number: "other") }
    }

# Label for the local-player option in a battle zone owner switch. $count is
# the non-negative number of that player's banished cards and can be zero.
battle-zone-browser-viewer-option =
    { $count ->
        [one] Your { -card(number: "one") } · { $count }
       *[other] Your { -card(number: "other") } · { $count }
    }
# Label for the opposing-player option in a battle zone owner switch. $count
# is the non-negative number of that player's banished cards and can be zero.
battle-zone-browser-opponent-option =
    { $count ->
        [one] Opponent { -card(number: "one") } · { $count }
       *[other] Opponent { -card(number: "other") } · { $count }
    }
# Accessible name for the icon-only control that dismisses a battle card-zone
# browser. $zone is "deck", "void", or "banished" with the meanings above.
battle-zone-browser-close =
    { $zone ->
        [deck] Close deck browser
        [void] Close void browser
       *[banished] Close banished-cards browser
    }
# Empty state when the selected battle zone itself contains zero cards.
battle-zone-browser-empty = No Cards.
# Empty state when a non-empty battle zone has no cards matching the active
# search or type filter.
battle-zone-browser-no-filter-matches = No Matching Cards.

### Exploration outcomes

# Accessible announcement after an Exploration choice grants reward objects and
# purges no cards. $rewardCount is a non-negative count and can be zero.
exploration-outcome-rewards-gained =
    { $rewardCount ->
        [one] Gained { $rewardCount } { -reward(number: "one") }
       *[other] Gained { $rewardCount } { -reward(number: "other") }
    }
# Accessible announcement while an Exploration outcome purges cards and grants
# no reward objects. $purgedCardCount is a positive count of cards being removed
# from the player's current deck.
exploration-outcome-cards-purging =
    { $purgedCardCount ->
        [one] Purging { $purgedCardCount } { -card(number: "one") }
       *[other] Purging { $purgedCardCount } { -card(number: "other") }
    }
# Accessible announcement while one Exploration outcome both purges cards and
# grants rewards. Both variables are positive integer counts; the two actions
# happen as parts of the same resolved outcome.
exploration-outcome-purge-and-gain =
    { $purgedCardCount ->
        [one]
            { $rewardCount ->
                [one] Purging { $purgedCardCount } { -card(number: "one") } and gaining { $rewardCount } { -reward(number: "one") }
               *[other] Purging { $purgedCardCount } { -card(number: "one") } and gaining { $rewardCount } { -reward(number: "other") }
            }
       *[other]
            { $rewardCount ->
                [one] Purging { $purgedCardCount } { -card(number: "other") } and gaining { $rewardCount } { -reward(number: "one") }
               *[other] Purging { $purgedCardCount } { -card(number: "other") } and gaining { $rewardCount } { -reward(number: "other") }
            }
    }
# Accessible announcement for a resolved Exploration outcome that improves the
# next battle. $amount is a positive integer; $modifier is "opening-hand" for
# extra starting cards or "starting-energy" for extra Energy.
exploration-next-battle-modifier =
    { $modifier ->
        [opening-hand]
            { $amount ->
                [one] { $amount } additional opening-hand card in the next battle
               *[other] { $amount } additional opening-hand cards in the next battle
            }
       *[starting-energy] { $amount } additional starting { -energy } in the next battle
    }
# Accessible announcement while an Exploration outcome purges one named card
# in exchange for Essence. $cardName is the canonical card display name with
# unknown grammatical gender; $essenceAmount is the non-negative reward total.
exploration-card-purge-for-essence = Purging { $cardName } for { $essenceAmount } { -essence }
# Accessible summary of an Exploration outcome that converts Spirit Animal
# cards into Essence. $cardCount is the positive number of affected cards;
# $totalEssence and $essencePerCard are non-negative Essence amounts.
exploration-spirit-animal-essence-summary =
    { $cardCount ->
        [one] { $cardCount } Spirit Animal card grants { $totalEssence } { -essence } total, { $essencePerCard } for that card
       *[other] { $cardCount } Spirit Animal cards grant { $totalEssence } { -essence } total, { $essencePerCard } each
    }
# Accessible announcement after Exploration duplicates one or more selected
# cards without purging another card. $copyCount is a positive integer count of
# newly added physical deck entries.
exploration-card-copies-gained =
    { $copyCount ->
        [one] Gained { $copyCount } copy
       *[other] Gained { $copyCount } copies
    }
# Accessible announcement after one Exploration outcome purges a card and adds
# copies of a different source card. $purgedCardName and $sourceCardName are
# canonical display names with unknown grammatical gender; $copyCount is the
# positive number of new physical deck entries.
exploration-purge-and-copy-complete =
    { $copyCount ->
        [one] Purged { $purgedCardName } and gained { $copyCount } copy of { $sourceCardName }
       *[other] Purged { $purgedCardName } and gained { $copyCount } copies of { $sourceCardName }
    }
# Accessible announcement while an Exploration outcome transfigures one card.
# $cardName is the canonical display name with unknown grammatical gender;
# $form is one of the seven stable Transfiguration form identifiers.
exploration-card-transfiguring =
    { $form ->
        [Empowered] Transfiguring { $cardName } into its Empowered form
        [Amplified] Transfiguring { $cardName } into its Amplified form
        [Kindled] Transfiguring { $cardName } into its Kindled form
        [Inspired] Transfiguring { $cardName } into its Inspired form
        [Enduring] Transfiguring { $cardName } into its Enduring form
        [Hastened] Transfiguring { $cardName } into its Hastened form
       *[Resonant] Transfiguring { $cardName } into its Resonant form
    }
# Accessible announcement during the first phase of a compound Exploration
# outcome. $purgedCardName is removed before a copy of $sourceCardName is made;
# both are canonical card display names with unknown grammatical gender.
exploration-purge-before-copy = Purging { $purgedCardName } before copying { $sourceCardName }
# Accessible announcement after an Exploration outcome changes the player's
# Dream Avatar. $dreamAvatarName is the canonical display name with unknown
# grammatical gender; “your” addresses the current local player.
exploration-dream-avatar-changed = { $dreamAvatarName } is now your Dream Avatar
# Accessible announcement while an Exploration outcome purges a Dreamsign.
# $dreamsignName is its canonical display name with unknown grammatical gender.
exploration-dreamsign-purging = Purging { $dreamsignName }

### Battle status and results

# Primary action that creates one or more configured Figments in the battle
# developer creation dialog. $count is an integer from 1 through the dialog's
# configured maximum; activating the control creates exactly that many.
battle-figment-create-action =
    { $count ->
        [one] Create { -figment(number: "one") }
       *[other] Create { $count } { -figment(number: "other") }
    }
# Accessible name for the Memory status badge on a battle card. $count is the
# positive integer number of Memory counters currently stored on that card.
battle-card-memory-counter-count =
    { $count ->
        [one] { $count } memory counter
       *[other] { $count } memory counters
    }
# Accessible name for the icon-only control that opens all banished battle
# cards. $count is the positive number of banished cards across both players.
battle-banished-cards-open =
    { $count ->
        [one] Open { $count } banished { -card(number: "one") }
       *[other] Open { $count } banished { -card(number: "other") }
    }
# Accessible live announcement after one Figment merges into another.
# $figmentName is the displayed name of the surviving Figment and has unknown
# grammatical gender; $sparkCount is the non-negative Spark increase.
battle-figment-merge-announcement = { $figmentName } merged and gained { $sparkCount } { -spark }
# Accessible description of the active side and phase on the battle timeline.
# $owner is "viewer" for the local player's side or "opponent" for the opposing
# side. $phase is "dawn", "day", "dusk", "night", or "challenge" and names
# the current Dreamtides battle phase of that side's turn.
battle-phase-indicator =
    { $owner ->
        [viewer]
            { $phase ->
                [dawn] Your turn, Dawn phase
                [day] Your turn, Day phase
                [dusk] Your turn, Dusk phase
                [night] Your turn, Night phase
               *[challenge] Your turn, Challenge phase
            }
       *[opponent]
            { $phase ->
                [dawn] Opponent’s turn, Dawn phase
                [day] Opponent’s turn, Day phase
                [dusk] Opponent’s turn, Dusk phase
                [night] Opponent’s turn, Night phase
               *[challenge] Opponent’s turn, Challenge phase
            }
    }
# Victory summary after a battle. $opponentName is the authored display name of
# the defeated opponent and has unknown grammatical gender; $playerScore and
# $opponentScore are non-negative point totals; $turnCount is a positive count
# of completed battle turns.
battle-victory-summary =
    { $turnCount ->
        [one] Defeated { $opponentName } · { $playerScore }–{ $opponentScore } · { $turnCount } { -turn(number: "one") }
       *[other] Defeated { $opponentName } · { $playerScore }–{ $opponentScore } · { $turnCount } { -turn(number: "other") }
    }
# Accessible name for the Essence reward value on the battle victory screen.
# $amount is the non-negative amount already earned by the local player.
battle-victory-essence-gained = Gained { $amount } { -essence }
# Accessible summary for one participant's battle status card. $owner is
# "viewer" for the side nearest the current local perspective or "opponent" for
# the opposing side. Energy and point values are non-negative integers;
# maximums and the points-to-win target are positive integers.
battle-participant-status =
    { $owner ->
        [viewer] Your side: { $currentEnergy } of { $maxEnergy } { -energy }, { $points } of { $pointsToWin } { $pointsToWin ->
            [one] { -point(number: "one") }
           *[other] { -point(number: "other") }
        }
       *[opponent] Opponent: { $currentEnergy } of { $maxEnergy } { -energy }, { $points } of { $pointsToWin } { $pointsToWin ->
            [one] { -point(number: "one") }
           *[other] { -point(number: "other") }
        }
    }
# Accessible name for a Dreamwell card. $cardName is its canonical display name
# with unknown grammatical gender; $energyAmount is the non-negative Energy the
# card adds when drawn.
battle-dreamwell-card-description = { $cardName }: adds { $energyAmount } { -energy }
# Accessible description of the Energy amount added by a Dreamwell card.
# $energyAmount is a non-negative integer.
battle-dreamwell-energy-added = { $energyAmount } { -energy } added
# Accessible name for one card back in a labeled battle pile. $pileLabel is the
# already localized name of the pile and $position is its positive one-based
# depth from the top; this message does not identify card contents.
battle-card-pile-face-down-position = { $pileLabel }, face-down card { $position }
# Accessible label for a battle score announcement. $count is the non-negative
# number of points shown by the announcement and can be zero.
battle-point-count =
    { $count ->
        [one] { $count } { -point(number: "one") }
       *[other] { $count } { -point(number: "other") }
    }
# Accessible label for a battle card pile. $owner is "viewer" for the near,
# local-perspective side or "opponent" for the far side; $zone is "deck" or
# "void" and identifies the inspected pile.
battle-card-pile-label =
    { $owner ->
        [viewer]
            { $zone ->
                [deck] Your deck
               *[void] Your void
            }
       *[opponent]
            { $zone ->
                [deck] Opponent’s deck
               *[void] Opponent’s void
            }
    }
# Accessible name for the challenger card in a battle challenge. $owner is
# "player" for the local player's card or "opponent" for the opposing card.
battle-challenger-label =
    { $owner ->
        [player] Player challenger
       *[opponent] Opponent challenger
    }
# Confirmation-dialog title for merging one Figment into another.
# $figmentName is the canonical display name of the target Figment and has
# unknown grammatical gender; activating the confirmation performs the merge.
battle-figment-merge-confirmation-title = Merge { $figmentName }?
# Title of the Foresee overlay. $count is the positive number of cards the
# player may inspect and reorder.
battle-foresee-title = Foresee { $count }
# Title of the optional player note editor for a battle card. $cardName is the
# canonical display name and has unknown grammatical gender.
battle-card-note-title = Annotate { $cardName }
# Heading for one turn group in the player-visible battle log. $turn is the
# positive turn identifier displayed by the log.
battle-log-turn-title = Turn { $turn }
# Subtitle for a card-pool browser. $visibleCount and $totalCount are
# non-negative card counts; the visible count may be smaller after filtering.
card-pool-browser-count =
    { $totalCount ->
        [one] { $visibleCount } of { $totalCount } { -card(number: "one") }
       *[other] { $visibleCount } of { $totalCount } { -card(number: "other") }
    }

# Title of the card-pool browser. $context is "pool" in the Journey utility
# overlay and "battle" in the floating battle inspector.
card-pool-viewer-title =
    { $context ->
        [battle] Battle Pool Viewer
       *[pool] Pool Viewer
    }
# Label for a source tab in the card-pool browser. $source identifies the live
# run pool, Tide construction, full catalog, avatar signature cards, replay
# deck, or replay pick history.
card-pool-source-option =
    { $source ->
        [run] Run Pool
        [tides] Tide Decks
        [catalog] All Cards
        [signature] Signature Cards
        [deck] Record Deck
       *[history] Pick History
    }
# Empty state in the card-pool browser. $source has the same six source values
# as the source tabs and explains why that selected collection is empty.
card-pool-empty-state =
    { $source ->
        [run] No run pool cards are available.
        [tides] This run has no Tide decks.
        [catalog] No cards match the current filters.
        [signature] This avatar has no signature cards.
        [deck] The replay record has no resolvable deck cards.
       *[history] The replay record has no pick history.
    }
# Label for a sort field in the card-pool browser. $sort is one of the six
# stable card properties available to the player.
card-pool-sort-option =
    { $sort ->
        [name] Name
        [cardNumber] Number
        [cost] Cost
        [type] Type
        [subtype] Subtype
       *[spark] Spark
    }
# Label for a card-type filter tab. $type is "all", "character", or "event".
card-pool-type-filter-option =
    { $type ->
        [character] Characters
        [event] Events
       *[all] All
    }
# Accessible command on the card-pool sort-direction control. $direction is
# "asc" for ascending or "desc" for descending order.
card-pool-sort-direction =
    { $direction ->
        [desc] Sort descending
       *[asc] Sort ascending
    }
# Accessible label for the card-pool subtype selector.
card-pool-subtype-filter-label = Filter card subtype
# Option that clears the card-pool subtype filter.
card-pool-all-subtypes-option = All subtypes
# Accessible label for the card-pool Energy-cost selector.
card-pool-cost-filter-label = Filter card cost
# Option in the card-pool Energy-cost selector. $cost is "all", an exact digit
# from 0 through 4, "fivePlus" for five or more, or "x" for a variable cost.
card-pool-cost-filter-option =
    { $cost ->
        [0] Cost 0
        [1] Cost 1
        [2] Cost 2
        [3] Cost 3
        [4] Cost 4
        [fivePlus] Cost 5+
        [x] Cost X
       *[all] All costs
    }
# Accessible command that closes the card-pool browser.
card-pool-close-action = Close pool viewer
# Label on the card-name and rules-text search field in the pool browser.
card-pool-search-label = Search cards
# Accessible label for the card-pool sort-field selector.
card-pool-sort-label = Sort cards
# Title of the disclosure explaining which Tides constructed the run pool.
card-pool-tide-provenance-title = Tide provenance
# Summary beside that disclosure. $tideCount is a non-negative number of Tides
# used to construct the pool and can be zero in synthetic or incomplete data.
card-pool-tide-provenance-summary =
    { $tideCount ->
        [one] { $tideCount } Tide
       *[other] { $tideCount } Tides
    }
# Detailed diagnostic description of a Tides-built card pool. $dealSize and
# $copyCap are non-negative card counts. $facetDrawnCount is the non-negative
# number of theme Tides drawn from $facetAvailableCount available Tides.
card-pool-tide-provenance-description =
    { $dealSize ->
        [one] Built to { $dealSize } { -card(number: "one") }
       *[other] Built to { $dealSize } { -card(number: "other") }
    } with a per-card copy cap of { $copyCap }; { $facetDrawnCount } of { $facetAvailableCount } theme Tides were drawn.

# Title of the disclosure describing the loaded replay record.
card-pool-replay-record-title = Replay record
# Description of the replay deck source. $sourceFile is a developer-authored
# file name or path and should remain unchanged inside the localized sentence.
card-pool-replay-record-description = Record deck loaded from { $sourceFile }.
# Title of the disclosure describing the active pool algorithm.
card-pool-construction-title = Pool construction
# Short diagnostic summary. $algorithm is a stable internal algorithm id and
# should remain unchanged.
card-pool-construction-summary = Algorithm: { $algorithm }
# Description of the active run-pool contents and remaining-copy quantities.
card-pool-construction-description = The active run pool is shown with its remaining copies.
# Title for one chronological replay pick. $pickNumber is a positive one-based
# pick number; the surrounding disclosure contains the pack and selected cards.
card-pool-replay-pick-title = Pick { $pickNumber }
# Summary for one replay pick. $hasPicks is "yes" when at least one selection
# was recorded. $cardList is a locale-formatted list of canonical card display
# names with unknown grammatical gender; it is empty when $hasPicks is "no".
card-pool-replay-pick-summary =
    { $hasPicks ->
        [yes] Chose { $cardList }
       *[no] No pick recorded
    }
# One card name inside the locale-formatted replay pack list. $picked is "yes"
# when this card was selected and "no" otherwise. $cardName is a canonical card
# display name with unknown grammatical gender. The check mark is a compact
# visual status marker, and list punctuation is supplied by Intl.ListFormat.
card-pool-replay-card-label =
    { $picked ->
        [yes] ✓ { $cardName }
       *[no] { $cardName }
    }
# Accessible narration of the completed challenge in the tutorial battle.
# $winnerName and $loserName are canonical card display names with unknown
# grammatical gender. $loserOwner is "player" or "opponent" and identifies
# whose Void receives the losing card.
tutorial-battle-challenge-outcome =
    { $loserOwner ->
        [player] { $winnerName } wins the challenge. { $loserName } dissolves into the player void.
       *[opponent] { $winnerName } wins the challenge. { $loserName } dissolves into the opponent void.
    }
# Subtitle in the Dreamsign replacement dialog. $count is the positive maximum
# number of Dreamsigns the current player may hold at once.
dreamsign-replacement-capacity =
    { $count ->
        [one] You can hold { $count } { -dreamsign(number: "one") }.
       *[other] You can hold { $count } { -dreamsign(number: "other") }.
    }

### Reusable entity accessibility

# Accessible name for an interactive Dreamsign object. $dreamsignName is its
# canonical display name and has unknown grammatical gender.
dreamsign-object-accessible-name = Dreamsign: { $dreamsignName }
# Accessible name for an interactive Tide object. $tideName is its canonical
# authored display name and has unknown grammatical gender.
tide-object-accessible-name = Tide: { $tideName }
# Accessible name for character dialogue. $speakerName is the displayed name of
# the character currently speaking and has unknown grammatical gender.
character-dialogue-accessible-name = { $speakerName } speaks
# Accessible command on a drag handle that reorders one card. $itemLabel is the
# displayed card label; activating arrow-key commands moves that physical entry.
card-order-reorder-action = Reorder { $itemLabel }
# Accessible description and tooltip for a card's Transfiguration badge. $form
# is one of the seven stable Transfiguration form identifiers.
card-transfiguration-badge =
    { $form ->
        [Empowered] Empowered Transfiguration
        [Amplified] Amplified Transfiguration
        [Kindled] Kindled Transfiguration
        [Inspired] Inspired Transfiguration
        [Enduring] Enduring Transfiguration
        [Hastened] Hastened Transfiguration
       *[Resonant] Resonant Transfiguration
    }
# Tooltip explaining why a card's rules text differs from its base rules.
# $form is one of the seven stable Transfiguration form identifiers.
card-rules-transfiguration-changed =
    { $form ->
        [Empowered] Rules text changed by Empowered Transfiguration
        [Amplified] Rules text changed by Amplified Transfiguration
        [Kindled] Rules text changed by Kindled Transfiguration
        [Inspired] Rules text changed by Inspired Transfiguration
        [Enduring] Rules text changed by Enduring Transfiguration
        [Hastened] Rules text changed by Hastened Transfiguration
       *[Resonant] Rules text changed by Resonant Transfiguration
    }
# Accessible name for a selectable Transfiguration form and its price. $form is
# one of the seven stable form identifiers; $essenceCost is a non-negative
# integer, where exact zero means the choice is free.
transfiguration-form-choice =
    { $form ->
        [Empowered] Empowered
        [Amplified] Amplified
        [Kindled] Kindled
        [Inspired] Inspired
        [Enduring] Enduring
        [Hastened] Hastened
       *[Resonant] Resonant
    }{ $essenceCost ->
        [0] , free
       *[other] , { $essenceCost } { -essence }
    }
# Accessible label on a selected Augury card showing how many copies the offer
# grants. $count is a positive integer; the numeral is visible in the badge and
# is repeated here because this message is exposed only to assistive technology.
augury-card-choice-copy-count =
    { $count ->
        [one] { $count } copy
       *[other] { $count } copies
    }

### Augury offer titles and descriptions

# Detail title for an Augury offer that grants a preselected card.
augury-offer-card-gift-title = Gain a Card
# Description for an Augury offer that grants a preselected card. $cardName is
# the canonical card display name and has unknown grammatical gender.
augury-offer-card-gift-description = Gain { $cardName }
# Detail title for an Augury offer that asks the player to choose one card.
augury-offer-card-draft-title = Choose a Card
# Description for an Augury offer that lets the player choose one card and add
# it to the current deck.
augury-offer-card-draft-description = Choose a card to add to your deck.
# Detail title for an Augury offer that asks the player to choose a card and
# receive multiple copies of that chosen card.
augury-offer-copies-draft-title = Choose a Card
# Description for an Augury offer that adds copies of the chosen card.
# $copyCount is the positive integer number of copies added to the deck.
augury-offer-copies-draft-description =
    { $copyCount ->
        [one] Choose a card and add { $copyCount } copy of it to your deck.
       *[other] Choose a card and add { $copyCount } copies of it to your deck.
    }
# Detail title for an Augury offer whose candidates share one card category.
augury-offer-category-draft-title = Choose a Card
# Description for an Augury offer whose choices share one category. $category
# is "character", "event", "cheap", "mid-cost", "expensive", "fast",
# "subtype", or "package". $categoryName is the canonical subtype or package
# display name with unknown grammar for the last two variants, and is empty for
# the stable variants. The player chooses one card for their current deck.
augury-offer-category-draft-description =
    { $category ->
        [character] Choose a { -character } card to add to your deck.
        [event] Choose an { -event-card } to add to your deck.
        [cheap] Choose a cheap card to add to your deck.
        [mid-cost] Choose a mid-cost card to add to your deck.
        [expensive] Choose an expensive card to add to your deck.
        [fast] Choose a fast card to add to your deck.
        [subtype] Choose one { $categoryName } card to add to your deck.
       *[package] Choose one card from the { $categoryName } to add to your deck.
    }

# Detail title for an Augury offer whose card choices arrive transfigured.
augury-offer-transfigured-draft-title = Choose a Transfigured Card
# Description for an Augury offer that adds one already-transfigured card chosen
# by the player to the current deck.
augury-offer-transfigured-draft-description = Choose a transfigured card to add to your deck.
# Detail title for an Augury offer that grants a fixed group of cards. $count is
# the fixed positive group size, currently two or three.
augury-offer-card-bundle-title =
    { $count ->
        [one] Gain { $count } { -card(number: "one") }
       *[other] Gain { $count } { -card(number: "other") }
    }
# Description for an Augury offer that adds a fixed card group. $count is the
# positive number of cards added to the player's current deck.
augury-offer-card-bundle-description =
    { $count ->
        [one] Add { $count } { -card(number: "one") } to your deck.
       *[other] Add { $count } { -card(number: "other") } to your deck.
    }
# Detail title for an Augury offer that transfigures one preselected deck card.
augury-offer-transfigure-card-title = Transfigure a Card
# Description for that offer. $cardName is the canonical display name of the
# affected card and has unknown grammatical gender.
augury-offer-transfigure-card-description = Transfigure { $cardName }
# Detail title for an Augury offer that transfigures one or more starter cards.
augury-offer-transfigure-starters-title = Transfigure Your Starters
# Description when the offer targets one starter. $cardName is its canonical
# display name and has unknown grammatical gender.
augury-offer-transfigure-one-starter-description = Transfigure { $cardName }
# Description when the offer targets two starters. $firstCardName and
# $secondCardName are canonical display names with unknown grammatical gender.
augury-offer-transfigure-two-starters-description = Transfigure { $firstCardName } and { $secondCardName }
# Detail title for an Augury offer that lowers a card's Reclaim cost.
augury-offer-reclaim-reduction-title = Reduce Reclaim
# Description for that offer. $cardName is the canonical display name of the
# affected deck card and has unknown grammatical gender.
augury-offer-reclaim-reduction-description = Reduce Reclaim for { $cardName }
# Detail title for an Augury offer that changes a Character card's subtype.
augury-offer-subtype-change-title = Change a Character Type
# Description for that offer. $cardName is the canonical card display name and
# $subtypeName is the authored destination subtype; neither provides reliable
# grammatical gender.
augury-offer-subtype-change-description = Change the subtype of { $cardName } to { $subtypeName }.
# Detail title for an Augury offer that permanently removes a card from the
# player's current deck.
augury-offer-purge-card-title = Purge a Card
# Description for that offer. $cardName is the canonical display name of the
# card the offer will remove and has unknown grammatical gender.
augury-offer-purge-card-description = Purge { $cardName }
# Detail title for an Augury offer that removes one card and supplies a chooser
# for its replacement.
augury-offer-trade-card-title = Trade a Card
# Description for that offer. $cardName is the canonical display name of the
# card removed before the player chooses a replacement.
augury-offer-trade-card-description = Purge { $cardName } and choose a replacement card.
# Detail title for an Augury offer that duplicates a card. $candidateCount is
# the positive number of eligible cards shown; one means the target is fixed.
augury-offer-duplicate-card-title =
    { $candidateCount ->
        [one] Duplicate a Card
       *[other] Choose a Card
    }
# Description when an Augury duplicate offer has one fixed target. $cardName is
# that card's canonical display name and has unknown grammatical gender.
augury-offer-duplicate-one-card-description = Duplicate { $cardName }
# Description when the player chooses one card to duplicate. $candidateCount is
# the positive number of eligible cards shown, currently two or three.
augury-offer-duplicate-card-choice-description =
    { $candidateCount ->
        [one] Duplicate a card in your deck.
       *[other] Choose one of { $candidateCount } cards in your deck to duplicate.
    }
# Detail title for an Augury offer that grants a preselected Dreamsign.
augury-offer-dreamsign-gift-title = Gain a Dreamsign
# Description for that offer. $dreamsignName is the canonical Dreamsign display
# name and has unknown grammatical gender.
augury-offer-dreamsign-gift-description = Gain { $dreamsignName }
# Detail title for an Augury offer that asks the player to choose one Dreamsign.
augury-offer-dreamsign-draft-title = Choose a Dreamsign
# Description for an Augury offer that grants the Dreamsign selected by the
# player from the visible candidates.
augury-offer-dreamsign-draft-description = Choose a dreamsign to gain.
# Detail title for an Augury offer that adds one site to the current Dreamscape.
augury-offer-add-site-title = Add a Site
# Description for that offer. $siteName is the authored display name of the site
# type and has unknown grammatical gender.
augury-offer-add-site-description = Add the { $siteName } site.

### Gamble actions and prizes

# Title printed on a wager prize card before its concealed playing card is
# revealed. $targetLabel is the authored rank or rank range the current player
# must draw; it is display text with no modeled grammatical gender.
gamble-wager-prize-title = Draw { $targetLabel }
# Reward sentence printed on a wager prize card. $essenceAmount is the positive
# integer Essence payout. $hasDreamsign is "yes" when the same win also grants a
# Dreamsign. $dreamsignName is that Dreamsign's canonical display name and has
# unknown grammatical gender; it is an empty string when $hasDreamsign is "no".
gamble-wager-prize-description =
    { $hasDreamsign ->
        [yes] Win { $essenceAmount } { -essence } and { $dreamsignName }.
       *[no] Win { $essenceAmount } { -essence }.
    }
# Complete accessible name for an unrevealed wager prize card. It combines the
# draw condition and reward because the visual title and description are hidden
# from assistive technology by the labeled card group. $targetLabel is the
# authored winning rank or range, $essenceAmount is a positive integer,
# $hasDreamsign is "yes" or "no", and $dreamsignName is the canonical name with
# unknown grammatical gender or an empty string when no Dreamsign is awarded.
gamble-wager-prize-accessible-name =
    { $hasDreamsign ->
        [yes] Draw { $targetLabel }. Win { $essenceAmount } { -essence } and { $dreamsignName }.
       *[no] Draw { $targetLabel }. Win { $essenceAmount } { -essence }.
    }
# Accessible command for choosing one Gravok wager gate. $gateName is the
# authored gate display name with unknown grammar; $essenceCost is the positive
# integer Essence paid by the current player.
gamble-gravok-bet-accessible-name = Bet on { $gateName } for { $essenceCost } { -essence }
# Accessible command for purchasing the next Tidemark Ladder draw.
# $attemptNumber is the one-based attempt number from 1 through 4 and
# $essenceCost is the non-negative Essence price paid by the current player.
gamble-ladder-draw-accessible-name = Draw attempt { $attemptNumber } for { $essenceCost } { -essence }
# Accessible name for the group of three prize tiers in Starway Stairs.
gamble-starway-tier-group-accessible-name = Starway Stairs tiers
# Visible command for wagering on a Starway Stairs tier. $stage is "initial"
# for the first wager and "climb" for later tiers; each branch is a command to
# the current player. The Essence price is rendered separately on the button.
gamble-starway-tier-action =
    { $stage ->
        [initial] Bet
       *[climb] Climb
    }
# Accessible command for the same Starway Stairs wager. $stage is "initial" or
# "climb"; $tierNumber is the one-based tier from 1 through 3; and $essenceCost
# is the non-negative Essence price paid by the current player.
gamble-starway-tier-action-accessible-name =
    { $stage ->
        [initial] Bet { $essenceCost } { -essence } on Starway Stairs
       *[climb] Climb to tier { $tierNumber } for { $essenceCost } { -essence }
    }
# Accessible command for ending a Starway Stairs run and taking the accumulated
# payout. $essenceAmount is the positive integer Essence granted to the current
# player; the same amount is also visible beside the button label.
gamble-starway-cash-out-accessible-name = Take { $essenceAmount } { -essence }
# Accessible command for paying to draw in Four-Suit Reprise. $essenceCost is
# the non-negative Essence price paid by the current player and is also rendered
# separately on the button.
gamble-four-suit-draw-accessible-name = Draw for { $essenceCost } { -essence }

### Dream Avatar and Atlas accessibility

# Accessible name for Dream Avatar artwork. $avatarName is the canonical avatar
# display name and $avatarTitle is its authored epithet; neither has modeled
# grammatical gender. $hasTitle is "yes" when the epithet is present and "no"
# when the artwork should be identified by the name alone.
dream-avatar-art-accessible-name =
    { $hasTitle ->
        [yes] { $avatarName }, { $avatarTitle }
       *[no] { $avatarName }
    }
# Accessible name for one interactive Dream Atlas node. $hasBiomeName is "yes"
# after its authored dreamscape name is known and "no" while concealed;
# $biomeName is that display name or an empty string. $state is one of
# "unrevealed", "revealedLocked", "available", "completed", or "forgone" and
# describes the node's travel state. $role is "regular", "starter", or "boss".
# $hasKnownDreamsign is "yes" when the node visibly promises a Dreamsign and
# "no" otherwise. All clauses describe the same node to a screen-reader user.
atlas-node-accessible-name =
    { $hasBiomeName ->
        [yes] { $biomeName }
       *[no] Unrevealed dreamscape
    } — { $state ->
        [unrevealed] unrevealed
        [revealedLocked] revealed and locked
        [available] available
        [completed] completed
       *[forgone] unreachable
    }{ $role ->
        [starter] — starting dreamscape
        [boss] — final boss
       *[regular] { "" }
    }{ $hasKnownDreamsign ->
        [yes] — known Dreamsign here
       *[no] { "" }
    }
# Accessible name for a numeric stat orb on a card. $stat is "energy" for the
# card's play cost, "spark" for its challenge strength, or "dreamwellEnergy"
# for Energy granted by a Dreamwell card. $change is "empowered" or "kindled"
# when the corresponding Transfiguration changed this stat, and "none"
# otherwise. The visible numeral remains inside the same labeled element.
card-stat-accessible-name =
    { $stat ->
        [energy] Energy cost
        [spark] Spark
       *[dreamwellEnergy] Energy added
    }{ $change ->
        [empowered] , Empowered
        [kindled] , Kindled
       *[none] { "" }
    }
# Accessible name for the same numeric card stat orb when its caller supplies a
# complete, context-specific name in $baseName. $baseName is an already
# localized string, such as a Dreamwell effect that includes its Energy amount;
# it is not a card identity and its grammatical gender is unknown. $change is
# "empowered" or "kindled" when the corresponding Transfiguration changed the
# stat, and "none" otherwise. The visible numeral and optional change badge are
# inside this labeled element; preserve the base meaning while announcing the
# changed state without assuming English punctuation or clause order.
card-stat-custom-accessible-name =
    { $change ->
        [empowered] { $baseName }, Empowered
        [kindled] { $baseName }, Kindled
       *[none] { $baseName }
    }

### Journey failure and battle controls

# Title on the terminal Journey-failure screen. $result is "defeat" when the
# opponent won or "draw" when the battle ended without a winner.
journey-failed-title =
    { $result ->
        [defeat] Journey Ended
       *[draw] Stalemate
    }
# Explanatory sentence below the Journey-failure title. $result has the same
# "defeat" and "draw" values and addresses the current player.
journey-failed-message =
    { $result ->
        [defeat] Your journey ends here.
       *[draw] Neither side could claim the dream.
    }
# Short diagnostic cause on the Journey-failure summary. $reason is one of the
# three stable battle termination reasons recorded in Journey state.
journey-failed-reason =
    { $reason ->
        [score_target_reached] Score Threshold Reached
        [turn_limit_reached] Turn Limit Reached
       *[forced_result] Forced Result
    }
# Label beneath one numeric Journey-failure statistic. $stat identifies battles
# won, final round, the current player's score, or the opponent's score. The
# numeral is rendered immediately above this label.
journey-failed-stat-label =
    { $stat ->
        [battles] Battles Won
        [round] Final Round
        [playerScore] Your Score
       *[enemyScore] Opponent Score
    }
# Error shown when the Journey-failure route has no persisted failure summary.
journey-failed-summary-missing = Journey failure summary not found. Return to the journey menu to begin again.
# Command that starts a fresh Journey from the terminal failure screen.
journey-failed-new-journey-action = New Journey
# Title for a terminal battle-result surface. $outcome is "victory", "defeat",
# or "draw" from the current player's perspective.
battle-result-title =
    { $outcome ->
        [victory] Victory!
        [defeat] Defeat.
       *[draw] Draw.
    }
# Command that reopens a dismissed defeat or draw result. $outcome is "defeat"
# or "draw" and identifies the result being reopened.
battle-result-reopen-action =
    { $outcome ->
        [defeat] Defeat — Reopen
       *[draw] Draw — Reopen
    }
# Eyebrow above the animated Essence payout on a victorious battle result.
battle-result-essence-earned-label = Essence Earned
# Command that accepts a completed result or advances a resolved interaction.
battle-continue-action = Continue
# Command that dismisses a defeat or draw overlay while leaving the battlefield
# visible for inspection.
battle-result-keep-inspecting-action = Keep Inspecting
# Destructive command that opens the run-reset confirmation from a battle result.
battle-result-reset-run-action = Reset Run…
# Polite status shown when a battle choice belongs to the other controlled side.
# $side is "player" or "enemy" and names the side the local user must switch to.
battle-prompt-switch-side =
    { $side ->
        [enemy] Switch to the Opponent side to resolve this choice.
       *[player] Switch to the Player side to resolve this choice.
    }
# Radial announcement when battle control passes between sides. $owner is
# "viewer" when the active side matches the local perspective and "opponent"
# otherwise.
battle-turn-announcement =
    { $owner ->
        [viewer] Your Turn
       *[opponent] Opponent Turn
    }
# Caption below a card-picker candidate. $highlighted is "yes" for a newly
# drawn card, otherwise "no". $owner is "viewer" or "opponent" relative to the
# local perspective. $zone is "hand", "deck", "backRank", "frontRank", "void",
# or "banished" and identifies the candidate's battle zone.
battle-card-picker-zone-caption =
    { $highlighted ->
        [yes] Just Drawn
       *[no]
            { $owner ->
                [viewer] Your
               *[opponent] Opponent
            } { $zone ->
                [hand] Hand
                [deck] Deck
                [backRank] Back Rank
                [frontRank] Front Rank
                [void] Void
               *[banished] Banished
            }
    }
# Primary command in a battle card picker. $hasRequiredSelection is "yes" when
# cards must be submitted and "no" when the picker can resolve immediately.
battle-card-picker-submit-action =
    { $hasRequiredSelection ->
        [yes] Submit
       *[no] Continue
    }
# Compact progress shown in the full-screen card picker when no authored
# subtitle is available. $selectedCount and $requiredCount are non-negative card
# counts; the slash notation is intentionally compact for the panel header.
battle-card-picker-selected-count = { $selectedCount }/{ $requiredCount } selected
# Empty state in a battle card picker whose current prompt has no legal cards.
battle-card-picker-empty-state = No valid targets.
# Progress status in a battle card picker. $promptLabel is the authored complete
# picker instruction. $owner is "viewer" when candidates come from the current
# perspective's hand and "opponent" otherwise. $selectedCount and
# $requiredCount are non-negative card counts and may both be zero.
battle-card-picker-progress =
    { $owner ->
        [viewer] { $promptLabel } from your hand · { $selectedCount }/{ $requiredCount }
       *[opponent] { $promptLabel } from the opponent hand · { $selectedCount }/{ $requiredCount }
    }
# Accessible label for the group of battle navigation and choice controls.
battle-control-group-accessible-name = Battle controls
# Command that moves the developer-enabled phase control to the previous phase.
battle-previous-phase-action = Back
# Command that declines an optional battle card picker.
battle-card-picker-skip-action = Skip
# Primary battle-flow command. $action is "nextPhase", "continue", "endTurn",
# or "startChallenge" and describes the next semantic transition.
battle-flow-action =
    { $action ->
        [nextPhase] Next Phase
        [continue] Continue
        [endTurn] End Turn
       *[startChallenge] Start Challenge
    }
# Headline inside a Figment merge target. $status is "blocked" when exhaustion
# prevents the merge and "available" when the current Figment can merge there.
battle-figment-merge-target =
    { $status ->
        [blocked] Cannot Merge
       *[available] Merge
    }
# Compact Spark detail inside an available Figment merge target. $sparkCount is
# the non-negative Spark that the destination Figment will gain; the star is the
# canonical Spark symbol and is converted to the shared accessible glyph.
battle-figment-merge-spark-detail = +{ $sparkCount } ✦
# Title above one numbered Exploration card pack. $packNumber is a positive
# one-based display number.
exploration-pack-title = Pack { $packNumber }
# Visible command that chooses the Exploration pack shown above the button.
exploration-pack-choose-action = Choose
# Accessible command that chooses one Exploration card pack. $packNumber is the
# same positive one-based display number; the visible button says only Choose.
exploration-pack-choose-accessible-name = Choose Pack { $packNumber }
# Accessible name for one Four-Suit Reprise outcome row. $suit is the canonical
# playing-card suit name and $outcomeLabel is the authored complete outcome
# label associated with that suit.
gamble-four-suit-outcome-accessible-name = { $suit }: { $outcomeLabel }
# Accessible command that dismisses one tutorial dialogue. $speakerName is the
# displayed name of the character speaking and has unknown grammatical gender.
battle-tutorial-dismiss-action = Dismiss { $speakerName } tutorial
# Accessible name for a one- or two-bolt rules-text marker. $kind is "fast" for
# one bolt or "interrupt" for the paired Interrupt marker.
rules-text-bolt-accessible-name =
    { $kind ->
        [interrupt] Interrupt
       *[fast] Fast
    }
# Accessible name for interactive authored rules text. $owner is "card",
# "dreamAvatar", or "dreamsign" and identifies whose ability is described.
# $rulesText is the complete authored rules text displayed inside the same
# control; it may contain game symbols and multiple sentences.
rules-text-source-accessible-name =
    { $owner ->
        [card] Card rules: { $rulesText }
        [dreamAvatar] Avatar ability: { $rulesText }
       *[dreamsign] Dreamsign ability: { $rulesText }
    }
# Accessible reveal description for a Dreamwell card. $cardName is the
# canonical card display name with unknown grammatical gender. $hasRules is
# "yes" when authored rules text follows; $rulesText is that complete text or
# an empty string when $hasRules is "no".
battle-dreamwell-reveal-description =
    { $hasRules ->
        [yes] { $cardName }. { $rulesText }
       *[no] { $cardName }
    }
# Compact progress below the visible draft pack. $pickNumber is the positive
# one-based current pick and $pickTotal is the positive total number of picks.
draft-pick-progress = Draft ({ $pickNumber }/{ $pickTotal })
# Headline for an Exploration reward that modifies the next battle.
# $modifier is "openingHand" when $amount cards are added to the opening hand
# or "startingEnergy" when $amount Energy is added. $amount is a positive
# integer and the result applies to the current player.
exploration-battle-modifier-announcement =
    { $modifier ->
        [openingHand]
            { $amount ->
                [one] +{ $amount } { -card(number: "one") }
               *[other] +{ $amount } { -card(number: "other") }
            }
       *[startingEnergy] +{ $amount } ●
    }
# Detail below the Exploration battle-modifier reward headline.
exploration-next-battle-label = Next Battle
# Headline on an Exploration reward announcement that grants Essence.
exploration-essence-gained-title = Essence Gained
# Calculation detail for Essence gained by purging a card. $essencePerSpark is
# a non-negative Essence rate and $spark is the purged card's non-negative
# Spark value; the total Essence payout is rendered separately.
exploration-purge-essence-calculation = { $essencePerSpark } × { $spark } ✦
# Calculation detail for Essence gained from Spirit Animal cards.
# $essencePerCard is a non-negative Essence rate and $cardCount is the positive
# number of Spirit Animal cards involved; the total payout is rendered
# separately.
exploration-spirit-animal-essence-calculation =
    { $essencePerCard } × { $cardCount ->
        [one] { $cardCount } Spirit Animal
       *[other] { $cardCount } Spirit Animals
    }
# Accessible name for a standard playing card. $state is "concealed" for the
# face-down Four-Suit Reprise card or "visible" for a revealed card. $rank and
# $suit are canonical playing-card rank and suit display values.
playing-card-accessible-name =
    { $state ->
        [visible] { $rank } of { $suit }
       *[concealed] Face-down four-suit playing card
    }
# Type line printed on a game card. $cardType and $subtype are canonical authored
# taxonomy labels. $presentation is "character" when Character cards display
# only their subtype and "other" when the type remains visible. $hasSubtype is
# "yes" when $subtype is non-empty and "no" otherwise.
card-type-line =
    { $presentation ->
        [character]
            { $hasSubtype ->
                [yes] { $subtype }
               *[no] { "" }
            }
       *[other]
            { $hasSubtype ->
                [yes] { $cardType } — { $subtype }
               *[no] { $cardType }
            }
    }

### Remaining runtime outcome and control grammar

# Accessible name for the group containing the available choices beneath an
# Exploration site's authored narrative. The current player activates one
# choice to resolve the site.
exploration-choices-accessible-name = Exploration choices
# Accessible command on the full-screen Exploration artwork that collapses the
# expanded site and returns the current player to its choice view.
exploration-return-action = Return to Exploration
# Complete accessible summary for the Exploration reward that reduces both the
# current player's next opening hand and card Energy costs. $openingHandDelta is
# a negative integer card-count change, $energyCostReduction is a positive
# integer Energy reduction, and both changes apply for the next battle.
exploration-smaller-hand-cost-accessible-name =
    Your next battle begins with { $openingHandDelta } { $openingHandDelta ->
        [one] { -card(number: "one") }
       *[other] { -card(number: "other") }
    } and your cards cost { $energyCostReduction } less { -energy }
# Compact headline for that reward. $openingHandDelta is the negative integer
# change in the current player's next opening-hand card count.
exploration-opening-hand-change-announcement =
    { $openingHandDelta } { $openingHandDelta ->
        [one] { -card(number: "one") }
       *[other] { -card(number: "other") }
    }
# Compact detail below the opening-hand headline. $energyCostReduction is the
# positive integer Energy reduction applied to every card in the next battle.
exploration-next-battle-card-cost-reduction = Next Battle · Cards cost { $energyCostReduction } less { -energy }
# Accessible completed-event summary for an Exploration reward that causes the
# next Draft or Shop offered to the current player to contain transfigured cards.
exploration-site-offer-modifier-accessible-name = Your next Draft or Shop will contain transfigured cards
# Headline for the same completed Exploration reward.
exploration-site-offer-modifier-title = Transfigured Cards
# Compact detail naming where that reward takes effect.
exploration-site-offer-modifier-detail = Next Draft or Shop
# Accessible completed-event summary shown when the current player deliberately
# resolves a card-acquisition Exploration outcome without taking any cards.
exploration-no-cards-taken = No Cards Taken
# Visible command used to place a wager on a Gravok gate.
gamble-gravok-bet-action = Bet
# Accessible name for the group containing the three Gravok wager gates.
gamble-gravok-gates-accessible-name = Three wager gates
# Outcome headline after a Gravok wager. $outcome is "won" when the current
# player receives the displayed prize or "bust" when the wager pays nothing.
gamble-gravok-outcome-headline =
    { $outcome ->
        [won] Won!
       *[bust] Bust!
    }
# Accessible name for the Tidemark Ladder play area containing the concealed
# prize card and the current player's draw controls.
gamble-ladder-stage-accessible-name = Ladder climb
# Outcome headline after a Tidemark Ladder draw. $outcome is "won" when the
# current player drew within the winning range or "miss" otherwise.
gamble-ladder-outcome-headline =
    { $outcome ->
        [won] Won
       *[miss] Miss
    }
# Outcome headline after a Starway Stairs draw. $outcome is "safe" when the
# current player's accumulated prize remains available or "bust" when it is lost.
gamble-starway-outcome-headline =
    { $outcome ->
        [safe] Safe!
       *[bust] Bust!
    }
# Detail beneath a safe Starway Stairs outcome, indicating that the accumulated
# prize remains exposed to loss if the current player continues climbing.
gamble-starway-prize-at-stake = Prize at stake
# Title of the Four-Suit Reprise card picker.
gamble-four-suit-picker-title = Four-Suit Reprise
# Instruction below that picker title; the current player chooses one owned card
# that will be affected by the subsequent wager outcome.
gamble-four-suit-picker-instruction = Choose a card to wager
# Empty state in that picker when the current player owns no cards eligible for
# the wager.
gamble-four-suit-picker-empty-state = No eligible cards remain.
# Accessible name for the Four-Suit Reprise wager stage after a card is selected.
gamble-four-suit-stage-accessible-name = Four-Suit Reprise wager
# Complete visible Four-Suit Reprise reward row when the selected suit grants
# Essence. $essenceAmount is the positive integer Essence gained by the current
# player.
gamble-four-suit-essence-outcome = Gain { $essenceAmount } { -essence }
# Outcome headline after a Four-Suit Reprise draw. $outcome is
# "transfiguration", "essence", "duplication", or "purge" and names the effect
# that will be applied to the current player's selected card.
gamble-four-suit-result-headline =
    { $outcome ->
        [transfiguration] Transfigure
        [essence] Gained
        [duplication] Duplicated
       *[purge] Purged
    }
# Visible command that immediately starts another round of the current Gamble
# game after the previous outcome settles.
gamble-play-again-action = Play Again
# Visible command that exits the current Gamble site.
gamble-leave-action = Leave
# Visible command that opens the required Dreamsign replacement picker after a
# Gamble reward would exceed the current player's capacity.
gamble-choose-replacement-action = Choose Replacement
# Visible command that postpones choosing a Dreamsign replacement.
gamble-replacement-not-yet-action = Not Yet
# Accessible command that closes the Gamble Dreamsign replacement picker.
gamble-replacement-close-action = Close replacement choice
# Visible command that draws from the current Gamble game's playing-card deck.
gamble-draw-action = Draw
# Visible command that claims the accumulated Starway Stairs prize.
gamble-take-prize-action = Take
# Accessible command that returns from a selected Four-Suit Reprise card to its
# card picker so the current player can choose a different card.
gamble-four-suit-choose-another-card-action = Choose another card
# Accessible status on a battle card whose actions are unavailable until it is
# readied by the game rules.
battle-card-exhausted-accessible-name = Exhausted
# Accessible name for the staged battle card that the current player has played
# and must now assign a legal target to.
battle-targeting-card-accessible-name = Card awaiting a target
# Title of the transient notice shown when a Figment merge is rejected before
# the current player's intent is sent.
battle-figment-merge-blocked-title = Merge Blocked
# Explanation in that notice when exhaustion states make the two Figments
# incompatible. Both referenced Figments are visible on the battlefield.
battle-figment-merge-blocked-exhaustion = An exhausted Figment cannot be merged with one that is not exhausted.
# Complete warning in the confirmation dialog for a Legionnaire Figment merge.
# $sparkCount is the non-negative Spark added to the destination Figment. The ✦
# is the canonical Spark symbol and becomes an accessible glyph. The
# Legionnaire's Warrior-count bonus is excluded, and the action is irreversible.
battle-figment-merge-legionnaire-warning = Only { $sparkCount } ✦ from this Legionnaire will be added. Its Warrior-count bonus does not transfer. This merge cannot be undone.
# Visible command that confirms the pending Figment merge.
battle-figment-merge-confirm-action = Merge
# Visible command and accessible close name that cancels a pending Figment merge.
battle-figment-merge-cancel-action = Cancel
# Title above the tutorial battle prompt shown after the current player plays a
# card that requires a battlefield target.
battle-tutorial-target-selection-title = Choose a Target
# Instruction beneath that title; the current player must activate one of the
# visually highlighted legal targets.
battle-tutorial-target-selection-instruction = Select a highlighted legal target.
# Visible command that cancels the tutorial card's pending target selection.
battle-tutorial-target-selection-cancel-action = Cancel
# Transient tutorial battle movement error. $reason is "sendFailed" when the
# current player's movement intent could not be submitted, "exhaustedFrontRank"
# when an exhausted Character cannot enter the front rank during the opponent's
# Dusk, or "noLegalCell" when the attempted drop has no legal destination.
battle-tutorial-movement-error =
    { $reason ->
        [sendFailed] Movement failed to send. Try again.
        [exhaustedFrontRank] This character is exhausted and cannot move to the front rank.
       *[noLegalCell] No legal battlefield cell is available for this movement.
    }
# Title of the card picker at a Transfiguration site.
transfiguration-picker-title = Transfiguration
# Picker instruction or loading status. $state is "standard" for the normal
# one-offer picker, "enhanced" when any eligible card may be selected, or
# "loading" while the persisted choices are being prepared.
transfiguration-picker-instruction =
    { $state ->
        [standard] Choose a card to reforge
        [enhanced] Pick any card to reforge
       *[loading] Heating the forge…
    }
# Caption beneath a card that has already been reforged. $form is its canonical
# Transfiguration form name and is one of the forms defined by game data.
transfiguration-reforged-card-caption = { $form } · Reforged
# Empty or loading text in the Transfiguration picker. $state is "empty" when
# no card can be reforged or "loading" while choices are being prepared.
transfiguration-picker-empty-state =
    { $state ->
        [empty] No eligible cards to reforge.
       *[loading] Heating the forge…
    }
# Title above the form choices for the currently selected card. "Its" refers
# to that card and avoids assuming grammatical gender for its display name.
transfiguration-form-picker-title = Choose Its New Form
# Visible command that returns to the Transfiguration card picker.
transfiguration-choose-again-action = Choose Again
# Visible command that declines a Transfiguration site. $presentation is
# "compact" for the narrow header action or "full" for the desktop footer.
transfiguration-decline-action =
    { $presentation ->
        [compact] Decline
       *[full] Decline Offer
    }
# Confirmation command at a Transfiguration site. $state is "ready" before the
# current player commits the selected form or "pending" while it is being saved.
transfiguration-confirm-action =
    { $state ->
        [ready] Transfigure
       *[pending] Reforging…
    }
# Title of the card picker at a Duplication site.
duplication-picker-title = Duplication
# Picker instruction or loading status. $state is "standard" for the normal
# one-offer picker, "enhanced" when any owned card may be selected, or "loading"
# while the persisted choices are being prepared.
duplication-picker-instruction =
    { $state ->
        [standard] Choose a card to copy
        [enhanced] Choose any card to copy
       *[loading] Gathering possibilities…
    }
# Empty or loading text in the Duplication picker. $state is "empty" when no
# card can be copied or "loading" while choices are being prepared.
duplication-picker-empty-state =
    { $state ->
        [empty] No cards available to copy.
       *[loading] Gathering possibilities…
    }
# Visible command that declines a Duplication site. $presentation is "compact"
# on narrow layouts or "full" in the desktop footer.
duplication-decline-action =
    { $presentation ->
        [compact] Decline
       *[full] Decline Offer
    }
# Confirmation command at a Duplication site. $state is "ready" before the
# current player commits or "pending" while the new copy is being saved.
duplication-confirm-action =
    { $state ->
        [ready] Duplicate
       *[pending] Duplicating…
    }
# Accessible command on a narrow Journey-start carousel edge control. $direction
# is "previous" to move to the preceding Dream Avatar or "next" for the following one.
journey-start-carousel-navigation-action =
    { $direction ->
        [previous] Previous
       *[next] Next
    }
# Canonical alignment name beneath the icon on a Tide information card. $tide
# is one of "ember", "valor", "vision", "wild", or "shadow" from the semantic
# Tide model; translations may use the established localized proper names.
tide-alignment-name =
    { $tide ->
        [ember] Ember
        [valor] Valor
        [vision] Vision
        [wild] Wild
       *[shadow] Shadow
    }
