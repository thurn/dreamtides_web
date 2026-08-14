// @vitest-environment node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  auditDomainStrings,
  findRawStringIdentityDeclarationsInSource,
} from "./domain-string-audit.mjs";

describe("domain string audit", () => {
  it("rejects scalar, collection, and generic raw string identities", () => {
    const findings = findRawStringIdentityDeclarationsInSource(
      `
        interface Bad {
          siteId: string;
          readonly cardUuids: readonly string[];
          id?: ReadonlyArray<string>;
        }
      `,
      "src/example.ts",
    );
    expect(findings.map(({ name }) => name)).toEqual([
      "siteId",
      "cardUuids",
      "id",
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

  it("keeps the production domain tree free of raw string identities", () => {
    expect(
      auditDomainStrings(
        resolve(fileURLToPath(new URL(".", import.meta.url)), ".."),
      ),
    ).toEqual([]);
  });
});
