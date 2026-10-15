/**
 * A sufficient proof of event-copy renewal (D12, RD-hv-umm2.233-1).
 * An unconditional permanent emblem replaces its queued occurrence with a
 * successor for every copied subject and every mode. Other FIFO work and
 * potential listeners must be harmless. This proof is transient: actual
 * copies, answers, events, victory checks and accounting remain authoritative.
 */
import { instanceCard, type EngineCatalog } from "../catalog";
import { worksInZone } from "../dsl/abilities";
import { resolvePlayer } from "../dsl/selectors";
import type { Ability, Trigger } from "../dsl/types";
import type { EffectNode } from "../effects/types";
import type { ChooseOneNode } from "../effects/primitives/choose-one";
import type { CopyCardNode, CopyCardTimesNode } from "../effects/primitives/copy-card";
import type { GainEnergyNode } from "../effects/primitives/gain-energy";
import type { SequenceNode } from "../effects/primitives/sequence";
import type { EngineEventKind } from "../events";
import { abilityOrigin, inPlaySources, instanceOrigin, originAbilities } from "../rules/activation";
import { SIDES, sourceKey, type AbilitySource, type Side, type Zone } from "../state/ids";
import type { AbilityOrigin, BattleState, HandCopyContext, Printing, QueuedTrigger } from "../state/types";
import { copiedCardMatchesFilter, triggerEventKinds } from "../triggers/matcher";
import { triggerBody } from "../triggers/body";

interface CopySubject {
  readonly printing: Printing;
  readonly variant: HandCopyContext["variant"];
  readonly controller: Side;
  readonly x: number;
  readonly destination: "stack" | "hand";
}
interface Listener {
  readonly source: AbilitySource;
  readonly controller: Side;
  readonly origin: AbilityOrigin;
  readonly zone: Zone;
  readonly emblem: boolean;
  readonly abilities: readonly Ability[];
}
interface SafeBody {
  /** Every mode makes at least one successful copy; zero and empty work do not renew. */
  readonly renews: boolean;
  readonly copies: boolean;
}

/** Copy-only work never advances phases, plays, resolves cards or moves a source. */
const EMITTED: readonly EngineEventKind[] = [
  "cardCreated", "cardCopied", "triggerQueued", "triggerResolved", "promptAutoAnswered", "revealed", "energyChanged",
];

/**
 * These handlers produce only continuous characteristic/permission/visibility
 * changes or phase-only draw counts. Copiable values and permanent emblem abilities are independent of
 * their dynamic selectors, zone growth and conditional applicability.
 * Unknown static operations require a new reviewed case.
 */
const PASSIVE_STATICS: readonly string[] = [
  "additionalDrawPhaseCards", // Phase-only draw counts cannot act in this copy-only FIFO.
  "journeyDeckSparkModifier", // Static copiable-cost eligibility cannot act in this FIFO.
  "firstMaterializationKeyword", // Copy-only work cannot materialize a character or advance its turn.
  "firstPlayedCharacterEntrySpark", // This FIFO cannot play or materialize a character.
  "costModifierNth", // This copy-only FIFO cannot change committed plays or advance the turn.
  "firstPlayedSparkSetter", // Copy-only work cannot change the first play, its live subject or the source.
  "costModifier", "sparkModifier", "grant", "grantCardKeyword", "giveAllTypes", "setBaseSpark",
  "playFromZone", "playRestriction", "selfCostReduction", "revealDeckTop", "reclaimNotBanished",
  "preserveEphemeralHand", // Own-Ending cleanup is inert while this FIFO keeps phases fixed.
];

/** Explicit floating cases: none expires or offers a payment inside the continuing FIFO. */
function passiveFloating(state: BattleState, catalog: EngineCatalog): boolean {
  return state.floating.every(({ change, expiry, source }) => {
    switch (change.kind) {
      case "cost": case "cardCost": case "spark": case "baseSpark": case "subtype": case "allTypes":
      case "keyword": case "playFrom": case "cannotPlay": case "playLimit": case "revealDeckTop":
      case "reclaimNotBanished": case "disableTriggers": return true;
      case "trigger": {
        // A dormant callback is inert under this exact emitted-event alphabet.
        // Intersecting callbacks need their own lifetime/body proof.
        const { ref } = change;
        const body = triggerBody(catalog, ref.origin, ref.ability, ref.node);
        return !triggerEventKinds(body.trigger).some(kind => EMITTED.includes(kind));
      }
      case "temporary": {
        // The actual temporary character can retire only at the turn boundary.
        // This renewing FIFO cannot move it, pay, or advance that boundary;
        // completed-step victory and all of its listeners are audited below.
        const character = state.instances[change.instance];
        return expiry.at === "endOfTurn" && source === change.instance && character?.zone === "play" &&
          instanceCard(catalog, character).cardType === "character";
      }
      case "banishedToHandUntil": {
        // Returning this actual banished visit requires its live physical
        // source to leave play; the audited FIFO cannot move either card.
        const live = typeof source === "string" ? state.instances[source] : undefined;
        const banished = state.instances[change.instance];
        return expiry.at === "sourceLeavesPlay" && typeof source === "string" && expiry.source === source &&
          live?.zone === "play" && instanceCard(catalog, live).cardType === "character" &&
          banished?.zone === "banished" && banished.enteredZoneAt === change.banishedAt;
      }
      case "firstMaterializationKeyword": return false;
      case "firstPlayedCharacterEntrySpark": return false;
      case "materializeKeyword": return false;
      case "preserveEphemeralHand": return false;
      case "offeringDiscardPaymentOption": return false;
      case "reclaimCost": return false;
      case "additionalDrawPhaseCards": return false;
      case "ruleModifier": return false; // Static-only rules carry no floating passivity proof.
      case "abilities": case "loseAbilities": case "banishedUntil": return false;
    }
    const exhaustive: never = change;
    return exhaustive;
  });
}

/** Origins contain only immutable catalog identity and captured ability data. */
function sameOrigin(a: AbilityOrigin, b: AbilityOrigin): boolean {
  const equal = (left: unknown, right: unknown): boolean => {
    if (left === right) return true;
    if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
    if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((value: unknown, at: number) => equal(value, right[at]));
    const l = left as Readonly<Record<string, unknown>>, r = right as Readonly<Record<string, unknown>>;
    const keys = Object.keys(l).filter(key => l[key] !== undefined);
    return keys.length === Object.keys(r).filter(key => r[key] !== undefined).length &&
      keys.every(key => Object.prototype.hasOwnProperty.call(r, key) && equal(l[key], r[key]));
  };
  return equal(a, b);
}

function listenerCensus(state: BattleState, catalog: EngineCatalog): Listener[] {
  const result: Listener[] = Object.values(state.instances).map(card => {
    const origin = instanceOrigin(card);
    return { source: card.id, controller: card.controller, origin, zone: card.zone, emblem: false,
      abilities: originAbilities(catalog, origin) };
  });
  for (const controller of SIDES) for (const source of inPlaySources(state, controller)) {
    if (typeof source === "string") continue;
    const origin = abilityOrigin(state, source);
    if (origin !== null) result.push({ source, controller, origin, zone: "play", emblem: true,
      abilities: originAbilities(catalog, origin) });
  }
  return result;
}

/** Uses actual typed emission-time hand context, or the live original stack item. */
function copySubject(state: BattleState, catalog: EngineCatalog, queued: QueuedTrigger): CopySubject | null {
  if (queued.subject === null) return null;
  if (queued.handCopy !== undefined) {
    const { printing, variant, copier } = queued.handCopy;
    return instanceCard(catalog, { printing, variant }).cardType === "event"
      ? { printing, variant, controller: copier, x: 0, destination: "hand" } : null;
  }
  const item = state.stack.find(item => item.kind === "card" && item.instance === queued.subject);
  const card = state.instances[queued.subject];
  return item?.kind === "card" && card !== undefined && instanceCard(catalog, card).cardType === "event"
    ? { printing: card.printing, variant: card.variant, controller: queued.controller, x: item.x ?? 0, destination: "stack" } : null;
}

/** Universal syntax proof; supported instructions cannot remove a subject or a listener. */
function safeBody(node: EffectNode, subject: CopySubject | null, visiting = new Set<EffectNode>()): SafeBody | null {
  if (visiting.has(node)) return null;
  visiting.add(node);
  let result: SafeBody | null = null;
  if (node.op === "sequence" || node.op === "chooseOne") {
    const parts = node.op === "sequence" ? (node as SequenceNode).effects : (node as ChooseOneNode).modes;
    const bodies = parts.map(child => safeBody(child, subject, visiting));
    if ((node.op === "sequence" || parts.length > 0) && bodies.every((body): body is SafeBody => body !== null)) {
      result = { copies: bodies.some(body => body.copies),
        renews: node.op === "sequence" ? bodies.some(body => body.renews) : bodies.every(body => body.renews) };
    }
  } else if (node.op === "copyCard" || node.op === "copyCardTimes") {
    const copy = node as CopyCardNode;
    const times = node.op === "copyCardTimes" ? (node as CopyCardTimesNode).times : 1;
    if (copy.card.kind === "subject" && Number.isSafeInteger(times) && times >= 0 && (times === 0 || subject !== null)) {
      result = { copies: times > 0, renews: times > 0 };
    }
  } else if (node.op === "gainEnergy") {
    const gain = node as GainEnergyNode;
    if (typeof gain.amount === "number" && Number.isFinite(gain.amount) && gain.amount >= 0) {
      result = { copies: false, renews: false };
    }
  }
  visiting.delete(node);
  return result;
}

/** A copy branch must match the actual outbound copier and unchanged copiable tuple. */
function copyMatches(trigger: Trigger, controller: Side, copier: Side, subject: CopySubject, catalog: EngineCatalog): boolean {
  if (trigger.on === "either") return trigger.triggers.some(branch => copyMatches(branch, controller, copier, subject, catalog));
  return trigger.on === "copy" && resolvePlayer(controller, trigger.player) === copier &&
    copiedCardMatchesFilter(catalog, subject, subject.x, trigger.filter);
}

/** Audit dormant conditions too: copying can change hand counts or current energy. */
function safeAbilities(state: BattleState, listener: Listener, subject: CopySubject | null): boolean {
  return listener.abilities.every(ability => {
    if (ability.kind === "winCondition" && listener.zone === "play") {
      // This exact empty-deck predicate is false, and the audited FIFO cannot
      // draw, erode, play, resolve a card, or move anything into/out of a deck.
      const condition = ability.condition;
      return condition.cond === "cardsIn" && condition.zone === "deck" && condition.filter === undefined &&
        condition.atLeast === undefined && condition.atMost === 0 &&
        state.sides[resolvePlayer(listener.controller, condition.player)].deck.length > 0;
    }
    const functional = listener.emblem || ((ability.kind === "triggered" || ability.kind === "static") && worksInZone(ability.zone, listener.zone));
    if (!functional) return true;
    if (ability.kind === "static") return PASSIVE_STATICS.includes(ability.effect.op);
    if (ability.kind !== "triggered" || !triggerEventKinds(ability.trigger).some(kind => EMITTED.includes(kind))) return true;
    return safeBody(ability.effect, subject) !== null;
  });
}

/**
 * At least one permanent kernel occurrence renews itself. Every pending
 * instruction and every possible listener is safe for all emitted copies.
 * Static keywords may change target options, but copyOnStack still copies
 * when retargeting has no option (it retains that original choice).
 */
export function isClosedCopyEventContinuation(state: BattleState, catalog: EngineCatalog): boolean {
  if (state.result !== null || state.triggerQueue.length === 0 || state.loops.run !== null || !passiveFloating(state, catalog)) return false;
  const listeners = listenerCensus(state, catalog);
  const subjects: CopySubject[] = [];
  let kernel = false;
  for (const queued of state.triggerQueue) {
    if (queued.kind !== undefined || queued.node !== null) return false;
    const definition = originAbilities(catalog, queued.origin)[queued.ability];
    if (definition?.kind !== "triggered") return false;
    const subject = copySubject(state, catalog, queued);
    const body = safeBody(definition.effect, subject);
    if (body === null) return false;
    if (!body.copies) continue;
    if (subject === null) return false;
    subjects.push(subject);
    const current = listeners.find(listener => sourceKey(listener.source) === sourceKey(queued.source));
    if (current?.emblem === true && typeof current.source !== "string" && (current.source.kind === "avatar" || current.source.kind === "dreamsign") &&
      current.controller === queued.controller && sameOrigin(current.origin, queued.origin) &&
      definition.condition === undefined && definition.oncePerTurn !== true && body.renews &&
      copyMatches(definition.trigger, queued.controller, subject.controller, subject, catalog)) kernel = true;
  }
  if (!kernel) return false;
  // Prospective copies carry only their printing/variant's own functional
  // abilities. They cannot acquire new ability groups from any allowed body.
  for (const subject of subjects) {
    if (!listeners.every(listener => safeAbilities(state, listener, subject))) return false;
    const origin: AbilityOrigin = subject.printing.kind === "figment"
      ? { kind: "figment", id: subject.printing.figment }
      : { kind: "card", cardId: subject.printing.cardId, variant: subject.variant };
    const prospective: Listener = { source: state.triggerQueue[0].source, controller: subject.controller,
      origin, zone: subject.destination, emblem: false, abilities: originAbilities(catalog, origin) };
    if (!safeAbilities(state, prospective, subject)) return false;
  }
  return true;
}
