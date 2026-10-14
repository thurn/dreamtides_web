/** Public effect announcements preserve visible expiry identities and recorded observer policy. */
import { describe, expect, it } from "vitest";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { battleLogEntries } from "../../../../screens/cumulus_adapters/engine-battle-log-view-model";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, all, characterYouControl, enemyCharacter, everyIn, self, target } from "../../../dsl/builders";
import type { Duration } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import type { EffectNode } from "../../types";
import * as p from "../index";

const friendly = all(characterYouControl());
const forms: readonly { readonly name: string; readonly make: (duration: Duration) => EffectNode; readonly count: number; readonly publicCard: boolean }[] = [
  { name: "loss", make: duration => p.loseAllAbilities(friendly, { duration }), count: 2, publicCard: true },
  { name: "cardCost", make: duration => p.sequence(
    p.modifyCardCost(p.returnToHand(all(characterYouControl({ another: true }))), { set: 0 }, { duration }),
    p.materialize(everyIn("hand")),
  ), count: 1, publicCard: true },
  { name: "namedPermission", make: duration => p.playFromZone("void", {}, { cards: everyIn("void"), duration }), count: 1, publicCard: true },
  { name: "reclaim", make: duration => p.grantReclaim(everyIn("void"), { duration }), count: 1, publicCard: true },
  { name: "targeting", make: duration => p.grant(friendly, "cannotBeTargeted", duration), count: 2, publicCard: true },
  { name: "combined", make: duration => p.disableTriggers(friendly, duration, null, "triggeredAndActivated"), count: 2, publicCard: true },
  { name: "cost", make: duration => p.costModifier("you", { cardType: "event" }, -1, { duration }), count: 1, publicCard: false },
  { name: "generalPermission", make: duration => p.playFromZone("void", {}, { duration }), count: 1, publicCard: false },
  { name: "restriction", make: duration => p.cannotPlay("opponent", { cardType: "event" }, { duration }), count: 1, publicCard: false },
  { name: "limit", make: duration => p.playLimitPerTurn(1, { duration }), count: 2, publicCard: false },
  { name: "handReturn", make: duration => p.banishChosen({}, duration === "whileSourceInPlay" ? duration : "untilEndOfTurn"), count: 1, publicCard: false },
  { name: "vengeful", make: duration => p.grant(friendly, "vengeful", duration), count: 2, publicCard: false },
  { name: "triggeredOnly", make: duration => p.disableTriggers(friendly, duration), count: 2, publicCard: false },
  { name: "returnToPlay", make: duration => p.banishUntil(all(enemyCharacter()), duration === "whileSourceInPlay" ? duration : "untilEndOfTurn"), count: 1, publicCard: false },
  { name: "baseSpark", make: duration => p.setBaseSpark(friendly, 5, duration), count: 2, publicCard: true },
  { name: "allTypes", make: duration => p.giveAllTypes(friendly, duration), count: 2, publicCard: true },
  { name: "observerSpark", make: duration => p.gainSpark(friendly, 2, duration), count: 2, publicCard: true },
];
const cases = forms.flatMap(form => SIDES.map(side => ({ ...form, side })));
const starts = (events: readonly EngineEvent[]) => events.filter((entry): entry is Extract<EngineEvent, { kind: "effectStarted" }> => entry.kind === "effectStarted");
const occupied = (id: InstanceId | null | undefined): InstanceId => {
  if (id == null) throw new Error("Expected public synthetic character");
  return id;
};
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Expected successful public fold");
  return outcome.slice;
}
function world(form: typeof forms[number], side: Side, lifecycle: "resident" | "hand" | "deck", duration: Duration = "whileSourceInPlay") {
  const movement = lifecycle === "resident" ? [] : [p.returnToHand(self()), ...(lifecycle === "deck" ? [p.shuffleInto([everyIn("hand")])] : [])];
  const source: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0xc4c001), status: "authored",
    abilities: () => [activated([], p.sequence(form.make(duration), ...movement))] };
  const engine = createEngine(testCatalog([source]));
  const w = boardState(engine.catalog, { active: side, phase: "day", [side]: {
    back: [source.id, v.vanilla3.id], void: [v.event0.id], deck: [v.vanilla5.id, v.vanilla3.id],
  }, [opponent(side)]: { back: [v.vanilla1.id], hand: [v.vanilla1.id, v.vanilla3.id] } });
  const sourceId = occupied(w.ids[side].back[0]);
  const answers = form.name === "handReturn" ? new ScriptedSource([[w.ids[opponent(side)].hand[0]]]) : NO_PROMPTS;
  const before = stateHash(w.state), done = engine.apply(w.state, side, { kind: "activate", source: sourceId, ability: 0 }, answers);
  if (answers instanceof ScriptedSource) answers.assertExhausted();
  expect(stateHash(w.state)).toBe(before);
  expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
  const events = starts(done.events);
  expect(events).toHaveLength(form.count);
  for (const entry of events) expect(entry.expiry).toEqual(duration === "permanent" ? { at: "never" } : { at: "sourceLeavesPlay", source: sourceId });
  return { ...w, engine, source: sourceId, done, events };
}
function project(w: ReturnType<typeof world>, viewer: Side, state = w.done.state, events = w.events) {
  const before = stateHash(state), eventBefore = JSON.stringify(events), view = w.engine.view(state, viewer);
  const projected = events.map(entry => eventSeenBy(entry, viewer, state));
  const log = battleLogEntries(events, viewer, state, view, w.engine.view(w.state, viewer), "privacy");
  expect(log.map(entry => entry.event)).toEqual(projected.filter(entry => entry !== null));
  expect(stateHash(state)).toBe(before);
  expect(JSON.stringify(events)).toBe(eventBefore);
  return { view, projected, log };
}

describe("retained effect expiry privacy", () => {
  it.each(cases)("omits hidden source-bound expiry for $name controlled by $side", form => {
    const w = world(form, form.side, "deck");
    expect(w.done.state.instances[w.source].zone).toBe("deck");
    expect(w.done.state.floating).toEqual([]);
    const restarted = deserializeState(serializeState(w.done.state));
    const transported = JSON.parse(JSON.stringify(w.events)) as typeof w.events;
    for (const viewer of SIDES) {
      const expected = form.name === "observerSpark" ? w.events : w.events.map(() => null);
      for (const [state, events] of [[w.done.state, w.events], [restarted, transported]] as const) {
        const seen = project(w, viewer, state, events);
        expect(seen.view.instances[w.source]).toBeUndefined();
        expect(seen.view.floating).toEqual([]);
        // A present null-source event still contains its hidden expiry identity; absence is the contract.
        expect(seen.projected).toEqual(expected);
        if (form.name !== "observerSpark") {
          expect(seen.log).toEqual([]);
          expect(JSON.stringify(seen.projected)).not.toContain(`"${w.source}"`);
        } else {
          expect(w.events.every(entry => entry.change.kind === "spark" && entry.sparkSeenBy?.length === 2)).toBe(true);
        }
      }
    }
  });

  it.each(cases)("preserves a visible live expiry and announcement for $name controlled by $side", form => {
    const w = world(form, form.side, "resident");
    expect(w.done.state.floating).toHaveLength(form.count);
    for (const viewer of SIDES) {
      const seen = project(w, viewer);
      expect(seen.view.instances[w.source]).toBeDefined();
      expect(seen.projected).toEqual(w.events);
      expect(seen.view.floating).toEqual(w.done.state.floating.map(({ id, controller, source, timestamp, expiry, change }) => ({ id, controller, source, timestamp, expiry, change })));
      expect(seen.log).toHaveLength(form.count);
      for (const entry of seen.log) expect(entry.event).toMatchObject({ kind: "effectStarted", source: w.source, expiry: { at: "sourceLeavesPlay", source: w.source } });
    }
  });

  it.each(cases)("preserves known returned-source observer decisions for $name controlled by $side", form => {
    const w = world(form, form.side, "hand");
    expect(w.done.state.instances[w.source].zone).toBe("hand");
    expect(w.done.state.floating).toEqual([]);
    for (const viewer of SIDES) {
      const seen = project(w, viewer);
      expect(seen.view.instances[w.source]).toBeDefined();
      const expected = w.events.map(entry => {
        if (viewer === form.side || form.name === "observerSpark") return entry;
        if (!form.publicCard || "instance" in entry.change && entry.change.instance === w.source) return null;
        return form.name === "combined" ? { ...entry, source: null } : entry;
      });
      expect(seen.projected).toEqual(expected);
    }
  });

  it.each(cases.filter(form => ["loss", "cardCost", "namedPermission", "reclaim", "targeting", "combined"].includes(form.name)))("preserves permanent public $name announcements after concealment for $side", form => {
      const w = world(form, form.side, "deck", "permanent");
      for (const viewer of SIDES) {
        const seen = project(w, viewer);
        expect(seen.view.instances[w.source]).toBeUndefined();
        const publicEvents = w.events.filter(entry => !("instance" in entry.change) || entry.change.instance !== w.source);
        expect(publicEvents).not.toHaveLength(0);
        for (const entry of publicEvents) expect(eventSeenBy(entry, viewer, w.done.state)).toEqual({ ...entry, source: null });
      }
    });

  it.each(SIDES)("restarts a completed public source departure without changing projections for %s", side => {
    const w = world(forms[0], side, "deck"), input = { init: {
      seed: "retained-expiry-privacy", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [],
    }, slice: slice(w.done.state) };
    const parsed = parseEngineBattleFold(JSON.parse(JSON.stringify(input)));
    if (parsed === null) throw new Error("Expected valid synthetic source-departure fold");
    const before = stateHash(w.done.state), intent = { kind: "battleAction", side, action: { kind: "pass" } } as const;
    const direct = createFoldAdapter(w.engine).reduce(input.slice, intent);
    const restarted = createFoldAdapter(w.engine).reduce(parsed.slice, intent);
    expect(restarted).toEqual(direct);
    const committed = applied(restarted).committed;
    for (const viewer of SIDES) expect(w.events.map(entry => eventSeenBy(entry, viewer, committed))).toEqual([null, null]);
    expect(stateHash(w.done.state)).toBe(before);
  });

  it.each(SIDES)("refuses invalid activation and target answers and restores a cancelled target choice for %s", side => {
    const source: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0xc4c002), status: "authored",
      abilities: () => [activated([], p.loseAllAbilities(target(characterYouControl()), { duration: "whileSourceInPlay" }))] };
    const engine = createEngine(testCatalog([source])), w = boardState(engine.catalog, { active: side, phase: "day",
      [side]: { back: [source.id, v.vanilla3.id] }, [opponent(side)]: { back: [v.vanilla1.id] } });
    const id = occupied(w.ids[side].back[0]), before = stateHash(w.state), fold = createFoldAdapter(engine), original = slice(w.state);
    expect(fold.reduce(original, { kind: "battleAction", side, action: { kind: "activate", source: id, ability: 99 } }))
      .toEqual({ kind: "bounced", reason: "illegalAction" });
    const opened = applied(fold.reduce(original, { kind: "battleAction", side, action: { kind: "activate", source: id, ability: 0 } }));
    const pending = fold.pending(opened);
    if (pending === null) throw new Error("Expected uncommitted public target choice");
    expect(pending.prompt).toMatchObject({ kind: "chooseTargets", side, cancellable: true });
    expect(fold.reduce(opened, { kind: "answer", side, promptId: pending.prompt.id, value: [occupied(w.ids[opponent(side)].back[0])] }))
      .toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const parsed = parseEngineBattleFold(JSON.parse(JSON.stringify({ init: {
      seed: "retained-expiry-choice", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [],
    }, slice: opened })));
    if (parsed === null) throw new Error("Expected valid pending synthetic fold");
    const restarted = createFoldAdapter(engine), answer = { kind: "answer", side, promptId: pending.prompt.id, value: [occupied(w.ids[side].back[1])] } as const;
    expect(restarted.pending(parsed.slice)?.prompt).toEqual(pending.prompt);
    expect(restarted.reduce(parsed.slice, answer)).toEqual(fold.reduce(opened, answer));
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(cancelled.inFlight).toBeNull();
    expect(stateHash(cancelled.committed)).toBe(before);
    expect(cancelled.committed.floating).toEqual([]);
    expect(stateHash(w.state)).toBe(before);
    const invalid = JSON.parse(JSON.stringify(parsed)) as { slice: { committed: { nextEffect: unknown } } };
    invalid.slice.committed.nextEffect = "invalid";
    expect(parseEngineBattleFold(invalid)).toBeNull();
  });
});
