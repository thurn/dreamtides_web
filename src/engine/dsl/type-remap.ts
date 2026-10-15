import type { CardSubtype } from "../../types/card-identity";
import type { EngineFigmentDefinition } from "../catalog";
import type { Effect } from "../effects/registry";
import type { CardRef, CapturedCardsSpec, EffectNode } from "../effects/types";
import { CHOSEN_SUBTYPE } from "../effects/primitives/choose-subtype";
import type { CardsInZone } from "../effects/primitives/grant-card-keyword";
import type { ReclaimCards } from "../effects/primitives/grant-reclaim";
import type { Ability, CardFilter, CharacterRef, CharacterPredicate, CharacterSelector, MovedCardRef, Condition, Cost, StaticCondition, Trigger, ValueExpr } from "./types";

/** A literal source-locale type, rather than an untyped or runtime placeholder. */
export function isTypeRemap(value: unknown): value is CardSubtype {
  return typeof value === "string" && value.trim() === value && value.length > 0 &&
    value !== "*" && value !== "X" && value !== CHOSEN_SUBTYPE;
}

/** C12 rewrites ability data, preserving the instruction graph's paired references. */
export function remapAbilityTypes(abilities: readonly Ability[], type: CardSubtype, figments: readonly EngineFigmentDefinition[]): readonly Ability[] {
  if (!isTypeRemap(type)) throw new Error("Invalid card ability type remap");
  const eligible = figments.filter(figment => figment.subtype === type && figment.typeRemapTarget !== false);
  const canonical = eligible.filter(figment => figment.typeRemapTarget === true);
  const matches = canonical.length === 0 ? eligible : canonical;
  const distinct = new Map(matches.map(figment => [figment.id, figment]));
  if (distinct.size > 1) throw new Error("Ambiguous canonical figment type");
  const replacement = matches[0];
  const memo = new WeakMap<EffectNode, EffectNode>();
  type Reference = CardRef | CharacterRef | MovedCardRef | CapturedCardsSpec | ReclaimCards | CardsInZone;
  const references = new WeakMap<Reference, Reference>();
  const literal = (value: CardSubtype) => value === CHOSEN_SUBTYPE ? value : type;
  const filter = <T extends CardFilter>(value: T): T => value.subtype === undefined ? value : { ...value, subtype: literal(value.subtype) };
  function mappedValue(v: ValueExpr): ValueExpr {
    if (typeof v === "number") return v;
    switch (v.value) {
      case "count": return { ...v, of: selector(v.of) };
      case "countCards": return v.filter === undefined ? v : { ...v, filter: filter(v.filter) };
      case "plus": case "times": case "locked": return { ...v, of: value(v.of) };
      case "costOf": return { ...v, of: reference(v.of) };
      case "discardCount": return { ...v, of: reference(v.of) };
      default: return v;
    }
  }
  const value = <T extends ValueExpr>(v: T): T => mappedValue(v) as T;
  const selector = <T extends Partial<CharacterSelector> | CharacterPredicate>(s: T): T => ({
    ...s,
    ...(s.subtype === undefined ? {} : { subtype: literal(s.subtype) }),
    ...(s.notSubtype === undefined ? {} : { notSubtype: literal(s.notSubtype) }),
    ...(!("anyOf" in s) || s.anyOf === undefined ? {} : { anyOf: s.anyOf.map(selector) }),
    ...(s.costAtMost === undefined ? {} : { costAtMost: value(s.costAtMost) }),
    ...(s.costAtLeast === undefined ? {} : { costAtLeast: value(s.costAtLeast) }),
    ...(s.sparkAtMost === undefined ? {} : { sparkAtMost: value(s.sparkAtMost) }),
    ...(s.sparkAtLeast === undefined ? {} : { sparkAtLeast: value(s.sparkAtLeast) }),
  });
  const condition = <T extends Condition | StaticCondition>(c: T): T => {
    switch (c.cond) {
      case "controls": return { ...c, selector: selector(c.selector) };
      case "topOfDeck": return { ...c, filter: filter(c.filter) };
      case "cardsIn": return c.filter === undefined ? c : { ...c, filter: filter(c.filter) };
      default: return c;
    }
  };
  const trigger = (t: Trigger): Trigger => {
    if (t.on === "either") return { ...t, triggers: t.triggers.map(trigger) };
    if ("subject" in t) return { ...t, subject: t.subject === "self" ? "self" : selector(t.subject) } as Trigger;
    if ("selector" in t) return { ...t, selector: selector(t.selector) };
    if ("filter" in t && t.filter !== undefined) return { ...t, filter: filter(t.filter) };
    return t;
  };
  const cost = <T extends Cost>(c: T): T => {
    switch (c.cost) {
      case "choice": return { ...c, options: c.options.map(option => option.map(cost)) };
      case "optional": return { ...c, costs: c.costs.map(cost) };
      case "abandon": return { ...c, selector: "kind" in c.selector ? c.selector : selector(c.selector) };
      case "return": return { ...c, selector: selector(c.selector) };
      case "discard": return c.filter === undefined ? c : { ...c, filter: filter(c.filter) };
      case "reveal": case "banishFromVoid": case "banishFromAnyVoid": return { ...c, filter: filter(c.filter) };
      default: return c;
    }
  };
  const reference = <T extends Reference>(r: T): T => {
    const previous = references.get(r);
    if (previous !== undefined) return previous as T;
    const output = { ...r };
    // Register before following references back into their instruction graph.
    references.set(r, output);
    Object.assign(output, mappedReference(r));
    return output;
  };
  const mappedReference = <T extends Reference>(r: T): T => {
    switch (r.kind) {
      case "target": return { ...r, selector: selector(r.selector), ...(r.when === undefined ? {} : { when: { condition: condition(r.when.condition), otherwise: selector(r.when.otherwise) } }) };
      case "all": case "supported": case "randomCharacter": return { ...r, selector: selector(r.selector) };
      case "lastPlayed": return { ...r, filter: filter(r.filter) };
      case "movedCards": return { ...r, node: node(r.node) };
      case "movedBy": return { ...r, effect: node(r.effect) };
      case "cardsInZone": return { ...r, filter: filter(r.filter) };
      case "inZone": return { ...r,
        ...(!("filter" in r) ? {} : { filter: filter(r.filter) }),
        ...(!("costAtMost" in r) || r.costAtMost === undefined ? {} : { costAtMost: value(r.costAtMost) }),
        ...(!("costLessThan" in r) || r.costLessThan === undefined ? {} : { costLessThan: value(r.costLessThan) }),
        ...(!("costGreaterThan" in r) || r.costGreaterThan === undefined ? {} : { costGreaterThan: value(r.costGreaterThan) }),
        ...(!("costExactly" in r) || r.costExactly === undefined ? {} : { costExactly: value(r.costExactly) }),
      };
      default: return r;
    }
  };
  const ability = (a: Ability): Ability => {
    switch (a.kind) {
      case "event": return { ...a, effect: node(a.effect) };
      case "static": return { ...a, effect: node(a.effect), ...(a.while === undefined ? {} : { while: condition(a.while) }) };
      case "triggered": return { ...a, trigger: trigger(a.trigger), effect: node(a.effect), ...(a.condition === undefined ? {} : { condition: condition(a.condition) }) };
      case "activated": return { ...a, costs: a.costs.map(cost), effect: node(a.effect) };
      case "additionalCost": return { ...a, costs: a.costs.map(c => cost(c)) };
      case "reclaim": return { ...a, costs: a.costs.map(c => cost(c)) };
      case "alternativeCost": return { ...a, costs: a.costs.map(cost), ...(a.condition === undefined ? {} : { condition: condition(a.condition) }) };
      case "winCondition": case "playCondition": return { ...a, condition: condition(a.condition) };
      case "keyword": case "eventCopyModifier": return a;
      default: return assertNever(a);
    }
  };
  function node<N extends EffectNode>(input: N): N {
    const previous = memo.get(input);
    if (previous !== undefined) return previous as N;
    // Register before following movedCards/movedBy references to the same instruction.
    const output = { ...input };
    memo.set(input, output);
    Object.assign(output, visit(input as unknown as Effect));
    return output;
  }
  function visit(n: Effect): Effect {
    switch (n.op) {
      case "abandon": return { ...n, predicate: selector(n.predicate) };
      case "awaken": case "banish": case "banishUntil": case "dissolve": case "exhaust": case "gainControl":
      case "giveAllTypes": case "grant": case "loseAllAbilities": case "move": case "rematerialize":
      case "triggerAbility": return { ...n, subject: reference(n.subject) };
      case "phase": return { ...n, subject: reference(n.subject) };
      case "returnFromVoid": return { ...n, subject: reference(n.subject) };
      case "returnToHand": {
        const subject = n.subject;
        return subject.kind === "stackTarget" ? { ...n, subject: reference(subject) } : { op: n.op, subject: reference(subject) };
      }
      case "gainSpark": case "gainAdditionalSpark": case "sparkModifier": return { ...n, subject: reference(n.subject), amount: value(n.amount) };
      case "setBaseSpark": return { ...n, subject: reference(n.subject), value: value(n.value) };
      case "copyCard": return { ...n, card: reference(n.card) };
      case "changeCardCost": return { ...n, card: reference(n.card) };
      case "copyCardTimes": return { ...n, card: reference(n.card), times: n.times };
      case "createCopyInHand": case "materializeFigmentCopy": return { ...n, of: reference(n.of) };
      case "costModifier": return { ...n, filter: filter(n.filter), amount: value(n.amount) };
      case "costModifierNth": case "costSetter": case "createRandomFromPool": case "discardChosen": case "drawMatching":
      case "playImmediately": case "journeyDeckKeyword": return { ...n, filter: filter(n.filter) };
      case "drawThenIf": return { ...n, filter: filter(n.filter), then: node(n.then) };
      case "discover": return n.costExactly !== undefined ? { ...n, filter: filter(n.filter), costExactly: value(n.costExactly) } : n.costGreaterThan !== undefined ? { ...n, filter: filter(n.filter), costGreaterThan: value(n.costGreaterThan) } : { ...n, filter: filter(n.filter) };
      case "discard": case "draw": case "erode": case "foresee": case "lookAtTop": return { ...n, count: value(n.count) };
      case "gainEnergy": case "gainMaxEnergy": case "gainPoints": case "gainTriggeringCardSpark": case "loseEnergy":
      case "losePoints": case "selfCostReduction": case "storeCounters": return { ...n, amount: value(n.amount) };
      case "chooseOne": return { ...n, modes: n.modes.map(child => node(child)) };
      case "choosePlayer": return { ...n, you: node(n.you), opponent: node(n.opponent) };
      case "chooseSubtype": return { ...n, then: n.then === null ? null : node(n.then) };
      case "eachPlayer": case "forDuration": case "modifyCardCost": case "optional": case "payTo": case "unlessPays": return { ...n, effect: node(n.effect) };
      case "repeat": return { ...n, times: value(n.times), effect: node(n.effect) };
      case "floatingTrigger": return { ...n, trigger: trigger(n.trigger), effect: node(n.effect) };
      case "ifThen": return { ...n, condition: condition(n.condition), then: node(n.then), otherwise: n.otherwise === null ? null : node(n.otherwise) };
      case "disableTriggers": return { ...n, subject: reference(n.subject), while: n.while === null ? null : condition(n.while) };
      case "gainAbilities": return { ...n, banish: node(n.banish) };
      case "grantCardKeyword": return { ...n, cards: reference(n.cards) };
      case "grantReclaim": return { ...n, cards: reference(n.cards), costs: n.costs === null ? null : n.costs.map(cost) };
      case "grantTriggeringCardReclaim": return { ...n, costs: n.costs.map(cost) };
      case "linkedBanish": return n.action === "take" ? n : { ...n, count: value(n.count) };
      case "materialize": return { ...n, from: "op" in n.from ? node(n.from) : reference(n.from) };
      case "materializeChosen": return { ...n, costAtMost: value(n.costAtMost) };
      case "materializeFigments": {
        const original = figments.find(figment => figment.id === n.figment);
        if (replacement === undefined) return { ...n, count: value(n.count) };
        if (original === undefined) throw new Error("Unknown original figment UUID");
        return { ...n, count: value(n.count), figment: replacement.id, spark: n.spark ?? original.spark };
      }
      case "playFromZone": return { ...n, filter: filter(n.filter), cards: n.cards === null ? null : reference(n.cards) };
      case "playRestriction": return n.restriction.kind !== "matching" ? n : { ...n, restriction: { ...n.restriction, filter: filter(n.restriction.filter) } };
      case "prevent": return { ...n, unlessAbandons: n.unlessAbandons === null ? null : selector(n.unlessAbandons) };
      case "putInDeck": return n.from === "cards" ? { ...n, cards: n.cards.map(card => reference(card)) } : { ...n, count: value(n.count) };
      case "banishCards": return n.from === "cards" ? { ...n, cards: n.cards.map(card => reference(card)) } : { ...n, filter: filter(n.filter) };
      case "shuffleInto": return { ...n, cards: n.cards.map(card => reference(card)) };
      case "sequence": return { ...n, effects: n.effects.map(child => node(child)) };
      case "ruleModifier": return n.rule === "dawnThreshold" ? { ...n, effect: node(n.effect) } : n;
      case "takeFromAmong": return { ...n, filter: filter(n.filter), among: n.among.kind === "movedBy" ? { ...n.among, effect: node(n.among.effect) } : n.among };
      case "withMaterialized": return { ...n, materialize: node(n.materialize), effect: node(n.effect) };
      case "abandonCards": case "additionalDrawPhaseCards": case "banishSelfOnResolve": case "copyAbandonedSubjectAsFigment":
      case "copyFirstEventLastTurnToHand": case "costModifierReclaim": case "createCard": case "doubleEnergy": case "drawDreamwell":
      case "firstMaterializationKeyword": case "firstPlayedCharacterEntrySpark": case "firstPlayedSparkSetter":
      case "journeyDeckSparkModifier": case "materializeKeywordModifier": case "offeringDiscardPaymentOption": case "preserveEphemeralHand":
      case "reclaimNotBanished": case "redrawChosenHand": case "redrawHand": case "repeatTriggeringAbility": case "returnAllButOne":
      case "revealDeckTop": case "reveal": case "takeExtraTurn": case "triggerAbandonedNamed": case "winTheGame": return n;
      default: return assertNever(n);
    }
  }
  return abilities.map(ability);
}

function assertNever(value: never): never {
  throw new Error(`Unknown ability type remap discriminator: ${JSON.stringify(value)}`);
}
