import type { BattleDebugEdit } from "../debug/commands";
import {
  isFigmentInstance,
  selectEffectiveSparkForInstance,
  selectFigmentCount,
  selectFigmentReserveSpark,
  selectFigmentSparkContext,
  selectTopmostFigmentSpark,
} from "../state/figments";
import type {
  BattleCardInstance,
  BattleLaneJudgment,
  BattleMutableState,
  BattleSide,
  FrontRankSlotId,
} from "../types";
import { frontRankSlotIds, rankSlotIds, slotIndex } from "../types";

/**
 * The unified, keyword-aware Challenge resolver (rules §Challengers, Blockers,
 * and Scoring + §Figments + §Keywords). It resolves every front-rank lane for
 * one active side as a pure proposal: it reads `input.state` but never mutates
 * it, never performs the void moves itself, and never interprets a card's
 * printed effect prose. The ONLY card text it reads is the narrow scan for the
 * two combat keywords below (see `hasCombatKeyword`); everything else is driven
 * by board structure and card fields (spark, type, figment membership).
 *
 * The two combat keywords (rules §Keywords and Effects):
 *
 *  - **Vengeful** — when its bearer loses a challenge, it drags the opposing
 *    enemy character down too (both dissolve).
 *  - **Awakened** — an enter-play / exhaustion keyword. It has no effect on
 *    Challenge resolution (scoring or dissolution); it is detected here only so
 *    keyword detection is uniform across both combat keywords. The exhaust
 *    system, not this resolver, consumes Awakened.
 *
 * Keyword detection precedence (rules §Figments — implicit keywords): an
 * effect-`granted*` status flag first, then the narrow printed-text scan, then
 * the figment type's implicit keyword.
 *
 * TODO(designations): the resolver reads live front-rank positions. Challenger /
 * blocker designation snapshotting (spec §4.3 — designations are fixed at the
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
  /** Per-lane outcome, `F0`→`F8` in order. */
  lanes: readonly BattleLaneJudgment[];
  /** ADJUST_SCORE + MOVE_CARD_TO_ZONE(void) edits that commit the outcome. */
  edits: BattleDebugEdit[];
  /** Every character that dissolves to the void, with its side. */
  dissolved: readonly { battleCardId: string; side: BattleSide }[];
  playerScoreDelta: number;
  enemyScoreDelta: number;
}

/** Resolves one authoritative Challenge lane against the supplied current board. */
export function resolveChallengeLane(
  input: ChallengeInput & { slotId: FrontRankSlotId },
): ChallengeResolution {
  const { state, activeSide, slotId, supportContribution } = input;
  const opposingSide: BattleSide = activeSide === "player" ? "enemy" : "player";
  const dissolved: { battleCardId: string; side: BattleSide }[] = [];
  const lane = resolveLane({
    state,
    slotId,
    activeSide,
    opposingSide,
    supportContribution,
    dissolved,
  });
  return resolutionFromLanes(activeSide, [lane], dissolved);
}

/** A combat keyword the resolver detects. */
export type CombatKeyword = "vengeful" | "awakened";

/**
 * Figment base types carry an implicit combat keyword (rules §Figments). Their
 * printed text is usually empty, so the subtype is the only signal of the
 * keyword. Relocated from `basic-automation.ts` so detection lives with the
 * resolver. The inherent keyword is carried by every figment of that type, so a
 * promoted reserve keeps it.
 */
const FIGMENT_KEYWORDS: Readonly<Record<string, CombatKeyword>> = {
  wraith: "vengeful",
  ember: "awakened",
};

/**
 * The narrow, sanctioned text scan: the ONLY place the engine reads printed card
 * prose, and it is limited to detecting these combat-keyword lines. Each
 * pattern is a whole-word, case-insensitive match for the keyword name.
 */
const KEYWORD_PATTERNS: Readonly<Record<CombatKeyword, RegExp>> = {
  vengeful: /\bvengeful\b/i,
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
  vengeful: "grantedVengeful",
  awakened: "grantedAwakened",
};

/**
 * Whether `instance` carries `keyword`, checking, in precedence order: the
 * effect-`granted*` status flag, then the narrow printed-text scan, then the
 * figment type's implicit keyword. This is the sole reader of card prose in the
 * engine and is strictly limited to the two combat keywords.
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
 * resolution). Lanes `F0`→`F8` are resolved in order. Pure: it never mutates
 * `state`.
 */
/** One past the highest occupied front-rank index, or 0 when the rank is empty. */
function occupiedFrontRankWidth(frontRank: Record<FrontRankSlotId, string | null>): number {
  let width = 0;
  for (const slotId of rankSlotIds(frontRank)) {
    if (frontRank[slotId] !== null) {
      width = Math.max(width, slotIndex(slotId) + 1);
    }
  }
  return width;
}

export function resolveChallenge(input: ChallengeInput): ChallengeResolution {
  const { state, activeSide } = input;
  const supportContribution = input.supportContribution;
  const opposingSide: BattleSide = activeSide === "player" ? "enemy" : "player";

  const laneResults: LaneResolution[] = [];
  const dissolved: { battleCardId: string; side: BattleSide }[] = [];

  // Lanes pair the same front-rank index across both sides and span every
  // occupied lane (the front rank grows without bound). Empty-vs-empty lanes
  // beyond the last occupant contribute nothing, so they are not resolved.
  const laneCount = Math.max(
    occupiedFrontRankWidth(state.sides[activeSide].frontRank),
    occupiedFrontRankWidth(state.sides[opposingSide].frontRank),
  );
  for (const slotId of frontRankSlotIds(laneCount)) {
    const lane = resolveLane({
      state,
      slotId,
      activeSide,
      opposingSide,
      supportContribution,
      dissolved,
    });
    laneResults.push(lane);
  }

  return resolutionFromLanes(
    activeSide,
    laneResults,
    dissolved,
  );
}

/** Builds the public resolution shape while retaining score edits before moves. */
function resolutionFromLanes(
  activeSide: BattleSide,
  lanes: readonly LaneResolution[],
  dissolved: readonly { battleCardId: string; side: BattleSide }[],
): ChallengeResolution {
  const activeScored = lanes.reduce((total, lane) => total + lane.activeScored, 0);
  const edits: BattleDebugEdit[] = [];
  if (activeScored > 0) {
    edits.push({ kind: "ADJUST_SCORE", side: activeSide, amount: activeScored });
  }
  for (const entry of dissolved) {
    edits.push({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: entry.battleCardId,
      destination: { side: entry.side, zone: "void" },
    });
  }
  return {
    lanes: lanes.map((lane) => lane.judgment),
    edits,
    dissolved: [...dissolved],
    playerScoreDelta: activeSide === "player" ? activeScored : 0,
    enemyScoreDelta: activeSide === "enemy" ? activeScored : 0,
  };
}

interface LaneResolution {
  judgment: BattleLaneJudgment;
  activeScored: number;
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

  const challengerId = state.sides[activeSide].frontRank[slotId] ?? null;
  const blockerId = state.sides[opposingSide].frontRank[slotId] ?? null;
  const challenger =
    challengerId === null ? null : state.cardInstances[challengerId] ?? null;
  const blocker =
    blockerId === null ? null : state.cardInstances[blockerId] ?? null;

  const challengerSpark = laneSpark(state, challenger, challengerId, supportContribution);
  const blockerSpark = laneSpark(state, blocker, blockerId, supportContribution);

  // `playerSpark`/`enemySpark` describe the spark that actually fights in that
  // lane — for a figment stack, the topmost figment alone (rules §Figments).
  const playerSpark = activeSide === "player" ? challengerSpark.compare : blockerSpark.compare;
  const enemySpark = activeSide === "player" ? blockerSpark.compare : challengerSpark.compare;

  const lane = (winner: BattleSide | null, scoreDelta: number): BattleLaneJudgment => ({
    slotId,
    playerSpark,
    enemySpark,
    winner,
    scoreDelta,
  });

  // A lane with no challenger never scores or dissolves for the active side —
  // whether it holds an opposing blocker or is empty, nothing happens.
  if (challenger === null || challengerId === null) {
    return { judgment: lane(null, 0), activeScored: 0 };
  }

  // Unpaired challenger: scores ⍟ equal to its total spark. For a figment stack
  // every figment is unopposed, so the whole stack scores (rules §Figments).
  if (blocker === null || blockerId === null) {
    return {
      judgment: lane(null, challengerSpark.total),
      activeScored: challengerSpark.total,
    };
  }

  // Both present: resolve the topmost-vs-topmost spark comparison. A losing
  // Figment stack loses only its topmost member; the leave-play replacement
  // keeps its reserves in play.
  const baseChallengerDissolves = dissolvesAgainst(
    challengerSpark.compare,
    blockerSpark.compare,
  );
  const baseBlockerDissolves = dissolvesAgainst(
    blockerSpark.compare,
    challengerSpark.compare,
  );
  let challengerDissolves = baseChallengerDissolves;
  let blockerDissolves = baseBlockerDissolves;

  // Vengeful: a bearer that loses drags the opposing character down too.
  if (baseChallengerDissolves && hasCombatKeyword(challenger, "vengeful")) {
    blockerDissolves = true;
  }
  if (baseBlockerDissolves && hasCombatKeyword(blocker, "vengeful")) {
    challengerDissolves = true;
  }

  // Scoring. Only a challenger scores (rules §Figments — Challenge resolution).
  let activeScored = 0;

  // The challenger's reserve figments are unopposed and always score; a
  // non-figment has no reserves. When the contested challenger wins and
  // survives, it scores its spark advantage over the blocker.
  activeScored += challengerSpark.reserve;
  if (!challengerDissolves && blockerDissolves) {
    activeScored += Math.max(0, challengerSpark.compare - blockerSpark.compare);
  }

  if (challengerDissolves) {
    dissolved.push({ battleCardId: challengerId, side: activeSide });
  }
  if (blockerDissolves) {
    dissolved.push({ battleCardId: blockerId, side: opposingSide });
  }

  // `winner` is the side whose character survives a resolved pairing, or null
  // when both dissolve (a tie) — there is no defeated opponent to name.
  let winner: BattleSide | null = null;
  if (blockerDissolves && !challengerDissolves) {
    winner = activeSide;
  } else if (challengerDissolves && !blockerDissolves) {
    winner = opposingSide;
  }

  // The lane's `scoreDelta` records the points scored *in this lane*. At most
  // the active challenger can score in a blocked lane.
  return {
    judgment: lane(winner, activeScored),
    activeScored,
  };
}

/** The spark figures a lane participant brings to a challenge. */
interface LaneSpark {
  /** Spark used in the win/lose comparison — the topmost figment alone. */
  compare: number;
  /** Total spark the participant can score when fully unopposed. */
  total: number;
  /** Reserve-figment spark that scores even behind a contested topmost. */
  reserve: number;
}

/**
 * Resolves the spark a lane participant fights and scores with. A non-figment
 * fights and scores with its full effective spark (plus any support); a figment
 * stack fights with its topmost figment but can score its reserves separately
 * (rules §Figments — Challenge resolution). A stack's Support contribution is
 * divided evenly across its figments because each member receives the bonus.
 */
function laneSpark(
  state: BattleMutableState,
  instance: BattleCardInstance | null,
  battleCardId: string | null,
  supportContribution: ReadonlyMap<string, number> | undefined,
): LaneSpark {
  if (instance === null) {
    return { compare: 0, total: 0, reserve: 0 };
  }
  if (isFigmentInstance(instance)) {
    const context = selectFigmentSparkContext(state, instance);
    const support =
      battleCardId === null ? 0 : supportContribution?.get(battleCardId) ?? 0;
    const count = Math.max(1, selectFigmentCount(instance));
    const topmostSupport = support / count;
    return {
      compare: selectTopmostFigmentSpark(instance, context) + topmostSupport,
      total: selectEffectiveSparkForInstance(instance, context) + support,
      reserve:
        selectFigmentReserveSpark(instance, context) + support - topmostSupport,
    };
  }
  const bonus =
    battleCardId === null ? 0 : supportContribution?.get(battleCardId) ?? 0;
  const spark = selectEffectiveSparkForInstance(instance) + bonus;
  return { compare: spark, total: spark, reserve: 0 };
}

/**
 * Whether a participant loses its spark comparison. A character dissolves on
 * lower or tied spark. For a figment stack `selfSpark`/`opposingSpark` are the
 * topmost figments' sparks, so a losing stack loses only its topmost Figment
 * through the leave-play replacement.
 */
function dissolvesAgainst(
  selfSpark: number,
  opposingSpark: number,
): boolean {
  return selfSpark <= opposingSpark;
}
