import { describe, expect, it } from "vitest";
import { merchantRng } from "../signals/rng";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsignProfile,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestJourneyState,
  makeMerchantTestSite,
} from "../testing/fixtures";
import type { DreamsignProfile } from "../../data/dreamsign-profiles";
import type { MerchantContext } from "../types";
import { asCardId } from "../../types/card-identity";
import { dreamsignBuilder } from "./dreamsign";

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
        id: asCardId(`warrior-uuid-${String(i)}`),
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
    const journeyContent = makeMerchantTestContent({
      cards: deckCards,
      dreamsignTemplates: templates,
      dreamsignProfiles: profiles,
    });
    const journeyState = makeMerchantTestJourneyState({
      deck: deckCards.map((card, i) =>
        makeMerchantTestDeckEntry({
          entryId: `deck-entry-${String(i)}`,
          cardNumber: card.cardNumber,
        }),
      ),
    });
    return buildMerchantContext({
      journeyState,
      journeyContent,
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
});
