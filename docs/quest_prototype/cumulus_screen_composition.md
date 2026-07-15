# Cumulus Screen Composition

Cumulus quest screens render as a full-viewport stage. The screen owns the scene
art, its scaled interaction frame, loading and error states, and any transition
between screen-local views. Shared app chrome stays outside the pure Cumulus
screen and is wired through the adapter or router.

## Stage And Frame

Large quest screens use a 1920 by 1080 composition frame as their design space.
The root screen fills the viewport, measures the available browser rectangle,
and scales the frame to fit while preserving its aspect ratio. Positioning inside
the frame uses frame coordinates; layout outside the frame uses normal responsive
CSS for docks, overlays, and browser-safe edges.

The scaled frame is a presentation concern of `src/cumulus/screens/*`. View-model
builders produce plain screen data and do not know the viewport, frame scale, or
device class. Adapters only choose the data and callbacks to pass to the screen.

## Backdrop And Motes

Each screen decides its backdrop policy. A dreamscape screen renders the current
dreamscape's scene art and owns its atmospheric `Motes` layer. The atlas renders
its map surface. Site screens that migrate to Cumulus render their own full-bleed
site scene so the site and its HUD read as one surface.

Use one atmospheric layer per screen. A nested feature that needs particles
should route through the screen's existing `Motes` policy or become a documented
component variant.

## Persistent Quest Chrome

`CumulusQuestChrome` is the app-owned wrapper around registered Cumulus product
screens. It derives the `QuestStatusBar` model directly from live quest state,
docks the bar at the bottom of active-run screens, and mounts the desktop gear
or mobile menu with the app-owned overlay actions. Registration through
`cumulusScreenFor` or `cumulusSiteScreenFor` applies this wrapper automatically;
pure screens and their view-model builders contain scene-specific data only.

Terminal quest-result screens keep the utility menu and omit the status bar.
Their centered summaries carry the final run or battle readout, and their
bottom actions start the next quest.

The quest-start choice is the explicit exception because a run has no selected
Dreamcaller or persistent quest inventory yet. The battle route applies the
same wrapper to its Cumulus opponent preview and leaves the playable battle shell
in its battle-specific chrome.

## Z-Index Bands

Keep screen layers in broad bands:

- Backdrop art and motes: base layer.
- Stage objects: map nodes, site nodes, cards, dreamsigns.
- Screen chrome: headers, filters, and local panels.
- Persistent quest chrome: router-owned `CumulusQuestChrome`.
- Entity reveals: the single root coordinator portal used by named semantic
  Cumulus components.
- App overlays: deck viewer, starting-deck popup, error boundary fallback.

`CumulusRoot` mounts one coordinator portal at `document.body`. It carries its
own `.cumulus` token scope and uses visual-viewport and physical-safe-area
placement. Parent screen stacking contexts do not participate in reveal layout.

## Reveal Surfaces

Screens render named semantic sources such as `GameCard`, `AtlasNode`,
`Dreamsign`, `DreamcallerPortrait`, `TideDisc`, `ResourceChip`, `SiteNode`, and
`GlossaryTerm`. Each component derives one strict primary plus ordered
`InfoCard` secondaries from UUID-backed domain data. `InfoCard` itself is a
visual content component with strict variants.

`CumulusRoot` owns hover, focus, touch intent, activation, one-active-group
competition, measurement, safe-area placement, truncation, portal rendering,
accessibility descriptions, and diagnostics. Screens do not construct reveal
specifications, anchors, portals, delays, placement sides, or controlled
open/shown state. Passive decorative help is static; game entities use their
named semantic component.

## Loading And Error States

A Cumulus screen should render a complete state for each async boundary it owns:
loading, unavailable data, and recoverable error. The app-level error boundary
wraps the router, but a screen with local data loading should present a stable
surface that preserves the frame and primary controls while the data resolves.

## Transitions

Quest navigation transitions are owned by `ScreenRouter` and keyed by screen
identity. Screen-local transitions are owned inside the Cumulus screen. Moving
objects should use object travel or container transforms so meaningful objects
retain continuity between states. Review chrome can fade or hold still.

## Browser QA Targets

Use `?goto=` scenes for direct screen entry and run QA on a non-default dev port.
The standard desktop target is 1920 by 1080. Mobile QA should include a narrow
phone viewport and a tall modern phone viewport. For each run, assert
`location.href` and `window.innerWidth` before screenshots, inspect the browser
error buffer, and verify controls through normal player actions.

When adding a migrated screen or site, add a `?goto=<scene>` entry in
`src/runtime/qa-scenes.ts` and document it in `docs/quest_prototype/qa_scenes.md`
so the screen can be opened directly for browser QA.
