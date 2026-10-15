import { afterEach, describe, expect, it } from "vitest";
import { accepted, apply, battleWorld, BONE, SKULL, clear } from "./journey-rewards272-fixtures";
import { journeyBattleOf } from "../battle/fold";
import { pendingEnginePrompt } from "../battle/engine-battle";
import type { FoldState } from "../fold-state";
import type { Engine } from "../../engine";
import { anyCharacter, target } from "../../engine/dsl/builders";
import { banish } from "../../engine/effects/primitives";
afterEach(clear);
function board(state: FoldState) { const b = journeyBattleOf(state.battle); if (b === null) throw new Error("missing battle"); return b.engine.slice.committed; }
function play(state: FoldState) { return accepted(state, "BATTLE_ACTION", { side: "player", action: { kind: "play", card: board(state).sides.player.hand[0], from: "hand" } }); }
function pass(state: FoldState, engine: Engine) {
  const side = engine.decision(board(state))?.side;
  if (side === undefined || !engine.legalActions(board(state), side).some((action) => action.kind === "pass")) throw new Error("No public pass");
  return accepted(state, "BATTLE_ACTION", { side, action: { kind: "pass" } });
}
describe("journey Essence from real committed battle steps", () => {
  it("pays an actual opening automatic removal from BEGIN_BATTLE, without waiting for a later intent", () => {
    const w = battleWorld({ openingRemoval: true, held: [BONE, SKULL] });
    const before = { ...w.state, battle: null }, result = apply(before, "BEGIN_BATTLE", { siteId: w.state.battle!.init.siteId });
    expect(result.outcome).toBe("applied"); expect(result.state.journey.essence).toBe(before.journey.essence + 7);
    expect(result.logRecords?.filter((row) => row.fields.hook === "battle_step_committed")).toHaveLength(1);
    expect(apply(result.state, "BEGIN_BATTLE", { siteId: w.state.battle!.init.siteId }).state).toBe(result.state);
  });
  it.each([false, true])("pays each real outside-Challenge dissolve/banish and each physical source once, banish=%s", (banished) => {
    const w = battleWorld({ held: [BONE, SKULL, BONE], ...(banished ? { effect: banish(target(anyCharacter())) } : {}) });
    const before = w.state.journey.essence, victim = board(w.state).sides.enemy.backRank[0]!;
    let state = play(w.state);
    for (let n = 0; n < 4 && board(state).instances[victim].zone === "play"; n++) state = pass(state, w.engine);
    expect(board(state).instances[victim].zone).toBe(banished ? "banished" : "void");
    expect(state.journey.essence).toBe(before + 14);
    const loaded = accepted(state, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(state.journey)), battle: JSON.parse(JSON.stringify(state.battle)) });
    expect(loaded.journey.essence).toBe(before + 14); expect(apply(loaded, "END_BATTLE").state).toBe(loaded);
  });
  it("credits an actual lane dissolve to the controlling character, excluding the outside-Challenge source", () => {
    const w = battleWorld({ challenge: true, held: [BONE, SKULL, SKULL] }); let state = w.state;
    const victim = board(state).sides.enemy.frontRank[0]!, before = state.journey.essence;
    for (let n = 0; n < 20 && board(state).instances[victim].zone === "play"; n++) state = pass(state, w.engine);
    expect(board(state).instances[victim].zone).toBe("void"); expect(state.journey.essence).toBe(before + 22);
  });
  it("excludes a causal effect removal resolving during Challenge and distinguishes it from the lane cause", () => {
    const w = battleWorld({ challenge: true, cascade: true, held: [BONE, SKULL] }); let state = w.state;
    const second = board(state).sides.enemy.backRank[0]!, before = state.journey.essence;
    for (let n = 0; n < 20 && board(state).instances[second].zone === "play"; n++) state = pass(state, w.engine);
    expect(board(state).instances[second].zone).toBe("void"); expect(state.journey.essence).toBe(before + 11);
  });
  it("does not credit a removal prefix until its final answer commits, including cold reload and stale answers", () => {
    const w = battleWorld({ discard: true, held: [BONE] }); let state = play(w.state);
    for (let n = 0; n < 4 && pendingEnginePrompt(state.battle, w.engine) === null; n++) state = pass(state, w.engine);
    const pending = pendingEnginePrompt(state.battle, w.engine)!; expect(pending.prompt.kind).toBe("chooseCards");
    expect(state.journey.essence).toBe(w.state.journey.essence);
    state = JSON.parse(JSON.stringify(state)) as FoldState;
    const intent = { side: "player", promptId: pending.prompt.id, value: [board(state).sides.player.hand[0]] };
    expect(apply(state, "BATTLE_ANSWER", { ...intent, side: "enemy" }).state).toBe(state);
    state = accepted(state, "BATTLE_ANSWER", intent);
    expect(state.journey.essence).toBe(w.state.journey.essence + 7);
    expect(apply(state, "BATTLE_ANSWER", intent).state).toBe(state);
  });
  it("pays no rolled-back removal when the resolving effect throws", () => {
    const w = battleWorld({ fail: true, held: [BONE] }); let state = play(w.state);
    for (let n = 0; n < 4 && board(state).stack.length > 0 && w.engine.decision(board(state)) !== null; n++) state = pass(state, w.engine);
    expect(state.journey.essence).toBe(w.state.journey.essence);
    const victim = board(state).sides.enemy.backRank[0]!; expect(board(state).instances[victim].zone).toBe("play");
  });
  it("uses actual battle emblems after journey source loss, and ignores a journey source gained after battle began", () => {
    const w = battleWorld({ held: [BONE] });
    let state = accepted(w.state, "REMOVE_DREAMSIGN", { dreamsignId: BONE });
    state = play(state); for (let n = 0; n < 4 && board(state).stack.length > 0; n++) state = pass(state, w.engine);
    expect(state.journey.essence).toBe(w.state.journey.essence + 7);
    const other = battleWorld({ held: [] }); state = accepted(other.state, "ADD_DREAMSIGN", { dreamsignId: BONE }); state = play(state);
    for (let n = 0; n < 4 && board(state).stack.length > 0; n++) state = pass(state, other.engine);
    expect(state.journey.essence).toBe(other.state.journey.essence);
  });
});
