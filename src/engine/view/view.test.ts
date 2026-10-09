import { describe, expect, it } from "vitest";
import { createEngine } from "../engine";
import { eventVisibleTo, type EngineEvent } from "../events";
import { deserializeState, serializeState, stateHash } from "../state/hash";
import type { CardId, InstanceId, Side, Zone } from "../state/ids";
import { battleSeed, opponent, SIDES } from "../state/ids";
import type { BattleState, StackItem } from "../state/types";
import { InlineSource, NO_PROMPTS, ScriptedSource } from "../steps/sources";
import { boardState, cardIdOf, placeFigment } from "../testing/board";
import { ZONE, ZONE_FIGMENT } from "../testing/zone-cards";
import { fuzzEngineCatalog, fuzzInit, SYNTHETIC_FUZZ_POOL } from "../testing/fuzz";
import { SYNTHETIC } from "../testing/synthetic-cards";
import { PROMPTING } from "../testing/synthetic-effects";
import { AVATAR, DREAMSIGN, STACK } from "../testing/stack-cards";
import { hiddenFrom, strings } from "../testing/redaction";
import type { ArrangeAnswer, Prompt } from "../prompts/types";
import { PolicyRandom } from "../testing/random-policy";
import { determinize } from "./determinize";
import { promptView, view } from "./view";

const catalog = fuzzEngineCatalog(SYNTHETIC_FUZZ_POOL);
const v = SYNTHETIC;
const p = PROMPTING;

/** Places a new instance directly into a public zone list, or into `holder`'s hand. */
function place(state: BattleState, owner: Side, cardId: CardId, zone: Zone & ("void" | "banished" | "stack" | "hand"), holder: Side = owner): InstanceId {
  const id: InstanceId = `i${state.nextInstance}`;
  state.nextInstance += 1;
  state.instances[id] = {
    id,
    printing: { kind: "card", cardId },
    owner,
    controller: holder,
    zone,
    variant: { amplified: false },
    status: { exhausted: false, gainedSpark: 1, counters: 2, created: false, reclaimed: false, offering: false, ephemeral: false, x: null },
    enteredZoneAt: 3,
  };
  if (zone === "stack") {
    state.stack.push({ kind: "card", instance: id, controller: owner, choices: [], x: null, optionalPaid: [] });
  } else {
    state.sides[holder][zone].push(id);
  }
  return id;
}

/**
 * A battle in which every card is distinct, so a card ID identifies exactly
 * one instance: both ranks, hands, decks, voids, banished cards, the stack,
 * a challenge, and a result are populated.
 */
function fixture() {
  const { state, ids } = boardState(catalog, {
    active: "player",
    phase: "day",
    player: { front: [v.vanilla1.id], back: [v.vanilla2.id], hand: [v.vanilla3.id, v.vanilla5.id], deck: [v.vanilla8.id, v.fastCharacter.id] },
    enemy: { front: [v.vengeful1.id], back: [v.awakened2.id], hand: [v.event0.id, v.event1.id], deck: [v.fastEvent.id, v.interruptEvent.id] },
  });
  place(state, "player", v.interruptCharacter.id, "void");
  place(state, "enemy", v.vanilla0.id, "banished");
  const stacked = place(state, "player", p.discard.id, "stack");
  const enemyFront = ids.enemy.front[0];
  const playerFront = ids.player.front[0];
  if (enemyFront === null || playerFront === null) throw new Error("fixture has empty fronts");
  state.stack[0] = { kind: "card", instance: stacked, controller: "player", choices: [{ modes: [], targets: [[enemyFront, ids.enemy.hand[0]]] }], x: 2, optionalPaid: [] };
  state.stack.push({
    kind: "ability",
    source: { kind: "dreamsign", side: "player", index: 0 },
    ability: 0,
    origin: { kind: "dreamsign", id: DREAMSIGN.points.id },
    controller: "player",
    choices: { modes: [], targets: [] },
    x: null,
    optionalPaid: [true],
  });
  // A card the enemy owns, held in the player's hand.
  const held = place(state, "enemy", p.dissolveEnemy.id, "hand", "player");
  state.sides.player.avatar = { id: AVATAR.drawer.id, exhausted: true };
  state.sides.enemy.avatar = { id: AVATAR.rally.id, exhausted: false };
  state.sides.player.dreamsigns = [{ id: DREAMSIGN.points.id }];
  state.payable = [{ id: "e1", payer: "enemy", cost: 2, source: { kind: "avatar", side: "player" }, affects: [enemyFront] }];
  state.nextEffect = 2;
  state.challenge = { challengers: [playerFront], blockers: { [playerFront]: enemyFront } };
  state.result = { kind: "victory", winner: "player", reason: "score" };
  state.rng["shuffle:player"] = 4;
  return { state, ids, held };
}

/** Overwrites every array and object field reachable from `value`, innermost first. */
function vandalize(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) vandalize(entry);
    value.splice(0, value.length, "vandalized");
  } else if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      vandalize(record[key]);
      record[key] = "vandalized";
    }
    record.added = "vandalized";
  }
}

/** Instances whose identity `viewer` has not learned in the fixture: every deck and the opponent's hand. */
function unseen(state: BattleState, viewer: Side): InstanceId[] {
  return [...state.sides.player.deck, ...state.sides.enemy.deck, ...state.sides[opponent(viewer)].hand];
}

describe("view", () => {
  it("shares no object with its source state", () => {
    for (const viewer of SIDES) {
      const { state } = fixture();
      const before = serializeState(state);
      const hash = stateHash(state);
      vandalize(view(state, viewer, catalog));
      expect(serializeState(state)).toBe(before);
      expect(stateHash(state)).toBe(hash);
    }
  });

  it("reveals neither the instance IDs nor the card IDs of cards in decks and the opponent's hand", () => {
    for (const viewer of SIDES) {
      const { state } = fixture();
      const seen = strings(view(state, viewer, catalog));
      expect(hiddenFrom(state, viewer).sort()).toEqual(unseen(state, viewer).sort());
      for (const id of unseen(state, viewer)) {
        expect(seen.has(id)).toBe(false);
        expect(seen.has(cardIdOf(state, id))).toBe(false);
      }
      expect(seen.has(state.seed)).toBe(false);
      expect(Object.keys(view(state, viewer, catalog))).not.toContain("seed");
      expect(Object.keys(view(state, viewer, catalog))).not.toContain("rng");
    }
  });

  it("reveals no hidden instance ID in a dealt battle", () => {
    const engine = createEngine(catalog);
    const { state } = engine.createBattle(fuzzInit(battleSeed("view-dealt"), SYNTHETIC_FUZZ_POOL), NO_PROMPTS);
    for (const viewer of SIDES) {
      const seen = strings(engine.view(state, viewer));
      const hidden = hiddenFrom(state, viewer);
      expect(hidden.length).toBeGreaterThan(0);
      expect(hidden.filter((id) => seen.has(id))).toEqual([]);
    }
  });

  it("counts hidden zones and lists the viewer's own hand, including a card the opponent owns", () => {
    const { state, ids, held } = fixture();
    const seen = view(state, "player", catalog);
    expect(seen.sides.player.hand).toEqual({ count: 3, known: [...ids.player.hand, held].map((id, index) => ({ id, index })) });
    expect(seen.instances[held]).toMatchObject({ owner: "enemy", controller: "player", zone: "hand" });
    expect(view(state, "enemy", catalog).instances[held]).toBeUndefined();
    expect(view(state, "enemy", catalog).sides.player.hand).toEqual({ count: 3, known: [] });
    expect(seen.sides.enemy.hand).toEqual({ count: 2, known: [] });
    expect(seen.sides.player.deck).toEqual({ count: 2, known: [] });
    expect(seen.sides.enemy.deck).toEqual({ count: 2, known: [] });
  });

  it("matches the state in public zones and the viewer's own hand", () => {
    for (const viewer of SIDES) {
      const { state } = fixture();
      const seen = view(state, viewer, catalog);
      const visible = Object.values(state.instances)
        .filter((instance) => instance.zone !== "deck" && (instance.zone !== "hand" || instance.controller === viewer))
        .map((instance) => instance.id);
      expect(Object.keys(seen.instances).sort()).toEqual([...visible].sort());
      for (const id of visible) {
        const { characteristics: _effective, ...instance } = seen.instances[id] ?? { characteristics: null };
        expect(instance).toEqual(state.instances[id]);
      }
      for (const side of SIDES) {
        const source = state.sides[side];
        const sideView = seen.sides[side];
        expect(sideView.frontRank).toEqual(source.frontRank);
        expect(sideView.backRank).toEqual(source.backRank);
        expect(sideView.void).toEqual(source.void);
        expect(sideView.banished).toEqual(source.banished);
        expect(sideView.score).toBe(source.score);
        expect(sideView.currentEnergy).toBe(source.currentEnergy);
      }
      expect(seen.turn).toEqual(state.turn);
      expect(seen.config).toEqual(state.config);
      expect(seen.challenge).toEqual(state.challenge);
      expect(seen.result).toEqual(state.result);
      const stacked = (items: readonly StackItem[]) => items.map((item) => (item.kind === "card" ? item.instance : null));
      expect(stacked(seen.stack)).toEqual(stacked(state.stack));
      expect(seen.stack[1]).toEqual(state.stack[1]);
    }
  });

  it("shows each side's avatar and dreamsigns and the effects a side may pay to end, as snapshots", () => {
    const { state } = fixture();
    const enemyFront = state.sides.enemy.frontRank[0];
    for (const viewer of SIDES) {
      const seen = view(state, viewer, catalog);
      expect(seen.sides.player.avatar).toEqual({ id: AVATAR.drawer.id, exhausted: true });
      expect(seen.sides.enemy.avatar).toEqual({ id: AVATAR.rally.id, exhausted: false });
      expect(seen.sides.player.dreamsigns).toEqual([{ id: DREAMSIGN.points.id }]);
      expect(seen.sides.enemy.dreamsigns).toEqual([]);
      expect(seen.payable).toEqual([
        { id: "e1", controller: "player", payer: "enemy", cost: 2, source: { kind: "avatar", side: "player" }, affects: [enemyFront] },
      ]);
    }
    const seen = view(state, "player", catalog);
    state.sides.player.avatar = { id: AVATAR.drawer.id, exhausted: false };
    state.sides.player.dreamsigns.push({ id: DREAMSIGN.points.id });
    state.payable = [];
    expect(seen.sides.player.avatar?.exhausted).toBe(true);
    expect(seen.sides.player.dreamsigns).toHaveLength(1);
    expect(seen.payable).toHaveLength(1);
  });
  it("hides the source of an effect a side may pay to end when the viewer cannot see it", () => {
    const { state } = fixture();
    const enemyFront = state.sides.enemy.frontRank[0]!;
    const playerHand = state.sides.player.hand[0];
    state.payable = [{ id: "e1", payer: "enemy", cost: 2, source: playerHand, affects: [enemyFront] }];
    const enemy = view(state, "enemy", catalog);
    expect(enemy.payable).toEqual([{ id: "e1", controller: "player", payer: "enemy", cost: 2, source: null, affects: [enemyFront] }]);
    expect(strings(enemy).has(playerHand)).toBe(false);
    expect(view(state, "player", catalog).payable[0]?.source).toBe(playerHand);
  });

  it("keeps effect events from a card in a hidden zone private to the side holding it", () => {
    const { state } = fixture();
    const enemyFront = state.sides.enemy.frontRank[0]!;
    const playerHand = state.sides.player.hand[0];
    const origin = { kind: "card" as const, cardId: cardIdOf(state, playerHand), variant: { amplified: false } };
    const hiddenSource: EngineEvent[] = [
      { kind: "effectStarted", effect: "e5", controller: "player", source: playerHand, expiry: { at: "never" }, change: { kind: "trigger", ref: { origin, ability: 0, node: 0 }, once: true } },
      { kind: "payableEffectRegistered", effect: "e6", payer: "enemy", cost: 1, source: playerHand, affects: [enemyFront] },
    ];
    for (const event of hiddenSource) {
      expect(eventVisibleTo(event, "player", state)).toBe(true);
      expect(eventVisibleTo(event, "enemy", state)).toBe(false);
    }
    const avatar = { kind: "avatar" as const, side: "player" as const };
    const publicSource: EngineEvent[] = [
      { kind: "effectStarted", effect: "e7", controller: "player", source: avatar, expiry: { at: "endOfTurn" }, change: { kind: "spark", instance: enemyFront, amount: 1 } },
      { kind: "payableEffectRegistered", effect: "e8", payer: "enemy", cost: 1, source: avatar, affects: [enemyFront] },
    ];
    for (const event of publicSource) expect(eventVisibleTo(event, "enemy", state)).toBe(true);
  });

  it("shows floating effects and queued triggers, hiding cards the viewer cannot see", () => {
    const { state } = fixture();
    const enemyFront = state.sides.enemy.frontRank[0]!;
    const enemyHand = state.sides.enemy.hand[0];
    state.floating = [
      { id: "e2", controller: "player", source: { kind: "avatar", side: "player" }, timestamp: 1, expiry: { at: "endOfTurn" }, change: { kind: "spark", instance: enemyFront, amount: -1 } },
      { id: "e3", controller: "player", source: { kind: "avatar", side: "player" }, timestamp: 2, expiry: { at: "turnStart", side: "player" }, change: { kind: "spark", instance: enemyHand, amount: 2 } },
    ];
    const origin = { kind: "card" as const, cardId: v.event0.id, variant: { amplified: false } };
    state.triggerQueue = [{ source: enemyHand, controller: "enemy", origin, ability: 0, node: null, subject: enemyFront }];
    const player = view(state, "player", catalog);
    expect(player.floating.map((effect) => effect.id)).toEqual(["e2"]);
    expect(player.triggerQueue).toEqual([{ controller: "enemy", source: null, origin: null, ability: 0, node: null, subject: enemyFront }]);
    const enemy = view(state, "enemy", catalog);
    expect(enemy.floating.map((effect) => effect.id)).toEqual(["e2", "e3"]);
    expect(enemy.triggerQueue[0]?.source).toBe(enemyHand);
    expect(JSON.stringify(player)).not.toContain(v.event0.id);
  });

  it("hides a queued trigger's subject from a side that could not identify it as it triggered, even once it is public, across a reload", () => {
    const { state } = fixture();
    const enemyFront = state.sides.enemy.frontRank[0]!;
    const [discarded] = state.sides.enemy.hand;
    // The enemy drew `discarded` with a public trigger watching, then discarded it into its void.
    state.sides.enemy.hand = state.sides.enemy.hand.filter((id) => id !== discarded);
    state.sides.enemy.void.push(discarded);
    state.instances[discarded].zone = "void";
    const origin = { kind: "card" as const, cardId: cardIdOf(state, enemyFront), variant: { amplified: false } };
    state.triggerQueue = [
      { source: enemyFront, controller: "enemy", origin, ability: 0, node: null, subject: discarded, subjectHiddenFrom: ["player"] },
      { source: enemyFront, controller: "enemy", origin, ability: 0, node: null, subject: "i999" },
    ];
    const reloaded = deserializeState(serializeState(state));
    for (const shown of [state, reloaded]) {
      expect(view(shown, "player", catalog).triggerQueue.map((trigger) => trigger.subject)).toEqual([null, null]);
      expect(view(shown, "enemy", catalog).triggerQueue.map((trigger) => trigger.subject)).toEqual([discarded, null]);
      expect(view(shown, "player", catalog).triggerQueue[0]?.source).toBe(enemyFront);
    }
  });

  it("shows figments and figment copies by their printing with their effective characteristics, and keeps a card created in a hand private", () => {
    const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { back: [v.vanilla1.id], hand: [ZONE.handEcho.id], energy: 1 } });
    const figment = placeFigment(state, "player", { rank: "back", index: 1 }, { kind: "figment", figment: ZONE_FIGMENT.legion.id, spark: 1 });
    const copy = placeFigment(state, "player", { rank: "back", index: 2 }, { kind: "figmentCopy", cardId: v.vanilla3.id, spark: 0 });
    for (const viewer of SIDES) {
      const seen = view(state, viewer, catalog);
      expect(seen.instances[figment]).toMatchObject({ printing: { kind: "figment", figment: ZONE_FIGMENT.legion.id, spark: 1 }, characteristics: { subtype: "Warrior", spark: 3, cost: 0 } });
      expect(seen.instances[copy]).toMatchObject({ printing: { kind: "figmentCopy", cardId: v.vanilla3.id, spark: 0 }, characteristics: { spark: 0, cost: 3 } });
    }
    const engine = createEngine(catalog);
    const { state: after, events } = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([[ids.player.back[0]!]]));
    const created = events.find((event) => event.kind === "cardCreated");
    expect(created).toMatchObject({ zone: "hand", side: "player" });
    expect(created !== undefined && eventVisibleTo(created, "enemy", after)).toBe(false);
    expect(created !== undefined && eventVisibleTo(created, "player", after)).toBe(true);
  });
});

describe("knowledge", () => {
  /** The player holds Foresee 2 over a three-card deck; the enemy cannot respond. */
  function foreseeBoard() {
    return boardState(catalog, {
      active: "player",
      phase: "day",
      player: { hand: [p.foresee.id], deck: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id] },
      enemy: { deck: [v.vanilla5.id] },
    });
  }

  it("shows the cards of a privateTo prompt to its chooser only, who keeps knowing where they went", () => {
    const { state, ids } = foreseeBoard();
    const [top, second] = ids.player.deck;
    const engine = createEngine(catalog);
    let checked = false;
    const source = new InlineSource({
      player: (prompt: Prompt, work: BattleState): ArrangeAnswer => {
        expect(view(work, "player", catalog).sides.player.deck.known).toEqual([{ id: top, index: 0 }, { id: second, index: 1 }]);
        expect(view(work, "enemy", catalog).sides.player.deck.known).toEqual([]);
        expect(promptView(prompt, "player", work)).toEqual(prompt);
        const redacted = strings(promptView(prompt, "enemy", work));
        expect(redacted.has(top) || redacted.has(second)).toBe(false);
        expect(strings(view(work, "enemy", catalog)).has(top)).toBe(false);
        checked = true;
        return [{ card: top, to: "top" }, { card: second, to: "void" }];
      },
      enemy: () => {
        throw new Error("the enemy has no prompt");
      },
    });
    const { state: after } = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, source);
    expect(checked).toBe(true);
    expect(after.sides.player.void).toContain(second);
    expect(view(after, "player", catalog).sides.player.deck.known).toEqual([{ id: top, index: 0 }]);
    expect(view(after, "enemy", catalog).sides.player.deck.known).toEqual([]);
    // A determinization keeps the known card where the chooser put it.
    const random = new PolicyRandom(battleSeed("knowledge-determinize"));
    const decklists = { player: [p.foresee.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id].map((cardId) => ({ cardId })), enemy: [{ cardId: v.vanilla5.id }] };
    const sampled = determinize(view(after, "player", catalog), decklists, () => random.next(), catalog);
    expect(sampled.sides.player.deck[0]).toBe(top);
    expect(sampled.instances[top]?.printing).toEqual(after.instances[top]?.printing);
  });

  it("makes the other side lose track of deck cards a privateTo prompt shows the chooser", () => {
    const { state, ids } = foreseeBoard();
    const [top, second] = ids.player.deck;
    state.knownTo.enemy = [top];
    expect(view(state, "enemy", catalog).sides.player.deck.known).toEqual([{ id: top, index: 0 }]);
    const engine = createEngine(catalog);
    const { state: after } = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([[{ card: second, to: "top" }, { card: top, to: "top" }]]));
    expect(after.sides.player.deck.slice(0, 2)).toEqual([second, top]);
    expect(view(after, "enemy", catalog).sides.player.deck.known).toEqual([]);
    expect(view(after, "player", catalog).sides.player.deck.known).toEqual([{ id: second, index: 0 }, { id: top, index: 1 }]);
  });

  it("makes a card revealed from a hand known to both sides while it stays there", () => {
    const { state, ids } = boardState(catalog, {
      active: "player",
      phase: "day",
      player: { back: [STACK.revealWarrior.id], hand: [v.event1.id, v.vanilla1.id], deck: [v.vanilla2.id] },
      enemy: { hand: [v.interruptEvent.id], energy: 5, deck: [v.vanilla2.id] },
    });
    const warrior = ids.player.hand[1];
    expect(view(state, "enemy", catalog).sides.player.hand.known).toEqual([]);
    const { state: after } = createEngine(catalog).apply(state, "player", { kind: "activate", source: ids.player.back[0]!, ability: 0 }, NO_PROMPTS);
    expect(view(after, "enemy", catalog).sides.player.hand.known).toEqual([{ id: warrior, index: 1 }]);
    expect(view(after, "enemy", catalog).instances[warrior]).toMatchObject({ zone: "hand", controller: "player" });
    expect(strings(view(after, "enemy", catalog)).has(ids.player.hand[0])).toBe(false);
  });

  it("hides the cards and source of another side's prompt that the viewer cannot identify", () => {
    const { state } = fixture();
    const [first, second] = state.sides.enemy.hand;
    const prompt: Prompt = {
      kind: "chooseCards",
      side: "enemy",
      purpose: { source: first, cardId: cardIdOf(state, first), ability: 0, role: "discard" },
      cancellable: false,
      candidates: [first, second],
      min: 1,
      max: 1,
    };
    expect(promptView(prompt, "enemy", state)).toEqual(prompt);
    expect(promptView(prompt, "player", state)).toEqual({ ...prompt, purpose: { ...prompt.purpose, source: null, cardId: null }, candidates: [] });
    state.knownTo.player = [second];
    expect(promptView(prompt, "player", state)).toMatchObject({ candidates: [second] });
  });

  it("shows every viewer the emblem whose ability raised another side's prompt", () => {
    const { state } = fixture();
    const [first, second] = state.sides.enemy.hand;
    const prompt: Prompt = {
      kind: "chooseCards",
      side: "enemy",
      purpose: { source: { kind: "dreamsign", side: "enemy", index: 0, id: DREAMSIGN.points.id }, cardId: null, ability: 0, role: "discard" },
      cancellable: false,
      candidates: [first, second],
      min: 1,
      max: 1,
    };
    expect(promptView(prompt, "player", state)).toEqual({ ...prompt, candidates: [] });
  });
});
