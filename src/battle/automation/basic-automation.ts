import type { BattleCommand, BattleDebugEdit } from "../debug/commands";
import { energyRampEdits } from "../engine/energy";
import {
  isFigmentInstance,
  selectEffectiveSparkForInstance,
  selectFigmentChallengeLossCount,
  selectFigmentCount,
} from "../state/figments";
import { selectBattleCardLocation } from "../state/selectors";
import type {
  BattleCardInstance,
  BattleMutableState,
  BattleResult,
  BattleSide,
} from "../types";
import { DEPLOY_SLOT_IDS } from "../types";

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
 *  - **Playing a card costs energy.** Moving a card from hand into play (a
 *    battlefield slot or the stack) reduces the controller's current ● by the
 *    card's energy cost (rules §Playing Cards and the Stack).
 *  - **Events resolve to the void.** An event played from hand is routed to the
 *    void instead of staying in play (rules §Card Types — Event).
 *  - **The Challenge phase resolves by spark.** When the active player ends
 *    their turn, each front-rank lane (`D0`–`D3`) is resolved by comparing
 *    spark: the lower-spark character dissolves to the void, an unpaired
 *    challenger scores ⍟ equal to its spark, and the keyword rules below apply
 *    (rules §Challengers, Defenders, and Scoring).
 *  - **Keyword awareness.** Preeminence wins spark ties, Vengeful drags the
 *    winner down when its bearer loses, and Unstoppable scores when a defended
 *    character survives (rules §Keywords and Effects).
 *  - **Start of turn ramps energy and draws.** The incoming player's energy
 *    ramps to the per-turn maximum and they draw a card (skipped on the very
 *    first turn of the battle) (rules §Turn Structure — Dreamwell / Draw).
 *  - **End-of-turn hand limit.** The outgoing player discards down to ten cards
 *    (rules §Turn Structure — Ending).
 *  - **Victory threshold.** When a side reaches the score threshold after the
 *    Challenge resolves, the battle result is forced (rules §Objective).
 */

/** Hand-size limit enforced during the Ending phase (rules §Zones — Hand). */
export const BASIC_AUTOMATION_HAND_LIMIT = 10;

/** Caps the automation needs from `BattleInit` to ramp energy and detect a win. */
export interface BasicAutomationCaps {
  maxEnergyCap: number;
  scoreToWin: number;
}

type ResolutionKeyword = "unstoppable" | "vengeful" | "preeminence";

/**
 * Figment base types carry an implicit keyword (rules §Figments). Their printed
 * text is usually empty, so the subtype is the only signal of the keyword.
 */
const FIGMENT_KEYWORDS: Readonly<Record<string, ResolutionKeyword>> = {
  ancient: "unstoppable",
  wraith: "vengeful",
  celestial: "preeminence",
};

const KEYWORD_PATTERNS: Readonly<Record<ResolutionKeyword, RegExp>> = {
  unstoppable: /\bunstoppable\b/i,
  vengeful: /\bvengeful\b/i,
  preeminence: /\bpreeminence\b/i,
};

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
    case "SET_BATTLE_FLOW":
      return planTurnHandoff(state, command, command.edit, caps);
    case "SET_PHASE":
      return command.edit.phase === "challenge"
        ? planChallengeOnly(state, command, caps)
        : [command];
    default:
      return [command];
  }
}

/**
 * A "play" is moving a card out of hand and into play (a battlefield slot or the
 * stack). Playing costs energy; an event is routed straight to the void.
 */
function planCardPlay(
  state: BattleMutableState,
  command: BattleCommand & { id: "DEBUG_EDIT" },
  edit: Extract<BattleDebugEdit, { kind: "MOVE_CARD_TO_ZONE" }>,
): BattleCommand[] {
  const location = selectBattleCardLocation(state, edit.battleCardId);
  if (location?.zone !== "hand") {
    return [command];
  }

  const destination = edit.destination;
  const isPlayDestination =
    "slotId" in destination || destination.zone === "stack";
  if (!isPlayDestination) {
    return [command];
  }

  const instance = state.cardInstances[edit.battleCardId];
  if (instance === undefined) {
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

  const commands: BattleCommand[] = [primary];

  // Reduce current ● by the card's cost, clamped so energy never goes negative.
  const cost = Math.max(0, instance.definition.energyCost);
  const spend = Math.min(cost, state.sides[side].currentEnergy);
  if (spend > 0) {
    commands.push(autoCommand({
      kind: "ADJUST_CURRENT_ENERGY",
      side,
      amount: -spend,
    }));
  }

  return commands;
}

/**
 * A turn handoff (the `SET_BATTLE_FLOW` that flips the active side) ends the
 * outgoing player's turn and begins the incoming player's. Automation resolves
 * the outgoing Challenge, enforces the hand limit, forces a result if the
 * threshold was reached, then ramps energy and draws for the incoming side.
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
    return [command];
  }

  const challenge = resolveChallenge(state, outgoingSide);
  const commands: BattleCommand[] = challenge.edits.map(autoCommand);

  const victoryCommand = buildVictoryCommand(state, challenge, caps.scoreToWin);
  if (victoryCommand !== null) {
    commands.push(victoryCommand);
  }

  for (const discardEdit of handLimitDiscardEdits(state, outgoingSide)) {
    commands.push(autoCommand(discardEdit));
  }

  // The user's own flow edit performs the side flip.
  commands.push(command);

  for (const rampEdit of energyRampEdits(incomingSide, edit.turnNumber, caps.maxEnergyCap)) {
    commands.push(autoCommand(rampEdit));
  }

  // Draw for the incoming side, skipping the very first turn of the battle.
  if (edit.turnNumber > 1) {
    commands.push(autoCommand({ kind: "DRAW_CARD", side: incomingSide }));
  }

  return commands;
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
  const challenge = resolveChallenge(state, state.activeSide);
  const commands: BattleCommand[] = [command, ...challenge.edits.map(autoCommand)];
  const victoryCommand = buildVictoryCommand(state, challenge, caps.scoreToWin);
  if (victoryCommand !== null) {
    commands.push(victoryCommand);
  }
  return commands;
}

export interface ChallengeResolution {
  edits: BattleDebugEdit[];
  playerScoreDelta: number;
  enemyScoreDelta: number;
}

/**
 * Resolves every front-rank lane for `activeSide`, returning the score deltas
 * and the edits (score adjustments + void moves) that commit the outcome. Pure:
 * it never mutates `state`.
 */
export function resolveChallenge(
  state: BattleMutableState,
  activeSide: BattleSide,
): ChallengeResolution {
  const opposingSide: BattleSide = activeSide === "player" ? "enemy" : "player";
  const dissolved: { battleCardId: string; side: BattleSide }[] = [];
  let activeScored = 0;
  let opposingScored = 0;

  for (const slotId of DEPLOY_SLOT_IDS) {
    const challengerId = state.sides[activeSide].deployed[slotId];
    const defenderId = state.sides[opposingSide].deployed[slotId];
    const challenger = challengerId === null ? null : state.cardInstances[challengerId] ?? null;
    const defender = defenderId === null ? null : state.cardInstances[defenderId] ?? null;

    // A lane with no challenger never scores or dissolves for the active side.
    if (challenger === null || challengerId === null) {
      continue;
    }

    const challengerSpark = selectEffectiveSparkForInstance(challenger);

    // Unpaired challenger: scores ⍟ equal to its spark.
    if (defender === null || defenderId === null) {
      activeScored += challengerSpark;
      continue;
    }

    const defenderSpark = selectEffectiveSparkForInstance(defender);

    // Base spark comparison, with Preeminence breaking ties.
    const baseChallengerDissolves = dissolvesAgainst(challenger, challengerSpark, defender, defenderSpark);
    const baseDefenderDissolves = dissolvesAgainst(defender, defenderSpark, challenger, challengerSpark);
    let challengerDissolves = baseChallengerDissolves;
    let defenderDissolves = baseDefenderDissolves;

    // Vengeful: a bearer that loses dissolves the opposing character too.
    if (baseChallengerDissolves && hasKeyword(challenger, "vengeful")) {
      defenderDissolves = true;
    }
    if (baseDefenderDissolves && hasKeyword(defender, "vengeful")) {
      challengerDissolves = true;
    }

    // Unstoppable: a defended character that survives still scores its spark.
    if (!challengerDissolves && defenderDissolves && hasKeyword(challenger, "unstoppable")) {
      activeScored += challengerSpark;
    }
    if (!defenderDissolves && challengerDissolves && hasKeyword(defender, "unstoppable")) {
      opposingScored += defenderSpark;
    }

    if (challengerDissolves) {
      dissolved.push({ battleCardId: challengerId, side: activeSide });
    }
    if (defenderDissolves) {
      dissolved.push({ battleCardId: defenderId, side: opposingSide });
    }
  }

  const edits: BattleDebugEdit[] = [];
  if (activeScored > 0) {
    edits.push({ kind: "ADJUST_SCORE", side: activeSide, amount: activeScored });
  }
  if (opposingScored > 0) {
    edits.push({ kind: "ADJUST_SCORE", side: opposingSide, amount: opposingScored });
  }
  for (const entry of dissolved) {
    edits.push({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: entry.battleCardId,
      destination: { side: entry.side, zone: "void" },
    });
  }

  return {
    edits,
    playerScoreDelta: activeSide === "player" ? activeScored : opposingScored,
    enemyScoreDelta: activeSide === "enemy" ? activeScored : opposingScored,
  };
}

/**
 * Whether `self` dissolves when challenged against `opposing`. A non-figment
 * dissolves on a lower or tied spark, except a tie won by Preeminence. A figment
 * stack dissolves only when the opposing spark covers every figment.
 */
function dissolvesAgainst(
  self: BattleCardInstance,
  selfSpark: number,
  opposing: BattleCardInstance,
  opposingSpark: number,
): boolean {
  if (isFigmentInstance(self)) {
    const fullyDissolved = selectFigmentChallengeLossCount(self, opposingSpark) >= selectFigmentCount(self);
    if (!fullyDissolved) {
      return false;
    }
    // A stack whose total spark exactly ties survives if its top figment has
    // Preeminence (rules §Figments / §Keywords).
    if (selfSpark === opposingSpark && winsTieByPreeminence(self, opposing)) {
      return false;
    }
    return true;
  }
  if (selfSpark > opposingSpark) {
    return false;
  }
  if (selfSpark < opposingSpark) {
    return true;
  }
  // Spark tie: Preeminence wins unless the opponent also has it.
  return !winsTieByPreeminence(self, opposing);
}

/** Whether `self` wins a spark tie because only it carries Preeminence. */
function winsTieByPreeminence(self: BattleCardInstance, opposing: BattleCardInstance): boolean {
  return hasKeyword(self, "preeminence") && !hasKeyword(opposing, "preeminence");
}

function hasKeyword(instance: BattleCardInstance, keyword: ResolutionKeyword): boolean {
  const text = instance.definition.renderedText;
  if (text && KEYWORD_PATTERNS[keyword].test(text)) {
    return true;
  }
  if (isFigmentInstance(instance)) {
    const subtype = instance.definition.subtype.trim().toLowerCase();
    return FIGMENT_KEYWORDS[subtype] === keyword;
  }
  return false;
}

/**
 * Discards the outgoing side's most-recently-acquired cards down to the hand
 * limit (rules §Turn Structure — Ending).
 */
function handLimitDiscardEdits(
  state: BattleMutableState,
  side: BattleSide,
): BattleDebugEdit[] {
  const hand = state.sides[side].hand;
  const excess = hand.length - BASIC_AUTOMATION_HAND_LIMIT;
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
  const result: BattleResult | null = projectedPlayer >= scoreToWin
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
