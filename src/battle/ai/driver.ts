import type { PlannedAction } from "./planner";
import { CHARACTER_CARD_NUMBERS } from "./cards/card-numbers";
import type { BattleCommand, BattleDebugEdit, BattleDebugZoneDestination } from "../debug/commands";
import type { BattleSide, FrontRankSlotId, BackRankSlotId } from "../types";

/**
 * Translates a {@link PlannedAction} into the EXISTING
 * {@link BattleCommand}/{@link BattleDebugEdit} vocabulary. The AI introduces NO
 * new command types: every emitted command is a `DEBUG_EDIT` envelope authored
 * by the AI (`actor: aiSide`, `sourceSurface: "auto-system"`).
 *
 * The driver performs the STRUCTURAL translation only. Where a faithful mapping
 * needs live battle state the `PlannedAction` does not carry (absolute spark
 * values, the discovered/foreseen card, the next-turn flow target), the driver
 * emits the deterministic edits it can and the hook (Task 5.4) finalizes the
 * rest against live state. Such cases are called out in comments below.
 *
 * Card-number families (the AI deck is fixed and hand-encoded):
 * - 510–515: characters. Playing one drops a body into a reserve slot.
 * - 516: Flashpoint Detonation — dissolves an enemy body.
 * - 517: Glimpse of What Was — draws (Foresee reorder is interactive).
 * - 518: Sign of Arrival — Discover (interactive pick of three).
 * - 519: Worlds Await — empowers an ally (+3✦).
 */
export function actionToCommands(action: PlannedAction, aiSide: BattleSide): BattleCommand[] {
  switch (action.kind) {
    case "PLAY_CARD":
      return playCardCommands(action, aiSide);
    case "MOVE_CARD":
      return moveCardCommands(action, aiSide);
    case "END_TURN":
      // The end-of-turn flow (challenge resolution then handoff) is orchestrated
      // by the hook via `engine/challenge.resolveChallenge` + `planHandoff`,
      // which need turn state the driver does not carry. The driver emits NO
      // command for END_TURN; the hook composes the challenge + handoff edits.
      return [];
  }
}

/** Wraps a {@link BattleDebugEdit} as an AI-authored DEBUG_EDIT command. */
function edit(e: BattleDebugEdit, aiSide: BattleSide): BattleCommand {
  return {
    id: "DEBUG_EDIT",
    edit: e,
    actor: aiSide,
    sourceSurface: "auto-system",
  };
}

function opposingSide(side: BattleSide): BattleSide {
  return side === "player" ? "enemy" : "player";
}

function reserveDestination(side: BattleSide, slotId: BackRankSlotId): BattleDebugZoneDestination {
  return { side, zone: "backRank", slotId };
}

function deployedDestination(side: BattleSide, slotId: FrontRankSlotId): BattleDebugZoneDestination {
  return { side, zone: "frontRank", slotId };
}

function voidDestination(side: BattleSide): BattleDebugZoneDestination {
  return { side, zone: "void" };
}

function playCardCommands(action: PlannedAction, aiSide: BattleSide): BattleCommand[] {
  const self = action.self;
  if (self === undefined) {
    return [];
  }

  if (CHARACTER_CARD_NUMBERS.has(self.cardNumber)) {
    // Character: materialize the body into the chosen reserve slot, mark it
    // exhausted, then pay.
    const slotId = action.toSlot as BackRankSlotId | undefined;
    const commands: BattleCommand[] = [];
    if (slotId !== undefined) {
      commands.push(
        edit(
          {
            kind: "MOVE_CARD_TO_ZONE",
            battleCardId: self.battleCardId,
            destination: reserveDestination(aiSide, slotId),
          },
          aiSide,
        ),
      );
    }
    // Rules §Exhaust and Awaken: a character enters play exhausted and so cannot
    // challenge the turn it is played. `MOVE_CARD_TO_ZONE` only places the body;
    // it does not set the status. Without this edit the body lands in the reserve
    // with `isExhausted` false, so re-projecting the state would read
    // `canChallengeThisTurn` as true and the planner could reposition the
    // just-played character into the front rank — declaring it an illegal
    // challenger. Marking it exhausted here mirrors the forward model
    // (`playCharacterToBackRank` clears `canChallengeThisTurn`), and the body's
    // Ending clears the status when the AI finishes this turn.
    commands.push(
      edit(
        {
          kind: "SET_CARD_STATUS",
          battleCardId: self.battleCardId,
          status: { isExhausted: true },
        },
        aiSide,
      ),
    );
    commands.push(
      edit({ kind: "ADJUST_CURRENT_ENERGY", side: aiSide, amount: -self.energyCost }, aiSide),
    );
    return commands;
  }

  // Event play: pay energy, apply the effect, then send the event to the void.
  const commands: BattleCommand[] = [
    edit({ kind: "ADJUST_CURRENT_ENERGY", side: aiSide, amount: -self.energyCost }, aiSide),
  ];

  const targetId = action.targets?.targetBattleCardId ?? null;
  switch (self.cardNumber) {
    case 516: {
      // Flashpoint Detonation: dissolve the enemy body. The target is the opponent's
      // card, so it goes to the OPPONENT's void.
      if (targetId !== null) {
        commands.push(
          edit(
            {
              kind: "MOVE_CARD_TO_ZONE",
              battleCardId: targetId,
              destination: voidDestination(opposingSide(aiSide)),
            },
            aiSide,
          ),
        );
      }
      break;
    }
    case 517: {
      // Glimpse of What Was: draw a card. The optional Foresee deck reorder is
      // interactive and is surfaced for approval at the proposal layer (Task
      // 5.4); the driver emits only the deterministic draw.
      commands.push(edit({ kind: "DRAW_CARD", side: aiSide }, aiSide));
      break;
    }
    case 518: {
      // Sign of Arrival: Discover is interactive (the human/AI picks one of three).
      // The discovered card is resolved at the proposal layer (Task 5.4); the
      // driver emits only the energy + void edits.
      break;
    }
    case 519: {
      // Worlds Await: grant +3✦ to an ally. `SET_CARD_SPARK_DELTA` is an
      // ABSOLUTE write, so producing it requires the ally's current sparkDelta,
      // which lives only in live battle state. The hook (Task 5.4) computes the
      // new delta (current + 3) against live card state and applies the spark
      // edit; the driver emits only the deterministic energy + void edits.
      break;
    }
    default:
      break;
  }

  // The event card resolves to the AI's own void.
  commands.push(
    edit(
      {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: self.battleCardId,
        destination: voidDestination(aiSide),
      },
      aiSide,
    ),
  );
  return commands;
}

function moveCardCommands(action: PlannedAction, aiSide: BattleSide): BattleCommand[] {
  const self = action.self;
  const slotId = action.toSlot as FrontRankSlotId | undefined;
  if (self === undefined || slotId === undefined) {
    return [];
  }
  // Key the move by the card id + destination. The source slot lives only in
  // `action.trace.sourceSlotId`; MOVE_CARD_TO_ZONE by id is robust regardless of
  // where the card currently sits.
  return [
    edit(
      {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: self.battleCardId,
        destination: deployedDestination(aiSide, slotId),
      },
      aiSide,
    ),
  ];
}
