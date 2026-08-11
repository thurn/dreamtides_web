### Journey sites and their outcomes

# Compact headline in the radial announcement for an Exploration deck-wide
# Spark increase. $amount is a finite positive integer displayed with the Spark
# glyph; the sign and glyph stay part of this complete visible message.
exploration-deck-modification-spark = +{ $amount } ✦
# Compact headline in the radial announcement for an Exploration deck-wide
# Fast keyword grant. This visible message is paired with the bolt glyph.
exploration-deck-modification-fast = Fast
# Compact headline in the radial announcement for an Exploration deck-wide
# Energy-cost reduction. $amount is a finite non-negative integer displayed with
# the Energy glyph and a genuine minus sign.
exploration-deck-modification-energy-cost = −{ $amount } ●
# Compact headline for an Exploration deck subtype change. $subtype is an
# opaque authored subtype name and is shown exactly as supplied.
exploration-deck-modification-subtype = { $subtype }
# Compact fallback headline when an imported Exploration subtype result has no
# authored subtype value.
exploration-deck-modification-subtype-unavailable = Subtype
# Compact headline in the radial announcement for an Exploration Reclaim grant.
exploration-deck-modification-reclaim = Reclaim
# Compact radial headline after a paid Exploration effect applies one fixed
# Transfiguration form to every eligible deck card. $formName is the canonical
# source display name of that form; $essenceAmount is the positive integer
# Essence cost already paid, and the genuine minus sign communicates the loss.
exploration-deck-modification-transfiguration = { $formName } · −{ $essenceAmount } { -essence }
# Accessible label on a selected Augury card showing how many copies the offer
# grants. $count is a positive integer; the numeral is visible in the badge and
# is repeated here because this message is exposed only to assistive technology.
augury-card-choice-copy-count =
    { $count ->
        [one] { $count } copy
       *[other] { $count } copies
    }
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
# Title above one numbered Exploration card pack. $packNumber is a positive
# one-based display number.
exploration-pack-title = Pack { $packNumber }
# Visible command that chooses the Exploration pack shown above the button.
exploration-pack-choose-action = Choose
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
# Detail below a direct Exploration Essence reward. $essenceAfter is the
# non-negative shared Essence balance persisted after the reward resolves.
exploration-essence-current-total = { $essenceAfter } { -essence } total
# Compact outcome headline after Exploration queues a visit-wide free Card Shop.
exploration-free-next-shop-title = Next Shop Free
# Detail beneath the queued free-shop outcome headline. The benefit applies to
# successful item purchases during one future Card Shop visit.
exploration-free-next-shop-detail = Every item in your next Card Shop is free.
# Compact outcome headline after Exploration grants counted free purchases.
# $freePurchaseCount is the positive initial count persisted by the action.
exploration-free-purchases-title =
    { $freePurchaseCount ->
        [one] { $freePurchaseCount } Free Purchase
       *[other] { $freePurchaseCount } Free Purchases
    }
# Detail beneath the counted free-purchase outcome. The three values are the
# exact non-negative shared Essence balances and amount spent by the same atomic
# resolution; the arrows expose the persisted before/after transition directly.
exploration-free-purchases-detail = { $essenceBefore } → { $essenceAfter } { -essence } · { $essenceSpent } spent
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
exploration-delve-action = Delve
exploration-card-face-down = Exploration card, face down
exploration-card-returning-face-down = Exploration card returning face down
exploration-confirm-choice-action = Confirm Choice
# Visible heading above Dreamsigns prepared as player-selectable Exploration
# offers. Each item is a complete UUID-backed Dreamsign object.
exploration-dreamsign-offered-group-title = Offered Dreamsigns
# Visible heading above the current player's held Dreamsigns when one must be
# purged before an Exploration random gain resolves.
exploration-dreamsign-purge-group-title = Choose One to Purge
# Visible heading above held Dreamsigns that may leave the collection so an
# Exploration Dreamsign gain can remain within capacity.
exploration-dreamsign-replacement-group-title = Choose Replacements
# Headline shown with the persisted before/after result of an Exploration
# Dreamsign mutation, after any random identities are committed.
exploration-dreamsigns-changed-title = Dreamsigns Changed
# Headline shown while an Exploration compound outcome presents the exact
# persisted Nightmare cards together with its Dreamsign gain or replacement.
exploration-nightmare-dreamsign-bundle-title = Nightmares and Dreamsign Gained
# Headline shown with the exact persisted purge or replacement of starter deck
# entries after an Exploration action resolves.
exploration-starter-card-mutation-title = Starter Cards Changed
# Headline shown with the exact persisted base-to-form mappings after an
# Exploration action transfigures random or all starter deck entries.
exploration-starter-card-transfiguration-title = Starter Cards Transfigured
# Headline shown with exact persisted before-to-after mappings after one
# Exploration action transfigures multiple ordinary deck entries atomically.
exploration-card-transfiguration-title = Cards Transfigured
# Headline shown with exact persisted source-to-replacement mappings after one
# Exploration action atomically replaces multiple ordinary deck entries.
exploration-card-replacements-title = Cards Replaced
# Headline shown with exact persisted before-to-after mappings after one
# Exploration action changes the effective card type of multiple deck entries.
exploration-card-type-changes-title = Card Types Changed
# Headline for the persisted T75 outcome: one disclosed deck entry is purged
# and every eligible companion with its effective card type is transfigured.
exploration-compound-same-type-title = Kindred Forms Recast
# Headline for the persisted T77 outcome: matching deck entries become Fast and
# the authored number of Nightmare cards enters the deck.
exploration-compound-fast-nightmares-title = Swiftness at a Price
# Headline for the persisted T78 outcome: the player's selected offered cards
# enter in their authored Transfiguration form alongside Nightmare cards.
exploration-compound-take-transfigured-title = Chosen Forms Awakened
# Headline for the persisted T80 outcome: one prepared entry is purged, the
# other prepared entries transfigure, and exact copies enter the deck.
exploration-compound-purge-copy-title = Three Reflections Remain
# Section headings within a compound Exploration outcome review. Each section
# contains complete UUID-backed card objects or before/after pairs.
exploration-compound-purged-section = Purged
exploration-compound-transfigured-section = Transfigured
exploration-compound-fast-section = Made Fast
exploration-compound-nightmares-section = Nightmares Gained
exploration-compound-copies-section = Copies Gained
exploration-followup-choice-purge = Choose a card to purge
exploration-followup-choice-copy = Choose a card to copy
exploration-empty-card-state = No eligible cards are available.
exploration-site-eyebrow = Exploration
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
# Headline for the same completed Exploration reward.
exploration-site-offer-modifier-title = Transfigured Cards
# Compact detail naming where that reward takes effect.
exploration-site-offer-modifier-detail = Next Draft or Shop
# Visible reward announcement after an Exploration action adds one persisted
# site to the current Dreamscape.
exploration-site-insertion-title = Site Added
# Empty state in that picker when the current player owns no cards eligible for
# the wager.
gamble-card-picker-empty-state = No eligible cards remain.
# Complete visible Four-Suit Reprise reward row when the selected suit grants
# Essence. $essenceAmount is the positive integer Essence gained by the current
# player.
gamble-essence-outcome = Gain { $essenceAmount } { -essence }
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

## Gamble game presentation

gamble-gravok-title = Gravok's Three-Gate Wager
gamble-gravok-rules = Choose a gate, then draw. Higher gates are harder and pay more.
gamble-gravok-accessibility-description = Choose one of three gates and draw a card to resolve the wager.
gamble-gravok-six-gate = Six Gate
gamble-gravok-nine-gate = Nine Gate
gamble-gravok-jack-gate = Jack Gate
gamble-ladder-title = Tidemark Ladder Climb
gamble-ladder-rules = Draw against four successively easier targets. Each success gains essence.
gamble-ladder-accessibility-description = Draw a card on each rung of a four-step ladder.
gamble-starway-title = Starway Stairs
gamble-starway-rules = Climb for a larger prize, but a low draw loses the wager.
gamble-starway-accessibility-description = Choose whether to climb for a larger prize or take the current prize.
gamble-four-suit-title = Four-Suit Reprise
gamble-four-suit-rules = Choose a card to wager
gamble-four-suit-accessibility-description = Choose a card to wager, then draw one of four suit outcomes.
gamble-blackjack-title = Blackjack
gamble-blackjack-rules = Closest to 21 Without Going Over
gamble-blackjack-accessibility-description = Deal, hit, or stand against the dealer without going over 21.
gamble-bet-action = Bet
gamble-draw-action = Draw
gamble-climb-action = Climb
gamble-take-action = Take
gamble-choose-another-card-action = Choose Another Card
gamble-deal-action = Deal
gamble-hit-action = Hit
gamble-stand-action = Stand
gamble-gravok-won-outcome = Won!
gamble-ladder-won-outcome = Won
gamble-miss-outcome = Miss
gamble-safe-outcome = Safe!
gamble-bust-outcome = Bust!
gamble-prize-at-stake-outcome = Prize at stake
gamble-transfigure-outcome = Transfigure
gamble-gained-outcome = Gained
gamble-duplicated-outcome = Duplicated
gamble-purged-outcome = Purged
gamble-player-win-outcome = You Win!
gamble-dealer-win-outcome = Dealer Wins
gamble-push-outcome = Push
gamble-wager-returned-outcome = Wager Returned
gamble-wins-outcome = Wins
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
site-decline-offer = Decline Offer
site-walk-on = Walk On
site-choose-again = Choose Again
site-confirm = Confirm
augury-reroll-offers = Reroll Augury offers
augury-unavailable-guide-line = The visions are clouded. Walk on for now.
augury-error-clouded = The augury is clouded.
augury-error-choose-vision = Choose a vision first.
augury-error-visions-shifted = The visions shifted. Choose again.
augury-error-path-closed = That path is closed. Choose again.
card-shop-leave-action = Leave card shop
dreamsign-bazaar-leave-action = Leave Dreamsign Bazaar
# Persistent live status above a Card Shop shelf when its T56 visit-wide
# Exploration benefit is bound to this exact visit.
shop-free-next-shop-status = Exploration boon: every item in this shop is free.
# Persistent live status above a Shop or Dreamsign Bazaar shelf when T82 free
# purchases are queued. $remainingCount is the positive total across all FIFO
# counters.
shop-free-purchases-status =
    { $remainingCount ->
        [one] Exploration boon: { $remainingCount } free purchase remains.
       *[other] Exploration boon: { $remainingCount } free purchases remain.
    }
# Persistent live status above a Card Shop shelf when T56 and T82 overlap.
# $remainingCount is the positive total of successful T82 purchases remaining;
# those counters are consumed even while T56 also makes the visit free.
shop-overlapping-free-purchase-status =
    { $remainingCount ->
        [one] Exploration boons: every item in this shop is free, with { $remainingCount } free purchase remaining.
       *[other] Exploration boons: every item in this shop is free, with { $remainingCount } free purchases remaining.
    }
purge-site-decline-action = Decline
dreamsign-bazaar-replacement-full = Your collection is full at { $count } Dreamsigns.
dreamsign-bazaar-replacement-cancel = Cancel
# Exploration effect fallback that replaces the authored {deck_card} slot when
# the persisted offer has no resolvable target. $before and $after are opaque
# authored effect-text fragments; the complete sentence and inserted noun stay
# together here so the adapter never supplies English grammar.
exploration-effect-missing-deck-card = { $before }an eligible card{ $after }
# Exploration effect fallback that replaces the authored {starter_card} slot
# when its signed target is unavailable. $before and $after are opaque authored
# effect-text fragments; the complete sentence stays together in Fluent.
exploration-effect-missing-starter-card = { $before }a Starter card{ $after }
# Complete site disclosure appended after an authored Exploration effect.
# $siteType is an opaque configured site-type name.
exploration-offered-site-disclosure = { $siteType }.
# Generic player-safe Exploration outcome fallback when the resolved action is
# unavailable to the presentation model. It takes no variables.
exploration-effect-resolved-fallback = Exploration effect resolved
