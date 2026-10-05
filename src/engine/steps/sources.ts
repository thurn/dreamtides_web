import type { Answer, Prompt } from "../prompts/types";
import type { BattleState } from "../state/types";
import type { Side } from "../state/ids";
import type { AnswerSource } from "./types";

/** Answers each prompt by asking the answering side's policy synchronously. */
export class InlineSource implements AnswerSource {
  constructor(
    private readonly policies: Readonly<
      Record<Side, (prompt: Prompt, work: BattleState) => Answer>
    >,
  ) {}

  answer(prompt: Prompt, work: BattleState): Answer {
    return this.policies[prompt.side](prompt, work);
  }
}

/** Answers prompts from a fixed list, failing on a missing or unused answer. */
export class ScriptedSource implements AnswerSource {
  private next = 0;

  constructor(private readonly answers: readonly Answer[]) {}

  answer(prompt: Prompt): Answer {
    const value = this.answers[this.next];
    if (value === undefined) {
      throw new Error(
        `ScriptedSource has no answer for a ${prompt.kind} prompt (${prompt.purpose.role})`,
      );
    }
    this.next += 1;
    return value;
  }

  /** Throws when scripted answers were left unused. */
  assertExhausted(): void {
    if (this.next !== this.answers.length) {
      throw new Error(
        `ScriptedSource has ${String(this.answers.length - this.next)} unused answers`,
      );
    }
  }
}

/** A source for steps that must never prompt. */
export const NO_PROMPTS: AnswerSource = {
  answer(prompt) {
    throw new Error(`Unexpected ${prompt.kind} prompt (${prompt.purpose.role})`);
  },
};
