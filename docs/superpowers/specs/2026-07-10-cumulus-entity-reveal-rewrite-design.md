# Cumulus Entity Reveal Rewrite

## Context

The complete behavioral contract for this work is [Entity Reveal
Interactions](../../cumulus/entity-reveal-interactions.md). That document defines
the reveal vocabulary, interaction rules, placement behavior, accessibility,
diagnostics, and convergence requirements for Cumulus entities.

The Cumulus library implements reveal policy through one root coordinator, and
named semantic components are the public way to participate in it.

The scope includes every consumer of Cumulus entity components: player-facing
quest screens, battle, Atlas, HUD, draft, deck and shop surfaces, component
documentation, mockups, debug tools, and transitional screens that directly
render Cumulus entities. Unrelated legacy UI remains outside this project.

## Architecture and ownership

Each mounted Cumulus application root installs one `RevealCoordinator`. The
production application, component documentation, mockups, tests, and standalone
debug applications install it through their Cumulus root shell. Tests reject
nested or duplicate coordinators within a root. This preserves one active reveal
per visible Cumulus application without coupling independent React roots through a
process-global singleton.

The coordinator exclusively owns:

- the active reveal and input state machine;
- pointer-modality classification and gesture timing;
- hover, focus, press, drag, and activation arbitration;
- source, card, visual-viewport, and safe-area measurement;
- mobile and desktop placement selection;
- priority-prefix fitting for secondary cards;
- the highest application portal and reveal rendering;
- source feedback and ambient-motion suspension;
- focus restoration, accessible descriptions, and lifecycle dismissal; and
- structured open and close diagnostics.

The implementation separates that ownership into focused internal units:

- Semantic reveal models carry a strict GameCard reference or discriminated
  InfoCard data, ordered secondaries, source identity, accessible content, and
  activation intent.
- The coordinator state machine processes registration and input events without
  embedding placement calculations.
- A pure geometry engine generates and scores placement candidates from measured
  facts.
- A single overlay renderer measures and renders the selected reveal group.
- A private source adapter lets named Cumulus components register semantic intent
  and attach coordinator-owned input behavior to their roots.

Temporary compatibility adapters may translate existing InfoCard press APIs,
MobileCardPeek, and GameCard reveal paths into the coordinator while consumers
move. These adapters stay internal, accept no new consumers, and are deleted as
part of final convergence.

## Component APIs and data flow

Screens render named semantic Cumulus components and supply domain data,
availability, and activation callbacks. Reveal content, placement, timing,
pointer handlers, portal targets, and controlled reveal state belong to the
library.

Named components derive their internal registration from their semantic model:

- `GameCard` resolves the canonical card through UUID, derives its reading copy
  and glossary secondaries, and accepts battle instances through a UUID-based
  adapter.
- `AtlasNode` owns the source face, activation, Atlas primary, and ordered
  Dreamsign, site, and affiliation secondaries.
- Dream Avatar, Dreamsign, tide, site, ability, resource, stat, and similar
  components derive strict InfoCard variants internally.
- An inline rules term uses a named stationary component such as `GlossaryTerm`.
- A compact or bespoke source shape becomes a named semantic component or strict
  variant rather than receiving a generic reveal prop.

The runtime flow is:

1. A named entity derives semantic reveal data and registers through the private
   adapter.
2. The initiating event identifies its modality and supplies measured source
   facts.
3. The coordinator resolves content, gesture state, viewport state, and
   placement.
4. The overlay measures and renders one pointer-transparent reveal group.
5. The coordinator associates a complete noninteractive accessible description
   with the source, including visually omitted secondaries.
6. Activation or dismissal completes the interaction and emits one structured
   close record.

Invalid or missing semantic data fails visibly during development and in tests.
In production, the source remains usable when possible, its reveal is
suppressed, and a structured diagnostic records the defect. Mathematically
incompatible placement uses the specified best-effort result.

## Interaction state machine

The coordinator uses explicit states for idle, pending touch intent, active
press reveal, active hover or focus reveal, desktop GameCard return motion, and
gesture suppression following cancellation or Escape.

- Mouse and hover-capable pen reveal immediately. Touch reveals after the 30ms
  scroll-intent filter.
- Touch release before 300ms activates. Release at or after 300ms inspects and
  dismisses without activation.
- Movement beyond 10px, native scrolling, drag recognition, pointer
  cancellation or leave, viewport resize, orientation change, window blur,
  route change, and source removal cancel as specified.
- Hover temporarily takes precedence over focus, and eligible focus resumes
  when hover ends.
- Press takes precedence over hover feedback while preserving a desktop
  GameCard reading copy.
- The first active touch owns the interaction.
- Ambient source motion pauses while its reveal is active.
- Reduced motion makes desktop GameCard entry and exit immediate.

## Geometry and rendering

Placement is a pure calculation over immutable measured facts. When an
interaction opens, the coordinator captures a geometry snapshot containing the
visual viewport, physical safe-area insets, source rectangle, initiating touch
coordinate when applicable, and measured reveal cards. Resize and orientation
changes dismiss the reveal; a later interaction captures a new snapshot. This
makes placement reproducible in tests and production diagnostics.

Candidate generation and selection cover:

- exact 45vw mobile cards below the 900px breakpoint;
- the shared 48px protected touch circle;
- mobile InfoCard and notional two-column GameCard placement;
- automatic GameCard press-in-place eligibility;
- desktop above-first InfoCard placement and side fallback;
- desktop GameCard convergence on a 340px reading copy;
- complete-card priority-prefix fitting for secondaries;
- safe-area containment and documented impossible-placement scoring; and
- the desktop GameCard return-to-source transition.

The overlay uses one highest-layer portal, remains entirely pointer-transparent,
and shows or hides in one frame except for the specified GameCard return motion.
Source feedback uses measured dimensions captured at gesture start. Inline text
uses the stationary feedback variant.

## Diagnostics and failure handling

One structured open record and one close record make every reveal decision
reconstructable. Together they record source UUID and type, primary and ordered
secondaries, visible and omitted counts, layout class, viewport and safe areas,
modality and reason, source and touch geometry, selected placement and card
rectangles, special fallback flags, circle clearance or overlap, dismissal
reason, and activation outcome.

The geometry snapshot used for placement is the geometry written to the log.
High-frequency movement is excluded. Development failures identify malformed
semantic registrations or duplicate hosts directly; production failures favor a
usable source plus a diagnostic over a broken screen.

## Verification and enforcement

Pure geometry tests sweep viewport classes, safe areas, source and touch
positions, primary sizes, secondary counts, fallbacks, and impossible cases.
State-machine tests use deterministic time and event sequences for input
precedence, intent filtering, the tap/hold boundary, cancellation, focus
restoration, drag, Escape suppression, and reduced motion.

Named entity tests assert their semantic registration rather than duplicating
placement logic. Fixtures use stable UUIDs and fixed component models so tests
do not depend on mutable production TOML values or design defaults. Overlay
tests cover measurement, one-frame visibility, pointer transparency, layer
order, accessible descriptions, and secondary omission.

API and repository checks reject public coordinator internals, mechanical
reveal props, generic reveal wrappers, direct reveal portals, HoverPopover, and
screen-owned reveal content.

Browser QA uses a representative conformance matrix:

- desktop hover and keyboard focus;
- mobile tap, hold, scroll cancellation, and drag cancellation;
- InfoCard and GameCard primaries with and without secondaries;
- press-in-place and popup GameCards;
- Atlas, battle, HUD or inline text, and unavailable-entity representatives;
- above placement, side fallback, top-edge orientation, secondary truncation,
  and best-effort overlap;
- reduced motion and a physical safe-area simulation; and
- one focused spot-check for every migrated entity type.

QA follows normal player workflows where practical, asserts the location and
viewport before captures, checks activation as well as visuals, and inspects the
browser error, rejection, and console-error buffers.

## Implementation boundaries

The implementation plan will use six major tasks. Every task leaves the
worktree buildable and tested.

1. **Establish the internal coordinator foundation.** Add semantic reveal
   models, the private registration adapter, one host per Cumulus root, the
   interaction state machine, pointer classification, focus precedence,
   lifecycle cancellation, activation arbitration, accessible-description
   plumbing, structured logging, and temporary internal compatibility adapters.
2. **Build the shared geometry and overlay system.** Implement mobile and
   desktop placement, safe-area snapshots, card measurement, secondary-prefix
   fitting, protected-circle and best-effort scoring, one top-layer renderer,
   measured source feedback, desktop GameCard return motion, and reduced-motion
   behavior.
3. **Converge the GameCard ecosystem.** Make UUID-backed GameCard own desktop
   reading, mobile popup and press-in-place decisions, glossary secondaries,
   activation, drag arbitration, and ambient-motion pausing. Migrate draft,
   deck, shop, battle, docs, mockups, debug, and transitional Cumulus consumers.
4. **Converge named InfoCard entities.** Move Dream Avatar, Dreamsign, tide,
   site, ability, resource, stat, HUD, and inline glossary interactions onto
   strict semantic components and migrate all of their Cumulus consumers.
5. **Absorb Atlas into the entity system.** Fold the reveal role into
   `AtlasNode`, strengthen its semantic model, derive ordered related cards
   internally, and migrate Atlas adapters, screens, documentation, and tests.
6. **Prove final conformance.** Delete compatibility surfaces and superseded
   engines, add API and repository enforcement, run the core checks and
   representative browser matrix, inspect diagnostics, and update Cumulus
   documentation and generated metadata for the final public vocabulary.

Tasks three through five depend on the shared contract from tasks one and two.
They remain sequential because they touch common exports, metadata, and
migration adapters.

## Alternatives considered

A vertical-slice approach would rewrite one entity family at a time and extract
shared infrastructure from the first working slice. It offers earlier visible
progress, but the first entity's needs would bias the coordinator and force
later API and geometry revisions.

An atomic replacement would introduce the coordinator and migrate every
consumer together. It minimizes temporary code but creates a broad review
surface and makes interaction regressions difficult to localize.

The foundation-first staged rewrite establishes the shared policy once, keeps
intermediate commits testable through internal compatibility adapters, and
gives each migration family a stable target.
