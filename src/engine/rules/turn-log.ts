/**
 * The current turn's history (state `turnLog`): per-side play records with
 * captured characteristics; draw and discard counts; departure, dissolution
 * and abandon occurrences with captured types; and materialization records
 * with captured types and figment provenance. Dawn ability admissions track
 * a total and each observer's known lower bound.
 */
import { instanceCard, type EngineCatalog } from "../catalog";
import { characteristicsOf, copiableCostOf, playedMatchesFilter } from "../continuous/characteristics";
import type { LastPlayedSpec } from "../dsl/types";
import { copyJson } from "../state/clone";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState, MaterializedCard, PlayedCard, TurnDeparture, TurnLog } from "../state/types";

export function emptyTurnLog(): TurnLog {
  return { discarded: { player: 0, enemy: 0 }, leftPlay: { player: [], enemy: [] }, dissolved: { player: [], enemy: [] }, abandoned: { player: [], enemy: [] }, played: { player: [], enemy: [] }, drawn: { player: 0, enemy: 0 }, materialized: { player: [], enemy: [] } };
}

/** Records only actual positive Challenge awards; one new fact cannot complete an unknown window. */
export function recordCharacterScored(state: BattleState, instance: InstanceId, controller: Side, points: number): void {
  const current = state.characterScoring?.current;
  if (points > 0 && current != null && !current.some(entry => entry.instance === instance)) {
    current.push({ instance, controller });
  }
}

/** Replaces the prior global turn before start-of-turn callbacks, including every extra turn. */
export function rotateCharacterScoring(state: BattleState): void {
  state.characterScoring = {
    current: [],
    previous: state.turn.turnNumber <= 1 ? [] : state.characterScoring?.current ?? null,
  };
}

/**
 * Records that `side` played `card`, with its effective type, subtype,
 * "has all character types", named triggered abilities and spark, and its copiable speed and cost as it is
 * played, before its "when you play" triggers match. "When you play" filters
 * and counts read these, so a later type or spark change does not alter what
 * an earlier play matched (RD-hv-7x4l.34-1, RD-hv-umm2.464-1), and a card
 * that has since ceased to exist or become unidentifiable in a hidden zone
 * still matches by its captured speed, cost and spark.
 */
export function recordPlayed(state: BattleState, catalog: EngineCatalog, side: Side, card: InstanceId, playedFromVoid: boolean): void {
  const { cardType, subtype, allTypes, spark, namedTriggers } = characteristicsOf(state, catalog, card);
  const { printing, variant } = state.instances[card];
  state.turnLog.played[side].push({ instance: card, playedFromVoid, cardType, subtype, allTypes, namedTriggers: [...namedTriggers], cost: copiableCostOf(state, catalog, card), spark, speed: instanceCard(catalog, state.instances[card]).speed, copiable: copyJson({ printing, variant }) });
}

/** Select the latest actual matching play before considering its current physical survival. */
export function lastPlayedCharacter(state: BattleState, catalog: EngineCatalog, side: Side, filter: LastPlayedSpec["filter"]): PlayedCard | undefined {
  const matches = state.turnLog.played[side].filter(card => playedMatchesFilter(state, catalog, card, filter));
  return matches[matches.length - 1];
}

/** Records that `side` drew a card, before its "when you draw" triggers match. */
export function recordDrawn(state: BattleState, side: Side): void {
  state.turnLog.drawn[side] += 1;
}

/**
 * Records that `side` materialized the character `card`, with its effective
 * type, subtype, and "has all character types" as its `materialized` event
 * announces it, before any trigger matches that event. Every announcement
 * counts: a figment, and an in-play character rematerialized.
 */
export function recordMaterialized(state: BattleState, catalog: EngineCatalog, side: Side, card: InstanceId): void {
  const { cardType, subtype, allTypes } = characteristicsOf(state, catalog, card);
  state.turnLog.materialized ??= { player: [], enemy: [] };
  state.turnLog.materialized[side].push({ instance: card, cardType, subtype, allTypes, figment: state.instances[card].printing.kind !== "card" });
}

/** The characters `side` materialized this turn, in order; none recorded for a saved state that lacks the record. */
export function materializedThisTurn(state: BattleState, side: Side): readonly MaterializedCard[] {
  return state.turnLog.materialized?.[side] ?? [];
}

/** How many cards `side` has played this turn, by every route (copies are never played). */
export function playedThisTurn(state: BattleState, side: Side): number {
  return state.turnLog.played[side].length;
}

/** Commits a complete validated discard cohort's public count. */
export function recordDiscarded(state: BattleState, side: Side, count: number): void {
  state.turnLog.discarded ??= { player: 0, enemy: 0 };
  state.turnLog.discarded[side] += count;
}
/** Records a validated physical cohort only after every discard completed. */
export function recordDiscardedCards(state: BattleState, side: Side, cards: readonly InstanceId[]): void {
  state.turnLog.discardedCards ??= { player: [], enemy: [] };
  state.turnLog.discardedCards[side].push(...cards);
}
/** Physical cards actually discarded from this side's hand; legacy absence is empty. */
export function discardedCardsThisTurn(state: BattleState, side: Side): readonly InstanceId[] {
  return state.turnLog.discardedCards?.[side] ?? [];
}

/** Records one announced character departure before controller or type can change. */
export function recordLeftPlay(state: BattleState, catalog: EngineCatalog, side: Side, card: InstanceId): void {
  state.turnLog.leftPlay ??= { player: [], enemy: [] };
  state.turnLog.leftPlay[side].push({ instance: card, cardType: characteristicsOf(state, catalog, card).cardType });
}
/** Records one admitted dissolution or abandon before movement/cessation. */
export function recordDissolved(state: BattleState, catalog: EngineCatalog, side: Side, card: InstanceId, abandoned: boolean): void {
  const occurrence = { instance: card, cardType: characteristicsOf(state, catalog, card).cardType };
  state.turnLog.dissolved ??= { player: [], enemy: [] };
  state.turnLog.dissolved[side].push(occurrence);
  if (abandoned) recordAbandoned(state, side, occurrence);
}
/** An abandon replaced by banishment keeps its captured predeparture type. */
export function recordAbandoned(state: BattleState, side: Side, occurrence: TurnDeparture): void {
  state.turnLog.abandoned ??= { player: [], enemy: [] };
  state.turnLog.abandoned[side].push({ ...occurrence });
}
export function charactersPlayedCountThisTurn(state: BattleState, side: Side): number {
  return state.turnLog.played[side].filter(card => card.cardType === "character").length;
}
export function discardedCountThisTurn(state: BattleState, side: Side): number { return state.turnLog.discarded?.[side] ?? 0; }
export function leftPlayCountThisTurn(state: BattleState, side: Side): number { return state.turnLog.leftPlay?.[side].filter(card => card.cardType === "character").length ?? 0; }
export function dissolvedCountThisTurn(state: BattleState, side: Side): number { return state.turnLog.dissolved?.[side].filter(card => card.cardType === "character").length ?? 0; }
export function abandonedCountThisTurn(state: BattleState, side: Side): number { return state.turnLog.abandoned?.[side].filter(card => card.cardType === "character").length ?? 0; }
export function materializedCountThisTurn(state: BattleState, side: Side, figment?: boolean): number {
  return materializedThisTurn(state, side).filter(card => figment === undefined || card.figment === figment).length;
}
