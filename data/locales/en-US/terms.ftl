### Shared Dreamtides vocabulary and localization diagnostics


# English source strings for the Project Fluent localization proof of concept.


# These private terms are referenced by messages and cannot be requested by the
# application directly. Countable terms expose a locale-private grammatical
# number facet. Its default is one; messages select runtime counts and pass a
# literal CLDR category such as number: "other".
#
# Keep articles, possessives, adjectives, verbs, and numerals in complete
# messages. A locale may add its own term parameters for grammatical case or
# classifiers, and private attributes for traits such as gender or initial
# sound. See docs/journey_prototype/localization.md.

-dreamtides = Dreamtides
-dreamwell = Dreamwell
-dream-atlas = Dream Atlas
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
-essence = Essence
-energy = Energy
-spark = Spark
# Player-safe fallback for a malformed or unknown message descriptor. This is
# used when persisted or imported localization data cannot be trusted; it must
# not expose an internal message ID or the invalid value.
localization-invalid-message-fallback = This message could not be displayed.
