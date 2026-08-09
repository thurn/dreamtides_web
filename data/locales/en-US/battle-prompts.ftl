### Battle choices and pending prompts

# Reusable prompt title for discovering one Character card.
battle-prompt-discover-character = Discover a character
# Affirmative option in a battle confirmation prompt.
battle-prompt-confirm-yes = Yes
# Skip option in a battle confirmation prompt.
battle-prompt-confirm-skip = Skip
# Safe fallback for an imported legacy battle prompt whose title is unknown.
battle-prompt-generic = Choose an option
# Safe fallback subtitle for an imported legacy battle prompt.
battle-prompt-generic-subtitle = Choose an available option to continue.
# Safe fallback for an imported legacy battle option whose meaning is unknown.
battle-prompt-generic-option = Choose this option
# Polite status shown when a battle choice belongs to the other controlled side.
# $side is "player" or "enemy" and names the side the local user must switch to.
battle-prompt-switch-side =
    { $side ->
        [enemy] Switch to the Opponent side to resolve this choice.
       *[player] Switch to the Player side to resolve this choice.
    }
