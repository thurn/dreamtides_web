import { describe, expect, it } from "vitest";
import { createEngine } from "../engine";
import { createFoldAdapter } from "../fold/slice";
import type { Answer } from "../prompts/types";
import type { AbilitySource, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import { boardState, type BoardSetup } from "../testing/board";
import { AVATAR, DREAMSIGN, STACK, STACK_CARDS, SYNTHETIC_EMBLEMS } from "../testing/stack-cards";
import { SYNTHETIC, testCatalog } from "../testing/synthetic-cards";

const engine = createEngine(testCatalog(STACK_CARDS, SYNTHETIC_EMBLEMS));
const v = SYNTHETIC;
const deck = [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id];

function activate(state: BattleState, side: Side, source: AbilitySource, answers: readonly Answer[] = []) {
  const scripted = new ScriptedSource(answers);
  const result = engine.apply(state, side, { kind: "activate", source, ability: 0 }, scripted);
  scripted.assertExhausted();
  return result;
}

function activations(state: BattleState, side: Side) {
  return engine.legalActions(state, side).filter((action) => action.kind === "activate");
}

function board(setup: Partial<BoardSetup>) {
  return boardState(engine.catalog, {
    active: "player",
    phase: "day",
    enemy: { deck },
    ...setup,
  });
}

describe("activated abilities on the stack", () => {
  it("pays costs, puts the ability on the stack for the opponent to answer, then resolves it", () => {
    const { state: start, ids } = board({
      player: { back: [STACK.drawForEnergyAndExhaust.id], energy: 2, deck },
      enemy: { back: [STACK.interruptDraw.id], energy: 1, deck },
    });
    const source = ids.player.back[0]!;
    const { state, events } = activate(start, "player", source);
    expect(events.map((event) => event.kind)).toEqual(["energyChanged", "exhaustionChanged", "abilityActivated"]);
    expect(state.stack).toEqual([
      { kind: "ability", source, ability: 0, origin: { kind: "card", cardId: STACK.drawForEnergyAndExhaust.id, variant: { amplified: false } }, controller: "player", choices: { modes: [], targets: [] }, x: null, optionalPaid: [] },
    ]);
    expect(state.priority).toBe("enemy");
    expect(engine.decision(state)).toEqual({ kind: "respond", side: "enemy" });
    const resolved = engine.apply(state, "enemy", { kind: "pass" }, NO_PROMPTS);
    expect(resolved.events.map((event) => event.kind)).toEqual(["abilityResolved", "cardDrawn"]);
    expect(resolved.state.stack).toEqual([]);
    expect(resolved.state.instances[source]).toMatchObject({ zone: "play", status: { exhausted: true } });
    expect(resolved.state.sides.player.currentEnergy).toBe(1);
  });

  it("allows ☾ only for a ready back-rank character", () => {
    const { state, ids } = board({
      player: {
        back: [STACK.drawForEnergyAndExhaust.id, STACK.drawForEnergyAndExhaust.id],
        front: [STACK.drawForEnergyAndExhaust.id],
        energy: 5,
        deck,
      },
    });
    const [ready, tired] = ids.player.back;
    state.instances[tired!].status.exhausted = true;
    expect(activations(state, "player")).toEqual([{ kind: "activate", source: ready, ability: 0 }]);
  });

  it("chooses X before paying it, and the effect reads it", () => {
    const { state: start, ids } = board({ player: { back: [STACK.pointsForX.id], energy: 3, deck } });
    const source = ids.player.back[0]!;
    const { state } = activate(start, "player", source, [2]);
    expect(state.sides.player.currentEnergy).toBe(1);
    expect(state.sides.player.score).toBe(2);
    // X is at least 1, so with no energy the ability cannot be activated.
    start.sides.player.currentEnergy = 0;
    expect(activations({ ...start }, "player")).toEqual([]);
  });

  it("allows a once-per-turn ability once each turn", () => {
    const { state: start, ids } = board({ player: { back: [STACK.oncePerTurnEnergy.id], deck } });
    const source = ids.player.back[0]!;
    const { state } = activate(start, "player", source);
    expect(state.sides.player.currentEnergy).toBe(1);
    expect(activations(state, "player")).toEqual([]);
    let next = state;
    while (!(next.turn.active === "player" && next.turn.phase === "day" && next.turn.turnNumber > state.turn.turnNumber)) {
      const decision = engine.decision(next);
      if (decision === null) throw new Error("no decision");
      next = engine.apply(next, decision.side, { kind: "pass" }, NO_PROMPTS).state;
    }
    expect(activations(next, "player")).toHaveLength(1);
  });

  it("chooses abandon and discard costs at play time and never from the ability's targets", () => {
    const { state: start, ids } = board({
      player: { back: [STACK.abandonToPump.id, v.vanilla1.id], energy: 0, deck },
    });
    const [source, fodder] = ids.player.back;
    // Targeting the source leaves only the other character to abandon, so that choice is automatic.
    const { state, events, answers } = activate(start, "player", source!, [[source!]]);
    expect(answers.map((answer) => [answer.value, answer.auto ?? false])).toEqual([[[source], false], [[fodder], true]]);
    expect(events.filter((event) => event.kind === "abandoned")).toEqual([{ kind: "abandoned", instance: fodder, side: "player" }]);
    expect(state.instances[fodder!]?.zone).toBe("void");
    expect(state.instances[source!]?.status.gainedSpark).toBe(2);
    // With only the source in play, it cannot be both the target and the abandoned character.
    const alone = board({ player: { back: [STACK.abandonToPump.id], deck } });
    expect(activations(alone.state, "player")).toEqual([]);

    const discard = board({
      player: { back: [STACK.discardToDissolve.id], hand: [v.vanilla1.id], deck },
      enemy: { back: [v.vanilla2.id], deck },
    });
    const discarded = activate(discard.state, "player", discard.ids.player.back[0]!);
    expect(discarded.state.sides.player.void).toEqual(discard.ids.player.hand);
    expect(discarded.state.instances[discard.ids.enemy.back[0]!]?.zone).toBe("void");
  });

  it("resolves an ability whose source left play before it resolved", () => {
    const { state: start, ids } = board({
      player: { back: [STACK.drawForEnergyAndExhaust.id], energy: 1, deck },
      enemy: { back: [STACK.interruptDraw.id], energy: 1, deck },
    });
    const source = ids.player.back[0]!;
    const state = activate(start, "player", source).state;
    // The source ceases to exist, as a created card does, while its ability waits on the stack.
    state.sides.player.backRank[0] = null;
    state.instances = Object.fromEntries(Object.entries(state.instances).filter(([id]) => id !== source));
    const resolved = engine.apply(state, "enemy", { kind: "pass" }, NO_PROMPTS);
    expect(resolved.state.sides.player.hand).toHaveLength(1);
  });

  it("chooses a modal ability's mode at activation, stores it on the stack, and resolves that mode", () => {
    const { state: start, ids } = board({
      player: { back: [STACK.modalAbility.id], energy: 1, deck },
      enemy: { back: [STACK.interruptDraw.id, v.vanilla2.id], energy: 1, deck },
    });
    const victim = ids.enemy.back[1]!;
    const { state } = activate(start, "player", ids.player.back[0]!, [0, [victim]]);
    expect(state.stack).toEqual([expect.objectContaining({ kind: "ability", choices: { modes: [0], targets: [[victim]] } })]);
    const resolved = engine.apply(state, "enemy", { kind: "pass" }, NO_PROMPTS).state;
    expect(resolved.instances[victim]?.zone).toBe("void");
    expect(resolved.sides.player.score).toBe(0);
  });

  it("can be cancelled before the commit point, restoring the committed state", () => {
    const { state } = board({ player: { back: [STACK.pointsForX.id], energy: 3, deck } });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const slice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opened = fold.reduce(slice, { kind: "battleAction", side: "player", action: { kind: "activate", source: state.sides.player.backRank[0]!, ability: 0 } });
    if (opened.kind !== "applied") throw new Error("activation bounced");
    const pending = fold.pending(opened.slice);
    expect(pending?.prompt).toMatchObject({ kind: "chooseNumber", cancellable: true, purpose: { role: "chooseX", ability: 0 } });
    const cancelled = fold.reduce(opened.slice, { kind: "cancel", side: "player", promptId: pending!.prompt.id });
    if (cancelled.kind !== "applied") throw new Error("cancel bounced");
    expect(cancelled.slice.committed).toBe(state);
    expect(cancelled.slice.inFlight).toBeNull();
  });
});

describe("avatars and dreamsigns", () => {
  it("exhausts the avatar to pay ☾ until Ending clears it", () => {
    const { state: start } = board({ player: { avatar: AVATAR.drawer.id, deck }, enemy: { deck } });
    const avatar = { kind: "avatar", side: "player" } as const;
    expect(activations(start, "player")).toEqual([{ kind: "activate", source: avatar, ability: 0 }]);
    const { state, events } = activate(start, "player", avatar);
    expect(events.map((event) => event.kind)).toEqual(["avatarExhaustionChanged", "abilityActivated", "abilityResolved", "cardDrawn"]);
    expect(state.sides.player.avatar).toEqual({ id: AVATAR.drawer.id, exhausted: true });
    expect(activations(state, "player")).toEqual([]);
    // Pass through Dusk, Night, Challenge, and Ending into the enemy's turn.
    let current = state;
    while (current.turn.active === "player") {
      const decision = engine.decision(current);
      if (decision === null) throw new Error("no decision");
      current = engine.apply(current, decision.side, { kind: "pass" }, NO_PROMPTS).state;
    }
    expect(current.sides.player.avatar?.exhausted).toBe(false);
  });

  it("is never a character: character effects and counts never include it", () => {
    const { state: start } = board({
      player: { avatar: AVATAR.rally.id, back: [v.vanilla1.id], deck },
      enemy: { avatar: AVATAR.drawer.id, deck },
    });
    const { state } = activate(start, "player", { kind: "avatar", side: "player" });
    const gained = state.floating.map((effect) => (effect.change.kind === "spark" ? effect.change.instance : null));
    expect(gained).toEqual([start.sides.player.backRank[0]]);
  });

  it("answers the opponent's event with an Interrupt-speed avatar ability", () => {
    const { state: start, ids } = board({
      player: { hand: [v.event1.id], energy: 1, deck },
      enemy: { avatar: AVATAR.preventer.id, energy: 1, deck },
    });
    const played = engine.apply(start, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS).state;
    expect(engine.decision(played)).toEqual({ kind: "respond", side: "enemy" });
    const { state } = activate(played, "enemy", { kind: "avatar", side: "enemy" });
    expect(state.sides.player.void).toEqual(ids.player.hand);
    expect(state.sides.enemy.avatar?.exhausted).toBe(true);
    expect(state.stack).toEqual([]);
  });

  it("activates dreamsign abilities without ☾", () => {
    const { state: start } = board({ player: { dreamsigns: [DREAMSIGN.points.id], energy: 2, deck } });
    const source = { kind: "dreamsign", side: "player", index: 0 } as const;
    const { state } = activate(start, "player", source);
    expect(state.sides.player.score).toBe(1);
  });

  it("starts a battle with each side's emblems", () => {
    const { state } = engine.createBattle(
      {
        seed: "emblems" as never,
        scoreToWin: 25,
        startingSide: "player",
        decks: { player: deck.map((cardId) => ({ cardId })), enemy: deck.map((cardId) => ({ cardId })) },
        dreamwell: [],
        avatars: { player: AVATAR.drawer.id },
        dreamsigns: { enemy: [DREAMSIGN.points.id] },
      },
      NO_PROMPTS,
    );
    expect(state.sides.player.avatar).toEqual({ id: AVATAR.drawer.id, exhausted: false });
    expect(state.sides.enemy.avatar).toBeNull();
    expect(state.sides.enemy.dreamsigns).toEqual([{ id: DREAMSIGN.points.id }]);
  });
});

