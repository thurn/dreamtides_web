import { describe, expect, it } from "vitest";
import { compileCardRoleData } from "./card-role-data.mjs";

const STARTER_ID = "00000000-0000-4000-8000-000000000001";
const NIGHTMARE_ID = "00000000-0000-4000-8000-000000000002";

function cards() {
  return [
    {
      id: STARTER_ID,
      name: "Fixture Starter",
      rarity: "Starter",
      roles: ["starter-deck"],
      "card-number": 101,
    },
    {
      id: NIGHTMARE_ID,
      name: "Fixture Nightmare",
      rarity: "Special",
      roles: ["nightmare"],
      "card-number": 202,
    },
  ];
}

describe("compileCardRoleData", () => {
  it("derives identities from role-bearing catalog rows", () => {
    const result = compileCardRoleData(cards());
    expect(result.starterDeckCardIds).toEqual([STARTER_ID]);
    expect(result.nightmare).toEqual({
      cardId: NIGHTMARE_ID,
      historicalCardNumber: 202,
      displayName: "Fixture Nightmare",
    });
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.foldHash).toBe(result.contentHash);
  });

  it("requires Starter rarity and starter-deck role to agree", () => {
    const value = cards();
    value[0].roles = [];
    expect(() => compileCardRoleData(value)).toThrow(
      /align starter-deck role/u,
    );
  });

  it("requires exactly one Nightmare role", () => {
    const value = cards();
    value[1].roles = [];
    expect(() => compileCardRoleData(value)).toThrow(/exactly one card/u);
  });
});
