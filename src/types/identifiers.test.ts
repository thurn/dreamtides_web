import { describe, expect, expectTypeOf, it } from "vitest";
import {
  asAuguryArchetypeId,
  asDeckEntryId,
  asSiteId,
  auguryArchetypeIdFromUnknown,
  siteIdFromUnknown,
  type DeckEntryId,
  type SiteId,
} from "./identifiers";

describe("domain identifiers", () => {
  it("preserves string values while separating identity domains", () => {
    const siteId = asSiteId("site-1");
    const deckEntryId = asDeckEntryId("site-1");

    expect(siteId).toBe("site-1");
    expect(deckEntryId).toBe("site-1");

    expectTypeOf<DeckEntryId>().not.toMatchTypeOf<SiteId>();
    expectTypeOf<SiteId>().not.toMatchTypeOf<DeckEntryId>();
    expectTypeOf<string>().not.toMatchTypeOf<SiteId>();
  });

  it("decodes string identity boundaries and rejects other JSON values", () => {
    expect(siteIdFromUnknown("site-1")).toBe(asSiteId("site-1"));
    expect(siteIdFromUnknown(1)).toBeNull();
    expect(siteIdFromUnknown(null)).toBeNull();
  });

  it("validates named enumerations at untrusted boundaries", () => {
    expect(auguryArchetypeIdFromUnknown("fit_card_grant")).toBe(
      asAuguryArchetypeId("fit_card_grant"),
    );
    expect(auguryArchetypeIdFromUnknown("unknown_archetype")).toBeNull();

    expectTypeOf<"unknown_archetype">().not.toMatchTypeOf<
      Parameters<typeof asAuguryArchetypeId>[0]
    >();
  });
});
