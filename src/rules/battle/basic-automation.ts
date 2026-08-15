import type {
  BattleCommand,
  BattleDebugEdit,
} from "../../battle/debug/commands";
import {
  type ChallengeResolution,
  resolveChallenge,
} from "../../battle/engine/challenge";
import { dreamwellEnergyEdits } from "../../battle/engine/energy";
import { endingBanishEdits } from "../../battle/engine/handoff";
import { selectBattleCardLocation } from "../../battle/state/selectors";
import { drawsAtStartOfTurn } from "../../battle/state/turn-utils";
import type {
  BattleMutableState,
  BattlePhase,
  BattleResult,
  BattleSide,
  DreamwellCardDefinition,
} from "../../battle/types";
import { hasTemporaryReclaimEligibility } from "./temporary-effects";
import type { BattleCardId } from "../../types/identifiers";

/** An empty support map: the human/automation path runs over an unmodeled board. */
const NO_SUPPORT_CONTRIBUTION: ReadonlyMap<BattleCardId, number> = new Map();

/**
 * The eight battle phases in turn order (rules §Turn Structure). Five phases —
 * Dawn, Day, Dusk, Night, and Challenge — are surfaced in the UI, but only four
 * of those (Day, Dusk, Night, Challenge) carry player actions. Dawn auto-advances
 * after its triggers resolve, as do the Dreamwell, Draw, and Ending bookends.
 */
const PHASE_SEQUENCE: readonly BattlePhase[] = [
  "dreamwell",
  "draw",
  "dawn",
  "day",
  "dusk",
  "night",
  "challenge",
  "ending",
];

/**
 * The bookend phases (rules §Turn Structure). Each carries no player action:
 * entering one immediately applies its effect and advances to the next phase.
 * Draw draws, Dawn resolves its triggers, and Ending enforces the hand limit,
 * clears exhaustion, and banishes end-of-turn statuses. The Dreamwell phase is
 * NOT a bookend: it is a
 * surfaced stop the player clicks through after seeing the drawn Dreamwell card,
 * and its energy is applied when its reveal (`DRAW_DREAMWELL_CARD`) is expanded.
 */
const BOOKEND_PHASES: ReadonlySet<BattlePhase> = new Set<BattlePhase>([
  "draw",
  "dawn",
  "ending",
]);

/**
 * "Basic automation" applies the small, deterministic subset of the Dreamtides
 * battle rules (see docs/battle_rules/battle_rules.md) that can be derived
 * purely from board state, so the human (or AI) does not have to hand-drive
 * routine bookkeeping. Every helper here is PURE: it reads a battle state and a
 * user command and returns the ordered list of commands to dispatch in place of
 * the original. Returning `[command]` unchanged is the default — automation only
 * rewrites the handful of gestures it understands.
 *
 * The rules currently automated are:
 *
 *  - **Playing a card costs energy.** Moving a card from hand into a battlefield
 *    slot reduces the controller's current ● by the card's energy cost.
 *    Characters enter play exhausted (rules §Playing Cards and the Stack).
 *  - **Events resolve to the void.** An event played from hand is routed to the
 *    void instead of staying in play (rules §Card Types — Event).
 *  - **The Challenge phase resolves by spark.** When the active player ends
 *    their turn, each front-rank lane (`F0`–`F8`) is resolved by comparing
 *    spark: the lower-spark character dissolves to the void, an unpaired
 *    challenger scores ⍟ equal to its spark, a challenger that wins a blocked
 *    lane scores the spark difference, and the keyword rules below apply
 *    (rules §Challengers, Blockers, and Scoring).
 *  - **Keyword awareness.** Vengeful drags the winner down when its bearer
 *    loses (rules §Keywords and Effects).
 *  - **Bookend phases auto-advance.** A `SET_PHASE` into a bookend phase
 *    (`draw`, `dawn`, `ending`) carries no player action: it folds in that
 *    bookend's effect and steps forward — chaining through consecutive bookends
 *    — until it lands on a surfaced phase (rules §Turn Structure).
 *  - **Dreamwell reveal raises energy.** Revealing a side's Dreamwell card
 *    (`DRAW_DREAMWELL_CARD`) raises its maximum ● by the card's `energyAdded`
 *    and refills current ● (rules §The Dreamwell and Energy).
 *  - **Start of turn draws.** After the active side's Dreamwell effect resolves,
 *    leaving Dreamwell draws a card before Dawn/Day (skipped on the very first
 *    turn of the battle) (rules §Turn Structure — Draw).
 *  - **Ending exhaustion clear is the reducer's job.** Every in-play character
 *    is awakened when the reducer folds the turn handoff.
 *  - **End-of-turn hand limit.** The outgoing player discards down to ten cards
 *    (rules §Turn Structure — Ending).
 *  - **Ending banishes end-of-turn statuses.** After the hand-limit discard, the
 *    outgoing side's ephemeral cards still in hand and offering cards still in
 *    play are banished (rules §Turn Structure — Ending).
 *  - **Victory threshold.** When a side reaches the score threshold after the
 *    Challenge resolves, the battle result is forced (rules §Objective).
 */

/** Hand-size limit enforced during the Ending phase (rules §Zones — Hand). */
/** Caps the automation needs from `BattleInit` to ramp energy and detect a win. */
export interface BasicAutomationCaps {
  maxEnergyCap: number;
  scoreToWin: number;
  handLimit: number;
  /**
   * The shared Dreamwell deck (`BattleInit.dreamwellDeck`). Read at the active
   * `dreamwellDeckIndex` so a `DRAW_DREAMWELL_CARD` reveal also applies the
   * drawn card's `energyAdded` to the side's maximum ●.
   */
  dreamwellDeck: readonly DreamwellCardDefinition[];
}

/**
 * Expands a single user command into the ordered command list that "basic
 * automation" would dispatch in its place. Non-automated commands pass through
 * unchanged as `[command]`.
 */
export function planBasicAutomationCommands(
  state: BattleMutableState,
  command: BattleCommand,
  caps: BasicAutomationCaps,
): BattleCommand[] {
  if (command.id !== "DEBUG_EDIT") {
    return [command];
  }

  switch (command.edit.kind) {
    case "MOVE_CARD_TO_ZONE":
      return planCardPlay(state, command, command.edit);
    case "DRAW_DREAMWELL_CARD":
      return planDreamwellReveal(state, command, command.edit, caps);
    case "SET_BATTLE_FLOW":
      if (
        command.edit.activeSide === state.activeSide &&
        state.phase === "dreamwell" &&
        command.edit.phase !== "dreamwell"
      ) {
        return planDreamwellExit(state, command);
      }
      return planTurnHandoff(state, command, command.edit, caps);
    case "SET_PHASE": {
      const advance =
        command.edit.phase === "challenge"
          ? planChallengeOnly(state, command, caps)
          : BOOKEND_PHASES.has(command.edit.phase)
            ? planBookendAdvance(state, command, command.edit, caps)
            : [command];
      if (
        state.phase !== "dreamwell" ||
        command.edit.phase === "dreamwell" ||
        command.edit.phase === "draw"
      ) {
        return advance;
      }
      return planDreamwellExit(state, advance);
    }
    default:
      return [command];
  }
}

/**
 * A "play" is moving a card out of hand and into a battlefield slot. Playing
 * costs energy; a character enters play exhausted, while an event is routed
 * straight to the void.
 */
function planCardPlay(
  state: BattleMutableState,
  command: BattleCommand & { id: "DEBUG_EDIT" },
  edit: Extract<BattleDebugEdit, { kind: "MOVE_CARD_TO_ZONE" }>,
): BattleCommand[] {
  const location = selectBattleCardLocation(state, edit.battleCardId);
  const instance = state.cardInstances[edit.battleCardId];
  if (instance === undefined) return [command];
  const isTemporaryVoidPlay =
    location?.zone === "void" &&
    hasTemporaryReclaimEligibility(state, instance);
  if (location?.zone !== "hand" && !isTemporaryVoidPlay) {
    return [command];
  }

  const destination = edit.destination;
  const isPlayDestination = "slotId" in destination;
  if (!isPlayDestination) {
    return [command];
  }

  const side = location.side;
  const isEvent = instance.definition.battleCardKind === "event";

  // Events never stay in play — they resolve to the void.
  const primary: BattleCommand = isEvent
    ? {
        ...command,
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId: edit.battleCardId,
          destination: { side, zone: "void" },
        },
      }
    : command;

  // Reduce current ● by the card's cost, clamped so energy never goes negative.
  const cost = Math.max(0, instance.definition.energyCost);
  const spend = Math.min(cost, state.sides[side].currentEnergy);
  const commands: BattleCommand[] = [];
  if (spend > 0) {
    commands.push(
      autoCommand({
        kind: "ADJUST_CURRENT_ENERGY",
        side,
        amount: -spend,
      }),
    );
  }
  if (isTemporaryVoidPlay) {
    commands.push(
      autoCommand({
        kind: "SET_CARD_STATUS",
        battleCardId: edit.battleCardId,
        status: { reclaimed: true },
      }),
    );
  }
  if (!isEvent) {
    commands.push(
      autoCommand({
        kind: "SET_CARD_STATUS",
        battleCardId: edit.battleCardId,
        status: { isExhausted: true },
      }),
    );
  }
  commands.push(primary);

  return commands;
}

/**
 * A `DRAW_DREAMWELL_CARD` reveal (rules §The Dreamwell and Energy) also raises
 * the drawing side's maximum ● by the drawn card's `energyAdded` and refills
 * current ● to the new maximum. The card about to be drawn sits at the shared
 * `dreamwellDeckIndex`; automation reads its `energyAdded` from
 * `caps.dreamwellDeck` and emits the energy edits before the reveal, so a
 * prompt-bearing reveal can park its prompt as the final command. A missing card
 * (deck somehow exhausted) or one that adds 0 leaves the maximum unchanged.
 */
function planDreamwellReveal(
  state: BattleMutableState,
  command: BattleCommand,
  edit: Extract<BattleDebugEdit, { kind: "DRAW_DREAMWELL_CARD" }>,
  caps: BasicAutomationCaps,
): BattleCommand[] {
  const card = caps.dreamwellDeck[state.dreamwellDeckIndex];
  const energyAdded = card?.energyAdded ?? 0;
  const commands: BattleCommand[] = [];
  for (const energyEdit of dreamwellEnergyEdits(
    edit.side,
    state.sides[edit.side].maxEnergy,
    energyAdded,
  )) {
    commands.push(autoCommand(energyEdit));
  }
  commands.push(command);
  return commands;
}

/**
 * A turn handoff (the `SET_BATTLE_FLOW` that flips the active side) ends the
 * outgoing player's turn and begins the incoming player's. Automation resolves
 * the outgoing Challenge, enforces the hand limit, and forces a result if the
 * threshold was reached. The incoming side draws only after its Dreamwell
 * effect resolves, when the flow leaves Dreamwell.
 *
 * The Challenge resolves exactly once per turn, at the moment the outgoing side
 * *enters* the `challenge` phase — whether that entry came from the Challenge
 * phase chip (`planChallengeOnly`) or from advancing the phase float control
 * into Challenge (a same-side `SET_BATTLE_FLOW`, handled below). By the time the
 * handoff fires the side already sits in `challenge` with its scoring committed,
 * so the handoff does not re-resolve; it only runs the rest of the Ending
 * bookend (hand-limit discard, end-of-turn banishes and exhaustion clear) and
 * lands the incoming side on Dreamwell.
 */
function planTurnHandoff(
  state: BattleMutableState,
  command: BattleCommand,
  edit: Extract<BattleDebugEdit, { kind: "SET_BATTLE_FLOW" }>,
  caps: BasicAutomationCaps,
): BattleCommand[] {
  const outgoingSide = state.activeSide;
  const incomingSide = edit.activeSide;
  const isHandoff = incomingSide !== outgoingSide;
  if (!isHandoff) {
    // A same-side flow edit into `challenge` is the phase-float counterpart of
    // the Challenge chip: resolve the Challenge on entry so scoring happens
    // exactly once, here, rather than at the later handoff.
    if (edit.phase === "challenge" && state.phase !== "challenge") {
      return planChallengeOnly(state, command, caps);
    }
    return [command];
  }

  const challengeAlreadyResolved = state.phase === "challenge";
  const commands: BattleCommand[] = [];

  if (!challengeAlreadyResolved) {
    const challenge = resolveChallenge({
      state,
      activeSide: outgoingSide,
      supportContribution: NO_SUPPORT_CONTRIBUTION,
    });
    commands.push(...challenge.edits.map(autoCommand));

    const victoryCommand = buildVictoryCommand(
      state,
      challenge,
      caps.scoreToWin,
    );
    if (victoryCommand !== null) {
      commands.push(victoryCommand);
    }
  }

  for (const discardEdit of handLimitDiscardEdits(
    state,
    outgoingSide,
    caps.handLimit,
  )) {
    commands.push(autoCommand(discardEdit));
  }

  // Ending: after the hand-limit discard, the outgoing side's end-of-turn
  // statuses are enforced — ephemeral cards still in hand and offering cards
  // still in play are banished (rules §Turn Structure — Ending).
  for (const banishEdit of endingBanishEdits(state, outgoingSide)) {
    commands.push(autoCommand(banishEdit));
  }

  // The user's own flow edit performs the side flip. The reducer's
  // `BATTLE_COMMAND` clears exhaustion from every in-play character when it
  // folds this edit. The incoming side's energy is raised separately when its Dreamwell
  // card is revealed on the Dreamwell phase the handoff lands on (see
  // `planDreamwellReveal`).
  commands.push(command);

  return commands;
}

/**
 * Leaves Dreamwell only after its reveal script has drained. A prompt-bearing
 * Dreamwell keeps the board parked in this phase, so this transition cannot be
 * accepted until the prompt resolves. The ordinary turn draw is therefore
 * guaranteed to observe the deck after every Dreamwell effect, including
 * Foresee, and before Dawn/Day begins.
 */
function planDreamwellExit(
  state: BattleMutableState,
  commands: BattleCommand | BattleCommand[],
): BattleCommand[] {
  const planned = Array.isArray(commands) ? commands : [commands];
  if (!drawsAtStartOfTurn(state.activeSide, state.turnNumber)) {
    return planned;
  }
  return [
    autoCommand({ kind: "DRAW_CARD", side: state.activeSide }),
    ...planned,
  ];
}

/**
 * Resolves the Challenge for the active side without a turn handoff (used when
 * the phase is set directly to `challenge`).
 */
function planChallengeOnly(
  state: BattleMutableState,
  command: BattleCommand,
  caps: BasicAutomationCaps,
): BattleCommand[] {
  const challenge = resolveChallenge({
    state,
    activeSide: state.activeSide,
    supportContribution: NO_SUPPORT_CONTRIBUTION,
  });
  const commands: BattleCommand[] = [
    command,
    ...challenge.edits.map(autoCommand),
  ];
  const victoryCommand = buildVictoryCommand(state, challenge, caps.scoreToWin);
  if (victoryCommand !== null) {
    commands.push(victoryCommand);
  }
  return commands;
}

/**
 * A `SET_PHASE` into a bookend phase carries no player action (rules §Turn
 * Structure). Automation keeps the original navigation, folds in that bookend's
 * effect edits, then steps to the next phase — chaining through any consecutive
 * bookends (each contributing its own effect once) until it lands on a surfaced
 * phase the player drives. The active side and turn number are unchanged: this
 * is within-turn phase navigation, not a turn handoff (that is `SET_BATTLE_FLOW`).
 */
function planBookendAdvance(
  state: BattleMutableState,
  command: BattleCommand,
  edit: Extract<BattleDebugEdit, { kind: "SET_PHASE" }>,
  caps: BasicAutomationCaps,
): BattleCommand[] {
  const side = state.activeSide;
  // Keep the original navigation so the bookend entry stays in history.
  const commands: BattleCommand[] = [command];

  let phase = edit.phase;
  // Each iteration applies the current bookend's effect and advances one phase.
  // The loop terminates because every step moves strictly forward through the
  // finite `PHASE_SEQUENCE` toward a surfaced phase (`ending` is the last
  // bookend and resolves to `day`).
  while (BOOKEND_PHASES.has(phase)) {
    for (const effectEdit of bookendEffectEdits(
      state,
      side,
      phase,
      state.turnNumber,
      caps.handLimit,
    )) {
      commands.push(autoCommand(effectEdit));
    }
    phase = nextSurfaceableTarget(phase);
    commands.push(autoCommand({ kind: "SET_PHASE", phase }));
  }

  return commands;
}

/**
 * The phase a bookend advances into. A bookend hands off to the next phase in
 * turn order; `ending` is terminal, so it advances to the following turn's first
 * surfaced phase, `day` (the side flip and turn increment belong to the
 * `SET_BATTLE_FLOW` handoff, not to bare phase navigation).
 */
function nextSurfaceableTarget(phase: BattlePhase): BattlePhase {
  if (phase === "ending") {
    return "day";
  }
  const index = PHASE_SEQUENCE.indexOf(phase);
  return PHASE_SEQUENCE[index + 1] ?? "day";
}

/**
 * The deterministic effect edits a single bookend phase folds in when entered
 * (rules §Turn Structure). Pure: it only reads `state`.
 *
 *  - **Draw:** draw one card for the active side, skipping only the first
 *    player's first turn (see `drawsAtStartOfTurn`).
 *  - **Dawn:** no structural edits; authored Dawn triggers run in the rules
 *    reducer.
 *  - **Ending:** discard the active side down to the hand limit, then banish its
 *    end-of-turn statuses (ephemeral in hand, offering in play).
 */
function bookendEffectEdits(
  state: BattleMutableState,
  side: BattleSide,
  phase: BattlePhase,
  turnNumber: number,
  handLimit: number,
): BattleDebugEdit[] {
  switch (phase) {
    case "draw":
      return drawsAtStartOfTurn(side, turnNumber)
        ? [{ kind: "DRAW_CARD", side }]
        : [];
    case "dawn":
      return [];
    case "ending":
      return [
        ...handLimitDiscardEdits(state, side, handLimit),
        ...endingBanishEdits(state, side),
      ];
    default:
      return [];
  }
}

/**
 * Discards the outgoing side's most-recently-acquired cards down to the hand
 * limit (rules §Turn Structure — Ending).
 */
function handLimitDiscardEdits(
  state: BattleMutableState,
  side: BattleSide,
  handLimit: number,
): BattleDebugEdit[] {
  const hand = state.sides[side].hand;
  const excess = hand.length - handLimit;
  if (excess <= 0) {
    return [];
  }
  const edits: BattleDebugEdit[] = [];
  for (let index = 0; index < excess; index += 1) {
    const battleCardId = hand[hand.length - 1 - index];
    edits.push({ kind: "DISCARD_CARD", battleCardId });
  }
  return edits;
}

/**
 * Forces the battle result (from the player's POV) when the Challenge scoring
 * pushes a side to the victory threshold (rules §Objective).
 */
function buildVictoryCommand(
  state: BattleMutableState,
  challenge: ChallengeResolution,
  scoreToWin: number,
): BattleCommand | null {
  const projectedPlayer = state.sides.player.score + challenge.playerScoreDelta;
  const projectedEnemy = state.sides.enemy.score + challenge.enemyScoreDelta;
  const result: BattleResult | null =
    projectedPlayer >= scoreToWin
      ? "victory"
      : projectedEnemy >= scoreToWin
        ? "defeat"
        : null;
  if (result === null) {
    return null;
  }
  return { id: "FORCE_RESULT", result, sourceSurface: "auto-system" };
}

/** Wraps an automation-authored debug edit as an `auto-system` command. */
function autoCommand(edit: BattleDebugEdit): BattleCommand {
  return { id: "DEBUG_EDIT", edit, sourceSurface: "auto-system" };
}
