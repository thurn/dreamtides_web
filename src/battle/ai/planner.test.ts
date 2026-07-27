import { describe, expect, it } from "vitest";
import { planNextAction, type PlannerOptions } from "./planner";
import { starterCardModels } from "./cards/index";
import type { AiCard, AiOpponentBody, ForwardModel } from "./forward-model";
import { isBackRankSlotId, isFrontRankSlotId, rankSlotIds } from "../types";
import type { FrontRankSlotId } from "../types";
import { emptyFrontRankSlots, emptyBackRankSlots } from "../test-support";

// --- Fixture helpers -------------------------------------------------------

function emptyFrontRank(): ForwardModel["aiFrontRank"] {
  return emptyFrontRankSlots();
}

function emptyBackRank(): ForwardModel["aiBackRank"] {
  return emptyBackRankSlots();
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
    aiFrontRank: emptyFrontRank(),
    aiBackRank: emptyBackRank(),
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
    energyCost: 0,
    rank: "front",
    slot: "F0",
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

function strummer(): AiCard {
  // #510 Nocturne Strummer — 2●, 1✦, Support +2✦.
  return makeCard({ cardNumber: 510, name: "Nocturne Strummer", energyCost: 2, basePrintedSpark: 1 });
}

function colossus(): AiCard {
  // #515 Wildflower Colossus — 6●, 6✦, +2✦ per supporting ally.
  return makeCard({ cardNumber: 515, name: "Wildflower Colossus", energyCost: 6, basePrintedSpark: 6 });
}

function direwolf(): AiCard {
  // #512 Marked Direwolf — 4●, 4✦ vanilla.
  return makeCard({ cardNumber: 512, name: "Marked Direwolf", energyCost: 4, basePrintedSpark: 4 });
}

// --- Tests -----------------------------------------------------------------

describe("planNextAction", () => {
  describe("legality", () => {
    it("never returns a PLAY_CARD whose cost exceeds available energy", () => {
      // Hand full of cards the AI cannot afford.
      const fixtures: ForwardModel[] = [
        baseModel({
          aiEnergy: 1,
          aiHand: [strummer(), direwolf(), colossus()],
        }),
        baseModel({
          aiEnergy: 3,
          aiHand: [colossus(), direwolf()],
          opponentBodies: [opponentBody({ effectiveSpark: 2 })],
        }),
        baseModel({
          aiEnergy: 0,
          aiHand: [strummer()],
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
      // A ready reserve challenger behind a rank of weaker deployed cards. Under
      // the dynamic play area the front rank expands, so moving the reserve up is
      // a legal play — but any MOVE_CARD must target an EMPTY slot, never one of
      // the occupied F0–F3 positions.
      const ready = makeCard({
        cardNumber: 512,
        name: "Marked Direwolf",
        basePrintedSpark: 4,
        canChallengeThisTurn: true,
      });
      const model = baseModel({
        aiEnergy: 0,
        aiBackRank: { ...emptyBackRank(), B0: ready },
        aiFrontRank: {
          ...emptyFrontRankSlots(),
          F0: makeCard({ basePrintedSpark: 1 }),
          F1: makeCard({ basePrintedSpark: 1 }),
          F2: makeCard({ basePrintedSpark: 1 }),
          F3: makeCard({ basePrintedSpark: 1 }),
        },
      });
      const action = planNextAction(model, defaultOptions());
      if (action.kind === "MOVE_CARD") {
        const toSlot = action.toSlot as FrontRankSlotId | undefined;
        expect(toSlot).toBeDefined();
        expect(model.aiFrontRank[toSlot as FrontRankSlotId]).toBeNull();
      }
    });

    it("a returned character PLAY_CARD carries a concrete empty reserve slot", () => {
      // The body materializes into a reserve slot, so the proposal must name one.
      // Without it the driver pays the energy but emits no MOVE_CARD_TO_ZONE, so
      // the card never leaves hand (energy down, card stuck in hand).
      const challenger = makeCard({
        cardNumber: 512,
        name: "Marked Direwolf",
        basePrintedSpark: 4,
        canChallengeThisTurn: true,
      });
      const model = baseModel({
        aiEnergy: 3,
        aiHand: [strummer()],
        aiFrontRank: { ...emptyFrontRank(), F4: challenger },
      });
      const action = planNextAction(model, defaultOptions());
      expect(action.kind).toBe("PLAY_CARD");
      expect(action.self?.cardNumber).toBe(510);
      expect(action.toSlot).toBe("B4");
      expect(isBackRankSlotId(action.toSlot ?? "")).toBe(true);
      // The named slot is empty in the source model.
      expect(model.aiBackRank[action.toSlot as "B4"]).toBeNull();
    });

    it("a returned MOVE_CARD targets an empty, legal deploy slot from a ready reserve card", () => {
      const ready = makeCard({
        cardNumber: 512,
        name: "Marked Direwolf",
        basePrintedSpark: 4,
        canChallengeThisTurn: true,
      });
      const model = baseModel({
        aiEnergy: 0,
        aiBackRank: { ...emptyBackRank(), B0: ready },
        opponentBodies: [],
      });
      const action = planNextAction(model, defaultOptions());
      expect(action.kind).toBe("MOVE_CARD");
      expect(action.toSlot).toBe("F4");
      expect(isFrontRankSlotId(action.toSlot ?? "")).toBe(true);
      // Destination is empty in the source model.
      expect(model.aiFrontRank[action.toSlot as "F4"]).toBeNull();
      expect(action.self?.battleCardId).toBe(ready.battleCardId);
    });

    it("over several re-plan steps every applied action stays legal", () => {
      // Drive a few re-plans by applying each returned action via its card model
      // and confirm no illegal proposal is ever produced.
      const model = baseModel({
        aiEnergy: 8,
        aiHand: [strummer(), direwolf(), colossus()],
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
        } else if (action.kind === "MOVE_CARD") {
          const self = action.self as AiCard;
          const toSlot = action.toSlot as FrontRankSlotId;
          expect(model.aiFrontRank[toSlot]).toBeNull();
          // Apply the move on the live model.
          for (const slot of rankSlotIds(model.aiBackRank)) {
            if (model.aiBackRank[slot]?.battleCardId === self.battleCardId) {
              model.aiBackRank[slot] = null;
            }
          }
          model.aiFrontRank[toSlot] = self;
        }
      }
    });
  });

  describe("deadline guard", () => {
    it("returns a valid PlannedAction without throwing when the deadline has passed", () => {
      const model = baseModel({
        aiEnergy: 8,
        aiHand: [strummer(), direwolf(), colossus()],
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
          aiHand: [strummer(), direwolf(), colossus()],
          opponentBodies: [opponentBody({ effectiveSpark: 2, slot: "F0" })],
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
    it("plays Nocturne Strummer before Wildflower Colossus when only one is affordable", () => {
      // Energy for exactly ONE of the two: 2 (Strummer) but not 6 (Colossus).
      // A deployed challenger in F4 makes the Strummer's Support immediately
      // valuable (it lifts that front body, and would lift a future Colossus),
      // so the character stage should lead with the Strummer even though it is
      // listed AFTER the Colossus in hand.
      const challenger = makeCard({
        cardNumber: 512,
        name: "Marked Direwolf",
        basePrintedSpark: 4,
        canChallengeThisTurn: true,
      });
      const model = baseModel({
        aiEnergy: 3,
        aiHand: [colossus(), strummer()],
        aiFrontRank: { ...emptyFrontRank(), F4: challenger },
      });
      const action = planNextAction(model, defaultOptions());
      expect(action.kind).toBe("PLAY_CARD");
      expect(action.self?.cardNumber).toBe(510);
    });
  });

  describe("within-turn setup then payoff (beam, not greedy)", () => {
    it("proposes the neutral setup play that enables a strongly positive completed line this turn", () => {
      // Wildflower Colossus (#515) is ALREADY on the AI board in a reserve
      // slot, awakened (canChallengeThisTurn), so it can be repositioned this
      // turn. Nocturne Strummer (#510) is in hand with exactly enough energy to
      // play it. The board is otherwise empty and there are no opponent bodies.
      //
      // The winning completed line is:
      //   1. play Strummer  -> lands in B4 (center-left reserve slot)
      //   2. reposition Colossus from B2 -> F4 (center deploy slot)
      // In the final board the Colossus stands in F4 with 1 supporting ally
      // (Strummer in B4, which supports F3 and F4), so its effective spark is
      //   6 (base) + 2 (Strummer Support, B0 supports F0)
      //             + 2 (own +2-per-supporter self-static, 1 supporter) = 10,
      // scored unblocked against an empty opponent board. That completed plan
      // scores far above END_TURN.
      //
      // Crucially, playing the Strummer ON ITS OWN is NON-IMPROVING: it spends a
      // hand card and energy and only adds a back-rank body, scoring slightly
      // BELOW the do-nothing/END_TURN baseline (~3.5 vs ~4.0). The old
      // strictly-improving beam pruned this setup step and never reached the
      // payoff; it would instead reposition the Colossus alone (still better than
      // passing, but the lesser line) and never play the Strummer. The real beam
      // keeps the neutral setup node so the payoff is discovered, and the best
      // complete plan begins with the Strummer play.
      const colossusOnBoard = makeCard({
        cardNumber: 515,
        name: "Wildflower Colossus",
        basePrintedSpark: 6,
        canChallengeThisTurn: true,
      });
      const model = baseModel({
        aiEnergy: 2,
        aiHand: [strummer()],
        aiBackRank: { ...emptyBackRank(), B2: colossusOnBoard },
        opponentBodies: [],
      });

      const action = planNextAction(model, defaultOptions());

      // The first action of the best complete plan is the Strummer play (the
      // setup step of the winning line) — NOT END_TURN, and NOT the lesser
      // reposition-only line the greedy version would take.
      expect(action.kind).toBe("PLAY_CARD");
      expect(action.self?.cardNumber).toBe(510);
    });
  });

  describe("over-development guard (no greedy cutoff != over-develop)", () => {
    it("returns END_TURN when the only legal develop is a losing line", () => {
      // A legal action EXISTS (the AI can afford the Strummer) but playing it
      // strictly lowers the score: it spends a hand card and energy to add a
      // lone back-rank body with no front body to support and no payoff to set
      // up. With the greedy cutoff removed the beam still explores this play, but
      // because it scores below the do-nothing/END_TURN baseline the best
      // complete plan is the empty/root plan and the planner passes.
      const model = baseModel({ aiEnergy: 3, aiHand: [strummer()] });
      const action = planNextAction(model, defaultOptions());
      expect(action.kind).toBe("END_TURN");
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
      const model = baseModel({ aiEnergy: 3, aiHand: [strummer()] });
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
