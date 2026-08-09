### Cards, decks, collections, and rules presentation

tides-information-label = Tides:
# Deck filter, sort, and size labels.
deck-filter-all = All
deck-filter-characters = Characters
deck-filter-events = Events
deck-filter-all-subtypes = All Subtypes
deck-sort-name = Name
deck-sort-acquired = Acquired
deck-sort-cost = Cost
deck-sort-spark = Spark
deck-sort-subtype = Subtype
deck-size-small = S
deck-size-medium = M
deck-size-large = L
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
# Option that clears the card-pool subtype filter.
card-pool-all-subtypes-option = All subtypes
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
# Label on the card-name and rules-text search field in the pool browser.
card-pool-search-label = Search cards
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
# Title of the disclosure describing the active pool algorithm.
card-pool-construction-title = Pool construction
# Short diagnostic summary. $algorithm is a stable internal algorithm id and
# should remain unchanged.
card-pool-construction-summary = Algorithm: { $algorithm }
# Description of the active run-pool contents and remaining-copy quantities.
card-pool-construction-description = The active run pool is shown with its remaining copies.
# Tooltip explaining why a card's rules text differs from its base rules.
# $formName is the authored Transfiguration form name.
card-rules-transfiguration-changed = Rules text changed by { $formName } Transfiguration
# Accessible description and tooltip for a card's Transfiguration badge. $form
# $formName is the authored Transfiguration form name.
card-transfiguration-badge = { $formName } Transfiguration
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
# Shared card-gallery and battle-zone controls.
card-gallery-empty-default = No cards.
card-choice-purge-operation = This card will be purged
card-choice-copy-operation = This card will be copied
card-choice-transfigure-operation = This card will be transfigured
card-choice-change-operation = This card will be changed
deck-viewer-avatar-label = Avatar
deck-viewer-dreamsigns-label = Dreamsigns
deck-viewer-no-dreamsigns = None collected yet.
deck-viewer-tides-label = Tides
# Missing glossary copy shown in the player reveal card when a requested
# authored glossary entry cannot be resolved. This visible fallback contains no
# variables and must not expose the glossary id.
glossary-definition-unavailable-title = Rule definition unavailable
glossary-definition-unavailable-body = This rule's definition is temporarily unavailable.
