# Entity Reveal Interactions

## Status and scope

This document defines the expected final interaction model for revealing
additional information about entities in Cumulus. It governs `GameCard`,
`InfoCard`, their trigger behavior, their supporting-card layout, and every
entity or control fragment that reveals either component.

The same system covers cards, Avatars, Dreamsigns, tides, sites, Atlas
nodes, glossary terms, resource marks, stat orbs, and similar game concepts.
The entity being described determines whether the primary reveal is a
`GameCard` or an `InfoCard`; the trigger may be a full entity, a compact tile,
an icon, or inline text.

Cumulus has one reveal mechanism. Every informational hover, focus, or press reveal is expressed as the reveal group defined here.

## Vocabulary

- **Source entity**: the visible element the player hovers, focuses, or presses.
- **Reveal group**: one primary card and zero or more secondary cards presented
  as one transient, pointer-transparent layer.
- **Primary card**: the placement-driving `GameCard` or `InfoCard` that directly
  describes the source entity.
- **Secondary cards**: priority-ordered `InfoCard` values that add context to the
  primary. “Secondary” is a placement role, not a media restriction. Any
  `InfoCard` variant is valid, including text, icon, object, tide, full-bleed,
  and other strict system variants.
- **Popup GameCard**: a separate full-card reading copy shown for a source card.
- **Press in place**: the narrow mobile exception in which an already-legible
  source GameCard compresses in place and only its secondaries are revealed.

Keyword definitions conventionally use a text `InfoCard` with one title and a
rules-text body. They are text-only because that content calls for text, not
because secondary cards are limited to one visual treatment. Inline semantic
marks such as energy, spark, and essence glyphs are valid inside secondary body
copy.

## System invariants

1. A reveal group has exactly one primary card.
2. Secondary cards occupy one vertical column beside the primary.
3. The primary and secondary column are top-aligned.
4. The primary and secondary cards never overlap each other.
5. A reveal group is entirely pointer-transparent. Its cards cannot be clicked,
   focused, selected, scrolled, or used as a bridge that keeps the reveal open.
6. Only one reveal group is active in a visual viewport. A newly active hover,
   focus, or qualifying press replaces the existing group immediately.
7. The reveal group renders in the highest application layer, above screens,
   HUD, dialogs, menus, debug chrome, and other overlays.
8. Reveal placement uses visual-viewport coordinates and physical safe-area
   insets. Internal screen stages and layout containers do not constrain it.
9. Reveals may cover ordinary interface chrome. They remain within the visual
   viewport except for a documented impossible-placement best effort.
10. Cards appear and disappear in one frame. There is no reveal opacity, scale,
    or travel animation. The desktop GameCard return animation is the single
    reveal-motion exception.

The gap between a reveal group and its source is 14px. On desktop, the
horizontal gap between the primary and secondary column is 10px, as is the
vertical gap between secondary cards. On mobile, two 45vw columns share the
remaining safe width evenly between the left edge, the columns, and the right
edge. This gives the primary and secondary cards equal outer gutters and one
consistent internal gap instead of placing either card directly against a
screen edge.

## Library architecture: make correct behavior automatic

The interaction policy in this document is library behavior, not call-site
knowledge. A screen should not need to understand pointer modality, hold timing,
viewport measurement, card width, protected-circle geometry, primary/secondary
orientation, secondary truncation, focus restoration, accessibility, portal
layers, or logging in order to show an entity.

This is a hard API boundary. Repeating the rules in examples, helper comments,
or screen tests is not sufficient: a call site that can assemble a reveal
incorrectly eventually will. The public component surface must make the complete
behavior the easiest path and make divergent behavior inexpressible.

### One owner for the state machine and overlay

Cumulus should have one reveal coordinator mounted once at the application root.
It owns:

- the single active reveal group;
- active-pointer classification and the 30ms/300ms gesture state machine;
- source measurement and source press/hover feedback;
- visual-viewport and safe-area measurement;
- primary and secondary measurement;
- mobile and desktop candidate generation and placement selection;
- secondary-prefix fitting;
- press-in-place eligibility;
- the one top-layer portal and all reveal rendering;
- hover/focus precedence, `Escape` suppression, and focus restoration;
- lifecycle dismissal and drag/scroll cancellation;
- accessible-description generation; and
- open, placement, activation, and dismissal logging.

Cumulus's root installs the coordinator. Individual Cumulus components register
intent with it internally. Screens do not mount or configure the coordinator,
and components do not each own a popover, portal, timer, media query, or
placement effect. One overlay host also guarantees global exclusivity and layer
order without z-index negotiations among screens.

### Internal reveal data carries meaning, not mechanics

Inside Cumulus, components register structured reveal data with the coordinator.
The conceptual internal shape is small:

```ts
type RevealCard =
  | { kind: "gameCard"; cardId: CardId }
  | { kind: "infoCard"; card: InfoCardModel };

interface RevealSpec {
  primary: RevealCard;
  secondaries: readonly InfoCardModel[]; // descending priority
}
```

This is an internal protocol between Cumulus components and the coordinator, not
a public prop type for screens to construct. The exact names may change, but
these properties are essential:

- `GameCard` references resolve by UUID.
- `InfoCardModel` is a discriminated union of strict InfoCard variants.
- Secondary order is the only placement-relevant information an entity
  component registers.
- Content is data rather than arbitrary JSX, so the coordinator can measure,
  render, describe, truncate, and log every card uniformly.
- A reveal specification contains no pixels, sides, delays, portal targets,
  pointer modes, or breakpoint choices.

The public API remains ordinary Cumulus component props: a semantic entity model,
strict component variants where needed, and an activation callback. It is
uncontrolled from the caller's perspective. Screens do not receive or set
`shown`, `pressed`, `hovered`, `side`, `anchor`, or `placement`, and they do not
imperatively open a reveal. The coordinator derives transient state from real
input and focus events.

### Every reveal source is a Cumulus component

A consumer rendering an entity does not construct a reveal specification. The
named Cumulus component already has the semantic data needed to describe itself:

- `GameCard` derives its full-card primary, glossary secondaries, desktop reading
  state, mobile popup, and automatic press-in-place eligibility.
- `AtlasNode` owns its face, source element, primary Atlas card, related
  Dreamsign/site/affiliation secondaries, activation, and reveal registration.
- Dreamsign, Avatar, tide, site, resource, and stat components derive their
  standard `InfoCard` models from their semantic model.
- A named glossary-term or rules-text Cumulus component derives definition cards
  from its glossary terms and owns the stationary inline trigger behavior.
- Battle cards adapt their battle instance to the canonical UUID-based GameCard
  model, then use the same reveal path as every other GameCard.

When an entity needs additional domain context, add that context to its strict
semantic component model. For example, an `AtlasNodeModel` can carry its related
Dreamsign, site, and affiliation data; `AtlasNode` decides which InfoCard
variants they become and their priority. Screens do not pass a generic
`secondaryCards` array or prebuild those InfoCards.

The normal GameCard call site should therefore look like “render this UUID and
activate this callback,” not “disable the card's definitions, wrap it in a
mobile peek handler, build another GameCard portal, and place definitions beside
that copy.” Likewise, a tide consumer supplies tide data; it does not build a
flex row of InfoCards and hand it to a generic popover.

### New source shapes require named Cumulus components

There is no public `EntityRevealTrigger`. If a prose term, compact card row,
bespoke Atlas mark, or other source shape needs a reveal, it becomes a named
Cumulus component with a strict semantic API. Examples might include
`GlossaryTerm`, `CompactGameCard`, or an Atlas-specific component; the name and
model should describe the thing the player is interacting with.

This follows the same rule as every other Cumulus need: use an existing component,
add a strict semantic variant, or create a component. A generic reveal wrapper
would let screens create anonymous interactive surfaces and would recreate the
call-site ownership problem under a better engine.

### Internal hooks are implementation details

Cumulus components use a private coordinator adapter to attach the shared
controller to their root element. That adapter belongs under a Cumulus-internal
import boundary. Product screens and screen adapters render named semantic
components; attachment hooks, geometry, portals, and the internal content
protocol stay inside the Cumulus component layer.

This distinction matters: a public headless hook hands every consumer the pieces
required to fork the behavior. A private hook can support component composition
while keeping policy centralized.

### Mechanical decisions absent from call sites

| Concern | Screen supplies to the Cumulus component | Cumulus component + reveal coordinator own |
| --- | --- | --- |
| Content | Entity model | Primary/secondary derivation, priority, rendering, accessible text |
| Activation | `onActivate` and unavailable state | Tap/hold discrimination and click suppression |
| Input | Nothing | Mouse, pen, touch, focus, and hybrid-device behavior |
| Timing | Nothing | 30ms intent filter, 300ms hold boundary, exit motion |
| Sizing | Nothing | 45vw mobile cards, 240px desktop GameCards, source-size feedback |
| Placement | Nothing | Viewport measurement, circle clearance, orientation, fallbacks |
| Overflow | Nothing | Priority order, measured leading-prefix fit, and omission |
| Layering | Nothing | The single root portal and highest application layer |
| Accessibility | Semantic labels in entity data | Description association, focus lifecycle, `Escape` behavior |
| Diagnostics | Entity UUID/type | Geometry, decision, truncation, activation, dismissal logs |

The following public inputs are design smells and should not exist:

- `stageRef`, portal targets, or caller-provided anchor rectangles;
- `gap`, `side`, `placement`, `align`, or viewport-edge padding;
- reveal delays, hold windows, movement slop, or touch-circle sizes;
- `enableHoverZoom`, `enableTermPopover`, or parent-owned definition modes;
- `holdStillClicks` or other per-call tap/hold semantics;
- arbitrary scale factors, press handlers, or hover handlers;
- a generic reveal specification or generic `secondaryCards` prop;
- arbitrary `ReactNode` reveal content; and
- controlled `open`/`shown` state for ordinary entity reveals.

When a real new behavior appears, add a strict semantic source or content
variant to the library. Do not expose the underlying mechanical knob.

### Derived decisions use rendered facts

The coordinator decides from facts it can measure or infer itself:

- viewport layout comes from the visual viewport and the shared 900px boundary;
- input modality comes from the initiating pointer or focus event;
- size-aware feedback comes from the source's rendered rectangle;
- press in place comes from the rendered GameCard width and visible-rules state;
- popup and secondary sizes come from rendered card models;
- available secondaries come from measured height after placement; and
- placement comes from the source rectangle or captured touch point.

A caller should never precompute these decisions from assumptions about its own
layout. Measuring centrally is what keeps the behavior correct inside scaled
stages, dialogs, grids, HUDs, and future screen compositions.

### Enforcement and testing

Centralization should be enforced by the repository, not maintained by memory:

- Export named Cumulus entity components. Keep reveal models, coordinator hooks,
  geometry, and overlay rendering internal.
- Add lint/import-boundary rules that reject internal reveal imports, direct
  reveal portals and generic reveal wrappers in product UI.
- Add API-contract tests proving mechanical props and arbitrary reveal nodes are
  not expressible.
- Unit-test the coordinator state machine and pure geometry over viewport,
  pointer, source-size, primary-size, and secondary-count sweeps.
- Test Cumulus entity components by asserting the semantic reveal they register,
  not by reproducing placement math in every screen test.
- Maintain a small set of end-to-end conformance scenarios for hover, focus,
  touch tap, touch hold, scroll cancellation, drag cancellation, top-edge
  fallback, best-effort overlap, secondary truncation, and reduced motion.
- Make diagnostic logs part of those conformance assertions.

A screen-specific reveal implementation is a component fork. It must be moved
into the shared coordinator or expressed as a strict semantic variant before the
screen is considered converged.

## Secondary priority and constrained height

The resolved reveal specification carries secondary cards in descending
importance. The layout engine preserves that order and shows the longest leading
prefix that fits as complete cards between the group top and the bottom
safe-area boundary.

- A secondary is either fully shown or omitted.
- Secondary cards are never clipped, shrunk, internally scrolled, or moved into
  another row.
- There is no visual “and more” card or omission indicator.
- If the first secondary does not fit, the reveal shows only the primary.
- Visually omitted secondaries remain part of the source entity's accessible
  description.

A primary `InfoCard` must fit the smallest supported portrait viewport at its
authored copy length. Overlong primary copy is a content defect and should be
shortened. The reveal system does not solve it by clipping, scrolling, shrinking
type, or changing card width.

## Layout classification and input modality

Layout is viewport-based:

- Below Cumulus's 900px breakpoint, the mobile sizing and placement rules apply.
- At or above 900px, the desktop sizing and placement rules apply.
- Mobile gameplay is portrait-only.

Input behavior follows the initiating input, including on hybrid devices:

- A mouse or hover-capable pen uses hover behavior.
- Touch uses press behavior even when the same device also has a trackpad.
- Keyboard focus uses the desktop-style focus interaction appropriate to the
  current viewport layout.

An interaction engine must use the active pointer rather than a device-wide
fine-pointer assumption. Viewport classification and pointer classification are
separate decisions.

## Mobile press gesture

### Timing and activation

Pointer-down immediately applies source press feedback. The reveal waits 30ms
as a scroll-intent filter. If the pointer remains within the gesture slop and no
scroll starts, the complete primary and secondary group appears in one frame.

The touch point captured at pointer-down remains the placement anchor for the
whole gesture. The reveal does not follow small finger jitter.

A 300ms boundary separates activation from inspection:

- Release before 300ms is a tap and invokes the source action, when one exists.
- Release at or after 300ms is a hold; it dismisses the reveal without invoking
  the source action.
- The boundary is inclusive: a release at exactly 300ms is a hold.
- A source without an action simply reveals until release.

Movement beyond 10px, native scrolling, drag recognition, pointer cancellation,
pointer leave, viewport resize, or orientation change dismisses the reveal and
cancels activation for that pointer sequence. The interaction never captures
the pointer in a way that blocks native vertical scrolling.

### Protected touch area

Placement protects a 48px-diameter circle centered on the actual pointer-down
coordinate. A popup also seeks the standard 14px gap above the complete source
rectangle. The farther-up of those two clearances controls its vertical
position, so a large source such as a site node remains visibly separated from
the reveal.

The primary popup seeks a placement outside this circle. Secondary cards may
cross the circle when necessary. Press-in-place GameCards are the explicit
exception: their source primary remains under the finger because no primary
popup is created.

Placement never moves a popup below the touch. It seeks the closest valid
position by moving upward first and using horizontal displacement when the top
safe-area edge prevents sufficient upward movement. A popup may sit at the
absolute safe-area top.

If the viewport and touch position make all hard constraints mathematically
incompatible, placement uses the top-left or top-right corner that maximizes
distance from the touch and minimizes primary/circle intersection. This is a
last-resort best effort: the card remains 45vw, remains on-screen, and never
moves below the touch. Text clearance is weighted more heavily than media
clearance.

### Mobile card size

Every popup card in a mobile reveal is exactly 45% of the visual viewport width:

- primary `GameCard`: `45vw`;
- primary `InfoCard`: `45vw`;
- every secondary `InfoCard`: `45vw`.

There are no content, variant, native-width, or desktop-reading-width caps in
the mobile layout. The two-column composition therefore reserves the remaining
10% of the viewport for its internal gap and edge accommodation.

### Mobile InfoCard placement

A lone primary `InfoCard` first moves directly upward from the touch. It remains
horizontally near the touch when the complete card clears the protected circle
and fits the viewport. If the top edge prevents upward clearance, the card pins
to the top and moves toward the side opposite the touch.

An `InfoCard` with secondaries uses the two-column algorithm:

1. Prefer primary on the left and the secondary column on the right. Distribute
   the horizontal remainder equally across the two outer gutters and the gap
   between columns.
2. Move the whole top-aligned pair upward until the primary clears both the
   protected circle and the source rectangle's 14px gap.
3. If the top edge prevents clearance, pin the pair to the top and choose the
   orientation that puts the primary opposite the touch. A top-left touch yields
   `[secondaries][primary]`; a top-right touch yields
   `[primary][secondaries]`.
4. At the horizontal center, retain the preferred primary-left order unless a
   best-effort corner placement produces less primary overlap.

### Mobile GameCard placement

Every popup `GameCard` uses the same notional two-column algorithm whether or
not it has secondaries. Secondary presence must not change the primary's
position.

1. Reserve a left primary column and a right secondary column, even when the
   secondary column is empty.
2. Prefer the 45vw primary in the left column and move it upward until it clears
   both the protected circle and the source rectangle's 14px gap. The two
   notional columns use the same evenly distributed horizontal gutters as an
   InfoCard pair.
3. If the top edge prevents clearance, pin to the top and put the primary in the
   column opposite the touch.
4. Use the same best-effort corner rule when no fully clear placement exists.

A popup `GameCard` always renders its complete card, including rules text. A
source using `hideRulesText` therefore requires a popup and cannot qualify for
press in place.

### Automatic press in place

A mobile source `GameCard` qualifies for press in place when both are true:

- its rendered width is at least 90% of the 45vw popup width (`40.5vw`); and
- it visibly renders its complete rules text.

The qualifying card remains in its authored layout and uses the standard
size-aware press compression. It does not enlarge and does not create a primary
copy. Its secondary column is top-aligned to the source, placed on the right
when it fits and on the left otherwise. Lower-priority secondaries are dropped
under the standard height rule. Draft cards are the representative use case.

## Desktop hover and focus

### InfoCard groups

Hover and keyboard-originated focus reveal immediately. Pointer-originated DOM
focus is activation bookkeeping, not a second reveal reason; it neither opens a
reveal after touch release nor keeps a reveal alive after mouse hover ends. The
preferred desktop placement is above the source, with the primary on the left
and secondaries on the right. The complete group is horizontally centered over
the source and sits 14px above its top edge. The group may shift horizontally
to remain within the visual viewport while preserving that placement.

When the group cannot fit above, it moves beside the source:

- A right-side fallback uses `[primary][secondaries]`.
- A left-side fallback uses `[secondaries][primary]`.
- The primary remains the card nearest the source.
- A side with enough room wins; right wins a tie.

All cards remain top-aligned. The group never flips below the source.

### GameCard reading state

Every desktop `GameCard` with a rendered width below 240px immediately resolves
to a 240px-wide reading copy on hover or eligible focus. Initial card size does
not determine a scale factor; all small cards converge on the same physical
reading width. A card already at least 240px wide remains at its current size.

Desktop layouts should preserve a rendered width of at least 240px whenever a
surface presents only two or three cards and the available stage can accommodate
them. `CardPickerPanel` selects this low-count choice geometry from the number of
cards. Dense `CardBrowserPanel` collections, multi-row galleries, battle zones,
and constrained viewports may render smaller cards because fitting the whole
collection or game state takes priority; those cards use the shared 240px
reading copy.

The reading copy preserves the source card's center and translates only enough
to stay inside the visual viewport. Secondary cards prefer the right side of
the final reading card, then the left, and remain top-aligned. They do not move
the primary merely to preserve their preferred side.

Hover entry is instantaneous. Hover exit keeps the reading copy alive while it
returns to the exact source rectangle over the standard fast motion duration
(approximately 160ms), then unmounts it. The source and reading copy must not
produce a visible duplicate during either state. Under reduced motion, entry
and exit are both instantaneous.

Pointer-down keeps the reading copy active and applies size-aware press
compression relative to the 240px reading state, floored at the source card's
original rendered size. Pointer-up restores the reading state while hover
continues. Moving outside the source entity ends hover; the pointer-transparent
reading copy does not extend the source hit area.

Battle cards in play use this same GameCard reading system. Drag recognition
dismisses the reveal and suppresses it for the remainder of the drag.

## Source feedback

### Size-aware pointer feedback

Press and hover feedback target a consistent physical edge movement rather than
one scale factor for objects of every size. Measure the source's rendered box at
gesture start and hold the computed value stable through that interaction.

For press, target 3px of inward movement on each edge using the longest rendered
dimension:

`pressScale = clamp(1 - 6px / max(width, height), 0.90, 0.98)`

Representative results are 0.90 for a 44px control, 0.94 for a 100px entity,
approximately 0.973 for a 220px card, and 0.98 for a 340px card.

For pointer hover on ordinary entities, target 2px of outward movement on each
edge:

`hoverScale = clamp(1 + 4px / max(width, height), 1.01, 1.03)`

Press wins while press and hover are both active. Disabled or unavailable
entities with useful explanatory information retain feedback and reveal
behavior while suppressing activation. Pure decoration is inert.

Inline readable text is the sole feedback exception. A glossary term or rules
copy trigger stays stationary under hover and press so the sentence does not
shift and the held text remains legible.

### Ambient motion

Ambient drift pauses on the source entity while its reveal is active. Hover and
press feedback continue to apply. The captured reveal anchor therefore stays
visually attached to the source. Ambient motion resumes on dismissal.

## Keyboard and accessibility

Keyboard-originated focus reveals the same primary and secondary information
and uses the same placement rules as pointer hover. A pointer press that focuses
an element does not qualify as keyboard focus. Non-GameCard sources keep their
standard visible focus ring without hover enlargement. Focused GameCards use
the 240px reading state because that state is the information surface itself.

Below 900px, keyboard focus uses 45vw cards but has no protected touch circle.
Placement anchors to the focused entity's rectangle, preferring the top-aligned
`[primary][secondaries]` pair above it. If that pair cannot fit above, it pins to
the safe-area top and chooses the orientation that keeps the primary
horizontally closest to the focused entity.

`Escape` dismisses a focused reveal without moving focus and suppresses it for
the remainder of that focus visit. Moving focus away and back makes it eligible
again.

When pointer hover temporarily replaces a focused entity's reveal, ending that
hover restores the focused reveal if focus remains and `Escape` has not
suppressed it.

Unavailable entities remain focusable when their reveal communicates useful
state, such as the requirement for a locked site. Activation remains disabled.
Decorative entities do not gain a tab stop solely to participate in the reveal
system.

The source entity references a noninteractive accessible description containing
the primary and complete ordered secondary text. Visually dropped secondaries
remain in that description. Hover alone does not use a live region or force
repeated announcements. Decorative media is represented by concise labels,
without redundant image narration.

## Lifecycle and competing gestures

- Scroll, resize, orientation change, window blur, source unmount, and route
  change dismiss the reveal immediately.
- A reveal is recomputed from a fresh anchor on the next interaction rather than
  tracking a changing viewport.
- Movement within the mobile gesture slop does not move the reveal.
- Drag recognition wins over reading, activation, and press feedback state.
- A new reveal replaces the current group; multi-touch cannot create multiple
  groups. The first active touch owns the reveal until it ends or is cancelled.
- On desktop, pointer-down does not dismiss an existing hover reveal.
- Reveal cards never intercept the release or synthesized click belonging to
  their source.

## Diagnostics

Every revealed interaction emits enough structured logging to reconstruct its
placement in a production game. At minimum, log:

- the source entity UUID and entity type;
- primary component and variant;
- ordered secondary component variants and the number visually shown/dropped;
- viewport layout class, dimensions, and safe-area insets;
- input modality and interaction reason (`hover`, `focus`, `press`);
- source rectangle and, for touch, the captured touch coordinate;
- selected placement family, side/orientation, and final card rectangles;
- whether press in place, side fallback, secondary truncation, or best-effort
  primary overlap occurred;
- measured circle clearance or overlap for a touch popup;
- dismissal reason and whether activation fired or was suppressed.

High-frequency pointer movement is not logged. One open decision and one close
decision per reveal group are sufficient.


The public vocabulary is `CumulusRoot`, visual `InfoCard` variants, `GameCard`, `AtlasNode`, and named semantic entity components. Screens supply UUID-backed domain meaning and activation callbacks; the component layer derives complete ordered reveal content.
