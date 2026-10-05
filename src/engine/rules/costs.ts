/**
 * Costs of cards and activated abilities (rules § Costs, Requirements, and
 * X). Cost choices are play-time prompts before the commit point; payment
 * happens after it, all before the item goes on the stack.
 */
import { matchingCharacters } from "../dsl/selectors";
import { fixedEnergy, minimumEnergy, xCost } from "../dsl/energy";
import type { Cost } from "../dsl/types";
import type { ChooseCardsPrompt, ChooseNumberPrompt, PromptPurpose } from "../prompts/types";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import type { StepContext } from "../steps/types";
import { discardCard, spendEnergy } from "./resources";
import { instanceOf, moveInstance, slotOf } from "./zones";

/** Cards chosen to pay a list of costs, one list per cost in order (empty for costs without a choice). */
export type CostCards = readonly (readonly InstanceId[])[];

/**
 * Chooses X as a play-time prompt when the costs have an X part: from its
 * minimum up to the energy left after the fixed part. An unaffordable X is an
 * empty prompt, which makes the play illegal. `null` without an X part.
 */
export function chooseX(
  ctx: StepContext,
  side: Side,
  costs: readonly Cost[],
  purpose: PromptPurpose,
): number | null {
  const variable = xCost(costs);
  if (variable === null) return null;
  return ctx.choose<ChooseNumberPrompt>({
    kind: "chooseNumber",
    side,
    purpose,
    min: variable.min,
    max: ctx.state.sides[side].currentEnergy - fixedEnergy(costs),
  });
}

/**
 * Whether `source` can pay a ☾ cost now: the avatar while ready, or a ready
 * character in its controller's back rank. Front-rank characters and
 * dreamsigns cannot pay ☾ (rules § Exhaust and Awaken).
 */
export function canPayExhaust(state: BattleState, source: AbilitySource): boolean {
  if (typeof source !== "string") {
    const avatar = state.sides[source.side].avatar;
    return source.kind === "avatar" && avatar !== null && !avatar.exhausted;
  }
  const instance = state.instances[source];
  return (
    instance?.zone === "play" && !instance.status.exhausted && slotOf(state, source)?.rank === "back"
  );
}

/**
 * Whether `side` could pay the costs, apart from the cards chosen for them:
 * the energy (with X at its minimum) and any ☾. The dry run checks the choices.
 */
export function costsPayable(
  state: BattleState,
  side: Side,
  source: AbilitySource,
  costs: readonly Cost[],
): boolean {
  if (minimumEnergy(costs) > state.sides[side].currentEnergy) return false;
  return costs.every((cost) => cost.cost !== "exhaustSelf" || canPayExhaust(state, source));
}

/**
 * Chooses the cards that pay each cost, as play-time prompts. Cards in
 * `excluded` (the ability's targets) and cards chosen for earlier costs are
 * not candidates: a card used to pay a cost is never also a target of the
 * same ability (rules § Targeting).
 */
export function chooseCostCards(
  ctx: StepContext,
  side: Side,
  source: AbilitySource,
  costs: readonly Cost[],
  purpose: (role: string) => PromptPurpose,
  excluded: readonly InstanceId[],
): CostCards {
  const used = [...excluded];
  return costs.map((cost) => {
    let candidates: InstanceId[];
    let role: string;
    switch (cost.cost) {
      case "abandon":
        candidates = matchingCharacters(ctx.state, ctx.catalog, cost.selector, side, source);
        role = "abandonCost";
        break;
      case "discard":
        candidates = [...ctx.state.sides[side].hand];
        role = "discardCost";
        break;
      default:
        return [];
    }
    const chosen = ctx.choose<ChooseCardsPrompt>({
      kind: "chooseCards",
      side,
      purpose: purpose(role),
      candidates: candidates.filter((id) => !used.includes(id)),
      min: cost.count,
      max: cost.count,
    });
    used.push(...chosen);
    return [...chosen];
  });
}

/** Exhausts a source to pay a ☾ cost. */
function exhaustForCost(ctx: StepContext, source: AbilitySource): void {
  if (typeof source !== "string") {
    const avatar = ctx.state.sides[source.side].avatar;
    if (source.kind !== "avatar" || avatar === null) throw new Error("only an avatar emblem pays ☾");
    avatar.exhausted = true;
    ctx.emit({ kind: "avatarExhaustionChanged", side: source.side, exhausted: true });
    return;
  }
  instanceOf(ctx.state, source).status.exhausted = true;
  ctx.emit({ kind: "exhaustionChanged", instance: source, exhausted: true });
}

/** Abandons a character `side` controls: it moves from play to its owner's void (rules § Abandon). */
export function abandonCharacter(ctx: StepContext, side: Side, id: InstanceId): void {
  moveInstance(ctx, id, "void");
  ctx.emit({ kind: "abandoned", instance: id, side });
}

/** Pays every cost, in printed order, with X and the cards chosen before the commit point. */
export function payCosts(
  ctx: StepContext,
  side: Side,
  source: AbilitySource,
  costs: readonly Cost[],
  x: number | null,
  cards: CostCards,
): void {
  costs.forEach((cost, index) => {
    switch (cost.cost) {
      case "energy":
        spendEnergy(ctx, side, cost.amount);
        return;
      case "energyX":
        if (x === null) throw new Error("An X cost is paid only after X is chosen");
        spendEnergy(ctx, side, x);
        return;
      case "exhaustSelf":
        exhaustForCost(ctx, source);
        return;
      case "abandon":
        for (const id of cards[index] ?? []) abandonCharacter(ctx, side, id);
        return;
      case "discard":
        for (const id of cards[index] ?? []) discardCard(ctx, side, id);
        return;
    }
  });
}
