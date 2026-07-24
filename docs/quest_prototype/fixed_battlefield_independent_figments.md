# Fixed Battlefield and Independent Figments

## Summary

Dreamtides battles use a fixed staggered battlefield for each player:
10 back-rank positions and 9 front-rank positions. Every figment is an
independent character that occupies one position and carries its own state.

The fixed back rank introduces a capacity boundary for materialization and
control changes. The Making Room procedure lets the affected player use any
repositioning already permitted by the current phase, select any number of
characters they control for banishment, and confirm that choice before the
pending effect continues. Characters that still cannot materialize are
banished; figments cease to exist. A control change fails when Making Room
does not produce a back-rank opening.

This document specifies the complete target behavior for the quest prototype
and identifies the implementation ownership boundaries. The battle rules remain
the authority for game semantics.

## Related Information

- [Dreamtides Battle Rules](../battle_rules/battle_rules.md) is the
  authoritative game-rules reference. Its Play Area, Making Room, Exhaust and
  Awaken, Support, Gain Control, and Figments sections define the target
  behavior.
- [Quest Prototype](quest_prototype.md) describes the folded event-log
  architecture, battle runtime, and current presentation boundaries.
- [Firebase Multiplayer](firebase_multiplayer.md) explains room persistence,
  event ordering, optimistic intents, and replay.
- [Battle AI](battle_ai.md) describes the AI forward model and planner. Its
  figment-stack and unbounded-rank assumptions require compatibility updates.
  Strategic AI choices during Making Room require a separate behavior design.
- [QA Tooling](qa_tooling.md) defines the browser workflow, viewport
  assertions, error capture, screenshot budget, and teardown requirements.
- [QA Scenes](qa_scenes.md) documents direct battle entry points used for
  interactive validation.
- [Cumulus Design System](cumulus_design_system.md) defines the presentation
  and component boundaries for the battle screen.

## Problem and Context

The battle model currently represents ranks as unbounded sparse records. A
derived selector grows and contracts the visible play area around occupied
positions. Materializing a character can always produce another back-rank
position.

Figments currently use one card instance to represent multiple same-type
members. Member spark values live in an array on that instance. Targeting,
status, challenge resolution, scoring, movement, display, and AI evaluation
contain stack-specific behavior.

The target design gives every player a stable spatial field and makes every
figment a regular battlefield character. This improves the direct relationship
between a visible character, a targetable game object, and a battlefield
position. It also creates meaningful capacity pressure when the 10-position
back rank fills.

Capacity pressure is resolved as shared game state. Making Room can pause an
effect, permit a constrained set of player intents, banish selected characters,
resolve resulting triggers, and resume the original effect deterministically.
The entire process must survive room replay, reload, optimistic reconciliation,
and concurrent clients.

## Goals

- Give each player exactly 10 back-rank and 9 front-rank positions for the
  entire battle.
- Represent every figment as one independent character instance in one
  battlefield position.
- Apply ordinary targeting, status, spark, Support, and challenge rules to
  each figment.
- Define deterministic overflow behavior for single and batch
  materialization.
- Let players correct a missed legal reposition before committing Making Room.
- Preserve ordinary banishment and leave-play interactions for characters
  selected during Making Room.
- Preserve source-zone order when a batch cannot fully enter.
- Make the Making Room decision authoritative, replayable, and observable.
- Provide deterministic All Forward and All Back controls without changing
  the underlying repositioning rules.
- Keep Gain Control well-defined when the receiving back rank is full.
- Maintain UUID-backed character identity throughout state, commands, prompts,
  logs, and presentation, with catalog identity for figments.
- Give implementers focused entry points and acceptance criteria for the
  complete runtime change.

## Battlefield Invariants

Each side owns the same fixed position set:

- Back rank: `B0` through `B9`.
- Front rank: `F0` through `F8`.

All positions exist from battle initialization through battle completion.
Empty positions are represented explicitly in folded battle state and restored
after serialization. Presentation does not derive the number of positions from
occupancy.

The challenge lanes are `F0` through `F8`. A challenger and defender oppose one
another when they occupy the same front-rank index on opposite sides.

Support uses the fixed stagger:

- `B0` supports `F0`.
- `B1` through `B8` support the adjacent front positions.
- `B9` supports `F8`.
- Every `Fi` is supported by `Bi` and `B(i+1)`.

A battlefield position contains at most one character instance. All ordinary
characters, created character tokens, and figments consume one position.

Any command or folded state that addresses a position outside the fixed set is
invalid. State normalization must not create positions beyond these bounds.

## Independent Figments

Each materialized figment receives its own battle-card identity and character
state. Two figments of the same type occupy two positions and remain
independently targetable.

An effect that is preparing to create a figment first records a pending
figment descriptor. The descriptor contains its stable figment catalog
identity, effect-run identity, and ordinal within that effect. This descriptor
is sufficient to display and log a pending figment but is not an in-play
battle-card instance. The reducer allocates the permanent battle-card identity
deterministically only when the figment successfully enters play. A figment
that cannot enter therefore never acquires an in-play identity; its descriptor
and correlation identity still identify the failed entry in logs.

An ordinary generated character token receives a permanent battle-card
identity when its creation descriptor is added to the ordered batch, before
capacity is resolved. That identity is derived replay-stably from the effect-run
identity and creation ordinal. It is retained whether the token enters play or
is created directly into its owner's Banished zone after a failed entry.
Copied-card identity and authored card UUID remain separate from this unique
battle-card identity.

Every figment has:

- One controller and owner.
- One battlefield location.
- One printed or catalog-derived spark value.
- Its own gained spark and static spark contribution.
- Its own exhaustion, counters, markers, notes, and granted statuses.
- Its own inherent catalog keyword.
- Its own creation provenance and logging identity.

Figments use ordinary character behavior:

- Each figment counts once as a character.
- Each figment counts once toward its subtype.
- Warrior and Legion figments each count once toward allied Warrior totals.
- A Legion figment independently derives its spark from the current number of
  allied Warriors.
- Anthems and other static bonuses apply once to each qualifying figment.
- Targeted gains and statuses apply only to the targeted figment.
- Support can be granted by or applied to a figment under the same conditions
  as any other character.
- Each figment challenges, defends, and scores as one character.
- Dissolving or abandoning a figment fires that figment's dissolved triggers.

A figment can exist only in play. A figment that leaves play or fails to enter
during Making Room ceases to exist. It does not enter the deck, hand, void, or
Banished zone.

The figment catalog continues to provide stable authored type identity, base
spark, name, rules text, art, crop, and inherent keyword data. Runtime
instances refer to catalog identity rather than using a character name as a
key.

## Materialization

A character materializes into the leftmost open back-rank position. It enters
exhausted unless it is awakened.

Playing a character or activating a materialization effect is legal without a
guaranteed open position. Costs are paid under the ordinary timing rules before
capacity is resolved. A failed entry does not refund energy, discard costs,
abandon costs, exhaust costs, or other paid costs.

When a single character can enter, materialization proceeds directly.

Before checking capacity, the effect snapshots the batch membership and total
order. An explicit order in the effect wins. Otherwise, members from a source
zone use that zone's stored top-to-bottom order, source clauses are considered
in the order written by the effect, and generated members use creation order.
Player click or selection order never determines batch order.

The snapshot records an ordinary incoming card by source UUID, expected source
zone, and source position. It records a generated character by creation
descriptor. If an ordinary incoming card is not in the expected source and
eligible when its turn arrives, that member fails without being moved from its
new location. The engine logs the revalidation failure and continues with the
next snapshotted member.

When the back rank lacks enough openings, the effect parks before any member of
that batch enters and opens Making Room for the receiving player.

Whether or not Making Room was needed, the batch processes one member at a time
in its snapshotted order. If a back-rank position is open, that member enters
the leftmost opening and all immediate materialization triggers resolve before
capacity is checked for the next member. If no position is open, an ordinary
member moves to its owner's Banished zone and a figment ceases to exist.
Immediate triggers caused by that failed entry resolve before capacity is
checked for the next member.

The snapshotted batch receives one Making Room prompt. If triggers consume the
openings before a later member is processed, that member follows the failed
entry behavior without reopening the original prompt. A distinct
materialization caused by a trigger is a new batch and can open its own Making
Room prompt.

A failed entrant:

- Has not materialized.
- Does not receive an in-play location.
- Does not become exhausted.
- Does not fire `▸Materialized`.
- Does not satisfy "when you materialize" conditions.
- Retains any preceding "played" event when it was played from hand.
- Performs its actual source-zone departure.

An ordinary character that fails while returning from the void therefore
leaves the void and enters the Banished zone. Effects that observe a card
leaving the void can see that movement.

## Making Room

Making Room is a persisted battle prompt attached to a suspended effect run.
It identifies:

- The receiving side.
- The pending materialization batch or control change.
- The immutable incoming descriptors and established batch order.
- The fixed candidate set of controlled battlefield characters.
- Whether normal repositioning is currently permitted for that side.
- The effect cursor needed to resume resolution.

The affected player may select any number of characters they control in either
rank. Selection order carries no game meaning.

Selected characters remain on the battlefield while the prompt is open and are
shown with a red selection outline. The player may change the selection before
confirmation.

The player must explicitly confirm, including when selecting zero characters.
Confirmation banishes all selected characters simultaneously as one
room-making action.

The candidate identities are snapshotted for presentation, then revalidated
against current folded state on confirmation. If any submitted identity is
missing, duplicated, or not controlled by the receiving side, the whole
confirmation is rejected. The prompt remains open, and clients refresh the
selectable view and clear their tentative selection before the player tries
again. The authoritative candidate snapshot does not change: the refreshed
view is its intersection with characters that remain eligible in current
folded state. No replacement event or prompt identity is created. A stale
confirmation never partially banishes its still-valid members.

These are ordinary banishments. They count as the selected characters leaving
play and can satisfy or trigger authored effects that observe banishment or
leaving play. The resulting battlefield is the state observed by those
triggers.

Triggered effects resolve under ordinary immediate-trigger rules before the
suspended materialization or control change resumes. A triggered
materialization can consume newly opened capacity and can itself park another
Making Room prompt.

While Making Room is open, normal battle commands are gated. The affected
player can:

- Change which controlled characters are selected for banishment.
- Reposition when the current phase and side already grant repositioning.
- Use All Forward or All Back when ordinary repositioning is permitted.
- Confirm the room-making choice.

The affected player cannot:

- Play cards.
- Activate abilities.
- Change phase.
- Submit unrelated debug edits.
- Reposition when normal phase ownership does not permit it.

Repositioning permission follows the ordinary turn matrix:

- The active side can reposition during Day.
- The opposing side can reposition during Dusk.
- Neither side gains repositioning permission during Dreamwell, Draw, Dawn,
  Night, Challenge, or Ending.

The permission depends on the receiving side and current phase even when the
opponent caused the materialization.

The prompt and suspended effect cursor are part of the folded room state.
Tentative selection is client-local presentation state; reloading clears it.
Only the confirmed list becomes a shared event. Reloading or joining from
another client must display the same selection opportunity and resume the same
effect after confirmation.

Only one valid confirmation can resolve the prompt. Competing confirmations
use the existing prompt identifier and event-log conflict behavior. Multiple
clients representing the receiving side may present the decision under the
prototype's current room-trust model; the first valid confirmation wins.

## Banishment Resolution

Confirming multiple selected characters produces one simultaneous battlefield
change. Click order and selection order are presentation state only.

The reducer captures a transition snapshot for every selected source before
applying the simultaneous removal. The snapshot includes identity, owner,
controller, position, statuses, authored abilities, and relationships that
expire when that source leaves play. Trigger discovery compares this pre-state
snapshot with the completed post-banish battlefield, so source-owned leave-play
observers and expiring relationships remain discoverable. Their effects
evaluate against the post-state. Discovery follows the engine's canonical
authored-effect traversal; it must never use click order, selection array order,
or partially banished intermediate states.

Every selected ordinary character enters its owner's Banished zone, including
a character currently controlled by the other side.
Every selected figment fires applicable dissolved behavior only when the
originating operation is dissolve or Abandon; Making Room is banishment, so a
selected figment ceases without a dissolved trigger.

Counters clear according to ordinary leave-play rules. Persistent state follows
the ordinary zone-change rules for the resulting destination.

Any "until this character leaves play" relationships owned by a selected source
observe that source leaving. Cards returned by those relationships use the
ordinary materialization and capacity rules when they return to play.

Logging must preserve the simultaneous selection as one decision while still
identifying every affected card by battle-card identity and source card UUID.

## Gain Control

Gain Control moves the targeted character to the receiving side's leftmost open
back-rank position.

The character preserves:

- Owner identity.
- Counters.
- Gained spark.
- Granted keywords and other persistent statuses.
- Markers and notes.

Derived Support and static contributions are recomputed from the character's
new controller and position after the move.

Its controller changes to the receiving side. It becomes exhausted until the
current turn's Ending phase, regardless of its preceding exhaustion state or
the Awakened keyword.

Gain Control is not materialization. It fires no materialization triggers and
does not satisfy materialization conditions.

When the receiving back rank is full, Gain Control parks and invokes Making
Room for the receiving player. The same phase-dependent reposition permission
and simultaneous banishment behavior apply.

When the effect resumes, the engine revalidates that the target is still an
enemy character in play. If valid, it uses the target's current state and
location rather than a stale pre-prompt snapshot. If the target is not an enemy
character in play, or if the player confirms without producing an open
back-rank position, the control change fails. A valid but capacity-blocked
target remains in its current position under its current controller with its
existing state. Confirmed banishments and their triggered consequences remain
committed.

## Exhaust Abilities

Only back-rank characters can activate abilities containing a ☪ cost.

The legality check occurs before any cost is paid. A front-rank character
cannot activate such an ability, even if the effect would move or remove that
character.

Paying a ☪ cost exhausts the back-rank source in its current position. It does
not trigger an automatic retreat or capacity procedure.

Awakened characters can pay ☪ costs when they are in the back rank. An
exhausted character cannot pay another ☪ cost until it awakens.

Abilities without a ☪ cost retain their ordinary position and timing rules.

## Bulk Repositioning

All Forward and All Back are player-facing macros for ordinary repositioning.
They are available only when that side can currently reposition.

Each operation is deterministic:

- Characters already in the destination rank keep their positions.
- Characters in the source rank are considered from left to right.
- Empty destination positions are filled from left to right.
- Movement stops when the destination rank is full.
- Characters that do not fit remain in their source positions.
- All Forward skips exhausted characters.
- Neither operation banishes a character.

The complete bulk move is submitted as one atomic player intent so connected
clients never observe a partially moved formation. Its folded result is
equivalent to the corresponding ordered ordinary repositions.

The controls are neutral Cumulus Icon Buttons placed on the battlefield media,
with accessible labels "All Forward" and "All Back." Their disabled state is
derived from the same reposition-legality selectors used by drag and
context-menu actions.

## Challenge and Support Resolution

Challenge resolution iterates the nine fixed front lanes from `F0` through
`F8`. Empty lanes produce no score or dissolution.

A figment in a lane uses its own effective spark. It does not contribute spark
from any other figment sharing its type.

Unopposed figments score their own spark. Defended figments compare their own
spark with the opposing character and resolve Unstoppable, Vengeful, and
Preeminence under the ordinary character rules.

Support contribution is computed from the fixed back-to-front adjacency.
Qualifying figments can both provide and receive Support.

The challenge log and lane judgments identify each figment by its independent
battle-card identity.

## Folded State and Event Ownership

The room event log remains the sole authority for battle flow. React state can
hold hover, drag, and tentative red-outline selection, but it cannot decide
which characters were banished or when the suspended effect resumes.

Confirmation is one prompt-resolution intent containing the prompt identity
and selected battle-card identities. Reposition and bulk-reposition actions
remain ordinary battle-command intents tagged with the open prompt context.
Selection toggles do not write events until confirmation.

The reducer authorizes confirmation for the receiving side represented by the
open prompt. The prototype does not authenticate individual seats within one
side, so any connected client operating that side can answer; event ordering
and the prompt identity ensure that only the first valid answer commits.

The committed Making Room resolution must contain enough prompt identity to
reject stale or conflicting answers. The reducer validates that:

- The responding side matches the receiving side.
- The prompt is still current.
- Every selected identity is a current candidate.
- Every selected character is controlled by the receiving side.
- No selected identity appears more than once.
- Reposition commands submitted during the prompt are currently legal.
- Unrelated commands remain gated.

The effect driver owns suspension and resumption. Capacity handling must compose
with nested prompts and existing scripted effects without using component-local
continuations.

All Forward and All Back enter through the ordinary battle action surface as
one intent each. They must not dispatch a series of independently committed
events.

## Presentation Requirements

Both sides always expose all 10 back and 9 front positions. Empty positions
remain visible drop targets.

The battlefield preserves:

- Fixed lane alignment between opposing front ranks.
- Fixed Support adjacency within each side.
- Square battlefield character crops.
- Independent rendering and interaction for every figment.
- Full-card inspection through the existing card interaction.

The figment-count badge has no target-state meaning because one rendered
figment represents one character. A figment can still receive the ordinary
counter, note, marker, and status presentations used by other characters.

Making Room uses the board presentation rather than a detached card gallery:

- The prompt identifies the effect that caused it.
- The ordered incoming characters or Gain Control target remain visible.
- The prompt states how many openings are needed and predicts how many incoming
  characters will overflow under the current formation and selection.
- Eligible controlled characters remain in their actual positions.
- Tapping an eligible character toggles a red selection outline.
- Selected characters also expose `aria-selected`, and the confirm action
  reports the selected count so color is not the only selection signal.
- Drag and contextual repositioning remain available only when permitted.
- All Forward and All Back follow the same permission.
- A persistent confirm action shows that zero or more selected characters will
  be banished.
- Other battle controls are disabled or withheld.
- Connected clients that do not own the decision see a clear waiting state.

The existing full-card inspection gesture remains available during Making
Room. Selection uses the ordinary board-selection gesture; inspection uses its
existing distinct long-press, context, or detail action so the capacity prompt
does not make card text inaccessible.

The fixed 10/9 field is expected to fit as one formation on phone and desktop
viewports. Final mobile dimensions require visual and interaction testing. The
implementation must measure actual side insets, gaps, square size, drag
accuracy, and inspection usability at the supported narrow widths.

Horizontal scrolling or pagination would obscure lane and Support
relationships and therefore requires a separate product decision if fitting the
complete formation proves unusable.

## Observability

New logs must make a production Making Room decision reconstructable.

The prompt-open record should include:

- Battle and prompt identity.
- Turn, phase, active side, and receiving side.
- Cause: materialization or Gain Control.
- Ordered incoming descriptors, correlation identities, source UUIDs where
  applicable, and expected source positions.
- Back-rank occupancy and number of required openings.
- Whether repositioning is permitted.

Reposition records retain their ordinary source and destination positions and
should identify Making Room as their interaction context.

The confirmation record should include:

- Selected battle-card identities and source UUIDs.
- Their positions immediately before confirmation.
- The simultaneous banishment result.
- Back-rank occupancy after confirmation.

The resume record should include:

- Which incoming characters materialized and their destination positions.
- Which ordinary characters were banished instead of entering.
- Which figments ceased to exist.
- Whether a Gain Control attempt succeeded or failed.
- Any nested prompt opened before the original effect completed.

Bulk-reposition logs should include the direction and ordered list of actual
moves. Logging the macro label alone is insufficient to reconstruct the final
formation.

## Implementation Landmarks

The primary state and fixed-position contracts live in
[`src/battle/types.ts`](../../src/battle/types.ts). This is the starting point
for bounded slot identifiers, fixed rank factories, battle-card instance state,
and command metadata.

[`create-initial-state.ts`](../../src/battle/state/create-initial-state.ts) owns
initial rank materialization and instance creation.

[`src/battle/state/selectors.ts`](../../src/battle/state/selectors.ts) owns
position lookup, default materialization destinations, battlefield dimensions,
and legality selectors. Dynamic play-area sizing and unbounded fallback
destinations originate here.

[`src/battle/state/figments.ts`](../../src/battle/state/figments.ts) contains
the stack representation, stack spark, Warrior counting, merge behavior, and
top-member removal behavior that must converge on one-instance-per-figment
semantics.

[`apply-debug-edit.ts`](../../src/rules/battle/apply-debug-edit.ts) owns
character movement, creation, figment creation, leave-play replacement, exhaust
status edits, and destination availability.

[`src/battle/engine/challenge.ts`](../../src/battle/engine/challenge.ts) and
[`src/battle/engine/support.ts`](../../src/battle/engine/support.ts) own lane
resolution and staggered Support geometry.

[`src/rules/battle/fold.ts`](../../src/rules/battle/fold.ts),
[`src/rules/battle/driver.ts`](../../src/rules/battle/driver.ts), and
[`src/rules/battle/effect-step.ts`](../../src/rules/battle/effect-step.ts) own
persisted prompts, effect suspension, and deterministic resumption.

[`src/rules/battle/battle-events.ts`](../../src/rules/battle/battle-events.ts)
owns prompt gates, command application, prompt validation, and the transition
back into the effect queue.

[`src/rules/events.ts`](../../src/rules/events.ts) and
[`src/coop/actions.ts`](../../src/coop/actions.ts) define the shared intent
surface used by battle commands and prompt resolutions.

[`mobile-battle-view-model.ts`](../../src/screens/cumulus_adapters/mobile-battle-view-model.ts)
maps folded positions, candidates, prompts, and card state into the battle view.

[`MobileBattleScreen.tsx`](../../src/cumulus/screens/MobileBattleScreen.tsx)
owns fixed-rank presentation, square sizing, board selection, drop targets,
Icon Buttons, confirm controls, and waiting states.

[`MobileBattleScreenAdapter.tsx`](../../src/screens/cumulus_adapters/MobileBattleScreenAdapter.tsx)
owns the thin connection between shared actions and the pure Cumulus screen.

[`quest_prototype.md`](quest_prototype.md) is the primary architecture
reference. Implementation must revise its battlefield dimensions, figment
state shape, and battle-runtime narrative in the same change that makes the new
model live.

[`src/battle/ai/forward-model.ts`](../../src/battle/ai/forward-model.ts),
[`src/battle/ai/evaluate.ts`](../../src/battle/ai/evaluate.ts), and
[`src/battle/ai/planner.ts`](../../src/battle/ai/planner.ts) contain
unbounded-rank and figment-stack compatibility assumptions. The core
representation change must keep these consumers type-safe and deterministic.

This implementation is enabled for manual-player battles such as `ai=0`.
AI-controlled sides must not enter a capacity state that requires Making Room
until a separate strategic policy defines repositioning, banishment selection,
and confirmation. The rollout gate must reject or withhold that unsupported
configuration rather than leave a battle waiting for an AI prompt response.

## Compatibility and Migration

The battle state shape changes materially:

- Ranks have fixed bounded positions.
- Figment membership arrays do not represent multiple characters.
- Same-type figments have distinct battle-card identities.
- A suspended capacity decision becomes part of folded battle state.

The reducer build hash and room version gate protect active rooms from folding
the same event history under incompatible semantics. A room created with an
incompatible reducer must surface the existing version gate rather than
silently reinterpret stacked figments or dynamic slots.

Replay fixtures and serialized battle snapshots need canonical fixed-rank
state. Missing empty positions must be restored deterministically after JSON or
Realtime Database round trips.

Debug fixtures that contain positions beyond `B9` or `F8` are invalid. Fixtures
with multi-member figment instances need independent instance identities and
locations.

Quest deck entries, source card UUIDs, and ordinary battle-card identities
remain stable. Card names remain display-only and cannot be used to merge,
target, count, or migrate figments.

The existing figment catalog data remains compatible. Runtime hydration still
uses its stable authored identity and data fields.

Battle AI documentation, tests, and runtime consumers must describe independent
figments and bounded ranks. AI-controlled Making Room remains gated until its
strategic behavior is designed and implemented.

The primary quest prototype architecture document must move to the fixed 10/9
field and independent-instance figment shape at implementation time. It cannot
remain a source of 5-back/4-front or multi-member figment contracts after the
runtime migration.

## Validation Requirements

Automated validation must cover:

- Both sides initialize with exactly 10 back and 9 front positions.
- Serialization restores every empty fixed position.
- Out-of-range destinations are rejected.
- Materialization chooses the leftmost open back position.
- Every same-type figment receives a distinct identity and position.
- Generated ordinary tokens receive replay-stable identities even when they
  fail entry and begin in Banished.
- Figment targeting, spark, status, Support, and challenges are independent.
- Legion spark counts independent allied Warriors correctly.
- Full-back-rank materialization parks Making Room before entry.
- Batch membership and order remain stable across suspension and replay.
- Incoming source revalidation cannot move a card from an unexpected zone.
- Zero, one, and many selected characters banish simultaneously.
- A stale candidate rejects the whole confirmation and leaves the prompt open.
- Candidate refresh preserves the immutable prompt snapshot across replay.
- Applicable leave-play triggers run before the suspended effect resumes.
- Source-owned leave-play triggers are discovered from transition snapshots.
- Each member's entry or failed-entry triggers resolve before the next member.
- Nested materialization can park another Making Room prompt.
- The original batch cannot open a second Making Room prompt.
- Batch entry follows source-zone order.
- Ordinary overflow entrants enter Banished without materialization triggers.
- Overflow figments cease without entering Banished.
- Costs remain paid after failed entry.
- Day and Dusk expose only the correct side's repositioning.
- Other phases expose no Making Room repositioning.
- Normal commands are gated while the prompt is open.
- Reload and replay preserve the prompt and suspended effect cursor.
- Competing prompt resolutions accept one valid confirmation.
- Gain Control uses the receiving back rank, preserves state, sets exhaustion,
  ignores Awakened for that exhaustion, revalidates the current target, and
  fails safely when no opening exists.
- Banishment sends controlled ordinary characters to their owner's zone.
- Front-rank ☪ activations are rejected before costs are paid.
- All Forward and All Back produce deterministic atomic formations.
- Challenge resolution visits all nine fixed lanes.
- Logs contain enough identity, order, position, and outcome data to reconstruct
  the capacity decision.
- Manual-player rollout cannot leave an AI-controlled side waiting on Making
  Room.

Tests that depend on authored card or configuration defaults must derive their
fixtures locally rather than asserting production TOML choices.

The stable implementation must pass lint, typecheck, and the complete test
suite.

## Acceptance Criteria

- The authoritative battle rules and runtime agree on every fixed-position,
  figment, Making Room, Gain Control, Support, challenge, and exhaust invariant.
- The primary quest prototype architecture reference agrees with the live
  fixed-field and independent-figment state shape.
- One visible figment always corresponds to one independently targetable
  battle-card instance.
- Neither runtime state nor presentation creates battlefield positions beyond
  the fixed 10/9 set.
- A materialization overflow cannot resolve without a persisted player decision
  or an explicit zero-selection confirmation.
- Connected clients replay the same selected banishments, trigger outcomes,
  incoming order, and final formation.
- UI-local state never gates effect resumption or decides which characters
  leave play.
- All Forward and All Back are deterministic, atomic, accessible, and limited
  to normal repositioning windows.
- Production logs can explain why each incoming character entered, was
  banished, ceased to exist, or failed to change control.
- Mobile and desktop battlefields keep all lane and Support relationships
  understandable at supported viewports.

## Manual QA

Open a manual battle through a dedicated `?goto=battle&ai=0` room and install
the standard browser error buffer before acting.

Verify an empty battle shows 10 back and 9 front positions for each side.
Measure the slot count, rank alignment, square geometry, and absence of clipping
on one desktop and one narrow phone viewport.

Create several same-type figments. Confirm each occupies a distinct position,
can be selected independently, carries independent status and spark, and
interacts with Support like an ordinary character.

Fill one back rank, then attempt a single materialization during Day. Reposition
a ready character forward, select multiple characters in both ranks for
banishment, confirm, and verify the selected red outlines become one
simultaneous banishment before the incoming character enters the leftmost open
back position.

Repeat during Dawn and confirm that selection and confirmation remain available
while repositioning, card play, abilities, and phase changes are unavailable.

Exercise a batch from the void with fewer openings than members. Verify
source-zone order determines which ordinary characters enter and which reach
Banished. Repeat with figments and verify overflow figments do not appear in
Banished.

Use a leave-play trigger during Making Room and verify it resolves before the
pending batch. Exercise a nested materialization and confirm the room can park
and replay the nested prompt correctly.

Exercise Gain Control with an open back position, then with a full back rank.
Verify state preservation, exhaustion through the current turn, successful
Making Room, and safe failure when confirmation produces no opening.

Attempt a ☪ ability from both ranks. Confirm the back-rank activation succeeds
and the front-rank activation is unavailable without paying costs.

Exercise All Forward and All Back with exhausted characters and more characters
than the destination can hold. Confirm existing destination occupants remain,
eligible source characters move left-to-right, exhausted characters stay out of
the front rank, overflow stays in place, and connected clients observe one
atomic formation change.

Reload while Making Room is open and join the room from a second client.
Confirm both clients show the same pending decision, one confirmation wins, and
both replay to the same resumed effect and final battlefield.

Inspect the captured error buffer after every state-changing action. Finish by
reviewing the battle log and persisted quest log to reconstruct the prompt
cause, selected identities, repositioning, simultaneous banishment, trigger
resolution, incoming order, and final outcomes.
