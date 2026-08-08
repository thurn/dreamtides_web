### Battle presentation and controls

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
# Empty state when the selected battle zone itself contains zero cards.
battle-zone-browser-empty = No Cards.
# Empty state when a non-empty battle zone has no cards matching the active
# search or type filter.
battle-zone-browser-no-filter-matches = No Matching Cards.
# Primary action that creates one or more configured Figments in the battle
# developer creation dialog. $count is an integer from 1 through the dialog's
# configured maximum; activating the control creates exactly that many.
battle-figment-create-action =
    { $count ->
        [one] Create { -figment(number: "one") }
       *[other] Create { $count } { -figment(number: "other") }
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
battle-zone-browser-search-label = Search Cards
battle-zone-browser-search-placeholder = Search by name…
battle-status-avatar-loading = Avatar portrait loading
battle-start-ability-label = Ability
battle-start-title = Battle vs. { $avatarName }
battle-start-inactive-ability = Opponent avatar ability is not active.
battle-start-signature-cards-and-dreamsigns-label = Signature Cards & Dreamsigns
battle-start-signature-cards-label = Signature Cards
battle-start-dreamsigns-label = Dreamsigns
battle-start-to-win-label = To Win
battle-start-reward-label = Reward
battle-start-action = Begin Battle
battle-foresee-less-action = Foresee 1 fewer
battle-foresee-more-action = Foresee 1 more
battle-foresee-triggered-by = Triggered By
battle-foresee-deck-destination = Deck
battle-foresee-void-destination = Void
battle-card-note-subtitle = Notes appear on the card and in the inspector.
battle-card-note-cancel = Cancel note
battle-card-note-text-label = Note Text
battle-card-note-placeholder = Short reminder
battle-card-note-character-count = { $count }/200 characters
battle-card-note-error = A note needs text.
battle-card-note-expiry-label = Expiry
battle-card-note-expiry-next-turn = End of Next Turn
battle-card-note-expiry-this-turn = End of This Turn
battle-card-note-expiry-numbered = After a Number of Turns
battle-card-note-expiry-manual = Manual Dismissal
battle-card-note-turns-label = Turns Before Expiry
battle-card-note-fewer-turn = Use one fewer turn
battle-card-note-more-turn = Use one more turn
battle-card-note-cancel-action = Cancel
battle-card-note-add-action = Add Note
battle-deck-order-subtitle = Top to bottom. Confirm commits one battle command.
battle-deck-order-close-action = Cancel deck ordering
battle-deck-order-cancel-action = Cancel
battle-deck-order-confirm-action = Confirm Order
battle-deck-order-title =
    { $scope ->
        [full] Reorder { $side } Deck
       *[top] Reorder Revealed Cards of { $side } Deck
    }
battle-deck-order-label = { $side } deck order
battle-missing-card-instance = Missing card instance
battle-card-order-spark-summary = { $subtype } · Spark { $spark }
battle-dreamwell-history-title = Dreamwell History
battle-dreamwell-history-subtitle = Shared draws, most recent first.
battle-dreamwell-history-close-action = Close Dreamwell history
battle-dreamwell-history-empty = No Dreamwell cards drawn yet.
battle-victory-headline = Victory
battle-ai-reject-action = Reject AI action
