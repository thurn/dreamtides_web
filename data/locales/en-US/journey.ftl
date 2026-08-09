### Journey progression and navigation

# Loading-screen card feature labels.
tutorial-feature-cost = Cost
tutorial-feature-spark = Spark
tutorial-feature-ability = Ability
tutorial-feature-card-type = Card Type
journey-status-dreamsigns-title = Dreamsigns
journey-status-close-action = Close
journey-status-no-avatar = No avatar is active.
# Normal Journey utility-menu actions. These labels are visible in the shared
# app chrome; debug-labelled actions remain in the same menu only when their
# route supplies the corresponding developer capability.
journey-menu-view-deck-action = View Deck
journey-menu-pool-viewer-action = Pool Viewer
journey-menu-package-debug-action = Package Debug
journey-menu-card-sources-action = Card Sources
journey-menu-edit-state-action = Edit Journey State
journey-menu-regenerate-atlas-action = Regenerate Atlas
journey-menu-open-action = Open menu
journey-menu-save-action = Save Journey
journey-menu-load-action = Load Journey
journey-menu-download-log-action = Download Log
journey-menu-build-sha-action = Build SHA
# Native browser prompt text for naming a downloaded Journey save. The prompt is
# visible before the file is created and asks for the player's authored name.
journey-menu-save-prompt = Save current journey as:
# Transient status after the player submits an empty Journey save name.
journey-menu-save-cancelled = Save cancelled: a name is required.
# Transient status after a Journey save download. $fileName is a generated
# filename and remains an opaque technical value.
journey-menu-save-downloaded = Downloaded "{ $fileName }".
# Technical detail shown when saving a Journey fails. $detail is an opaque
# exception or file-system detail, displayed as a complete status value.
journey-menu-save-error = { $detail }
# Fallback technical detail when a save failure does not provide an exception
# message.
journey-menu-save-generic-error = Failed to save journey.
# Transient status when loading is not available in the current route context.
journey-menu-load-unavailable = Loading is unavailable in this context.
# Transient status after a Journey save is imported. $name is the player's
# authored save name and remains opaque.
journey-menu-load-loaded = Loaded "{ $name }".
# Technical detail shown when loading a Journey fails. $detail is an opaque
# exception or file-system detail, displayed as a complete status value.
journey-menu-load-error = { $detail }
# Fallback technical detail when a load failure does not provide an exception
# message.
journey-menu-load-generic-error = Failed to load journey.
# Transient status after the player opens the build identifier from Journey
# chrome. $gitSha is an opaque technical build identifier.
journey-menu-build-sha-status = Build Git SHA: { $gitSha }

# Battle-preview route failure title and explanation.

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
# Subtitle in the Dreamsign replacement dialog. $count is the positive maximum
# number of Dreamsigns the current player may hold at once.
dreamsign-replacement-capacity =
    { $count ->
        [one] You can hold { $count } { -dreamsign(number: "one") }.
       *[other] You can hold { $count } { -dreamsign(number: "other") }.
    }
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
atlas-final-boss-title = Final boss
atlas-known-dreamsign-title = Known dreamsign
dreamscape-reward-status =
    { $kind ->
        [dreamsign]
            { $state ->
                [found] Found dreamsign: { $dreamsignName }
               *[gained] Gained dreamsign: { $dreamsignName }
            }
       *[essence] Gained { $amount } essence
    }
dreamscape-reward-dreamsign-label =
    { $state ->
        [found] Dreamsign found
       *[gained] Dreamsign gained
    }
dreamsign-replacement-pending-label = Cumulus Dreamsign replacement pending reward
dreamsign-replacement-collection-label = Cumulus Dreamsign replacement collection
dreamsign-replacement-decline-reward-action = Decline Dreamsign reward
dreamsign-revelation-cancel-action = Cancel
dreamsign-revelation-cancel-replacement-action = Cancel replacement
draft-reroll-offer = Reroll draft offer
tutorial-how-to-play-title = How to Play
tutorial-how-to-play-close = Close how to play
tutorial-battle-complete = Tutorial complete
tutorial-new-journey-action = New Journey
tutorial-opponent-card-flipping = Opponent card flipping face up
tutorial-drag-to-block = Drag { $sourceCardName } to block { $opposingCardName }.
