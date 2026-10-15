import { expectedVerifiedText } from "../dsl/verified-text";
import { parseGlossaryEntryId } from "../../types/identifiers";
import type { EngineTransfigurationDefinition } from "../transfigurations";

export const amplified: EngineTransfigurationDefinition = {
  id: "Amplified", uuid: parseGlossaryEntryId("a2c070ca-eacd-4cca-b69d-3d48f0787a16"),
  verifiedText: expectedVerifiedText("Replace its ability with its authored stronger form"),
  eligible: card => card.transfiguration?.amplified === true,
  // The dispatcher selects the authored variant before structural changes.
  transform: card => card,
};
