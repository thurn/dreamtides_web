/**
 * The redaction invariants (engine-design § Testing layers): a side's view,
 * its view of a pending prompt, and every event it may see never name a card
 * that side cannot identify, and the knowledge each view reports matches the
 * state.
 */
import type { EngineCatalog } from "../catalog";
import { eventSeenBy, type EngineEvent } from "../events";
import { promptCards } from "../prompts/structure";
import type { Prompt } from "../prompts/types";
import type { CardId, InstanceId, Side } from "../state/ids";
import { cardIdFromUnknown } from "../../types/card-identity";
import { opponent, SIDES } from "../state/ids";
import type { BattleState } from "../state/types";
import { identifies } from "../view/knowledge";
import { promptView, view, type BattleView } from "../view/view";

/** Every string in a value, keys included. */
export function strings(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    into.add(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) strings(entry, into);
  } else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      into.add(key);
      strings(entry, into);
    }
  }
  return into;
}

/**
 * The cards in decks and hands whose identity `viewer` does not know: every
 * deck card and every card in the other side's hand, except those listed in
 * `knownTo[viewer]`. Read from the zone lists, independently of
 * view/knowledge.ts.
 */
export function hiddenFrom(state: BattleState, viewer: Side): InstanceId[] {
  const known = new Set(state.knownTo[viewer]);
  const candidates = [...state.sides.player.deck, ...state.sides.enemy.deck, ...state.sides[opponent(viewer)].hand];
  return candidates.filter((id) => !known.has(id));
}

/** Whether `viewer` may identify `id`, by the same independent reading. */
function identifiable(state: BattleState, viewer: Side, id: InstanceId): boolean {
  return state.instances[id] !== undefined && !hiddenFrom(state, viewer).includes(id);
}

function leaks(value: unknown, hidden: readonly InstanceId[]): InstanceId[] {
  const seen = strings(value);
  return hidden.filter((id) => seen.has(id));
}

/** Violations of redaction in `seen`, `viewer`'s view of `state`. */
function viewViolations(state: BattleState, viewer: Side, seen: BattleView): string[] {
  const problems: string[] = [];
  const leaked = leaks(seen, hiddenFrom(state, viewer));
  if (leaked.length > 0) problems.push(`${viewer}'s view reveals hidden cards ${leaked.join(", ")}`);
  for (const side of SIDES) {
    for (const zone of ["deck", "hand"] as const) {
      const ids = state.sides[side][zone];
      const zoneView = seen.sides[side][zone];
      const hidden = new Set(hiddenFrom(state, viewer));
      const expected = ids.flatMap((id, index) => (hidden.has(id) ? [] : [{ id, index }]));
      if (zoneView.count !== ids.length || JSON.stringify(zoneView.known) !== JSON.stringify(expected)) {
        problems.push(`${viewer}'s view of the ${side} ${zone} differs from its knowledge`);
      }
    }
  }
  return problems;
}

/** The redaction invariant for a committed state: each side's view. */
export function redactionViolations(state: BattleState, catalog: EngineCatalog): string[] {
  return SIDES.flatMap((viewer) => viewViolations(state, viewer, view(state, viewer, catalog)));
}

/**
 * The redaction invariant while `prompt` is pending on the work state
 * `display`: each side's view of the state and of the prompt, and that the
 * chooser of a `privateTo` prompt knows its cards.
 */
export function promptRedactionViolations(prompt: Prompt, display: BattleState, catalog: EngineCatalog): string[] {
  const problems = redactionViolations(display, catalog);
  for (const viewer of SIDES) {
    const leaked = leaks(promptView(prompt, viewer, display), hiddenFrom(display, viewer));
    if (leaked.length > 0) problems.push(`${viewer}'s view of a ${prompt.kind} prompt reveals hidden cards ${leaked.join(", ")}`);
  }
  const chooser = prompt.privateTo;
  if (chooser !== undefined) {
    const unknown = promptCards(prompt).filter((id) => !identifiable(display, chooser, id));
    if (unknown.length > 0) problems.push(`the chooser of a private ${prompt.kind} prompt does not know ${unknown.join(", ")}`);
  }
  return problems;
}

/** A string found in an event payload, with the path of the field holding it. */
interface NamedString {
  readonly path: string;
  readonly text: string;
}

/** Every string in `value`, keys included, with its field path (`sources[0]`, `purpose.cardId`). */
function namedStrings(value: unknown, path: string, into: NamedString[]): NamedString[] {
  if (typeof value === "string") {
    into.push({ path, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => namedStrings(entry, `${path}[${String(index)}]`, into));
  } else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const field = path === "" ? key : `${path}.${key}`;
      into.push({ path: `${field} (key)`, text: key });
      namedStrings(entry, field, into);
    }
  }
  return into;
}

/** The shape of an `InstanceId`: `i` and a counter. */
const INSTANCE_ID = /^i\d+$/;

function isInstanceId(text: string): text is InstanceId {
  return INSTANCE_ID.test(text);
}

/** The instances of `state` printed from each card ID, by `printing.cardId` (cards and figment copies). */
function printedIndex(state: BattleState): Map<CardId, InstanceId[]> {
  const index = new Map<CardId, InstanceId[]>();
  for (const instance of Object.values(state.instances)) {
    if (instance.printing.kind === "figment") continue;
    const list = index.get(instance.printing.cardId);
    if (list === undefined) index.set(instance.printing.cardId, [instance.id]);
    else list.push(instance.id);
  }
  return index;
}

/**
 * The event-redaction invariant (engine-design § Testing layers) over one
 * game: each event as a side sees it (`eventSeenBy`, judged in the state
 * that arrives with it: absent when private to the other side, with any
 * per-viewer field redaction applied) names only cards that side can
 * identify before or after the events, so an event that reveals a card or
 * moves it into a public zone may name it.
 *
 * Identification is the view's own rule (`identifies`, view/knowledge.ts): a
 * public zone, the side's own hand, or a card it has learned. An instance in
 * neither state has left the battle or lived only between them: it counts
 * as identified when the side could identify it in the last checked state
 * that held it, or, failing that, when the side saw the `cardCreated` event
 * that made it.
 *
 * IDs are detected by walking every string of the payload, keys included:
 * - an instance ID is a string with the `InstanceId` shape (`i<n>`);
 * - a card ID is a string that is the printed card (`printing.cardId`) of an
 *   instance in either state. It counts as identified when the side can
 *   identify any instance printed from it, so it leaks only a card the side
 *   cannot see anywhere. Catalog IDs no instance has (Dreamwell cards,
 *   emblems, figments) name no hidden card.
 */
export class EventRedaction {
  /** The last checked state holding each instance seen so far. */
  private readonly lastHeld = new Map<InstanceId, BattleState>();
  private remembered: BattleState | null = null;
  /** Each checked state's `printedIndex`, built on first use. */
  private readonly printed = new WeakMap<BattleState, Map<CardId, InstanceId[]>>();

  private remember(state: BattleState): void {
    if (state === this.remembered) return;
    for (const instance of Object.values(state.instances)) this.lastHeld.set(instance.id, state);
    this.remembered = state;
  }

  private instancesPrintedFrom(state: BattleState, cardId: CardId): readonly InstanceId[] {
    let index = this.printed.get(state);
    if (index === undefined) {
      index = printedIndex(state);
      this.printed.set(state, index);
    }
    return index.get(cardId) ?? [];
  }

  /** Violations among `events`, published as the battle moved from `before` to `after`. */
  check(events: readonly EngineEvent[], before: BattleState, after: BattleState): string[] {
    this.remember(before);
    this.remember(after);
    const problems: string[] = [];
    for (const event of events) {
      for (const viewer of SIDES) {
        const seen = eventSeenBy(event, viewer, after);
        if (seen === null) continue;
        const found = namedStrings(seen, "", []).filter(({ path }) => path !== "kind");
        const identified = (id: InstanceId): boolean => {
          if (id in before.instances || id in after.instances) return identifies(before, id, viewer) || identifies(after, id, viewer);
          const held = this.lastHeld.get(id);
          if (held !== undefined) return identifies(held, id, viewer);
          return events.some((created) => {
            if (created.kind !== "cardCreated" || created.instance !== id) return false;
            const seenCreated = eventSeenBy(created, viewer, after);
            return seenCreated?.kind === "cardCreated" && seenCreated.instance === id;
          });
        };
        const leaked = found.filter(({ text }) => {
          if (isInstanceId(text)) return !identified(text);
          const cardId = cardIdFromUnknown(text);
          if (cardId === null) return false;
          const printed = [...this.instancesPrintedFrom(before, cardId), ...this.instancesPrintedFrom(after, cardId)];
          return printed.length > 0 && !printed.some(identified);
        });
        if (leaked.length > 0) {
          problems.push(`${viewer} sees a ${event.kind} event naming cards hidden from it: ${leaked.map(({ path, text }) => `${path}=${text}`).join(", ")}`);
        }
      }
    }
    return problems;
  }
}

/** The event-redaction invariant for one batch of `events` on its own (`EventRedaction`). */
export function eventRedactionViolations(events: readonly EngineEvent[], before: BattleState, after: BattleState): string[] {
  return new EventRedaction().check(events, before, after);
}
