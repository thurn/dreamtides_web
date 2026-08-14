# Cumulus Screen Composition

Cumulus journey screens render as a full-viewport stage. The screen owns the scene
art, its scaled interaction frame, loading and error states, and any transition
between screen-local views. Shared app chrome stays outside the pure Cumulus
screen and is wired through the adapter or router.

## Stage And Frame

Large journey screens use a 1920 by 1080 composition frame as their design space.
The root screen fills the viewport, measures the available browser rectangle,
and scales the frame to fit while preserving its aspect ratio. Positioning inside
the frame uses frame coordinates; layout outside the frame uses normal responsive
CSS for docks, overlays, and browser-safe edges.

The scaled frame is a presentation concern of `src/cumulus/screens/*`. View-model
builders produce plain screen data and do not know the viewport, frame scale, or
device class. Adapters only choose the data and callbacks to pass to the screen.

## Content-Sized Panels

`GlassPanel` hugs its header, body, and footer. This is an invariant, not a
default that callers may override. Screen wrappers constrain width, place the
panel within the stage, and provide viewport-safe maximums; they do not assign
decorative height to the panel or its slots. Prompts, menus, summaries,
confirmation surfaces, and choice sets remain compact and leave the scene
visible around them.

Unassigned interior whitespace is not allowed. Do not use fixed height,
minimum height, flex growth, grid stretch, `space-between`, or spacer elements
to separate a panel's content. When content can exceed the viewport, give the
body a viewport-safe `max-height` and scroll that body. Definite-height
developer rails and full-bleed galleries use their named frame contracts; an
ordinary floating panel never becomes a composition stage.

During browser QA, measure the panel against its header, content, and footer.
Any gap beyond authored padding or grid spacing is a layout finding.

## Backdrop And Motes

Each screen decides its backdrop policy. A dreamscape screen renders the current
dreamscape's scene art and owns its atmospheric `Motes` layer. The Atlas screen
and its map components share the `--atlas-*` semantic material for the journey
field, connectors, node halos, and badges. Site screens render their own
full-bleed site scene so the site and its journey chrome read as one surface.

Use one atmospheric layer per screen. A nested feature that needs particles
should route through the screen's existing `Motes` policy or become a documented
component variant.

## Routed Site Family

Character-led routed sites compose through `SiteLayout`. The layout owns the
full-viewport scene, one Motes atmosphere, safe-area and HUD clearance, guide
portrait, optional speech, and one content region. A site selects one named
composition recipe; the recipe defines desktop, intermediate, and narrow
behavior together. The content region chooses its own material, and floating
glass panels remain content-sized.

The routed family includes Augury, Card Shop, Dreamsign Bazaar, Dreamsign
Revelation, Duplication, Exploration, Gamble, Purge, Random Site, and
Transfiguration. Dreamsign Revelation uses the same stage with glass-free offer
content.

Four compositions have dedicated ownership:

- Draft uses its card-drafting stage.
- Battle uses the battle board and battle-status stages.
- Essence outcomes remain inline within their owning screen.
- Reward outcomes remain inline within their owning screen.

Router-owned `CumulusJourneyChrome` remains a sibling of the site layout.

## Persistent Journey Chrome

`CumulusJourneyChrome` is the app-owned wrapper around Cumulus product
screens. It derives the `JourneyStatusBar` model directly from live journey state,
docks the bar at the bottom of active-run screens, and mounts the desktop gear
or mobile menu with the app-owned overlay actions. Registration through
`screenFor` or `siteDispositionFor` applies this wrapper;
pure screens and their view-model builders contain scene-specific data only.

Terminal journey-result screens keep the utility menu and omit the status bar.
Their centered summaries carry the final run or battle readout, and their
bottom actions start the next journey.

The journey-start choice is the explicit exception because a run has no selected
Dream Avatar or persistent journey inventory yet. The battle route applies the
same wrapper to its Cumulus opponent preview and leaves the playable battle shell
in its battle-specific chrome.

## Z-Index Bands

Keep screen layers in broad bands:

- Backdrop art and motes: base layer.
- Stage objects: map nodes, site nodes, cards, dreamsigns.
- Screen chrome: headers, filters, and local panels.
- Persistent journey chrome: router-owned `CumulusJourneyChrome`.
- Entity reveals: the single root coordinator portal used by named semantic
  Cumulus components.
- App overlays: deck viewer, starting-deck popup, error boundary fallback.

`CumulusRoot` mounts one coordinator portal at `document.body`. It carries its
own `.cumulus` token scope and uses visual-viewport and physical-safe-area
placement. Parent screen stacking contexts do not participate in reveal layout.

## Reveal Surfaces

The live Cumulus reference documents this cross-component contract on the
`/cumulus#/systems/entity-reveals` UI-system page. Component references link to
that page when their behavior participates in the coordinator.

Screens render named semantic sources such as `GameCard`, `AtlasNode`,
`Dreamsign`, `DreamAvatarPortrait`, `TideDisc`, `EssenceValue`, `SiteNode`, and
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
`ApplicationStateScreen` supplies the Cumulus presentation for bootstrap and
coop gates, including fatal configuration states; controllers retain Firebase,
room-log, and URL effects.

## App Overlays And Diagnostics

The app shell owns overlay visibility and error isolation. `PoolViewerScreen`
is the shared Cumulus overlay presentation for the journey utility menu and the
battle floating controller. Retained diagnostics are Cumulus screens supplied
by state adapters; standalone operator tools remain under their named route
owners. Direct overlay QA uses `?goto=deckviewer`, `?goto=poolviewer`, and
`?goto=startingdeck`; battle overlays begin at `?goto=battle-playable`.

### Battle overlay ownership

The playable battle remains an event-sourced outer controller. Modules under
`src/battle/components/` resolve live battle data, validate targets, subscribe
to diagnostic sources, construct commands, and append player intent. Stable
overlay presentation lives under
`src/cumulus/screens/battle-overlays/` and receives plain view data plus
callbacks.

Local interaction state such as a note draft, a reordered card sequence, or an
expanded log disclosure may live in the pure overlay. Anything that affects the
shared battle result is represented by the callback's UUID-keyed payload and is
committed by the outer controller as one room event. The card-note, figment,
deck-order, battle-log, and Dreamwell-history workflows follow this boundary.

## Transitions

Journey navigation transitions are owned by `ScreenRouter` and keyed by screen
identity. Screen-local transitions are owned inside the Cumulus screen. Moving
objects should use object travel or container transforms so meaningful objects
retain continuity between states. Review chrome can fade or hold still.

## Browser QA Targets

Use `?goto=` scenes for direct screen entry and run QA on a non-default dev port.
Choose viewports that exercise the responsive branches or device-specific risks
changed by the work. Routine visual evidence is at most one representative
desktop, one representative mobile, and one changed interaction state when each
is relevant. Add viewports only when they cover a distinct risk. For each run,
assert `location.href` and `window.innerWidth`, inspect `window.__caps`, measure
DOM geometry for clipping and overlap claims, and verify controls through normal
player actions.

When adding a screen or site, add a `?goto=<scene>` entry in
`src/runtime/qa-scenes.ts` and document it in `docs/journey_prototype/qa_scenes.md`
so the screen can be opened directly for browser QA.
