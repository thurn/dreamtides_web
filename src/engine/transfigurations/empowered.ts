import { energy } from "../dsl/builders";
import { fixedEnergy } from "../dsl/energy";
import { expectedVerifiedText } from "../dsl/verified-text";
import { parseGlossaryEntryId } from "../../types/identifiers";
import type { EngineTransfigurationDefinition } from "../transfigurations";

export const empowered: EngineTransfigurationDefinition = {
  id: "Empowered", uuid: parseGlossaryEntryId("a66c513e-500b-4891-8c09-9641ae300ba4"),
  verifiedText: expectedVerifiedText("Halve its ● cost, rounded down"),
  eligible: card => fixedEnergy(card.costs) > 0,
  transform: card => ({ ...card, costs: [energy(Math.floor(fixedEnergy(card.costs) / 2))] }),
};
