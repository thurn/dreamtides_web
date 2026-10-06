/**
 * Figments (rules § Figments): creating them, at capacity too, and merging
 * two with the same identity. A figment is a created character, so it
 * ceases to exist whenever it leaves play (rules/zones.ts).
 */
import { printedCard, type EngineCatalog } from "../catalog";
import { characteristicsOf } from "../continuous/characteristics";
import type { Variant } from "../dsl/types";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState, CardInstance, Printing } from "../state/types";
import type { StepContext } from "../steps/types";
import { ceaseToExist, createInPlay, instanceOf, isFigment, leftmostOpenBackSlot, openBackSlots } from "./zones";

/** A figment printing's base spark: the spark its text gave it, or a figment copy's copied base spark. */
function baseSparkOf(catalog: EngineCatalog, printing: Printing): number {
  const spark = printing.kind === "card" ? null : printing.spark;
  if (spark !== null) return spark;
  const printed = printedCard(catalog, printing).spark;
  return typeof printed === "number" ? printed : 0;
}

/** The printing with its base spark set to `spark`. */
function withSpark(printing: Printing, spark: number): Printing {
  return printing.kind === "card" ? printing : { ...printing, spark };
}

/**
 * Materializes `count` figments of one identity under `side`, one group of an
 * effect's output (rules § Creating Figments at Capacity). They fill the open
 * back-rank positions left to right. If all fit, each keeps its spark;
 * otherwise the group's total spark is divided as evenly as possible among
 * those that fit, the remainder going left to right. Figments already in play
 * are never merged into. With no open position, none is created. Returns the
 * created figments.
 */
export function createFigments(ctx: StepContext, side: Side, printing: Printing, variant: Variant, count: number): InstanceId[] {
  if (count <= 0) return [];
  const fit = Math.min(count, openBackSlots(ctx.state, side));
  if (fit < count) ctx.emit({ kind: "capacityReached", side, instance: null, missing: count - fit });
  const total = baseSparkOf(ctx.catalog, printing) * count;
  const created: InstanceId[] = [];
  for (let index = 0; index < fit; index++) {
    const slot = leftmostOpenBackSlot(ctx.state, side);
    if (slot === null) break;
    const share = fit === count ? null : Math.floor(total / fit) + (index < total % fit ? 1 : 0);
    created.push(createInPlay(ctx, share === null ? printing : withSpark(printing, share), side, variant, slot));
  }
  return created;
}

/** Whether two figments have the same identity: the same figment type, or figment copies of the same card UUID (C5). */
function sameIdentity(a: CardInstance, b: CardInstance): boolean {
  const x = a.printing;
  const y = b.printing;
  if (x.kind === "figment") return y.kind === "figment" && x.figment === y.figment;
  if (x.kind === "figmentCopy") return y.kind === "figmentCopy" && x.cardId === y.cardId;
  return false;
}

/**
 * Whether dragging `source` onto `destination` merges them (rules § Merging
 * Figments): two figments in play that one side controls, with the same
 * identity. A merge is legal only when both are exhausted or neither is.
 */
export function mergeable(state: BattleState, source: InstanceId, destination: InstanceId): boolean {
  const a = state.instances[source];
  const b = state.instances[destination];
  return (
    a !== undefined && b !== undefined && source !== destination &&
    a.zone === "play" && b.zone === "play" && a.controller === b.controller &&
    isFigment(a) && isFigment(b) && sameIdentity(a, b)
  );
}

/**
 * Merges `source` into `destination`: `source` ceases to exist without being
 * dissolved or banished and without triggering anything, and its current
 * spark — base spark after base-spark setting plus permanent gained spark,
 * never Support, anthems, or other static spark — is permanently added to
 * `destination`.
 */
export function mergeFigments(ctx: StepContext, source: InstanceId, destination: InstanceId): void {
  const { state, catalog } = ctx;
  const from = instanceOf(state, source);
  const spark = (characteristicsOf(state, catalog, source).baseSpark ?? 0) + from.status.gainedSpark;
  const side = from.controller;
  instanceOf(state, destination).status.gainedSpark += spark;
  ceaseToExist(ctx, source, { silent: true });
  ctx.emit({ kind: "figmentsMerged", side, source, destination, spark });
}
