import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyOnGainEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyOnGainEffect = { kind: "copyOwnedDreamsignOnGain" } as const satisfies JourneyOnGainEffect;

export default dreamsign({
  id: "0df9d72c-58ea-42a0-a72a-cbc540a1836a",
  name: "Voodoo Doll",
  imageName: "vudu_doll.png",
  imageAlt:
    "Stitched tan voodoo doll with pins, red button eye, and rough fabric",
  effectDescription:
    "When you gain this dreamsign, choose another dreamsign you own. This dreamsign becomes a copy of it.",
  rarity: "Common",
  tideIds: ["f93cefb1-3a37-4075-98f0-c006571edd09"],
  tags: ["J16", "Tag OK"],
  abilities: () => [],
  journeyOnGain: journeyOnGainEffect,
  verifiedText: expectedVerifiedText("When you gain this dreamsign, choose another dreamsign you own. This dreamsign becomes a copy of it."),
});
