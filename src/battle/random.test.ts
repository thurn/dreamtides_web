import { describe, expect, it } from "vitest";
import { createBattleRng, deriveBattleSeed } from "./random";
import { asBattleEntryKey } from "../types/identifiers";

describe("deriveBattleSeed", () => {
  it("hashes the exact battle entry key contract deterministically", () => {
    expect(deriveBattleSeed(asBattleEntryKey("site-7::3::dreamscape-2"))).toBe(
      deriveBattleSeed(asBattleEntryKey("site-7::3::dreamscape-2")),
    );
    expect(
      deriveBattleSeed(asBattleEntryKey("site-7::3::dreamscape-2")),
    ).not.toBe(deriveBattleSeed(asBattleEntryKey("site-8::3::dreamscape-2")));
  });
});

describe("createBattleRng", () => {
  it("keeps named streams independent while remaining reproducible", () => {
    const deckA = createBattleRng(12345, "playerDeckOrder");
    const deckB = createBattleRng(12345, "playerDeckOrder");
    const enemy = createBattleRng(12345, "enemyDescriptor");

    const deckSequenceA = Array.from({ length: 5 }, () => deckA.nextInt(1000));
    const deckSequenceB = Array.from({ length: 5 }, () => deckB.nextInt(1000));
    const enemySequence = Array.from({ length: 5 }, () => enemy.nextInt(1000));

    expect(deckSequenceA).toEqual(deckSequenceB);
    expect(enemySequence).not.toEqual(deckSequenceA);
  });
});
