import { createHash } from "node:crypto";
import type { Engine } from "../../src/engine/engine";
import { runPolicy, battleDecklists, type PolicyRequest } from "../../src/engine/policy/decide";
import type { PolicyDecision, PolicyChoice } from "../../src/engine/policy/types";
import { battleSeed, type Side } from "../../src/engine/state/ids";
import { cloneState } from "../../src/engine/state/clone";
import { initialState } from "../../src/engine/state/create";
import { stateHash } from "../../src/engine/state/hash";
import type { BattleState } from "../../src/engine/state/types";
import type { Prompt } from "../../src/engine/prompts/types";
import { InlineSource } from "../../src/engine/steps/sources";
import { ScriptedSource } from "../../src/engine/steps/sources";
import { eventLogRecords, stepLogRecords, legalityLogRecords, type EngineLogRecord } from "../../src/engine/log";
import { promptView } from "../../src/engine/view/view";
import { parseContentHash } from "../../src/types/content-hash";
import type { DecisionLog, GameOutcome, MatchSpec, PlayedAction, TournamentConfig } from "./types";
import SETTINGS from "./catalog.json";

/** A complete inline game; a failed step stays a failure, with its replay prefix retained. */
export function playGame(engine: Engine, spec: Pick<MatchSpec, "init" | "policies">, budgets: TournamentConfig["budgets"]): GameOutcome {
  const logs: (EngineLogRecord | DecisionLog)[] = [{ event: "engine.battleStarted", version: 0, init: spec.init, policies: spec.policies }];
  const actions: PlayedAction[] = [];
  let startAnswers: GameOutcome["startAnswers"] = [];
  let decisionCount = 0;
  let decisionMs = 0;
  let previous = initialState(spec.init, engine.catalog);
  const decklists = battleDecklists(spec.init);
  const choose = (state: BattleState, side: Side, decision: PolicyDecision): PolicyChoice => {
    if (decisionCount >= SETTINGS.maximumChoicesPerGame) throw new Error("Game choice safety ceiling exceeded");
    const ordinal = decisionCount++;
    const planning = decision.kind === "topLevel" && decision.decision.kind === "main" && state.turn.phase === "day" && state.turn.active === side;
    const request: PolicyRequest = { policy: spec.policies[side], side, key: `${state.version}:${ordinal}:decision`,
      view: engine.view(state, side), decision, decklists,
      seed: battleSeed(`${spec.init.seed}|ai|${side}|${String(ordinal)}`), budget: planning ? budgets.turnPlanning : budgets.response };
    const started = performance.now();
    const result = runPolicy(engine, request, () => performance.now());
    decisionMs += performance.now() - started;
    logs.push({ event: "ai.decision", side, seed: request.seed, trace: result.trace, decision });
    return result.choice;
  };
  const answer = (prompt: Prompt, work: BattleState) => {
    // Inline work is mutable within a step; Engine.view requires a fresh immutable snapshot.
    const snapshot = cloneState(work);
    const choice = choose(snapshot, prompt.side, { kind: "prompt", prompt: promptView(prompt, prompt.side, snapshot) });
    if (choice.kind !== "answer") throw new Error("Policy returned an action for a prompt");
    return choice.value;
  };
  const source = new InlineSource({ player: answer, enemy: answer });
  const observe: Parameters<Engine["apply"]>[4] = (state, _step, events) => {
    logs.push(...eventLogRecords(events, previous.version), ...stepLogRecords(previous, state));
    previous = state;
  };
  try {
    const started = engine.createBattle(spec.init, source, observe);
    startAnswers = started.answers;
    logs.push(...legalityLogRecords(started.bounded));
    let state = started.state;
    while (state.result === null) {
      const decision = engine.decision(state);
      if (decision === null) throw new Error("Engine has no decision before game end");
      const legal = engine.legalActions(state, decision.side);
      const choice = legal.length === 1 && legal[0] !== undefined
        ? { kind: "action" as const, action: legal[0] }
        : choose(state, decision.side, { kind: "topLevel", decision, legal });
      if (choice.kind !== "action") throw new Error("Policy returned an answer for an action");
      const applied = engine.apply(state, decision.side, choice.action, source, observe);
      const action = { side: decision.side, action: choice.action, answers: applied.answers };
      actions.push(action);
      logs.push({ event: "engine.action", version: state.version, ...action }, ...legalityLogRecords(applied.bounded));
      state = applied.state;
    }
    const finalStateHash = parseContentHash(createHash("sha256").update(stateHash(state)).digest("hex"));
    return { status: "completed", result: state.result, finalStateHash, startAnswers, actions, logs, decisionCount, decisionMs };
  } catch (error) {
    const failure = error instanceof Error ? error.stack ?? error.message : String(error);
    return { status: "failed", failure, startAnswers, actions, logs, decisionCount, decisionMs };
  }
}
/** Replay recorded payments and prompt choices without consulting any policy. */
export function replayGame(engine: Engine, spec: MatchSpec, played: GameOutcome): ReturnType<typeof parseContentHash> {
  const source = (answers: GameOutcome["startAnswers"]) => new ScriptedSource(answers.filter((answer) => answer.auto !== true).map((answer) => answer.value));
  const start = source(played.startAnswers);
  let state = engine.createBattle(spec.init, start).state;
  start.assertExhausted();
  for (const { side, action, answers } of played.actions) {
    const next = source(answers);
    state = engine.apply(state, side, action, next).state;
    next.assertExhausted();
  }
  return parseContentHash(createHash("sha256").update(stateHash(state)).digest("hex"));
}
