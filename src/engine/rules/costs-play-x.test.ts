/**
 * A chosen energy X bound before targets: play-time and stored activation X
 * in target, modal, and additional-cost selectors, through reload, cancel,
 * and rejected answers.
 */
import { expect, it } from "vitest";
import { createEngine } from "../engine";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import type { Prompt } from "../prompts/types";
import { stateHash } from "../state/hash";
import { ScriptedSource } from "../steps/sources";
import { SEARCH, engine, v, board, run, playFirst, plays, sliceOf, appliedSlice } from "./costs.fixtures";

it("chooses targets using the chosen energy X while the played source is still in hand", () => {
  const { state, ids } = board({ back: [v.vanilla2.id, v.vanilla2.id], hand: [SEARCH.playTimeX.id], energy: 3 });
  expect(plays(state)).toContain(ids.player.hand[0]);
  const after = playFirst(state, ids.player.hand[0], [[ids.player.back[1]!]]).state;
  expect(after.stack[0]).toMatchObject({ x: 2, choices: [{ modes: [], targets: [[ids.player.back[1]]] }] });
  expect(after.sides.player.currentEnergy).toBe(1);
});

it("uses chosen play X for modal availability and additional-cost selectors without sharing costs and targets", () => {
  const modal = board({ back: [v.vanilla2.id, v.vanilla2.id], hand: [SEARCH.modalPlayTimeX.id], energy: 3 });
  const modalAfter = playFirst(modal.state, modal.ids.player.hand[0], [2, 0, [modal.ids.player.back[1]!]]).state;
  expect(modalAfter.stack[0]).toMatchObject({ x: 2, choices: [{ modes: [0], targets: [[modal.ids.player.back[1]]] }] });
  const paying = board({ back: [v.vanilla1.id, v.vanilla2.id, v.vanilla2.id, v.vanilla2.id], hand: [SEARCH.payingPlayTimeX.id], energy: 3 });
  const [wrongCost, targetCard, payment, unused] = paying.ids.player.back;
  const source = new ScriptedSource([[targetCard!], [payment!]]);
  const prompts: Prompt[] = [];
  const after = engine.apply(paying.state, "player", { kind: "play", card: paying.ids.player.hand[0], from: "hand" }, { answer(prompt) { prompts.push(prompt); return source.answer(prompt); } }).state;
  source.assertExhausted();
  expect(prompts.map(prompt => "candidates" in prompt ? prompt.candidates : [])).toEqual([[targetCard, payment, unused], [payment, unused]]);
  expect(after.stack[0]).toMatchObject({ x: 2, choices: [{ targets: [[targetCard]], modes: [] }] });
  expect(after.sides.player.currentEnergy).toBe(1);
  expect(after.instances[payment!]?.zone).toBe("void");
  expect(after.instances[wrongCost!]?.zone).toBe("play");
  expect(after.instances[targetCard!]?.zone).toBe("play");
});

it("keeps activation selectors bound to the source's stored played X", () => {
  const { state, ids } = board({ back: [SEARCH.storedActivationX.id, v.vanilla2.id, v.vanilla2.id, v.vanilla2.id], energy: 3 });
  const [sourceCard, targetCard, payment] = ids.player.back;
  state.instances[sourceCard!].status.x = 2;
  const after = run(state, "player", { kind: "activate", source: sourceCard!, ability: 0 }, [1, [targetCard!], [payment!]]).state;
  expect(after.stack[0]).toMatchObject({ kind: "ability", x: 1, choices: { modes: [], targets: [[targetCard]] } });
  expect(after.instances[sourceCard!].status.x).toBe(2);
  expect(after.instances[payment!]?.zone).toBe("void");
  expect(after.sides.player.currentEnergy).toBe(2);
});

it("replays the chosen X before target publication through reload, cancel and rejected answers", () => {
  const { state, ids } = board({ back: [v.vanilla1.id, v.vanilla2.id, v.vanilla2.id], hand: [SEARCH.playTimeX.id], energy: 3 });
  const card = ids.player.hand[0];
  const action = { kind: "play", card, from: "hand" } as const;
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action }));
  const number = fold.pending(opened)!.prompt;
  expect(number.kind).toBe("chooseNumber");
  const chosen = appliedSlice(fold.reduce(opened, { kind: "answer", side: "player", promptId: number.id, value: 2 }));
  const pending = fold.pending(chosen)!.prompt;
  expect(pending).toMatchObject({ kind: "chooseTargets", candidates: ids.player.back.slice(1), cancellable: true });
  expect(stateHash(chosen.committed)).toBe(stateHash(state));
  expect(state.instances[card].status.x).toBeNull();
  const saved = JSON.parse(JSON.stringify(chosen)) as BattleSlice;
  const cold = createFoldAdapter(createEngine(engine.catalog));
  expect(cold.pending(saved)?.prompt).toEqual(pending);
  expect(cold.reduce(saved, { kind: "battleAction", side: "player", action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
  expect(cold.reduce(saved, { kind: "answer", side: "enemy", promptId: pending.id, value: [ids.player.back[1]!] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
  expect(cold.reduce(saved, { kind: "answer", side: "player", promptId: pending.id, value: [ids.player.back[0]!] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
  expect(cold.reduce(saved, { kind: "answer", side: "player", promptId: number.id, value: 2 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
  const cancelled = appliedSlice(cold.reduce(saved, { kind: "cancel", side: "player", promptId: pending.id }));
  expect(stateHash(cancelled.committed)).toBe(stateHash(state));
  const reopened = appliedSlice(cold.reduce(cancelled, { kind: "battleAction", side: "player", action }));
  expect(cold.pending(reopened)!.prompt.id).not.toBe(number.id);
  const answered = appliedSlice(cold.reduce(saved, { kind: "answer", side: "player", promptId: pending.id, value: [ids.player.back[2]!] }));
  expect(answered.committed.stack[0]).toMatchObject({ x: 2, choices: [{ modes: [], targets: [[ids.player.back[2]]] }] });
  expect(answered.committed.sides.player.currentEnergy).toBe(1);
  expect(answered.committed.instances[card].status.x).toBeNull();
  expect(cold.reduce(answered, { kind: "answer", side: "player", promptId: pending.id, value: [ids.player.back[2]!] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
});
