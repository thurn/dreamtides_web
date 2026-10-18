// The dialogue validator's rules: the synthetic content passes every rule,
// the development fixtures pass, and each rule reports its own finding on a
// fixture that breaks it.

import { describe, expect, it } from "vitest";
import type {
  D97DialogueCondition,
  D97DialogueContent,
  D97DialogueModule,
  D97DialogueNode,
  D97QuestDefinition,
} from "../../content/d97/dialogue/schema";
import {
  parseD97DialogueId,
  parseD97DialogueNodeId,
  parseD97FlagId,
  parseD97ItemId,
  parseD97QuestId,
  parseD97QuestStepId,
  parseDreamAnchorId,
  type DreamAnchorId,
} from "../../types/identifiers";
import { testAvatarId } from "../../types/test-identities";
import type { DreamAnchorKind } from "../map/definition";
import { DEV_MAP_DEFINITION } from "../overworld/dev-map";
import { DEV_DIALOGUE_CONTENT } from "../overworld/dev-dialogue";
import {
  ANCHOR_KINDS,
  ANCHORS,
  DEFEAT_QUEST,
  DELIVERY_QUEST,
  GIVER_DIALOGUE,
  ITEMS,
  NODES,
  SYNTHETIC_CONTENT,
} from "./dialogue.fixtures";
import { validateDialogueContent, type D97DialogueRule } from "./validate";

const UNKNOWN = "ffffffff-0000-4000-8000-000000000001";

function rules(content: D97DialogueContent, anchors: ReadonlyMap<DreamAnchorId, DreamAnchorKind> = ANCHOR_KINDS): D97DialogueRule[] {
  return validateDialogueContent({ contents: [content], anchors }).map((finding) => finding.rule);
}

function withDialogue(change: (module: D97DialogueModule) => D97DialogueModule): D97DialogueContent {
  return { ...SYNTHETIC_CONTENT, dialogues: [change(GIVER_DIALOGUE)] };
}

function withQuest(quest: D97QuestDefinition): D97DialogueContent {
  return { ...SYNTHETIC_CONTENT, quests: SYNTHETIC_CONTENT.quests.map((other) => (other.id === quest.id ? quest : other)) };
}

/** The giver's dialogue with an extra unconditional node reached from the greeting. */
function withNode(node: D97DialogueNode): D97DialogueContent {
  return withDialogue((module) => ({
    ...module,
    nodes: [
      ...module.nodes.map((existing) =>
        existing.id === NODES.greet
          ? { ...existing, choices: [...existing.choices, { label: "More.", next: node.id }] }
          : existing,
      ),
      node,
    ],
  }));
}

function conditioned(condition: D97DialogueCondition): D97DialogueContent {
  return withNode({
    id: parseD97DialogueNodeId("00000006-0000-4000-8000-0000000000ff"),
    lines: ["?"],
    choices: [{ label: "?", condition, next: null }],
  });
}

describe("validateDialogueContent", () => {
  it("passes the synthetic content, an empty catalog and the development fixtures", () => {
    expect(rules(SYNTHETIC_CONTENT)).toEqual([]);
    expect(rules({ dialogues: [], quests: [], items: [] })).toEqual([]);
    const devAnchors = new Map<DreamAnchorId, DreamAnchorKind>(
      DEV_MAP_DEFINITION.anchors.map((anchor) => [anchor.id, anchor.kind]),
    );
    expect(rules(DEV_DIALOGUE_CONTENT, devAnchors)).toEqual([]);
  });

  it("accepts per-incarnation dialogue: one module per Avatar an Avatar challenger may appear as", () => {
    const incarnation = (index: number): D97DialogueModule => {
      const greet = parseD97DialogueNodeId(`00000007-0000-4000-8000-${String(index).padStart(12, "0")}`);
      const beaten = parseD97DialogueNodeId(`00000008-0000-4000-8000-${String(index).padStart(12, "0")}`);
      return {
        id: parseD97DialogueId(`00000009-0000-4000-8000-${String(index).padStart(12, "0")}`),
        speaker: { name: "Avatar", kind: "challenger", avatarId: testAvatarId(`d97-incarnation-${String(index)}`) },
        entries: [{ condition: { kind: "anchorBeaten", anchorId: ANCHORS.challenger, beaten: true }, node: beaten }, { node: greet }],
        nodes: [
          { id: greet, lines: ["…"], choices: [{ label: "…", effect: { kind: "startChallenge" }, next: null }] },
          { id: beaten, lines: ["…"], choices: [] },
        ],
      };
    };
    expect(rules({ ...SYNTHETIC_CONTENT, dialogues: [...SYNTHETIC_CONTENT.dialogues, incarnation(1), incarnation(2)] })).toEqual([]);
  });

  it("duplicate-id: a repeated node id", () => {
    expect(rules(withDialogue((module) => ({ ...module, nodes: [...module.nodes, module.nodes[2]] })))).toContain(
      "duplicate-id",
    );
  });

  it("default-entry: the last entry is conditional", () => {
    expect(
      rules(withDialogue((module) => ({ ...module, entries: module.entries.slice(0, 1) }))),
    ).toContain("default-entry");
  });

  it("dangling-node: a choice names a missing node", () => {
    const missing = parseD97DialogueNodeId(UNKNOWN);
    expect(
      rules(withDialogue((module) => ({ ...module, entries: [...module.entries.slice(0, 1), { node: missing }] }))),
    ).toContain("dangling-node");
  });

  it("unreachable-node: no path reaches a node", () => {
    expect(
      rules(
        withDialogue((module) => ({
          ...module,
          nodes: [...module.nodes, { id: parseD97DialogueNodeId(UNKNOWN), lines: ["…"], choices: [] }],
        })),
      ),
    ).toEqual(["unreachable-node"]);
  });

  it("dangling-quest and dangling-step: unknown quests and steps", () => {
    expect(rules(conditioned({ kind: "quest", questId: parseD97QuestId(UNKNOWN), status: "active" }))).toEqual([
      "dangling-quest",
    ]);
    expect(
      rules(
        conditioned({
          kind: "questStep",
          questId: DEFEAT_QUEST.id,
          stepId: parseD97QuestStepId(UNKNOWN),
          status: "current",
        }),
      ),
    ).toEqual(["dangling-step"]);
  });

  it("dangling-item: an unknown item", () => {
    expect(rules(conditioned({ kind: "hasItem", itemId: parseD97ItemId(UNKNOWN), held: true }))).toEqual([
      "dangling-item",
    ]);
  });

  it("dangling-anchor: an anchor no map holds", () => {
    expect(rules(conditioned({ kind: "anchorBeaten", anchorId: parseDreamAnchorId(UNKNOWN), beaten: true }))).toEqual([
      "dangling-anchor",
    ]);
    expect(rules(withQuest({ ...DEFEAT_QUEST, giverAnchorId: parseDreamAnchorId(UNKNOWN) }))).toEqual([
      "dangling-anchor",
    ]);
  });

  it("dangling-flag: a tested flag nothing sets", () => {
    expect(rules(conditioned({ kind: "flag", flagId: parseD97FlagId(UNKNOWN), set: true }))).toEqual(["dangling-flag"]);
  });

  it("illegal-effect: an effect the speaker's anchor kind may not carry", () => {
    const townsfolk = withDialogue((module) => ({ ...module, speaker: { name: "T", kind: "townsfolk" } }));
    expect(rules(townsfolk)).toEqual(["illegal-effect"]);
    expect(
      rules(
        withNode({
          id: parseD97DialogueNodeId(UNKNOWN),
          lines: ["…"],
          choices: [{ label: "Fight", effect: { kind: "startChallenge" }, next: null }],
        }),
      ),
    ).toEqual(["illegal-effect"]);
  });

  it("condition-type: bad bounds, counts, statuses and kinds", () => {
    expect(rules(conditioned({ kind: "act", min: 3, max: 1 }))).toEqual(["condition-type"]);
    expect(rules(conditioned({ kind: "collection", trait: { kind: "rarity", rarity: "Rare" }, atLeast: -1 }))).toEqual([
      "condition-type",
    ]);
    expect(rules(conditioned({ kind: "all", conditions: [] }))).toEqual(["condition-type"]);
    const badStatus = JSON.parse(
      JSON.stringify({ kind: "quest", questId: DEFEAT_QUEST.id, status: "finished" }),
    ) as D97DialogueCondition;
    expect(rules(conditioned(badStatus))).toEqual(["condition-type"]);
    const badKind = JSON.parse(JSON.stringify({ kind: "weather" })) as D97DialogueCondition;
    expect(rules(conditioned(badKind))).toEqual(["condition-type"]);
    expect(rules(conditioned({ kind: "anchorBeaten", anchorId: ANCHORS.giver, beaten: true }))).toEqual([
      "condition-type",
    ]);
  });

  it("quest-shape: steps, anchors and items that do not fit the kind", () => {
    expect(rules(withQuest({ ...DEFEAT_QUEST, kind: "errand" }))).toEqual(["quest-shape"]);
    expect(
      rules(withQuest({ ...DEFEAT_QUEST, steps: [{ ...DEFEAT_QUEST.steps[0], anchorId: ANCHORS.object }] })),
    ).toEqual(["quest-shape"]);
    expect(rules(withQuest({ ...DELIVERY_QUEST, carriedItemIds: [] }))).toEqual(["quest-shape"]);
    expect(rules(withQuest({ ...DEFEAT_QUEST, turnInAnchorId: ANCHORS.townsperson }))).toEqual(["quest-shape"]);
    expect(rules(withQuest({ ...DELIVERY_QUEST, carriedItemIds: [ITEMS.parcel, parseD97ItemId(UNKNOWN)] }))).toEqual([
      "dangling-item",
    ]);
  });
});
