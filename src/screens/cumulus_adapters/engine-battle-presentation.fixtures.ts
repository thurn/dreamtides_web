// Shared fixtures for the battle presentation tests: the prompt lab's
// engine and presentation steps, a live presentation feed over a synthetic
// board, and the lab steps that discover and foresee.
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { PRESENTATION_OBSERVATION } from "../../battle/components/battle-presentation";
import { presentationItems } from "../../battle/components/presentation-items";
import { createEngine, type Engine, type EngineEvent } from "../../engine";
import { createCatalog } from "../../engine/catalog";
import { type BattleIntent, type BattleSlice } from "../../engine/fold/slice";
import { boardState, type BoardSetup } from "../../engine/testing/board";
import { batchStates, foldAdapterFor } from "../../rules/battle/engine-battle";
import { PROMPT_LAB_DEFINITIONS, promptLabFixture, promptLabPresentation } from "../../engine/testing/prompt-lab";
import { parsePresentationId as pid } from "../../types/identifiers";

export const labEngine = createEngine(
  createCatalog(PROMPT_LAB_DEFINITIONS.cards, [], PROMPT_LAB_DEFINITIONS.emblems, PROMPT_LAB_DEFINITIONS.figments),
);
export const cards = createEngineCardModels({ definitions: [], cards: new Map(), figment: () => undefined });

/** Each presentation step of a lab fixture, with its items for `human` and the view of the board after it. */
export function steps(name: string, human: "player" | "enemy" = "player") {
  const fixture = promptLabFixture(name);
  if (fixture === null) throw new Error(`no fixture ${name}`);
  return promptLabPresentation(labEngine, fixture).map((step, index) => {
    const batch = { key: pid(`${name}:${String(index)}`), state: step.after };
    return { ...step, batch, items: presentationItems(step.published, human, batch, step.before, () => null) };
  });
}

/** A live presentation feed over a synthetic board, using the same shared adapter and observation as the screen. */
export function observedBoard(setup: BoardSetup, engine: Engine = labEngine) {
  const { state, ids } = boardState(engine.catalog, setup);
  const adapter = foldAdapterFor(engine);
  let slice: BattleSlice = { committed: state, inFlight: null, attempt: 0, publishedEvents: 0 };
  const apply = (intent: BattleIntent) => {
    const before = slice;
    const outcome = adapter.reduce(slice, intent, PRESENTATION_OBSERVATION);
    if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("fixture intent failed");
    slice = outcome.slice;
    const states = batchStates(adapter, before, slice, outcome.published);
    const batch = { key: pid(`observed:${String(slice.attempt)}`), state: states.state };
    return {
      ...states,
      events: outcome.published,
      items: presentationItems(outcome.published, "player", batch, states.before, () => null, states.eventStates),
      batch,
    };
  };
  /** Passes for whichever side decides until a batch publishes `kind`; that batch. */
  const passUntil = (kind: EngineEvent["kind"]) => {
    for (let passes = 0; passes < 40; passes += 1) {
      const side = engine.decision(slice.committed)?.side;
      if (side === undefined) break;
      const applied = apply({ kind: "battleAction", side, action: { kind: "pass" } });
      if (applied.events.some((event) => event.kind === kind)) return applied;
    }
    throw new Error(`no batch publishes ${kind}`);
  };
  return { ids, adapter, apply, passUntil, slice: () => slice };
}

/** The step of the discover lab fixture that publishes its `cardDiscovered`, and the event's index in it. */
export function discovery(human: "player" | "enemy") {
  for (const step of steps("discover", human)) {
    const index = step.published.findIndex((event) => event.kind === "cardDiscovered");
    const event = step.published[index];
    if (event?.kind === "cardDiscovered" && event.instance !== null) return { step, index, instance: event.instance };
  }
  throw new Error("no discovery");
}

/** The step of the foresee lab fixture that publishes its `foresaw`, the event's index in it, and the cards it kept and voided. */
export function foresight(human: "player" | "enemy") {
  for (const step of steps("foresee", human)) {
    const index = step.published.findIndex((event) => event.kind === "foresaw");
    const event = step.published[index];
    if (event?.kind === "foresaw") return { step, index, kept: event.kept, voided: event.voided };
  }
  throw new Error("no foresee");
}
