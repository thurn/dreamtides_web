import { describe, expect, it } from "vitest";
import { createEngine } from "../../../engine";
import { staticAbility } from "../../../dsl/builders";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { preventCard } from "../../../rules/stack";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES, type CardId, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState, DeckEntry } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { STACK, STACK_CARDS } from "../../../testing/stack-cards";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { reclaimNotBanished } from "../reclaim-not-banished";

const keeper = { ...v.vanilla1, id: syntheticId(0x55101), abilities: () => [staticAbility(reclaimNotBanished())] };
const failAfterPrevent = {
  ...STACK.preventToDeckBottom,
  id: syntheticId(0x55102),
  abilities: () => [],
  synthetic: { resolve(ctx: Parameters<typeof preventCard>[0], item: { instance: InstanceId; controller: Side }) {
    const target = ctx.state.stack.find((entry) => entry.kind === "card" && entry.instance !== item.instance);
    if (target?.kind !== "card") throw new Error("fixture needs a stacked target");
    preventCard(ctx, target.instance, "deckBottom", item.controller);
    throw new Error("fixture failure after Prevent");
  } },
};
const catalog = testCatalog([...STACK_CARDS, keeper, failAfterPrevent]);
const engine = createEngine(catalog);
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id];
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Unexpected intent outcome ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

function setup(preventer: Side, owner: Side, targetCard: CardId = v.event0.id, covered: Side | null = null) {
  const actor = opponent(preventer);
  const { state, ids } = boardState(catalog, {
    active: actor, phase: "day",
    player: { hand: [], deck, energy: 3, back: covered === "player" ? [keeper.id] : [] },
    enemy: { hand: [], deck, energy: 3, back: covered === "enemy" ? [keeper.id] : [] },
    [owner]: { hand: [targetCard], deck, energy: 3, back: covered === owner ? [keeper.id] : [] },
  });
  const target = ids[owner].hand[0];
  state.sides[owner].hand = [];
  state.sides[actor].hand.push(target);
  state.instances[target].controller = actor;
  // A separate physical source, including when the target's owner is the preventer.
  const sourceBoard = boardState(catalog, { active: actor, phase: "day", [preventer]: { hand: [STACK.preventToDeckBottom.id] } });
  const source: InstanceId = `i${state.nextInstance++}`;
  state.instances[source] = { ...sourceBoard.state.instances[sourceBoard.ids[preventer].hand[0]], id: source };
  state.sides[preventer].hand.push(source);
  const lists = Object.fromEntries(SIDES.map((side) => [side,
    Object.values(state.instances).filter((card) => card.owner === side && card.printing.kind === "card")
      .map((card): DeckEntry => ({ cardId: card.printing.kind === "card" ? card.printing.cardId : v.event0.id })),
  ])) as Record<Side, DeckEntry[]>;
  return { state, ids, actor, owner, preventer, target, source, lists };
}

function play(fixture: ReturnType<typeof setup>) {
  const first = engine.apply(fixture.state, fixture.actor, { kind: "play", card: fixture.target, from: "hand" }, NO_PROMPTS);
  const second = engine.apply(first.state, fixture.preventer, { kind: "play", card: fixture.source, from: "hand" }, NO_PROMPTS);
  expect(invariantViolations(second.state, catalog)).toEqual([]);
  expect(unannouncedChanges(second.events, first.state, second.state)).toEqual([]);
  return { ...second, before: first.state };
}

describe("Prevent to the bottom of the owner's deck", () => {
  for (const preventer of SIDES) for (const owner of SIDES) {
    it(`appends for preventer ${preventer} and owner ${owner}, exposing only the public target's position`, () => {
      const fixture = setup(preventer, owner);
      const { state, events } = play(fixture);
      const original = fixture.ids[owner].deck;
      expect(state.sides[owner].deck).toEqual([...original, fixture.target]);
      expect(state.sides[opponent(owner)].deck).toEqual(fixture.ids[opponent(owner)].deck);
      expect(state.instances[fixture.target]).toMatchObject({ owner, controller: owner, zone: "deck" });
      expect(state.stack).toEqual([]);
      expect(events).toContainEqual({ kind: "prevented", instance: fixture.target, side: fixture.actor, to: "deck", zoneOf: owner });
      expect(events.some((event) => event.kind === "resolved" && event.instance === fixture.target)).toBe(false);
      for (const viewer of SIDES) {
        const seen = engine.view(state, viewer);
        expect(seen.sides[owner].deck).toEqual({ count: original.length + 1, known: [{ id: fixture.target, index: original.length }] });
        for (const hidden of [...original, ...fixture.ids[opponent(owner)].deck]) expect(seen.instances[hidden]).toBeUndefined();
        const sampled = engine.determinize(seen, fixture.lists, () => 0.31);
        expect(sampled.sides[owner].deck[sampled.sides[owner].deck.length - 1]).toBe(fixture.target);
        expect(engine.view(sampled, viewer).sides[owner].deck).toEqual(seen.sides[owner].deck);
      }
      expect(determinizationDivergences(engine, state, fixture.lists, battleSeed("prevent-bottom"), 0)).toEqual([]);
      const restored = deserializeState(serializeState(state));
      expect(stateHash(restored)).toBe(stateHash(state));
      for (const side of SIDES) expect(createEngine(catalog).view(restored, side)).toEqual(engine.view(state, side));
    });
  }

  it("distinguishes bottom placement from top placement in a nonempty deck", () => {
    const fixture = setup("enemy", "player", v.vanilla1.id);
    const bottom = play(fixture).state;
    const topFixture = setup("enemy", "player", v.vanilla1.id);
    topFixture.state.instances[topFixture.source] = { ...topFixture.state.instances[topFixture.source], printing: { kind: "card", cardId: STACK.preventCharacterToDeck.id } };
    const top = play(topFixture).state;
    expect(bottom.sides.player.deck).toEqual([...fixture.ids.player.deck, fixture.target]);
    expect(top.sides.player.deck).toEqual([topFixture.target, ...topFixture.ids.player.deck]);
    expect(bottom.sides.player.backRank.every((slot) => slot === null)).toBe(true);
  });

  it.each(SIDES)("retains each viewer's existing known deck positions for %s", (owner) => {
    const fixture = setup(opponent(owner), owner);
    const known = fixture.ids[owner].deck[1];
    fixture.state.knownTo.player.push(known);
    const { state } = play(fixture);
    expect(engine.view(state, "player").sides[owner].deck.known).toEqual([
      { id: known, index: 1 }, { id: fixture.target, index: fixture.ids[owner].deck.length },
    ]);
    expect(engine.view(state, "enemy").sides[owner].deck.known).toEqual([
      { id: fixture.target, index: fixture.ids[owner].deck.length },
    ]);
  });

  it.each(SIDES)("applies created and reclaimed precedence for %s", (owner) => {
    for (const created of [false, true]) for (const reclaimed of [false, true]) {
      const fixture = setup(opponent(owner), owner);
      Object.assign(fixture.state.instances[fixture.target].status, { created, reclaimed });
      const { state, events } = play(fixture);
      const to = created ? null : reclaimed ? "banished" : "deck";
      expect(events).toContainEqual({ kind: "prevented", instance: fixture.target, side: owner, to, zoneOf: created ? null : owner });
      expect(state.sides[owner].deck).toEqual(created || reclaimed ? fixture.ids[owner].deck : [...fixture.ids[owner].deck, fixture.target]);
      if (created) expect(state.instances[fixture.target]).toBeUndefined();
      else expect(state.instances[fixture.target].zone).toBe(to);
    }
  });

  it.each(SIDES)("uses the owner's reclaimed protection for %s", (owner) => {
    for (const covered of SIDES) {
      const fixture = setup(owner, owner, v.event0.id, covered);
      fixture.state.instances[fixture.target].status.reclaimed = true;
      const { state } = play(fixture);
      expect(state.instances[fixture.target].zone).toBe(covered === owner ? "deck" : "banished");
      expect(state.sides[owner].deck).toEqual(covered === owner ? [...fixture.ids[owner].deck, fixture.target] : fixture.ids[owner].deck);
    }
  });

  it("offers no response to an unpreventable card", () => {
    const fixture = setup("enemy", "player", STACK.unpreventableDraw.id);
    const { state, events } = engine.apply(fixture.state, fixture.actor, { kind: "play", card: fixture.target, from: "hand" }, NO_PROMPTS);
    expect(state.stack).toEqual([]);
    expect(state.sides.enemy.hand).toContain(fixture.source);
    expect(events.some((event) => event.kind === "prevented")).toBe(false);
  });

  it("leaves an already-prevented target alone when a lower Prevent resolves", () => {
    const fixture = setup("enemy", "player");
    const duplicate: InstanceId = `i${fixture.state.nextInstance++}`;
    fixture.state.instances[duplicate] = { ...fixture.state.instances[fixture.source], id: duplicate, zone: "stack" };
    for (const id of [fixture.target, fixture.source]) {
      const instance = fixture.state.instances[id];
      fixture.state.sides[instance.controller].hand = fixture.state.sides[instance.controller].hand.filter((card) => card !== id);
      instance.zone = "stack";
    }
    fixture.state.stack = [fixture.target, fixture.source, duplicate].map((id) => ({ kind: "card", instance: id, controller: fixture.state.instances[id].controller,
      choices: id === fixture.target ? [] : [{ modes: [], targets: [[fixture.target]] }], x: null, optionalPaid: [] }));
    fixture.state.priority = "player";
    const { state, events } = engine.apply(fixture.state, "player", { kind: "pass" }, NO_PROMPTS);
    expect(state.sides.player.deck).toEqual([...fixture.ids.player.deck, fixture.target]);
    expect(events.filter((event) => event.kind === "prevented")).toHaveLength(1);
    expect(events).toContainEqual({ kind: "noLegalTarget", source: fixture.source });
  });

  it("replays a saved pending target choice, rejects another actor and stale answers, and cancels without a deck move", () => {
    const fixture = setup("enemy", "player");
    const secondTarget = fixture.ids.player.deck[0];
    fixture.state.sides.player.deck.shift();
    fixture.state.sides.player.hand = [];
    for (const id of [fixture.target, secondTarget]) {
      fixture.state.instances[id].zone = "stack";
      fixture.state.stack.push({ kind: "card", instance: id, controller: "player", choices: [], x: null, optionalPaid: [] });
    }
    fixture.state.priority = "enemy";
    const fold = createFoldAdapter(engine);
    const intent = { kind: "battleAction", side: "enemy", action: { kind: "play", card: fixture.source, from: "hand" } } as const;
    const opened = applied(fold.reduce(sliceOf(fixture.state), intent));
    const pending = fold.pending(opened);
    if (pending === null) throw new Error("fixture needs a non-forced target prompt");
    const reloaded = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const fresh = createFoldAdapter(createEngine(catalog));
    expect(fresh.pending(reloaded)?.prompt).toEqual(pending.prompt);
    const answer = { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [fixture.target] } as const;
    expect(fold.reduce(opened, { ...answer, side: "player" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(opened, { ...answer, value: [fixture.source] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side: "enemy", promptId: pending.prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(fixture.state));
    const reopened = applied(fold.reduce(cancelled, intent));
    expect(fold.reduce(reopened, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const settled = applied(fresh.reduce(reloaded, answer));
    expect(settled.committed.sides.player.deck[settled.committed.sides.player.deck.length - 1]).toBe(fixture.target);
    expect(stateHash(settled.committed)).toBe(stateHash(applied(fold.reduce(opened, answer)).committed));
    const save = { mode: { kind: "journey" }, init: { battleId: "battle-1", siteId: "site-1", nodeId: null, completionLevelAtStart: 0,
      essenceReward: 0, opponentAbilityActive: false, enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
      avatarSummary: null, cardDefinitions: [] }, engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: settled } };
    expect(parseJourneyBattleFoldState(JSON.parse(JSON.stringify(save)) as Record<string, unknown>)).not.toBeNull();
  });

  it("publishes no destination mutation if a resolution fails after Prevent", () => {
    const fixture = setup("enemy", "player");
    fixture.state.instances[fixture.source] = { ...fixture.state.instances[fixture.source], printing: { kind: "card", cardId: failAfterPrevent.id } };
    const first = engine.apply(fixture.state, "player", { kind: "play", card: fixture.target, from: "hand" }, NO_PROMPTS);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const failed = fold.reduce(sliceOf(first.state), { kind: "battleAction", side: "enemy", action: { kind: "play", card: fixture.source, from: "hand" } });
    if (failed.kind !== "applied" || failed.error === null) throw new Error("fixture must fail after Prevent");
    expect(failed.error.message).toMatch(/after Prevent/);
    expect(failed.slice.committed.sides.player.deck).toEqual(fixture.ids.player.deck);
    expect(failed.slice.committed.instances[fixture.target].zone).toBe("stack");
    expect(failed.published.some((event) => event.kind === "prevented")).toBe(false);
  });
});
