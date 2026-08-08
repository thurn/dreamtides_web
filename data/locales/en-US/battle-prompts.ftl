### Battle choices and pending prompts

# Prompt title in a battle picker. $maxCost is the non-negative Energy-cost
# ceiling for eligible cards; the production Dreamwell effect supplies 2.
battle-prompt-discover-card-max-cost = Discover a ≤{ $maxCost }● cost card
# Prompt title for discovering one Character card from the available choices.
battle-prompt-discover-character = Discover a character
# Prompt title for returning one allied Character from the Void to play.
battle-prompt-rematerialize-ally = Rematerialize an ally
# Prompt title for granting a selected Void card temporary Reclaim.
battle-prompt-choose-void-card-reclaim = Choose a void card to gain Reclaim
# Subtitle explaining the temporary play permission and its later consequence.
battle-prompt-choose-void-card-reclaim-subtitle = You may play it from your void this turn, then banish it.
# Prompt title for choosing one card to discard.
battle-prompt-choose-card-discard = Choose a card to discard
# Prompt title for discarding one card.
battle-prompt-discard-card = Discard a card
# Confirmation title for discarding and drawing the same number of cards. $count
# is a positive integer; the production effect supplies 2.
battle-prompt-confirm-discard-draw = Discard { $count } cards, then draw { $count }?
# Picker title for the discard phase of a discard-and-draw effect. $count is a
# positive integer and matches the subsequent draw count.
battle-prompt-discard-cards = Discard { $count } cards
# Prompt title for returning one card from the Void to the player's hand.
battle-prompt-return-void-card = Return a void card to hand
# Prompt title for returning an Event card from the player's Void to hand.
battle-prompt-return-event-from-void = Return an event from your void to hand
# Prompt title for banishing one opposing Character card.
battle-prompt-banish-enemy-character = Banish an enemy character
# Prompt title for choosing one card to add to the player's hand.
battle-prompt-pick-card-for-hand = Pick a card for your hand
# Confirmation title for putting a selected Void card on top of the deck.
battle-prompt-confirm-put-void-on-top = Put a void card on top of your deck?
# Picker title for choosing the Void card used by the top-of-deck effect.
battle-prompt-choose-void-for-top = Choose a void card to put on top
# Confirmation title for abandoning a Character and drawing cards. $count is a
# positive integer; the production effect supplies 2.
battle-prompt-confirm-abandon-draw = Abandon a character to draw { $count }?
# Picker title for choosing the Character to abandon.
battle-prompt-choose-character-abandon = Choose a character to abandon
# Choice title between two battle effects.
battle-prompt-choose-one = Choose one
# Affirmative option in a battle confirmation prompt.
battle-prompt-confirm-yes = Yes
# Skip option in a battle confirmation prompt.
battle-prompt-confirm-skip = Skip
# Choice option that draws one card.
battle-prompt-draw-card = Draw a card
# Choice option that grants Energy. $amount is a positive integer; the
# production effect supplies 2.
battle-prompt-gain-energy = Gain { $amount }●
# Confirmation title for discarding the hand and drawing a replacement hand.
battle-prompt-discard-hand-redraw = Discard your hand and redraw?
# Confirmation title for playing a Character from the Void.
battle-prompt-play-character-from-void = Play a character from your void?
# Picker title for choosing the Character played from the Void.
battle-prompt-choose-character-to-play = Choose a character to play
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
