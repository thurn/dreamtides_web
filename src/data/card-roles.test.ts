import { describe, expect, it } from "vitest";
import {
  parseCardRoleData,
  resolveCatalogStarterCardNumbers,
  resolveStarterCardNumbers,
} from "./card-roles";
import type { CardData } from "../types/cards";
import { asCardId } from "../types/card-identity";

const STARTER_ID = "00000000-0000-4000-8000-000000000001";
const NIGHTMARE_ID = "00000000-0000-4000-8000-000000000002";

function fixture(): unknown {
  return {
    schemaVersion: 1,
    contentHash: "a".repeat(64),
    foldHash: "a".repeat(64),
    starterDeckCardIds: [STARTER_ID],
    nightmare: {
      cardId: asCardId(NIGHTMARE_ID),
      historicalCardNumber: 42,
      displayName: "Fixture Bane",
    },
  };
}

describe("parseCardRoleData", () => {
  it("accepts UUID-backed gameplay roles", () => {
    expect(parseCardRoleData(fixture())).toEqual(fixture());
  });

  it("rejects repeated starter UUIDs", () => {
    const value = fixture() as {
      starterDeckCardIds: string[];
    };
    value.starterDeckCardIds.push(STARTER_ID);
    expect(() => parseCardRoleData(value)).toThrow(/card role data/u);
  });
});

describe("resolveStarterCardNumbers", () => {
  it("resolves the generated UUID order through a catalog index", () => {
    const data = parseCardRoleData(fixture());
    const index = new Map([[data.starterDeckCardIds[0], 101]]);
    expect(resolveStarterCardNumbers(index, data.starterDeckCardIds)).toEqual([
      101,
    ]);
  });

  it("fails when the loaded catalog omits a configured UUID", () => {
    const data = parseCardRoleData(fixture());
    expect(() =>
      resolveStarterCardNumbers(new Map(), data.starterDeckCardIds),
    ).toThrow(/missing card UUID/u);
  });
});

describe("resolveCatalogStarterCardNumbers", () => {
  it("preserves the authored catalog order", () => {
    const cards = [
      { id: STARTER_ID, cardNumber: 20, roles: ["starter-deck"] },
      { id: NIGHTMARE_ID, cardNumber: 10, roles: undefined },
      {
        id: "00000000-0000-4000-8000-000000000003",
        cardNumber: 30,
        roles: ["starter-deck"],
      },
    ] as unknown as CardData[];
    expect(resolveCatalogStarterCardNumbers(cards)).toEqual([20, 30]);
  });
});
