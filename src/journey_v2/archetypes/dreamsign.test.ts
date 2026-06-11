import { describe, expect, it } from "vitest";
import { merchantRng } from "../signals/rng";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsignProfile,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestQuestState,
  makeMerchantTestSite,
  makeMerchantTestDreamsign,
} from "../testing/fixtures";
import type { DreamsignProfile } from "../../data/dreamsign-profiles";
import type { MerchantContext } from "../types";
import { dreamsignBuilder, dreamsignDraftBuilder } from "./dreamsign";

function makeContext(input: {
  dreamsignTemplates?: ReturnType<typeof makeMerchantTestDreamsignTemplate>[];
  heldDreamsignIds?: string[];
}): MerchantContext {
  const dreamsignTemplates = input.dreamsignTemplates ?? [];
  const dreamsigns = (input.heldDreamsignIds ?? []).map((id) =>
    makeMerchantTestDreamsign({ id, name: `Held ${id}` }),
  );
  const questContent = makeMerchantTestContent({
    cards: [],
    dreamsignTemplates,
  });
  const questState = makeMerchantTestQuestState({ dreamsigns });
  return buildMerchantContext({
    questState,
    questContent,
    site: makeMerchantTestSite(),
  });
}

// ---------------------------------------------------------------------------
// Bug-class: a held dreamsign id never appears in the chooser
// ---------------------------------------------------------------------------

describe("dreamsign_draft — held dreamsign id never appears", () => {
  it("does not include any held dreamsign in the chooser candidates", () => {
    // 4 templates, first 2 are held
    const templates = [
      makeMerchantTestDreamsignTemplate({ id: "ds-held-1" }),
      makeMerchantTestDreamsignTemplate({ id: "ds-held-2" }),
      makeMerchantTestDreamsignTemplate({ id: "ds-free-3" }),
      makeMerchantTestDreamsignTemplate({ id: "ds-free-4" }),
    ];
    const context = makeContext({
      dreamsignTemplates: templates,
      heldDreamsignIds: ["ds-held-1", "ds-held-2"],
    });

    expect(dreamsignDraftBuilder.eligible(context)).toBe(true);

    const heldSet = new Set(["ds-held-1", "ds-held-2"]);

    for (let seed = 0; seed < 20; seed += 1) {
      const rng = merchantRng("dreamsign-draft-held-test", String(seed));
      const offer = dreamsignDraftBuilder.build(context, rng);
      if (offer === null) continue;

      if (offer.choiceRequest !== undefined) {
        for (const candidate of offer.choiceRequest.candidates) {
          expect(heldSet.has(candidate.dreamsignId ?? "")).toBe(false);
          // Also check the payload
          if (candidate.applyPayload.kind === "add_dreamsign") {
            expect(heldSet.has(candidate.applyPayload.dreamsignId)).toBe(false);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Bug-class: chooser has 2-4 distinct unheld dreamsigns
// ---------------------------------------------------------------------------

describe("dreamsign_draft — chooser has 2-4 distinct unheld dreamsigns", () => {
  it("returns a chooser with 2-4 distinct dreamsigns when enough unheld exist", () => {
    const templates = Array.from({ length: 6 }, (_, i) =>
      makeMerchantTestDreamsignTemplate({ id: `ds-${String(i)}` }),
    );
    const context = makeContext({ dreamsignTemplates: templates });

    expect(dreamsignDraftBuilder.eligible(context)).toBe(true);

    for (let seed = 0; seed < 30; seed += 1) {
      const rng = merchantRng("dreamsign-draft-size-test", String(seed));
      const offer = dreamsignDraftBuilder.build(context, rng);
      if (offer === null) continue;

      expect(offer.choiceRequest).toBeDefined();
      if (offer.choiceRequest === undefined) continue;

      const count = offer.choiceRequest.candidates.length;
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(4);

      // All dreamsign ids are distinct
      const ids = offer.choiceRequest.candidates.map((c) => c.dreamsignId ?? c.choiceId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("returns at most as many candidates as unheld dreamsigns", () => {
    // Only 2 unheld dreamsigns — should still work (min is 2)
    const templates = [
      makeMerchantTestDreamsignTemplate({ id: "ds-a" }),
      makeMerchantTestDreamsignTemplate({ id: "ds-b" }),
    ];
    const context = makeContext({ dreamsignTemplates: templates });

    expect(dreamsignDraftBuilder.eligible(context)).toBe(true);

    const rng = merchantRng("dreamsign-draft-small-pool", "0");
    const offer = dreamsignDraftBuilder.build(context, rng);
    expect(offer).not.toBeNull();
    if (offer === null) return;

    expect(offer.choiceRequest).toBeDefined();
    if (offer.choiceRequest === undefined) return;

    // Cannot exceed the pool size
    expect(offer.choiceRequest.candidates.length).toBeLessThanOrEqual(2);
    expect(offer.choiceRequest.candidates.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Bug-class: a generic (featureless) sign is offered as "suited to your deck"
// even though a genuinely-matching sign is available. The suited pool tiers so
// that a deck-covered sign always wins out over a generic blessing.
// ---------------------------------------------------------------------------

describe("suited dreamsign pool — generic signs never crowd out a real match", () => {
  // A Warrior deck, one Warrior-keyed sign (genuinely covered) and several
  // featureless signs (no profile entry → generic blessing only).
  function makeWarriorDeckContext(input: {
    coveredSignIds: string[];
    genericSignIds: string[];
  }): MerchantContext {
    const deckCards = Array.from({ length: 3 }, (_, i) =>
      makeMerchantTestCard({
        id: `warrior-uuid-${String(i)}`,
        cardNumber: 100 + i,
        subtype: "Warrior",
      }),
    );
    const templates = [...input.coveredSignIds, ...input.genericSignIds].map(
      (id) => makeMerchantTestDreamsignTemplate({ id }),
    );
    const profiles = new Map<string, DreamsignProfile>(
      input.coveredSignIds.map((id) => [
        id,
        makeMerchantTestDreamsignProfile({ id, subtypes: ["Warrior"] }),
      ]),
    );
    const questContent = makeMerchantTestContent({
      cards: deckCards,
      dreamsignTemplates: templates,
      dreamsignProfiles: profiles,
    });
    const questState = makeMerchantTestQuestState({
      deck: deckCards.map((card, i) =>
        makeMerchantTestDeckEntry({
          entryId: `deck-entry-${String(i)}`,
          cardNumber: card.cardNumber,
        }),
      ),
    });
    return buildMerchantContext({
      questState,
      questContent,
      site: makeMerchantTestSite(),
    });
  }

  it("single offer always picks the covered sign over a generic one", () => {
    const context = makeWarriorDeckContext({
      coveredSignIds: ["ds-warrior"],
      genericSignIds: ["ds-generic-1", "ds-generic-2", "ds-generic-3"],
    });

    for (let seed = 0; seed < 40; seed += 1) {
      const rng = merchantRng("dreamsign-suited-single", String(seed));
      const offer = dreamsignBuilder.build(context, rng);
      expect(offer).not.toBeNull();
      if (offer === null) continue;
      // The only genuinely-suited sign is the Warrior one; the band floor must
      // not let a generic sign be offered as "suited to your deck".
      expect(offer.targetKey).toBe("ds-warrior");
    }
  });

  it("draft chooser contains only covered signs when enough exist", () => {
    const context = makeWarriorDeckContext({
      coveredSignIds: ["ds-warrior-1", "ds-warrior-2", "ds-warrior-3"],
      genericSignIds: ["ds-generic-1", "ds-generic-2", "ds-generic-3"],
    });
    const covered = new Set(["ds-warrior-1", "ds-warrior-2", "ds-warrior-3"]);

    for (let seed = 0; seed < 40; seed += 1) {
      const rng = merchantRng("dreamsign-suited-draft", String(seed));
      const offer = dreamsignDraftBuilder.build(context, rng);
      if (offer?.choiceRequest === undefined) continue;
      for (const candidate of offer.choiceRequest.candidates) {
        expect(covered.has(candidate.dreamsignId ?? "")).toBe(true);
      }
    }
  });

  it("draft tops up with generics only when too few signs genuinely match", () => {
    // Only one covered sign — not enough for a 2-card chooser — so generics
    // fill in, but the covered sign remains available in the pool.
    const context = makeWarriorDeckContext({
      coveredSignIds: ["ds-warrior-1"],
      genericSignIds: ["ds-generic-1", "ds-generic-2", "ds-generic-3"],
    });

    const rng = merchantRng("dreamsign-suited-topup", "0");
    const offer = dreamsignDraftBuilder.build(context, rng);
    expect(offer).not.toBeNull();
    if (offer?.choiceRequest === undefined) return;
    expect(offer.choiceRequest.candidates.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Bug-class: eligibility requires >= 2 unheld dreamsigns
// ---------------------------------------------------------------------------

describe("dreamsign_draft — eligibility", () => {
  it("is ineligible with 0 unheld dreamsigns", () => {
    const context = makeContext({ dreamsignTemplates: [] });
    expect(dreamsignDraftBuilder.eligible(context)).toBe(false);
  });

  it("is ineligible with exactly 1 unheld dreamsign", () => {
    const templates = [makeMerchantTestDreamsignTemplate({ id: "ds-solo" })];
    const context = makeContext({ dreamsignTemplates: templates });
    expect(dreamsignDraftBuilder.eligible(context)).toBe(false);
  });

  it("is eligible with exactly 2 unheld dreamsigns", () => {
    const templates = [
      makeMerchantTestDreamsignTemplate({ id: "ds-one" }),
      makeMerchantTestDreamsignTemplate({ id: "ds-two" }),
    ];
    const context = makeContext({ dreamsignTemplates: templates });
    expect(dreamsignDraftBuilder.eligible(context)).toBe(true);
  });

  it("counts only unheld dreamsigns toward eligibility", () => {
    // 3 templates total, 2 held → only 1 unheld → ineligible
    const templates = [
      makeMerchantTestDreamsignTemplate({ id: "ds-held-x" }),
      makeMerchantTestDreamsignTemplate({ id: "ds-held-y" }),
      makeMerchantTestDreamsignTemplate({ id: "ds-free-z" }),
    ];
    const context = makeContext({
      dreamsignTemplates: templates,
      heldDreamsignIds: ["ds-held-x", "ds-held-y"],
    });
    // 1 unheld → ineligible for draft (needs >= 2)
    expect(dreamsignDraftBuilder.eligible(context)).toBe(false);
  });
});
