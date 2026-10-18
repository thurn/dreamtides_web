// The D97 event table contract: every spec in `D97_EVENTS` is a known
// gameplay event that a journey game bounces, each subsystem table declares
// its own events without shadowing another's, and the keyed intents keep the
// intent keys saves record.
import { describe, expect, it } from "vitest";
import { identityKeys, parseDreamAnchorId } from "../../../types/identifiers";
import { testAvatarId } from "../../../types/test-identities";
import { isGameplayEventType, isKnownEventType } from "../../events";
import { genesisFoldState } from "../../fold-state";
import { reduceGameEvent } from "../../reducer";
import { ctx, event, GENESIS } from "../../reducer-fixtures";
import { DECK_EVENTS } from "./deck";
import { ENCOUNTER_EVENTS } from "./encounters";
import { D97_EVENTS, d97IntentKey } from "./index";
import { QUEST_EVENTS } from "./quests";
import { RUN_EVENTS } from "./run";
import { SHOP_EVENTS } from "./shop";
import { TRAVEL_EVENTS } from "./travel";

const TYPES = identityKeys(D97_EVENTS);

describe("D97_EVENTS", () => {
  it("declares every D97 event as a known gameplay event a journey game bounces", () => {
    expect(TYPES.length).toBeGreaterThan(0);
    const journey = genesisFoldState(GENESIS);
    for (const type of TYPES) {
      expect(isKnownEventType(type), type).toBe(true);
      expect(isGameplayEventType(type), type).toBe(true);
      const result = reduceGameEvent(journey, event(type, {}), ctx({ seq: 1 }));
      expect(result.outcome, type).toBe("bounced");
      expect(result.state, type).toBe(journey);
    }
  });

  it("spreads subsystem tables that declare disjoint events", () => {
    const tables = [RUN_EVENTS, DECK_EVENTS, ENCOUNTER_EVENTS, QUEST_EVENTS, SHOP_EVENTS, TRAVEL_EVENTS];
    const declared = tables.flatMap((table) => Object.keys(table));
    expect(new Set(declared).size).toBe(declared.length);
    expect([...declared].sort()).toEqual([...TYPES].sort());
  });

  it("keys the run start and each encounter's first preview, and nothing else", () => {
    const anchorId = parseDreamAnchorId("d9700000-0000-4000-8000-000000000006");
    expect(d97IntentKey({ type: "D97_START_RUN", payload: { avatarId: testAvatarId("d97-avatar") } })).toBe("d97-start-run");
    expect(d97IntentKey({ type: "D97_PREVIEW_ENCOUNTER", payload: { anchorId } })).toBe(`d97-preview:${anchorId}`);
    const keyed = TYPES.filter((type) => D97_EVENTS[type].intentKey !== undefined);
    expect(keyed.sort()).toEqual(["D97_PREVIEW_ENCOUNTER", "D97_START_RUN"]);
  });
});
