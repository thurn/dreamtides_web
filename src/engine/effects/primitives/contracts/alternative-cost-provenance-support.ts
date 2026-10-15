/** Synthetic public play fixtures; cost occurrences remain positional even when descriptors are shared. */
import type { EngineCardDefinition } from "../../../catalog";
import { additionalCost, alternativeCost, choiceCost, discardCost, discardCostFilter, energy, enemyCharacter, event, optionalCost, target, x } from "../../../dsl/builders";
import type { Answer, Prompt } from "../../../prompts/types";
import { firstLegalAnswer } from "../../../prompts/answers";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { opponent, type Side } from "../../../state/ids";
import { boardState } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { dissolve } from "../dissolve";

export type ProvenanceKind = "composite" | "capture" | "count";
export function provenanceCard(kind: ProvenanceKind): EngineCardDefinition {
  const shared = discardCost(1);
  const capture = kind === "capture" ? discardCostFilter({}, { captureCost: true }) : discardCostFilter({}, { count: "x", min: 1 });
  return { ...v.event1, id: syntheticId(kind === "composite" ? 0x70201 : kind === "capture" ? 0x70202 : 0x70203),
    costs: [energy(3)], status: "authored", speed: "interrupt", abilities: () => kind === "composite" ? [
      event(dissolve(target(enemyCharacter()))),
      additionalCost(optionalCost(shared)),
      alternativeCost(energy(0), choiceCost([energy(1)], [energy(2)]), optionalCost(energy(1))),
      additionalCost(choiceCost([shared], [energy(1)])),
      additionalCost(shared),
      additionalCost(optionalCost(shared)),
    ] : [event(dissolve(target(enemyCharacter({ costAtMost: x() })))),
      alternativeCost(energy(0)), additionalCost(capture)],
  };
}
export function provenanceFixture(side: Side, kind: ProvenanceKind = "composite", definition = provenanceCard(kind)) {
  const engine = createEngine(testCatalog([definition]));
  const deck = Array.from({ length: 12 }, () => v.vanilla1.id);
  const board = boardState(engine.catalog, { active: side, phase: "day",
    [side]: { hand: [definition.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla1.id], energy: 10, deck },
    [opponent(side)]: { back: [v.vanilla1.id, v.vanilla2.id], hand: [v.interruptEvent.id], energy: 10, deck },
  });
  const state = { ...board.state, config: { ...board.state.config, autoAnswerForcedPrompts: false } };
  const id = board.ids[side].hand[0];
  return { engine, state, ids: board.ids, id, side, definition, action: { kind: "play" as const, card: id, from: "hand" as const } };
}
export function provenanceAnswer(prompt: Prompt, route: "normal" | "alternativeCost" = "alternativeCost", optional = true, choice = 0): Answer {
  if (prompt.kind === "chooseMode" && (prompt.purpose.role === "playRoute" || prompt.purpose.role === "voidRoute")) return prompt.options.find(option => option.route === route)?.mode ?? firstLegalAnswer(prompt);
  if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
  if (prompt.kind === "confirm") return optional;
  if (prompt.kind === "chooseMode") return choice;
  return firstLegalAnswer(prompt);
}
export function provenanceApplied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Expected applied intent: ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
export const provenanceSlice = (committed: ReturnType<typeof provenanceFixture>["state"]): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
export function provenanceOpen(f: ReturnType<typeof provenanceFixture>) {
  const fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
  const slice = provenanceApplied(fold.reduce(provenanceSlice(f.state), { kind: "battleAction", side: f.side, action: f.action }));
  return { fold, slice };
}
