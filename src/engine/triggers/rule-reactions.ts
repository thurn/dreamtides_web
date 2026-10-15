/** Retained knowledge of identifiable rule reactions at observable boundaries. */
import type { EngineCatalog } from "../catalog";
import { sourcePrivacy, seenSource } from "../events/sources";
import { originAbilities } from "../rules/activation";
import type { AbilitySource, Side } from "../state/ids";
import { SIDES } from "../state/ids";
import type { AbilityOrigin, QueuedTrigger } from "../state/types";
import type { StepContext } from "../steps/types";
import { observeFirstOccurrences } from "./first-time-each-turn";

/** A saved reference may be absent; only the catalog lookup is fallible inspection. */
function catalogReferenceExists(lookup: () => unknown): boolean {
  try {
    lookup();
    return true;
  } catch {
    return false;
  }
}

/** Check references before reading abilities, whose authored failures still propagate. */
function originPresent(catalog: EngineCatalog, origin: AbilityOrigin): boolean {
  switch (origin.kind) {
    case "card":
      return catalogReferenceExists(() => catalog.card(origin.cardId)) && (origin.gained ?? []).every(group =>
        "figment" in group
          ? catalogReferenceExists(() => catalog.figment(group.figment))
          : catalogReferenceExists(() => catalog.card(group.cardId)));
    case "figment": return catalogReferenceExists(() => catalog.figment(origin.id));
    case "avatar": return catalogReferenceExists(() => catalog.avatar(origin.id));
    case "dreamsign": return catalogReferenceExists(() => catalog.dreamsign(origin.id));
    case "dreamwell": return catalogReferenceExists(() => catalog.dreamwellCard(origin.id));
  }
}

/** A private or unidentified source discloses no ability classification. */
export function sourceObserved(ctx: Pick<StepContext, "state">, source: AbilitySource, viewer: Side): boolean {
  const holder = sourcePrivacy(source, ctx.state);
  return (holder === null || holder === viewer) && seenSource(source, viewer, ctx.state) !== null;
}

/** Observation raises only a viewer's lower bound; authoritative admissions stay unchanged. */
export function observeRuleReactions(ctx: Pick<StepContext, "state" | "catalog">, triggers: readonly QueuedTrigger[] = ctx.state.triggerQueue): void {
  observeFirstOccurrences(ctx, triggers, sourceObserved, originPresent);
  const progress = ctx.state.turnLog.dawnProgress;
  if (progress === undefined) return;
  for (const trigger of triggers) {
    if (trigger.kind !== "ruleReaction") continue;
    const viewers = SIDES.filter(viewer => sourceObserved(ctx, trigger.source, viewer));
    if (viewers.length === 0) continue;
    if (!originPresent(ctx.catalog, trigger.origin)) continue;
    const definition = originAbilities(ctx.catalog, trigger.origin)[trigger.ability];
    if (definition?.kind !== "static" || definition.effect.op !== "ruleModifier" || definition.effect.rule !== "dawnThreshold") continue;
    const root = definition.effect;
    for (const viewer of viewers) progress.known[viewer] = Math.max(progress.known[viewer], root.count);
  }
}
