// @vitest-environment node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  auditDomainStrings,
  findRawStringIdentityDeclarationsInSource,
  findUncheckedIdentityAssertionsInSource,
} from "./domain-string-audit.mjs";

describe("domain string audit", () => {
  it("rejects scalar, collection, and generic raw string identities", () => {
    const findings = findRawStringIdentityDeclarationsInSource(
      `
        interface Bad {
          siteId: string;
          readonly cardUuids: readonly string[];
          id?: ReadonlyArray<string>;
          cardsById: ReadonlyMap<string, CardData>;
          nodesById: Record<string, Node>;
        }
      `,
      "src/example.ts",
    );
    expect(findings.map(({ name }) => name)).toEqual([
      "siteId",
      "cardUuids",
      "id",
      "cardsById",
      "nodesById",
    ]);
  });

  it("accepts branded identities and named enumerations", () => {
    const findings = findRawStringIdentityDeclarationsInSource(
      `
        interface Good {
          siteId: SiteId;
          cardUuids: readonly CardId[];
          id: SiteType;
        }
      `,
      "src/example.ts",
    );
    expect(findings).toEqual([]);
  });

  it("rejects unchecked identity constructors and assertions", () => {
    const findings = findUncheckedIdentityAssertionsInSource(
      `
        const site = asSiteId(raw);
        const card = raw as CardId;
      `,
      "src/example.ts",
    );
    expect(findings.map(({ name }) => name)).toEqual(["asSiteId", "CardId"]);
  });

  it("allows only the named private minting functions in the whole-tree audit", () => {
    const findings = findUncheckedIdentityAssertionsInSource(
      `function anotherBoundary(raw: string) { return raw as CardId; }`,
      "src/types/card-identity.ts",
    );
    expect(findings).toMatchObject([
      { name: "CardId", functionName: "anotherBoundary" },
    ]);
  });

  it("keeps the production domain tree free of raw string identities", () => {
    expect(
      auditDomainStrings(
        resolve(fileURLToPath(new URL(".", import.meta.url)), ".."),
      ),
    ).toEqual([]);
  });
});
