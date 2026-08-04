import { describe, expect, it } from "vitest";
import { createDefaultBattleCardStatus } from "../state/create-initial-state";
import type {
  BattleCardInstance,
  BattleCardKind,
  BattleCardStatus,
  BattleMutableState,
  BattleSide,
  BattleSideMutableState,
  FrontRankSlotId,
} from "../types";
import { backRankSlotIds, createEmptySlotRecord, frontRankSlotIds } from "../types";
import {
  hasCombatKeyword,
  resolveChallenge,
  type ChallengeResolution,
} from "./challenge";

function makeInstance(
  battleCardId: string,
  options: {
    owner: BattleSide;
    kind?: BattleCardKind;
    printedSpark?: number;
    sparkDelta?: number;
    renderedText?: string;
    subtype?: string;
    isFigment?: boolean;
    /** Member sparks for a figment stack; overrides printedSpark/figmentCount. */
    figmentSparks?: number[];
    figmentCount?: number;
    status?: Partial<BattleCardStatus>;
  },
): BattleCardInstance {
  const figments = options.isFigment
    ? options.figmentSparks ??
      Array.from({ length: options.figmentCount ?? 1 }, () => options.printedSpark ?? 0)
    : undefined;
  return {
    battleCardId,
    definition: {
      sourceDeckEntryId: null,
      cardId: "",
      cardNumber: 1,
      name: battleCardId,
      battleCardKind: options.kind ?? "character",
      subtype: options.subtype ?? "Warrior",
      energyCost: 0,
      printedEnergyCost: 0,
      printedSpark: options.printedSpark ?? 0,
      isFast: false,
      reclaimCost: null,
      renderedText: options.renderedText ?? "",
      imageNumber: 1,
      transfiguration: null,
      isBane: false,
    },
    owner: options.owner,
    controller: options.owner,
    figments,
    sparkDelta: options.sparkDelta ?? 0,
    staticSparkBonus: 0,
    isRevealedToPlayer: true,
    status: { ...createDefaultBattleCardStatus(), ...options.status },
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: {
      kind: options.isFigment ? "generated-figment" : "journey-deck",
      sourceBattleCardId: null,
      chosenSpark: null,
      chosenSubtype: null,
      createdAtTurnNumber: null,
      createdAtSide: null,
      createdAtMs: null,
    },
  };
}

function emptySide(overrides: Partial<BattleSideMutableState> = {}): BattleSideMutableState {
  return {
    currentEnergy: 0,
    maxEnergy: 0,
    score: 0,
    visibility: {},
    deck: [],
    hand: [],
    void: [],
    banished: [],
    backRank: createEmptySlotRecord(backRankSlotIds(13)),
    frontRank: createEmptySlotRecord(frontRankSlotIds(12)),
    fatigueCount: 0,
    dreamwellCardIndex: null,
    dreamwellDrawnTurn: null,
    ...overrides,
  };
}

function frontRank(
  entries: Partial<Record<FrontRankSlotId, string | null>>,
): Record<FrontRankSlotId, string | null> {
  return {
    ...createEmptySlotRecord(frontRankSlotIds(12)),
    ...entries,
  } as Record<FrontRankSlotId, string | null>;
}

function makeState(options: {
  activeSide?: BattleSide;
  player?: Partial<BattleSideMutableState>;
  enemy?: Partial<BattleSideMutableState>;
  instances?: BattleCardInstance[];
}): BattleMutableState {
  return {
    battleId: "battle-challenge-test",
    activeSide: options.activeSide ?? "player",
    turnNumber: 1,
    phase: "challenge",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: 0,
    nextBattleCardOrdinal: 100,
    sides: {
      player: emptySide(options.player),
      enemy: emptySide(options.enemy),
    },
    cardInstances: Object.fromEntries(
      (options.instances ?? []).map((instance) => [instance.battleCardId, instance]),
    ),
  };
}

/** The battleCardIds dissolved (moved to void) by a resolution. */
function dissolvedIds(resolution: ChallengeResolution): string[] {
  return resolution.dissolved.map((entry) => entry.battleCardId);
}

/** Build a single-lane (`F0`) blocked state with a player challenger + enemy blocker. */
function lane0State(
  challenger: BattleCardInstance,
  blocker: BattleCardInstance | null,
): BattleMutableState {
  const instances = blocker === null ? [challenger] : [challenger, blocker];
  return makeState({
    activeSide: "player",
    player: { frontRank: frontRank({ F0: challenger.battleCardId }) },
    enemy: { frontRank: frontRank({ F0: blocker?.battleCardId ?? null }) },
    instances,
  });
}

describe("resolveChallenge — plain spark comparison", () => {
  it("scores an unpaired challenger's spark for the active side", () => {
    const state = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 4 }),
      null,
    );
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(resolution.playerScoreDelta).toBe(4);
    expect(resolution.enemyScoreDelta).toBe(0);
    expect(resolution.edits).toContainEqual({
      kind: "ADJUST_SCORE",
      side: "player",
      amount: 4,
    });
    expect(dissolvedIds(resolution)).toEqual([]);
  });

  it("scores nothing for an empty lane or a blocker-only lane", () => {
    const blockerOnly = makeInstance("e0", { owner: "enemy", printedSpark: 9 });
    const state = makeState({
      activeSide: "player",
      enemy: { frontRank: frontRank({ F0: "e0" }) },
      instances: [blockerOnly],
    });
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(resolution.playerScoreDelta).toBe(0);
    expect(resolution.enemyScoreDelta).toBe(0);
    expect(resolution.edits).toEqual([]);
    expect(dissolvedIds(resolution)).toEqual([]);
  });

  it("dissolves the lower-spark character in a blocked lane", () => {
    const state = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 5 }),
      makeInstance("e0", { owner: "enemy", printedSpark: 3 }),
    );
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(dissolvedIds(resolution)).toEqual(["e0"]);
    expect(resolution.playerScoreDelta).toBe(0);
    expect(resolution.lanes[0].winner).toBe("player");
  });

  it("dissolves both characters on a spark tie", () => {
    const state = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 4 }),
      makeInstance("e0", { owner: "enemy", printedSpark: 4 }),
    );
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(dissolvedIds(resolution).sort()).toEqual(["e0", "p0"]);
    expect(resolution.lanes[0].winner).toBeNull();
  });

  it("includes sparkDelta in the effective spark", () => {
    const state = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 2, sparkDelta: 3 }),
      makeInstance("e0", { owner: "enemy", printedSpark: 4 }),
    );
    const resolution = resolveChallenge({ state, activeSide: "player" });
    // Effective player spark 5 > enemy 4 → enemy dissolves.
    expect(dissolvedIds(resolution)).toEqual(["e0"]);
  });

  it("resolves from the enemy's perspective when the enemy is active", () => {
    const state = makeState({
      activeSide: "enemy",
      enemy: { frontRank: frontRank({ F0: "e0" }) },
      instances: [makeInstance("e0", { owner: "enemy", printedSpark: 6 })],
    });
    const resolution = resolveChallenge({ state, activeSide: "enemy" });
    expect(resolution.enemyScoreDelta).toBe(6);
    expect(resolution.playerScoreDelta).toBe(0);
    expect(resolution.edits).toContainEqual({
      kind: "ADJUST_SCORE",
      side: "enemy",
      amount: 6,
    });
  });
});

describe("resolveChallenge — Preeminence", () => {
  it("lets a Preeminence character win a spark tie (printed text)", () => {
    const state = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 4, renderedText: "Preeminence" }),
      makeInstance("e0", { owner: "enemy", printedSpark: 4 }),
    );
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(dissolvedIds(resolution)).toEqual(["e0"]);
    expect(resolution.lanes[0].winner).toBe("player");
  });

  it("dissolves both when both have Preeminence on a tie", () => {
    const state = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 4, renderedText: "Preeminence" }),
      makeInstance("e0", { owner: "enemy", printedSpark: 4, renderedText: "Preeminence" }),
    );
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(dissolvedIds(resolution).sort()).toEqual(["e0", "p0"]);
  });

  it("does not save a Preeminence character that is strictly outsparked", () => {
    const state = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 3, renderedText: "Preeminence" }),
      makeInstance("e0", { owner: "enemy", printedSpark: 5 }),
    );
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(dissolvedIds(resolution)).toEqual(["p0"]);
  });
});

describe("resolveChallenge — Vengeful", () => {
  it("drags the winner down when the loser is Vengeful", () => {
    const state = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 5 }),
      makeInstance("e0", { owner: "enemy", printedSpark: 2, renderedText: "Vengeful" }),
    );
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(dissolvedIds(resolution).sort()).toEqual(["e0", "p0"]);
    // Both dissolve → no surviving winner.
    expect(resolution.lanes[0].winner).toBeNull();
  });

  it("does not trigger Vengeful when its bearer survives", () => {
    const state = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 5, renderedText: "Vengeful" }),
      makeInstance("e0", { owner: "enemy", printedSpark: 2 }),
    );
    // The Vengeful player character wins (5 > 2): only the enemy dissolves.
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(dissolvedIds(resolution)).toEqual(["e0"]);
    expect(resolution.lanes[0].winner).toBe("player");
  });
});

describe("resolveChallenge — Unstoppable", () => {
  it("scores a blocked Unstoppable challenger that survives", () => {
    const state = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 6, renderedText: "Unstoppable" }),
      makeInstance("e0", { owner: "enemy", printedSpark: 3 }),
    );
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(resolution.playerScoreDelta).toBe(6);
    expect(dissolvedIds(resolution)).toEqual(["e0"]);
    expect(resolution.lanes[0].scoreDelta).toBe(6);
  });

  it("does not score an Unstoppable challenger that dissolves", () => {
    const state = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 2, renderedText: "Unstoppable" }),
      makeInstance("e0", { owner: "enemy", printedSpark: 5 }),
    );
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(resolution.playerScoreDelta).toBe(0);
    expect(dissolvedIds(resolution)).toEqual(["p0"]);
  });

  it("scores a surviving Unstoppable blocker for the opposing side", () => {
    const state = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 2 }),
      makeInstance("e0", { owner: "enemy", printedSpark: 6, renderedText: "Unstoppable" }),
    );
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(resolution.enemyScoreDelta).toBe(6);
    expect(dissolvedIds(resolution)).toEqual(["p0"]);
    expect(resolution.edits).toContainEqual({
      kind: "ADJUST_SCORE",
      side: "enemy",
      amount: 6,
    });
  });
});

describe("resolveChallenge — Awakened has no challenge effect", () => {
  it("does not change scoring or dissolution for an Awakened character", () => {
    const withAwakened = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 3, renderedText: "Awakened" }),
      makeInstance("e0", { owner: "enemy", printedSpark: 5 }),
    );
    const without = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 3 }),
      makeInstance("e0", { owner: "enemy", printedSpark: 5 }),
    );
    const a = resolveChallenge({ state: withAwakened, activeSide: "player" });
    const b = resolveChallenge({ state: without, activeSide: "player" });
    expect(dissolvedIds(a)).toEqual(dissolvedIds(b));
    expect(a.playerScoreDelta).toBe(b.playerScoreDelta);
    expect(a.enemyScoreDelta).toBe(b.enemyScoreDelta);
  });
});

describe("resolveChallenge — keyword combinations", () => {
  it("Vengeful + Unstoppable: a Vengeful loser drags down a surviving Unstoppable, who then does not score", () => {
    const state = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 5, renderedText: "Unstoppable" }),
      makeInstance("e0", { owner: "enemy", printedSpark: 2, renderedText: "Vengeful" }),
    );
    const resolution = resolveChallenge({ state, activeSide: "player" });
    // Enemy loses (2 < 5) and Vengeful drags the player down too; both dissolve.
    expect(dissolvedIds(resolution).sort()).toEqual(["e0", "p0"]);
    // The Unstoppable challenger did NOT survive, so it scores nothing.
    expect(resolution.playerScoreDelta).toBe(0);
  });

  it("Preeminence saves a tied Unstoppable, which then scores", () => {
    const state = lane0State(
      makeInstance("p0", {
        owner: "player",
        printedSpark: 4,
        renderedText: "Unstoppable, Preeminence",
      }),
      makeInstance("e0", { owner: "enemy", printedSpark: 4 }),
    );
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(dissolvedIds(resolution)).toEqual(["e0"]);
    expect(resolution.playerScoreDelta).toBe(4);
  });
});

describe("resolveChallenge — figment stacks (rules §Figments)", () => {
  it("compares only the topmost figment, so a tall stack of small figments cannot dissolve a large blocker", () => {
    // Stack of three 2✦ figments (total 6). Only the topmost (2✦) fights the 3✦
    // blocker, so the topmost dissolves and the blocker survives.
    const figment = makeInstance("fig", {
      owner: "player",
      isFigment: true,
      figmentSparks: [2, 2, 2],
    });
    const blocker = makeInstance("e0", { owner: "enemy", printedSpark: 3 });
    const state = lane0State(figment, blocker);
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(dissolvedIds(resolution)).toEqual(["fig"]);
    // The two reserves (4✦) are unopposed and score; the contested topmost does not.
    expect(resolution.playerScoreDelta).toBe(4);
    expect(resolution.lanes[0].winner).toBe("enemy");
  });

  it("scores reserve figments while the topmost wins and survives", () => {
    // Three 4✦ Monstrosity figments. Topmost 4 > blocker 3 → blocker dissolves;
    // the topmost survives scoring nothing; the two reserves score 8⍟.
    const figment = makeInstance("fig", {
      owner: "player",
      isFigment: true,
      subtype: "Monstrosity",
      figmentSparks: [4, 4, 4],
    });
    const blocker = makeInstance("e0", { owner: "enemy", printedSpark: 3 });
    const state = lane0State(figment, blocker);
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(dissolvedIds(resolution)).toEqual(["e0"]);
    expect(resolution.playerScoreDelta).toBe(8);
  });

  it("scores the surviving Unstoppable topmost on top of the reserves", () => {
    // Two 4✦ Monstrosity figments granted Unstoppable. Topmost dissolves the 3✦ blocker and
    // survives, scoring 4⍟; the reserve scores 4⍟, for 8⍟ total.
    const figment = makeInstance("fig", {
      owner: "player",
      isFigment: true,
      subtype: "Monstrosity",
      figmentSparks: [4, 4],
      status: { grantedUnstoppable: true },
    });
    const blocker = makeInstance("e0", { owner: "enemy", printedSpark: 3 });
    const state = lane0State(figment, blocker);
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(dissolvedIds(resolution)).toEqual(["e0"]);
    expect(resolution.playerScoreDelta).toBe(8);
  });

  it("trades the topmost Wraith for the blocker via Vengeful and scores nothing", () => {
    // Three 0✦ Wraith figments (Vengeful) into a 5✦ blocker. The topmost is
    // dissolved and Vengeful drags the blocker down too; reserves score 0.
    const figment = makeInstance("fig", {
      owner: "player",
      isFigment: true,
      subtype: "Wraith",
      figmentSparks: [0, 0, 0],
    });
    const blocker = makeInstance("e0", { owner: "enemy", printedSpark: 5 });
    const state = lane0State(figment, blocker);
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(dissolvedIds(resolution).sort()).toEqual(["e0", "fig"]);
    expect(resolution.playerScoreDelta).toBe(0);
  });

  it("scores the whole stack when it challenges unopposed", () => {
    const figment = makeInstance("fig", {
      owner: "player",
      isFigment: true,
      figmentSparks: [2, 2, 2, 2],
    });
    const state = lane0State(figment, null);
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(resolution.playerScoreDelta).toBe(8);
    expect(dissolvedIds(resolution)).toEqual([]);
  });

  it("stack vs stack: only the challenging stack scores, by its reserves", () => {
    // Challenger topmost 3 beats blocker topmost 1: the blocker stack sheds its
    // topmost; the challenger's reserves (3✦) score. The blocker stack, blocking,
    // scores nothing.
    const challenger = makeInstance("fig", {
      owner: "player",
      isFigment: true,
      figmentSparks: [3, 3],
    });
    const blocker = makeInstance("e0", {
      owner: "enemy",
      isFigment: true,
      figmentSparks: [1, 1, 1],
    });
    const state = lane0State(challenger, blocker);
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(dissolvedIds(resolution)).toEqual(["e0"]);
    expect(resolution.playerScoreDelta).toBe(3);
    expect(resolution.enemyScoreDelta).toBe(0);
  });
});

describe("resolveChallenge — supportContribution", () => {
  it("raises a character over its blocker and flips the outcome", () => {
    const challenger = makeInstance("p0", { owner: "player", printedSpark: 3 });
    const blocker = makeInstance("e0", { owner: "enemy", printedSpark: 4 });
    const state = lane0State(challenger, blocker);

    // Without support: player 3 < enemy 4 → player dissolves.
    const baseline = resolveChallenge({ state, activeSide: "player" });
    expect(dissolvedIds(baseline)).toEqual(["p0"]);

    // With +2 support on p0: player 5 > enemy 4 → enemy dissolves instead.
    const supported = resolveChallenge({
      state,
      activeSide: "player",
      supportContribution: new Map([["p0", 2]]),
    });
    expect(dissolvedIds(supported)).toEqual(["e0"]);
  });

  it("adds support to an unpaired challenger's scored spark", () => {
    const state = lane0State(
      makeInstance("p0", { owner: "player", printedSpark: 3 }),
      null,
    );
    const resolution = resolveChallenge({
      state,
      activeSide: "player",
      supportContribution: new Map([["p0", 4]]),
    });
    expect(resolution.playerScoreDelta).toBe(7);
  });

  it("applies a stack's total support contribution once per figment", () => {
    const challenger = makeInstance("figments", {
      owner: "player",
      isFigment: true,
      figmentSparks: [2, 2],
    });
    const blocker = makeInstance("blocker", {
      owner: "enemy",
      printedSpark: 3,
    });
    const state = lane0State(challenger, blocker);

    const baseline = resolveChallenge({ state, activeSide: "player" });
    expect(dissolvedIds(baseline)).toEqual(["figments"]);

    const supported = resolveChallenge({
      state,
      activeSide: "player",
      // +2 per member across a two-figment stack.
      supportContribution: new Map([["figments", 4]]),
    });
    expect(dissolvedIds(supported)).toEqual(["blocker"]);
    expect(supported.lanes[0]?.playerSpark).toBe(4);
    expect(supported.playerScoreDelta).toBe(4);
  });
});

describe("resolveChallenge — multiple lanes", () => {
  it("resolves each front-rank lane independently and sums the score", () => {
    const state = makeState({
      activeSide: "player",
      player: {
        frontRank: frontRank({ F0: "p0", F1: "p1", F2: "p2" }),
      },
      enemy: {
        frontRank: frontRank({ F1: "e1", F2: "e2" }),
      },
      instances: [
        // F0: unpaired challenger scores 3.
        makeInstance("p0", { owner: "player", printedSpark: 3 }),
        // F1: player 6 > enemy 2 → enemy dissolves.
        makeInstance("p1", { owner: "player", printedSpark: 6 }),
        makeInstance("e1", { owner: "enemy", printedSpark: 2 }),
        // F2: player 1 < enemy 5 → player dissolves.
        makeInstance("p2", { owner: "player", printedSpark: 1 }),
        makeInstance("e2", { owner: "enemy", printedSpark: 5 }),
      ],
    });
    const resolution = resolveChallenge({ state, activeSide: "player" });
    expect(resolution.playerScoreDelta).toBe(3);
    expect(dissolvedIds(resolution).sort()).toEqual(["e1", "p2"]);
    // Lanes span every occupied lane (F0–F2 here); the play area grows without
    // bound, so empty trailing lanes beyond the last occupant are not resolved.
    expect(resolution.lanes).toHaveLength(3);
    expect(resolution.lanes[0].scoreDelta).toBe(3);
  });
});

describe("hasCombatKeyword — detection precedence", () => {
  it("detects a keyword granted by a status flag even with empty text", () => {
    const instance = makeInstance("p0", {
      owner: "player",
      status: { grantedUnstoppable: true },
    });
    expect(hasCombatKeyword(instance, "unstoppable")).toBe(true);
    expect(hasCombatKeyword(instance, "vengeful")).toBe(false);
  });

  it("detects each keyword from a printed-text scan", () => {
    expect(
      hasCombatKeyword(
        makeInstance("a", { owner: "player", renderedText: "This has Unstoppable here." }),
        "unstoppable",
      ),
    ).toBe(true);
    expect(
      hasCombatKeyword(
        makeInstance("b", { owner: "player", renderedText: "Vengeful." }),
        "vengeful",
      ),
    ).toBe(true);
    expect(
      hasCombatKeyword(
        makeInstance("c", { owner: "player", renderedText: "Preeminence" }),
        "preeminence",
      ),
    ).toBe(true);
    expect(
      hasCombatKeyword(
        makeInstance("d", { owner: "player", renderedText: "Awakened, Veil" }),
        "awakened",
      ),
    ).toBe(true);
  });

  it("does not match a keyword substring inside another word", () => {
    const instance = makeInstance("p0", {
      owner: "player",
      renderedText: "unstoppableX vengefulness",
    });
    expect(hasCombatKeyword(instance, "unstoppable")).toBe(false);
    expect(hasCombatKeyword(instance, "vengeful")).toBe(false);
  });

  it("detects a figment type's implicit keyword from its subtype", () => {
    const wraith = makeInstance("fig2", {
      owner: "player",
      isFigment: true,
      subtype: "Wraith",
    });
    expect(hasCombatKeyword(wraith, "vengeful")).toBe(true);

    // Monstrosity carries no inherent combat keyword.
    const monstrosity = makeInstance("fig3", {
      owner: "player",
      isFigment: true,
      subtype: "Monstrosity",
    });
    expect(hasCombatKeyword(monstrosity, "preeminence")).toBe(false);

    const ember = makeInstance("fig4", {
      owner: "player",
      isFigment: true,
      subtype: "Ember",
    });
    expect(hasCombatKeyword(ember, "awakened")).toBe(true);
  });

  it("does not read figment subtype keywords on a non-figment character", () => {
    const instance = makeInstance("p0", { owner: "player", subtype: "Wraith" });
    expect(hasCombatKeyword(instance, "vengeful")).toBe(false);
  });
});
