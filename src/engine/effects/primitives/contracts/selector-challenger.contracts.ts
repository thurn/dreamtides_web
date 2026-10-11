import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { all, anyCharacter, characterYouControl, controls, enemyCharacter, event, staticAbility, target } from "../../../dsl/builders";
import { matchingCharacters } from "../../../dsl/selectors";
import { onNight, triggered } from "../../../dsl/triggers";
import type { CharacterSelector } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, ChooseCardsPrompt, Prompt } from "../../../prompts/types";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { promptView } from "../../../view/view";
import { syntheticId } from "../../../testing/synthetic-cards";
import type { BoardSetup } from "../../../testing/board";
import * as p from "../index";
import { DSL, DSL_CARDS } from "../../../testing/dsl-cards";
import { testCatalog } from "../../../testing/synthetic-cards";
import { boardState } from "../../../testing/board";
import { NO_PROMPTS as NO } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { effectiveSpark } from "../../../rules/spark";
import { at, passUntil } from "../../../testing/trigger-harness";
import { v } from "./characters-support";

/** Picks the first candidates a prompt allows, recording each prompt. */
class FirstChoices implements AnswerSource {
  readonly prompts: Prompt[] = [];
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    if (prompt.kind !== "chooseCards" && prompt.kind !== "chooseTargets") throw new Error(`unexpected ${prompt.kind} prompt`);
    return prompt.candidates.slice(0, Math.max(prompt.min, 1));
  }
}

describe("challenger and blocker selectors", () => {
  /** "▸Night: Draw a card, then discard a card unless you control a challenger" (amplified: "or blocker"). */
  const fury: EngineCardDefinition = {
    ...v.vanilla2,
    id: syntheticId(1170),
    status: "authored",
    abilities: (variant) => {
      const unlessBlocker = variant.amplified
        ? p.ifThen(controls(characterYouControl({ blocking: true })), p.sequence(), p.discard(1))
        : p.discard(1);
      return [triggered(onNight(), p.sequence(p.draw(1), p.ifThen(controls(characterYouControl({ challenging: true })), p.sequence(), unlessBlocker)))];
    },
  };
  /** "▸Night: Return each front-rank character you control to hand." */
  const bounceFront: EngineCardDefinition = {
    ...v.vanilla1,
    id: syntheticId(1171),
    status: "authored",
    abilities: () => [triggered(onNight(), p.returnToHand(all(characterYouControl({ rank: "front" }))))],
  };
  /** "▸Night: Gain control of an enemy." */
  const nightControl: EngineCardDefinition = {
    ...v.vanilla1,
    id: syntheticId(1172),
    status: "authored",
    abilities: () => [triggered(onNight(), p.gainControl(target(enemyCharacter())))],
  };
  const fastDraw: EngineCardDefinition = { ...DSL.drawTwo, id: syntheticId(1173), speed: "fast" };
  /** Interrupt: "Trigger the ▸Night ability of a character you control." */
  const retriggerNight: EngineCardDefinition = {
    ...DSL.drawTwo,
    id: syntheticId(1174),
    speed: "interrupt",
    abilities: () => [event(p.triggerAbility(target(characterYouControl()), "night"))],
  };
  /** "Challengers you control have +1✦." */
  const challengerAnthem: EngineCardDefinition = {
    ...v.vanilla1,
    id: syntheticId(1175),
    status: "authored",
    abilities: () => [staticAbility(p.sparkModifier(all(characterYouControl({ challenging: true })), 1))],
  };
  const roles = createEngine(testCatalog([...DSL_CARDS, fury, bounceFront, nightControl, fastDraw, retriggerNight, challengerAnthem]));
  const longDeck = Array.from({ length: 8 }, () => v.vanilla1.id);
  const matching = (state: BattleState, selector: CharacterSelector, controller: Side = "player") =>
    matchingCharacters(state, roles.catalog, selector, controller, "i0");
  const toNight = (setup: Omit<BoardSetup, "active" | "phase">, source: AnswerSource = NO) => {
    const placed = boardState(roles.catalog, {
      active: "player",
      phase: "day",
      ...setup,
      player: { deck: longDeck, ...setup.player },
      enemy: { deck: longDeck, ...setup.enemy },
    });
    return { ...passUntil(roles, placed.state, at(roles, "player", "night"), source), ids: placed.ids, start: placed.state };
  };

  it("matches the active side's designated front-rank challengers and the ready characters opposite them after Dusk, per controller", () => {
    const { state: day, ids } = boardState(roles.catalog, {
      active: "player",
      phase: "day",
      player: { front: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], back: [v.vanilla1.id], deck: longDeck },
      enemy: { front: [v.vanilla2.id, v.vanilla1.id, v.vanilla3.id], back: [v.vanilla2.id], deck: longDeck },
    });
    const [ready, tired, other] = ids.player.front as InstanceId[];
    const [opposite, oppositeTired, oppositeExhausted] = ids.enemy.front as InstanceId[];
    day.instances[tired].status.exhausted = true;
    day.instances[oppositeExhausted].status.exhausted = true;
    // Nothing holds a role before challengers are designated.
    expect(matching(day, anyCharacter({ challenging: true }))).toEqual([]);
    expect(matching(day, anyCharacter({ blocking: true }))).toEqual([]);

    const dusk = passUntil(roles, day, (state) => state.turn.phase === "dusk").state;
    expect(matching(dusk, anyCharacter({ challenging: true }))).toEqual([ready, other]);
    expect(matching(dusk, anyCharacter({ blocking: true }))).toEqual([]);

    const night = passUntil(roles, dusk, at(roles, "player", "night")).state;
    expect(matching(night, anyCharacter({ challenging: true }))).toEqual([ready, other]);
    expect(matching(night, anyCharacter({ blocking: true }))).toEqual([opposite]);
    // `false` matches every other character; the controller is relative to the effect's.
    expect(matching(night, characterYouControl({ challenging: false }))).toEqual([ids.player.back[0], tired]);
    expect(matching(night, characterYouControl({ blocking: true }))).toEqual([]);
    expect(matching(night, characterYouControl({ blocking: true }), "enemy")).toEqual([opposite]);
    expect(matching(night, enemyCharacter({ challenging: true }), "enemy")).toEqual([ready, other]);
    expect(matching(night, characterYouControl({ blocking: false }), "enemy")).toEqual([ids.enemy.back[0], oppositeTired, oppositeExhausted]);
    // The role is read live inside the layer evaluation too.
    const anthem = boardState(roles.catalog, {
      active: "player", phase: "day", player: { back: [challengerAnthem.id], front: [v.vanilla2.id], deck: longDeck }, enemy: { deck: longDeck },
    });
    const pumped = anthem.ids.player.front[0]!;
    expect(effectiveSpark(anthem.state, roles.catalog, pumped)).toBe(2);
    expect(effectiveSpark(passUntil(roles, anthem.state, at(roles, "player", "night")).state, roles.catalog, pumped)).toBe(3);
  });

  it("follows Night movement as the Challenge phase does: a challenger keeps its role in any front lane, and its blocker loses it", () => {
    const { state: night, ids } = toNight({ player: { front: [v.vanilla3.id] }, enemy: { front: [v.vanilla2.id] } });
    const challenger = ids.player.front[0]!;
    const blocker = ids.enemy.front[0]!;
    expect(matching(night, anyCharacter({ blocking: true }))).toEqual([blocker]);
    const moved = structuredClone(night);
    moved.sides.player.frontRank[0] = null;
    moved.sides.player.frontRank[1] = challenger;
    expect(matching(moved, anyCharacter({ challenging: true }))).toEqual([challenger]);
    expect(matching(moved, anyCharacter({ blocking: true }))).toEqual([]);
    // The Challenge phase agrees: the challenger scores unblocked and the former blocker survives.
    const resolved = passUntil(roles, moved, (state) => state.turn.phase === "ending" || state.turn.active === "enemy");
    expect(resolved.state.sides.player.score).toBe(3);
    expect(resolved.state.instances[blocker]?.zone).toBe("play");
    // Moved to the back rank, a designated challenger holds no role.
    const benched = structuredClone(night);
    benched.sides.player.frontRank[0] = null;
    benched.sides.player.backRank[0] = challenger;
    expect(matching(benched, anyCharacter({ challenging: true }))).toEqual([]);
    expect(matching(benched, anyCharacter({ blocking: true }))).toEqual([]);
    // Designations last through the turn's Ending, and the next turn begins with none.
    const { state: next, steps } = passUntil(roles, night, at(roles, "enemy", "day"));
    const ending = steps.map((step) => step.state).filter((state) => state.turn.active === "player" && state.turn.phase === "ending");
    expect(ending.length).toBeGreaterThan(0);
    for (const state of ending) expect(matching(state, anyCharacter({ challenging: true }))).toEqual([challenger]);
    expect(matching(next, anyCharacter({ challenging: true }))).toEqual([]);
    expect(matching(next, anyCharacter({ blocking: true }))).toEqual([]);
  });

  it("loses a blocker's role when its control changes, and the lane resolves unblocked", () => {
    const source = new FirstChoices();
    const { state, ids } = toNight({ player: { front: [v.vanilla3.id], back: [nightControl.id] }, enemy: { front: [v.vanilla2.id] } }, source);
    const taken = ids.enemy.front[0]!;
    expect(state.instances[taken]).toMatchObject({ controller: "player", zone: "play" });
    expect(matching(state, characterYouControl({ blocking: true }))).toEqual([]);
    expect(matching(state, anyCharacter({ blocking: true }))).toEqual([]);
    const resolved = passUntil(roles, state, at(roles, "enemy", "day"));
    expect(resolved.state.sides.player.score).toBe(3);
  });

  it("discards unless its controller controls a challenger as the discard would happen, the source itself included", () => {
    const cases: readonly { readonly setup: Omit<BoardSetup, "active" | "phase">; readonly discards: boolean }[] = [
      { setup: { player: { back: [fury.id] }, enemy: { front: [v.vanilla2.id] } }, discards: true },
      { setup: { player: { front: [fury.id] } }, discards: false },
      { setup: { player: { back: [fury.id], front: [v.vanilla1.id] } }, discards: false },
      { setup: { player: { back: [fury.id], front: [v.vanilla1.id] }, enemy: { front: [v.vanilla3.id] } }, discards: false },
    ];
    for (const { setup, discards } of cases) {
      const source = new FirstChoices();
      const { state, ids } = toNight({ ...setup, player: { ...setup.player, hand: [v.vanilla3.id] } }, source);
      expect(state.sides.player.hand).toHaveLength(discards ? 1 : 2);
      expect(state.sides.player.void).toHaveLength(discards ? 1 : 0);
      expect(state.sides.enemy.void).toEqual([]);
      expect(source.prompts.map((prompt) => prompt.side)).toEqual(discards ? ["player"] : []);
      expect(state.sides.player.hand).toContain(ids.player.deck[0]);
    }
    // An exhausted front-rank character is never designated, so it is no challenger.
    const { state: day } = boardState(roles.catalog, {
      active: "player", phase: "day", player: { back: [fury.id], front: [v.vanilla1.id], hand: [v.vanilla3.id], deck: longDeck }, enemy: { deck: longDeck },
    });
    day.instances[day.sides.player.frontRank[0]!].status.exhausted = true;
    const tired = passUntil(roles, day, at(roles, "player", "night"), new FirstChoices()).state;
    expect(tired.sides.player.void).toHaveLength(1);
  });

  it("reads the role as it resolves, after earlier Night triggers changed it", () => {
    const source = new FirstChoices();
    // B0 resolves first (D14): the challenger is returned to hand, and the discard happens.
    const after = toNight({ player: { back: [bounceFront.id, fury.id], front: [v.vanilla1.id], hand: [v.vanilla3.id] } }, source);
    expect(after.state.sides.player.hand).toContain(after.ids.player.front[0]);
    expect(after.state.sides.player.void).toHaveLength(1);
    expect(source.prompts).toHaveLength(1);
    // With the bounce later, the challenger is still there as the discard would happen.
    const before = toNight({ player: { back: [fury.id, bounceFront.id], front: [v.vanilla1.id], hand: [v.vanilla3.id] } }, new FirstChoices());
    expect(before.state.sides.player.hand).toContain(before.ids.player.front[0]);
    expect(before.state.sides.player.void).toEqual([]);
  });

  it("counts a blocker only for the amplified text, on the side that controls it, when the ability resolves in the opponent's Night", () => {
    for (const amplified of [false, true]) {
      const source = new FirstChoices();
      const { state: night, ids } = toNight({
        player: { front: [v.vanilla3.id], hand: [fastDraw.id], energy: 1 },
        enemy: { front: [fury.id], hand: [retriggerNight.id, v.vanilla1.id], energy: 1 },
      }, source);
      const enemyFury = ids.enemy.front[0]!;
      const stamped = structuredClone(night);
      stamped.instances[enemyFury] = { ...stamped.instances[enemyFury], variant: { amplified } };
      expect(matching(stamped, characterYouControl({ blocking: true }), "enemy")).toEqual([enemyFury]);
      const played = roles.apply(stamped, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, source).state;
      const responded = roles.apply(played, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, source).state;
      const resolved = passUntil(roles, responded, (state) => state.stack.length === 0, source).state;
      // The enemy drew a card; only the amplified text spares it the discard, and the player's challenger never counts for it.
      expect(resolved.sides.enemy.hand).toHaveLength(amplified ? 2 : 1);
      expect(resolved.sides.enemy.void).toHaveLength(amplified ? 1 : 2);
      expect(source.prompts.filter((prompt) => prompt.kind === "chooseCards").map((prompt) => prompt.side)).toEqual(amplified ? [] : ["enemy"]);
    }
  });

  it("suspends on the discard with its trigger queued, reloads to the same prompt, and bounces foreign, stale, and illegal answers", () => {
    const fold = createFoldAdapter(roles, { checkEventPrefix: true });
    const applied = (outcome: IntentOutcome): BattleSlice => {
      if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
      if (outcome.error !== null) throw new Error(outcome.error.message);
      return outcome.slice;
    };
    const { state, ids } = boardState(roles.catalog, {
      active: "player",
      phase: "day",
      player: { back: [fury.id], hand: [v.vanilla2.id, v.vanilla3.id], deck: longDeck },
      enemy: { front: [v.vanilla1.id], deck: longDeck },
    });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const dusk = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "pass" } }));
    const suspended = applied(fold.reduce(dusk, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    const pending = fold.pending(suspended)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", side: "player" });
    // The draw is not committed while the discard waits.
    expect(suspended.committed.sides.player.hand).toEqual(ids.player.hand);
    expect(suspended.committed.sides.player.deck).toEqual(ids.player.deck);
    // The opponent learns that a choice is pending, never which cards it offers.
    expect((promptView(pending.prompt, "enemy", pending.display) as ChooseCardsPrompt).candidates).toEqual([]);

    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = createFoldAdapter(roles, { checkEventPrefix: true });
    const again = fresh.pending(reloaded)!;
    expect(again.prompt.id).toBe(pending.prompt.id);
    const offered = (again.prompt as ChooseCardsPrompt).candidates;
    expect([...offered].sort()).toEqual([...ids.player.hand, ids.player.deck[0]].sort());
    const answer = (side: Side, value: readonly InstanceId[]) => fresh.reduce(reloaded, { kind: "answer", side, promptId: again.prompt.id, value });
    expect(answer("enemy", [offered[0]])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer("player", [ids.player.deck[1]])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(answer("player", [])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    // No action slips in between the trigger and its resolution.
    expect(fresh.reduce(reloaded, { kind: "battleAction", side: "player", action: { kind: "pass" } })).toMatchObject({ kind: "bounced" });

    const done = applied(answer("player", [ids.player.deck[0]]));
    expect(done.inFlight).toBeNull();
    expect(done.committed.turn.phase).toBe("night");
    expect(done.committed.sides.player.void).toEqual([ids.player.deck[0]]);
    expect(done.committed.sides.player.hand).toEqual(ids.player.hand);
    expect(fresh.reduce(done, { kind: "answer", side: "player", promptId: again.prompt.id, value: [ids.player.hand[0]] })).toMatchObject({ kind: "bounced" });
    expect(stateHash(deserializeState(serializeState(done.committed)))).toBe(stateHash(done.committed));
  });
});
