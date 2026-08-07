import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { DraftState } from "../../types/draft";
import { createBaseBattleDeckCardDefinition } from "../../battle/card-definition";
import { createPoolCardDropCommand } from "../../battle/components/battle-ui-commands";
import { buildPoolViewerView, DEFAULT_POOL_VIEWER_FILTERS } from "./pool-viewer-view-model";

function card(id: string, number: number, name: string, cardType: CardData["cardType"] = "Character"): CardData {
  return { id: asCardId(id), cardNumber: number, name: asCardName(name), cardType, subtype: cardType === "Character" ? "Fixture" : "", isStarter: false, energyCost: number, spark: cardType === "Character" ? 1 : null, isFast: false, renderedText: `Rules for ${name}`, imageNumber: number, artOwned: true };
}

const alpha = card("card-alpha", 1, "Shared Name");
const beta = card("card-beta", 2, "Shared Name", "Event");
const database = new Map([[1, alpha], [2, beta]]);
const poolState: DraftState = { mode: "pool", draftPoolCopiesByCard: { "1": 2, "2": 1 }, remainingCopiesByCard: { "1": 2, "2": 1 }, currentOffer: [], activeSiteId: null, pickNumber: 1, sitePicksCompleted: 0 };

function build(overrides: Partial<Parameters<typeof buildPoolViewerView>[0]> = {}) {
  return buildPoolViewerView({ cardDatabase: database, draftState: poolState, resolvedPackage: null, replayRecord: null, poolVariant: null, tides4Provenance: null, source: "run", filters: DEFAULT_POOL_VIEWER_FILTERS, title: "Pool Viewer", frame: "fullScreen", ...overrides });
}

describe("buildPoolViewerView", () => {
  it("keeps duplicate display names distinct through UUID-backed stable entries", () => {
    const view = build();
    expect(view.cards.map((entry) => entry.model.cardId)).toEqual([alpha.id, beta.id]);
    expect(view.cards.map((entry) => entry.entryId)).toEqual([`run:${alpha.id}`, `run:${beta.id}`]);
  });

  it("filters deterministically without changing entry identity", () => {
    const view = build({ filters: { ...DEFAULT_POOL_VIEWER_FILTERS, type: "event", query: "shared" } });
    expect(view.cards).toHaveLength(1);
    expect(view.cards[0]?.entryId).toBe(`run:${beta.id}`);
  });

  it("builds replay deck counts and pick history from UUID channels", () => {
    const replayRecord = { id: "record", draftId: "draft", sourceFile: "fixture.json", mainboard: ["ignored"], mainboardIds: [alpha.id, alpha.id, beta.id], packs: [["old alpha", "old beta"]], picks: [["old beta"]], packIds: [[alpha.id, beta.id]], pickIds: [[beta.id]] };
    const view = build({ draftState: { mode: "replay", recordId: "record", packSequence: [], signatureCardNumbers: [], currentOffer: [], activeSiteId: null, pickNumber: 1, sitePicksCompleted: 0 }, replayRecord, source: "deck" });
    expect(view.cards.map((entry) => entry.entryId)).toEqual([`deck:${alpha.id}`, `deck:${beta.id}`]);
    expect(view.cards[0]?.caption).toEqual({ kind: "text", text: "×2" });
    const history = build({ draftState: { mode: "replay", recordId: "record", packSequence: [], signatureCardNumbers: [], currentOffer: [], activeSiteId: null, pickNumber: 1, sitePicksCompleted: 0 }, replayRecord, source: "history" });
    expect(history.replayRows[0]?.cards[1]).toMatchObject({ cardId: beta.id, picked: true });
  });

  it("keeps source-specific empty states and provenance visible", () => {
    const view = build({ source: "tides", tides4Provenance: { dreamAvatarId: "dc", signatureless: false, borrowedArchetypeName: null, dealSize: 10, cap: 2, maxFacets: 3, facetDrawnCount: 1, facetAvailableCount: 2, tides: [{ id: "missing", name: "Missing", role: "facet", selection: "facet-drawn", joined: true, cardNumbers: [99], contributedCardCount: 0 }], cardProvenanceByNumber: {} } });
    expect(view.emptyLabel).toContain("tide");
    expect(view.disclosures.some((item) => item.id === "tides")).toBe(true);
  });

  it("maps catalog and signature sources without display-name identity", () => {
    const resolvedPackage = {
      dreamAvatar: { id: "dc", name: "Fixture", title: "", renderedText: "", imageNumber: "1", startingEssence: 0, signatureCards: ["display-only"], signatureCardIds: [beta.id] },
      draftPoolCopiesByCard: {}, dreamsignPoolIds: [], mandatoryOnlyPoolSize: 0, draftPoolSize: 0, doubledCardCount: 0, legalSubsetCount: 0, preferredSubsetCount: 0,
    };
    expect(build({ source: "catalog" }).cards.map((item) => item.model.cardId)).toEqual([alpha.id, beta.id]);
    expect(build({ source: "signature", resolvedPackage }).cards[0]?.model.cardId).toBe(beta.id);
  });

  it("carries a stable gallery entry through the pool-to-deck battle mutation", () => {
    const entry = build().cards.find((item) => item.entryId === `run:${alpha.id}`);
    if (entry === undefined) throw new Error("expected alpha pool entry");
    const command = createPoolCardDropCommand(
      createBaseBattleDeckCardDefinition(entry.model.displaySnapshot),
      { side: "player", zone: "deck", position: "top" },
      99,
    );
    if (command.id !== "DEBUG_EDIT") throw new Error("expected debug edit");
    expect(command.edit).toMatchObject({
      kind: "CREATE_CARD_FROM_DEFINITION",
      definition: { cardId: entry.model.cardId },
      destination: { side: "player", zone: "deck", position: "top" },
    });
  });
});
