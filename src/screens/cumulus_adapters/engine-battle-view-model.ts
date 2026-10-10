// The journey battle screen's view model over the engine (Phase 4.2): the
// board from `engine.view(display, human)`, which is the intermediate state
// while a step is suspended on a prompt, and the human's affordances from
// the engine's legal actions. The prompt host's surfaces come from
// `prompt-host-view-model.ts`.
//
// Pure and React-free. Instance IDs reach the screen as battle-card IDs and
// come back through `instanceIdIn`; nothing here reads card names.

import type { BattleStatusBadgeView } from "../../cumulus/components/battle/BattleStatusBadges";
import type { DreamwellCardModel } from "../../cumulus/components/battle/DreamwellCard";
import type {
  MobileBattleCardOverlayView,
  MobileBattleCardView,
  MobileBattleFigmentMergeTarget,
  MobileBattleInspectorSideView,
  MobileBattlePhase,
  MobileBattleSideView,
  MobileBattleSlotTarget,
  MobileBattleStatusView,
  MobileBattleView,
} from "../../cumulus/screens/MobileBattleScreen";
import type { MobileBattleResultView } from "../../cumulus/screens/BattleResultSurface";
import type { Action, BattleView, InstanceId, InstanceView, LoopId, Side, Slot } from "../../engine";
import { opponent } from "../../engine";
import type { PresentationVisual } from "../../battle/components/battle-presentation";
import { engineStatusLabel, type EngineStatusCopy } from "../../runtime/battle-prompt-messages";
import type { EngineCardModels } from "../../battle/ui/engine-card-model";
import { formatPhaseLabel, formatSideLabel } from "../../battle/ui/format";
import {
  parseBattleCardId,
  parseBattleSlotViewId,
  type BattleCardId,
  type BattleId,
  type BattleSlotViewId,
  type DreamwellCardId,
  type PresentationId,
} from "../../types/identifiers";
import type { BattlePromptNoticeView } from "../../cumulus/screens/battle-overlays/BattlePromptHost";
import type { Decision } from "../../engine";
import { buildPromptHost, type PendingEnginePrompt, type PromptHostModel } from "./prompt-host-view-model";

type PlayAction = Extract<Action, { kind: "play" }>;
type ActivateAction = Extract<Action, { kind: "activate" }>;
type RepositionAction = Extract<Action, { kind: "reposition" }>;

/** One legal reposition of a character: its destination and the action that moves it there. */
export interface EngineReposition {
  readonly target: MobileBattleSlotTarget;
  readonly action: RepositionAction;
  /** The destination holds a figment this figment merges into. */
  readonly merge: boolean;
}

/** What the human may do now, each with the engine action that does it. */
export interface EngineBattleAffordances {
  /** The human owns the pending top-level decision and nothing is in flight. */
  readonly canAct: boolean;
  readonly pass: Action | null;
  /** Hand cards with a legal play. */
  readonly plays: ReadonlyMap<BattleCardId, PlayAction>;
  /** Void cards with a legal Reclaim play. */
  readonly voidPlays: ReadonlyMap<BattleCardId, PlayAction>;
  /** Characters with legal activated abilities. */
  readonly activations: ReadonlyMap<BattleCardId, readonly ActivateAction[]>;
  /** The legal activated abilities of the human's avatar and dreamsigns. */
  readonly emblemActivations: readonly ActivateAction[];
  /** Characters the human may reposition, with every legal destination. */
  readonly repositions: ReadonlyMap<BattleCardId, readonly EngineReposition[]>;
  /** All Forward: the repositions that move eligible back-rank characters into open front-rank lanes. */
  readonly allForward: readonly RepositionAction[];
  /** All Back: the repositions that move front-rank characters into open back-rank positions. */
  readonly allBack: readonly RepositionAction[];
  /** The loop on offer, with the most repetitions one request may ask for. */
  readonly loop: { readonly loop: LoopId; readonly maxCount: number } | null;
}

export interface EngineBattleViewInput {
  readonly battleId: BattleId;
  /** The side the local player plays. */
  readonly human: Side;
  /** `engine.view(display, human)`: the committed state, or the suspended step's display. */
  readonly view: BattleView;
  /** The human's legal actions: empty unless it owns the pending decision with nothing in flight. */
  readonly legal: readonly Action[];
  /** The prompt the in-flight step is suspended on, as the human may see it. */
  readonly prompt: PendingEnginePrompt | null;
  /** The card the human's in-flight play plays, shown awaiting its prompts. */
  readonly playing: InstanceId | null;
  /** The committed state's top-level decision, when no step is in flight. */
  readonly decision: Decision | null;
  /** The presentation has finished every event before the pending prompt. */
  readonly presented: boolean;
  /** The presentation's current notice. */
  readonly notice: BattlePromptNoticeView | null;
  readonly cards: EngineCardModels;
  readonly avatars: Readonly<Record<Side, Pick<MobileBattleStatusView, "avatar" | "avatarProfile">>>;
  readonly opponentName: string;
  readonly essenceReward: number;
  readonly resultDismissed: boolean;
  /** The presentation's current visual and its key, or `null` while it shows none. */
  readonly visual?: { readonly key: PresentationId; readonly visual: PresentationVisual } | null;
  /** The opponent's card the visual reveals, as the human sees it once played. */
  readonly revealedCard?: InstanceView | null;
  /** A Dreamwell card's display model, by its UUID. */
  readonly dreamwellCard?: (card: DreamwellCardId) => DreamwellCardModel | null;
}

export interface EngineBattleScreenModel {
  /** The engine view the screen view was built from. */
  readonly engine: BattleView;
  readonly view: MobileBattleView;
  readonly affordances: EngineBattleAffordances;
  readonly prompt: PromptHostModel;
  /** The card-score announcement of a challenger being presented, if any. */
  readonly cardOverlay: MobileBattleCardOverlayView | null;
}

const NO_AFFORDANCES: EngineBattleAffordances = {
  canAct: false,
  pass: null,
  plays: new Map(),
  voidPlays: new Map(),
  activations: new Map(),
  emblemActivations: [],
  repositions: new Map(),
  allForward: [],
  allBack: [],
  loop: null,
};

function slotViewId(slot: Slot): BattleSlotViewId {
  return parseBattleSlotViewId(`${slot.rank === "front" ? "F" : "B"}${String(slot.index)}`);
}

/** The engine slot a battle-screen slot target names, or `null`. */
export function slotOfTarget(target: MobileBattleSlotTarget): Slot | null {
  const match = /^([BF])(\d+)$/u.exec(target.slotId);
  if (match === null) return null;
  const rank = match[1] === "F" ? "front" : "back";
  if (rank !== target.rank) return null;
  return { rank, index: Number(match[2]) };
}

function slotTarget(owner: Side, slot: Slot): MobileBattleSlotTarget {
  return { owner, rank: slot.rank, slotId: slotViewId(slot) };
}

function mobilePhase(view: BattleView): MobileBattlePhase {
  switch (view.turn.phase) {
    case "dreamwell":
    case "draw":
    case "dawn":
      return "dawn";
    case "ending":
      return "challenge";
    default:
      return view.turn.phase;
  }
}

/**
 * The plan for one repositioning shortcut: `sources` left to right into the
 * open `destinations` left to right, each move a legal action now. Occupants
 * of the destination rank stay; overflow stays in place.
 */
function shortcutPlan(
  sources: readonly (InstanceId | null)[],
  destinations: readonly (InstanceId | null)[],
  rank: Slot["rank"],
  repositions: readonly RepositionAction[],
): RepositionAction[] {
  const open = destinations.flatMap((occupant, index) => (occupant === null ? [index] : []));
  const plan: RepositionAction[] = [];
  for (const card of sources) {
    const index = open[plan.length];
    if (card === null || index === undefined) continue;
    const move = repositions.find(
      (action) => action.card === card && action.to.rank === rank && action.to.index === index,
    );
    if (move !== undefined) plan.push(move);
  }
  return plan;
}

function affordancesOf(view: BattleView, human: Side, legal: readonly Action[]): EngineBattleAffordances {
  if (legal.length === 0) return NO_AFFORDANCES;
  const plays = new Map<BattleCardId, PlayAction>();
  const voidPlays = new Map<BattleCardId, PlayAction>();
  const activations = new Map<BattleCardId, ActivateAction[]>();
  const emblemActivations: ActivateAction[] = [];
  const repositions = new Map<BattleCardId, EngineReposition[]>();
  const moves: RepositionAction[] = [];
  let pass: Action | null = null;
  let loop: EngineBattleAffordances["loop"] = null;
  const side = view.sides[human];
  for (const action of legal) {
    switch (action.kind) {
      case "pass":
        pass = action;
        break;
      case "play":
        (action.from === "hand" ? plays : voidPlays).set(parseBattleCardId(action.card), action);
        break;
      case "activate":
        if (typeof action.source === "string") {
          const id = parseBattleCardId(action.source);
          activations.set(id, [...(activations.get(id) ?? []), action]);
        } else {
          emblemActivations.push(action);
        }
        break;
      case "reposition": {
        moves.push(action);
        const id = parseBattleCardId(action.card);
        const occupant = (action.to.rank === "front" ? side.frontRank : side.backRank)[action.to.index] ?? null;
        const merge =
          occupant !== null &&
          view.instances[occupant]?.printing.kind === "figment" &&
          view.instances[action.card]?.printing.kind === "figment";
        repositions.set(id, [...(repositions.get(id) ?? []), { target: slotTarget(human, action.to), action, merge }]);
        break;
      }
      case "repeatLoop":
        loop = { loop: action.loop, maxCount: view.config.loopIterationCap };
        break;
      case "payToEnd":
        break;
    }
  }
  return {
    canAct: true,
    pass,
    plays,
    voidPlays,
    activations,
    emblemActivations,
    repositions,
    allForward: shortcutPlan(side.backRank, side.frontRank, "front", moves),
    allBack: shortcutPlan(side.frontRank, side.backRank, "back", moves),
    loop,
  };
}

function resultView(input: EngineBattleViewInput): MobileBattleResultView | null {
  const { view, human } = input;
  const result = view.result;
  if (result === null) return null;
  if (result.kind === "victory" && result.winner === human) {
    return {
      outcome: "victory",
      essenceReward: input.essenceReward,
      opponentName: input.opponentName,
      playerScore: view.sides[human].score,
      opponentScore: view.sides[opponent(human)].score,
      turnCount: view.turn.sideTurns[human],
    };
  }
  return { outcome: result.kind === "draw" ? "draw" : "defeat", dismissed: input.resultDismissed };
}

function inspectorSide(view: BattleView, side: Side): MobileBattleInspectorSideView {
  const sideView = view.sides[side];
  const inPlay = (rank: readonly (InstanceId | null)[]): number => rank.filter((id) => id !== null).length;
  return {
    side,
    heading: side === "player" ? "Player" : "Enemy",
    points: sideView.score,
    currentEnergy: sideView.currentEnergy,
    maxEnergy: sideView.maxEnergy,
    zones: {
      hand: sideView.hand.count,
      deck: sideView.deck.count,
      void: sideView.void.length,
      banished: sideView.banished.length,
      backRank: inPlay(sideView.backRank),
      frontRank: inPlay(sideView.frontRank),
    },
    canDiscard: false,
    canShuffle: false,
  };
}

/**
 * Card IDs for a hidden zone: each card the viewer knows by its instance,
 * each other card by its position, so its back still renders.
 */
function hiddenZoneIds(view: BattleView, side: Side, zone: "hand" | "deck"): BattleCardId[] {
  const hidden = view.sides[side][zone];
  const known = new Map(hidden.known.map((card) => [card.index, card.id]));
  return Array.from({ length: hidden.count }, (_unused, index) => {
    const id = known.get(index);
    return parseBattleCardId(id ?? `${side}-${zone}-${String(index)}`);
  });
}

/** Lasting statuses, by the card they mark and by the side they concern. */
interface EngineStatuses {
  readonly cards: ReadonlyMap<InstanceId, BattleStatusBadgeView[]>;
  readonly sides: Readonly<Record<Side, BattleStatusBadgeView[]>>;
}

/**
 * The status indicators of `view` for `human`: each floating effect with a
 * duration (spark, base spark, all types, a granted or lost keyword,
 * disabled triggers, a temporary character) marks its card; a banished card
 * returning to play, a pending cost change, and a waiting delayed ability
 * mark their side, as does an exhausted Avatar; an effect lasting until a
 * player pays marks each card it affects.
 */
export function engineStatuses(view: BattleView, human: Side): EngineStatuses {
  const cards = new Map<InstanceId, BattleStatusBadgeView[]>();
  const sides: Record<Side, BattleStatusBadgeView[]> = { player: [], enemy: [] };
  const badge = (kind: BattleStatusBadgeView["kind"], status: EngineStatusCopy): BattleStatusBadgeView => ({
    kind,
    label: engineStatusLabel(status, human),
  });
  const mark = (instance: InstanceId, entry: BattleStatusBadgeView) => {
    if (view.instances[instance] !== undefined) cards.set(instance, [...(cards.get(instance) ?? []), entry]);
  };
  for (const { change, expiry, controller } of view.floating) {
    const lasting = expiry.at !== "never";
    switch (change.kind) {
      case "spark":
        if (lasting) mark(change.instance, badge("duration", { kind: "spark", amount: change.amount, expiry }));
        break;
      case "baseSpark":
        if (lasting) mark(change.instance, badge("duration", { kind: "baseSpark", value: change.value, expiry }));
        break;
      case "allTypes":
        if (lasting) mark(change.instance, badge("duration", { kind: "allTypes", expiry }));
        break;
      case "keyword":
        mark(change.instance, badge("keyword", { kind: "keyword", keyword: change.keyword, gains: change.gains, expiry }));
        break;
      case "disableTriggers":
        mark(change.instance, badge("triggersDisabled", { kind: "triggersDisabled", expiry }));
        break;
      case "temporary":
        mark(change.instance, badge("duration", { kind: "temporary", expiry }));
        break;
      case "banishedUntil":
        sides[view.instances[change.instance]?.owner ?? change.side].push(badge("returns", { kind: "returns", expiry }));
        break;
      case "cost":
        sides[change.player].push(
          badge("costModifier", {
            kind: "cost",
            amount: change.amount,
            cardType: change.filter.cardType ?? null,
            next: change.next,
            expiry,
          }),
        );
        break;
      case "trigger":
        sides[controller].push(badge("delayedTrigger", { kind: "delayedTrigger", once: change.once, expiry }));
        break;
    }
  }
  for (const payable of view.payable) {
    for (const instance of payable.affects) {
      mark(instance, badge("payable", { kind: "payable", payer: payable.payer, cost: payable.cost }));
    }
  }
  for (const side of ["player", "enemy"] as const) {
    if (view.sides[side].avatar?.exhausted === true) sides[side].push(badge("exhausted", { kind: "avatarExhausted" }));
  }
  return { cards, sides };
}

export function buildEngineBattleScreenModel(input: EngineBattleViewInput): EngineBattleScreenModel {
  const { view, human } = input;
  const affordances = affordancesOf(view, human, input.legal);
  const far = opponent(human);
  const visual = input.visual?.visual ?? null;
  // The opponent's card being revealed stays off the board until it travels there.
  const held = visual?.kind === "reveal" ? visual.instance : null;
  const statuses = engineStatuses(view, human);
  const cardView = (instance: InstanceView, playable = false): MobileBattleCardView => {
    const marks = statuses.cards.get(instance.id);
    return {
      id: parseBattleCardId(instance.id),
      model: input.cards(instance),
      exhausted: instance.status.exhausted,
      figment: instance.printing.kind !== "card",
      storedTime: instance.status.counters,
      showPlayableOutline: playable,
      ...(marks === undefined ? {} : { statuses: marks }),
    };
  };
  const cardsOf = (ids: readonly InstanceId[], playable: (id: InstanceId) => boolean = () => false) =>
    ids.flatMap((id) => {
      const instance = id === held ? undefined : view.instances[id];
      return instance === undefined ? [] : [cardView(instance, playable(id))];
    });
  const actionable = (id: InstanceId): boolean => {
    const battleCardId = parseBattleCardId(id);
    return affordances.plays.has(battleCardId) || affordances.activations.has(battleCardId);
  };
  const sideView = (side: Side): MobileBattleSideView => {
    const state = view.sides[side];
    const rank = (ids: readonly (InstanceId | null)[], rankName: Slot["rank"]) =>
      ids.map((id, index) => {
        const instance = id === null || id === held ? undefined : view.instances[id];
        return {
          id: slotViewId({ rank: rankName, index }),
          card: instance === undefined ? null : cardView(instance, side === human && actionable(instance.id)),
        };
      });
    return {
      owner: side,
      position: side === human ? "near" : "far",
      deckCardIds: hiddenZoneIds(view, side, "deck"),
      banishedCardCount: state.banished.length,
      voidCards: cardsOf([...state.void].reverse()),
      backRank: rank(state.backRank, "back"),
      frontRank: rank(state.frontRank, "front"),
      status: {
        ...input.avatars[side],
        currentEnergy: state.currentEnergy,
        maxEnergy: state.maxEnergy,
        points: state.score,
        pointsToWin: view.config.scoreToWin,
        ...(statuses.sides[side].length === 0 ? {} : { statuses: statuses.sides[side] }),
      },
    };
  };
  const sides = { [human]: sideView(human), [far]: sideView(far) } as Record<Side, MobileBattleSideView>;
  const knownHand = (side: Side): InstanceId[] => view.sides[side].hand.known.map((card) => card.id);
  const nearHand = cardsOf(knownHand(human), actionable);
  const farHand = cardsOf(knownHand(far));
  const nearHandIds = hiddenZoneIds(view, human, "hand");
  const farHandIds = hiddenZoneIds(view, far, "hand");
  const prompt = buildPromptHost({
    human,
    view,
    prompt: input.prompt,
    decision: input.decision,
    presented: input.presented,
    notice: input.notice,
    loopOffer: affordances.loop === null ? null : { maxCount: affordances.loop.maxCount },
    cardView: (instance) => cardView(instance),
  });
  const revealed = visual?.kind === "reveal" ? (input.revealedCard ?? undefined) : undefined;
  const dreamwell = visual?.kind === "dreamwell" ? (input.dreamwellCard?.(visual.card) ?? null) : null;
  return {
    engine: view,
    affordances,
    prompt,
    cardOverlay:
      visual?.kind === "score" && input.visual !== null && input.visual !== undefined
        ? {
            kind: "points-scored",
            presentationId: input.visual.key,
            battleCardId: parseBattleCardId(visual.instance),
            points: visual.points,
          }
        : null,
    view: {
      battleId: input.battleId,
      perspective: human,
      near: sides[human],
      far: sides[far],
      nearHand: { owner: human, position: "near", cardIds: nearHandIds, cards: nearHand },
      farHand: { owner: far, position: "far", cardIds: farHandIds, cards: farHand },
      promptNotice: prompt.promptNotice,
      cardPicker: prompt.cardPicker,
      choicePrompt: prompt.choicePrompt,
      promptHost: prompt.host,
      dreamwell: visual?.kind === "dreamwell" && dreamwell !== null ? { side: visual.side, model: dreamwell } : null,
      playReveal:
        visual?.kind === "reveal" && revealed !== undefined ? { card: cardView(revealed), from: visual.from } : null,
      activeSide: view.turn.active,
      isOpeningTurn: view.turn.turnNumber === 1,
      phase: mobilePhase(view),
      enemyHandCardIds: human === "enemy" ? nearHandIds : farHandIds,
      enemyHand: human === "enemy" ? nearHand : farHand,
      enemy: sides.enemy,
      player: sides.player,
      playerHand: human === "player" ? nearHand : farHand,
      inspector: {
        opponentName: input.opponentName,
        perspective: human,
        turn: String(view.turn.turnNumber),
        phase: formatPhaseLabel(view.turn.phase),
        activeSide: formatSideLabel(view.turn.active),
        result:
          view.result === null
            ? "In progress"
            : view.result.kind === "draw"
              ? "Draw"
              : view.result.winner === human
                ? "Victory"
                : "Defeat",
        nextDreamwellOrder: String(view.dreamwell.remaining),
        isOpponentHandRevealed: false,
        isPlayerHandHidden: false,
        isFarHandRevealed: false,
        isNearHandHidden: false,
        sides: { player: inspectorSide(view, "player"), enemy: inspectorSide(view, "enemy") },
      },
      result: resultView(input),
      revealedHandCard:
        prompt.sourceCard === null || prompt.sourceCard.id === input.playing ? null : prompt.sourceCard,
      rankShortcuts:
        affordances.canAct && [...affordances.repositions.keys()].length > 0
          ? { allForward: affordances.allForward.length > 0, allBack: affordances.allBack.length > 0 }
          : null,
    },
  };
}

/**
 * The play a hand card's tap or drop submits, or `null` when the card has
 * no legal play. A character dropped on an open back-rank position of the
 * human's names that position.
 */
export function handPlayAction(
  model: EngineBattleScreenModel,
  human: Side,
  id: BattleCardId,
  target?: MobileBattleSlotTarget,
): PlayAction | null {
  const play = model.affordances.plays.get(id);
  if (play === undefined) return null;
  const slot = target === undefined || target.owner !== human ? null : slotOfTarget(target);
  const character = model.engine.instances[play.card]?.characteristics.cardType === "character";
  return slot !== null && slot.rank === "back" && character ? { ...play, slot } : play;
}

/** The reposition a battlefield drop submits, or `null` when the destination is not legal. */
export function repositionForDrop(
  model: EngineBattleScreenModel,
  id: BattleCardId,
  target: MobileBattleSlotTarget,
): RepositionAction | null {
  const moves = model.affordances.repositions.get(id) ?? [];
  return (
    moves.find(
      (move) =>
        move.target.owner === target.owner && move.target.rank === target.rank && move.target.slotId === target.slotId,
    )?.action ?? null
  );
}

/**
 * The occupied positions a dragged figment relates to: each legal merge, and
 * each figment of its identity it may not merge with now because exactly one
 * of the two is exhausted.
 */
export function figmentMergeTargets(
  model: EngineBattleScreenModel,
  human: Side,
  id: BattleCardId,
  legionnaire: (figment: InstanceView) => boolean,
): MobileBattleFigmentMergeTarget[] {
  const view = model.engine;
  const source = Object.values(view.instances).find((instance) => instance.id === id);
  if (source?.printing.kind !== "figment" || source.zone !== "play") return [];
  const sourcePrinting = source.printing;
  const moves = model.affordances.repositions.get(id) ?? [];
  const side = view.sides[human];
  const label = model.view.near.backRank
    .concat(model.view.near.frontRank)
    .find((slot) => slot.card?.id === id)?.card?.model.displaySnapshot.name;
  const targets: MobileBattleFigmentMergeTarget[] = [];
  for (const [rankName, rank] of [
    ["back", side.backRank],
    ["front", side.frontRank],
  ] as const) {
    rank.forEach((occupant, index) => {
      const other = occupant === null ? undefined : view.instances[occupant];
      if (
        other === undefined ||
        other.id === source.id ||
        other.printing.kind !== "figment" ||
        other.printing.figment !== sourcePrinting.figment
      ) {
        return;
      }
      const target = slotTarget(human, { rank: rankName, index });
      const legal = moves.some((move) => move.merge && move.target.slotId === target.slotId);
      targets.push({
        sourceBattleCardId: id,
        destinationBattleCardId: parseBattleCardId(other.id),
        target,
        figmentLabel: label ?? "",
        status: legal ? "eligible" : "blocked-exhaustion",
        addedSpark: sourcePrinting.spark + source.status.gainedSpark,
        requiresConfirmation: legal && legionnaire(source),
      });
    });
  }
  return targets;
}
