# Fixed Battlefield and Figment Combination

## Summary

Dreamtides battles use a fixed battlefield for each player with 10 back-rank
positions and 9 front-rank positions. Every visible figment is one character
in one position.

Battlefield capacity resolves without asking a player to remove characters.
An ordinary character that cannot materialize is banished instead. A group of
same-type figments uses every available back position, then distributes the
group's own spark evenly among the figments that enter. If no position is open,
the group ceases without entering play.

Players can also combine two same-type figments during normal repositioning.
The dragged figment ceases and permanently adds its own spark to the
destination. Combination is not banishment or dissolution.

Player-initiated actions show a confirmation warning before costs are paid when
capacity will banish a character, combine figments, make a group cease, or
cause Gain Control to fail. The warning states the predicted result. Mandatory
effects resolve immediately and explain the result afterward.

This document defines the target behavior and the prototype contracts needed
to implement it. The battle rules remain authoritative for game semantics.

## Related Information

- [Dreamtides Battle Rules](../battle_rules/battle_rules.md) defines the fixed
  field, materialization, combination, Gain Control, and figment rules.
- [Figment Catalog](../../data/tabula/figments.ron) authors stable figment
  identities, base spark, rules text, keywords, and presentation data.
- [Journey Prototype](journey_prototype.md) explains the folded room-event
  architecture and current battle model.
- [Firebase Multiplayer](firebase_multiplayer.md) defines event ordering,
  optimistic intents, prompt replay, and conflict behavior.
- [Battle AI](battle_ai.md) documents the current AI representation and
  proposal flow. Strategic combination choices remain a separate AI design.
- [QA Tooling](qa_tooling.md) defines browser validation, error capture, and
  responsive evidence requirements.
- [QA Scenes](qa_scenes.md) lists direct battle entry points for manual
  verification.
- [Cumulus Design System](cumulus_design_system.md) defines presentation and
  component ownership for battle warnings and result messages.

## Problem and Context

The fixed field creates meaningful capacity limits. Materialization and control
effects need deterministic outcomes when all 10 back positions are occupied.
Those outcomes must not require a broad interruption in which the player edits
their battlefield before an effect can continue.

Figments create a second capacity concern. Effects can create several identical
figments at once, and treating every excess body as lost makes wide figment
effects fragile. Combining their intrinsic spark preserves much of the effect's
value without representing several characters in one position.

Manual combination also gives players a way to consolidate same-type figments
before the field fills. Consolidation is irreversible: one character remains,
and only its spark grows. Targeting, subtype counts, Support, challenge
participation, statuses, and triggers continue to see one character.

The distinction between a figment's own spark and its effective spark is
essential. A figment can receive temporary or contextual spark from Support,
anthems, and static abilities. Baking those values into a combination would
turn temporary bonuses into permanent gains. Combination transfers only the
source's authored base spark and persistent spark state.

The Legionnaire figment makes this distinction visible. Its authored identity
is `e757b306-5bab-4a5a-8493-28c0f3aa6440`. It has 1 base spark and receives
+1 spark for each other Warrior its controller controls. The Warrior-count
bonus is dynamic and does not transfer when the Legionnaire combines.

## Goals

- Keep exactly 10 back and 9 front positions per side throughout battle.
- Represent each visible figment as one independently targetable character.
- Allow same-type figments to combine during ordinary repositioning.
- Make combination irreversible and distinct from banishment and dissolution.
- Transfer intrinsic spark without capturing external or dynamic bonuses.
- Preserve value from multi-figment effects when at least one position is open.
- Resolve zero-space materialization and Gain Control deterministically.
- Warn before voluntary actions produce destructive capacity outcomes.
- Explain automatic capacity outcomes that cannot ask for confirmation.
- Keep confirmation and resolution authoritative across connected clients.
- Make logs sufficient to reconstruct every capacity and combination result.
- Identify the existing prototype surfaces that must change during
  implementation.

## Battlefield Invariants

Each side owns a fixed position set:

- Back rank: `B0` through `B9`.
- Front rank: `F0` through `F8`.

Every position exists from battle initialization through battle completion.
Empty positions remain explicit in folded state and visible in presentation.

Each position contains at most one character. Ordinary characters, created
character tokens, and figments all consume one position.

Challenge lanes are `F0` through `F8`. The fixed stagger maps `Fi` to support
positions `Bi` and `B(i+1)`.

Commands addressing positions outside the fixed set are invalid. Serialization
and hydration restore every empty fixed position.

## Figment Identity and State

Each materialized figment receives a unique battle-card identity. Two figments
from the same catalog entry remain separate characters until a combination
removes one of them.

Runtime equality uses the figment catalog UUID, never its displayed name.
Displayed names are not identity and are resolved only for presentation.

A figment owns:

- One stable battle-card identity while in play.
- One catalog identity.
- One owner and controller.
- One battlefield position.
- Authored base spark.
- Persistent spark gains, including spark received through combination.
- Its own exhaustion, counters, markers, notes, and granted statuses.
- Its catalog keyword and rules text.
- Creation and combination provenance for logging.

A figment exists only in play. When it leaves play it ceases to exist rather
than entering another zone.

Each figment counts once as a character and once toward its subtype. Combining
two Warriors leaves one Warrior. Effects counting characters or Warriors see
the reduced battlefield immediately.

## Own Spark and Effective Spark

Own spark is the value combination can transfer. It consists of:

- The figment's authored base spark.
- Persistent spark gains recorded on that figment.
- Spark previously received through combination.

Raw own spark is authored base spark plus the complete persistent modifier
total. Displayed and transferable own spark clamp that raw value to the same
nonnegative boundary used for effective spark. The raw modifier remains in
state: adding spark to a destination first pays down any persistent negative
modifier rather than adding to an already clamped value.

Effective spark is the value used for display and challenge resolution. It
starts with own spark and can include contextual contributions such as:

- Support.
- Anthems and other static battlefield bonuses.
- Dynamic rules-text bonuses.
- Other contributions that apply only while their source or condition holds.

Contextual contributions never transfer through combination. Counters,
keywords, notes, exhaustion, and other statuses also do not transfer.

The destination keeps all of its own state and adds the source's own spark as a
persistent gain. This accumulated value transfers again if the destination
later becomes the source of another combination.

Because figments cease when they leave play, a combined spark gain lasts for
the remaining lifetime of the destination figment.

## Legionnaire Spark

The Legionnaire catalog entry has:

- Base spark: 1.
- Subtype: Warrior.
- Rules text: this character has +1 spark for each other Warrior you control.

This is equivalent to the intended ordinary battlefield value of one spark per
Warrior controlled by the Legionnaire's controller, counting the Legionnaire
itself through its base spark. Control, rather than ownership, determines which
Warriors contribute.

Only the base spark and persistent gains belong to the Legionnaire's own spark.
Its live Warrior-count contribution is contextual.

For example, a Legionnaire among four Warriors its controller controls has 4
effective spark before other bonuses. With no persistent gains, combining it
transfers 1 spark. The warning displays both values so the player can see that
3 dynamic spark will not be preserved.

After one Legionnaire combines into another, the destination gains 1 own spark
and the battlefield contains one fewer Warrior. Its dynamic bonus is then
recomputed from the remaining Warriors its controller controls.

## Manual Figment Combination

During a normal repositioning window, a player may drag a figment onto another
figment they control with the same catalog identity.

The action uses ordinary repositioning legality:

- The active side can combine during Day.
- The opposing side can combine during Dusk.
- Other phases grant no combination permission through repositioning.
- An exhausted source cannot combine onto a front-rank destination.

Combination replaces the ordinary occupied-position swap for matching
figments. The destination remains in its existing position. The source does not
move into that position.

After confirmation:

- Capture the source's current own spark.
- Add that amount to the destination's persistent own spark.
- Remove the source from its position.
- Make the source cease to exist.
- Recompute all subtype counts, static bonuses, Support, and dynamic spark.

This complete mutation and derived-state recomputation is atomic. Before the
mutation, the engine snapshots every ability eligible to observe the source
leaving play, including abilities on other battlefield and persistent sources.
After recomputation, those observers resolve against the post-combination
state, ordered by stable battle-card identity and then authored ability index.
Persistent sources without a battle-card identity use their authored UUID. The
source's own observers remain eligible because they were captured from
pre-state.

The source does not enter the Banished zone or the void. Combination is not
Banish, Dissolve, Abandon, or materialization. It fires no banishment or
dissolved triggers.

The source did exist in play and then left it. General effects that observe a
character leaving play can observe the transition unless their condition
specifically requires banishment or dissolution.

Combination cannot be undone through a split action. Ordinary battle undo
debugging can still replay the event log during development, but no player
command separates the destination into its contributing figments.

## Multi-Figment Materialization

When one effect creates one or more figments with the same catalog identity, the
engine treats them as one creation group before firing their materialization
triggers.

Let the group contain `N` figments and let `K` back positions be open when the
group begins. The number of figments that enter is the smaller of `N` and `K`.

The entering figments occupy the leftmost open positions. Those positions are
reserved for the group before any materialization trigger from the group
resolves.

When every member fits, each entering figment preserves its individual own
spark. When some members do not fit, the group computes the sum of every
incoming figment's own spark and divides that total as evenly as possible among
the entering figments. Integer remainder is assigned one point at a time from
the leftmost entering figment to the right.

Examples:

- Four 1-spark figments with four openings become four 1-spark figments.
- Four 1-spark figments with two openings become two 2-spark figments.
- Five 1-spark figments with two openings become a 3-spark figment followed by
  a 2-spark figment.
- Three 4-spark figments with two openings become two 6-spark figments.
- Four Legionnaires with two openings become two Legionnaires with 2 own spark
  each, then each separately derives its Warrior-count bonus.

Only the newly entering figments are destinations. Existing same-type figments
never receive spark from automatic capacity combination.

Each entering figment is one materialized character and fires one set of
materialization triggers. Excess members do not receive battle-card identities,
do not enter or leave play, and count as neither banished nor dissolved.

After all entering members occupy their reserved positions, their
materialization triggers resolve in left-to-right position order.

If no back position is open, none of the group materializes. Every pending
figment ceases without becoming an in-play character. The event produces no
materialization, leave-play, banishment, or dissolved triggers.

The effect first produces one total ordered output of ordinary characters and
figment descriptors. Consecutive figments with the same catalog UUID form one
creation group. An interleaved sequence `A, B, A` therefore contains three
groups, not one global `A` group. Ordinary characters remain individual entries
in that same order. Each entry or group reads the openings that remain when it
begins.

## Ordinary Materialization Overflow

An ordinary character materializes into the leftmost open back position.

If no position is open when that character resolves, it moves to its owner's
Banished zone instead of entering play. It has not materialized:

- It receives no battlefield position.
- It does not become exhausted.
- It fires no materialization triggers.
- It does not satisfy conditions that observe a materialized character.

The actual source-zone movement still occurs. A card moving from the void to
Banished has left the void. A card played from hand retains its preceding
played-card event even though it does not enter play.

Costs remain paid after confirmed execution. Banishment and source-zone
triggers resolve under ordinary timing.

For an ordered batch of ordinary characters, each member and its immediate
triggers resolve before the next. Effect order takes precedence; otherwise use
source-zone order from top to bottom.

An ordinary generated character token that cannot enter is created in its
owner's Banished zone with a replay-stable battle-card identity.

## Gain Control at Capacity

Gain Control moves a valid enemy character to the receiving side's leftmost
open back position. It preserves the character's state and exhausts it through
the current turn's Ending, even if it has Awakened.

Gain Control is not materialization and fires no materialization triggers.

If the receiving back rank is full, Gain Control fails. The target remains in
its current position, with its current controller and state.

At execution, the target must still be an enemy character in play and a
position must still be open. A stale or invalid target makes the effect fail.

After a successful move, the controller and position change atomically.
Support, subtype counts, static effects, challenger or blocker designation,
and controller-dependent spark are recomputed for both sides before resulting
triggers resolve.

## Capacity Warnings

A voluntary action requires a warning when current authoritative state predicts
one or more of these outcomes:

- An ordinary character will be banished instead of materializing.
- Some created figments will be folded into fewer entering figments.
- A created figment group has no destination and will cease.
- Gain Control will fail because the receiving back rank is full.
- A manual combination will make its source cease.
- A combination excludes contextual spark from its transferable amount.

The warning describes the exact predicted consequence. It identifies cards and
figments by display name for the player while carrying stable UUIDs internally.

A figment-capacity warning states:

- How many figments the effect attempts to create.
- How many positions are open.
- How many figments will enter.
- The resulting own spark of each entering figment.

A combination warning states:

- Which source will cease.
- Which destination will remain.
- The source's effective spark.
- The source's transferable own spark.
- Contextual spark that will not transfer, when nonzero.
- The destination's predicted own spark after combination.
- The destination's predicted effective spark after recomputation.
- Any controller-based count change, including the reduced Warrior count.
- Other in-play characters whose predicted effective spark changes.

A Gain Control warning states that the effect will fail and the target will
remain under its current controller.

The warning appears before the action commits and before any cost is paid.
The player can confirm or cancel. Cancellation changes no battle state and pays
no cost.

Warnings apply to playing cards, activating abilities, manual combinations, and
other voluntary commands whose selected targets make the capacity outcome
predictable.

The warning confirms the action under the current prediction; it does not
reserve future battlefield space. After the action commits or enters the stack,
later events can change capacity before its effect resolves. The committed
effect then uses current authoritative state, keeps its paid costs, and explains
any different capacity result afterward.

Mandatory triggered effects and other effects already committed for resolution
do not pause for confirmation. They resolve under the capacity rules and show
an explanatory result message afterward.

## Shared Warning State

A capacity warning is a shared folded prompt, not component-local game state.
It contains the original intent, actor side, selected UUIDs, predicted result,
and enough effect context to revalidate the action.

Only the acting side may confirm or cancel. The prototype's current room-trust
model allows any connected client representing that side to answer; the first
valid response wins.

While the warning is open, unrelated battle commands are gated. Inspection and
other presentation-only interactions remain available.

Confirmation does not blindly execute a stale prediction. The reducer
revalidates legality, targets, open positions, own spark, and contextual spark:

- If the predicted consequence still matches, execute the stored intent and
  pay its costs.
- If the action has become safe, execute it without another warning; this is
  the sole prediction-mismatch exception.
- If the canonical prediction payload has changed, replace the prediction and
  require confirmation of the new result.
- If the action is invalid, reject it without paying costs.

The prediction has a canonical serialized payload and hash. It includes the
action and target UUIDs, relevant slot occupancy and destination identities,
incoming counts and distribution, source and destination own and effective
spark, affected controller-based counts, overflow disposition, and failure
reason. Confirmation proceeds when this payload equals the payload the player
confirmed. A changed payload requires renewed confirmation unless revalidation
shows that the action has become safe, in which case it proceeds directly.

Reloading or joining while a warning is open shows the same prompt. Tentative
presentation state is local, but the stored action and prediction are shared.

The warning confirmation is not an opportunity to reposition, play another
card, activate another ability, or choose characters to remove. It answers only
whether the stored action should proceed.

## Explanatory Result Messages

After automatic figment combination, the player sees a concise message
describing the result. The message remains useful even when a pre-action
warning was shown because triggers or concurrent state may change the final
numbers.

Examples include:

- "Only 2 of 4 Warrior figments could materialize. They entered with 2 spark
  each."
- "Your back rank was full. The 3 created Shadow figments ceased."
- "Gain Control failed because your back rank was full."
- "This Legionnaire transferred 1 own spark; its Warrior bonus did not
  transfer."

Messages are informational and require no game decision. They can be dismissed
locally after the authoritative result has been folded.

Connected clients see results derived from the same committed event. A
late-joining client can reconstruct the outcome from the battle log even if the
transient message is not replayed as an open surface.

## Presentation Requirements

Both sides always display all 10 back and 9 front positions. Empty positions
remain visible drop targets.

Every figment renders as one character. Combination increases the destination's
displayed own spark without adding a count badge or reserve-member treatment.

A legal same-type combination destination receives a distinct drag affordance.
The affordance must not suggest an ordinary swap. Invalid destinations retain
ordinary repositioning feedback.

Warning dialogs use established Cumulus confirmation components and include:

- A direct statement of the destructive or lossy result.
- The exact materialized, combined, banished, or failed counts.
- Confirm and Cancel actions with clear accessible labels.
- Card inspection for every named source or target.

Legionnaire warnings distinguish effective and transferable spark in text, not
color alone.

Result messages must remain readable without blocking the next automatic
effect. Multiple results produced by one effect are grouped in effect order.

The fixed formation remains square-card based. Responsive verification must
measure actual slot size, gaps, inspection gestures, and warning-dialog
readability on supported phone widths.

## Event Ownership and Determinism

The room event log owns every state-changing action:

- Opening a capacity warning.
- Confirming or cancelling a warning.
- Manual combination.
- Automatic figment distribution.
- Ordinary overflow banishment.
- Gain Control success or failure.

React state may own hover, drag previews, dialog focus, and dismissed
informational messages. It cannot pay costs, remove the source, add spark, or
decide whether an action resumes.

Manual combination is one atomic command. Connected clients never observe the
spark addition without the source removal, or the source removal without the
spark addition.

Multi-figment placement and own-spark distribution are one deterministic group
result. Position reservation prevents an earlier member's materialization
trigger from changing how many members of that group enter.

All equality and event payloads use UUIDs. Display names are resolved at the
presentation boundary.

## Observability

Production logs must reconstruct why every capacity-limited action produced its
result.

A warning-open record includes:

- Battle, turn, phase, actor side, prompt identity, and source intent.
- Relevant card and figment UUIDs.
- Back-rank occupancy and open positions.
- Predicted entrants, destinations, own spark, and overflow.
- Predicted banishment or Gain Control failure.

A warning-resolution record includes:

- Confirm or cancel.
- Revalidation result.
- Any replacement prediction.
- Whether costs were paid.

A manual combination record includes:

- Source and destination battle-card identities.
- Shared figment catalog UUID.
- Source and destination positions.
- Source own and effective spark.
- Transferred spark and excluded contextual spark.
- Destination own spark before and after.
- Source cessation and resulting Warrior or subtype counts.

An automatic group record includes:

- Effect identity and group ordinal.
- Catalog UUID and requested count.
- Open-position snapshot and reserved positions.
- Total incoming own spark.
- Per-destination own spark.
- Count that entered and count that ceased.
- Materialization trigger order.

Ordinary overflow and Gain Control records include source, target, capacity,
zone movement, paid costs, and failure reason as applicable.

Logging should answer whether a different result came from capacity, dynamic
spark, a changed target, a concurrent event, or warning cancellation.

## Existing Implementation Ownership

The fixed position and instance contracts begin in
[`src/battle/types.ts`](../../src/battle/types.ts), initial state creation, and
the battle state selectors. These surfaces currently carry stack-oriented
figment fields and dynamic position assumptions that must move to the target
model.

Figment identity, own spark, effective spark, Warrior counting, and current
stack behavior are concentrated in
[`src/battle/state/figments.ts`](../../src/battle/state/figments.ts) and
[`src/battle/state/figment-catalog.ts`](../../src/battle/state/figment-catalog.ts).
The catalog must continue resolving the Legionnaire by UUID
`e757b306-5bab-4a5a-8493-28c0f3aa6440`.

Materialization, position movement, figment creation, and zone replacement pass
through the battle command application and effect driver under
[`src/rules/battle/`](../../src/rules/battle/). Capacity prediction and
execution must share one rules-owned calculation so warning copy cannot diverge
from committed results.

Shared prompt and event behavior belongs to the battle fold and
[`src/coop/actions.ts`](../../src/coop/actions.ts). The client submits intents;
the reducer validates warnings, confirmations, costs, and results.

The Cumulus battle screen and its adapter own drag affordances, warning dialogs,
result messages, and accessible inspection. They consume folded state rather
than implementing capacity arithmetic.

The primary [Journey Prototype](journey_prototype.md) document must be revised with
the fixed 10/9 field and one-instance figment shape when the runtime model
changes.

The [Battle AI](battle_ai.md) representation must remain type-safe with fixed
positions and combined own spark. Strategic decisions about whether to combine
or confirm a lossy action require a separate AI behavior design.

## Compatibility and Migration

The target battle state represents each visible figment as one instance. It
does not use a member array or reserve count to represent several characters in
one position.

Persistent own spark must survive room serialization, compaction, optimistic
folding, reload, and warning suspension.

Rooms created under an incompatible reducer build use the existing version
gate. They must not reinterpret stack-era figment arrays as combined spark or
replay old materializations under the new capacity rules.

Debug fixtures with positions outside `B9` or `F8` are invalid. Stack-era
fixtures need separate figment identities or an explicit combined own-spark
value according to the fixture's intended visible battlefield.

The Legionnaire catalog change preserves its ordinary effective spark:

- Alone: 1 base spark and zero other Warriors gives 1.
- With one other Warrior its controller controls: 1 base plus 1 gives 2.
- With three other Warriors its controller controls: 1 base plus 3 gives 4.

Generated browser data must be refreshed from `figments.ron`. Tests should
identify the Legionnaire by UUID and should not key game behavior by its name.

The primary architecture and AI documents must agree with the live
representation when implementation lands.

## Validation Requirements

Automated validation must cover:

- Both sides initialize with exactly 10 back and 9 front positions.
- Serialization restores every empty position.
- Same-type matching uses catalog UUID rather than display name.
- Manual combination follows Day and Dusk repositioning legality.
- An exhausted source cannot combine onto the front rank.
- Combining removes only the source and never moves the destination.
- Source own spark transfers exactly once.
- Persistent gains and earlier combined spark transfer.
- Support, anthems, dynamic bonuses, counters, and statuses do not transfer.
- Combination counts as neither banishment nor dissolution.
- Generic leave-play observers receive the manual source transition.
- Combination is atomic across replay and optimistic reconciliation.
- Four 1-spark figments with two openings become two 2-spark figments.
- Five 1-spark figments with two openings distribute as 3 then 2.
- A zero-opening figment group produces no materialized characters.
- Existing matching figments never receive automatic overflow spark.
- Reserved group positions survive materialization-trigger processing.
- Only entering figments fire materialization triggers.
- An ordinary overflow character moves to its owner's Banished zone.
- Overflow preserves source-zone movement and paid-cost semantics.
- Gain Control fails safely against a full receiving back rank.
- Voluntary lossy actions open a warning before costs are paid.
- Cancel pays no costs and changes no battle state.
- Confirmation revalidates stale capacity and target state.
- A changed destructive prediction requires renewed confirmation.
- Mandatory triggered effects resolve without a blocking prompt.
- Result messages report final committed values.
- Legionnaire base and dynamic spark reproduce existing ordinary values.
- Legionnaire combination transfers base plus persistent gains, not its
  Warrior-count bonus.
- Logs contain enough inputs and outcomes to reconstruct every result.

Data and documentation checks must confirm the Legionnaire UUID retains base
spark 1 and the "each other Warrior you control" rules text after generation.

Tests must use local fixtures rather than relying on unrelated production RON
defaults.

The completed implementation must pass lint, typecheck, and the full test
suite.

## Acceptance Criteria

- The battle rules, figment data, runtime, and presentation agree on the fixed
  battlefield and capacity outcomes.
- One visible figment always corresponds to one targetable character.
- Manual combination permanently increases one destination's own spark and
  makes one source cease.
- Combination cannot fire banishment or dissolved triggers.
- Multi-figment effects use all available positions and preserve total own
  spark whenever at least one new destination can enter.
- A full back rank never automatically adds spark to an existing figment.
- Ordinary overflow cards are banished without materializing.
- Gain Control fails against a full receiving back rank.
- Players explicitly confirm predictable voluntary losses before paying costs.
- Mandatory effects resolve without waiting for a player decision.
- Connected clients fold the same warning, confirmation, spark distribution,
  final formation, and result message.
- Production logs explain transferred own spark and excluded contextual spark.
- Legionnaire's dynamic Warrior bonus remains contextual and visible in
  warnings.

## Manual QA

Open a manual `?goto=battle&ai=0` battle and install the standard browser error
buffer.

Verify both sides expose 10 back and 9 front positions. Create two figments with
the same catalog identity, give the source persistent spark, and place it under
a static bonus. Drag it onto the destination during Day. Confirm the warning
separates effective and transferable spark, cancellation changes nothing, and
confirmation removes the source while adding only own spark to the destination.

Repeat with a Legionnaire among several Warriors. Confirm its displayed
effective spark includes the Warrior bonus, the warning transfers only base
plus persistent gains, and the destination recomputes after the Warrior count
drops.

Attempt same-type combination outside a repositioning window and with an
exhausted source targeting the front rank. Confirm both are unavailable.

Create four 1-spark figments with four, two, one, and zero openings. Verify the
resulting formations are four 1-spark, two 2-spark, one 4-spark, and no
figments. Confirm existing matching figments receive nothing and every outcome
shows an accurate explanation.

Create five 1-spark figments with two openings and verify the leftmost enters
with 3 own spark and the next with 2. Confirm only those two fire
materialization triggers.

Fill the back rank and attempt an ordinary character play, an activated
materialization ability, and Gain Control. Verify each voluntary action warns
before costs, Cancel is inert, and Confirm produces the stated banishment or
failure.

Trigger the same capacity outcomes through mandatory abilities. Confirm they
resolve without a blocking dialog and show informational messages afterward.

Open the room in a second client and reload while a warning is open. Confirm
both clients show the same pending action, one confirmation wins, stale
capacity is revalidated, and both clients reach the same formation.

Inspect the battle log and journey log. Confirm they identify all cards and
figments by UUID and reconstruct warnings, costs, position reservations, own
spark distribution, contextual spark exclusions, cessations, banishments, and
Gain Control failures.

Check the captured error buffer after each interaction. Review the fixed field,
drag affordance, warning, and result message at one desktop and one supported
narrow-phone viewport.
