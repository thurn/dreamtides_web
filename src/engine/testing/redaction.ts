/**
 * The view-redaction invariant (engine-design § Testing layers): a side's
 * view, and its view of a pending prompt, never contain the instance ID of a
 * card that side cannot identify, and the knowledge each view reports
 * matches the state.
 */
import type { EngineCatalog } from "../catalog";
import { promptCards } from "../prompts/structure";
import type { Prompt } from "../prompts/types";
import type { InstanceId, Side } from "../state/ids";
import { opponent, SIDES } from "../state/ids";
import type { BattleState } from "../state/types";
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
