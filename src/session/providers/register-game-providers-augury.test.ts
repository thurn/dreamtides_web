// Augury resolution through the real providers: accepting or declining an
// offer folds deterministically back to the dreamscape, and a granted card's
// deck entry is minted from the accepting event's seq.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { JourneyState } from "../../types/journey";
import { buildAuguryContext } from "../../journey_v2/context/buildAuguryContext";
import { generateAuguryEncounter } from "../../journey_v2/encounter/generateAuguryEncounter";
import { replayLog } from "../../rules/replay/replay";
import {
  clearGameProviders,
  registerGameProviders,
} from "./register-game-providers";
import {
  AUGURY_GENESIS,
  AUGURY_SITE_ID,
  ev,
  expectAllApplied,
  makeAuguryFixture,
} from "./register-game-providers.fixtures";

describe("registerGameProviders — augury resolution", () => {
  const fixture = makeAuguryFixture();
  const encounter = generateAuguryEncounter(
    buildAuguryContext({
      journeyState: fixture.journey,
      journeyContent: fixture.content,
      site: fixture.site,
    }),
  );
  const directOffer = encounter.offers.find(
    ({ applyPayload }) => applyPayload !== undefined,
  );

  beforeAll(() => {
    registerGameProviders(fixture.content);
  });
  afterAll(() => {
    clearGameProviders();
  });

  it.each([
    {
      type: "ACCEPT_AUGURY_OFFER" as const,
      payload: () => ({
        siteId: AUGURY_SITE_ID,
        encounterSignature: directOffer?.encounterSignature,
        offerId: directOffer?.offerId,
        archetypeId: directOffer?.archetypeId,
      }),
    },
    {
      type: "DECLINE_AUGURY" as const,
      payload: () => ({
        siteId: AUGURY_SITE_ID,
        encounterSignature: encounter.encounterSignature,
        offerId: encounter.offers[0]?.offerId,
      }),
    },
  ])("folds LOAD_STATE -> $type: applies, returns to the dreamscape, deterministic", ({ type, payload }) => {
    const events = [
      ev(1, "LOAD_STATE", { snapshot: fixture.journey }),
      ev(2, type, payload()),
    ];
    const first = replayLog({ genesis: AUGURY_GENESIS, events });

    expectAllApplied(first.outcomes);
    expect(first.finalState.journey.screen).toEqual({ type: "dreamscape" });
    expect(replayLog({ genesis: AUGURY_GENESIS, events }).finalHash).toBe(
      first.finalHash,
    );
  });

  it("mints a granted card's deck entry through the shared mintEntryId(deck, seq, index) scheme", () => {
    const mintJourney: JourneyState = {
      ...fixture.journey,
      siteRuntime: {
        ...fixture.journey.siteRuntime,
        [AUGURY_SITE_ID]: {
          kind: "augury",
          completed: false,
          forcedArchetypeId: "fit_card_draft",
        },
      },
    };
    const mintEncounter = generateAuguryEncounter(
      buildAuguryContext({
        journeyState: mintJourney,
        journeyContent: fixture.content,
        site: fixture.site,
      }),
    );
    const isCardGrant = (candidate: { applyPayload: { kind: string } }) =>
      candidate.applyPayload.kind === "add_catalog_card";
    const offer = mintEncounter.offers.find((o) =>
      o.choiceRequest?.candidates.some(isCardGrant),
    );
    const candidate = offer?.choiceRequest?.candidates.find(isCardGrant);
    if (offer === undefined || candidate === undefined) {
      throw new Error("expected a card-grant offer");
    }

    const result = replayLog({
      genesis: AUGURY_GENESIS,
      events: [
        ev(1, "LOAD_STATE", { snapshot: mintJourney }),
        ev(2, "ACCEPT_AUGURY_OFFER", {
          siteId: AUGURY_SITE_ID,
          encounterSignature: offer.encounterSignature,
          offerId: offer.offerId,
          archetypeId: offer.archetypeId,
          choice: { choiceId: candidate.choiceId },
        }),
      ],
    });
    expectAllApplied(result.outcomes);

    const before = new Set(mintJourney.deck.map(({ entryId }) => entryId));
    const minted = result.finalState.journey.deck.filter(
      ({ entryId }) => !before.has(entryId),
    );
    // Minted at the ACCEPT_AUGURY_OFFER event's own seq (2), index 0.
    expect(minted.map(({ entryId }) => entryId)).toEqual(["deck-2-0"]);
  });
});

