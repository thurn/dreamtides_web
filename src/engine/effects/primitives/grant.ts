import type { CharacterRef, Duration, Keyword } from "../../dsl/types";
import { startContinuous } from "../../continuous/resolve";
import { resolveCharacters } from "../interpreter";
import { definePrimitive } from "../types";

/**
 * "… gains Vengeful" or, with `gains: false`, "… loses Vengeful" (layer 3).
 * Gains and losses apply in timestamp order, so the latest decides.
 * `duration` `null` takes the enclosing `forDuration`'s, else lasts
 * permanently.
 */
export interface GrantNode {
  readonly op: "grant";
  readonly subject: CharacterRef;
  readonly keyword: Keyword;
  readonly gains: boolean;
  readonly duration: Duration | null;
}

export const grantPrimitive = definePrimitive<GrantNode>({
  op: "grant",
  targets: (node) => (node.subject.kind === "target" ? [node.subject] : []),
  resolve(ctx, node, env) {
    const ids = resolveCharacters(ctx, node.subject, env);
    const { keyword, gains } = node;
    startContinuous(ctx, env, node.duration, ids, ids.map((instance) => ({ kind: "keyword", instance, keyword, gains })));
  },
  continuous: {
    layer: 3,
    changes(node, env) {
      const { keyword, gains } = node;
      return env.characters(node.subject).map((instance) => ({ kind: "keyword", instance, keyword, gains }));
    },
  },
});

export function grant(subject: CharacterRef, keyword: Keyword, duration: Duration | null = null): GrantNode {
  return { op: "grant", subject, keyword, gains: true, duration };
}

export function loseKeyword(subject: CharacterRef, keyword: Keyword, duration: Duration | null = null): GrantNode {
  return { op: "grant", subject, keyword, gains: false, duration };
}
