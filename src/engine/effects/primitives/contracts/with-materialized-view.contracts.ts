/**
 * What each side sees of a `withMaterialized` cohort: identified members by
 * instance, hidden members by owner and printing, and nothing of a cohort
 * whose source it cannot see; determinizations keep the membership, so a
 * sampled hidden member that returns to play is banished as the real one is.
 */
import { describe, expect, it } from "vitest";
import { BASE_VARIANT } from "../../../dsl/types";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { PolicyRandom } from "../../../policy/random";
import { battleSeed, SIDES, type InstanceId } from "../../../state/ids";
import type { BattleState, Printing } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import { comparableView, determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { redactionViolations } from "../../../testing/redaction";
import type { BattleView } from "../../../view/view";
import { v } from "./cards-support";
import { banished, capturedOf, decklists, engine, F, handCard, play, setup, triggerOf, zone } from "./with-materialized-support";

const printed = (cardId: (typeof v)[keyof typeof v]["id"]): Printing => ({ kind: "card", cardId });

/**
 * `viewer`'s determinization of `state`, drawing from a stream seeded by
 * `seed`, after checking it reads back as the same view and agrees with
 * `state`.
 */
function sample(state: BattleState, viewer: "player" | "enemy", seed: number = 0): BattleState {
  expect(determinizationDivergences(engine, state, decklists(state), battleSeed("captured"), seed)).toEqual([]);
  const seen = engine.view(state, viewer);
  const random = new PolicyRandom(battleSeed(`captured-sample|${String(seed)}`));
  const sampled = engine.determinize(JSON.parse(JSON.stringify(seen)) as BattleView, decklists(state), () => random.next());
  expect(comparableView(engine.view(sampled, viewer))).toEqual(comparableView(seen));
  expect(invariantViolations(sampled, engine.catalog)).toEqual([]);
  return sampled;
}

/** The printings of `ids` in `state`, sorted, for comparing a sample with the real battle. */
const printings = (state: BattleState, ids: readonly InstanceId[]): string[] => ids.map((id) => JSON.stringify(state.instances[id]?.printing)).sort();

describe("withMaterialized views", () => {
  it("shows a hidden member by owner and printing, and a sampled stand-in returning to play is banished as the real one", () => {
    const { state, ids } = setup({
      hand: [F.raise.id, F.hide.id, F.unearth.id, F.draw.id],
      void: [v.vanilla1.id, v.vanilla2.id],
      deck: [v.event0.id, v.event1.id, v.event0.id],
    });
    const [hidden, shown] = ids.player.void;
    const raised = play(state, handCard(state, F.raise)).state;
    for (const viewer of SIDES) expect(capturedOf(engine.view(raised, viewer).floating[0])).toEqual([hidden, shown]);
    const shuffled = play(raised, handCard(raised, F.hide), new ScriptedSource([[hidden], [hidden]])).state;
    expect(zone(shuffled, hidden)).toBe("deck");
    expect(capturedOf(triggerOf(shuffled))).toEqual([hidden, shown]);
    for (const viewer of SIDES) {
      expect(capturedOf(engine.view(shuffled, viewer).floating[0])).toEqual([{ member: 0, owner: "player", printing: printed(v.vanilla1.id), variant: BASE_VARIANT }, shown]);
    }
    expect(redactionViolations(shuffled, engine.catalog)).toEqual([]);
    expect(sample(shuffled, "enemy")).toBeDefined();

    // The player's sample deals a stand-in for the hidden member; unearthing and drawing then banish both members in each.
    for (const seed of [0, 1, 2]) {
      const sampled = sample(shuffled, "player", seed);
      const change = triggerOf(sampled).change;
      const standIn = change.kind === "trigger" ? change.captured?.[0] : undefined;
      if (standIn === undefined) throw new Error("the sample kept no stand-in");
      expect(sampled.instances[standIn]).toMatchObject({ owner: "player", zone: "deck", printing: printed(v.vanilla1.id) });
      const outcomes = [shuffled, sampled].map((battle) => {
        const unearthed = play(battle, handCard(battle, F.unearth)).state;
        const fired = play(unearthed, handCard(unearthed, F.draw));
        return { fired, gone: printings(fired.state, banished(fired.events)), board: printings(fired.state, fired.state.sides.player.backRank.flatMap((id) => (id === null ? [] : [id]))) };
      });
      const [real, simulated] = outcomes;
      expect(banished(real.fired.events)).toEqual([hidden, shown]);
      expect(banished(simulated.fired.events)).toEqual([standIn, shown]);
      expect(simulated.gone).toEqual(real.gone);
      expect(simulated.board).toEqual(real.board);
    }

    // An announcement naming a captured card a side cannot identify omits it for that side.
    const effect = triggerOf(shuffled);
    const started: EngineEvent = { kind: "effectStarted", effect: effect.id, controller: "player", source: effect.source, expiry: effect.expiry, change: effect.change };
    for (const viewer of SIDES) {
      const seen = eventSeenBy(started, viewer, shuffled);
      expect(seen === null ? null : capturedOf(seen as { readonly change: typeof effect.change })).toEqual([shown]);
    }
  });

  it("keeps one stand-in per hidden member across a floating trigger and the trigger it queued", () => {
    const { state, ids } = setup({
      hand: [F.raiseFloating.id, F.hide.id, F.draw.id],
      void: [v.vanilla1.id, v.vanilla2.id],
      deck: [v.event0.id, v.event1.id, v.event0.id],
    });
    const [hidden, shown] = ids.player.void;
    const raised = play(state, handCard(state, F.raiseFloating)).state;
    const shuffled = play(raised, handCard(raised, F.hide), new ScriptedSource([[hidden], [hidden]])).state;
    const drawn = play(shuffled, handCard(shuffled, F.draw));
    const queued = drawn.observed.find((battle) => battle.triggerQueue.some((trigger) => trigger.captured !== undefined));
    if (queued === undefined) throw new Error("the floating trigger never waited in the queue");
    const member = { member: 0, owner: "player", printing: printed(v.vanilla1.id), variant: BASE_VARIANT };
    const seen = engine.view(queued, "enemy");
    expect(capturedOf(seen.floating[0])).toEqual([member, shown]);
    expect(seen.triggerQueue.find((trigger) => trigger.captured !== undefined)?.captured).toEqual([member, shown]);
    for (const seed of [0, 1, 2]) {
      const sampled = sample(queued, "enemy", seed);
      const [standIn] = capturedOf(triggerOf(sampled)) ?? [];
      expect(typeof standIn).toBe("string");
      expect(sampled.triggerQueue.find((trigger) => trigger.captured !== undefined)?.captured).toEqual([standIn, shown]);
    }
    expect(banished(drawn.events)).toEqual(zone(drawn.state, hidden) === "banished" ? [hidden, shown] : [shown]);
  });

  it("gives same-printing hidden members of separate cohorts separate stand-ins, each banished as in the battle", () => {
    const { state, ids } = setup({
      hand: [F.raise.id, F.kill.id, F.raise.id, F.hide.id, F.hide.id, F.unearth.id, F.draw.id],
      back: [v.vanilla1.id],
      void: [v.vanilla1.id],
      deck: [v.event0.id, v.event1.id, v.event0.id],
    });
    const [first] = ids.player.void;
    const second = ids.player.back[0]!;
    let battle = play(state, handCard(state, F.raise)).state;
    battle = play(battle, handCard(battle, F.kill), new ScriptedSource([[second]])).state;
    battle = play(battle, handCard(battle, F.raise)).state;
    expect(battle.floating.map(capturedOf)).toEqual([[first], [second]]);
    for (const id of [first, second]) battle = play(battle, handCard(battle, F.hide), new ScriptedSource([[id], [id]])).state;
    const shuffled = battle;
    const card = (member: number) => ({ member, owner: "player", printing: printed(v.vanilla1.id), variant: BASE_VARIANT });
    for (const viewer of SIDES) expect(engine.view(shuffled, viewer).floating.map(capturedOf)).toEqual([[card(0)], [card(1)]]);
    for (const seed of [0, 1, 2]) {
      const sampled = sample(shuffled, "player", seed);
      const standIns = sampled.floating.flatMap((effect) => capturedOf(effect) ?? []);
      expect(new Set(standIns).size).toBe(2);
      const outcomes = [shuffled, sampled].map((start) => {
        const unearthed = play(start, handCard(start, F.unearth)).state;
        const fired = play(unearthed, handCard(unearthed, F.draw));
        return { gone: banished(fired.events), printed: printings(fired.state, banished(fired.events)), board: fired.state.sides.player.backRank.filter((id) => id !== null) };
      });
      const [real, simulated] = outcomes;
      expect(real.gone).toEqual([first, second]);
      expect(simulated.gone).toEqual(standIns);
      expect(simulated.printed).toEqual(real.printed);
      expect(outcomes.map((outcome) => outcome.board)).toEqual([[], []]);
    }
  });

  it("stands in for a hidden amplified member with an amplified card, not a base copy of the same printing", () => {
    const { state, ids } = setup({
      hand: [{ cardId: v.vanilla1.id, amplified: true }, F.kill.id, F.raise.id, F.hide.id, F.unearth.id, F.draw.id],
      deck: [v.event0.id, v.vanilla1.id, v.event1.id],
    });
    const amplified = ids.player.hand[0];
    const base = ids.player.deck[1];
    let battle = play(state, amplified).state;
    battle = play(battle, handCard(battle, F.kill), new ScriptedSource([[amplified]])).state;
    battle = play(battle, handCard(battle, F.raise)).state;
    expect(capturedOf(triggerOf(battle))).toEqual([amplified]);
    const shuffled = play(battle, handCard(battle, F.hide), new ScriptedSource([[amplified], [amplified]])).state;
    expect([zone(shuffled, amplified), zone(shuffled, base)]).toEqual(["deck", "deck"]);
    expect(capturedOf(engine.view(shuffled, "player").floating[0])).toEqual([
      { member: 0, owner: "player", printing: printed(v.vanilla1.id), variant: { amplified: true } },
    ]);
    const variants = (battle: BattleState, cards: readonly (InstanceId | null)[]) =>
      cards.flatMap((id) => (id === null ? [] : [battle.instances[id]?.variant.amplified]));
    // Ten seeds deal the two copies in both orders.
    for (const seed of Array.from({ length: 10 }, (_, index) => index)) {
      const sampled = sample(shuffled, "player", seed);
      const [standIn] = capturedOf(triggerOf(sampled)) ?? [];
      expect(typeof standIn === "string" ? sampled.instances[standIn]?.variant : null).toEqual({ amplified: true });
      const [real, simulated] = [shuffled, sampled].map((start) => {
        const unearthed = play(start, handCard(start, F.unearth)).state;
        const fired = play(unearthed, handCard(unearthed, F.draw));
        return { gone: variants(fired.state, banished(fired.events)), board: variants(fired.state, fired.state.sides.player.backRank) };
      });
      expect(real).toEqual({ gone: [true], board: [false] });
      expect(simulated).toEqual(real);
    }
  });

  it("shows nothing of a cohort whose source is a card hidden in a hand, in floating state, queued state, and events", () => {
    const { state, ids } = setup({ hand: [F.draw.id, F.draw.id] }, { hand: [F.lurker.id], void: [v.vanilla1.id, v.vanilla2.id] });
    const lurker = ids.enemy.hand[0];
    const cohort = ids.enemy.void;
    expect(engine.view(state, "player").instances[lurker]).toBeUndefined();

    const first = play(state, ids.player.hand[0]);
    const effect = triggerOf(first.state);
    expect(effect).toMatchObject({ controller: "enemy", source: lurker });
    expect(capturedOf(effect)).toEqual(cohort);
    for (const id of cohort) expect(zone(first.state, id)).toBe("play");
    expect(engine.view(first.state, "player").floating).toEqual([]);
    expect(capturedOf(engine.view(first.state, "enemy").floating[0])).toEqual(cohort);
    const started = first.events.filter((entry) => entry.kind === "effectStarted");
    expect(started).toHaveLength(1);
    expect(eventSeenBy(started[0], "player", first.state)).toBeNull();
    expect(eventSeenBy(started[0], "enemy", first.state)).toEqual(started[0]);
    expect(redactionViolations(first.state, engine.catalog)).toEqual([]);
    for (const viewer of SIDES) sample(first.state, viewer);

    const second = play(first.state, ids.player.hand[1]);
    const queued = second.observed.find((battle) => battle.triggerQueue.some((trigger) => trigger.captured !== undefined));
    if (queued === undefined) throw new Error("the delayed trigger never waited in the queue");
    expect(queued.triggerQueue.find((trigger) => trigger.captured !== undefined)).toMatchObject({ source: lurker, captured: cohort });
    const [hiddenTo, seenBy] = [engine.view(queued, "player"), engine.view(queued, "enemy")];
    expect(hiddenTo.triggerQueue.find((trigger) => trigger.node !== null)).toMatchObject({ source: null, origin: null });
    expect(hiddenTo.triggerQueue.every((trigger) => trigger.captured === undefined)).toBe(true);
    expect(seenBy.triggerQueue.find((trigger) => trigger.node !== null)?.captured).toEqual(cohort);
    expect(redactionViolations(queued, engine.catalog)).toEqual([]);
    for (const viewer of SIDES) sample(queued, viewer);
    expect(banished(second.events)).toEqual(cohort);
  });
});
