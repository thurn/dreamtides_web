import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { all, anyCharacter, characterYouControl, controls, enemyCharacter, event, staticAbility, target } from "../../../dsl/builders";
import { matchingCharacters } from "../../../dsl/selectors";
import { onNight, triggered } from "../../../dsl/triggers";
import type { CharacterSelector } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import type { Answer, Prompt } from "../../../prompts/types";
import type { InstanceId, Side } from "../../../state/ids";
import { opponent } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
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
  /** "▸Night: Gain 1 point if you control a challenger, then gain 2 points if you control a blocker." */
  const roleProbe: EngineCardDefinition = {
    ...v.vanilla2,
    id: syntheticId(1170),
    status: "authored",
    abilities: () => [
      triggered(
        onNight(),
        p.sequence(
          p.ifThen(controls(characterYouControl({ challenging: true })), p.gainPoints(1)),
          p.ifThen(controls(characterYouControl({ blocking: true })), p.gainPoints(2)),
        ),
      ),
    ],
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
  const roles = createEngine(testCatalog([...DSL_CARDS, roleProbe, bounceFront, nightControl, fastDraw, retriggerNight, challengerAnthem]));
  const longDeck = Array.from({ length: 8 }, () => v.vanilla1.id);
  const matching = (state: BattleState, selector: CharacterSelector, controller: Side = "player") =>
    matchingCharacters(state, roles.catalog, selector, controller, "i0");
  /** Places the board in `active`'s Day and passes to its Night, after the Night triggers. */
  const toNight = (setup: Omit<BoardSetup, "active" | "phase">, source: AnswerSource = NO, active: Side = "player") => {
    const placed = boardState(roles.catalog, {
      active,
      phase: "day",
      ...setup,
      player: { deck: longDeck, ...setup.player },
      enemy: { deck: longDeck, ...setup.enemy },
    });
    return { ...passUntil(roles, placed.state, at(roles, active, "night"), source), ids: placed.ids, start: placed.state };
  };
  /** The lanes the Challenge phase resolves from a Night state, through the next turn's Day. */
  const resolvedLanes = (night: BattleState) =>
    passUntil(roles, night, at(roles, opponent(night.turn.active), "day")).events.flatMap((event: EngineEvent) =>
      event.kind === "laneResolved" ? [{ challenger: event.challenger, blocker: event.blocker }] : [],
    );
  type LanePair = { readonly challenger: InstanceId; readonly blocker: InstanceId | null };
  /**
   * The Challenge phase resolves `pairs` from a Night state, in lane order,
   * and the selectors' roles name exactly those characters.
   */
  const expectRoles = (night: BattleState, pairs: readonly LanePair[]) => {
    expect(resolvedLanes(night)).toEqual(pairs);
    expect(matching(night, anyCharacter({ challenging: true })).sort()).toEqual(pairs.map((pair) => pair.challenger).sort());
    expect(matching(night, anyCharacter({ blocking: true })).sort()).toEqual(
      pairs.flatMap((pair) => (pair.blocker === null ? [] : [pair.blocker])).sort(),
    );
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

  it("reads the role as a condition resolves, after earlier Night triggers changed it", () => {
    // B0 resolves first (D14): the challenger is returned to hand before the probe reads it.
    const after = toNight({ player: { back: [bounceFront.id, roleProbe.id], front: [v.vanilla1.id] } });
    expect(after.state.sides.player.hand).toContain(after.ids.player.front[0]);
    expect(after.state.sides.player.score).toBe(0);
    // With the bounce later, the challenger is still there as the probe reads it.
    const before = toNight({ player: { back: [roleProbe.id, bounceFront.id], front: [v.vanilla1.id] } });
    expect(before.state.sides.player.hand).toContain(before.ids.player.front[0]);
    expect(before.state.sides.player.score).toBe(1);
  });

  it("counts a blocker for the side that controls it only when its ability resolves in the opponent's Night", () => {
    const source = new FirstChoices();
    const { state: night, ids } = toNight({
      player: { front: [v.vanilla3.id], hand: [fastDraw.id], energy: 1 },
      enemy: { front: [roleProbe.id], hand: [retriggerNight.id, v.vanilla1.id], energy: 1 },
    }, source);
    const probe = ids.enemy.front[0]!;
    expect(matching(night, characterYouControl({ blocking: true }), "enemy")).toEqual([probe]);
    const played = roles.apply(night, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, source).state;
    const responded = roles.apply(played, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, source).state;
    const resolved = passUntil(roles, responded, (state) => state.stack.length === 0, source).state;
    // The enemy's blocker counts; the player's challenger never counts for it.
    expect(resolved.sides.enemy.score).toBe(2);
  });

  it("holds the roles symmetrically when the enemy is active, through live control change, its Night trigger, and the Challenge phase", () => {
    const source = new FirstChoices();
    const { state: day, ids } = boardState(roles.catalog, {
      active: "enemy",
      phase: "day",
      player: { front: [v.vanilla2.id, v.vanilla2.id], deck: longDeck },
      enemy: { front: [v.vanilla3.id, v.vanilla3.id], back: [nightControl.id, roleProbe.id], deck: longDeck },
    });
    const [first, second] = ids.enemy.front as InstanceId[];
    const [taken, kept] = ids.player.front as InstanceId[];
    expect(matching(day, anyCharacter({ challenging: true }))).toEqual([]);
    const dusk = passUntil(roles, day, (state) => state.turn.phase === "dusk").state;
    expect(matching(dusk, characterYouControl({ challenging: true }), "enemy")).toEqual([first, second]);
    expect(matching(dusk, anyCharacter({ blocking: true }))).toEqual([]);

    // The enemy's Night triggers in D14 order: it gains control of the player's F0 blocker, then the probe reads its roles.
    const night = passUntil(roles, dusk, at(roles, "enemy", "night"), source).state;
    expect(source.prompts.map((prompt) => prompt.side)).toEqual(["enemy"]);
    expect(night.instances[taken]).toMatchObject({ controller: "enemy", zone: "play" });
    expect(matching(night, characterYouControl({ challenging: true }), "enemy")).toEqual([first, second]);
    expect(matching(night, characterYouControl({ blocking: true }))).toEqual([kept]);
    expect(matching(night, characterYouControl({ blocking: true }), "enemy")).toEqual([]);
    expect(matching(night, anyCharacter({ challenging: true, blocking: false }), "enemy")).toEqual([first, second]);
    expect(matching(night, characterYouControl({ challenging: false }), "enemy")).toEqual(
      expect.arrayContaining([taken, ids.enemy.back[0], ids.enemy.back[1]]),
    );
    // A challenger counts for the active enemy; it controls no blocker during its own turn.
    expect(night.sides.enemy.score).toBe(1);

    // The Challenge phase resolves the same pairs: F0 unblocked for 3, F1 blocked 3 against 2.
    expect(resolvedLanes(night)).toEqual([{ challenger: first, blocker: null }, { challenger: second, blocker: kept }]);
    const next = passUntil(roles, night, at(roles, "player", "day")).state;
    expect(next.sides.enemy.score).toBe(5);
    expect(next.instances[kept]?.zone).toBe("void");
    expect(matching(next, anyCharacter({ challenging: true }))).toEqual([]);
  });

  it("matches exactly the pairs the Challenge phase resolves, for either active side and every Night repositioning", () => {
    for (const active of ["player", "enemy"] as const) {
      const defending = opponent(active);
      const { state: night, ids } = toNight({
        [active]: { front: [v.vanilla3.id, v.vanilla3.id, v.vanilla3.id] },
        [defending]: { front: [v.vanilla2.id, v.vanilla2.id] },
      }, NO, active);
      const [a, b, c] = ids[active].front as InstanceId[];
      const [blockA, blockB] = ids[defending].front as InstanceId[];
      const moved = (change: (state: BattleState) => void) => {
        const state = structuredClone(night);
        change(state);
        return state;
      };
      expectRoles(night, [{ challenger: a, blocker: blockA }, { challenger: b, blocker: blockB }, { challenger: c, blocker: null }]);
      // A challenger moves to an open lane, and its blocker holds no role.
      expectRoles(
        moved((state) => { state.sides[active].frontRank[0] = null; state.sides[active].frontRank[4] = a; }),
        [{ challenger: b, blocker: blockB }, { challenger: c, blocker: null }, { challenger: a, blocker: null }],
      );
      // A designated blocker moved opposite another challenger blocks that one.
      expectRoles(
        moved((state) => { state.sides[defending].frontRank[0] = null; state.sides[defending].frontRank[2] = blockA; }),
        [{ challenger: a, blocker: null }, { challenger: b, blocker: blockB }, { challenger: c, blocker: blockA }],
      );
      // Two challengers trade lanes, each paired with the blocker now opposite it.
      expectRoles(
        moved((state) => { state.sides[active].frontRank[0] = b; state.sides[active].frontRank[1] = a; }),
        [{ challenger: b, blocker: blockA }, { challenger: a, blocker: blockB }, { challenger: c, blocker: null }],
      );
      // A challenger moved to the back rank holds no role, and neither does its blocker.
      expectRoles(
        moved((state) => { state.sides[active].frontRank[0] = null; state.sides[active].backRank[0] = a; }),
        [{ challenger: b, blocker: blockB }, { challenger: c, blocker: null }],
      );
    }
  });
});
