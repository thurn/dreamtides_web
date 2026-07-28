import { describe, expect, it } from "vitest";
import { asCardId } from "../../types/card-identity";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestJourneyState,
  makeMerchantTestSite,
} from "../testing/fixtures";
import type { MerchantArchetypeId } from "../archetypes/types";
import { MERCHANT_ARCHETYPE_FAMILIES } from "../archetypes/types";
import type { MerchantContext, MerchantOffer } from "../types";
import {
  MERCHANT_ACCEPT_REACTIONS,
  MERCHANT_DIALOGUE_BANKS,
  renderMerchantDialogue,
} from "./dialogue";

const ALL_ARCHETYPE_IDS = Object.keys(
  MERCHANT_ARCHETYPE_FAMILIES,
) as MerchantArchetypeId[];

const NAME_SLOT = "{name}";

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

function makeContext(input?: { seed?: string; siteId?: string }): MerchantContext {
  const journeyContent = makeMerchantTestContent({
    cards: [
      makeMerchantTestCard({
        id: asCardId("11111111-1111-4111-8111-111111111111"),
        cardNumber: 1,
      }),
    ],
  });
  const journeyState = makeMerchantTestJourneyState({
    seed: input?.seed ?? "dialogue-fixture-seed",
  });
  const site = makeMerchantTestSite({
    id: input?.siteId ?? "site-dialogue-fixture",
  });
  return buildMerchantContext({ journeyState, journeyContent, site });
}

function makeOffer(input: {
  archetypeId: MerchantArchetypeId;
  offerId: string;
  displayName?: string;
}): MerchantOffer {
  const card = makeMerchantTestCard({
    id: asCardId("22222222-2222-4222-8222-222222222222"),
    cardNumber: 2,
  });
  return {
    offerId: input.offerId,
    encounterSignature: "fixture-signature",
    archetypeId: input.archetypeId,
    family: MERCHANT_ARCHETYPE_FAMILIES[input.archetypeId],
    title: "Fixture offer title",
    summary: "Fixture offer summary",
    targetKey: "fixture-target",
    gameObjects:
      input.displayName === undefined
        ? []
        : [
            {
              objectType: "catalogCard",
              cardUuid: card.id,
              cardNumber: card.cardNumber,
              card,
              displayName: input.displayName,
            },
          ],
    applyPayload: {
      kind: "add_catalog_card",
      cardUuid: card.id,
      cardNumber: card.cardNumber,
    },
  };
}

// ---------------------------------------------------------------------------
// Bug-class: bank coverage and slot-free, spoiler-free copy
// ---------------------------------------------------------------------------

describe("dialogue banks — coverage and slot-free copy", () => {
  it("covers every archetype with a non-empty bank", () => {
    const bankIds = Object.keys(MERCHANT_DIALOGUE_BANKS).sort();
    expect(bankIds).toEqual([...ALL_ARCHETYPE_IDS].sort());
    for (const archetypeId of ALL_ARCHETYPE_IDS) {
      const bank = MERCHANT_DIALOGUE_BANKS[archetypeId];
      expect(bank.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("never embeds a {name} slot in any template", () => {
    for (const archetypeId of ALL_ARCHETYPE_IDS) {
      for (const template of MERCHANT_DIALOGUE_BANKS[archetypeId]) {
        expect(template, `${archetypeId}: "${template}"`).not.toContain(
          NAME_SLOT,
        );
      }
    }
  });

  it("has only non-empty accept reactions", () => {
    expect(MERCHANT_ACCEPT_REACTIONS.length).toBeGreaterThan(0);
    for (const reaction of MERCHANT_ACCEPT_REACTIONS) {
      expect(wordCount(reaction), `"${reaction}"`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Bug-class: non-determinism (same encounter must produce the same line)
// ---------------------------------------------------------------------------

describe("renderMerchantDialogue — determinism", () => {
  it("returns identical output for the same context and offers", () => {
    const context = makeContext();
    const offers = [
      makeOffer({ archetypeId: "strong_card", offerId: "A", displayName: "Fixture Blade" }),
      makeOffer({ archetypeId: "purge", offerId: "B", displayName: "Fixture Husk" }),
    ];
    const first = renderMerchantDialogue({ context, offers });
    const second = renderMerchantDialogue({ context, offers });
    expect(second).toEqual(first);
  });

  it("hints at exactly one of the two offers", () => {
    const context = makeContext();
    const offers = [
      makeOffer({ archetypeId: "strong_card", offerId: "A", displayName: "Fixture Blade" }),
      makeOffer({ archetypeId: "purge", offerId: "B", displayName: "Fixture Husk" }),
    ];
    const rendered = renderMerchantDialogue({ context, offers });
    expect(["A", "B"]).toContain(rendered.line.offerId);
  });

  it("seeds the offer choice: both offers get hinted across sites", () => {
    const hinted = new Set<string>();
    for (let index = 0; index < 20; index += 1) {
      const context = makeContext({ siteId: `site-dialogue-${String(index)}` });
      const offers = [
        makeOffer({ archetypeId: "strong_card", offerId: "A", displayName: "Fixture Blade" }),
        makeOffer({ archetypeId: "purge", offerId: "B", displayName: "Fixture Husk" }),
      ];
      hinted.add(renderMerchantDialogue({ context, offers }).line.offerId);
    }
    expect([...hinted].sort()).toEqual(["A", "B"]);
  });
});

// ---------------------------------------------------------------------------
// Bug-class: target names or unfilled slots leaking into player-facing copy
// ---------------------------------------------------------------------------

describe("renderMerchantDialogue — spoiler-free copy", () => {
  it("never leaks a {name} slot or the target's display name", () => {
    for (const archetypeId of ALL_ARCHETYPE_IDS) {
      for (const displayName of ["Fixture Target", undefined]) {
        const context = makeContext();
        const offer = makeOffer({
          archetypeId,
          offerId: "A",
          ...(displayName === undefined ? {} : { displayName }),
        });
        const rendered = renderMerchantDialogue({ context, offers: [offer] });
        expect(rendered.line.line).not.toContain(NAME_SLOT);
        if (displayName !== undefined) {
          expect(rendered.line.line).not.toContain(displayName);
        }
        expect(rendered.line.line.length).toBeGreaterThan(0);
        expect(rendered.acceptReaction.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Bug-class: unintended copy drift (golden snapshot per archetype)
// ---------------------------------------------------------------------------

describe("renderMerchantDialogue — golden copy snapshot", () => {
  it("renders a stable line for one fixture encounter per archetype", () => {
    const renderedByArchetype: Record<string, string> = {};
    for (const archetypeId of ALL_ARCHETYPE_IDS) {
      const context = makeContext();
      const offer = makeOffer({
        archetypeId,
        offerId: "A",
        displayName: "Fixture Direwolf",
      });
      const rendered = renderMerchantDialogue({ context, offers: [offer] });
      renderedByArchetype[archetypeId] = rendered.line.line;
    }
    expect(renderedByArchetype).toMatchSnapshot();
  });

  it("renders a stable accept reaction for the fixture encounter", () => {
    const context = makeContext();
    const offer = makeOffer({
      archetypeId: "strong_card",
      offerId: "A",
      displayName: "Fixture Direwolf",
    });
    const rendered = renderMerchantDialogue({ context, offers: [offer] });
    expect(rendered.acceptReaction).toMatchSnapshot();
  });
});
