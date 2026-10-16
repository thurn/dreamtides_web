import { afterEach, describe, expect, it } from "vitest";
import { clearGameProviders } from "./providers/register-game-providers";
import { registerReplayFixtureProviders } from "../rules/replay/fixture-providers";
import { createGameRepository } from "./game-repository";
import { createMemoryKeyValueStore, type KeyValueStore } from "./key-value-store";
import { createLocalGame, openLocalGame, type LocalGame } from "./local-game";
import { attachGameLog } from "./game-log";
import { parseClientId, parseGameId } from "../types/identifiers";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import type { FoldState } from "../rules/fold-state";
import { hashState } from "../eventlog/hash";
import { createJourneySaveFile, parseJourneySaveFile, serializeJourneySaveFile } from "../state/journey-save-files";
import { config, ENTRY_ID, fixture, GENESIS, SITE_ID } from "../rules/journey/journey-loop.fixtures";

const options = { checkpointInterval: 1, now: () => 0, eventClock: () => "1970-01-01T00:00:00.000Z" };
describe("journey loop real persistence recovery", () => {
  const games: LocalGame<FoldState>[] = []; const detach: (() => void)[] = [];
  afterEach(async () => { for (const stop of detach.splice(0)) stop(); for (const game of games.splice(0)) await game.close(); clearGameProviders(); registerReplayFixtureProviders(); });
  it("retries the actual atomic terminal event, reopens its checkpoint, and replays after an invalid matching-hash terminal checkpoint", async () => {
    const f = fixture(), memory = createMemoryKeyValueStore(); let fail = false; const errors: unknown[] = [], lines: unknown[] = [];
    const store: KeyValueStore = { ...memory, putAll: values => { if (fail) { fail = false; return Promise.reject(new Error("owned terminal write abort")); } return memory.putAll(values); } };
    const repository = createGameRepository(store), gameId = parseGameId("journey-loop-recovery"), engineConfig = config(f);
    const game = await createLocalGame(repository, engineConfig, { gameId, genesis: GENESIS, localPlayerId: parseClientId("journey-loop-author") }, { ...options, onPersistError: error => errors.push(error) }); games.push(game);
    detach.push(attachGameLog(game, { mirror: line => lines.push(line) }));
    game.log.append({ type: "ACCEPT_TRANSFIGURATION_CHOICE", payload: { siteId: SITE_ID, entryId: ENTRY_ID } });
    expect(game.log.state().journey).toHaveProperty("journeyDraw.result", "draw");
    fail = true; await game.flush(); expect(errors).toHaveLength(1); expect((await repository.readGame(gameId))?.summary.head).toBe(0);
    await game.flush(); const expected = game.log.state(); await game.close();
    const reopened = (await openLocalGame(repository, engineConfig, gameId, options))!; games.push(reopened);
    expect(reopened.opened).toMatchObject({ checkpointSeq: 1, checkpointRejected: false, replayedEvents: 0 }); expect(reopened.log.state()).toEqual(expected);
    expect(lines).toEqual(expect.arrayContaining([expect.objectContaining({ event: "journey_draw_committed", gameId, seq: 1 })]));
    const stored = (await repository.readGame(gameId))!, bad: unknown = JSON.parse(GAME_ENGINE_CONFIG.encode(expected));
    if (typeof bad !== "object" || bad === null || !("journey" in bad) || typeof bad.journey !== "object" || bad.journey === null) throw new Error("Bad synthetic serialization");
    Reflect.set(bad.journey, "journeyDraw", { kind: "mandatoryJourneyLoop", result: "draw", committedSeq: -1 });
    await repository.write(gameId, { summary: stored.summary, events: [], checkpoint: { ...stored.checkpoint!, state: JSON.stringify(bad), stateHash: hashState(bad) } });
    const recovered = (await openLocalGame(repository, engineConfig, gameId, options))!; games.push(recovered);
    expect(recovered.opened).toMatchObject({ checkpointSeq: 0, checkpointRejected: true, replayedEvents: 1 }); expect(recovered.log.state()).toEqual(expected);
    const save = parseJourneySaveFile(serializeJourneySaveFile(createJourneySaveFile("Synthetic terminal", expected.journey, { savedAt: options.eventClock() })));
    const imported = await createLocalGame(repository, engineConfig, { gameId: parseGameId("journey-loop-import"), genesis: GENESIS, localPlayerId: parseClientId("journey-loop-importer") }, options); games.push(imported);
    imported.log.append({ type: "LOAD_STATE", payload: { snapshot: save.journeyState } });
    expect(imported.log.state().journey).toMatchObject({ journeyDraw: Reflect.get(expected.journey, "journeyDraw") });
    imported.log.append({ type: "RESET_JOURNEY", payload: {} }); await imported.flush();
    expect(imported.log.state().journey).not.toHaveProperty("journeyDraw"); expect(imported.log.state().journey.screen.type).toBe("journeyStart");
  });
  it("rejects malformed own terminal state at the canonical decoder instead of trusting a valid JSON envelope", () => {
    const f = fixture(), bad = { ...f.state, journey: { ...f.state.journey, screen: { type: "journeyFailed" }, journeyDraw: {
      kind: "mandatoryJourneyLoop", result: "draw", committedSeq: 1, cause: { cardId: "not-a-uuid", entryId: ENTRY_ID, eventSeq: -1, ordinal: 0, applicationIndex: 0 },
      continuingSources: [], proof: { kind: "asserted-provider-boolean" }, abandonedBattle: null,
    } } };
    expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(bad))).toThrow();
  });
});
