// The dialogue runtime (decision P17): which node a conversation opens on and
// which of a node's choices show. Position is view state: the caller holds
// the current node, and these functions only read the run.

import type {
  D97DialogueChoice,
  D97DialogueModule,
  D97DialogueNode,
} from "../../content/d97/dialogue/schema";
import type { D97DialogueNodeId } from "../../types/identifiers";
import { holds, type D97DialogueContext } from "./conditions";

/** The node with `id` in `module`, or null. */
export function dialogueNode(module: D97DialogueModule, id: D97DialogueNodeId): D97DialogueNode | null {
  return module.nodes.find((candidate) => candidate.id === id) ?? null;
}

/** The node a conversation opens on: the first entry that holds. */
export function openingNode(module: D97DialogueModule, context: D97DialogueContext): D97DialogueNode | null {
  const entry = module.entries.find((candidate) => holds(candidate.condition, context));
  return entry === undefined ? null : dialogueNode(module, entry.node);
}

/** A choice the player can take, with its index in its node. */
export interface D97VisibleChoice {
  readonly index: number;
  readonly choice: D97DialogueChoice;
}

/** `node`'s choices whose conditions hold, in authored order. */
export function visibleChoices(node: D97DialogueNode, context: D97DialogueContext): D97VisibleChoice[] {
  return node.choices.flatMap((choice, index) => (holds(choice.condition, context) ? [{ index, choice }] : []));
}
