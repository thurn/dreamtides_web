import type { EngineCatalog } from "../catalog";
import { eventDefinition, type EngineEvent } from "../events";
import type { AnswerFor, Prompt } from "../prompts/types";
import { drawRandom } from "../state/rng";
import type { BattleState } from "../state/types";
import type { AnswerSource, StepContext } from "./types";

export class Context implements StepContext {
  readonly events: EngineEvent[] = [];
  committed = false;

  constructor(
    readonly state: BattleState,
    readonly catalog: EngineCatalog,
    private readonly source: AnswerSource,
  ) {}

  choose<P extends Prompt>(prompt: P): AnswerFor<P> {
    return this.source.answer(prompt, this.state) as AnswerFor<P>;
  }

  commitPoint(): void {
    this.committed = true;
  }

  emit(event: EngineEvent): void {
    eventDefinition(event.kind);
    this.events.push(event);
  }

  random(stream: string): number {
    return drawRandom(this.state, stream);
  }
}
