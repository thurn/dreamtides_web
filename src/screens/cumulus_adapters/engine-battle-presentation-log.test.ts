// The battle log built from what the human saw of the engine's events.
import { describe, expect, it, vi } from "vitest";
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { createEngine, type EngineEvent } from "../../engine";
import { createFoldAdapter } from "../../engine/fold/slice";
import { boardState } from "../../engine/testing/board";
import { DSL } from "../../engine/testing/dsl-cards";
import { event as eventAbility, everyIn } from "../../engine/dsl/builders";
import { sequence, putFromTop, shuffleInto } from "../../engine/effects/primitives";
import { SYNTHETIC, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { LOOP } from "../../engine/testing/loop-cards";
import { fuzzEngineCatalog, fuzzInit, SYNTHETIC_FUZZ_POOL } from "../../engine/testing/fuzz";
import { battleSeed, SIDES } from "../../engine/state/ids";
import type { CommittedEvent } from "../../eventlog/local-log";
import type { GameEvent } from "../../eventlog/types";
import type { JourneyBattleFoldState } from "../../rules/battle/fold";
import { engineBattleLogText } from "../../runtime/battle-prompt-messages";
import { testEventActor } from "../../types/test-identities";
import {
  parseBattleId,
  parseSiteId,
} from "../../types/identifiers";
import { battleLogEntries, battleLogTurns, engineBattleLog } from "./engine-battle-log-view-model";
import { cards, discovery, foresight, labEngine, observedBoard, steps } from "./engine-battle-presentation.fixtures";

describe("battle log", () => {
  it.each(SIDES)("retains event-authorized physical printing and variant through shuffle for %s", (human) => {
    const source = { ...SYNTHETIC.event0, id: syntheticId(0x3590), status: "authored" as const,
      abilities: () => [eventAbility(sequence(putFromTop(2, [{ to: "top", count: 1 }, { to: "void", count: 1 }]), shuffleInto([everyIn("void"), everyIn("hand")])))] };
    const engine = createEngine(testCatalog([source]));
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day",
      player: { hand: [source.id, SYNTHETIC.vanilla3.id], deck: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id] }, enemy: { deck: [] } });
    const [privateCard, publicCard] = ids.player.deck;
    state.instances[publicCard] = { ...state.instances[publicCard], variant: { amplified: true, transfigurations: ["Amplified"] } };
    const answers = { answer: () => [{ card: privateCard, to: "top" }, { card: publicCard, to: "void" }] as const };
    const applied = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, answers);
    const entries = (human: "player" | "enemy") => battleLogEntries(applied.events, human, applied.state,
      engine.view(applied.state, human), engine.view(state, human), `placements:${human}`);
    expect(applied.events.filter((event) => event.kind === "shuffledIntoDeck")).toHaveLength(1);
    expect(applied.events.filter((event) => event.kind === "cardsPlaced")).toHaveLength(2);
    {
      expect(engine.view(state, human).instances[publicCard]).toBeUndefined();
      expect(engine.view(applied.state, human).instances[publicCard]).toBeUndefined();
      const placed = entries(human).find((entry) => entry.event.kind === "cardsPlaced" && entry.event.to === "void");
      expect(placed?.event).toMatchObject({ cards: [publicCard] });
      expect(placed).toMatchObject({ identities: { [publicCard]: {
        printing: { kind: "card", cardId: SYNTHETIC.vanilla2.id }, variant: state.instances[publicCard].variant,
      } } });
      if (placed === undefined) throw new Error("missing placement");
      const models = createEngineCardModels({ definitions: [], cards: new Map(), figment: () => undefined });
      const nameOf = vi.spyOn(models, "nameOf");
      battleLogTurns([placed], human, models, () => null);
      expect(nameOf).toHaveBeenCalledExactlyOnceWith({ printing: state.instances[publicCard].printing, variant: state.instances[publicCard].variant });
      nameOf.mockClear();
      const privatePlacement = entries("enemy").find((entry) => entry.event.kind === "cardsPlaced" && entry.event.to === "deckTop");
      if (privatePlacement === undefined) throw new Error("missing private placement");
      battleLogTurns([privatePlacement], "enemy", models, () => null);
      expect(nameOf).not.toHaveBeenCalled();
      const shuffle = entries(human).find((entry) => entry.event.kind === "shuffledIntoDeck");
      if (shuffle === undefined) throw new Error("missing shuffle");
      expect(shuffle).toMatchObject({ identities: { [publicCard]: { printing: state.instances[publicCard].printing, variant: state.instances[publicCard].variant } } });
      battleLogTurns([shuffle], human, models, () => null);
      expect(nameOf).toHaveBeenCalledExactlyOnceWith({ printing: state.instances[publicCard].printing, variant: state.instances[publicCard].variant });
      if (human === "enemy") {
        expect(shuffle.event).toMatchObject({ cards: [publicCard, null] });
        expect(shuffle.identities[ids.player.hand[1]]).toBeUndefined();
        expect(shuffle.cards[ids.player.hand[1]]).toBeUndefined();
      }
    }
    const hidden = entries("enemy").find((entry) => entry.event.kind === "cardsPlaced" && entry.event.to === "deckTop");
    expect(hidden?.event).toMatchObject({ cards: [null] });
    expect(hidden).toMatchObject({ identities: {} });
  });
  it("groups a challenge and score in the ending turn, and the turn start and later events in the arriving turn", () => {
    const challenge = steps("present-challenge")[1];
    if (challenge === undefined) throw new Error("no challenge");
    const entries = battleLogEntries(
      challenge.published,
      "player",
      challenge.after,
      labEngine.view(challenge.after, "player"),
      labEngine.view(challenge.before, "player"),
      "turn-boundary",
    );
    const boundary = entries.findIndex((entry) => entry.event.kind === "turnStarted");
    expect(boundary).toBeGreaterThan(0);
    const ending = entries.slice(0, boundary);
    const arriving = entries.slice(boundary);
    expect(ending.some((entry) => entry.event.kind === "laneResolved")).toBe(true);
    expect(ending.some((entry) => entry.event.kind === "pointsScored")).toBe(true);
    expect(arriving.some((entry) => entry.event.kind === "turnStarted")).toBe(true);
    expect(arriving.some((entry) => entry.event.kind === "phaseChanged")).toBe(true);
    expect(ending.map(({ turnNumber, active }) => ({ turnNumber, active }))).toEqual(
      ending.map(() => ({ turnNumber: challenge.before.turn.turnNumber, active: challenge.before.turn.active })),
    );
    expect(arriving.map(({ turnNumber, active }) => ({ turnNumber, active }))).toEqual(
      arriving.map(() => ({ turnNumber: challenge.after.turn.turnNumber, active: challenge.after.turn.active })),
    );
    expect(battleLogTurns(entries, "player", cards, () => null).map((turn) => turn.turnNumber)).toEqual([
      challenge.before.turn.turnNumber,
      challenge.after.turn.turnNumber,
    ]);
  });

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
    expect(seenByPlayer.filter((entry) => entry.event.kind === "cardDrawn" && entry.event.side === "enemy").map((entry) => entry.event)).toEqual(
      challenge.published
        .filter((event) => event.kind === "cardDrawn" && event.side === "enemy")
        .map(() => ({ kind: "cardDrawn", side: "enemy", instance: null })),
    );
    expect(seenByPlayer.some((entry) => entry.event.kind === "laneResolved")).toBe(true);
  });

  it("names a discovered card in the discoverer's log entry and hides it from the opponent's", () => {
    const { step, instance } = discovery("player");
    const discovered = (human: "player" | "enemy") =>
      battleLogEntries(
        step.published,
        human,
        step.after,
        labEngine.view(step.after, human),
        labEngine.view(step.before, human),
        `discover:${human}`,
      ).filter((entry) => entry.event.kind === "cardDiscovered");
    const [mine] = discovered("player");
    const [theirs] = discovered("enemy");

    expect(mine?.event).toEqual({ kind: "cardDiscovered", side: "player", instance });
    expect(mine?.cards[instance]?.id).toBe(instance);
    expect(theirs?.event).toEqual({ kind: "cardDiscovered", side: "player", instance: null });
    expect(theirs?.cards).toEqual({});
  });

  it("logs a foresee for both sides, naming the kept card only in the foreseer's entry", () => {
    const { step, kept, voided } = foresight("player");
    const [keptCard] = kept;
    const [voidedCard] = voided;
    if (keptCard == null || voidedCard == null) throw new Error("expected one kept and one voided card");
    const foreseen = (human: "player" | "enemy") =>
      battleLogEntries(
        step.published,
        human,
        step.after,
        labEngine.view(step.after, human),
        labEngine.view(step.before, human),
        `foresee:${human}`,
      ).filter((entry) => entry.event.kind === "foresaw");
    const [mine] = foreseen("player");
    const [theirs] = foreseen("enemy");
    const line = (human: "player" | "enemy", event: EngineEvent | undefined) =>
      event === undefined ? null : engineBattleLogText(event, { human, card: (id) => id, dreamwell: () => null });

    expect(mine?.event).toEqual({ kind: "foresaw", side: "player", kept: [keptCard], voided: [voidedCard] });
    expect(Object.keys(mine?.cards ?? {}).sort()).toEqual([keptCard, voidedCard].sort());
    expect(theirs?.event).toEqual({ kind: "foresaw", side: "player", kept: [null], voided: [voidedCard] });
    expect(Object.keys(theirs?.cards ?? {})).toEqual([voidedCard]);
    expect(line("player", mine?.event)).not.toBeNull();
    expect(line("enemy", theirs?.event)).not.toBeNull();
  });

  /** The battle log entries of each step of the reveal lab fixture, for `human`. */
  const revealLog = (human: "player" | "enemy") =>
    steps("present-reveal", human).flatMap((step, index) =>
      battleLogEntries(
        step.published,
        human,
        step.after,
        labEngine.view(step.after, human),
        labEngine.view(step.before, human),
        `reveal:${human}:${String(index)}`,
      ),
    );

  it("logs every opponent draw for the human as a count, never naming the card drawn", () => {
    const published = steps("present-reveal").flatMap((step) => step.published);
    const drawnBy = (side: "player" | "enemy") =>
      published.flatMap((event) => (event.kind === "cardDrawn" && event.side === side && event.instance !== null ? [event.instance] : []));
    const draws = (human: "player" | "enemy", side: "player" | "enemy") =>
      revealLog(human).filter((entry) => entry.event.kind === "cardDrawn" && entry.event.side === side);
    const enemyDrawn = drawnBy("enemy");
    const playerDrawn = drawnBy("player");
    const lines = draws("player", "enemy").map((entry) =>
      engineBattleLogText(entry.event, { human: "player", card: (id) => id, dreamwell: () => null }),
    );

    // The effect's draw and the turn's draw.
    expect(enemyDrawn).toHaveLength(2);
    expect(playerDrawn.length).toBeGreaterThan(0);
    expect(draws("enemy", "enemy").map((entry) => entry.event)).toEqual(
      enemyDrawn.map((instance) => ({ kind: "cardDrawn", side: "enemy", instance })),
    );
    expect(draws("player", "enemy").map((entry) => entry.event)).toEqual(
      enemyDrawn.map(() => ({ kind: "cardDrawn", side: "enemy", instance: null })),
    );
    expect(draws("player", "enemy").map((entry) => entry.cards)).toEqual(enemyDrawn.map(() => ({})));
    expect(lines.every((line) => line !== null && enemyDrawn.every((id) => !line.includes(id)))).toBe(true);
    expect(enemyDrawn.filter((id) => JSON.stringify(revealLog("player")).includes(id))).toEqual([]);
    expect(draws("player", "player").map((entry) => entry.event)).toEqual(
      playerDrawn.map((instance) => ({ kind: "cardDrawn", side: "player", instance })),
    );
    expect(draws("enemy", "player").map((entry) => entry.event)).toEqual(
      playerDrawn.map(() => ({ kind: "cardDrawn", side: "player", instance: null })),
    );
  });

  it("logs the opponent's reveal of the human's hand for both sides, naming whose hand it was", () => {
    const resolved = steps("present-reveal").find((step) => step.published.some((published) => published.kind === "revealed"));
    const event = resolved?.published.find((published) => published.kind === "revealed");
    if (event?.kind !== "revealed") throw new Error("no reveal");
    const revealedOf = (human: "player" | "enemy") => revealLog(human).filter((entry) => entry.event.kind === "revealed");
    const line = (human: "player" | "enemy") => {
      const [entry] = revealedOf(human);
      return entry === undefined ? null : engineBattleLogText(entry.event, { human, card: (id) => id, dreamwell: () => null });
    };

    expect(event.side).toBe("player");
    expect(event.instances).toEqual(resolved?.before.sides.player.hand);
    for (const human of SIDES) {
      const [entry, ...rest] = revealedOf(human);
      expect(rest).toEqual([]);
      expect(entry?.event).toEqual({ kind: "revealed", side: "player", instances: event.instances });
      expect(Object.keys(entry?.cards ?? {}).sort()).toEqual([...event.instances].sort());
    }
    expect(line("player")).not.toBeNull();
    expect(line("enemy")).not.toBeNull();
    expect(line("player")).not.toEqual(line("enemy"));
    expect(line("player")).toEqual(
      engineBattleLogText({ ...event, side: "enemy" }, { human: "enemy", card: (id) => id, dreamwell: () => null }),
    );
  });

  it("logs one line for each side's energy an effect gains or loses, naming the amount, and none for payments or the turn's refresh", () => {
    const deck = Array.from({ length: 6 }, () => SYNTHETIC.vanilla1.id);
    const fixture = observedBoard({
      active: "player",
      phase: "day",
      player: { hand: [DSL.drawThenEnergy.id], back: [LOOP.drain.id], energy: 3, deck },
      enemy: { energy: 2, deck },
    });
    const drain = fixture.ids.player.back[0];
    if (drain == null) throw new Error("no drain");
    const batches = [
      fixture.apply({ kind: "battleAction", side: "player", action: { kind: "play", card: fixture.ids.player.hand[0], from: "hand" } }),
      fixture.apply({ kind: "battleAction", side: "player", action: { kind: "activate", source: drain, ability: 0 } }),
      fixture.passUntil("turnStarted"),
    ];
    const energy = batches.flatMap((batch) => batch.events.filter((event) => event.kind === "energyChanged"));
    /** The energy changes the log writes a line for, as `human` saw them. */
    const logged = (human: "player" | "enemy") =>
      batches
        .flatMap((batch, index) =>
          battleLogEntries(batch.events, human, batch.state, labEngine.view(batch.state, human), labEngine.view(batch.before, human), `energy:${String(index)}`),
        )
        .filter((entry) => entry.event.kind === "energyChanged")
        .filter((entry) => engineBattleLogText(entry.event, { human, card: () => null, dreamwell: () => null }) !== null)
        .map((entry) => (entry.event.kind === "energyChanged" ? { side: entry.event.side, change: entry.event.change, cards: entry.cards } : null));

    // The play's cost, and the opponent's turn refreshing its energy, change energy too.
    expect(energy.filter((event) => event.cause === "payment").map(({ side, change }) => ({ side, change }))).toEqual([{ side: "player", change: -1 }]);
    expect(energy.filter((event) => event.cause === "refresh").map(({ side }) => side)).toContain("enemy");
    for (const human of SIDES) {
      expect(logged(human)).toEqual([
        { side: "player", change: 1, cards: {} },
        { side: "enemy", change: -1, cards: {} },
      ]);
    }
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

    it("shows the same entries after a reload, and the opponent's draws without the cards drawn", () => {
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
      expect(drawn("enemy")).toBe(true);
      expect(
        entries.filter((entry) => entry.event.kind === "cardDrawn" && entry.event.side === "enemy").every(
          (entry) => entry.event.kind === "cardDrawn" && entry.event.instance === null && Object.keys(entry.cards).length === 0,
        ),
      ).toBe(true);
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
