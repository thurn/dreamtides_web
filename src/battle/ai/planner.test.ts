import { describe, expect, it } from "vitest";
import { planNextAction, type PlannerOptions } from "./planner";
import { starterCardModels } from "./cards/index";
import type { AiCard, AiOpponentBody, ForwardModel } from "./forward-model";
import { DEPLOY_SLOT_IDS, RESERVE_SLOT_IDS } from "../types";

// --- Fixture helpers -------------------------------------------------------

function emptyDeployed(): ForwardModel["aiDeployed"] {
  return { D0: null, D1: null, D2: null, D3: null };
}

function emptyReserve(): ForwardModel["aiReserve"] {
  return { R0: null, R1: null, R2: null, R3: null, R4: null };
}

function baseModel(overrides: Partial<ForwardModel> = {}): ForwardModel {
  return {
    aiEnergy: 0,
    aiMaxEnergy: 10,
    aiScore: 0,
    playerScore: 0,
    aiHand: [],
    aiDeck: [],
    aiVoid: [],
    aiDeployed: emptyDeployed(),
    aiReserve: emptyReserve(),
    opponentBodies: [],
    opponentHandCount: 0,
    opponentVoidCount: 0,
    ...overrides,
  };
}

let nextId = 0;

function makeCard(overrides: Partial<AiCard> = {}): AiCard {
  nextId += 1;
  return {
    battleCardId: `card-${nextId}`,
    cardNumber: 999, // unmodeled vanilla body by default
    name: "Test Body",
    energyCost: 0,
    basePrintedSpark: 0,
    sparkDelta: 0,
    figmentCount: 1,
    canChallengeThisTurn: true,
    ...overrides,
  };
}

function opponentBody(overrides: Partial<AiOpponentBody> = {}): AiOpponentBody {
  nextId += 1;
  return {
    battleCardId: `opp-${nextId}`,
    effectiveSpark: 0,
    rank: "front",
    slot: "D0",
    isFigment: false,
    ...overrides,
  };
}

function defaultOptions(overrides: Partial<PlannerOptions> = {}): PlannerOptions {
  return {
    deadlineMs: 1_000_000,
    beamWidth: 12,
    opponentMode: "expectiminimax",
    sampleCap: 8,
    nowMs: 0,
    rngSeed: 12345,
    ...overrides,
  };
}

// Real-card fixtures, drawn from the AI's Starter pool so the planner's
// card-model lookups (canPlay / play / triggers) exercise real behavior.

function minstrel(): AiCard {
  // #510 Twilight Minstrel — 2●, 1✦, Support +2✦.
  return makeCard({ cardNumber: 510, name: "Twilight Minstrel", energyCost: 2, basePrintedSpark: 1 });
}

function colossus(): AiCard {
  // #515 Meadowforged Colossus — 6●, 6✦, +2✦ per supporting ally.
  return makeCard({ cardNumber: 515, name: "Meadowforged Colossus", energyCost: 6, basePrintedSpark: 6 });
}

function direwolf(): AiCard {
  // #512 Branded Direwolf — 4●, 4✦ vanilla.
  return makeCard({ cardNumber: 512, name: "Branded Direwolf", energyCost: 4, basePrintedSpark: 4 });
}

// --- Tests -----------------------------------------------------------------

describe("planNextAction", () => {
  describe("legality", () => {
    it("never returns a PLAY_CARD whose cost exceeds available energy", () => {
      // Hand full of cards the AI cannot afford.
      const fixtures: ForwardModel[] = [
        baseModel({
          aiEnergy: 1,
          aiHand: [minstrel(), direwolf(), colossus()],
        }),
        baseModel({
          aiEnergy: 3,
          aiHand: [colossus(), direwolf()],
          opponentBodies: [opponentBody({ effectiveSpark: 2 })],
        }),
        baseModel({
          aiEnergy: 0,
          aiHand: [minstrel()],
        }),
      ];

      for (const model of fixtures) {
        const action = planNextAction(model, defaultOptions());
        if (action.kind === "PLAY_CARD" && action.self !== undefined) {
          expect(action.self.energyCost).toBeLessThanOrEqual(model.aiEnergy);
        }
      }
    });

    it("never returns a MOVE_CARD into an occupied slot", () => {
      // A reserve challenger plus a full deployed rank: no legal move target.
      const ready = makeCard({
        cardNumber: 512,
        name: "Branded Direwolf",
        basePrintedSpark: 4,
        canChallengeThisTurn: true,
      });
      const model = baseModel({
        aiEnergy: 0,
        aiReserve: { ...emptyReserve(), R0: ready },
        aiDeployed: {
          D0: makeCard({ basePrintedSpark: 1 }),
          D1: makeCard({ basePrintedSpark: 1 }),
          D2: makeCard({ basePrintedSpark: 1 }),
          D3: makeCard({ basePrintedSpark: 1 }),
        },
      });
      const action = planNextAction(model, defaultOptions());
      expect(action.kind).not.toBe("MOVE_CARD");
    });

    it("a returned MOVE_CARD targets an empty, legal deploy slot from a ready reserve card", () => {
      const ready = makeCard({
        cardNumber: 512,
        name: "Branded Direwolf",
        basePrintedSpark: 4,
        canChallengeThisTurn: true,
      });
      const model = baseModel({
        aiEnergy: 0,
        aiReserve: { ...emptyReserve(), R0: ready },
        opponentBodies: [],
      });
      const action = planNextAction(model, defaultOptions());
      expect(action.kind).toBe("MOVE_CARD");
      expect(action.toSlot).toBeDefined();
      expect(DEPLOY_SLOT_IDS).toContain(action.toSlot);
      // Destination is empty in the source model.
      expect(model.aiDeployed[action.toSlot as "D0"]).toBeNull();
      expect(action.self?.battleCardId).toBe(ready.battleCardId);
    });

    it("over several re-plan steps every applied action stays legal", () => {
      // Drive a few re-plans by applying each returned action via its card model
      // and confirm no illegal proposal is ever produced.
      const model = baseModel({
        aiEnergy: 8,
        aiHand: [minstrel(), direwolf(), colossus()],
        opponentBodies: [opponentBody({ effectiveSpark: 1 })],
      });

      for (let step = 0; step < 6; step += 1) {
        const action = planNextAction(model, defaultOptions());
        if (action.kind === "END_TURN") {
          break;
        }
        if (action.kind === "PLAY_CARD") {
          expect(action.self).toBeDefined();
          const self = action.self as AiCard;
          expect(self.energyCost).toBeLessThanOrEqual(model.aiEnergy);
          const cardModel = starterCardModels.get(self.cardNumber);
          expect(cardModel).toBeDefined();
          // Apply against the live model, mirroring the driver's commit path.
          const targets = cardModel?.chooseTargets(model, self) ?? null;
          cardModel?.play(model, self, action.targets ?? targets);
          cardModel?.onMaterialized?.(model, self);
        } else if (action.kind === "MOVE_CARD") {
          const self = action.self as AiCard;
          const toSlot = action.toSlot as "D0";
          expect(model.aiDeployed[toSlot]).toBeNull();
          // Apply the move on the live model.
          for (const slot of RESERVE_SLOT_IDS) {
            if (model.aiReserve[slot]?.battleCardId === self.battleCardId) {
              model.aiReserve[slot] = null;
            }
          }
          model.aiDeployed[toSlot] = self;
        }
      }
    });
  });

  describe("deadline guard", () => {
    it("returns a valid PlannedAction without throwing when the deadline has passed", () => {
      const model = baseModel({
        aiEnergy: 8,
        aiHand: [minstrel(), direwolf(), colossus()],
        opponentBodies: [opponentBody({ effectiveSpark: 3 })],
      });
      const opts = defaultOptions({ nowMs: 2_000_000, deadlineMs: 1_000_000 });
      let action: ReturnType<typeof planNextAction> | undefined;
      expect(() => {
        action = planNextAction(model, opts);
      }).not.toThrow();
      expect(action).toBeDefined();
      expect(["PLAY_CARD", "MOVE_CARD", "END_TURN"]).toContain(action?.kind);
    });

    it("returns END_TURN under a passed deadline with no prior plan", () => {
      const model = baseModel({ aiEnergy: 8, aiHand: [direwolf()] });
      const opts = defaultOptions({ nowMs: 5_000, deadlineMs: 1_000 });
      const action = planNextAction(model, opts);
      expect(action.kind).toBe("END_TURN");
    });
  });

  describe("determinism", () => {
    it("identical (model, opts) yields an identical returned action across repeated calls", () => {
      const build = (): ForwardModel =>
        baseModel({
          aiEnergy: 8,
          aiHand: [minstrel(), direwolf(), colossus()],
          opponentBodies: [opponentBody({ effectiveSpark: 2, slot: "D0" })],
        });

      const a = planNextAction(build(), defaultOptions());
      const b = planNextAction(build(), defaultOptions());
      const c = planNextAction(build(), defaultOptions());

      expect(b.kind).toBe(a.kind);
      expect(b.self?.cardNumber).toBe(a.self?.cardNumber);
      expect(b.toSlot).toBe(a.toSlot);
      expect(c.kind).toBe(a.kind);
      expect(c.self?.cardNumber).toBe(a.self?.cardNumber);
      expect(c.toSlot).toBe(a.toSlot);
    });
  });

  describe("synergy ordering", () => {
    it("plays Twilight Minstrel before Meadowforged Colossus when only one is affordable", () => {
      // Energy for exactly ONE of the two: 2 (Minstrel) but not 6 (Colossus).
      // A deployed challenger in D0 makes the Minstrel's Support immediately
      // valuable (it lifts that front body, and would lift a future Colossus),
      // so the character stage should lead with the Minstrel even though it is
      // listed AFTER the Colossus in hand.
      const challenger = makeCard({
        cardNumber: 512,
        name: "Branded Direwolf",
        basePrintedSpark: 4,
        canChallengeThisTurn: true,
      });
      const model = baseModel({
        aiEnergy: 3,
        aiHand: [colossus(), minstrel()],
        aiDeployed: { ...emptyDeployed(), D0: challenger },
      });
      const action = planNextAction(model, defaultOptions());
      expect(action.kind).toBe("PLAY_CARD");
      expect(action.self?.cardNumber).toBe(510);
    });
  });

  describe("end turn fallback", () => {
    it("returns END_TURN when the hand is empty and no legal action exists", () => {
      const model = baseModel({ aiEnergy: 5, aiHand: [] });
      const action = planNextAction(model, defaultOptions());
      expect(action.kind).toBe("END_TURN");
      expect(action.stage).toBe("endTurn");
    });

    it("returns END_TURN when nothing in hand can be afforded and no reposition helps", () => {
      const model = baseModel({ aiEnergy: 0, aiHand: [colossus()] });
      const action = planNextAction(model, defaultOptions());
      expect(action.kind).toBe("END_TURN");
    });
  });

  describe("trace", () => {
    it("populates existing trace fields for a PLAY_CARD action", () => {
      const model = baseModel({ aiEnergy: 3, aiHand: [minstrel()] });
      const action = planNextAction(model, defaultOptions());
      expect(action.trace.choice).toBe(action.kind);
      expect(action.trace.stage).toBe(action.stage);
      if (action.kind === "PLAY_CARD") {
        expect(action.trace.battleCardId).toBe(action.self?.battleCardId ?? null);
        expect(action.trace.cardName).toBe(action.self?.name ?? null);
        expect(typeof action.trace.heuristicScoreBefore).toBe("number");
        expect(typeof action.trace.heuristicScoreAfter).toBe("number");
      }
    });

    it("populates an END_TURN trace with null card fields", () => {
      const model = baseModel({ aiEnergy: 0, aiHand: [] });
      const action = planNextAction(model, defaultOptions());
      expect(action.trace.choice).toBe("END_TURN");
      expect(action.trace.battleCardId).toBeNull();
      expect(action.trace.sourceHandIndex).toBeNull();
    });
  });
});
