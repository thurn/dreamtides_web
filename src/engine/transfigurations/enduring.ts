import { keyword } from "../dsl/builders";
import { expectedVerifiedText } from "../dsl/verified-text";
import { parseGlossaryEntryId } from "../../types/identifiers";
import type { EngineTransfigurationDefinition } from "../transfigurations";

export const enduring: EngineTransfigurationDefinition = {
  id: "Enduring", uuid: parseGlossaryEntryId("eb4cfc5f-237a-47cd-9215-7cce3f15583f"),
  verifiedText: expectedVerifiedText('Add "Reclaim" to its rules text'),
  eligible: card => card.cardType === "event",
  transform: card => ({ ...card, abilities: [...card.abilities, keyword("reclaim")] }),
};
