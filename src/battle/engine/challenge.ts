import type { BattleDebugEdit } from "../debug/commands";
import {
  isFigmentInstance,
  selectEffectiveSparkForInstance,
  selectFigmentChallengeLossCount,
  selectFigmentCount,
} from "../state/figments";
import type {
  BattleCardInstance,
  BattleLaneJudgment,
  BattleMutableState,
  BattleSide,
  FrontRankSlotId,
} from "../types";
import { FRONT_RANK_SLOT_IDS } from "../types";

/**
 * The unified, keyword-aware Challenge resolver (rules §Challengers, Defenders,
 * and Scoring + §Figments + §Keywords). It resolves every front-rank lane for
 * one active side as a pure proposal: it reads `input.state` but never mutates
 * it, never performs the void moves itself, and never interprets a card's
 * printed effect prose. The ONLY card text it reads is the narrow scan for the
 * four combat keywords below (see `hasCombatKeyword`); everything else is driven
 * by board structure and card fields (spark, type, figment membership).
 *
 * The four combat keywords (rules §Keywords and Effects):
 *
 *  - **Unstoppable** — a surviving defended character scores ⍟ equal to its
 *    spark, in addition to resolving the spark comparison normally.
 *  - **Vengeful** — when its bearer loses a challenge, it drags the opposing
 *    enemy character down too (both dissolve).
 *  - **Preeminence** — wins spark ties; if both characters in a lane have
 *    Preeminence the tie resolves normally (both dissolve).
 *  - **Awakened** — an enter-play / exhaustion keyword. It has no effect on
 *    Challenge resolution (scoring or dissolution); it is detected here only so
 *    keyword detection is uniform across all four combat keywords. The exhaust
 *    system, not this resolver, consumes Awakened.
 *
 * Keyword detection precedence (rules §Figments — implicit keywords): an
 * effect-`granted*` status flag first, then the narrow printed-text scan, then
 * the figment type's implicit keyword.
 *
 * TODO(designations): the resolver reads live front-rank positions. Challenger /
 * defender designation snapshotting (spec §4.3 — designations are fixed at the
 * end of Day / Dusk and can be changed by Night repositioning) is deferred; once
 * modeled, this resolver should read the snapshot instead of the live board.
 */

export interface ChallengeInput {
  state: BattleMutableState;
  activeSide: BattleSide;
  /**
   * Optional +✦ to add to a battleCardId's effective spark (Support / static
   * effects). Caller-supplied; empty for the human path (an unmodeled board).
   */
  supportContribution?: ReadonlyMap<string, number>;
}

export interface ChallengeResolution {
  /** Per-lane outcome, `F0`→`F3` in order. */
  lanes: readonly BattleLaneJudgment[];
  /** ADJUST_SCORE + MOVE_CARD_TO_ZONE(void) edits that commit the outcome. */
  edits: BattleDebugEdit[];
  /** Every character that dissolves to the void, with its side. */
  dissolved: readonly { battleCardId: string; side: BattleSide }[];
  playerScoreDelta: number;
  enemyScoreDelta: number;
}

/** A combat keyword the resolver detects. */
export type CombatKeyword =
  | "unstoppable"
  | "vengeful"
  | "preeminence"
  | "awakened";

/**
 * Figment base types carry an implicit combat keyword (rules §Figments). Their
 * printed text is usually empty, so the subtype is the only signal of the
 * keyword. Relocated from `basic-automation.ts` so detection lives with the
 * resolver. Synth's Support keyword is not a combat keyword and is absent here.
 */
const FIGMENT_KEYWORDS: Readonly<Record<string, CombatKeyword>> = {
  ancient: "unstoppable",
  wraith: "vengeful",
  celestial: "preeminence",
  ember: "awakened",
};

/**
 * The narrow, sanctioned text scan: the ONLY place the engine reads printed card
 * prose, and it is limited to detecting these four combat-keyword lines. Each
 * pattern is a whole-word, case-insensitive match for the keyword name.
 */
const KEYWORD_PATTERNS: Readonly<Record<CombatKeyword, RegExp>> = {
  unstoppable: /\bunstoppable\b/i,
  vengeful: /\bvengeful\b/i,
  preeminence: /\bpreeminence\b/i,
  awakened: /\bawakened\b/i,
};

/**
 * The effect-`granted*` status flag for a given combat keyword (rules §Card
 * status). Read before the text scan so a keyword granted by an effect is
 * honored even when the printed text lacks the keyword.
 */
const GRANTED_FLAGS: Readonly<
  Record<CombatKeyword, keyof BattleCardInstance["status"]>
> = {
  unstoppable: "grantedUnstoppable",
  vengeful: "grantedVengeful",
  preeminence: "grantedPreeminence",
  awakened: "grantedAwakened",
};

/**
 * Whether `instance` carries `keyword`, checking, in precedence order: the
 * effect-`granted*` status flag, then the narrow printed-text scan, then the
 * figment type's implicit keyword. This is the sole reader of card prose in the
 * engine and is strictly limited to the four combat keywords.
 */
export function hasCombatKeyword(
  instance: BattleCardInstance,
  keyword: CombatKeyword,
): boolean {
  if (instance.status[GRANTED_FLAGS[keyword]] === true) {
    return true;
  }
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
 * Resolves the Challenge phase for one active side (rules §Challenge phase
 * resolution). Lanes `F0`→`F3` are resolved in order. Pure: it never mutates
 * `state`.
 */
export function resolveChallenge(input: ChallengeInput): ChallengeResolution {
  const { state, activeSide } = input;
  const supportContribution = input.supportContribution;
  const opposingSide: BattleSide = activeSide === "player" ? "enemy" : "player";

  const lanes: BattleLaneJudgment[] = [];
  const dissolved: { battleCardId: string; side: BattleSide }[] = [];
  let activeScored = 0;
  let opposingScored = 0;

  for (const slotId of FRONT_RANK_SLOT_IDS) {
    const lane = resolveLane({
      state,
      slotId,
      activeSide,
      opposingSide,
      supportContribution,
      dissolved,
    });
    lanes.push(lane.judgment);
    activeScored += lane.activeScored;
    opposingScored += lane.opposingScored;
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
    lanes,
    edits,
    dissolved,
    playerScoreDelta: activeSide === "player" ? activeScored : opposingScored,
    enemyScoreDelta: activeSide === "enemy" ? activeScored : opposingScored,
  };
}

interface LaneResolution {
  judgment: BattleLaneJudgment;
  activeScored: number;
  opposingScored: number;
}

function resolveLane(params: {
  state: BattleMutableState;
  slotId: FrontRankSlotId;
  activeSide: BattleSide;
  opposingSide: BattleSide;
  supportContribution: ReadonlyMap<string, number> | undefined;
  dissolved: { battleCardId: string; side: BattleSide }[];
}): LaneResolution {
  const {
    state,
    slotId,
    activeSide,
    opposingSide,
    supportContribution,
    dissolved,
  } = params;

  const challengerId = state.sides[activeSide].frontRank[slotId];
  const defenderId = state.sides[opposingSide].frontRank[slotId];
  const challenger =
    challengerId === null ? null : state.cardInstances[challengerId] ?? null;
  const defender =
    defenderId === null ? null : state.cardInstances[defenderId] ?? null;

  const challengerSpark =
    challenger === null
      ? 0
      : effectiveSpark(challenger, challengerId, supportContribution);
  const defenderSpark =
    defender === null
      ? 0
      : effectiveSpark(defender, defenderId, supportContribution);

  // `playerSpark`/`enemySpark` always describe the actual side in that lane.
  const playerSpark = activeSide === "player" ? challengerSpark : defenderSpark;
  const enemySpark = activeSide === "player" ? defenderSpark : challengerSpark;

  const lane = (winner: BattleSide | null, scoreDelta: number): BattleLaneJudgment => ({
    slotId,
    playerSpark,
    enemySpark,
    winner,
    scoreDelta,
  });

  // A lane with no challenger never scores or dissolves for the active side —
  // whether it holds an opposing defender or is empty, nothing happens.
  if (challenger === null || challengerId === null) {
    return { judgment: lane(null, 0), activeScored: 0, opposingScored: 0 };
  }

  // Unpaired challenger: scores ⍟ equal to its effective spark.
  if (defender === null || defenderId === null) {
    return {
      judgment: lane(null, challengerSpark),
      activeScored: challengerSpark,
      opposingScored: 0,
    };
  }

  // Both present: resolve the spark comparison, with Preeminence breaking ties.
  const baseChallengerDissolves = dissolvesAgainst(
    challenger,
    challengerSpark,
    defender,
    defenderSpark,
  );
  const baseDefenderDissolves = dissolvesAgainst(
    defender,
    defenderSpark,
    challenger,
    challengerSpark,
  );
  let challengerDissolves = baseChallengerDissolves;
  let defenderDissolves = baseDefenderDissolves;

  // Vengeful: a bearer that loses drags the opposing character down too.
  if (baseChallengerDissolves && hasCombatKeyword(challenger, "vengeful")) {
    defenderDissolves = true;
  }
  if (baseDefenderDissolves && hasCombatKeyword(defender, "vengeful")) {
    challengerDissolves = true;
  }

  // Unstoppable: a defended character that survives still scores its spark.
  let activeScored = 0;
  let opposingScored = 0;
  if (!challengerDissolves && defenderDissolves && hasCombatKeyword(challenger, "unstoppable")) {
    activeScored += challengerSpark;
  }
  if (!defenderDissolves && challengerDissolves && hasCombatKeyword(defender, "unstoppable")) {
    opposingScored += defenderSpark;
  }

  if (challengerDissolves) {
    dissolved.push({ battleCardId: challengerId, side: activeSide });
  }
  if (defenderDissolves) {
    dissolved.push({ battleCardId: defenderId, side: opposingSide });
  }

  // `winner` is the side whose character survives a resolved pairing, or null
  // when both dissolve (a tie) — there is no defeated opponent to name.
  let winner: BattleSide | null = null;
  if (defenderDissolves && !challengerDissolves) {
    winner = activeSide;
  } else if (challengerDissolves && !defenderDissolves) {
    winner = opposingSide;
  }

  // The lane's `scoreDelta` records the points scored *in this lane*. Only an
  // unpaired challenger or a surviving Unstoppable character scores, so at most
  // one side scores per defended lane; report that total.
  return {
    judgment: lane(winner, activeScored + opposingScored),
    activeScored,
    opposingScored,
  };
}

/**
 * Effective spark for an instance = its base effective spark plus any
 * support/static contribution targeted at its battleCardId.
 */
function effectiveSpark(
  instance: BattleCardInstance,
  battleCardId: string | null,
  supportContribution: ReadonlyMap<string, number> | undefined,
): number {
  const base = selectEffectiveSparkForInstance(instance);
  const bonus =
    battleCardId === null ? 0 : supportContribution?.get(battleCardId) ?? 0;
  return base + bonus;
}

/**
 * Whether `self` dissolves when challenged against `opposing`. A non-figment
 * dissolves on a lower or tied spark, except a tie won by Preeminence. A figment
 * stack dissolves only when the opposing spark covers every member figment
 * (top-down loss count, rules §Figments), and a fully-covered stack still
 * survives an exact tie if it wins by Preeminence.
 */
function dissolvesAgainst(
  self: BattleCardInstance,
  selfSpark: number,
  opposing: BattleCardInstance,
  opposingSpark: number,
): boolean {
  if (isFigmentInstance(self)) {
    const fullyDissolved =
      selectFigmentChallengeLossCount(self, opposingSpark) >= selectFigmentCount(self);
    if (!fullyDissolved) {
      return false;
    }
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
function winsTieByPreeminence(
  self: BattleCardInstance,
  opposing: BattleCardInstance,
): boolean {
  return (
    hasCombatKeyword(self, "preeminence") &&
    !hasCombatKeyword(opposing, "preeminence")
  );
}
