import { describe, expect, it } from "vitest";
import { reachableAtlasNodeIds } from "./atlas-generator";
import { makeTestAtlasNode } from "../__test-helpers__/atlas-fixtures";
import type { DreamAtlas, DreamscapeNode } from "../types/journey";
import { LayerName } from "../types/layer-name";
import { parseAtlasNodeId } from "../types/identifiers";
import { testAtlasNodeId } from "../types/test-identities";

type BranchNodeName = "start" | "a" | "b" | "c" | "d" | "e" | "boss";

/**
 * Builds a small three-choice atlas:
 *
 *   start ─┬─▶ a ─┬─▶ c ─▶ boss
 *          │      └─▶ d ─▶ boss
 *          └─▶ b ────▶ e ─▶ boss
 *
 * The `state` overrides model a run where the player entered `start`, chose `a`
 * over `b`, and now stands at the `c` / `d` frontier.
 */
function makeBranchingAtlas(
  states: Partial<Record<BranchNodeName, DreamscapeNode["state"]>>,
): DreamAtlas {
  const node = (
    name: BranchNodeName,
    layer: LayerName,
    forwardNames: readonly BranchNodeName[],
    state: DreamscapeNode["state"],
  ): DreamscapeNode =>
    makeTestAtlasNode(testAtlasNodeId(name), [], {
      layer,
      forwardIds: forwardNames.map(testAtlasNodeId),
      state,
    });

  const nodes: DreamscapeNode[] = [
    node("start", LayerName.One, ["a", "b"], states.start ?? "completed"),
    node("a", LayerName.Two, ["c", "d"], states.a ?? "completed"),
    node("b", LayerName.Two, ["e"], states.b ?? "forgone"),
    node("c", LayerName.Three, ["boss"], states.c ?? "available"),
    node("d", LayerName.Three, ["boss"], states.d ?? "available"),
    node("e", LayerName.Three, ["boss"], states.e ?? "revealedLocked"),
    node("boss", LayerName.Four, [], states.boss ?? "revealedLocked"),
  ];

  return {
    layers: [
      [parseAtlasNodeId("start")],
      [parseAtlasNodeId("a"), parseAtlasNodeId("b")],
      [parseAtlasNodeId("c"), parseAtlasNodeId("d"), parseAtlasNodeId("e")],
      [parseAtlasNodeId("boss")],
    ],
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    startingNodeId: parseAtlasNodeId("start"),
    bossNodeId: parseAtlasNodeId("boss"),
    currentNodeId: parseAtlasNodeId("a"),
    knownDreamsignCarrierIds: [],
  };
}

describe("reachableAtlasNodeIds", () => {
  it("keeps the traveled path and everything forward-reachable from the frontier", () => {
    const reachable = reachableAtlasNodeIds(makeBranchingAtlas({}));
    // start + a are completed; c + d are the available frontier; boss is reached
    // forward from c/d.
    expect([...reachable].sort()).toEqual(["a", "boss", "c", "d", "start"]);
  });

  it("excludes the forgone sibling passed by in an earlier layer", () => {
    const reachable = reachableAtlasNodeIds(makeBranchingAtlas({}));
    expect(reachable.has(testAtlasNodeId("b"))).toBe(false);
  });

  it("excludes a future node whose only route runs through a forgone node", () => {
    // `e` is only reachable from `b`, which was passed by, so it can never be
    // reached from the current frontier.
    const reachable = reachableAtlasNodeIds(makeBranchingAtlas({}));
    expect(reachable.has(testAtlasNodeId("e"))).toBe(false);
  });

  it("keeps the entire graph before the first choice", () => {
    // At the very start only the starter is available and every other node is
    // still ahead of the frontier, so nothing is hidden.
    const reachable = reachableAtlasNodeIds(
      makeBranchingAtlas({
        start: "available",
        a: "revealedLocked",
        b: "revealedLocked",
        c: "revealedLocked",
        d: "revealedLocked",
        e: "revealedLocked",
      }),
    );
    expect([...reachable].sort()).toEqual([
      "a",
      "b",
      "boss",
      "c",
      "d",
      "e",
      "start",
    ]);
  });

  it("keeps only the completed path once no frontier remains", () => {
    // After the boss is cleared nothing is `available`; only the traveled path
    // survives.
    const reachable = reachableAtlasNodeIds(
      makeBranchingAtlas({
        c: "completed",
        d: "forgone",
        boss: "completed",
      }),
    );
    expect([...reachable].sort()).toEqual(["a", "boss", "c", "start"]);
  });
});
