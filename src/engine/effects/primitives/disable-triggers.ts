import type { CharacterRef, Condition, Duration } from "../../dsl/types";
import { startDuration } from "../../rules/durations";
import { addFloating } from "../../rules/floating";
import { resolveCharacters } from "../interpreter";
import { definePrimitive } from "../types";

/**
 * "This character's triggered abilities don't trigger" for `duration`, and
 * only while `while` holds when given: matching skips them.
 */
export interface DisableTriggersNode {
  readonly op: "disableTriggers";
  readonly subject: CharacterRef;
  readonly duration: Duration;
  readonly while: Condition | null;
}

export const disableTriggersPrimitive = definePrimitive<DisableTriggersNode>({
  op: "disableTriggers",
  targets: (node) => (node.subject.kind === "target" ? [node.subject] : []),
  resolve(ctx, node, env) {
    const ids = resolveCharacters(ctx, node.subject, env);
    if (ids.length === 0) return;
    const expiry = startDuration(ctx, node.duration, env.controller, env.source, ids);
    if (expiry === null) return;
    for (const instance of ids) {
      const change = node.while === null
        ? { kind: "disableTriggers" as const, instance }
        : { kind: "disableTriggers" as const, instance, while: node.while };
      addFloating(ctx, { controller: env.controller, source: env.source, expiry, change });
    }
  },
});

export function disableTriggers(subject: CharacterRef, duration: Duration, condition: Condition | null = null): DisableTriggersNode {
  return { op: "disableTriggers", subject, duration, while: condition };
}
