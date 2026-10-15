import { event } from "../dsl/builders";
import type { DrawNode } from "../effects/primitives/draw";
import { expectedVerifiedText } from "../dsl/verified-text";
import { parseGlossaryEntryId } from "../../types/identifiers";
import type { EngineTransfigurationDefinition } from "../transfigurations";

export const inspired: EngineTransfigurationDefinition = {
  id: "Inspired", uuid: parseGlossaryEntryId("f0ff63b4-424b-4ae9-81d5-a4f6546afa3f"),
  verifiedText: expectedVerifiedText('Add "Draw a card" to its rules text'),
  eligible: card => card.cardType === "event",
  transform: card => ({ ...card, abilities: [...card.abilities, event({ op: "draw", count: 1, player: "you" } satisfies DrawNode)] }),
};
