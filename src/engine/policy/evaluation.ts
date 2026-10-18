/**
 * The Phase 7 position evaluation (phase-7-ai § 7.2): hand-written features
 * of one side's view of a battle, each weighted by `AI.evaluation`. It reads
 * only the view, both decklists and the printed catalog, so it never sees
 * hidden information (D22). Every feature is scored from the evaluating
 * side, positive when it favors that side, and the breakdown is reported
 * beside the total for policies and their decision logs.
 */
import { AI } from "../../content/ai";
import type { EngineCatalog } from "../catalog";
import { abilityEffect } from "../dsl/abilities";
import { BASE_VARIANT } from "../dsl/types";
import { everyNode } from "../effects/interpreter";
import { opponent, type CardId, type InstanceId, type Side } from "../state/ids";
import type { Decklists } from "../view/determinize";
import type { BattleView, SideView } from "../view/view";

const EVALUATION = AI.evaluation;

/** One feature of the evaluation; `AI.evaluation.weights` has one weight per feature. */
export type EvaluationFeature = keyof typeof EVALUATION.weights;

/** A position's value for one side: the total and each feature's weighted contribution to it. */
export interface Evaluation {
  readonly total: number;
  readonly features: Readonly<Record<EvaluationFeature, number>>;
}

/** What the evaluation reads besides the view: the printed catalog and both journey decklists. */
export interface EvaluationContext {
  readonly catalog: EngineCatalog;
  readonly decklists: Decklists;
}

/** Effect primitives that remove an opposing character or answer a play. */
const REMOVAL_OPS: readonly string[] = ["dissolve", "banish", "banishUntil", "gainControl", "returnToHand", "prevent"];

/** Whether a card is an Interrupt or prints a removal effect, by its printed text, memoized per evaluation. */
function threatClassifier(catalog: EngineCatalog): (cardId: CardId) => boolean {
  const known = new Map<CardId, boolean>();
  return (cardId) => {
    const cached = known.get(cardId);
    if (cached !== undefined) return cached;
    const card = catalog.card(cardId);
    const threat = card.speed === "interrupt" || card.abilities(BASE_VARIANT).some((ability) => {
      const effect = abilityEffect(ability);
      return effect !== null && everyNode(effect).some((node) => REMOVAL_OPS.includes(node.op));
    });
    known.set(cardId, threat);
    return threat;
  };
}

/**
 * The threat cards `holder` is expected to hold in hand, as `view` sees it:
 * the known threats in that hand, plus each unknown hand card weighted by the
 * share of threats among the decklist cards the view has not seen.
 */
function expectedThreats(view: BattleView, holder: Side, decklists: Decklists, isThreat: (cardId: CardId) => boolean): number {
  const hand = view.sides[holder].hand;
  const unseen = new Map<CardId, number>();
  for (const entry of decklists[holder]) unseen.set(entry.cardId, (unseen.get(entry.cardId) ?? 0) + 1);
  let knownThreats = 0;
  for (const instance of Object.values(view.instances)) {
    if (instance.owner !== holder || instance.printing.kind !== "card") continue;
    const { cardId } = instance.printing;
    const remaining = unseen.get(cardId);
    if (instance.journeyDeck === true && remaining !== undefined && remaining > 0) unseen.set(cardId, remaining - 1);
  }
  for (const known of hand.known) {
    const instance = view.instances[known.id];
    if (instance?.printing.kind === "card" && isThreat(instance.printing.cardId)) knownThreats += 1;
  }
  let pool = 0, threats = 0;
  for (const [cardId, count] of unseen) {
    pool += count;
    if (isThreat(cardId)) threats += count;
  }
  const unknownCards = hand.count - hand.known.length;
  return knownThreats + (pool === 0 ? 0 : unknownCards * (threats / pool));
}

function spark(view: BattleView, id: InstanceId | null): number {
  return id === null ? 0 : capped(view.instances[id]?.characteristics.spark ?? 0, EVALUATION.sparkCap);
}

function rankSpark(view: BattleView, rank: SideView["frontRank"]): number {
  return rank.reduce((total, id) => total + spark(view, id), 0);
}

/** Front-rank characters with at least one back-rank character supporting them: `Fi` is supported by `Bi` and `B(i+1)`. */
function supported(side: SideView): number {
  return side.frontRank.filter((id, lane) => id !== null && (side.backRank[lane] != null || side.backRank[lane + 1] != null)).length;
}

function characters(side: SideView): number {
  return [...side.frontRank, ...side.backRank].filter((id) => id !== null).length;
}

/**
 * The challenge the current board projects: the turn's active side
 * challenges until its Challenge phase begins, the other side's next turn
 * afterwards, with every front-rank character in place.
 */
function projectChallenge(view: BattleView): { readonly attacker: Side; readonly points: number; readonly dissolved: Readonly<Record<Side, number>> } {
  const { active, phase } = view.turn;
  const attacker = phase === "challenge" || phase === "ending" ? opponent(active) : active;
  const defender = opponent(attacker);
  const dissolved = { [attacker]: 0, [defender]: 0 } as Record<Side, number>;
  let points = 0;
  view.sides[attacker].frontRank.forEach((challenger, lane) => {
    if (challenger === null) return;
    const blocker = view.sides[defender].frontRank[lane] ?? null;
    const attack = spark(view, challenger);
    if (blocker === null) {
      points += attack;
      return;
    }
    const block = spark(view, blocker);
    if (attack >= block) dissolved[defender] += 1;
    if (block >= attack) dissolved[attacker] += 1;
    if (attack > block) points += attack - block;
  });
  return { attacker, points, dissolved };
}

function capped(value: number, cap: number): number {
  return Math.max(0, Math.min(cap, value));
}

function progress(view: BattleView, side: SideView): number {
  return capped(side.score / view.config.scoreToWin, 1) ** 2;
}

function fatigueRisk(side: SideView): number {
  return Math.max(0, EVALUATION.fatigueHorizon - side.deck.count);
}

/** The raw features, before weighting, from `side`'s view of the position. */
function features(view: BattleView, side: Side, context: EvaluationContext): Record<EvaluationFeature, number> {
  const other = opponent(side);
  const mine = view.sides[side];
  const theirs = view.sides[other];
  const challenge = projectChallenge(view);
  const isThreat = threatClassifier(context.catalog);
  return {
    victory: 0,
    score: mine.score - theirs.score,
    race: progress(view, mine) - progress(view, theirs),
    challengePoints: challenge.attacker === side ? challenge.points : 0 - challenge.points,
    challengeDissolutions: challenge.dissolved[other] - challenge.dissolved[side],
    frontSpark: rankSpark(view, mine.frontRank) - rankSpark(view, theirs.frontRank),
    backSpark: rankSpark(view, mine.backRank) - rankSpark(view, theirs.backRank),
    support: supported(mine) - supported(theirs),
    hand: capped(mine.hand.count, EVALUATION.handCap) - capped(theirs.hand.count, EVALUATION.handCap),
    deck: fatigueRisk(theirs) - fatigueRisk(mine),
    currentEnergy: capped(mine.currentEnergy, EVALUATION.energyCap) - capped(theirs.currentEnergy, EVALUATION.energyCap),
    maxEnergy: capped(mine.maxEnergy, EVALUATION.energyCap) - capped(theirs.maxEnergy, EVALUATION.energyCap),
    threats: expectedThreats(view, side, context.decklists, isThreat) - expectedThreats(view, other, context.decklists, isThreat),
    tempo: characters(mine) - characters(theirs),
  };
}

/** The value of the position `view` shows, for `side`: higher is better for `side`. */
export function evaluate(view: BattleView, side: Side, context: EvaluationContext): Evaluation {
  const weights = EVALUATION.weights;
  const raw: Record<EvaluationFeature, number> = view.result === null
    ? features(view, side, context)
    : { ...Object.fromEntries(Object.keys(weights).map((feature) => [feature, 0])) as Record<EvaluationFeature, number>,
      victory: view.result.kind === "draw" ? 0 : view.result.winner === side ? 1 : -1 };
  let total = 0;
  const weighted = {} as Record<EvaluationFeature, number>;
  for (const feature of Object.keys(weights) as EvaluationFeature[]) {
    weighted[feature] = weights[feature] * raw[feature];
    total += weighted[feature];
  }
  return { total, features: weighted };
}
