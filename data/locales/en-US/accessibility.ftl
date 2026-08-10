### Accessibility-only names, descriptions, and narration

# Accessible name for the primary front-door navigation landmark.
main-menu-navigation-label = Main menu
# Accessible group name for external community links.
main-menu-community-label = Dreamtides community
# Tides information reveal trigger.
tides-information-accessible-name = Tides information
# Loading-screen resource glyph accessible names.
tutorial-feature-energy-glyph = energy
tutorial-feature-spark-glyph = spark
# Shared journey-status labels and controls.
journey-status-avatar-accessible-name = Avatar
journey-status-essence-accessible-name = Essence Total
# Tutorial region accessible names.
tutorial-region-battle = Battle tutorial
tutorial-region-card = Card tutorial
tutorial-region-site = Site tutorial
deck-filter-subtype-accessible-name = Filter by subtype
deck-sort-accessible-name = Sort order
deck-sort-ascending-accessible-name = Sort ascending
deck-sort-descending-accessible-name = Sort descending
# Accessible name for the icon-only control that dismisses the player's deck
# browser and returns focus to the Journey screen beneath it.
deck-browser-close = Close deck browser
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
# Accessible name for the icon-only control that dismisses a battle card-zone
# browser. $zone is "deck", "void", or "banished" with the meanings above.
battle-zone-browser-close =
    { $zone ->
        [deck] Close deck browser
        [void] Close void browser
       *[banished] Close banished-cards browser
    }
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
# $formName is the source-English name supplied by the Transfiguration catalog.
exploration-card-transfiguring = Transfiguring { $cardName } into its { $formName } form
# Accessible completed-state announcement after one paid Exploration effect
# applies the same Transfiguration form to all eligible deck cards.
# $cardCount is the positive number of concrete deck entries changed;
# $formName is the form's canonical source display name; $essenceAmount is the
# positive integer Essence cost already deducted from the current player.
exploration-bulk-transfiguration-complete =
    { $cardCount ->
        [one] Transfigured { $cardCount } eligible card into its { $formName } form and spent { $essenceAmount } { -essence }
       *[other] Transfigured { $cardCount } eligible cards into their { $formName } forms and spent { $essenceAmount } { -essence }
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
# Accessible name for the Essence reward value on the battle victory screen.
# $amount is the non-negative amount already earned by the local player.
battle-victory-essence-gained = Gained { $amount } { -essence }
# Accessible summary for one participant's battle status card. $owner is
# "viewer" for the side nearest the current local perspective or "opponent" for
# the opposing side. Energy and point values are non-negative integers;
# maximums and the points-to-win target are positive integers.
battle-participant-status =
    { $owner ->
        [viewer]
            Your side: { $currentEnergy } of { $maxEnergy } { -energy }, { $points } of { $pointsToWin } { $pointsToWin ->
                [one] { -point(number: "one") }
               *[other] { -point(number: "other") }
            }
       *[opponent]
            Opponent: { $currentEnergy } of { $maxEnergy } { -energy }, { $points } of { $pointsToWin } { $pointsToWin ->
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
# Accessible command on the card-pool sort-direction control. $direction is
# "asc" for ascending or "desc" for descending order.
card-pool-sort-direction =
    { $direction ->
        [desc] Sort descending
       *[asc] Sort ascending
    }
# Accessible label for the card-pool subtype selector.
card-pool-subtype-filter-label = Filter card subtype
# Accessible label for the card-pool Energy-cost selector.
card-pool-cost-filter-label = Filter card cost
# Accessible command that closes the card-pool browser.
card-pool-close-action = Close pool viewer
# Accessible label for the card-pool sort-field selector.
card-pool-sort-label = Sort cards
# Accessible narration of the completed challenge in the tutorial battle.
# $winnerName and $loserName are canonical card display names with unknown
# grammatical gender. $loserOwner is "player" or "opponent" and identifies
# whose Void receives the losing card.
tutorial-battle-challenge-outcome =
    { $loserOwner ->
        [player] { $winnerName } wins the challenge. { $loserName } dissolves into the player void.
       *[opponent] { $winnerName } wins the challenge. { $loserName } dissolves into the opponent void.
    }
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
# Accessible name for a selectable Transfiguration form and its price.
# $formName is the authored catalog name; $essenceCost is a non-negative integer,
# where exact zero means the choice is free.
transfiguration-form-choice =
    { $formName }{ $essenceCost ->
        [0] , free
       *[other] , { $essenceCost } { -essence }
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
gamble-gate-bet-accessible-name = Bet on { $gateName } for { $essenceCost } { -essence }
# Accessible command for purchasing the next Tidemark Ladder draw.
# $attemptNumber is the one-based attempt number from 1 through 4 and
# $essenceCost is the non-negative Essence price paid by the current player.
gamble-draw-attempt-accessible-name = Draw attempt { $attemptNumber } for { $essenceCost } { -essence }
# Accessible command for the same Starway Stairs wager. $stage is "initial" or
# "climb"; $tierNumber is the one-based tier from 1 through 3; and $essenceCost
# is the non-negative Essence price paid by the current player.
gamble-tier-action-accessible-name =
    { $stage ->
        [initial] Bet { $essenceCost } { -essence } on Starway Stairs
       *[climb] Climb to tier { $tierNumber } for { $essenceCost } { -essence }
    }
# Accessible command for ending a Starway Stairs run and taking the accumulated
# payout. $essenceAmount is the positive integer Essence granted to the current
# player; the same amount is also visible beside the button label.
gamble-cash-out-accessible-name = Take { $essenceAmount } { -essence }
# Accessible command for paying to draw in Four-Suit Reprise. $essenceCost is
# the non-negative Essence price paid by the current player and is also rendered
# separately on the button.
gamble-draw-accessible-name = Draw for { $essenceCost } { -essence }
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
# for Energy granted by a Dreamwell card. $change identifies which stat badge
# is present, and $changeName is the source-English Transfiguration form name
# supplied by the catalog. The visible numeral remains inside the same labeled
# element.
card-stat-accessible-name =
    { $stat ->
        [energy] Energy cost
        [spark] Spark
       *[dreamwellEnergy] Energy added
    }{ $change ->
        [empowered] , { $changeName }
        [kindled] , { $changeName }
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
# $changeName is supplied by the Transfiguration catalog.
card-stat-custom-accessible-name =
    { $change ->
        [empowered] { $baseName }, { $changeName }
        [kindled] { $baseName }, { $changeName }
       *[none] { $baseName }
    }
# Accessible label for the group of battle navigation and choice controls.
battle-control-group-accessible-name = Battle controls
# Accessible command that chooses one Exploration card pack. $packNumber is the
# same positive one-based display number; the visible button says only Choose.
exploration-pack-choose-accessible-name = Choose Pack { $packNumber }
# Accessible name for one Four-Suit Reprise outcome row. $suit is the canonical
# playing-card suit name and $outcomeLabel is the authored complete outcome
# label associated with that suit.
gamble-suit-outcome-accessible-name = { $suit }: { $outcomeLabel }
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
card-attribute-interrupt-accessible-name = Interrupt
card-attribute-fast-accessible-name = Fast
card-identicon-alt = { $cardName } identicon
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
# Accessible name for a standard playing card. $state is "concealed" for the
# face-down Four-Suit Reprise card or "visible" for a revealed card. $rank and
# $suit are canonical playing-card rank and suit display values.
playing-card-accessible-name =
    { $state ->
        [visible] { $rank } of { $suit }
       *[concealed] Face-down four-suit playing card
    }
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
# Accessible completed-event summary for an Exploration reward that causes the
# next Draft or Shop offered to the current player to contain transfigured cards.
exploration-site-offer-modifier-accessible-name = Your next Draft or Shop will contain transfigured cards
# Accessible completed-event summary shown when the current player deliberately
# resolves a card-acquisition Exploration outcome without taking any cards.
exploration-no-cards-taken = No Cards Taken
gamble-playing-card-hand-accessible-name =
    { $owner ->
        [dealer] Dealer hand
       *[player] Player hand
    }
# Accessible command that closes the Gamble Dreamsign replacement picker.
gamble-replacement-close-action = Close replacement choice
# Accessible status on a battle card whose actions are unavailable until it is
# readied by the game rules.
battle-card-exhausted-accessible-name = Exhausted
# Accessible name for the staged battle card that the current player has played
# and must now assign a legal target to.
battle-targeting-card-accessible-name = Card awaiting a target
# Accessible command on a narrow Journey-start carousel edge control. $direction
# is "previous" to move to the preceding Dream Avatar or "next" for the following one.
journey-start-carousel-navigation-action =
    { $direction ->
        [previous] Previous
       *[next] Next
    }
# Joins two complete hidden-description clauses. Punctuation and spacing belong
# to the locale so the coordinator never assembles sentence grammar.
reveal-description-join = { $left }. { $right }
# One glossary definition entry in a hidden reveal description.
reveal-definition-entry = { $term }. { $definition }
# Connects two or more authored energy-cost labels in a hidden card
# description. $left may already contain a connected prefix; both variables are
# opaque cost labels and the conjunction stays in Fluent.
reveal-list-and = { $left } and { $right }
# Game-card stat and trait clauses. Card names, types, rules, and authored text
# remain variables; Fluent owns the surrounding grammar.
reveal-card-energy = Energy { $value }
reveal-card-energy-variable = Energy X
reveal-card-energy-alternatives = Energy { $values }
reveal-card-spark = Spark { $value }
reveal-card-spark-variable = Spark X
reveal-card-reclaim = Reclaim { $value }
reveal-card-fast = Fast
reveal-card-interrupt = Interrupt
battle-zone-browser-sort-accessible-name = Sort zone cards
battle-zone-browser-filter-accessible-name = Filter zone cards by type
transfiguration-options-accessible-name = Transfiguration options
battle-card-note-expiry-accessible-name = Note expiry
card-editor-field-accessible-name = { $field } editor
radial-hand-total-accessible-name = { $owner } total { $total }
battle-opponent-card-accessible-name = Opponent card
