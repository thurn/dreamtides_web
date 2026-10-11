/** Declared card-lab scripts through normal intents, replay and policy handoff. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { createEngine } from "../engine";
import { createFoldAdapter } from "../fold/slice";
import { FRONT_RANK_SIZE } from "../state/ids";
import { cardLabBattle, cardLabEnemyAction, cardLabStageFromUnknown, type CardLabStage } from "./card-lab";
import { aiDecision } from "../policy/decide";
import { supportersOf } from "../continuous/support";
import { applyDebugOp, withHistory } from "../debug/debug-actions";
import { SYNTHETIC, syntheticId, testCatalog } from "./synthetic-cards";
import { activated, exhaustSelf, reclaim, energy } from "../dsl/builders";
import { chooseOne } from "../effects/primitives/choose-one";
import { gainPoints } from "../effects/primitives/gain-points";
import { abandon } from "../effects/primitives/abandon";
import { getLogEntries } from "../../logging";
import { DSL } from "./dsl-cards";
import { engine } from "./tooling.fixtures";

describe("card-lab battle", () => {
  it("deals the card's variant to the side playing it, and opens with the enemy's play as the enemy", () => {
    const entry = { cardId: DSL.dissolveEnemy.id, amplified: true };
    const asPlayer = cardLabBattle(engine, { entry, variant: "amplified", side: "player" }, []);
    const [card] = asPlayer.slice.committed.sides.player.hand;
    expect(card === undefined ? undefined : asPlayer.slice.committed.instances[card]?.variant.amplified).toBe(true);
    expect(asPlayer.init.decks.player).toContainEqual(entry);
    expect(engine.decision(asPlayer.slice.committed)).toEqual({ kind: "main", side: "player" });

    const asEnemy = cardLabBattle(engine, { entry: { cardId: DSL.drawTwo.id }, variant: "base", side: "enemy" }, []);
    const played = Object.values(asEnemy.slice.committed.instances).find(
      (instance) => instance.printing.kind === "card" && instance.printing.cardId === DSL.drawTwo.id,
    );
    expect(played?.zone).toBe("stack");
    expect(engine.decision(asEnemy.slice.committed)).toEqual({ kind: "respond", side: "player" });
  });

  const declared = (enemyScript: CardLabStage["enemyScript"] = []) => cardLabBattle(engine, {
    entry: { cardId: DSL.drawTwo.id }, variant: "base", side: "enemy",
    stage: {
      player: { front: [null, SYNTHETIC.vanilla3.id], back: [null, SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id], hand: [SYNTHETIC.interruptEvent.id], energy: 7 },
      enemy: { back: [SYNTHETIC.vanilla3.id, SYNTHETIC.vanilla3.id], hand: [DSL.chooseDrawOrPoints.id, DSL.chooseDrawOrPoints.id, SYNTHETIC.interruptEvent.id], void: [SYNTHETIC.event0.id], energy: 6 },
      enemyScript,
    },
  }, []);

  it("declares exact ranks, both energies and duplicate physical cards without the legacy enemy opening play", () => {
    const lab = declared();
    const state = lab.slice.committed;
    expect(state.sides.player.currentEnergy).toBe(7);
    expect(state.sides.enemy.currentEnergy).toBe(6);
    const front = state.sides.player.frontRank[1];
    if (front === null) throw new Error("no supported front character");
    expect(supportersOf(state, front)).toEqual(state.sides.player.backRank.slice(1, 3));
    expect(state.sides.player.backRank.slice(0, 3)).toEqual([null, expect.any(String), expect.any(String)]);
    expect(state.sides.enemy.hand).toHaveLength(3);
    expect(new Set(state.sides.enemy.hand).size).toBe(3);
    expect(state.stack).toEqual([]);
    expect(declared()).toEqual(lab);
  });

  it("rejects malformed declarations and impossible physical references atomically", () => {
    const before = declared();
    for (const stage of [
      { player: { energy: -1 } }, { player: { front: Array(FRONT_RANK_SIZE + 1).fill(null) } },
      { enemy: { hand: [null] } }, { enemy: { hand: ["bad-id"] } }, { typo: [] },
      { enemyScript: [{ kind: "play", ref: { zone: "hand", index: 0, side: "player" } }] },
      { enemyScript: [{ kind: "advance", ref: { zone: "back", index: 0 }, lane: FRONT_RANK_SIZE }] },
      ...[undefined, -1, 0.5, "0", Number.MAX_SAFE_INTEGER + 1].map((ability) => ({ enemyScript: [{ kind: "activate", ref: { zone: "back", index: 0 }, ability }] })),
      { enemyScript: [{ kind: "activate", ref: { zone: "back", index: 0 }, ability: 0, typo: true }] },
    ]) expect(() => cardLabStageFromUnknown(stage)).toThrow();
    expect(() => declared([{ kind: "play", ref: { zone: "hand", index: 3 } }])).toThrow(/physical card/);
    expect(() => cardLabBattle(engine, { entry: { cardId: DSL.drawTwo.id }, variant: "base", side: "player", stage: { player: { front: [DSL.drawTwo.id] } } }, [])).toThrow(/characters/);
    expect(declared()).toEqual(before);
  });

  it("replays live physical plays, cancellation, answers, response passes, advance and Challenge through validated intents", () => {
    const lab = declared([
      { kind: "play", ref: { zone: "hand", index: 1 } },
      { kind: "advance", ref: { zone: "back", index: 1 }, lane: 2 }, { kind: "challenge" },
    ]);
    const adapter = createFoldAdapter(engine);
    let slice = withHistory(lab.slice);
    const selected = slice.committed.sides.enemy.hand[1];
    const advanced = slice.committed.sides.enemy.backRank[1];
    if (advanced === null) throw new Error("no advanced character");
    const next = () => aiDecision({ engine, init: lab.init, slice, pending: adapter.pending(slice), side: "enemy", policy: "greedy" });
    const apply = (intent: Parameters<typeof adapter.reduce>[1]) => {
      const outcome = adapter.reduce(slice, intent);
      if (outcome.kind === "bounced" || outcome.error !== null) throw new Error("declared intent failed");
      slice = outcome.slice;
      return outcome.published;
    };
    const play = { kind: "play", card: selected, from: "hand" } as const;
    expect(next()?.forced).toEqual({ kind: "action", action: play });
    expect(next()).toEqual(next());
    apply({ kind: "battleAction", side: "enemy", action: play });
    const prompt = adapter.pending(slice)?.prompt;
    if (prompt === undefined) throw new Error("no mode prompt");
    expect(next()?.kind).toBe("prompt");
    expect(adapter.reduce(slice, { kind: "answer", side: "player", promptId: prompt.id, value: 1 })).toMatchObject({ kind: "bounced", reason: "notYourPrompt" });
    apply({ kind: "cancel", side: "enemy", promptId: prompt.id });
    expect(next()?.forced).toEqual({ kind: "action", action: play });
    apply({ kind: "battleAction", side: "enemy", action: play });
    expect(adapter.reduce(slice, { kind: "answer", side: "enemy", promptId: prompt.id, value: 1 })).toMatchObject({ kind: "bounced", reason: "stalePrompt" });
    apply({ kind: "answer", side: "enemy", promptId: adapter.pending(slice)!.prompt.id, value: 1 });
    expect(engine.decision(slice.committed)).toEqual({ kind: "respond", side: "player" });
    apply({ kind: "battleAction", side: "player", action: { kind: "play", card: slice.committed.sides.player.hand[0], from: "hand" } });
    expect(engine.decision(slice.committed)).toEqual({ kind: "respond", side: "enemy" });
    expect(next()?.forced).toBeNull();
    for (let responses = 0; responses < 4; responses += 1) {
      const response = engine.decision(slice.committed);
      if (response?.kind !== "respond") break;
      apply({ kind: "battleAction", side: response.side, action: { kind: "pass" } });
    }
    // The next Day action keeps its initial physical id after the response.
    expect(next()?.forced).toEqual({ kind: "action", action: { kind: "reposition", card: advanced, to: { rank: "front", index: 2 } } });
    apply({ kind: "battleAction", side: "enemy", action: { kind: "reposition", card: advanced, to: { rank: "front", index: 2 } } });
    expect(next()?.forced).toEqual({ kind: "action", action: { kind: "pass" } });
    const challenged = apply({ kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    expect(challenged).toContainEqual(expect.objectContaining({ kind: "challengersDesignated", challengers: [advanced] }));
    expect(cardLabEnemyAction(engine, lab.init, slice)).toBeNull();
    const undone = applyDebugOp(engine, slice, { kind: "undo", keep: 0 });
    if (undone.kind !== "applied") throw new Error("undo failed");
    slice = undone.slice;
    expect(next()?.forced).toEqual({ kind: "action", action: play });
  });

  it("activates an initial physical source through prompts, cancellation, reload and history recovery", () => {
    const card: EngineCardDefinition = { ...SYNTHETIC.vanilla3, id: syntheticId(917), abilities: () => [activated([exhaustSelf()], chooseOne(gainPoints(1), gainPoints(2)))] };
    const activating = createEngine(testCatalog([card]));
    const lab = cardLabBattle(activating, { entry: { cardId: card.id }, variant: "base", side: "enemy", stage: {
      player: { hand: [] }, enemy: { back: [card.id, card.id], hand: [], energy: 0 },
      enemyScript: [{ kind: "activate", ref: { zone: "back", index: 1 }, ability: 0 }],
    } }, []);
    const adapter = createFoldAdapter(activating);
    let slice = withHistory(lab.slice);
    const source = slice.committed.sides.enemy.backRank[1];
    if (source === null) throw new Error("no activation source");
    const action = { kind: "activate", source, ability: 0 } as const;
    const next = () => cardLabEnemyAction(activating, lab.init, slice);
    const apply = (intent: Parameters<typeof adapter.reduce>[1]) => {
      const outcome = adapter.reduce(slice, intent);
      if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("activation intent failed");
      slice = outcome.slice;
      return outcome.published;
    };
    expect(next()).toEqual(action);
    apply({ kind: "battleAction", side: "enemy", action });
    const prompt = adapter.pending(slice)?.prompt;
    if (prompt === undefined) throw new Error("no activation mode prompt");
    expect(next()).toBeNull();
    apply({ kind: "cancel", side: "enemy", promptId: prompt.id });
    expect(next()).toEqual(action);
    expect(cardLabEnemyAction(activating, structuredClone(lab.init), structuredClone(slice))).toEqual(action);
    const events = [...apply({ kind: "battleAction", side: "enemy", action })];
    events.push(...apply({ kind: "answer", side: "enemy", promptId: adapter.pending(slice)!.prompt.id, value: 1 }));
    expect(events).toContainEqual({ kind: "abilityActivated", side: "enemy", source, ability: 0 });
    while (activating.decision(slice.committed)?.kind === "respond") {
      const decision = activating.decision(slice.committed);
      if (decision?.kind !== "respond") throw new Error("response missing");
      apply({ kind: "battleAction", side: decision.side, action: { kind: "pass" } });
    }
    expect(slice.committed.sides.enemy.score).toBe(2);
    expect(slice.committed.instances[source]?.status.exhausted).toBe(true);
    expect(next()).toBeNull();
    const undone = applyDebugOp(activating, slice, { kind: "undo", keep: 0 });
    if (undone.kind !== "applied") throw new Error("activation undo failed");
    expect(cardLabEnemyAction(activating, lab.init, undone.slice)).toEqual(action);
    const unavailable = declared([{ kind: "activate", ref: { zone: "back", index: 0 }, ability: 0 }]);
    expect(cardLabEnemyAction(engine, unavailable.init, withHistory(unavailable.slice))).toBeNull();
  });

  it("hands a script whose activated source left play to the normal enemy policy", () => {
    const card: EngineCardDefinition = { ...SYNTHETIC.vanilla3, id: syntheticId(936), abilities: () => [activated([], abandon()), reclaim(energy(0))] };
    const abandoning = createEngine(testCatalog([card]));
    const lab = cardLabBattle(abandoning, { entry: { cardId: card.id }, variant: "base", side: "enemy", stage: {
      player: { hand: [] }, enemy: { back: [card.id], hand: [], energy: 0 },
      enemyScript: [{ kind: "activate", ref: { zone: "back", index: 0 }, ability: 0 }, { kind: "activate", ref: { zone: "back", index: 0 }, ability: 0 }],
    } }, []);
    const adapter = createFoldAdapter(abandoning);
    let slice = withHistory(lab.slice);
    const source = slice.committed.sides.enemy.backRank[0];
    if (source === null) throw new Error("no abandonment source");
    const apply = (intent: Parameters<typeof adapter.reduce>[1]) => {
      const outcome = adapter.reduce(slice, intent);
      if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("abandonment intent failed");
      slice = outcome.slice;
    };
    const action = cardLabEnemyAction(abandoning, lab.init, slice);
    if (action === null) throw new Error("no scripted activation");
    apply({ kind: "battleAction", side: "enemy", action });
    while (slice.inFlight !== null || abandoning.decision(slice.committed)?.kind === "respond") {
      const pending = adapter.pending(slice);
      if (pending !== null) {
        expect(pending.prompt.kind).toBe("chooseCards");
        apply({ kind: "answer", side: pending.prompt.side, promptId: pending.prompt.id, value: [source] });
      } else {
        const decision = abandoning.decision(slice.committed);
        if (decision?.kind !== "respond") throw new Error("no abandonment response");
        apply({ kind: "battleAction", side: decision.side, action: { kind: "pass" } });
      }
    }
    expect(slice.committed.instances[source]?.zone).toBe("void");
    const ordinary = { seed: lab.init.seed, scoreToWin: lab.init.scoreToWin, decks: lab.init.decks, dreamwell: lab.init.dreamwell };
    const next = () => aiDecision({ engine: abandoning, init: lab.init, slice, pending: adapter.pending(slice), side: "enemy", policy: "greedy" });
    const normal = aiDecision({ engine: abandoning, init: ordinary, slice, pending: adapter.pending(slice), side: "enemy", policy: "greedy" });
    expect(next()).toEqual(normal);
    expect(getLogEntries().find((entry) => entry.event === "debug_card_lab_script_failed" && entry.seed === lab.init.seed)).toMatchObject({ reason: "action-not-legal", actionKind: "activate", stepIndex: 1, instance: source, sourceCardId: card.id });
    expect(cardLabEnemyAction(abandoning, lab.init, structuredClone(slice))).toBeNull();
    expect(next()).toEqual(next());
    apply({ kind: "battleAction", side: "enemy", action: { kind: "play", card: source, from: "void" } });
    while (abandoning.decision(slice.committed)?.kind === "respond") {
      const decision = abandoning.decision(slice.committed);
      if (decision?.kind !== "respond") throw new Error("no reclaimed response");
      apply({ kind: "battleAction", side: decision.side, action: { kind: "pass" } });
    }
    expect(slice.committed.instances[source]?.zone).toBe("play");
    expect(abandoning.legalActions(slice.committed, "enemy")).toContainEqual(action);
    expect(cardLabEnemyAction(abandoning, lab.init, slice)).toBeNull();
    expect(cardLabEnemyAction(abandoning, structuredClone(lab.init), structuredClone(slice))).toBeNull();
    const recovered = applyDebugOp(abandoning, slice, { kind: "undo", keep: 0 });
    if (recovered.kind !== "applied") throw new Error("abandonment undo failed");
    expect(cardLabEnemyAction(abandoning, lab.init, recovered.slice)).toEqual(action);
  });

  it("rejects invalid save metadata while handing an illegal script to normal policy", () => {
    const lab = declared([{ kind: "play", ref: { zone: "void", index: 0 } }]);
    const slice = withHistory(lab.slice);
    expect(aiDecision({ engine, init: lab.init, slice, pending: null, side: "enemy", policy: "greedy" })?.kind).toBe("topLevel");
    const invalid = { ...lab.init, cardLabStage: { kind: "declared-card-lab", stage: { enemyScript: [{ kind: "evil" }] } } };
    const wrongKind = { ...lab.init, cardLabStage: { kind: "other" } };
    expect(() => cardLabEnemyAction(engine, invalid, slice)).toThrow();
    expect(() => cardLabEnemyAction(engine, wrongKind, slice)).toThrow();
    const ordinary = { seed: lab.init.seed, scoreToWin: lab.init.scoreToWin, decks: lab.init.decks, dreamwell: lab.init.dreamwell };
    expect(cardLabEnemyAction(engine, ordinary, slice)).toBeNull();
  });

  it("keeps a faulted resolving play suspended from script progress until history recovery", () => {
    const fault: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(916), synthetic: {
      resolve: (ctx, item) => {
        ctx.choose({ kind: "confirm", side: item.controller, purpose: { source: item.instance, cardId: null, ability: null, role: "youMay" } });
        throw new Error("synthetic declared resolution fault");
      },
    } };
    const faulty = createEngine(testCatalog([fault]));
    const lab = cardLabBattle(faulty, { entry: { cardId: fault.id }, variant: "base", side: "enemy", stage: {
      player: { hand: [] }, enemy: { hand: [fault.id], back: [SYNTHETIC.vanilla2.id] },
      enemyScript: [{ kind: "play", ref: { zone: "hand", index: 0 } }, { kind: "advance", ref: { zone: "back", index: 0 }, lane: 1 }],
    } }, []);
    const adapter = createFoldAdapter(faulty);
    const base = withHistory(lab.slice);
    const action = cardLabEnemyAction(faulty, lab.init, base);
    if (action === null) throw new Error("no scripted play");
    const playing = adapter.reduce(base, { kind: "battleAction", side: "enemy", action });
    if (playing.kind !== "applied") throw new Error("play bounced");
    const prompt = adapter.pending(playing.slice)?.prompt;
    if (prompt === undefined) throw new Error("no resolving prompt");
    const failed = adapter.reduce(playing.slice, { kind: "answer", side: "enemy", promptId: prompt.id, value: true });
    if (failed.kind !== "applied") throw new Error("answer bounced");
    expect(failed.error?.message).toContain("synthetic declared resolution fault");
    expect(cardLabEnemyAction(faulty, lab.init, failed.slice)).toBeNull();
    const recovered = applyDebugOp(faulty, failed.slice, { kind: "undo", keep: 0 });
    if (recovered.kind !== "applied") throw new Error("fault recovery failed");
    expect(cardLabEnemyAction(faulty, lab.init, recovered.slice)).toEqual(action);
  });
});
