### Application shell, loading, menus, and errors

# Eyebrow in the bootstrap and cooperative state panel for the loading states.
application-eyebrow-dreamtides = Dreamtides
# Eyebrow for recoverable Journey state failures.
application-eyebrow-journey-status = Journey Status
# Eyebrow for Firebase or local runtime configuration failures.
application-eyebrow-configuration = Configuration
# Eyebrow for an incompatible reducer protocol.
application-eyebrow-game-version = Game Version
# Eyebrow for a content-settings comparison gate.
application-eyebrow-game-settings = Game Settings
# Eyebrow for a room whose persisted data cannot be decoded.
application-eyebrow-game-data = Game Data
# Eyebrow for a room connection failure.
application-eyebrow-game-connection = Game Connection
# Application loading title while a requested QA scene is prepared.
application-opening-qa-scene-title = Opening QA Scene
# Application loading message while a requested QA scene is prepared.
application-opening-qa-scene-message = Preparing this journey state.
# Application loading title while a saved Journey is fetched.
application-loading-saved-journey-title = Loading Saved Journey
# Application loading message for a saved Journey. $journeyName is the requested
# saved-run name, or the player-safe fallback “saved journey”.
application-loading-saved-journey-message = Loading { $journeyName }.
# Recoverable error title when a saved Journey cannot be opened.
application-loading-saved-journey-error-title = Could Not Load Saved Journey
# Recoverable error explanation when a saved Journey cannot be opened.
application-loading-saved-journey-error-message = The saved journey could not be opened.
# Loading title while Journey content is fetched.
application-loading-journey-content-title = Loading Journey Content
# Loading message while Journey content is fetched.
application-loading-journey-content-message = Gathering the dream’s cards and paths.
# Recoverable error title when Journey content fails to load.
application-content-load-error-title = Journey Content Failed to Load
# Recoverable error explanation when Journey content fails to load.
application-content-load-error-message = The journey content could not be prepared.
# Primary retry action for a recoverable content-loading error.
application-retry-action = Retry
# Secondary action that copies technical details for support or debugging.
application-copy-details-action = Copy Details
# Configuration-error title when Firebase cannot be initialized.
application-firebase-setup-title = Firebase Setup Issue
# Configuration instructions for the local emulator mode.
application-firebase-setup-emulator-message = Run npm start to launch the Firebase Realtime Database emulator with Vite.
# Configuration instructions for a deployed Firebase mode.
application-firebase-setup-production-message = Required env: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_DATABASE_URL, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID.
# Recoverable error title for an unprepared battle preview.
application-battle-preview-error-title = Unable to Prepare Battle
# Recoverable error explanation for an unprepared battle preview.
application-battle-preview-error-message = The battle preview could not be prepared from this game state.
# Error-boundary fallback heading for an unexpected render failure.
error-boundary-title = Something went wrong
# Error-boundary fallback explanation. The technical error detail remains in a
# separate diagnostic region when a boundary chooses to expose it.
error-boundary-message = This part of the screen hit an unexpected error. The rest of the app is still working. Try again, or close this and return to where you were.
# Error-boundary retry action.
error-boundary-retry-action = Retry
# Error-boundary close action.
error-boundary-close-action = Close
# Product title at the front door.
main-menu-title = Dreamtides
# Main-menu action labels, kept separate because each command has a distinct
# navigation consequence.
main-menu-new-journey-action = New Journey
main-menu-dream-codex-action = Dream Codex
main-menu-settings-action = Settings
main-menu-about-action = About
main-menu-quit-action = Quit
main-menu-github-action = GitHub
main-menu-discord-action = Discord
main-menu-reddit-action = Reddit
# Card-anatomy loading title and labels.
loading-card-types-title = Dreamtides Cards:
loading-card-anatomy-label = Card anatomy
loading-card-character-label = Character
loading-card-event-label = Event
loading-begin-action = Begin
loading-progress-label = Loading
# Shared command-menu chrome and validation copy.
command-menu-close-actions = Close actions
command-menu-back-action = Back
command-menu-empty-state = No actions available.
command-menu-invalid-integer = Enter a non-zero whole number.
transient-status-dismiss-action = Dismiss status
