import type { LoopAction, LoopCandidate, LoopId } from "../loops/types";
import type { Prompt, PromptPurpose } from "../prompts/types";
import type { AbilitySource, AvatarId, DreamsignId, DreamwellCardId, EffectId, InstanceId, OncePerTurnKey, Side, Zone } from "../state/ids";
import { opponent } from "../state/ids";
import type {
  AbilityOrigin,
  BattleConfig,
  BattleResult,
  BattleState,
  CardInstance,
  CardStatus,
  ContinuousChange,
  RememberedCard,
  ChallengeState,
  EffectChoices,
  Expiry,
  FloatingChange,
  FloatingEffect,
  PlayedCard,
  Printing,
  SparkGain,
  StackItem,
  TurnState,
} from "../state/types";
import { instanceCard, type EngineCatalog } from "../catalog";
import { characteristics, copiableCostOf } from "../continuous/characteristics";
import { adjustedEnergy, costModifier } from "../continuous/costs";
import type { Layers } from "../continuous/layers";
import { fixedEnergy } from "../dsl/energy";
import type { Keyword, Variant } from "../dsl/types";
import type { CardSubtype } from "../../types/card-identity";
import { carriesLegality, changedInstance } from "../rules/floating";
import { banishedAsReclaimed } from "../rules/zones";
import { playCosts } from "../rules/costs";
import { knows, observedFixedEffect, seesSubject } from "./knowledge";

/**
 * A card's effective characteristics, after every continuous effect (the
 * layer evaluation): what the UI and the AI show and compare.
 */
export interface CharacteristicsView {
  readonly cardType: "character" | "event";
  readonly subtype: CardSubtype;
  readonly allTypes: boolean;
  readonly keywords: readonly Keyword[];
  /** A character's effective spark; `null` for an event. */
  readonly spark: number | null;
  /**
   * The energy its controller would pay to play it now, X counted as 0,
   * after cost modifications.
   */
  readonly cost: number;
}

/** One instance the viewer can see, with its identity: a card, a figment, or a figment copy of a card. */
export interface InstanceView {
  readonly id: InstanceId;
  readonly printing: Printing;
  readonly owner: Side;
  readonly controller: Side;
  readonly zone: Zone;
  readonly variant: Readonly<Variant>;
  /** Persisted status flags, including Reclaim's departure replacement. */
  readonly status: Readonly<CardStatus>;
  /** The card's reclaimed departure replacement is covered by its owner's current ability in play or on the stack. */
  readonly reclaimCovered: boolean;
  readonly enteredZoneAt: number;
  readonly characteristics: CharacteristicsView;
}

/** A card in a hidden zone that the viewer knows, at its position in the zone. */
export interface KnownCardView {
  readonly id: InstanceId;
  /** Its index in the zone: for a deck, 0 is the top. */
  readonly index: number;
}

/**
 * A zone whose contents are hidden from at least one side: its size plus the
 * cards in it the viewer knows (view/knowledge.ts), in zone order. A hidden
 * card appears only in `count`; its instance ID is never exposed.
 */
export interface HiddenZoneView {
  readonly count: number;
  readonly known: readonly KnownCardView[];
}

/** A side's avatar: its identity and whether it is exhausted (P4). */
export interface AvatarView {
  readonly id: AvatarId;
  readonly exhausted: boolean;
}

/** One of a side's dreamsigns. */
export interface DreamsignView {
  readonly id: DreamsignId;
}

/** An effect lasting "until the opponent pays N●" (C7). */
export interface PayableEffectView {
  readonly id: EffectId;
  /** The side whose effect it is. */
  readonly controller: Side;
  /** The side that may pay to end it: the affected characters' controller. */
  readonly payer: Side;
  /** Energy the payer pays to end it. */
  readonly cost: number;
  /** A source the viewer cannot see is `null`. */
  readonly source: AbilitySource | null;
  /** The characters whose changes from the effect end when it ends. */
  readonly affects: readonly InstanceId[];
}

/**
 * A captured card (`withMaterialized`) the viewer cannot identify, now in a
 * hidden hand or deck: its owner, printing, and variant, which every side saw
 * as it entered play captured, and `member`, a number local to this view that is
 * the same in every floating and queued trigger naming that card and
 * different for different cards. Members are numbered in order of first
 * appearance, floating effects first and then queued triggers, each in
 * order and each list in order, so the numbering follows only what the view
 * shows. A determinization assigns each member a different hidden card it
 * deals with that owner, preferring that printing and variant
 * (view/determinize.ts).
 */
export interface HiddenCapturedCardView {
  readonly member: number;
  readonly owner: Side;
  readonly printing: Printing;
  readonly variant: Variant;
}

type WithoutInstance<T> = T extends { readonly instance: InstanceId | null } ? Omit<T, "instance"> : never;

/** A permanent fixed change with anonymous card and source references. */
export interface HiddenCardEffectView {
  readonly id: EffectId;
  readonly controller: Side;
  readonly timestamp: number;
  readonly source: AbilitySource | { readonly member: number } | null;
  readonly change: WithoutInstance<ContinuousChange>;
}

/** Viewer-observed facts about one anonymous card, without its zone, position or physical identity. */
export interface HiddenCardDescriptor {
  readonly member: number;
  readonly owner: Side;
  readonly printing: Printing;
  readonly variant: Variant;
  readonly status: Readonly<CardStatus>;
  readonly effects: readonly HiddenCardEffectView[];
}

/** A captured card as a view shows it: its instance when the viewer can identify it, else a hidden one. */
export type CapturedCardView = InstanceId | HiddenCapturedCardView;

type TriggerChange = Extract<FloatingChange, { readonly kind: "trigger" }>;

/**
 * A floating change as a view shows it: a trigger's captured cards, in
 * order, each as a `CapturedCardView`; a card that ceased to exist is left
 * out.
 */
export type FloatingChangeView =
  | Exclude<FloatingChange, TriggerChange>
  | (Omit<TriggerChange, "captured"> & { readonly captured?: readonly CapturedCardView[] });

/** A change with a duration (rules § Durations). */
export interface FloatingEffectView {
  readonly id: EffectId;
  readonly controller: Side;
  /** Legality changes and observed permanent fixed changes retain their data with an unidentified source redacted to null. */
  readonly source: AbilitySource | null;
  readonly timestamp: number;
  readonly expiry: Expiry;
  readonly change: FloatingChangeView;
  /** Safely observed provenance for a fixed permanent effect whose source is currently unidentified. */
  readonly rememberedSource?: { readonly member: number } | null;
}

/**
 * A triggered ability waiting to resolve. A source the viewer cannot see is
 * `null`, and so is the origin it would identify. So is a subject the viewer
 * could not identify as the ability triggered or cannot identify now
 * (`seesSubject`).
 */
export interface QueuedTriggerView {
  readonly controller: Side;
  readonly source: AbilitySource | null;
  readonly origin: AbilityOrigin | null;
  readonly ability: number;
  readonly node: number | null;
  readonly subject: InstanceId | null;
  /** The gain a "when … gains ✦" trigger matched, which is public; absent for any other trigger. */
  readonly gain?: SparkGain;
  /** The positive challenge award a scoring trigger matched; absent for other triggers. */
  readonly scored?: number;
  /**
   * The captured cards a floating or delayed trigger kept, as for a floating
   * change; absent when it kept none, and when the viewer cannot see its
   * source, so a hidden source's captured cards stay unknown.
   */
  readonly captured?: readonly CapturedCardView[];
}

/**
 * The loop on offer, or being repeated (rules § Optional Loops), with its
 * recording as the side that may repeat it knows it (`loopRecording`).
 */
export interface LoopView {
  readonly id: LoopId;
  /** The side that may repeat it. */
  readonly side: Side;
  /** The repetition in progress, or `null` while the loop is only on offer. */
  readonly run: { readonly remaining: number | "untilVictory"; readonly iterations: number } | null;
  /**
   * The loop's recorded actions, each with its steps, present only in the
   * view of the side that may repeat it, when every answered prompt was fully
   * visible to that side when it opened, and while the steps and their
   * answers name no card that side cannot
   * identify (`loopRecording`), so that a determinization of that view
   * repeats the loop as the battle would. Without it a determinization
   * offers the loop but cannot repeat it.
   */
  readonly recording?: readonly LoopAction[];
}

export interface SideView {
  readonly score: number;
  readonly currentEnergy: number;
  readonly maxEnergy: number;
  readonly fatigueCount: number;
  readonly deck: HiddenZoneView;
  readonly hand: HiddenZoneView;
  readonly void: readonly InstanceId[];
  readonly banished: readonly InstanceId[];
  /** `B0`–`B9`. */
  readonly backRank: readonly (InstanceId | null)[];
  /** `F0`–`F8`. */
  readonly frontRank: readonly (InstanceId | null)[];
  readonly avatar: AvatarView | null;
  /** In order. */
  readonly dreamsigns: readonly DreamsignView[];
}

/** Public facts of a play, without linking an unidentified current card to it. */
export interface PlayedCardView extends Omit<PlayedCard, "instance"> {
  readonly instance: InstanceId | null;
}

/** This turn's public plays and draw counts. */
export interface TurnLogView {
  readonly played: Readonly<Record<Side, readonly PlayedCardView[]>>;
  readonly drawn: Readonly<Record<Side, number>>;
}

/**
 * What one side may know about a battle. It is the only thing the UI and the
 * AI read. It shares no objects with the state it was built from, carries no
 * seed or random-stream counters, and lists only instances the viewer can
 * see: those in public zones, those in the viewer's own hand (including any
 * the opponent owns), and hidden cards the viewer knows (view/knowledge.ts).
 * Every deck and the opponent's hand appear as counts plus the known cards.
 */
export interface BattleView {
  readonly viewer: Side;
  /** The state version this view was built from. */
  readonly version: number;
  readonly config: Readonly<BattleConfig>;
  readonly turn: Readonly<TurnState>;
  readonly sides: Readonly<Record<Side, SideView>>;
  /** Every instance the viewer can see, by ID. */
  readonly instances: Readonly<Record<InstanceId, InstanceView>>;
  /** Anonymous observed records in first-observation order, grouped by ownership. */
  readonly hiddenCards?: Readonly<Record<Side, readonly HiddenCardDescriptor[]>>;
  /** The last element is the top. Targets the viewer cannot see are omitted. */
  readonly stack: readonly StackItem[];
  readonly priority: Side | null;
  /** Effects a side may pay to end, in registration order. */
  readonly payable: readonly PayableEffectView[];
  /**
   * Floating effects in creation order, with identifiable changed cards.
   * Legality changes and observed permanent fixed changes retain their data
   * when their source is unidentified.
   */
  readonly floating: readonly FloatingEffectView[];
  /**
   * Currently applicable static void-play permissions, derived from layer 6
   * for presentation, only from sources the viewer can identify. Sources are
   * not identified in this list; a permission naming a card
   * the viewer cannot identify is omitted. Absent in older presentation views.
   */
  readonly staticPlayPermissions?: readonly Extract<FloatingChange, { readonly kind: "playFrom" }>[];
  /** Triggered abilities waiting to resolve, first in, first out. */
  readonly triggerQueue: readonly QueuedTriggerView[];
  readonly turnLog: TurnLogView;
  /** Once-per-turn abilities used this turn, except those of sources the viewer cannot see. */
  readonly oncePerTurn: readonly OncePerTurnKey[];
  /** The shared Dreamwell: cards left before the next cycle, and the catalog cycles are built from. */
  readonly dreamwell: { readonly remaining: number; readonly catalog: readonly DreamwellCardId[] };
  readonly challenge: Readonly<ChallengeState> | null;
  readonly loop: LoopView | null;
  /** `BattleState.automaticChoices`: choices answered in automatic steps since the last top-level action. */
  readonly automaticChoices: number;
  readonly result: BattleResult | null;
}

/** A deep copy of plain JSON data. */
function copy<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(copy) as T;
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = copy(entry);
    }
    return result as T;
  }
  return value;
}

function hiddenZone(ids: readonly InstanceId[], visible: (id: InstanceId) => boolean): HiddenZoneView {
  const known: KnownCardView[] = [];
  ids.forEach((id, index) => {
    if (visible(id)) known.push({ id, index });
  });
  return { count: ids.length, known };
}

/** A card's characteristics as a view shows them, read from `layers`, the evaluation of `state`. */
export function characteristicsView(state: BattleState, catalog: EngineCatalog, layers: Layers, instance: CardInstance): CharacteristicsView {
  const card = layers.of(instance.id);
  const printed = fixedEnergy(playCosts(instanceCard(catalog, instance), instance.variant));
  return {
    cardType: card.cardType,
    subtype: card.subtype,
    allTypes: card.allTypes,
    keywords: [...card.keywords],
    spark: card.spark,
    cost: adjustedEnergy(printed, costModifier(state, catalog, instance.id, instance.controller, layers)),
  };
}

export function view(state: BattleState, viewer: Side, catalog: EngineCatalog): BattleView {
  const layers = characteristics(state, catalog);
  const instances: Record<InstanceId, InstanceView> = {};
  for (const instance of Object.values(state.instances)) {
    if (knows(state, instance, viewer)) {
      instances[instance.id] = {
        id: instance.id,
        printing: copy(instance.printing),
        owner: instance.owner,
        controller: instance.controller,
        zone: instance.zone,
        variant: copy(instance.variant),
        status: copy(instance.status),
        reclaimCovered: instance.status.reclaimed && !banishedAsReclaimed(state, catalog, instance, layers),
        enteredZoneAt: instance.enteredZoneAt,
        characteristics: characteristicsView(state, catalog, layers, instance),
      };
    }
  }
  const visible = (id: InstanceId): boolean => id in instances;
  const playedView = (card: PlayedCard): PlayedCardView => {
    const known = visible(card.instance);
    // Legacy records can recover a cost only from a card this viewer sees.
    // Private printing is not evidence of a publicly known historical cost.
    const cost = card.cost ?? (known ? copiableCostOf(state, catalog, card.instance) : undefined);
    return { ...card, instance: known ? card.instance : null, ...(cost === undefined ? {} : { cost }) };
  };
  const visibleSource = (source: AbilitySource): boolean => typeof source !== "string" || visible(source);
  const visibleChoices = (choices: EffectChoices): EffectChoices => ({
    modes: [...choices.modes],
    targets: choices.targets.map((list) => list.filter(visible)),
    ...(choices.abandonedPosition === undefined ? {} : { abandonedPosition: copy(choices.abandonedPosition) }),
  });
  const floatingVisible = (effect: FloatingEffect): boolean => {
    const changed = changedInstance(effect.change);
    // Costs, permissions and restrictions carry their complete legality data without source identity.
    const sourceIndependent = carriesLegality(effect.change);
    const sourceSeen = visibleSource(effect.source);
    const expirySeen = effect.expiry.at !== "sourceLeavesPlay" || visible(effect.expiry.source);
    return (sourceSeen || sourceIndependent || observedFixedEffect(state, viewer, effect.id) !== undefined) && expirySeen && (changed === null || visible(changed));
  };
  const remembered = new Map((state.rememberedCards?.[viewer] ?? []).map((record) => [record.instance, record]));
  const members = new Map<InstanceId, number>();
  const memberFor = (id: InstanceId): number => {
    const existing = members.get(id);
    if (existing !== undefined) return existing;
    const member = members.size;
    members.set(id, member);
    return member;
  };
  const anonymousSource = (source: InstanceId): { readonly member: number } | null =>
    state.instances[source] !== undefined && remembered.has(source) ? { member: memberFor(source) } : null;
  const capturedView = (captured: readonly InstanceId[]): CapturedCardView[] =>
    captured.flatMap((id): CapturedCardView[] => {
      if (visible(id)) return [id];
      const instance = state.instances[id];
      if (instance === undefined) return [];
      return [{ member: memberFor(id), owner: instance.owner, printing: copy(instance.printing), variant: copy(instance.variant) }];
    });
  // A trigger from a source the viewer cannot see shows none of its captured cards.
  const changeView = (change: FloatingChange, sourceSeen: boolean): FloatingChangeView => {
    if (change.kind !== "trigger" || change.captured === undefined) return copy(change);
    const { captured, ...rest } = change;
    return sourceSeen ? { ...copy(rest), captured: capturedView(captured) } : copy(rest);
  };
  // Hidden captured members are numbered in the order the floating effects, then the queued triggers, show them.
  const floating = state.floating.filter(floatingVisible).map((effect): FloatingEffectView => {
    const observed = observedFixedEffect(state, viewer, effect.id);
    const record = observed ?? effect;
    const sourceSeen = visibleSource(record.source);
    return { ...copy(record), source: sourceSeen ? copy(record.source) : null,
      change: changeView(record.change, sourceSeen),
      ...(observed !== undefined && !sourceSeen && typeof record.source === "string"
        ? { rememberedSource: anonymousSource(record.source) } : {}) };
  });
  const triggerQueue = state.triggerQueue.map((trigger): QueuedTriggerView => ({
    controller: trigger.controller,
    source: visibleSource(trigger.source) ? copy(trigger.source) : null,
    origin: visibleSource(trigger.source) ? copy(trigger.origin) : null,
    ability: trigger.ability,
    node: trigger.node,
    subject: seesSubject(state, trigger, viewer) ? trigger.subject : null,
    ...(trigger.gain === undefined ? {} : { gain: copy(trigger.gain) }),
    ...(trigger.scored === undefined ? {} : { scored: trigger.scored }),
    ...(trigger.captured === undefined || !visibleSource(trigger.source) ? {} : { captured: capturedView(trigger.captured) }),
  }));
  const descriptor = (record: RememberedCard): HiddenCardDescriptor => ({
    member: memberFor(record.instance), owner: record.owner, printing: copy(record.printing),
    variant: copy(record.variant), status: copy(record.status),
    effects: record.effects.map((effect): HiddenCardEffectView => {
      const { instance: _instance, ...change } = effect.change;
      const source = typeof effect.source !== "string" || visible(effect.source) ? copy(effect.source)
        : anonymousSource(effect.source);
      return { id: effect.id, controller: effect.controller, timestamp: effect.timestamp, source, change: copy(change) };
    }),
  });
  const hiddenCards: Record<Side, HiddenCardDescriptor[]> = { player: [], enemy: [] };
  for (const record of remembered.values()) {
    const current = state.instances[record.instance];
    if (current === undefined || visible(record.instance) || (current.zone !== "hand" && current.zone !== "deck")) continue;
    hiddenCards[record.owner].push(descriptor(record));
  }
  hiddenCards.player.sort((a, b) => a.member - b.member);
  hiddenCards.enemy.sort((a, b) => a.member - b.member);
  const side = (which: Side): SideView => {
    const source = state.sides[which];
    return {
      score: source.score,
      currentEnergy: source.currentEnergy,
      maxEnergy: source.maxEnergy,
      fatigueCount: source.fatigueCount,
      deck: hiddenZone(source.deck, visible),
      hand: hiddenZone(source.hand, visible),
      void: [...source.void],
      banished: [...source.banished],
      backRank: [...source.backRank],
      frontRank: [...source.frontRank],
      avatar: source.avatar === null ? null : { id: source.avatar.id, exhausted: source.avatar.exhausted },
      dreamsigns: source.dreamsigns.map((dreamsign) => ({ id: dreamsign.id })),
    };
  };
  return {
    viewer,
    version: state.version,
    config: copy(state.config),
    turn: copy(state.turn),
    sides: { player: side("player"), enemy: side("enemy") },
    instances,
    ...(hiddenCards.player.length + hiddenCards.enemy.length === 0 ? {} : { hiddenCards }),
    stack: state.stack.map((item) =>
      item.kind === "card"
        ? { ...copy(item), choices: item.choices.map(visibleChoices) }
        : { ...copy(item), choices: visibleChoices(item.choices) },
    ),
    priority: state.priority,
    payable: state.payable.map((effect) => ({
      id: effect.id,
      // C7: the payer is the opponent of the effect's controller.
      controller: opponent(effect.payer),
      payer: effect.payer,
      cost: effect.cost,
      source: visibleSource(effect.source) ? copy(effect.source) : null,
      affects: effect.affects.filter(visible),
    })),
    floating,
    staticPlayPermissions: layers.changes(6).flatMap(({ change, effect, staticSource }) =>
      effect === null && staticSource !== null && visibleSource(staticSource) && change.kind === "playFrom" && (change.instance === null || visible(change.instance))
        ? [copy(change)]
        : [],
    ),
    triggerQueue,
    turnLog: {
      played: {
        player: state.turnLog.played.player.map(playedView),
        enemy: state.turnLog.played.enemy.map(playedView),
      },
      drawn: { ...state.turnLog.drawn },
    },
    // A key names its source by instance ID or emblem: `i12#0`, `avatar:player#1`.
    oncePerTurn: state.oncePerTurn.filter((key) => {
      const source = key.slice(0, key.indexOf("#"));
      return source.startsWith("avatar:") || source.startsWith("dreamsign:") || source in instances;
    }),
    dreamwell: { remaining: state.dreamwell.deck.length - state.dreamwell.next, catalog: [...state.dreamwell.catalog] },
    challenge: copy(state.challenge),
    loop:
      state.loops.candidate === null
        ? null
        : {
            id: state.loops.candidate.id,
            side: state.loops.candidate.side,
            run: state.loops.run === null ? null : { remaining: state.loops.run.remaining, iterations: state.loops.run.iterations },
            ...loopRecording(state.loops.candidate, viewer, visible),
          },
    automaticChoices: state.automaticChoices,
    result: copy(state.result),
  };
}

/**
 * The `recording` field of the view of `candidate`: present when `viewer`
 * sees the recording, and absent when it is withheld. Only the side that may
 * repeat the loop sees it. Its steps are that side's own top-level actions,
 * which are public, and automatic steps; it is shown only while every card
 * they name is one `viewer` can identify (`visible`). A recorded answer
 * carries its prompt's fingerprint, so every answered prompt must have
 * been fully visible to the actor when it opened, including its original
 * and feasibility-narrowed surfaces. An absent or incomplete visibility
 * record withholds the whole recording conservatively.
 */
function loopRecording(candidate: LoopCandidate, viewer: Side, visible: (id: InstanceId) => boolean): { readonly recording?: readonly LoopAction[] } {
  const { actions } = candidate;
  if (candidate.side !== viewer || actions === null) return {};
  if (actions.some((action) => action.steps.some((step) => step.answers.length > 0 && (
    !Array.isArray(step.promptsVisibleToActor) ||
    step.promptsVisibleToActor.length !== step.answers.length ||
    !step.promptsVisibleToActor.every((seen) => seen === true)
  )))) return {};
  for (const match of JSON.stringify(actions).matchAll(/"i(\d+)"/g)) {
    if (!visible(`i${Number(match[1])}`)) return {};
  }
  return { recording: copy(actions) };
}

/**
 * A pending prompt as `viewer` may see it. Its purpose names a card source
 * only when `viewer` can identify it in the display state (`purposeView`),
 * so the opponent answering a prompt of a play still hidden in hand never
 * learns the card. Beyond that the side answering sees all of it. Anyone
 * else sees its kind, purpose, and bounds, with only the cards `viewer` can
 * identify (so never the cards of a `privateTo` prompt shown to the other
 * side). Its allowed answers, which name cards, are left out. Such a
 * redacted prompt is for display and cannot be answered.
 */
export function promptView(prompt: Prompt, viewer: Side, display: BattleState): Prompt {
  if (prompt.side === viewer) return { ...copy(prompt), purpose: purposeView(prompt.purpose, viewer, display) };
  const visible = (id: InstanceId): boolean => {
    const instance = display.instances[id];
    return instance !== undefined && knows(display, instance, viewer);
  };
  const purpose = purposeView(prompt.purpose, viewer, display);
  switch (prompt.kind) {
    case "chooseTargets":
    case "chooseCards": {
      const { allowed: _allowed, ...rest } = copy(prompt);
      return { ...rest, purpose, candidates: prompt.candidates.filter(visible) };
    }
    case "arrange": {
      const { allowed: _allowed, ...rest } = copy(prompt);
      return { ...rest, purpose, cards: prompt.cards.filter(visible) };
    }
    case "chooseSlot":
    case "chooseMode":
    case "chooseNumber":
    case "confirm":
    case "payOrDecline":
      return { ...copy(prompt), purpose };
  }
}

/**
 * A prompt purpose as `viewer` may see it in `display`. Emblems are public; a
 * card source shows only when the viewer can identify it, and otherwise the
 * source and its printed card are `null`.
 */
export function purposeView(purpose: PromptPurpose, viewer: Side, display: BattleState): PromptPurpose {
  const { source } = purpose;
  if (source === null || typeof source !== "string") return copy(purpose);
  const instance = display.instances[source];
  return instance !== undefined && knows(display, instance, viewer) ? copy(purpose) : { ...purpose, source: null, cardId: null };
}
