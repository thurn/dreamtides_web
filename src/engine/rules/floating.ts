/**
 * Floating effects: changes with a duration (rules § Durations). Spark gained
 * with a duration, floating and delayed triggers, and disabled triggers are
 * records here, as are the continuous changes of continuous/layers.ts; each
 * ends when its expiry is reached, wherever its cards are. The layer
 * evaluation reads the continuous records in timestamp order. A character's
 * `abilities` and `loseAbilities` changes are mirrored onto its
 * `status.gainedAbilities` and `status.lostAbilities` here, as each begins
 * and ends, so its ability list reads from the instance alone.
 */
import type { EffectId, InstanceId, Side } from "../state/ids";
import { oncePerTurnParts } from "../state/ids";
import type { BattleState, Expiry, FloatingChange, FloatingEffect, GainedAbilities } from "../state/types";
import type { StepContext } from "../steps/types";
import { floatingEnded } from "./zones";

/** Mints an effect id; payable and floating effects share the counter. */
export function mintEffectId(state: BattleState): EffectId {
  const id: EffectId = `e${state.nextEffect}`;
  state.nextEffect += 1;
  return id;
}

/** Starts a floating effect and returns its id. */
export function addFloating(
  ctx: StepContext,
  effect: Omit<FloatingEffect, "id" | "timestamp">,
): EffectId {
  const id = mintEffectId(ctx.state);
  ctx.state.floating.push({ ...effect, id, timestamp: ctx.state.clock });
  if (effect.change.kind === "abilities" || effect.change.kind === "loseAbilities") mirrorAbilities(ctx.state, effect.change.instance);
  ctx.emit({
    kind: "effectStarted",
    effect: id,
    controller: effect.controller,
    source: effect.source,
    expiry: effect.expiry,
    change: effect.change,
  });
  return id;
}

/**
 * Ends every floating effect matching `ends`, in creation order, then does
 * what each one's end does: a card banished until then returns, and a
 * temporary created character ceases to exist (zones.ts `floatingEnded`).
 * An "until the opponent pays" effect none of whose floating effects is left,
 * such as one whose character left play, ends unpaid (`endUnlinkedPayable`).
 */
export function endFloating(ctx: StepContext, ends: (effect: FloatingEffect) => boolean): void {
  const ending = ctx.state.floating.filter(ends);
  if (ending.length === 0) return;
  ctx.state.floating = ctx.state.floating.filter((effect) => !ending.includes(effect));
  for (const effect of ending) {
    if (effect.change.kind === "abilities") abilitiesEnded(ctx, effect.change.instance);
    else if (effect.change.kind === "loseAbilities") mirrorAbilities(ctx.state, effect.change.instance);
  }
  for (const effect of ending) {
    ctx.emit({ kind: "effectEnded", effect: effect.id });
  }
  for (const effect of ending) {
    if (effect.expiry.at === "paid") endUnlinkedPayable(ctx, effect.expiry.effect);
  }
  for (const effect of ending) floatingEnded(ctx, effect);
}

/**
 * Ends the payable effect `id`, unpaid, once no floating effect is linked to
 * it, so nothing offers to pay for an effect that changes nothing. Paying
 * removes the payable effect before its floating effects end
 * (rules/payable.ts `endPayable`), so a paid one is already gone.
 */
function endUnlinkedPayable(ctx: StepContext, id: EffectId): void {
  const { state } = ctx;
  const payable = state.payable.find((effect) => effect.id === id);
  if (payable === undefined || state.floating.some(({ expiry }) => expiry.at === "paid" && expiry.effect === id)) return;
  state.payable = state.payable.filter((effect) => effect.id !== id);
  ctx.emit({ kind: "payableEffectEnded", effect: id, payer: payable.payer, paid: false });
}

/** The group of abilities an `abilities` change gives. */
function gainedGroup(change: Extract<FloatingChange, { readonly kind: "abilities" }>): GainedAbilities {
  return "figment" in change ? { figment: change.figment } : { cardId: change.cardId, variant: change.variant };
}

/**
 * Sets a character's `status.gainedAbilities` to its `abilities` changes, in
 * creation order, and its `status.lostAbilities` to the number of them made
 * before its latest `loseAbilities` change; each is absent when there is
 * none. Creation order is timestamp order, so a gain after a loss survives it.
 */
function mirrorAbilities(state: BattleState, id: InstanceId): void {
  const instance = state.instances[id];
  if (instance === undefined) return;
  const gained: GainedAbilities[] = [];
  let lost: number | undefined;
  for (const { change } of state.floating) {
    if (change.kind === "abilities" && change.instance === id) gained.push(gainedGroup(change));
    else if (change.kind === "loseAbilities" && change.instance === id) lost = gained.length;
  }
  if (gained.length > 0) instance.status.gainedAbilities = gained;
  else delete instance.status.gainedAbilities;
  if (lost !== undefined) instance.status.lostAbilities = lost;
  else delete instance.status.lostAbilities;
}

/**
 * As abilities a character gained end, it no longer has them, and abilities
 * it gains later start after its own again: the once-per-turn records of
 * every ability past its own are dropped, so a gained "Once per turn"
 * ability is never limited by one that ended.
 */
function abilitiesEnded(ctx: StepContext, id: InstanceId): void {
  const { state } = ctx;
  mirrorAbilities(state, id);
  const instance = state.instances[id];
  if (instance === undefined || instance.printing.kind === "figment") return;
  const own = ctx.catalog.card(instance.printing.cardId).abilities(instance.variant).length;
  state.oncePerTurn = state.oncePerTurn.filter((key) => {
    const { source, ability } = oncePerTurnParts(key);
    return source !== id || ability < own;
  });
}

/**
 * Ends the floating effects whose expiry is `at` this boundary. As a
 * character leaves play, the losses of its abilities end too, whatever their
 * expiry (rules § Keywords and Effects → Losing abilities).
 */
export function expireAt(ctx: StepContext, boundary: Expiry): void {
  endFloating(ctx, (effect) => sameBoundary(effect.expiry, boundary) || (
    boundary.at === "sourceLeavesPlay" && effect.change.kind === "loseAbilities" && effect.change.instance === boundary.source
  ));
}

function sameBoundary(expiry: Expiry, boundary: Expiry): boolean {
  switch (boundary.at) {
    case "turnStart":
      return expiry.at === "turnStart" && expiry.side === boundary.side;
    case "sourceLeavesPlay":
      return expiry.at === "sourceLeavesPlay" && expiry.source === boundary.source;
    case "paid":
      return expiry.at === "paid" && expiry.effect === boundary.effect;
    default:
      return expiry.at === boundary.at;
  }
}

/**
 * The card a floating change changes, or `null` for a trigger, a cost
 * modifier, a play limit, a play permission or restriction that names no
 * card, or a static-only `reclaimNotBanished`, which never floats. A
 * permission, a restriction, or a `cardCost` change naming a card changes
 * it, so the view and the `effectStarted` event hide it while that card is
 * hidden.
 */
export function changedInstance(change: FloatingChange): InstanceId | null {
  switch (change.kind) {
    case "trigger":
    case "cost":
    case "playLimit":
    case "reclaimNotBanished":
      return null;
    default:
      return change.instance;
  }
}

/**
 * Whether a floating change carries complete legality data of its own: a
 * cost change, a play permission (gained or lost Reclaim among them, with
 * its costs), or a play restriction or limit. A view and a determinization
 * keep it, with its source redacted, when its source is hidden or has ceased
 * to exist, such as a copy of an event that resolved, so the cards a player
 * may play and their costs read the same in every determinization
 * (view/view.ts).
 */
export function carriesLegality(change: FloatingChange): boolean {
  switch (change.kind) {
    case "cost":
    case "cardCost":
    case "playFrom":
    case "cannotPlay":
    case "playLimit":
      return true;
    case "keyword":
      return change.keyword === "reclaim";
    default:
      return false;
  }
}

/**
 * Legality data, recorded hand returns, and lost abilities remain obligations
 * with a redacted source: a character that lost its abilities has none in
 * every determinization, whatever became of the effect's source. Their
 * changed card and expiry identities must still be visible.
 */
export function keptWithoutSource(change: FloatingChange): boolean {
  return carriesLegality(change) || change.kind === "banishedToHandUntil" || change.kind === "loseAbilities";
}

/** Ends the floating effects that change `id`, when it ceases to exist. */
export function endChangesTo(ctx: StepContext, id: InstanceId): void {
  endFloating(ctx, (effect) => changedInstance(effect.change) === id);
}

/** The floating and delayed triggers `side` controls, in creation order. */
export function floatingTriggers(state: BattleState, side: Side): FloatingEffect[] {
  return state.floating.filter((effect) => effect.controller === side && effect.change.kind === "trigger");
}
