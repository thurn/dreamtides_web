/**
 * Copies (rules § Keywords and Effects → Copy): copies of cards on the stack
 * (D15), figment copies of cards (C5), and created copies in a hand. Every
 * copy is a created card, so it ceases to exist instead of entering a deck, a
 * hand, a void, or the Banished zone (rules/zones.ts).
 */
import { printedCard, printedCardId } from "../catalog";
import { eventAbilities } from "../effects/abilities";
import { chooseOnResolution, purposeOf } from "../effects/interpreter";
import type { InstanceId, Side } from "../state/ids";
import type { Printing } from "../state/types";
import type { StepContext } from "../steps/types";
import { createFigments } from "./figments";
import { addFloating } from "./floating";
import { freeBackSlotsAfterStack } from "./timing";
import { copyChoices, createInstance, instanceOf } from "./zones";

/**
 * Copies the card `original` on the stack for `controller` (D15): the copy is
 * a created card directly above it, so it resolves first. It is not played
 * (no play triggers, play counts, or priority), keeps the original's X and
 * paid optional costs, and its controller may choose new modes and targets:
 * each choice is a prompt, answered automatically when it has one legal
 * answer, and a choice with no legal option keeps the original's. A copy of a
 * character is not created while its controller's back rank would be full.
 * Returns the copy, or `null` when the original is no longer on the stack.
 */
export function copyOnStack(ctx: StepContext, original: InstanceId, controller: Side): InstanceId | null {
  const { state, catalog } = ctx;
  const index = state.stack.findIndex((item) => item.kind === "card" && item.instance === original);
  const item = state.stack[index];
  if (item?.kind !== "card") return null;
  const source = instanceOf(state, original);
  const definition = printedCard(catalog, source.printing);
  if (definition.cardType === "character" && freeBackSlotsAfterStack(state, catalog, controller) <= 0) {
    ctx.emit({ kind: "capacityReached", side: controller, instance: null, missing: 1 });
    return null;
  }
  const copy = createInstance(ctx, source.printing, controller, source.variant, "stack");
  const abilities = eventAbilities(definition, source.variant);
  const choices = abilities.map(
    (ability, position) =>
      chooseOnResolution(ctx, ability.effect, controller, copy.id, (role) => purposeOf(copy.id, printedCardId(copy.printing), ability.ability, role)) ??
      item.choices[position] ?? { modes: [], targets: [] },
  );
  state.stack.splice(index + 1, 0, {
    kind: "card",
    instance: copy.id,
    controller,
    choices: choices.map(copyChoices),
    x: item.x,
    optionalPaid: [...item.optionalPaid],
  });
  ctx.emit({ kind: "cardCopied", side: controller, original, copy: copy.id });
  return copy.id;
}

/**
 * The printing of a figment copy of a card with `printing` (C5): the card's
 * copiable values, a figment's type and spark, with base spark 0 for a "0✦
 * figment copy".
 */
function figmentCopyPrinting(printing: Printing, zeroSpark: boolean): Printing {
  switch (printing.kind) {
    case "card":
      return { kind: "figmentCopy", cardId: printing.cardId, spark: zeroSpark ? 0 : null };
    case "figment":
    case "figmentCopy":
      return zeroSpark ? { ...printing, spark: 0 } : printing;
  }
}

/**
 * Materializes a figment copy of `of` under `side` (C5): it copies the
 * card's subtype, abilities, cost, and base spark for its variant, never its
 * gained spark, counters, or statuses, and is a figment in every other
 * respect. A `temporary` copy ("until end of turn") ceases to exist during
 * that turn's Ending. Not created while the back rank is full.
 */
export function createFigmentCopy(ctx: StepContext, of: InstanceId, side: Side, zeroSpark: boolean, temporary: boolean): InstanceId | null {
  const source = instanceOf(ctx.state, of);
  const [copy] = createFigments(ctx, side, figmentCopyPrinting(source.printing, zeroSpark), source.variant, 1);
  if (copy === undefined) return null;
  if (temporary) {
    addFloating(ctx, { controller: side, source: copy, expiry: { at: "endOfTurn" }, change: { kind: "temporary", instance: copy } });
  }
  return copy;
}

/**
 * Creates a copy of the card `of` in `side`'s hand, Ephemeral if `ephemeral`
 * (C3). A figment, which exists only in play, has no copy in a hand.
 */
export function createCopyInHand(ctx: StepContext, of: InstanceId, side: Side, ephemeral: boolean): InstanceId | null {
  const source = instanceOf(ctx.state, of);
  if (source.printing.kind !== "card") return null;
  const copy = createInstance(ctx, source.printing, side, source.variant, "hand");
  copy.status.ephemeral = ephemeral;
  ctx.state.sides[side].hand.push(copy.id);
  return copy.id;
}
