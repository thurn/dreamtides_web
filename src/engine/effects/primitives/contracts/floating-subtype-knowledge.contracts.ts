import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { energy, event, topOfDeck } from "../../../dsl/builders";
import { BASE_VARIANT } from "../../../dsl/types";
import { whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleIntent, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { stateHash } from "../../../state/hash";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { SIDES, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import type { ResolvingEffect } from "../../registry";
import { resolveEffect } from "../../interpreter";
import { banishCards } from "../banish-cards";
import { CHOSEN_SUBTYPE, chooseSubtype } from "../choose-subtype";
import { delayed, floating } from "../floating-trigger";
import { materialize } from "../materialize";
import { drawMatching } from "../draw-matching";
import { ifThen } from "../if-then";
import { repeat } from "../repeat";

const mage: EngineCardDefinition = { id: syntheticId(0x7830), cardType: "character", costs: [energy(0)], spark: 2,
  subtype: "Mage", speed: "standard", status: "vanilla", abilities: () => [] };
const warrior: EngineCardDefinition = { ...mage, id: syntheticId(0x7831), subtype: "Warrior" };
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(result: IntentOutcome): BattleSlice {
  if (result.kind !== "applied" || result.error !== null) throw new Error(JSON.stringify(result));
  return result.slice;
}
function reload(slice: BattleSlice): BattleSlice {
  const parsed = parseJourneyBattleFoldState({ mode: { kind: "journey" },
    init: { battleId: "battle-1", siteId: "site-1", nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
      enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [] },
    engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown },
  });
  if (parsed === null) throw new Error("invalid saved battle");
  return parsed.engine.slice;
}

type Guard = "hidden" | "changedOrigin" | "changedVariant" | "opaque";
interface Options { readonly guard?: Guard; readonly branch?: "short" | "long"; readonly independent?: true }
function fixture(side: Side, kind: "materialize" | "banish" | "draw", once: boolean, bound = true, matching = true, options: Options = {}) {
  const ref = topOfDeck(2, { cardType: "character", subtype: bound ? CHOSEN_SUBTYPE : "Mage" });
  const move = (count: number): ResolvingEffect => kind === "materialize" ? materialize({ ...ref, count }) : banishCards([{ ...ref, count }]);
  const movement = kind === "draw" ? drawMatching(ref.filter) : options.branch === undefined ? move(2)
    : ifThen({ cond: "cardsIn", player: "you", zone: "hand", filter: { cardType: "event", costAtLeast: 1 }, atLeast: 1 }, move(2), move(4));
  const trigger = whenYouPlay(options.independent === true ? { subtype: CHOSEN_SUBTYPE } : { cardType: "character" });
  const callback = once ? delayed(trigger, movement) : floating(trigger, movement);
  const chosen = bound ? chooseSubtype({ then: callback }) : callback;
  const effect: ResolvingEffect = options.independent === true ? repeat(2, chosen) : chosen;
  const card: EngineCardDefinition = { id: syntheticId(0x7832), cardType: "event", costs: [energy(0)], spark: null,
    subtype: "", speed: "fast", status: "authored", abilities: () => [event(effect)] };
  const other: EngineCardDefinition = { ...card, id: syntheticId(0x7834) };
  const secret: EngineCardDefinition = { ...card, id: syntheticId(0x7835), costs: [energy(options.branch === "short" ? 1 : 0)], abilities: () => [] };
  const driver: EngineCardDefinition = { ...card, id: syntheticId(0x7833), abilities: () => options.guard === "opaque" ? [event(effect)] : [], synthetic: { resolve(ctx, item) {
    if (options.guard === "opaque") return;
    const source = ctx.state.sides[side].hand[0];
    const origin = options.guard === "changedOrigin" || options.guard === "changedVariant"
      ? { kind: "card" as const, cardId: card.id, variant: BASE_VARIANT } : instanceOrigin(instanceOf(ctx.state, source));
    resolveEffect(ctx, effect, { source, origin, ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
  } } };
  const engine = createEngine(testCatalog([mage, warrior, card, other, driver, secret]));
  const source = options.guard === "changedOrigin" ? other.id : options.guard === "changedVariant" ? { cardId: card.id, amplified: true } : card.id;
  const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: {
    hand: [options.guard === undefined ? card.id : driver.id, ...(options.guard === undefined ? [] : [source]), mage.id,
      ...(options.independent === true ? [warrior.id] : options.branch === undefined ? [] : [secret.id])],
    deck: [matching ? mage.id : warrior.id, warrior.id, kind === "draw" ? mage.id : warrior.id, warrior.id,
      ...(options.branch === undefined ? [] : [warrior.id, warrior.id])], energy: 5,
  } });
  const known = [ids[side].deck[2], ...(options.branch === undefined ? [] : [ids[side].deck[4]]),
    ...(options.guard === "changedOrigin" || options.guard === "changedVariant" ? [ids[side].hand[1]] : [])];
  state.knownTo = { player: [...known], enemy: [...known] };
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const intents: BattleIntent[] = [];
  const publications: EngineEvent[] = [];
  const observations: BattleState[] = [];
  let current = sliceOf(state);
  const reduce = (intent: BattleIntent) => {
    const result = fold.reduce(current, intent, { presented: () => true, limit: 256 });
    current = applied(result);
    intents.push(intent);
    if (result.kind === "applied") {
      publications.push(...result.published);
      for (const event of result.published) {
        const seen = fold.observed(event);
        if (seen !== undefined) observations.push(seen);
      }
    }
    return current;
  };
  const play = (index: number) => reduce({ kind: "battleAction", side, action: { kind: "play", card: ids[side].hand[index], from: "hand" } });
  const answer = (subtype: "Mage" | "Warrior") => reduce({ kind: "answer", side, promptId: fold.pending(current)!.prompt.id, value: engine.catalog.characterTypes.indexOf(subtype) });
  const install = () => {
    play(0);
    if (bound) answer("Mage");
  };
  Object.freeze(ref.filter);
  Object.freeze(callback);
  Object.freeze(effect);
  return { engine, state, ids, effect, fold, intents, publications, observations, play, answer, install, reduce,
    get current() { return current; }, set current(value: BattleSlice) { current = value; } };
}

describe("chosen floating declaration deck knowledge", () => {
  for (const side of SIDES) for (const kind of ["materialize", "banish"] as const) for (const once of [false, true]) {
    it(`keeps the public top-two proof for ${side}'s bound ${once ? "delayed" : "floating"} ${kind} through reload and replay`, () => {
      const run = fixture(side, kind, once);
      const original = JSON.stringify(run.state);
      const declaration = JSON.stringify(run.effect);
      run.install();
      run.current = reload(run.current);
      run.play(1);
      expect(run.current.committed.sides[side].deck).toEqual(run.ids[side].deck.slice(1));
      expect(run.current.committed.instances[run.ids[side].deck[0]].zone).toBe(kind === "materialize" ? "play" : "banished");
      const settled = [...run.observations.filter(state => state.sides[side].deck.length === 3), run.current.committed];
      expect(settled.length).toBeGreaterThan(1);
      for (const state of settled) for (const viewer of SIDES) {
        const view = run.engine.view(state, viewer);
        expect(view.sides[side].deck.known).toEqual([{ id: run.ids[side].deck[2], index: 1 }]);
        expect(view.instances[run.ids[side].deck[3]]).toBeUndefined();
      }
      const fresh = createFoldAdapter(createEngine(run.engine.catalog), { checkEventPrefix: true });
      let replay = sliceOf(JSON.parse(original) as BattleState);
      const events: EngineEvent[] = [];
      for (const intent of run.intents) {
        const result = fresh.reduce(replay, intent);
        replay = applied(result);
        if (result.kind === "applied") events.push(...result.published);
      }
      expect(stateHash(replay.committed)).toBe(stateHash(run.current.committed));
      expect(replay).toEqual(run.current);
      expect(events).toEqual(run.publications);
      for (const viewer of SIDES) expect(run.engine.view(replay.committed, viewer)).toEqual(run.engine.view(run.current.committed, viewer));
      expect(JSON.stringify(run.state)).toBe(original);
      expect(JSON.stringify(run.effect)).toBe(declaration);
      expect(invariantViolations(run.current.committed, run.engine.catalog)).toEqual([]);
    });
  }

  for (const side of SIDES) for (const kind of ["materialize", "banish"] as const) {
    it(`preserves ${side}'s ordinary ${kind} proof and nonmatching bound deck`, () => {
      for (const matching of [false, true]) {
        const run = fixture(side, kind, true, !matching, matching);
        run.install();
        run.play(1);
        for (const viewer of SIDES) expect(run.engine.view(run.current.committed, viewer).sides[side].deck.known)
          .toEqual([{ id: run.ids[side].deck[2], index: matching ? 1 : 2 }]);
      }
    });
  }

  for (const side of SIDES) {
    it(`uses the reconstructed declared filter for ${side}'s bound matching draw`, () => {
      const run = fixture(side, "draw", true);
      run.install();
      run.play(1);
      expect(run.current.committed.sides[side].hand).toEqual([run.ids[side].deck[0]]);
      for (const viewer of SIDES) expect(run.engine.view(run.current.committed, viewer).sides[side].deck.known)
        .toEqual([{ id: run.ids[side].deck[2], index: 1 }]);
    });

    for (const kind of ["materialize", "banish"] as const) {
      it(`keeps independent public bindings for ${side}'s two ${kind} installations`, () => {
        const run = fixture(side, kind, true, true, true, { independent: true });
        const original = JSON.stringify(run.effect);
        run.play(0);
        run.answer("Mage");
        run.answer("Warrior");
        run.current = reload(run.current);
        run.play(2);
        expect(run.current.committed.sides[side].deck).toEqual([run.ids[side].deck[0], ...run.ids[side].deck.slice(2)]);
        for (const viewer of SIDES) expect(run.engine.view(run.current.committed, viewer).sides[side].deck.known)
          .toEqual([{ id: run.ids[side].deck[2], index: 1 }]);
        run.play(1);
        expect(run.current.committed.sides[side].deck).toEqual(run.ids[side].deck.slice(2));
        for (const viewer of SIDES) expect(run.engine.view(run.current.committed, viewer).sides[side].deck.known)
          .toEqual([{ id: run.ids[side].deck[2], index: 0 }]);
        expect(JSON.stringify(run.effect)).toBe(original);
      });

      it(`uses the full public maximum across ${side}'s hidden ${kind} branches`, () => {
        const views = [];
        for (const branch of ["short", "long"] as const) {
          const run = fixture(side, kind, true, true, true, { branch });
          run.install();
          run.play(1);
          expect(run.current.committed.sides[side].deck).toEqual(run.ids[side].deck.slice(1));
          for (const viewer of SIDES) expect(run.engine.view(run.current.committed, viewer).sides[side].deck.known)
            .toEqual([{ id: run.ids[side].deck[4], index: 3 }]);
          views.push(run.engine.view(run.current.committed, side === "player" ? "enemy" : "player").sides[side].deck);
        }
        expect(views[0]).toEqual(views[1]);
      });

      for (const guard of ["hidden", "changedOrigin", "changedVariant", "opaque"] as const) {
        it(`keeps ${side}'s ${guard} ${kind} attribution bounded to public proof`, () => {
          const run = fixture(side, kind, true, true, true, { guard });
          run.install();
          run.current = reload(run.current);
          run.play(2);
          expect(run.current.committed.sides[side].deck).toEqual(run.ids[side].deck.slice(1));
          for (const viewer of SIDES) expect(run.engine.view(run.current.committed, viewer).sides[side].deck.known)
            .toEqual(guard === "hidden" && viewer === side ? [{ id: run.ids[side].deck[2], index: 1 }] : []);
          expect(invariantViolations(run.current.committed, run.engine.catalog)).toEqual([]);
        });
      }
    }
  }
});
