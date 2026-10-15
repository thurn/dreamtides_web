import { expectedVerifiedText } from "../dsl/verified-text";
import { parseGlossaryEntryId } from "../../types/identifiers";
import type { EngineTransfigurationDefinition } from "../transfigurations";

export const hastened: EngineTransfigurationDefinition = {
  id: "Hastened", uuid: parseGlossaryEntryId("19f6c2c9-dd6b-4d65-9f95-f6a3486772cc"),
  verifiedText: expectedVerifiedText("Make it Fast"),
  eligible: card => card.cardType === "event" && card.speed === "standard",
  transform: card => ({ ...card, speed: "fast" }),
};
