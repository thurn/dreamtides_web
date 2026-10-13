/**
 * "When … is dissolved" triggers (rules § Ability Types → Triggered
 * abilities): what counts as a dissolve, whose watcher fires, and how the
 * dissolved subject is seen.
 */
import { describe, expect, it } from "vitest";
import { all, anyCharacter, characterYouControl, event, target } from "../dsl/builders";
import { either, onDawn, onDissolved, onMaterialized, triggered, whenDissolved, whenLeavesPlay, whileSourceInPlay } from "../dsl/triggers";
import * as p from "../effects/primitives";
import { createEngine } from "../engine";
import type { EngineEvent } from "../events";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { deserializeState, stateHash } from "../state/hash";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import { SIDES, opponent } from "../state/ids";
import type { BattleState } from "../state/types";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import type { Answer, PromptId } from "../prompts/types";
import { boardState, placeFigment, type BoardSetup } from "../testing/board";
import { CONTINUOUS_CARDS } from "../testing/continuous-cards";
import { STACK_CARDS } from "../testing/stack-cards";
import { DSL, DSL_CARDS } from "../testing/dsl-cards";
import { testCatalog } from "../testing/synthetic-cards";
import { TRIGGER_CARDS, TRIGGER_DREAMSIGN } from "../testing/trigger-cards";
import { ZONE, ZONE_CARDS, ZONE_FIGMENT, ZONE_FIGMENTS } from "../testing/zone-cards";
import { at, passUntil } from "../testing/trigger-harness";
import { v, t, deck, local, L, C } from "./triggers.fixtures";

describe("when a character is dissolved", () => {
  const gain = () => p.gainEnergy(1);
  const D = {
    /** "When a character you control is dissolved, gain 1●." — 2✦, so it survives a ✦ ≤ 1 sweep. */
    allyWatch: local(26, "character", () => [triggered(whenDissolved(characterYouControl()), gain())], 2),
    /** "When a character you control is dissolved, gain 1●." — 1✦. */
    smallWatch: local(27, "character", () => [triggered(whenDissolved(characterYouControl()), gain())]),
    /** "When another character you control is dissolved, gain 1●." */
    otherWatch: local(28, "character", () => [triggered(whenDissolved(characterYouControl({ another: true })), gain())]),
    /** "When a Mage you control is dissolved, gain 1●." — itself a Warrior. */
    mageWatch: local(29, "character", () => [triggered(whenDissolved(characterYouControl({ subtype: "Mage" })), gain())], 2),
    /** "When a figment you control is dissolved, gain 1●." */
    figmentWatch: local(30, "character", () => [triggered(whenDissolved(characterYouControl(), { figment: true }), gain())], 2),
    /** "When a character is dissolved, gain 1●." */
    anyWatch: local(31, "character", () => [triggered(whenDissolved(anyCharacter()), gain())], 2),
    /** "If this card is in your void, when a character you control is dissolved, gain 1●." */
    voidWatch: local(32, "character", () => [triggered(whenDissolved(characterYouControl()), gain(), { zone: "void" })]),
    /** "When a character you control is dissolved, you may draw a card." */
    mayDrawWatch: local(33, "character", () => [triggered(whenDissolved(characterYouControl()), p.optional(p.draw(1)))], 2),
    /** "Dissolve a character you control." */
    dissolveOwn: local(34, "event", () => [event(p.dissolve(target(characterYouControl())))]),
    /** "Dissolve two characters." */
    dissolveTwo: local(35, "event", () => [event(p.dissolve(target(anyCharacter(), 2)))]),
    /** "Until end of turn, when a character you control is dissolved, gain 1●. Dissolve each character you control with ✦ ≤ 1." */
    floatingSweep: local(36, "event", () => [
      event(p.sequence(p.floating(whenDissolved(characterYouControl()), gain()), p.dissolve(all(characterYouControl({ sparkAtMost: 1 }))))),
    ]),
    /** "Dissolve a character you control. Another character you control gains 1 additional ✦." — a definition error after the dissolve. */
    dissolveThenFail: local(37, "event", () => [
      event(p.sequence(p.dissolve(target(characterYouControl())), p.gainAdditionalSpark(target(characterYouControl()), 1))),
    ]),
    /** "▸Materialized: While this character is in play, when a character you control is dissolved, gain 1●." */
    whileInPlayWatch: local(38, "character", () => [
      triggered(onMaterialized(), p.floating(whenDissolved(characterYouControl()), gain(), whileSourceInPlay())),
    ]),
    /** Own named dissolve, another-character dissolve, own departure, and a functional-zone Dawn. */
    namedWatch: local(39, "character", () => [
      triggered(either(whenDissolved(characterYouControl({ another: true })), onDissolved()), p.optional(p.draw(1))),
      triggered(whenLeavesPlay(), gain()),
      triggered(whenDissolved(characterYouControl()), gain()),
      triggered(onDawn(), gain(), { zone: "void" }),
    ]),
  } as const;
  const E = createEngine(
    testCatalog(
      [...ZONE_CARDS, ...DSL_CARDS, ...STACK_CARDS, ...TRIGGER_CARDS, ...CONTINUOUS_CARDS, ...Object.values(D), L.sweep, L.dissolvedEnergy],
      { dreamsigns: [TRIGGER_DREAMSIGN.dissolvedAllyOnce] },
      ZONE_FIGMENTS,
    ),
  );
  const warriorFigment = { kind: "figment", figment: ZONE_FIGMENT.warrior.id, spark: 1 } as const;

  function setup(sides: Omit<BoardSetup, "phase" | "active"> & Partial<Pick<BoardSetup, "active">>) {
    return boardState(E.catalog, { active: "player", phase: "day", ...sides });
  }

  function apply(state: BattleState, side: Side, action: Parameters<typeof E.apply>[2], answers: readonly Answer[] = []) {
    const source = new ScriptedSource(answers);
    const result = E.apply(state, side, action, answers.length === 0 ? NO_PROMPTS : source);
    if (answers.length > 0) source.assertExhausted();
    return result;
  }

  function cast(state: BattleState, side: Side, card: InstanceId | undefined, answers: readonly Answer[] = []) {
    if (card === undefined) throw new Error("no card");
    return apply(state, side, { kind: "play", card, from: "hand" }, answers);
  }

  function queued(events: readonly EngineEvent[]): (AbilitySource | null)[] {
    return events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.source] : []));
  }

  it("triggers once for each character you control dissolved, its own card included, until it has left play itself", () => {
    const { state, ids } = setup({
      player: { back: [v.vanilla1.id, D.smallWatch.id, v.vanilla1.id, D.allyWatch.id, D.otherWatch.id], hand: [L.sweep.id], deck },
      enemy: { back: [D.allyWatch.id], deck },
    });
    const [x, small, y, big, other] = ids.player.back;
    const result = cast(state, "player", ids.player.hand[0]);
    // The sweep dissolves B0, B1, B2, then B4, one at a time. A watcher sees its own dissolve, ordered by
    // the void it went to; once in the void it sees no later one. "Another" never sees its own.
    expect(queued(result.events)).toEqual([small, big, other, big, other, small, big, other, big]);
    expect(result.state.sides.player.currentEnergy).toBe(9);
    expect(result.state.sides.enemy.currentEnergy).toBe(0);
    expect([x, y, small, other].map((id) => result.state.instances[id!]?.zone)).toEqual(["void", "void", "void", "void"]);
  });

  it("matches each dissolve by the controller the character had, for both sides' watchers, the active side first", () => {
    const { state, ids } = setup({
      player: { back: [D.anyWatch.id, D.allyWatch.id, v.vanilla1.id], hand: [D.dissolveTwo.id], deck },
      enemy: { back: [D.allyWatch.id, D.anyWatch.id, v.vanilla1.id], deck },
    });
    const [any, ally, mine] = ids.player.back;
    const [enemyAlly, enemyAny, theirs] = ids.enemy.back;
    const result = cast(state, "player", ids.player.hand[0], [[theirs!, mine!]]);
    expect(queued(result.events)).toEqual([any, enemyAlly, enemyAny, any, ally, enemyAny]);
    expect(result.state.sides.player.currentEnergy).toBe(3);
    expect(result.state.sides.enemy.currentEnergy).toBe(3);
  });

  it("sees the types the character had in play, which it loses in the void", () => {
    const { state, ids } = setup({
      active: "enemy",
      player: { back: [C.everyType.id, D.mageWatch.id, v.vanilla1.id], deck },
      enemy: { hand: [DSL.dissolveEnemy.id], energy: 2, deck },
    });
    const [, watch, warrior] = ids.player.back;
    const result = cast(state, "enemy", ids.enemy.hand[0], [[warrior!]]);
    expect(result.state.instances[warrior!]?.zone).toBe("void");
    expect(queued(result.events)).toEqual([watch]);
  });

  it("triggers for the side controlling the character as it is dissolved, not its owner", () => {
    const { state, ids } = setup({
      active: "enemy",
      player: { back: [D.allyWatch.id, v.vanilla1.id], deck },
      enemy: { back: [D.allyWatch.id], hand: [ZONE.seize.id, D.dissolveOwn.id], energy: 3, deck },
    });
    const [mine, stolen] = ids.player.back;
    const seized = cast(state, "enemy", ids.enemy.hand[0], [[stolen!]]).state;
    expect(seized.instances[stolen!]?.controller).toBe("enemy");
    const result = cast(seized, "enemy", ids.enemy.hand[1], [[stolen!]]);
    expect(result.state.sides.player.void).toEqual([stolen]);
    expect(queued(result.events)).toEqual([ids.enemy.back[0]]);
    expect(queued(result.events)).not.toContain(mine);
  });

  it("triggers a stolen watcher's own dissolve for the side that controlled it, ordered among that side's abilities", () => {
    const { state, ids } = setup({
      active: "enemy",
      player: { back: [D.allyWatch.id, D.allyWatch.id], deck },
      enemy: { back: [D.allyWatch.id], hand: [ZONE.seize.id, D.dissolveOwn.id], energy: 3, deck },
    });
    const [stolen, mine] = ids.player.back;
    const theirs = ids.enemy.back[0];
    const seized = cast(state, "enemy", ids.enemy.hand[0], [[stolen!]]);
    expect(seized.state.instances[stolen!]?.controller).toBe("enemy");
    const result = cast(seized.state, "enemy", ids.enemy.hand[1], [[stolen!]]);
    expect(result.state.sides.player.void).toEqual([stolen]);
    const triggers = result.events.flatMap((entry) => (entry.kind === "triggerQueued" ? [[entry.source, entry.controller]] : []));
    expect(triggers).toEqual([
      [theirs, "enemy"],
      [stolen, "enemy"],
    ]);
    expect(queued(result.events)).not.toContain(mine);
    expect(result.state.sides.enemy.currentEnergy).toBe(seized.state.sides.enemy.currentEnergy + 2);
    expect(result.state.sides.player.currentEnergy).toBe(seized.state.sides.player.currentEnergy);
  });

  for (const controller of SIDES) {
    for (const caster of SIDES) {
      it(`keeps a stolen named Dissolved trigger with ${controller}, when ${caster} dissolves it, through reload`, () => {
        const owner = opponent(controller);
        const { state, ids } = setup({
          active: controller,
          [owner]: { back: [D.namedWatch.id], hand: [DSL.dissolveEnemy.id], energy: 10, deck },
          [controller]: { back: [D.allyWatch.id], hand: [ZONE.seize.id, D.dissolveOwn.id], energy: 10, deck },
        });
        const stolen = ids[owner].back[0]!;
        const seized = cast(state, controller, ids[controller].hand[0]).state;
        const ready = passUntil(E, seized, at(E, caster, "day")).state;
        const card = ids[caster].hand[caster === controller ? 1 : 0];
        const action = { kind: "play", card, from: "hand" } as const;
        const committed: BattleState[] = [];
        const result = E.apply(ready, caster, action, new ScriptedSource([[stolen], true]), (next) => committed.push(next));
        expect(result.events).toContainEqual(expect.objectContaining({ kind: "dissolved", instance: stolen, side: controller }));
        expect(result.state.instances[stolen]).toMatchObject({ owner, controller: owner, zone: "void" });
        expect(result.state.sides[owner].void).toContain(stolen);
        // Departure first; on dissolve the survivor is in play, then the stolen source in the void slot.
        expect(result.events.flatMap((entry) => entry.kind === "triggerQueued" ? [[entry.source, entry.controller, entry.ability]] : [])).toEqual([
          [stolen, controller, 1], [ids[controller].back[0], controller, 0], [stolen, controller, 0], [stolen, controller, 2],
        ]);
        expect(result.events.filter((entry) => entry.kind === "triggerResolved").map((entry) => entry.controller)).toEqual(Array(4).fill(controller));
        expect(result.state.sides[controller].currentEnergy).toBe(ready.sides[controller].currentEnergy + 3);
        expect(result.state.sides[controller].hand).toHaveLength(ready.sides[controller].hand.length - (caster === controller ? 1 : 0) + 1);
        expect(result.state.sides[owner].hand).toHaveLength(ready.sides[owner].hand.length - (caster === owner ? 1 : 0));
        const waiting = committed.find((next) => next.triggerQueue.some((entry) => entry.source === stolen && entry.ability === 0));
        if (waiting === undefined) throw new Error("no named trigger queued");
        for (const viewer of SIDES) expect(E.view(waiting, viewer).triggerQueue.find((entry) => entry.source === stolen && entry.ability === 0)?.controller).toBe(controller);

        const fold = createFoldAdapter(E, { checkEventPrefix: true });
        let outcome = fold.reduce({ committed: ready, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side: caster, action });
        if (outcome.kind !== "applied") throw new Error("bounced");
        const targetPrompt = fold.pending(outcome.slice)?.prompt;
        if (targetPrompt === undefined) throw new Error("no target prompt");
        outcome = fold.reduce(outcome.slice, { kind: "answer", side: caster, promptId: targetPrompt.id, value: [stolen] });
        if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("target failed");
        const reloaded = { ...outcome.slice, committed: deserializeState(JSON.stringify(outcome.slice.committed)) };
        const pending = fold.pending(reloaded)?.prompt;
        if (pending === undefined) throw new Error("no named trigger prompt");
        expect(pending).toEqual(fold.pending(outcome.slice)?.prompt);
        expect(pending.side).toBe(controller);
        expect(pending.purpose.source).toBe(stolen);
        expect(pending.cancellable).toBe(false);
        expect(fold.reduce(reloaded, { kind: "answer", side: owner, promptId: pending.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
        expect(fold.reduce(reloaded, { kind: "answer", side: controller, promptId: targetPrompt.id, value: true })).toEqual({ kind: "bounced", reason: "stalePrompt" });
        const resolved = fold.reduce(reloaded, { kind: "answer", side: controller, promptId: pending.id, value: true });
        if (resolved.kind !== "applied" || resolved.error !== null) throw new Error("named trigger failed");
        expect(stateHash(resolved.slice.committed)).toBe(stateHash(result.state));
        const afterDay = apply(result.state, result.state.turn.active, { kind: "pass" }).state;
        const dawn = passUntil(E, afterDay, at(E, owner, "day"));
        expect(dawn.events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: stolen, controller: owner, ability: 3 }));
        expect(dawn.events).not.toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: stolen, controller, ability: 3 }));
      });
    }
  }

  for (const controller of SIDES) {
    for (const kind of ["card", "figmentCopy"] as const) {
      it(`fires a stolen created ${kind}'s own Dissolved for ${controller} before it ceases`, () => {
        const owner = opponent(controller);
        const { state, ids } = setup({
          active: controller,
          [owner]: { deck },
          [controller]: { hand: [ZONE.seize.id, D.dissolveOwn.id], energy: 3, deck },
        });
        const printing = kind === "card" ? { kind, cardId: L.dissolvedEnergy.id } : { kind, cardId: L.dissolvedEnergy.id, spark: null };
        const stolen = placeFigment(state, owner, { rank: "back", index: 0 }, printing);
        const seized = cast(state, controller, ids[controller].hand[0]).state;
        const result = cast(seized, controller, ids[controller].hand[1]);
        expect(result.events.filter((entry) => "instance" in entry && entry.instance === stolen).map((entry) => entry.kind)).toEqual(["leftPlay", "dissolved", "ceasedToExist"]);
        expect(result.events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: stolen, controller }));
        expect(result.events).toContainEqual(expect.objectContaining({ kind: "triggerResolved", source: stolen, controller }));
        expect(result.state.sides[controller].currentEnergy).toBe(seized.sides[controller].currentEnergy + 1);
        expect(result.state.sides[owner].currentEnergy).toBe(seized.sides[owner].currentEnergy);
        expect(result.state.instances[stolen]).toBeUndefined();
        expect(result.state.sides[owner].void).not.toContain(stolen);
      });
    }
  }

  it("triggers a floating trigger lasting while its source is in play on that source's own dissolve, and not after", () => {
    const { state, ids } = setup({ player: { back: [v.vanilla1.id], hand: [D.whileInPlayWatch.id, D.dissolveOwn.id, D.dissolveOwn.id], deck }, enemy: { deck } });
    const [watch, first, second] = ids.player.hand;
    const vanilla = ids.player.back[0];
    const played = cast(state, "player", watch);
    expect(played.state.instances[watch]?.zone).toBe("play");
    const own = cast(played.state, "player", first, [[watch]]);
    expect(own.state.instances[watch]?.zone).toBe("void");
    expect(own.state.floating.filter((effect) => effect.source === watch)).toEqual([]);
    expect(queued(own.events)).toEqual([watch]);
    expect(own.state.sides.player.currentEnergy).toBe(played.state.sides.player.currentEnergy + 1);
    const later = cast(own.state, "player", second);
    expect(later.state.instances[vanilla!]?.zone).toBe("void");
    expect(queued(later.events)).toEqual([]);
  });

  it("tells figments from other characters, and sees a dissolved figment before it ceases to exist", () => {
    const { state, ids } = setup({
      active: "enemy",
      player: { back: [D.allyWatch.id, t.dissolvedNonFigmentEnergy.id, D.figmentWatch.id, v.vanilla1.id], deck },
      enemy: { hand: [DSL.dissolveEnemy.id, DSL.dissolveEnemy.id], energy: 4, deck },
    });
    const [ally, nonFigment, figmentWatch, vanilla] = ids.player.back;
    const figment = placeFigment(state, "player", { rank: "back", index: 4 }, warriorFigment);
    const first = cast(state, "enemy", ids.enemy.hand[0], [[figment]]);
    expect(first.state.instances[figment]).toBeUndefined();
    expect(queued(first.events)).toEqual([ally, figmentWatch]);
    const second = cast(first.state, "enemy", ids.enemy.hand[1], [[vanilla!]]);
    expect(queued(second.events)).toEqual([ally, nonFigment]);
  });

  it("triggers on an abandon, which dissolves", () => {
    const { state, ids } = setup({ player: { back: [D.allyWatch.id, ZONE.sacrifice.id, v.vanilla1.id], deck }, enemy: { deck } });
    const [ally, sacrifice, fodder] = ids.player.back;
    const result = apply(state, "player", { kind: "activate", source: sacrifice!, ability: 0 }, [[fodder!]]);
    expect(result.events.filter((entry) => "instance" in entry && entry.instance === fodder).map((entry) => entry.kind)).toEqual([
      "leftPlay",
      "enteredVoid",
      "abandoned",
      "dissolved",
    ]);
    expect(queued(result.events)).toEqual([ally]);
  });

  it("does not trigger when a character leaves play, or would be dissolved, without being dissolved", () => {
    const { state, ids } = setup({
      active: "enemy",
      player: { back: [D.allyWatch.id, ZONE.veiled.id, v.vanilla1.id, v.vanilla1.id], hand: [DSL.returnAnyToHand.id], energy: 1, deck },
      enemy: { hand: [DSL.dissolveEnemy.id, DSL.banishEnemyWithSparkAtMostTwo.id, DSL.dissolveEnemy.id], energy: 5, deck },
    });
    const [, veiled, reclaimed, banished] = ids.player.back;
    state.instances[reclaimed!].status.reclaimed = true;
    // Veil turns the opponent's dissolve into losing Veil; a reclaimed character is banished instead.
    const veil = cast(state, "enemy", ids.enemy.hand[0], [[veiled!]]);
    expect(veil.state.instances[veiled!]?.zone).toBe("play");
    const banish = cast(veil.state, "enemy", ids.enemy.hand[1], [[banished!]]);
    expect(banish.state.instances[banished!]?.zone).toBe("banished");
    const reclaim = cast(banish.state, "enemy", ids.enemy.hand[2], [[reclaimed!]]);
    expect(reclaim.state.instances[reclaimed!]?.zone).toBe("banished");
    expect(queued([...veil.events, ...banish.events, ...reclaim.events])).toEqual([]);
    // A figment returned to hand leaves play for nowhere, as a dissolved one does, but is not dissolved.
    const own = { ...reclaim.state, turn: { ...reclaim.state.turn, active: "player" as const } };
    const figment = placeFigment(own, "player", { rank: "back", index: 2 }, warriorFigment);
    const returned = cast(own, "player", ids.player.hand[0], [[figment]]);
    expect(returned.state.instances[figment]).toBeUndefined();
    expect(queued(returned.events)).toEqual([]);
  });

  it("works where its card was as the character left play: a void ability sees others, never its own dissolve from play", () => {
    const { state, ids } = setup({
      active: "enemy",
      player: { back: [D.voidWatch.id, v.vanilla1.id], void: [D.voidWatch.id], deck },
      enemy: { hand: [DSL.dissolveEnemy.id, DSL.dissolveEnemy.id], energy: 4, deck },
    });
    const [inPlay, vanilla] = ids.player.back;
    const inVoid = ids.player.void[0];
    const first = cast(state, "enemy", ids.enemy.hand[0], [[vanilla!]]);
    expect(queued(first.events)).toEqual([inVoid]);
    const second = cast(first.state, "enemy", ids.enemy.hand[1]);
    expect(second.state.instances[inPlay!]?.zone).toBe("void");
    expect(queued(second.events)).toEqual([inVoid]);
  });

  it("is suppressed for a source whose triggers are disabled, even for its own dissolve", () => {
    const { state, ids } = setup({
      player: { hand: [t.silenceEnemy.id, DSL.dissolveEnemy.id], energy: 2, deck },
      enemy: { back: [D.allyWatch.id], deck },
    });
    const silenced = cast(state, "player", ids.player.hand[0]).state;
    const result = cast(silenced, "player", ids.player.hand[1]);
    expect(result.state.instances[ids.enemy.back[0]!]?.zone).toBe("void");
    expect(queued(result.events)).toEqual([]);
  });

  it("triggers a once-per-turn emblem once, and a floating trigger for each dissolve", () => {
    const once = setup({ player: { dreamsigns: [TRIGGER_DREAMSIGN.dissolvedAllyOnce.id], back: [v.vanilla1.id, v.vanilla1.id], hand: [L.sweep.id], deck }, enemy: { deck } });
    expect(cast(once.state, "player", once.ids.player.hand[0]).state.sides.player.currentEnergy).toBe(1);
    const floating = setup({ player: { back: [v.vanilla1.id, v.vanilla1.id], hand: [D.floatingSweep.id], deck }, enemy: { deck } });
    const result = cast(floating.state, "player", floating.ids.player.hand[0]);
    expect(queued(result.events)).toEqual([floating.ids.player.hand[0], floating.ids.player.hand[0]]);
    expect(result.state.sides.player.currentEnergy).toBe(2);
  });

  it("shows queued triggers and their dissolved subjects to both sides, and resolves them identically through the fold after a reload", () => {
    const { state, ids } = setup({ player: { back: [D.mayDrawWatch.id, v.vanilla1.id, v.vanilla1.id], hand: [L.sweep.id], deck }, enemy: { deck } });
    const [watch, x, y] = ids.player.back;
    const committed: BattleState[] = [];
    const answers: Answer[] = [true, false];
    const inline = E.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource(answers), (next) => {
      committed.push(next);
    }).state;
    const waiting = committed.find((next) => next.triggerQueue.length === 2);
    if (waiting === undefined) throw new Error("no queued triggers observed");
    for (const viewer of SIDES) {
      expect(E.view(waiting, viewer).triggerQueue.map((entry) => [entry.source, entry.subject])).toEqual([
        [watch, x],
        [watch, y],
      ]);
    }
    expect(inline.sides.player.hand).toHaveLength(1);
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = fold.reduce(
      { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 },
      { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } },
    );
    if (opened.kind !== "applied") throw new Error("bounced");
    let slice = opened.slice;
    let previous: PromptId | undefined;
    for (const answer of answers) {
      const reloaded: BattleSlice = { ...slice, committed: deserializeState(JSON.stringify(slice.committed)) };
      const pending = fold.pending(reloaded);
      if (pending === null) throw new Error("no prompt");
      expect(pending.prompt).toEqual(fold.pending(slice)?.prompt);
      expect(pending.prompt.purpose.source).toBe(watch);
      if (previous !== undefined) {
        expect(fold.reduce(reloaded, { kind: "answer", side: "player", promptId: previous, value: answer })).toEqual({ kind: "bounced", reason: "stalePrompt" });
      }
      previous = pending.prompt.id;
      const outcome = fold.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: answer });
      if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("answer failed");
      slice = outcome.slice;
    }
    expect(slice.inFlight).toBeNull();
    expect(stateHash(slice.committed)).toBe(stateHash(inline));
  });

  it("queues nothing and leaves the committed state alone when the effect fails after the dissolve", () => {
    const { state, ids } = setup({ player: { back: [D.allyWatch.id, v.vanilla1.id, v.vanilla1.id], hand: [D.dissolveThenFail.id], deck }, enemy: { deck } });
    const before = stateHash(state);
    const [, x, y] = ids.player.back;
    expect(() => cast(state, "player", ids.player.hand[0], [[x!], [y!]])).toThrow();
    expect(stateHash(state)).toBe(before);
    expect(state.triggerQueue).toEqual([]);
  });
});
