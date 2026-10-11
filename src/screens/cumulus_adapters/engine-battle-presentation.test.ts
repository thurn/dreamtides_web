// The battle screen's presentation of engine events as a whole: seeded
// fuzz games presented forward and only to those who may see them, every
// event kind logged or presented as its presentation names, and the queue
// that plays the items. The items themselves are in
// engine-battle-presentation-items.test.ts and
// engine-battle-presentation-screen.test.ts, and the battle log in
// engine-battle-presentation-log.test.ts.
import { describe, expect, it, vi } from "vitest";
import { PresentationQueue } from "../../battle/components/battle-presentation";
import {
  enqueuePresentation,
  EVENT_PRESENTATION,
  presentationItems,
  presentedAsItem,
  type PresentationItem,
} from "../../battle/components/presentation-items";
import { BATTLE } from "../../content/battle";
import { createEngine, type BattleState, type BattleView, type EngineEvent, type EngineEventKind, type InstanceView } from "../../engine";
import type { Keyword } from "../../engine/dsl/types";
import { EVENT_DEFINITIONS, eventSeenBy } from "../../engine/events";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { LOOP } from "../../engine/testing/loop-cards";
import { fuzzEngineCatalog, SYNTHETIC_FUZZ_POOL } from "../../engine/testing/fuzz";
import { PROMPT_LAB_FIXTURES } from "../../engine/testing/prompt-lab";
import { battleSeed, SIDES, type InstanceId } from "../../engine/state/ids";
import { engineBattleLogText } from "../../runtime/battle-prompt-messages";
import {
  parseDreamwellCardId,
  parsePresentationId as pid,
} from "../../types/identifiers";
import {
  boardRewinds,
  hiddenInformationLeaks,
  observationViolations,
  presentObserved,
  recordFuzzGame,
  replayObservedBatches,
  type ObservedBatch,
} from "./__test-helpers__/presentation-checks";
import { engineStatuses } from "./engine-battle-view-model";
import { labEngine, observedBoard, steps } from "./engine-battle-presentation.fixtures";

let queueState: BattleState | null = null;
/** A bare queue item; every item shares one batch state, which the queue never reads. */
function queueItem(
  key: string,
  presentation: PresentationItem["presentation"],
  notice: PresentationItem["notice"] = null,
  dwellMs: number = BATTLE.presentation.eventDwellMs,
): PresentationItem {
  queueState ??= steps("present-zones")[0]?.after ?? null;
  if (queueState === null) throw new Error("no step");
  return { key: pid(key), presentation, dwellMs, visual: null, notice, batch: { key: pid(key), state: queueState } };
}

describe("presentation over seeded synthetic fuzz games", () => {
  it("moves every item's board forward, observes within the limit and only at presented events, and shows each viewer only what it may see", () => {
    const engine = createEngine(fuzzEngineCatalog(SYNTHETIC_FUZZ_POOL));
    const { maxObservedEventStates } = BATTLE.presentation;
    const problems: string[] = [];
    const check = (batch: ObservedBatch, key: string) => {
      problems.push(...observationViolations(batch, maxObservedEventStates).map((problem) => `${key}: ${problem}`));
      for (const viewer of SIDES) {
        const presented = presentObserved(batch, viewer, `${key}:${viewer}`);
        problems.push(...boardRewinds(presented), ...hiddenInformationLeaks(engine, viewer, batch, presented.items));
      }
    };
    let batches = 0;
    for (let index = 0; index < 12; index += 1) {
      const game = recordFuzzGame(engine, battleSeed(`presentation-forward-${String(index)}`), SYNTHETIC_FUZZ_POOL);
      expect(game.ended).toBe(true);
      replayObservedBatches(engine, game, (batch) => {
        batches += 1;
        check(batch, `game${String(index)}:${String(batches)}`);
      });
    }
    // The games' intents present a dozen events at most; a long loop's repetitions run past the per-intent limit.
    const fixture = observedBoard({ active: "player", phase: "day", player: { hand: [LOOP.bouncer.id], deck: [SYNTHETIC.vanilla1.id] } }, engine);
    fixture.apply({ kind: "battleAction", side: "player", action: { kind: "play", card: fixture.ids.player.hand[0], from: "hand", slot: { rank: "back", index: 0 } } });
    const loop = fixture.slice().committed.loops.candidate;
    if (loop === null) throw new Error("no loop offer");
    const repeated = fixture.apply({ kind: "battleAction", side: "player", action: { kind: "repeatLoop", loop: loop.id, count: 40 } });
    check(repeated, "loop");

    expect(batches).toBeGreaterThan(12);
    expect(repeated.events.filter(presentedAsItem).length).toBeGreaterThan(maxObservedEventStates);
    expect(problems).toEqual([]);
  });
});

describe("presentation completeness", () => {
  /**
   * The event kinds the battle log never writes a line for, and why each is
   * shown another way or is bookkeeping. Every other kind must log a line.
   */
  const UNLOGGED: Readonly<Partial<Record<EngineEventKind, string>>> = {
    abilityResolved: "bookkeeping: the activation is logged",
    effectEnded: "its status badge clears",
    enteredVoid: "the move it pairs with is logged",
    exhaustionChanged: "the card's exhausted pose changes",
    feasibilityBounded: "bookkeeping of the AI's search",
    leftPlay: "the move it pairs with is logged",
    leftVoid: "the move it pairs with is logged",
    pendingAbility: "bookkeeping of a text-less card",
    phaseChanged: "the phase indicator changes",
    promptAutoAnswered: "a notice shows it",
    resolved: "the card travels; its effects are logged",
    triggerQueued: "its resolution is logged",
  };
  /**
   * The kinds of event the human sees that log a line and that present an
   * item, across the prompt lab's presentation steps for both humans, and a
   * Dreamwell draw the lab cannot publish.
   */
  const seen = () => {
    const logged = new Set<EngineEventKind>();
    const presented = new Set<EngineEventKind>();
    const see = (events: readonly EngineEvent[], human: "player" | "enemy", state: BattleState, items: readonly PresentationItem[], key: string) => {
      events.forEach((event, index) => {
        const shown = eventSeenBy(event, human, state);
        if (shown === null) return;
        if (engineBattleLogText(shown, { human, card: () => null, dreamwell: () => null })) logged.add(event.kind);
        if (items.some((item) => item.key === `${key}:${String(index)}`)) presented.add(event.kind);
      });
    };
    for (const fixture of PROMPT_LAB_FIXTURES) {
      for (const human of SIDES) {
        for (const step of steps(fixture.name, human)) see(step.published, human, step.after, step.items, step.batch.key);
      }
    }
    const state = steps("present-zones")[0]?.after;
    if (state === undefined) throw new Error("no step");
    const dreamwell: EngineEvent = { kind: "dreamwellDrawn", side: "enemy", card: parseDreamwellCardId("00000000-0000-4000-8000-00000000d001"), energyAdded: 1 };
    const batch = { key: pid("dreamwell"), state };
    see([dreamwell], "player", state, presentationItems([dreamwell], "player", batch, state, () => null), batch.key);
    return { logged, presented };
  };
  const kinds = Object.keys(EVENT_DEFINITIONS) as EngineEventKind[];

  it("logs a line for every event kind but the reasoned unlogged ones", () => {
    const { logged } = seen();
    expect(kinds.filter((kind) => !logged.has(kind)).sort()).toEqual(Object.keys(UNLOGGED).sort());
  });

  it("presents an item for every event kind its presentation names one for", () => {
    const itemized = kinds.filter((kind) => EVENT_PRESENTATION[kind] !== "status" && EVENT_PRESENTATION[kind] !== "none");
    const { presented } = seen();
    expect(kinds.filter((kind) => presented.has(kind)).sort()).toEqual(itemized.sort());
  });

  /** A view of a lab board with its first player character changed by `change`, and that character. */
  const changedCharacter = (change: (instance: InstanceView) => InstanceView) => {
    const state = steps("present-status")[0]?.before;
    const id = state?.sides.player.backRank.find((entry) => entry !== null);
    if (state === undefined || id == null) throw new Error("no character");
    const view = labEngine.view(state, "player");
    const instance = view.instances[id];
    if (instance === undefined) throw new Error("no instance");
    const changed: BattleView = { ...view, instances: { ...view.instances, [id]: change(instance) } };
    return { view: changed, id };
  };
  const badgesOf = (view: BattleView, id: InstanceId) => engineStatuses(view, "player", () => []).cards.get(id) ?? [];

  it("badges every keyword a card has beyond its printed ones", () => {
    const keywords = Object.keys({
      vengeful: true,
      awakened: true,
      cannotBePrevented: true,
      cannotBeTargeted: true,
      veil: true,
      reclaim: true,
      offering: true,
    } satisfies Record<Keyword, true>) as Keyword[];
    const labels = keywords.map((keyword) => {
      const { view, id } = changedCharacter((instance) => ({ ...instance, characteristics: { ...instance.characteristics, keywords: [keyword] } }));
      const badges = badgesOf(view, id);
      expect({ keyword, kinds: badges.map((badge) => badge.kind) }).toEqual({ keyword, kinds: ["keyword"] });
      return badges[0]?.label ?? "";
    });
    expect(new Set(labels).size).toBe(keywords.length);
    expect(labels.every((label) => label.length > 0)).toBe(true);
  });

  it("badges active status flags, with exhaustion shown by the pose and historical play provenance unbadged", () => {
    const { view: plain, id } = changedCharacter((instance) => instance);
    const flags = (Object.keys(plain.instances[id]?.status ?? {}) as (keyof InstanceView["status"])[]).filter(
      (flag) => typeof plain.instances[id]?.status[flag] === "boolean",
    );
    const badged = flags.filter((flag) => {
      const { view } = changedCharacter((instance) => ({ ...instance, status: { ...instance.status, [flag]: true } }));
      const badges = badgesOf(view, id);
      return badges.length > 0 && badges.every((badge) => badge.label.length > 0);
    });
    expect(badgesOf(plain, id)).toEqual([]);
    expect(flags.filter((flag) => !badged.includes(flag))).toEqual(["exhausted", "playedViaReclaim"]);
  });
});

describe("presentation queue", () => {
  it("keeps the head, every turn, Dreamwell card, and score, the newest notice of each kind and newest reveals, and drops the oldest travels past the backlog cap", () => {
    const { maxQueuedReveals, maxBacklogMs, eventDwellMs } = BATTLE.presentation;
    const keptTravels = Math.floor(maxBacklogMs / eventDwellMs);
    const reveals = Array.from({ length: maxQueuedReveals + 2 }, (_unused, index) => queueItem(`reveal${String(index)}`, "reveal"));
    const travels = Array.from({ length: keptTravels + 2 }, (_unused, index) => queueItem(`travel${String(index)}`, "travel"));
    const queue = enqueuePresentation(
      [
        queueItem("head", "travel"),
        queueItem("turn", "turn"),
        queueItem("dreamwell", "dreamwell"),
        queueItem("score", "score"),
        queueItem("older-notice", "notice", { kind: "capacityReached", missing: 1 }),
      ],
      [...reveals, ...travels, queueItem("newer-notice", "notice", { kind: "capacityReached", missing: 2 })],
    );
    const keys: string[] = queue.map((entry) => entry.key);
    const keysOf = (items: readonly PresentationItem[]): string[] => items.map((entry) => entry.key);

    expect(keys[0]).toBe("head");
    expect(keys).toEqual(expect.arrayContaining(["turn", "dreamwell", "score", "newer-notice"]));
    expect(keys).not.toContain("older-notice");
    expect(keys.filter((key) => key.startsWith("reveal"))).toEqual(keysOf(reveals.slice(-maxQueuedReveals)));
    expect(keys.filter((key) => key.startsWith("travel"))).toEqual(keysOf(travels.slice(-keptTravels)));
  });

  it("plays queued items in order, each for its dwell, raising each notice as it is presented", () => {
    vi.useFakeTimers();
    try {
      const queue = new PresentationQueue();
      const heads: (string | null)[] = [];
      queue.subscribe(() => heads.push(queue.snapshot().queue[0]?.key ?? null));
      queue.enqueue([queueItem("a", "travel", null, 100), queueItem("b", "notice", { kind: "capacityReached", missing: 1 }, 100)]);
      vi.advanceTimersByTime(50);
      queue.enqueue([queueItem("c", "travel", null, 100)]);
      vi.advanceTimersByTime(100);
      expect(queue.snapshot().notice?.key).toBe("b");
      vi.advanceTimersByTime(200);

      expect(heads.filter((key, index) => heads[index - 1] !== key)).toEqual(["a", "b", "c", null]);
      expect(queue.snapshot().queue).toEqual([]);
      queue.dismissNotice();
      expect(queue.snapshot().notice).toBeNull();
      queue.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
