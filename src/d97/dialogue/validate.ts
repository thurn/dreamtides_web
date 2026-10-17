// The D97 dialogue validator (decision P17): pure rules over every
// registered dialogue module, quest and item, each returning structured
// findings. `npm run d97:dialogue -- validate` formats and prints them and
// exits non-zero on any. Rules:
//
//   duplicate-id       a dialogue, node, quest, step or item id repeats
//   default-entry      a module has no entries, or its last entry is conditional
//   dangling-node      an entry or choice names a node its module lacks
//   unreachable-node   no entry or choice path reaches a node
//   dangling-quest     a condition or effect names an unregistered quest
//   dangling-step      a condition or effect names a step its quest lacks
//   dangling-item      a condition, effect or quest names an unregistered item
//   dangling-anchor    a condition or quest names an anchor no map holds
//   dangling-flag      a condition tests a flag no effect ever sets
//   illegal-effect     an effect its speaker's anchor kind may not carry
//   condition-type     a condition of an unknown kind or status, or with bad bounds
//   quest-shape        a quest's steps, anchors or items do not fit its kind

import type {
  D97DialogueCondition,
  D97DialogueContent,
  D97DialogueEffect,
  D97DialogueModule,
  D97DialogueNode,
  D97QuestDefinition,
  D97QuestKind,
  D97QuestStepKind,
} from "../../content/d97/dialogue/schema";
import type { DreamAnchorKind } from "../map/definition";
import type {
  D97DialogueId,
  D97FlagId,
  D97ItemId,
  D97QuestId,
  D97QuestStepId,
  DreamAnchorId,
} from "../../types/identifiers";
import { LEGAL_EFFECTS } from "./effects";

export type D97DialogueRule =
  | "duplicate-id"
  | "default-entry"
  | "dangling-node"
  | "unreachable-node"
  | "dangling-quest"
  | "dangling-step"
  | "dangling-item"
  | "dangling-anchor"
  | "dangling-flag"
  | "illegal-effect"
  | "condition-type"
  | "quest-shape";

export interface D97DialogueFinding {
  readonly rule: D97DialogueRule;
  /** The dialogue module or quest the finding is in. */
  readonly subject: {
    readonly kind: "dialogue" | "quest" | "item";
    readonly id: D97DialogueId | D97QuestId | D97QuestStepId | D97ItemId;
  };
  /** The offending reference (an id, a kind or a status). */
  readonly ref: string;
}

export interface D97DialogueValidationInput {
  readonly contents: readonly D97DialogueContent[];
  /** Every anchor the registered maps hold, with its kind. */
  readonly anchors: ReadonlyMap<DreamAnchorId, DreamAnchorKind>;
}

const QUEST_STATUSES: ReadonlySet<string> = new Set(["available", "active", "ready", "completed"]);
const STEP_STATUSES: ReadonlySet<string> = new Set(["pending", "current", "done"]);
const CONDITION_KINDS: ReadonlySet<string> = new Set([
  "all",
  "any",
  "not",
  "quest",
  "questStep",
  "questHeld",
  "flag",
  "act",
  "anchorBeaten",
  "hasItem",
  "collection",
]);

/** The step kind each quest kind is built around. */
const QUEST_KIND_STEP: Readonly<Record<D97QuestKind, D97QuestStepKind>> = {
  defeat: "defeat",
  lostObject: "findObject",
  errand: "visit",
  delivery: "deliver",
};

/** The anchor kinds each step kind may target. */
const STEP_ANCHOR_KINDS: Readonly<Record<D97QuestStepKind, ReadonlySet<DreamAnchorKind>>> = {
  defeat: new Set(["challenger", "guardian"]),
  findObject: new Set(["object"]),
  visit: new Set(["friendly", "townsfolk", "shop"]),
  deliver: new Set(["friendly", "townsfolk", "shop"]),
};
const GIVER_KINDS: ReadonlySet<DreamAnchorKind> = new Set(["friendly"]);
const TURN_IN_KINDS: ReadonlySet<DreamAnchorKind> = new Set(["friendly", "shop"]);

interface Registry {
  readonly quests: ReadonlyMap<D97QuestId, D97QuestDefinition>;
  readonly items: ReadonlySet<D97ItemId>;
  readonly anchors: ReadonlyMap<DreamAnchorId, DreamAnchorKind>;
  readonly setFlags: ReadonlySet<D97FlagId>;
}

type Report = (rule: D97DialogueRule, ref: string) => void;

function isCount(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function checkBounds(min: unknown, max: unknown, report: Report): void {
  if (min !== undefined && !isCount(min)) report("condition-type", JSON.stringify(min));
  if (max !== undefined && !isCount(max)) report("condition-type", JSON.stringify(max));
  if (typeof min === "number" && typeof max === "number" && min > max) report("condition-type", `${String(min)}>${String(max)}`);
}

function checkQuestRef(
  registry: Registry,
  questId: D97QuestId,
  stepId: D97QuestStepId | undefined,
  report: Report,
): void {
  const quest = registry.quests.get(questId);
  if (quest === undefined) {
    report("dangling-quest", questId);
    return;
  }
  if (stepId !== undefined && !quest.steps.some((step) => step.id === stepId)) report("dangling-step", stepId);
}

function checkCondition(condition: D97DialogueCondition, registry: Registry, report: Report): void {
  const declared: unknown = condition.kind;
  if (typeof declared !== "string" || !CONDITION_KINDS.has(declared)) {
    report("condition-type", JSON.stringify(declared));
    return;
  }
  switch (condition.kind) {
    case "all":
    case "any":
      if (condition.conditions.length === 0) report("condition-type", condition.kind);
      for (const part of condition.conditions) checkCondition(part, registry, report);
      return;
    case "not":
      checkCondition(condition.condition, registry, report);
      return;
    case "quest":
      if (!QUEST_STATUSES.has(condition.status)) report("condition-type", condition.status);
      checkQuestRef(registry, condition.questId, undefined, report);
      return;
    case "questStep":
      if (!STEP_STATUSES.has(condition.status)) report("condition-type", condition.status);
      checkQuestRef(registry, condition.questId, condition.stepId, report);
      return;
    case "questHeld":
      if (typeof condition.held !== "boolean") report("condition-type", "held");
      return;
    case "flag":
      if (typeof condition.set !== "boolean") report("condition-type", "set");
      if (!registry.setFlags.has(condition.flagId)) report("dangling-flag", condition.flagId);
      return;
    case "act":
      checkBounds(condition.min, condition.max, report);
      return;
    case "anchorBeaten": {
      const anchorKind = registry.anchors.get(condition.anchorId);
      if (anchorKind === undefined) report("dangling-anchor", condition.anchorId);
      else if (!STEP_ANCHOR_KINDS.defeat.has(anchorKind)) report("condition-type", anchorKind);
      return;
    }
    case "hasItem":
      if (!registry.items.has(condition.itemId)) report("dangling-item", condition.itemId);
      return;
    case "collection":
      if (!isCount(condition.atLeast)) report("condition-type", String(condition.atLeast));
      if (condition.trait.kind === "cost") checkBounds(condition.trait.min, condition.trait.max, report);
      return;
  }
}

function checkEffect(effect: D97DialogueEffect, module: D97DialogueModule, registry: Registry, report: Report): void {
  if (!LEGAL_EFFECTS[module.speaker.kind].has(effect.kind)) report("illegal-effect", effect.kind);
  switch (effect.kind) {
    case "offerQuest":
    case "completeQuest":
      checkQuestRef(registry, effect.questId, undefined, report);
      return;
    case "advanceQuest": {
      checkQuestRef(registry, effect.questId, effect.stepId, report);
      const step = registry.quests.get(effect.questId)?.steps.find((candidate) => candidate.id === effect.stepId);
      // Only visit and deliver steps advance in conversation.
      if (step !== undefined && step.kind !== "visit" && step.kind !== "deliver") report("illegal-effect", step.kind);
      return;
    }
    case "giveItem":
    case "takeItem":
      if (!registry.items.has(effect.itemId)) report("dangling-item", effect.itemId);
      return;
    default:
      return;
  }
}

function checkDialogue(module: D97DialogueModule, registry: Registry, findings: D97DialogueFinding[]): void {
  const report: Report = (rule, ref) => findings.push({ rule, subject: { kind: "dialogue", id: module.id }, ref });
  const nodes = new Map<string, D97DialogueNode>(module.nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  for (const node of module.nodes) {
    if (seen.has(node.id)) report("duplicate-id", node.id);
    seen.add(node.id);
  }
  const last = module.entries[module.entries.length - 1];
  if (last === undefined || last.condition !== undefined) report("default-entry", module.id);
  const reached = new Set<string>();
  const queue: string[] = [];
  for (const entry of module.entries) {
    if (entry.condition !== undefined) checkCondition(entry.condition, registry, report);
    if (!nodes.has(entry.node)) report("dangling-node", entry.node);
    else queue.push(entry.node);
  }
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined || reached.has(id)) continue;
    reached.add(id);
    for (const choice of nodes.get(id)?.choices ?? []) {
      if (choice.next !== null && nodes.has(choice.next)) queue.push(choice.next);
    }
  }
  for (const node of module.nodes) {
    if (!reached.has(node.id)) report("unreachable-node", node.id);
    for (const choice of node.choices) {
      if (choice.condition !== undefined) checkCondition(choice.condition, registry, report);
      if (choice.effect !== undefined) checkEffect(choice.effect, module, registry, report);
      if (choice.next !== null && !nodes.has(choice.next)) report("dangling-node", choice.next);
    }
  }
}

function checkQuest(quest: D97QuestDefinition, registry: Registry, findings: D97DialogueFinding[]): void {
  const report: Report = (rule, ref) => findings.push({ rule, subject: { kind: "quest", id: quest.id }, ref });
  const anchorOf = (anchorId: DreamAnchorId, allowed: ReadonlySet<DreamAnchorKind>): void => {
    const kind = registry.anchors.get(anchorId);
    if (kind === undefined) report("dangling-anchor", anchorId);
    else if (!allowed.has(kind)) report("quest-shape", kind);
  };
  anchorOf(quest.giverAnchorId, GIVER_KINDS);
  anchorOf(quest.turnInAnchorId, TURN_IN_KINDS);
  for (const itemId of quest.carriedItemIds) {
    if (!registry.items.has(itemId)) report("dangling-item", itemId);
  }
  if (!quest.steps.some((step) => step.kind === QUEST_KIND_STEP[quest.kind])) report("quest-shape", quest.kind);
  for (const step of quest.steps) {
    anchorOf(step.anchorId, STEP_ANCHOR_KINDS[step.kind]);
    if (step.kind === "findObject" || step.kind === "deliver") {
      if (!registry.items.has(step.itemId)) report("dangling-item", step.itemId);
    }
    // A delivery carries what it delivers, unless an earlier step finds it.
    if (step.kind === "deliver" && !quest.carriedItemIds.includes(step.itemId)) {
      const found = quest.steps.some((other) => other.kind === "findObject" && other.itemId === step.itemId);
      if (!found) report("quest-shape", step.itemId);
    }
  }
}

function duplicates<T extends { readonly id: D97DialogueFinding["subject"]["id"] }>(
  values: readonly T[],
  kind: D97DialogueFinding["subject"]["kind"],
  findings: D97DialogueFinding[],
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) findings.push({ rule: "duplicate-id", subject: { kind, id: value.id }, ref: value.id });
    seen.add(value.id);
  }
}

/** Every finding over the registered dialogue content; none means valid. */
export function validateDialogueContent(input: D97DialogueValidationInput): D97DialogueFinding[] {
  const dialogues = input.contents.flatMap((content) => content.dialogues);
  const quests = input.contents.flatMap((content) => content.quests);
  const items = input.contents.flatMap((content) => content.items);
  const setFlags = new Set<D97FlagId>();
  for (const module of dialogues) {
    for (const node of module.nodes) {
      for (const choice of node.choices) {
        if (choice.effect?.kind === "setFlag") setFlags.add(choice.effect.flagId);
      }
    }
  }
  const registry: Registry = {
    quests: new Map(quests.map((quest) => [quest.id, quest])),
    items: new Set(items.map((item) => item.id)),
    anchors: input.anchors,
    setFlags,
  };
  const findings: D97DialogueFinding[] = [];
  duplicates(dialogues, "dialogue", findings);
  duplicates(quests, "quest", findings);
  duplicates(items, "item", findings);
  duplicates(quests.flatMap((quest) => quest.steps), "quest", findings);
  for (const module of dialogues) checkDialogue(module, registry, findings);
  for (const quest of quests) checkQuest(quest, registry, findings);
  return findings;
}
