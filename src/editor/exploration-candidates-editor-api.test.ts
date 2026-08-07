import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { explorationCandidatesEditorClient } from "./exploration-candidates-editor-api";
import { confirmSourceRevision } from "./source-revision";

const CARD_ID = "11111111-1111-4111-8111-111111111111";

describe("exploration candidates editor revision client", () => {
  beforeEach(() => {
    confirmSourceRevision("exploration-candidates", { sourceRevision: "loaded-revision" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the confirmed source revision and advances it after a save", async () => {
    const fetcher = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        clientRevision: 1,
        confirmation: {
          cardId: CARD_ID,
          selectionKind: "prose",
          selectedTemplatePairId: "pair-2",
          selectedRank: 2,
        },
        sourceRevision: "first-save-revision",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        clientRevision: 2,
        confirmation: {
          cardId: CARD_ID,
          selectionKind: "actions",
          selectedTemplatePairId: "pair-3",
          selectedRank: 3,
        },
        sourceRevision: "second-save-revision",
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    await explorationCandidatesEditorClient.saveSelection({
      cardId: CARD_ID,
      templatePairId: "pair-2",
      selectionKind: "prose",
      clientRevision: 1,
    });
    await explorationCandidatesEditorClient.saveSelection({
      cardId: CARD_ID,
      templatePairId: "pair-3",
      selectionKind: "actions",
      clientRevision: 2,
    });

    const firstBody = fetcher.mock.calls[0]?.[1]?.body;
    const secondBody = fetcher.mock.calls[1]?.[1]?.body;
    if (typeof firstBody !== "string" || typeof secondBody !== "string") {
      throw new Error("Expected JSON request bodies");
    }
    expect(JSON.parse(firstBody)).toMatchObject({
      expectedSourceRevision: "loaded-revision",
    });
    expect(JSON.parse(secondBody)).toMatchObject({
      expectedSourceRevision: "first-save-revision",
    });
  });
});
