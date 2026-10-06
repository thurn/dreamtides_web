import { describe, expect, expectTypeOf, it } from "vitest";
import {
  parseAuguryArchetypeId,
  parseDeckEntryId,
  parseSiteId,
  auguryArchetypeIdFromUnknown,
  dreamscapeIdFromUnknown,
  guideArtKeyFromUnknown,
  guideIdFromUnknown,
  siteIdFromUnknown,
  type DeckEntryId,
  type SiteId,
} from "./identifiers";

describe("domain identifiers", () => {
  it("preserves string values while separating identity domains", () => {
    const siteId = parseSiteId("site-1");
    const deckEntryId = parseDeckEntryId("site-1");

    expect(siteId).toBe("site-1");
    expect(deckEntryId).toBe("site-1");

    expectTypeOf<DeckEntryId>().not.toMatchTypeOf<SiteId>();
    expectTypeOf<SiteId>().not.toMatchTypeOf<DeckEntryId>();
    expectTypeOf<string>().not.toMatchTypeOf<SiteId>();
  });

  it("decodes string identity boundaries and rejects other JSON values", () => {
    expect(siteIdFromUnknown("site-1")).toBe(parseSiteId("site-1"));
    expect(siteIdFromUnknown(1)).toBeNull();
    expect(siteIdFromUnknown(null)).toBeNull();
  });

  it("validates named enumerations at untrusted boundaries", () => {
    expect(auguryArchetypeIdFromUnknown("fit_card_grant")).toBe(
      "fit_card_grant",
    );
    expect(auguryArchetypeIdFromUnknown("unknown_archetype")).toBeNull();

    expectTypeOf<"unknown_archetype">().not.toMatchTypeOf<
      ReturnType<typeof parseAuguryArchetypeId>
    >();
  });

  it("accepts only UUID dreamscape identities, normalized to lowercase", () => {
    expect(
      dreamscapeIdFromUnknown("F413A98F-10D2-4578-8031-CC6CE57B61B4"),
    ).toBe("f413a98f-10d2-4578-8031-cc6ce57b61b4");
    expect(dreamscapeIdFromUnknown("wilderveil")).toBeNull();
    expect(dreamscapeIdFromUnknown("")).toBeNull();
  });

  it("accepts only UUID guide identities and slug guide art keys", () => {
    expect(guideIdFromUnknown("E915CBD5-D7B1-4C97-979A-553EC7F1C923")).toBe(
      "e915cbd5-d7b1-4c97-979a-553ec7f1c923",
    );
    expect(guideIdFromUnknown("fixture_guide")).toBeNull();
    expect(guideArtKeyFromUnknown("fixture_guide")).toBe("fixture_guide");
    expect(
      guideArtKeyFromUnknown("e915cbd5-d7b1-4c97-979a-553ec7f1c923"),
    ).toBeNull();
  });
});
