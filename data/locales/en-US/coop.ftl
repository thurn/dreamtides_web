### Cooperative and multiplayer rooms

# Loading title while the shared game service is connected.
application-connecting-game-service-title = Connecting to Game Service
# Loading message while the shared game service is connected.
application-connecting-game-service-message = Preparing your shared game.
# Loading title while a client joins an existing room.
coop-joining-game-title = Joining Game
# Loading message while an existing room is prepared. $roomId is an opaque room
# identifier shown as a value, not interpreted by the translator.
coop-joining-game-message = Preparing { $roomId }.
# Busy status while a client joins an existing room.
coop-joining-game-busy = Joining Game
# Room-creation title and message.
coop-creating-game-title = Creating Game
coop-creating-game-message = We are preparing a shared dream.
coop-creating-game-busy = Creating Game
# Loading message while a room record is fetched. $roomId is an opaque room ID.
coop-loading-game-message = Loading { $roomId }.
# Unreachable-room title and explanation. $roomId is an opaque room ID.
coop-game-not-found-title = Game Not Found
coop-game-not-found-message = Could not load { $roomId }. The game may not exist, or the database is unreachable.
# Action that creates a fresh room after a connection failure.
coop-create-new-game-action = Create New Game
# Generic room-setup failure title and explanation.
coop-room-setup-error-title = Something Went Wrong
coop-room-setup-error-message = The game could not finish its room setup.
# Action that retries room creation or setup.
coop-try-again-action = Try Again
# Version-gate title and explanation.
coop-version-gate-title = A New Version Was Deployed
coop-version-gate-message = This game was started on an earlier build. Start a fresh game on the current version.
# Unreadable-room title and explanation.
coop-unreadable-room-title = This Game Could Not Be Read
coop-unreadable-room-message = This game’s data cannot be loaded safely. Start a fresh game to keep playing.
# Action used while creating a replacement room.
coop-starting-new-game-action = Starting…
# Transient status when a partner wins the compare-and-swap race.
coop-bounce-partner-conflict = Action not applied: your partner changed the game first.
# Transient status for a domain-invalid action.
coop-bounce-invalid-action = Action not applied: it is not valid for the current game state.
# Transient status when an intent could not be appended.
coop-bounce-append-failed = Action failed to send — try again.
# Transient status after a reconnect drops unconfirmed intents.
coop-bounce-pending-dropped = Connection recovered — unconfirmed actions were discarded.
# Transient status while another choice must be resolved first.
coop-bounce-prompt-pending = Action not applied: finish the current choice first.
# Transient status for an unknown compare-and-swap conflict.
coop-bounce-unknown-conflict = Action not applied: the game changed before it was received. Try again.
# Transient status when a read-only playtest rejects an action.
coop-bounce-observer-read-only = Action not applied: this playtest is controlled from another browser.
# Transient status for an internal fold or malformed-event failure.
coop-bounce-internal-error = Action not applied because of an internal error. Please try again.
# Presence status while the room connection is unresolved.
coop-presence-connecting = Connecting…
coop-create-game-error = Failed to create game.
coop-presence-write-error = Failed to write presence.
# Presence status after the room connection resolves. $count is the finite
# number of connected clients and can be zero.
coop-presence-connected-count =
    { $count ->
        [one] 1 Connected
       *[other] { $count } Connected
    }
# Content-settings gate title and explanation.
coop-content-settings-title = This Game Uses Different Settings
coop-content-settings-message = Both players use the same content settings to play together.
coop-use-game-settings-action = Use This Game’s Settings
coop-unadoptable-settings-detail = This game needs settings this build cannot adopt.
coop-player-disconnected-title = Player Disconnected
coop-playtest-paused-message = The playtest is paused. Take control when you are ready to continue.
coop-take-control-action = Take Control
# Comparison-table heading for the room's expected configuration.
application-comparison-this-game = This Game
# Comparison-table heading for this client's local configuration.
application-comparison-yours = Yours
# Config comparison row labels.
coop-config-pool-label = Pool
coop-config-draft-label = Draft
coop-config-pack-size-label = Pack Size
coop-config-atlas-rules-label = Atlas Rules
coop-config-site-rules-label = Site Rules
coop-config-draft-rules-label = Draft Rules
coop-config-economy-rules-label = Economy Rules
coop-config-gamble-rules-label = Gamble Rules
coop-config-transfiguration-rules-label = Transfiguration Rules
coop-config-opponent-rules-label = Opponent Rules
coop-config-tutorial-rules-label = Tutorial Rules
coop-config-unavailable = Unavailable
coop-config-default = Default
