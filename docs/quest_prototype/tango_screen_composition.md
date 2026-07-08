# Tango Screen Composition

Tango quest screens render as a full-viewport stage. The screen owns the scene
art, its scaled interaction frame, loading and error states, and any transition
between screen-local views. Shared app chrome stays outside the pure Tango
screen and is wired through the adapter or router.

## Stage And Frame

Large quest screens use a 1920 by 1080 composition frame as their design space.
The root screen fills the viewport, measures the available browser rectangle,
and scales the frame to fit while preserving its aspect ratio. Positioning inside
the frame uses frame coordinates; layout outside the frame uses normal responsive
CSS for docks, overlays, and browser-safe edges.

The scaled frame is a presentation concern of `src/tango/screens/*`. View-model
builders produce plain screen data and do not know the viewport, frame scale, or
device class. Adapters only choose the data and callbacks to pass to the screen.

## Backdrop And Motes

Each screen decides its backdrop policy. A dreamscape screen renders the current
dreamscape's scene art and owns its atmospheric `Motes` layer. The atlas renders
its map surface. Site screens that migrate to Tango render their own full-bleed
site scene so the site and its HUD read as one surface.

Use one atmospheric layer per screen. A nested feature that needs particles
should route through the screen's existing `Motes` policy or become a documented
component variant.

## Status Bar Wiring

`QuestStatusBar` is a screen component, not a global HUD singleton. Each migrated
screen receives the status-bar view model from its adapter or screen builder and
places the bar where that screen's composition requires it. The deck-viewer
action is app-owned, so the router threads `onViewDeck` into Tango adapters and
site adapters through the registry handler object.

Journey explanation state is also app-owned. Site migrations that replace legacy
journey routes receive `runtimeConfig` and `onJourneyExplanationChange` through
`tangoSiteScreenFor`, matching the data available to the legacy route.

## Z-Index Bands

Keep screen layers in broad bands:

- Backdrop art and motes: base layer.
- Stage objects: map nodes, site nodes, cards, dreamsigns.
- Screen chrome: headers, filters, local panels, `QuestStatusBar`.
- Reveals and previews: `InfoCard.PressInfo`, `HoverPopover`, hover-zoom card
  copies, and other portaled read surfaces.
- App overlays: deck viewer, starting-deck popup, error boundary fallback.

When a reveal is portaled to `document.body`, it carries its own `.tango` token
scope and uses viewport-aware placement. Do not rely on a parent screen's
stacking context for portaled content.

## Reveal Surfaces

Use `InfoCard` for canonical game-object explanations: tide definitions,
Dreamcaller summaries, dreamsign details, card glossary terms, site previews,
and HUD press reveals. `InfoCard.PressInfo`, `InfoCard.PressPopover`, and
`usePressReveal` are the default interaction engine when the same reveal must
work on fine-pointer hover and touch press.

Use `HoverPopover` for fine-pointer-only helper previews whose trigger or
content is screen-owned: deck-hover zooms, dense row previews, and side-mounted
definition stacks. A `HoverPopover` body should still be a canonical Tango
surface, usually `InfoCard`, `GlossaryDefinitionCard`, or `DreamsignInfoCard`,
so placement can be screen-specific while visual language stays
shared.

## Loading And Error States

A Tango screen should render a complete state for each async boundary it owns:
loading, unavailable data, and recoverable error. The app-level error boundary
wraps the router, but a screen with local data loading should present a stable
surface that preserves the frame and primary controls while the data resolves.

## Transitions

Quest navigation transitions are owned by `ScreenRouter` and keyed by screen
identity. Screen-local transitions are owned inside the Tango screen. Moving
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
