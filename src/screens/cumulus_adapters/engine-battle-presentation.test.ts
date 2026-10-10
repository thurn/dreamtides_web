// The battle screen's presentation of engine events: the items each
// published batch becomes for the human, the queue that plays them, the
// visuals and statuses the screen model shows while they play, and the
// battle log built from what the human saw.
import { describe, expect, it, vi } from "vitest";
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { PresentationQueue } from "../../battle/components/battle-presentation";
import { enqueuePresentation, presentationItems, type PresentationItem } from "../../battle/components/presentation-items";
import { BATTLE } from "../../content/battle";
import { createEngine, type BattleState, type InstanceView } from "../../engine";
import { createCatalog } from "../../engine/catalog";
import { createFoldAdapter } from "../../engine/fold/slice";
import { fuzzEngineCatalog, fuzzInit, SYNTHETIC_FUZZ_POOL } from "../../engine/testing/fuzz";
import { PROMPT_LAB_DEFINITIONS, promptLabFixture, promptLabPresentation } from "../../engine/testing/prompt-lab";
import { battleSeed } from "../../engine/state/ids";
import type { CommittedEvent } from "../../eventlog/local-log";
import type { GameEvent } from "../../eventlog/types";
import type { JourneyBattleFoldState } from "../../rules/battle/fold";
import { engineBattleLogText } from "../../runtime/battle-prompt-messages";
import { testEventActor } from "../../types/test-identities";
import {
  parseBattleId,
  parseDreamwellCardId,
  parsePresentationId as pid,
  parseSiteId,
} from "../../types/identifiers";
import { battleLogEntries, battleLogTurns, engineBattleLog } from "./engine-battle-log-view-model";
import { buildEngineBattleScreenModel, engineStatuses, type EngineBattleScreenModel } from "./engine-battle-view-model";

const labEngine = createEngine(
  createCatalog(PROMPT_LAB_DEFINITIONS.cards, [], PROMPT_LAB_DEFINITIONS.emblems, PROMPT_LAB_DEFINITIONS.figments),
);
const cards = createEngineCardModels({ definitions: [], cards: new Map(), figment: () => undefined });

/** Each presentation step of a lab fixture, with its items for `human` and the view of the board after it. */
function steps(name: string, human: "player" | "enemy" = "player") {
  const fixture = promptLabFixture(name);
  if (fixture === null) throw new Error(`no fixture ${name}`);
  return promptLabPresentation(labEngine, fixture).map((step, index) => {
    const batch = { key: pid(`${name}:${String(index)}`), state: step.after };
    return { ...step, batch, items: presentationItems(step.published, human, batch, step.before, () => null) };
  });
}

/** The human's screen of `state` while `visual` is presented (`null`: everything presented). */
function labModel(
  state: BattleState,
  visual: PresentationItem["visual"],
  extra: Partial<Parameters<typeof buildEngineBattleScreenModel>[0]> = {},
): EngineBattleScreenModel {
  return buildEngineBattleScreenModel({
    battleId: parseBattleId("battle-presentation-fixture"),
    human: "player",
    view: labEngine.view(state, "player"),
    legal: [],
    prompt: null,
    playing: null,
    decision: null,
    presented: visual === null,
    notice: null,
    cards,
    avatars: { player: { avatar: null }, enemy: { avatar: null } },
    opponentName: "Fixture Opponent",
    essenceReward: 100,
    resultDismissed: false,
    visual: visual === null ? null : { key: pid("visual-key"), visual },
    ...extra,
  });
}

const boardIds = (model: EngineBattleScreenModel) =>
  [model.view.far, model.view.near].flatMap((side) => [
    ...side.backRank.flatMap((slot) => (slot.card === null ? [] : [slot.card.id])),
    ...side.frontRank.flatMap((slot) => (slot.card === null ? [] : [slot.card.id])),
    ...side.voidCards.map((card) => card.id),
  ]);

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

describe("presentation items", () => {
  it("reveals the opponent's play over the board before it, then holds the card off the board after it until it travels", () => {
    const [registered] = steps("present-opponent");
    const reveal = registered?.items[0];
    if (registered === undefined || reveal?.visual?.kind !== "reveal") throw new Error("no reveal");
    const played = registered.published.find((event) => event.kind === "cardPlayed");

    expect(reveal.presentation).toBe("reveal");
    expect(reveal.visual.instance).toBe(played?.kind === "cardPlayed" ? played.instance : null);
    expect(reveal.batch.state).toBe(registered.before);
    expect(reveal.batch.key).not.toBe(registered.batch.key);
    const revealedCard: InstanceView | null = labEngine.view(reveal.visual.after, "player").instances[reveal.visual.instance] ?? null;
    const during = labModel(registered.after, reveal.visual, { revealedCard });
    expect(during.view.playReveal?.card.id).toBe(reveal.visual.instance);
    expect(boardIds(during)).not.toContain(reveal.visual.instance);
    expect(boardIds(labModel(registered.after, null))).toContain(reveal.visual.instance);
  });

  it("travels the human's own play and never presents an event hidden from the human", () => {
    const [play, answer] = steps("present-zones");
    const dissolve = [...(play?.items ?? []), ...(answer?.items ?? [])];
    const challenge = steps("present-challenge")[1];
    if (challenge === undefined) throw new Error("no challenge");
    const draws = challenge.published.filter((event) => event.kind === "cardDrawn" && event.side === "enemy");
    const enemyBatch = { key: pid("draws"), state: challenge.after };

    expect(dissolve.some((item) => item.presentation === "reveal")).toBe(false);
    expect(dissolve[0]?.presentation).toBe("travel");
    expect(draws.length).toBeGreaterThan(0);
    expect(presentationItems(draws, "player", enemyBatch, challenge.before, () => null)).toEqual([]);
    expect(presentationItems(draws, "enemy", enemyBatch, challenge.before, () => null).length).toBe(draws.length);
  });

  it("scores a challenger in the turn it happens, then announces the new turn", () => {
    const challenge = steps("present-challenge")[1];
    if (challenge === undefined) throw new Error("no challenge");
    const scoreAt = challenge.items.findIndex((item) => item.presentation === "score");
    const turnAt = challenge.items.findIndex((item) => item.presentation === "turn");
    const score = challenge.items[scoreAt];
    const turn = challenge.items[turnAt];
    if (score?.visual?.kind !== "score" || turn === undefined) throw new Error("no score or turn");
    const during = labModel(score.batch.state, score.visual);

    expect(scoreAt).toBeLessThan(turnAt);
    expect(challenge.before.turn.active).toBe("player");
    expect(challenge.after.turn.active).toBe("enemy");
    expect(score.batch.key).not.toBe(challenge.batch.key);
    expect(during.view.activeSide).toBe("player");
    expect(during.cardOverlay).toMatchObject({ kind: "points-scored", battleCardId: score.visual.instance, points: score.visual.points });
    expect(turn.batch).toBe(challenge.batch);
    expect(labModel(turn.batch.state, null).view.activeSide).toBe("enemy");
  });

  it("notices the human's automatic answers and a trigger with no legal target, and never the opponent's", () => {
    const notices = (human: "player" | "enemy") =>
      steps("auto-target", human).flatMap((step) => step.items.flatMap((item) => (item.notice === null ? [] : [item.notice])));
    const noTarget = steps("present-zones")[1]?.items.find((item) => item.notice?.kind === "noLegalTarget");

    expect(notices("player")).toEqual([expect.objectContaining({ kind: "autoAnswered", prompt: "chooseTargets" })]);
    expect(notices("enemy")).toEqual([]);
    expect(noTarget?.presentation).toBe("notice");
  });

  it("shows a Dreamwell card beside its side while its reveal is presented", () => {
    const [first] = steps("present-zones");
    if (first === undefined) throw new Error("no step");
    const card = parseDreamwellCardId("00000000-0000-4000-8000-00000000d001");
    const dreamwell = {
      cardId: card,
      displaySnapshot: { id: card, name: "Fixture Dreamwell", renderedText: "", energyAdded: 1, imageNumber: 1 },
    };
    const model = labModel(first.after, { kind: "dreamwell", side: "enemy", card }, {
      dreamwellCard: (requested) => (requested === card ? dreamwell : null),
    });

    expect(model.view.dreamwell).toEqual({ side: "enemy", model: dreamwell });
  });

  it("marks durations, keywords, disabled triggers, payable effects, and side statuses, and clears them as they end", () => {
    const status = steps("present-status");
    const played = status[status.length - 2];
    const ended = status[status.length - 1];
    const exiled = steps("present-zones")[5];
    const reclaim = steps("reclaim")[0];
    if (played === undefined || ended === undefined || exiled === undefined || reclaim === undefined) throw new Error("no steps");
    const kinds = (state: BattleState) => {
      const marks = engineStatuses(labEngine.view(state, "player"), "player");
      return {
        cards: [...new Set([...marks.cards.values()].flat().map((badge) => badge.kind))].sort(),
        player: marks.sides.player.map((badge) => badge.kind),
        enemy: marks.sides.enemy.map((badge) => badge.kind),
        labels: [...marks.cards.values(), marks.sides.player, marks.sides.enemy].flat().every((badge) => badge.label.length > 0),
      };
    };

    expect(kinds(played.after)).toMatchObject({
      cards: ["duration", "keyword", "payable", "triggersDisabled"],
      player: ["delayedTrigger"],
      labels: true,
    });
    expect(kinds(ended.after)).toMatchObject({ cards: ["duration", "payable"], player: [] });
    expect(kinds(exiled.after).enemy).toEqual(["returns"]);
    expect(kinds(reclaim.after).player).toEqual(["exhausted"]);
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

describe("battle log", () => {
  it("writes a battle log line for what the human saw and none for what it could not see", () => {
    const entriesOf = (step: ReturnType<typeof steps>[number], key: string) =>
      battleLogEntries(
        step.published,
        "player",
        step.after,
        labEngine.view(step.after, "player"),
        labEngine.view(step.before, "player"),
        key,
      );
    const entries = steps("present-zones").flatMap((step, index) => entriesOf(step, `zones:${String(index)}`));
    const turns = battleLogTurns(entries, "player", cards, () => null);
    const lines = turns.flatMap((turn) => turn.lines);
    const logged = entries.filter(
      (entry) => engineBattleLogText(entry.event, { human: "player", card: () => null, dreamwell: () => null }) !== null,
    );
    const challenge = steps("present-challenge")[1];
    if (challenge === undefined) throw new Error("no challenge");
    const seenByPlayer = entriesOf(challenge, "c");

    expect(lines).toHaveLength(logged.length);
    expect(new Set(logged.map((entry) => entry.event.kind))).toEqual(
      new Set(["cardPlayed", "cardDrawn", "dissolved", "noLegalTarget", "banished", "effectStarted", "returnedToHand", "eroded", "cardCreated", "materialized", "controlChanged", "triggerResolved"]),
    );
    expect(lines.every((line) => line.text.length > 0)).toBe(true);
    expect(turns).toHaveLength(1);
    expect(seenByPlayer.some((entry) => entry.event.kind === "cardDrawn" && entry.event.side === "enemy")).toBe(false);
    expect(seenByPlayer.some((entry) => entry.event.kind === "laneResolved")).toBe(true);
  });

  describe("from the event log", () => {
    const siteId = parseSiteId("site-battle-log");
    const logEngine = () => createEngine(fuzzEngineCatalog(SYNTHETIC_FUZZ_POOL));

    /** A journey battle whose sides pass `passes` times, with the events that started and played it. */
    function passedBattle(engine: ReturnType<typeof logEngine>, passes: number) {
      const fold = createFoldAdapter(engine);
      const init = fuzzInit(battleSeed("battle-log"), SYNTHETIC_FUZZ_POOL);
      const events: CommittedEvent[] = [];
      const commit = (type: string, payload: Record<string, unknown>) => {
        const seq = events.length + 1;
        const event: GameEvent = {
          type: type as GameEvent["type"],
          payload,
          actor: testEventActor("p1"),
          clientTimestamp: "1970-01-01T00:00:00.000Z",
          basedOnSeq: seq - 1,
        };
        events.push({ seq, event });
      };
      commit("BEGIN_BATTLE", { siteId });
      const started = fold.start(init);
      if (started.kind !== "applied") throw new Error("not started");
      let slice = started.slice;
      for (let index = 0; index < passes; index++) {
        const side = engine.decision(slice.committed)?.side;
        if (side === undefined) break;
        commit("BATTLE_ACTION", { side, action: { kind: "pass" } });
        const outcome = fold.reduce(slice, { kind: "battleAction", side, action: { kind: "pass" } });
        if (outcome.kind === "applied") slice = outcome.slice;
      }
      const battle = {
        mode: { kind: "journey" },
        init: { siteId, battleId: parseBattleId("battle-log-fixture") },
        engine: { init, slice },
      } as unknown as JourneyBattleFoldState;
      return { battle, events };
    }

    it("shows the same entries after a reload, and never what the human could not see", () => {
      const engine = logEngine();
      const { battle, events } = passedBattle(engine, 12);
      const entries = engineBattleLog(engine, battle, events, "player")?.entries ?? [];
      const reloaded = engineBattleLog(
        logEngine(),
        JSON.parse(JSON.stringify(battle)) as JourneyBattleFoldState,
        JSON.parse(JSON.stringify(events)) as CommittedEvent[],
        "player",
      );
      const drawn = (side: "player" | "enemy") =>
        entries.some((entry) => entry.event.kind === "cardDrawn" && entry.event.side === side);

      expect(new Set(entries.map((entry) => entry.turnNumber)).size).toBeGreaterThan(2);
      expect(reloaded?.entries).toEqual(entries);
      expect(drawn("player")).toBe(true);
      expect(drawn("enemy")).toBe(false);
    });

    it("follows the fold as the event list grows, and is null for a list that does not reproduce it", () => {
      const engine = logEngine();
      const { battle, events } = passedBattle(engine, 12);
      const growing = events.slice(0, 6);
      const early = engineBattleLog(engine, battle, growing, "player");
      growing.push(...events.slice(6));

      expect(early).toBeNull();
      expect(engineBattleLog(engine, battle, growing, "player")?.entries).toEqual(
        engineBattleLog(engine, battle, events, "player")?.entries,
      );
    });
  });
});
