# Entity Reveal Interactions

## Status and scope

This document defines the expected final interaction model for revealing
additional information about entities in Tango. It governs `GameCard`,
`InfoCard`, their trigger behavior, their supporting-card layout, and every
entity or control fragment that reveals either component.

The same system covers cards, Dreamcallers, Dreamsigns, tides, sites, Atlas
nodes, glossary terms, resource marks, stat orbs, and similar game concepts.
The entity being described determines whether the primary reveal is a
`GameCard` or an `InfoCard`; the trigger may be a full entity, a compact tile,
an icon, or inline text.

Tango has one reveal mechanism. `HoverPopover` is outside the final component
vocabulary. Every informational hover, focus, or press reveal is expressed as
the reveal group defined here.

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

The gap between a reveal group and its source is 14px on desktop. The horizontal
gap between the primary and secondary column is 10px, as is the vertical gap
between secondary cards. Mobile touch-circle clearance replaces the 14px source
gap; the 48px protected circle already includes the desired comfort margin.

## Secondary priority and constrained height

Callers provide secondary cards in descending importance. The layout engine
preserves that order and shows the longest leading prefix that fits as complete
cards between the group top and the bottom safe-area boundary.

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

- Below Tango's 900px breakpoint, the mobile sizing and placement rules apply.
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
coordinate. The 48px circle is the complete clearance allowance; there is no
additional gap around it.

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

1. Prefer primary on the left and the secondary column on the right.
2. Move the whole top-aligned pair upward until the primary clears the protected
   circle.
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
   the protected circle.
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

Hover and eligible keyboard focus reveal immediately. The preferred desktop
placement is above the source, with the primary on the left and secondaries on
the right. The complete group is horizontally centered over the source and
sits 14px above its top edge. The group may shift horizontally to remain within
the visual viewport while preserving that placement.

When the group cannot fit above, it moves beside the source:

- A right-side fallback uses `[primary][secondaries]`.
- A left-side fallback uses `[secondaries][primary]`.
- The primary remains the card nearest the source.
- A side with enough room wins; right wins a tie.

All cards remain top-aligned. The group never flips below the source.

### GameCard reading state

Every desktop `GameCard` with a rendered width below 340px immediately resolves
to a 340px-wide reading copy on hover or eligible focus. Initial card size does
not determine a scale factor; all small cards converge on the same physical
reading width. A card already at least 340px wide remains at its current size.

The reading copy preserves the source card's center and translates only enough
to stay inside the visual viewport. Secondary cards prefer the right side of
the final reading card, then the left, and remain top-aligned. They do not move
the primary merely to preserve their preferred side.

Hover entry is instantaneous. Hover exit keeps the reading copy alive while it
returns to the exact source rectangle over the standard fast motion duration
(approximately 160ms), then removes it. The source and reading copy must not
produce a visible duplicate during either state. Under reduced motion, entry
and exit are both instantaneous.

Pointer-down keeps the reading copy active and applies size-aware press
compression relative to the 340px reading state, floored at the source card's
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

For press, target 3px of inward movement on each edge using the shorter rendered
dimension:

`pressScale = clamp(1 - 6px / min(width, height), 0.90, 0.98)`

Representative results are 0.90 for a 44px control, 0.94 for a 100px entity,
approximately 0.973 for a 220px card, and approximately 0.982 for a 340px card.

For pointer hover on ordinary entities, target 2px of outward movement on each
edge:

`hoverScale = clamp(1 + 4px / min(width, height), 1.01, 1.03)`

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

Keyboard focus reveals the same primary and secondary information and uses the
same placement rules as pointer hover. Non-GameCard sources keep their standard
visible focus ring without hover enlargement. Focused GameCards use the 340px
reading state because that state is the information surface itself.

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

## Convergence requirements from the current implementation

The existing components already establish useful pieces of this contract:
InfoCard has viewport-aware measured placement, immediate coarse-pointer reveal,
a 300ms hold discriminator, pointer-transparent portals, and above-first
placement; GameCard has a 340px reading target and top-aligned glossary cards;
mobile card peek has scroll cancellation and independently tested circle/box
geometry; Pressable centralizes transform feedback.

The target state requires the following convergence work:

- Replace the fixed 18px-radius InfoCard touch obstacle and the 36px-radius
  mobile-card-peek obstacle with the shared 48px-diameter circle.
- Apply the 30ms intent filter to all mobile reveals while retaining the 300ms
  activation boundary.
- Make every mobile popup card exactly 45vw below the 900px breakpoint.
- Replace stage-relative placement with visual-viewport placement and safe-area
  bounds.
- Introduce one reveal-group coordinator for global exclusivity, focus
  restoration, active-pointer modality, top-layer rendering, and lifecycle
  dismissal.
- Centralize primary/secondary layout, priority truncation, two-column mobile
  orientation, best-effort corner placement, and desktop side fallback.
- Replace GameCard's maximum 1.5x hover scaling with convergence on a fixed
  340px desktop width.
- Keep the desktop GameCard reading copy alive on pointer-down and implement its
  return-to-source exit transition.
- Replace fixed `Pressable` factors with measured size-aware hover and press
  feedback while preserving the stationary inline-text variant.
- Make press in place an automatic rendered-width decision and require a popup
  for `hideRulesText` cards.
- Fit secondaries as a priority prefix rather than overflowing, scrolling, or
  placing definitions below the primary.
- Route Atlas, Dreamsign, tide, ability, HUD, deck, Draft, and battle reveal
  compositions through the shared reveal-group layout without restricting the
  `InfoCard` variants allowed in the secondary column.
- Provide immediate focus reveals, `Escape` suppression, accessible
  descriptions, and useful focus behavior for unavailable entities.
- Pause source ambient motion while a reveal is active.
- Replace every `HoverPopover` consumer with the shared InfoCard/GameCard reveal
  system, then remove `HoverPopover` and its independent placement engine.
- Expand placement logging to record the diagnostics specified above.

The result is one predictable language: hover or focus reveals immediately on
desktop, touch reveals after a 30ms intent filter on mobile, every popup card is
45vw on mobile, GameCards converge on a 340px desktop reading state, and all
supporting information forms one top-aligned, non-overlapping column beside its
primary.
