/**
 * Static abilities working from zones other than play: anthems and grants
 * from the void and the hand (RD-hv-umm2.53-1, RD-hv-umm2.53-2).
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { all, characterYouControl, staticAbility } from "../dsl/builders";
import { NO_DECK_MODS, type FunctionalZone, type Variant } from "../dsl/types";
import { eventSeenBy } from "../events";
import * as p from "../effects/primitives";
import { createEngine } from "../engine";
import type { Answer } from "../prompts/types";
import type { Action } from "../rules/actions";
import { hasKeyword } from "../rules/keywords";
import { effectiveSpark } from "../rules/spark";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { deserializeState, serializeState, stateHash } from "../state/hash";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { ScriptedSource } from "../steps/sources";
import { boardState, type SideSetup } from "../testing/board";
import { CONTINUOUS_CARDS } from "../testing/continuous-cards";
import { DSL } from "../testing/dsl-cards";
import { invariantViolations } from "../testing/invariants";
import { SYNTHETIC_CARDS, testCatalog } from "../testing/synthetic-cards";
import { Layers } from "./layers";
import {
  fixture,
  playAnthem,
  voidAnthem,
  handAnthem,
  anyAnthem,
  handEventAnthem,
  voidVengeful,
  dissolveAlly,
  dissolveAllyThenFail,
  engine,
  catalog,
  v,
  deck,
  board,
  spark,
  float,
  play,
} from "./continuous.fixtures";

/** "Characters you control have +1✦.", working from the void only with a deck mod; its plain variants work in play. */
const modifiedVoidAnthem = fixture(0xa91, "character", 1, (variant) => [
  staticAbility(p.sparkModifier(all(characterYouControl()), 1), { zone: variant.deckMods === undefined ? "play" : "void" }),
]);

/** One printing whose variants have distinct static zones and spark/cost effects. */
const variantAnthem = fixture(0xa90, "character", 1, (variant) => {
  const modified = variant.deckMods?.costReduction ?? 0;
  const zone = modified === 2 ? "any" : modified === 1 ? "void" : variant.amplified ? "hand" : "play";
  const amount = modified === 2 ? 4 : modified === 1 ? 3 : variant.amplified ? 2 : 1;
  return [
    staticAbility(p.sparkModifier(all(characterYouControl()), amount), { zone }),
    staticAbility(p.costModifier("you", { cardType: "character" }, -amount), { zone }),
  ];
});

describe("static abilities from other zones", () => {
  /** Applies an action with every answer used, checking the invariants (the memoized evaluation matches a fresh one). */
  const act = (state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) => {
    const source = new ScriptedSource(answers);
    const result = engine.apply(state, side, action, source);
    source.assertExhausted();
    expect(invariantViolations(result.state, catalog)).toEqual([]);
    return result;
  };
  const zoneOf = (state: BattleState, id: InstanceId | null | undefined) => state.instances[id!]?.zone ?? null;

  for (const reverse of [false, true]) {
    it(`keeps each printing variant's zone and effects through reload, evaluated ${reverse ? "modified-first" : "base-first"}`, () => {
      const cases: readonly { variant: Variant; amount: number; works: readonly ("back" | "void" | "hand" | "deck")[] }[] = [
        { variant: { amplified: false }, amount: 1, works: ["back"] },
        { variant: { amplified: true }, amount: 2, works: ["hand"] },
        { variant: { amplified: false, deckMods: { ...NO_DECK_MODS, costReduction: 1 } }, amount: 3, works: ["void"] },
        { variant: { amplified: false, deckMods: { ...NO_DECK_MODS, costReduction: 2 } }, amount: 4, works: ["back", "void", "hand", "deck"] },
      ];
      const variants = reverse ? [...cases].reverse() : cases;
      // Each engine starts with a fresh catalog; subsequent boards reuse it in the chosen order.
      const warm = createEngine(testCatalog([variantAnthem]));
      const reloaded = createEngine(testCatalog([variantAnthem]));
      for (const { variant, amount, works } of variants) {
        for (const placed of ["back", "void", "hand", "deck"] as const) {
          const setup: SideSetup = {
            front: [v.vanilla1.id], hand: [v.vanilla5.id], energy: 4,
            // Keep a separate hand card whose play cost we probe.
            [placed]: placed === "hand" ? [v.vanilla5.id, variantAnthem.id] : [variantAnthem.id],
          };
          const { state, ids } = boardState(warm.catalog, { active: "player", phase: "day", player: setup, enemy: { front: [v.vanilla1.id] } });
          const source = placed === "hand" ? ids.player.hand[1] : ids.player[placed][0]!;
          state.instances[source] = { ...state.instances[source], variant };
          const bonus = works.includes(placed) ? amount : 0;
          const ally = ids.player.front[0]!;
          const enemy = ids.enemy.front[0]!;
          const card = ids.player.hand[0];
          const check = (evaluated: BattleState, current: typeof warm) => {
            expect(effectiveSpark(evaluated, current.catalog, ally)).toBe(1 + bonus);
            expect(effectiveSpark(evaluated, current.catalog, enemy)).toBe(1);
            expect(current.view(evaluated, "player").instances[card]?.characteristics.cost).toBe(5 - bonus);
            expect(current.legalActions(evaluated, "player").some((action) => action.kind === "play" && action.card === card && action.from === "hand")).toBe(bonus > 0);
          };
          const saved = serializeState(state);
          check(state, warm);
          const restored = deserializeState(saved);
          check(restored, warm);
          check(restored, reloaded);
          expect(serializeState(restored)).toBe(saved);
          expect(serializeState(state)).toBe(saved);
        }
      }
    });
  }

  it("are flagged in a catalog exactly when a printing's base or amplified variant has one", () => {
    const outsidePlay = (cards: readonly EngineCardDefinition[]) =>
      cards.some((card) => [false, true].some((amplified) => card.abilities({ amplified }).some((ability) => ability.kind === "static" && ability.zone !== "play")));
    // variantAnthem works outside play only when amplified; modifiedVoidAnthem only with a deck mod.
    const catalogs = [[], [playAnthem], [playAnthem, voidAnthem], [handAnthem], [anyAnthem], [variantAnthem], [modifiedVoidAnthem], CONTINUOUS_CARDS];
    expect(catalogs.map((cards) => testCatalog(cards).staticsOutsidePlay())).toEqual(catalogs.map((cards) => outsidePlay([...SYNTHETIC_CARDS, ...cards])));
    expect(testCatalog([variantAnthem]).staticsOutsidePlay()).toBe(true);
    expect(testCatalog([modifiedVoidAnthem]).staticsOutsidePlay()).toBe(false);
  });

  it("apply from a card with deck mods in an unflagged catalog", () => {
    const modified = createEngine(testCatalog([modifiedVoidAnthem]));
    expect(modified.catalog.staticsOutsidePlay()).toBe(false);
    for (const variant of [{ amplified: false }, { amplified: false, deckMods: { ...NO_DECK_MODS, costReduction: 1 } }] as const) {
      const { state, ids } = boardState(modified.catalog, { active: "player", phase: "day", player: { front: [v.vanilla1.id], void: [modifiedVoidAnthem.id] }, enemy: { front: [v.vanilla1.id] } });
      const source = ids.player.void[0];
      state.instances[source] = { ...state.instances[source], variant };
      expect(effectiveSpark(state, modified.catalog, ids.player.front[0]!)).toBe(variant.deckMods === undefined ? 1 : 2);
      expect(invariantViolations(state, modified.catalog)).toEqual([]);
    }
  });

  it("apply only while their card is in a zone they work from: play unless they name one, and 'any' is play, void, hand, and deck", () => {
    const works: Record<FunctionalZone, readonly ("back" | "void" | "hand" | "deck")[]> = {
      play: ["back"],
      void: ["void"],
      hand: ["hand"],
      any: ["back", "void", "hand", "deck"],
    };
    const sources: Record<FunctionalZone, EngineCardDefinition> = { play: playAnthem, void: voidAnthem, hand: handAnthem, any: anyAnthem };
    for (const zone of ["play", "void", "hand", "any"] as const) {
      for (const placed of ["back", "void", "hand", "deck"] as const) {
        const setup: SideSetup = { front: [v.vanilla1.id], [placed]: [sources[zone].id] };
        const { state, ids } = board({ player: setup, enemy: { front: [v.vanilla1.id] } });
        expect({ zone, placed, ally: spark(state, ids.player.front[0]) }).toEqual({ zone, placed, ally: works[zone].includes(placed) ? 2 : 1 });
        expect(spark(state, ids.enemy.front[0])).toBe(1);
      }
    }
  });

  it("start as their card enters the zone and stop as it leaves, through played cards", () => {
    const { state, ids } = board({ player: { back: [voidAnthem.id], front: [v.vanilla1.id], hand: [dissolveAlly.id], energy: 1, deck }, enemy: { deck } });
    const [source] = ids.player.back;
    const ally = ids.player.front[0];
    expect(spark(state, ally)).toBe(1);
    const dissolved = act(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, [[source!]]).state;
    expect(zoneOf(dissolved, source)).toBe("void");
    expect(spark(dissolved, ally)).toBe(2);
    // Reclaimed, it leaves the void for play, where its ability does not work.
    const reclaimed = act(dissolved, "player", { kind: "play", card: source!, from: "void" }).state;
    expect(zoneOf(reclaimed, source)).toBe("play");
    expect(spark(reclaimed, ally)).toBe(1);
    expect(spark(reclaimed, source)).toBe(1);
  });

  it("apply from a hidden hand without naming the card to the opponent, in its view or its events", () => {
    const { state, ids } = board({ player: { front: [v.vanilla1.id], hand: [DSL.drawTwo.id], energy: 2, deck: [handAnthem.id, handAnthem.id] }, enemy: { deck } });
    const ally = ids.player.front[0]!;
    const drawn = act(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" });
    const hidden = ids.player.deck;
    expect(drawn.state.sides.player.hand).toEqual(expect.arrayContaining([...hidden]));
    expect(spark(drawn.state, ally)).toBe(3);
    const seen = engine.view(drawn.state, "enemy");
    // The opponent sees what the abilities change, never which cards hold them.
    expect(seen.instances[ally]?.characteristics.spark).toBe(3);
    for (const id of hidden) expect(seen.instances[id]).toBeUndefined();
    expect(seen.sides.player.hand).toEqual({ count: 2, known: [] });
    const published = JSON.stringify(drawn.events.map((entry) => eventSeenBy(entry, "enemy", drawn.state)));
    for (const id of hidden) expect(published).not.toContain(`"${id}"`);
    // Played from the hand, one stops working there, and its ability does not work in play.
    const played = act(drawn.state, "player", { kind: "play", card: hidden[0], from: "hand" }).state;
    expect(spark(played, ally)).toBe(2);
    expect(spark(played, hidden[0])).toBe(2);
  });

  it("take their timestamp from when the card entered the zone they work from", () => {
    for (const [entered, vengeful] of [[1, false], [3, true]] as const) {
      const { state, ids } = board({ player: { front: [v.vanilla1.id], void: [voidVengeful.id] } });
      const ally = ids.player.front[0]!;
      float(state, { kind: "keyword", instance: ally, keyword: "vengeful", gains: false }, 2);
      state.instances[ids.player.void[0]].enteredZoneAt = entered;
      // The later of the static grant and the floating loss decides.
      expect(hasKeyword(state, catalog, ally, "vengeful")).toBe(vengeful);
    }
  });

  it("belong to the side whose void or hand holds the card", () => {
    const { state, ids } = board({ player: { front: [v.vanilla1.id] }, enemy: { front: [v.vanilla1.id], void: [voidAnthem.id], hand: [handAnthem.id] } });
    expect(spark(state, ids.enemy.front[0])).toBe(3);
    expect(spark(state, ids.player.front[0])).toBe(1);
    // A card the player owns but the enemy holds works for the enemy.
    const held = ids.enemy.hand[0];
    state.instances[held] = { ...state.instances[held], owner: "player" };
    expect(new Layers(state, catalog).of(ids.enemy.front[0]!).spark).toBe(3);
    expect(new Layers(state, catalog).of(ids.player.front[0]!).spark).toBe(1);
  });

  it("store nothing: a reloaded play waiting on a target reads the same, bounces foreign and illegal answers, and stops on the commit", () => {
    const { state, ids } = board({ player: { front: [v.vanilla1.id], hand: [handEventAnthem.id], energy: 1, deck }, enemy: { front: [v.vanilla1.id, v.vanilla2.id], deck } });
    const ally = ids.player.front[0];
    const [enemy] = ids.enemy.front;
    const reloadedState = JSON.parse(JSON.stringify(state)) as BattleState;
    expect(stateHash(reloadedState)).toBe(stateHash(state));
    expect(spark(reloadedState, ally)).toBe(2);
    expect(engine.legalActions(reloadedState, "player")).toEqual(engine.legalActions(state, "player"));

    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const started: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const suspended = fold.reduce(started, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (suspended.kind !== "applied") throw new Error("bounced");
    const saved = JSON.parse(JSON.stringify(suspended.slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const pending = fresh.pending(saved)!;
    expect(pending.prompt.id).toBe(fold.pending(suspended.slice)!.prompt.id);
    // Until the play commits the card is still in the hand, working.
    expect(spark(saved.committed, ally)).toBe(2);
    const answer = (side: Side, value: Answer) => fresh.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value });
    expect(answer("enemy", [enemy!])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer("player", [ally!])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(spark(saved.committed, ally)).toBe(2);
    const answered = answer("player", [enemy!]);
    if (answered.kind !== "applied" || answered.error !== null) throw new Error("the answer did not apply");
    expect(spark(answered.slice.committed, ally)).toBe(1);
    expect(stateHash(answered.slice.committed)).toBe(stateHash(play(state, "player", ids.player.hand[0], [[enemy!]]).state));
  });

  it("start nothing when the step that moved their card fails, which commits nothing", () => {
    const { state, ids } = board({ player: { back: [voidAnthem.id], front: [v.vanilla1.id], hand: [dissolveAllyThenFail.id], deck }, enemy: { deck } });
    const [source] = ids.player.back;
    const ally = ids.player.front[0];
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const started: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const played = fold.reduce(started, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (played.kind !== "applied") throw new Error("bounced");
    const outcome = fold.reduce(played.slice, { kind: "answer", side: "player", promptId: fold.pending(played.slice)!.prompt.id, value: [source!] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    // The resolution dissolved the source before it failed; none of it commits, so the source stays in play and its ability does not work.
    const after = outcome.slice.committed;
    expect(zoneOf(after, source)).toBe("play");
    expect(spark(after, ally)).toBe(1);
    expect(outcome.published.map((entry) => entry.kind)).toEqual(["handEmptied", "cardPlayed"]);
  });
});
