import { expectedVerifiedText } from "../dsl/verified-text";
import { parseGlossaryEntryId } from "../../types/identifiers";
import type { EngineTransfigurationDefinition } from "../transfigurations";

export const kindled: EngineTransfigurationDefinition = {
  id: "Kindled",
  uuid: parseGlossaryEntryId("f40df441-0e44-4122-b4d4-cdc4085a9ffb"),
  verifiedText: expectedVerifiedText("Double its ✦, or set it to 1 if it is 0"),
  eligible: card => card.cardType === "character",
  transform(card) {
    const spark = typeof card.spark === "number" ? card.spark : 0;
    return { ...card, spark: spark === 0 ? 1 : spark * 2 };
  },
};
