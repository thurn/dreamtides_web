// The AI host of a journey's engine battle: it watches the fold, and when the
// AI's side owes a top-level decision or a prompt answer it asks a policy
// host (the Web Worker in live play) and submits the answer as an intent,
// the same `BATTLE_ACTION` / `BATTLE_ANSWER` a human client writes. The log
// records the intent, so replaying the log never runs the AI again.
//
// Failure paths:
// - The policy host fails (the worker crashes, errors, or misses its budget
//   plus grace): the decision is answered by the Random policy on the main
//   thread (O(1) per decision), logged as `ai.error`, so a battle never
//   waits on a dead worker.
// - The fold moves on before the answer arrives (the decision is stale):
//   the answer is discarded and logged as `ai.stale`. A stale prompt answer
//   would bounce anyway (its prompt id names the decision), and a stale
//   top-level action is never submitted.
// - Reload mid-decision: a fresh driver sees the same pending decision in
//   the replayed fold and asks again with the same seed. A decision whose
//   intent applied is gone from the fold, so it is never submitted twice;
//   each intent also carries an intent key naming its decision, which the
//   log applies at most once.
// - A submitted intent that bounces is submitted again only once the fold
//   has changed, never in a loop over an unchanged fold.
// - The fold moves on while a submission waits for its task (live play
//   submits in a task of its own): the waiting submission is dropped, and the
//   update that saw the newer fold submits the answer again or abandons it.

import type { Engine } from "../../engine";
import { aiDecision, runPolicy, type DecisionKey, type PolicyRequest } from "../../engine/policy/decide";
import type { PolicyHost } from "../../engine/policy/host";
import type { PolicyChoice, PolicyId, PolicyResult } from "../../engine/policy/types";
import type { Side } from "../../engine/state/ids";
import type { EventActor } from "../../eventlog/types";
import type { FoldState } from "../../rules/fold-state";
import type { GameActions } from "../../session/actions";
import { journeyBattleOf } from "../../rules/battle/fold";
import { pendingEnginePrompt } from "../../rules/battle/engine-battle";
import { parseIntentKey, type BattleId, type IntentKey, type PromptId } from "../../types/identifiers";

/** An AI intent for the session's action facade. */
export type EngineAiIntent =
  | { readonly kind: "action"; readonly side: Side; readonly choice: Extract<PolicyChoice, { kind: "action" }>; readonly intentKey: IntentKey }
  | {
      readonly kind: "answer";
      readonly side: Side;
      readonly promptId: PromptId;
      readonly choice: Extract<PolicyChoice, { kind: "answer" }>;
      readonly intentKey: IntentKey;
    };

/** Submits AI intents through the session's action facade, as `actor`. */
export function actionsSubmitter(actions: GameActions, actor?: EventActor): (intent: EngineAiIntent) => void {
  return (intent) => {
    if (intent.kind === "action") {
      void actions.battleAction(intent.side, intent.choice.action, actor, intent.intentKey);
    } else {
      void actions.answerPrompt(intent.side, intent.promptId, intent.choice.value, actor, intent.intentKey);
    }
  };
}

export interface EngineAiDriverOptions {
  readonly side: Side;
  readonly policy: PolicyId;
  readonly engine: Engine;
  readonly host: PolicyHost;
  readonly submit: (intent: EngineAiIntent) => void;
  readonly log: (event: string, fields: Record<string, unknown>) => void;
  readonly now: () => number;
  /** Budgets to use instead of the live D23 budgets (deterministic hosts). */
  readonly budgets?: Parameters<typeof aiDecision>[0]["budgets"];
  /**
   * Runs a submission later, in a task of its own (live play), so that
   * folding and presenting the AI's next intent never shares a main-thread
   * task with presenting the fold that asked for it. Without it, the driver
   * submits at once (deterministic hosts).
   */
  readonly schedule?: (submission: () => void) => void;
}

/** One decision the driver is working on. */
interface Work {
  readonly battleId: BattleId;
  readonly key: DecisionKey;
  readonly request: PolicyRequest;
  readonly promptId: PromptId | null;
  /** The answer, once the policy has given it. */
  choice: PolicyChoice | null;
  /** The fold the intent was last submitted against. */
  submittedAt: FoldState | null;
}

/** Where a decision's answer came from, for its log line. */
type AnswerSource = "worker" | "forced" | "fallback";

export class EngineAiDriver {
  private work: Work | null = null;
  private latest: FoldState | null = null;
  private disposed = false;

  constructor(private readonly options: EngineAiDriverOptions) {}

  /** Reacts to the current fold: starts, continues, or abandons the AI's decision. */
  update(state: FoldState): void {
    if (this.disposed) return;
    this.latest = state;
    const current = this.decisionIn(state);
    if (current === null) {
      this.abandon();
      return;
    }
    if (this.work === null || this.work.battleId !== current.battleId || this.work.key !== current.request.key) {
      this.abandon();
      this.start(current);
      return;
    }
    this.submit(state);
  }

  dispose(): void {
    this.disposed = true;
    this.work = null;
    this.options.host.dispose();
  }

  private decisionIn(state: FoldState): { battleId: BattleId; request: PolicyRequest; forced: PolicyChoice | null; promptId: PromptId | null } | null {
    const battle = journeyBattleOf(state.battle);
    if (battle === null) return null;
    const fold = battle.engine;
    const pending = pendingEnginePrompt(battle, this.options.engine);
    const decision = aiDecision({
      engine: this.options.engine,
      init: fold.init,
      slice: fold.slice,
      pending,
      side: this.options.side,
      policy: this.options.policy,
      ...(this.options.budgets === undefined ? {} : { budgets: this.options.budgets }),
    });
    if (decision === null) return null;
    return {
      battleId: battle.init.battleId,
      request: decision.request,
      forced: decision.forced,
      promptId: decision.request.decision.kind === "prompt" && pending !== null ? pending.prompt.id : null,
    };
  }

  /** Drops the decision in progress: its answer, if it still arrives, is stale. */
  private abandon(): void {
    this.work = null;
  }

  private start(current: NonNullable<ReturnType<EngineAiDriver["decisionIn"]>>): void {
    const work: Work = {
      battleId: current.battleId,
      key: current.request.key,
      request: current.request,
      promptId: current.promptId,
      choice: null,
      submittedAt: null,
    };
    this.work = work;
    if (current.forced !== null) {
      this.answered(work, current.forced, null, "forced", 0);
      return;
    }
    const asked = this.options.now();
    this.options.host.decide(current.request).then(
      (result) => {
        this.answered(work, result.choice, result, "worker", this.options.now() - asked);
      },
      (error: unknown) => {
        if (this.disposed) return;
        this.options.log("ai.error", {
          ...this.fields(work),
          reason: error instanceof Error && "reason" in error ? error.reason : "unknown",
          message: error instanceof Error ? error.message : String(error),
          fallback: "random",
        });
        let fallback: PolicyResult;
        try {
          fallback = runPolicy(this.options.engine, { ...work.request, policy: "random" }, this.options.now);
        } catch (fallbackError) {
          this.options.log("ai.error", {
            ...this.fields(work),
            reason: "fallbackFailed",
            message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          });
          return;
        }
        this.answered(work, fallback.choice, fallback, "fallback", this.options.now() - asked);
      },
    );
  }

  private fields(work: Work): Record<string, unknown> {
    const { decision } = work.request;
    return {
      battleId: work.battleId,
      side: work.request.side,
      key: work.key,
      decision: decision.kind === "topLevel" ? decision.decision.kind : decision.prompt.kind,
      ...(decision.kind === "prompt" ? { role: decision.prompt.purpose.role } : {}),
      policy: work.request.policy,
    };
  }

  private answered(work: Work, choice: PolicyChoice, result: PolicyResult | null, source: AnswerSource, roundTripMs: number): void {
    if (this.disposed) return;
    const trace = result?.trace;
    this.options.log("ai.decision", {
      ...this.fields(work),
      source,
      budget: work.request.budget,
      used: trace?.used ?? { iterations: 0, ms: 0 },
      roundTripMs,
      determinizations: trace?.determinizations ?? 0,
      candidates: trace?.candidates ?? [],
      chosen: choice,
      ...(trace?.declined === undefined ? {} : { declined: trace.declined }),
    });
    if (this.work !== work) {
      this.options.log("ai.stale", this.fields(work));
      return;
    }
    work.choice = choice;
    if (this.latest !== null) this.submit(this.latest);
  }

  /**
   * Submits the answer of the decision in progress, once per fold it is
   * current in. A scheduled submission still runs only while its decision is
   * in progress and its fold is the latest: when the fold has moved on, the
   * update that saw the newer fold submits or abandons instead.
   */
  private submit(state: FoldState): void {
    const work = this.work;
    if (work === null || work.choice === null || work.submittedAt === state) return;
    work.submittedAt = state;
    const intentKey = parseIntentKey(`engine-ai:${work.battleId}:${work.key}`);
    const { choice } = work;
    let intent: EngineAiIntent;
    if (choice.kind === "action") {
      intent = { kind: "action", side: work.request.side, choice, intentKey };
    } else if (work.promptId !== null) {
      intent = { kind: "answer", side: work.request.side, promptId: work.promptId, choice, intentKey };
    } else {
      return;
    }
    const { schedule } = this.options;
    if (schedule === undefined) {
      this.options.submit(intent);
      return;
    }
    schedule(() => {
      if (this.work !== work || this.latest !== state) return;
      this.options.submit(intent);
    });
  }
}
