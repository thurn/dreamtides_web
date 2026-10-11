import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SiteRuntimeState } from "../../types/journey";
import { type FoldState } from "../fold-state";
import { completeJourneySite, isSiteVisited, registerSiteContentProvider } from "./sites";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { testSiteContentProvider } from "./test-content-providers";
import { parseDeckEntryId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";
import { reduce, makeEntry, dreamsign, SITE_ID, NODE_ID, makeSite, stateWithSites, siteState, fakeProvider, runtimeOf } from "./sites-fixtures";



afterEach(() => {
  registerSiteContentProvider(null);
});


// ---------------------------------------------------------------------------
// Augury: complete / reroll / force
// ---------------------------------------------------------------------------

describe("Augury", () => {
  it("COMPLETE_AUGURY marks completed and completes the site", () => {
    const out = reduce(siteState("Augury"), "COMPLETE_AUGURY", {
      siteId: SITE_ID,
    });
    expect(out.outcome).toBe("applied");
    expect(
      (out.state.journey.siteRuntime[SITE_ID] as { completed: boolean })
        .completed,
    ).toBe(true);
    expect(isSiteVisited(out.state.journey, SITE_ID)).toBe(true);
  });

  it("OPEN_SITE opens an Augury only under the current selection protocol", () => {
    const requestedVersions: unknown[] = [];
    registerSiteContentProvider(
      testSiteContentProvider({
        openSite({ site, selectionRulesVersion }) {
          requestedVersions.push(selectionRulesVersion);
          return site.type === "Augury"
            ? {
                runtime: {
                  kind: "augury",
                  completed: false,
                  selectionRulesVersion,
                },
              }
            : null;
        },
      }),
    );

    const unversioned = reduce(siteState("Augury"), "OPEN_SITE", {
      siteId: SITE_ID,
    });
    const unsupported = reduce(siteState("Augury"), "OPEN_SITE", {
      siteId: SITE_ID,
      selectionRulesVersion: "unsupported-selection-version",
    });
    const current = reduce(siteState("Augury"), "OPEN_SITE", {
      siteId: SITE_ID,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    });

    expect(unversioned.outcome).toBe("bounced");
    expect(runtimeOf(unversioned)).toBeUndefined();
    expect(unsupported.outcome).toBe("bounced");
    expect(runtimeOf(unsupported)).toBeUndefined();
    expect(current.outcome).toBe("applied");
    expect(runtimeOf(current)?.kind).toBe("augury");
    expect(requestedVersions).toEqual([SELECTION_RULES_VERSION]);
  });

  it("OPEN_SITE bounces a current Augury open with no content provider", () => {
    const out = reduce(siteState("Augury"), "OPEN_SITE", {
      siteId: SITE_ID,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    });
    expect(out.outcome).toBe("bounced");
    expect(runtimeOf(out)).toBeUndefined();
  });

  it("REROLL_AUGURY advances the runtime (nonce bumped, hash differs)", () => {
    const opened = siteState("Augury", {
      siteRuntime: {
        [SITE_ID]: {
          kind: "augury",
          completed: false,
          selectionRulesVersion: SELECTION_RULES_VERSION,
        },
      },
    });
    const before = JSON.stringify(opened.journey.siteRuntime[SITE_ID]);
    const out = reduce(opened, "REROLL_AUGURY", { siteId: SITE_ID });
    expect(out.outcome).toBe("applied");
    expect(JSON.stringify(out.state.journey.siteRuntime[SITE_ID])).not.toBe(
      before,
    );
    const first = out.state;
    const second = reduce(first, "REROLL_AUGURY", {
      siteId: SITE_ID,
    });
    expect(JSON.stringify(second.state.journey.siteRuntime[SITE_ID])).not.toBe(
      JSON.stringify(first.journey.siteRuntime[SITE_ID]),
    );
  });
});


// ---------------------------------------------------------------------------
// Card choice: transfiguration / duplication
// ---------------------------------------------------------------------------

describe("ACCEPT_TRANSFIGURATION_CHOICE", () => {
  function opened(essence = 1000): FoldState {
    registerSiteContentProvider(fakeProvider);
    const deck = [
      makeEntry({ entryId: parseDeckEntryId("deck-1"), cardNumber: 7 }),
    ];
    return reduce(
      siteState("Transfiguration", { deck, essence }),
      "OPEN_SITE",
      { siteId: SITE_ID, selectionRulesVersion: SELECTION_RULES_VERSION },
    ).state;
  }

  it("applies the transfiguration, charges essence, completes the site", () => {
    const state = opened(1000);
    const offer = (
      state.journey.siteRuntime[SITE_ID] as {
        transfigurationOffers: { essenceCost: number; type: string }[];
      }
    ).transfigurationOffers[0];
    const out = reduce(state, "ACCEPT_TRANSFIGURATION_CHOICE", {
      siteId: SITE_ID,
      entryId: parseDeckEntryId("deck-1"),
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(1000 - offer.essenceCost);
    const entry = out.state.journey.deck.find((e) => e.entryId === "deck-1");
    expect(entry?.transfiguration).toBe(offer.type);
    expect(isSiteVisited(out.state.journey, SITE_ID)).toBe(true);
  });
});


describe("ACCEPT_DUPLICATION_CHOICE", () => {
  function opened(): FoldState {
    registerSiteContentProvider(fakeProvider);
    const deck = [
      makeEntry({ entryId: parseDeckEntryId("deck-1"), cardNumber: 7 }),
    ];
    return reduce(siteState("Duplication", { deck }), "OPEN_SITE", {
      siteId: SITE_ID,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    }).state;
  }

  it("appends a copy of the chosen entry and completes the site", () => {
    const out = reduce(opened(), "ACCEPT_DUPLICATION_CHOICE", {
      siteId: SITE_ID,
      entryId: parseDeckEntryId("deck-1"),
    });
    expect(out.outcome).toBe("applied");
    expect(
      out.state.journey.deck.filter((e) => e.cardNumber === 7),
    ).toHaveLength(2);
    expect(isSiteVisited(out.state.journey, SITE_ID)).toBe(true);
  });
});


// ---------------------------------------------------------------------------
// COMPLETE_SITE
// ---------------------------------------------------------------------------

describe("COMPLETE_SITE", () => {
  it("marks the site visited and returns to the dreamscape", () => {
    const out = reduce(siteState("Augury"), "COMPLETE_SITE", {
      siteId: SITE_ID,
    });
    expect(out.outcome).toBe("applied");
    expect(isSiteVisited(out.state.journey, SITE_ID)).toBe(true);
    expect(out.state.journey.screen.type).toBe("dreamscape");
  });

  it("marks only the target site visited and preserves other site runtime", () => {
    const otherSiteId = parseSiteId("site-2");
    const runtime: SiteRuntimeState = {
      kind: "essence",
      amount: 25,
      accepted: false,
    };
    const journey = stateWithSites(
      [makeSite("Draft"), { ...makeSite("Battle"), id: otherSiteId }],
      { siteRuntime: { [otherSiteId]: runtime } },
    ).journey;

    const next = completeJourneySite(journey, SITE_ID);

    expect(next.atlas.nodes[NODE_ID]?.sites.map((site) => site.isVisited)).toEqual(
      [true, false],
    );
    expect(next.siteRuntime[otherSiteId]).toBe(runtime);
    expect(completeJourneySite(next, SITE_ID)).toBe(next);
  });
});


// ---------------------------------------------------------------------------
// PURGE_DECK_CARDS (completed: essence + negative Dreamsign + site coupling)
// ---------------------------------------------------------------------------

describe("PURGE_DECK_CARDS full behavior", () => {
  beforeEach(() => registerSiteContentProvider(fakeProvider));
  function purgeState(): FoldState {
    return stateWithSites([makeSite("Purge")], {
      essence: 500,
      deck: [
        makeEntry({ entryId: parseDeckEntryId("deck-1"), cardNumber: 10 }),
        makeEntry({
          entryId: parseDeckEntryId("nightmare"),
          cardNumber: 10002,
          isBane: true,
        }),
      ],
      dreamsigns: [dreamsign("first"), dreamsign("second")],
    });
  }

  it("derives the canonical price and completes the site atomically", () => {
    const state = purgeState();
    const out = reduce(state, "PURGE_DECK_CARDS", {
      entryIds: [parseDeckEntryId("deck-1")],
      siteId: SITE_ID,
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(500 - 40);
    expect(out.state.journey.deck.map((e) => e.entryId)).toEqual([
      parseDeckEntryId("nightmare"),
    ]);
    expect(out.state.journey.dreamsigns.map((d) => d.id)).toEqual([
      testDreamsignId("first"),
      testDreamsignId("second"),
    ]);
    expect(isSiteVisited(out.state.journey, SITE_ID)).toBe(true);
    expect(out.state.journey.screen.type).toBe("dreamscape");
  });

  it("ignores a forged client price and charges the derived price", () => {
    const state = purgeState();
    const out = reduce(
      { ...state, journey: { ...state.journey, essence: 100 } },
      "PURGE_DECK_CARDS",
      {
        entryIds: [parseDeckEntryId("deck-1")],
        siteId: SITE_ID,
        cost: -100,
      },
    );
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(60);
  });
});
