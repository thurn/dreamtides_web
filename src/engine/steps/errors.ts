import type { Prompt, PromptFingerprint } from "../prompts/types";

/** Thrown when a prompt has no recorded answer in interactive play; the step suspends. */
export class Suspend extends Error {
  constructor(readonly prompt: Prompt) {
    super(`Suspended on a ${prompt.kind} prompt (${prompt.purpose.role})`);
  }
}

/** A replayed prompt differs from the one recorded: the rules code is nondeterministic. */
export class ReplayDivergence extends Error {
  constructor(
    readonly index: number,
    readonly expected: PromptFingerprint,
    readonly actual: PromptFingerprint,
  ) {
    super(`Replay diverged at answer ${String(index)}: expected ${expected}, got ${actual}`);
  }
}

/** Thrown at the commit point during a legality dry run: the action is feasible. */
export class Feasible extends Error {
  constructor() {
    super("feasible");
  }
}

/**
 * A play-time answer path reached the end of its cost choices with costs it
 * cannot pay, such as an X or an alternative that leaves too little energy
 * once cost modifications apply. A feasibility search treats it as a dead
 * end; a real run never reaches one, because its prompts offer only answers
 * with a feasible continuation.
 */
export class Infeasible extends Error {
  constructor(readonly reason: string) {
    super(`Infeasible play-time choices: ${reason}`);
  }
}

/** Rules code raised a prompt with no legal answer, which must never happen. */
export class EmptyPrompt extends Error {
  constructor(readonly prompt: Prompt) {
    super(`A ${prompt.kind} prompt (${prompt.purpose.role}) has no legal answer`);
  }
}

/** An answer source returned an answer the prompt does not allow. */
export class IllegalAnswer extends Error {
  constructor(readonly prompt: Prompt) {
    super(`Illegal answer to a ${prompt.kind} prompt (${prompt.purpose.role})`);
  }
}

/** A loop replay raised a prompt its recording does not answer: the player must decide it. */
export class UnrecordedPrompt extends Error {
  constructor(readonly prompt: Prompt) {
    super(`A loop replay raised an unrecorded ${prompt.kind} prompt (${prompt.purpose.role})`);
  }
}
