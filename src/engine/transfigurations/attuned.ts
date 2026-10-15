import type { Cost } from "../dsl/types";
import { expectedVerifiedText } from "../dsl/verified-text";
import { parseGlossaryEntryId } from "../../types/identifiers";
import { TRANSFIGURATION_RULES } from "../../content/transfiguration";
import type { EngineTransfigurationDefinition } from "../transfigurations";

/** Printed order includes optional payments and the alternatives within a choice. */
function hasEnergy(cost: Cost): boolean {
  if (cost.cost === "energy") return cost.amount > 0;
  if (cost.cost === "optional") return cost.costs.some(hasEnergy);
  if (cost.cost === "choice") return cost.options.some(option => option.some(hasEnergy));
  return false;
}

function reduceFirst(costs: readonly Cost[], amount: number, minimum: number): readonly Cost[] {
  let changed = false;
  return costs.map(cost => {
    if (changed || !hasEnergy(cost)) return cost;
    changed = true;
    if (cost.cost === "energy") return { ...cost, amount: Math.max(minimum, cost.amount - amount) };
    if (cost.cost === "optional") return { ...cost, costs: reduceFirst(cost.costs, amount, minimum) as typeof cost.costs };
    if (cost.cost === "choice") {
      let selected = false;
      return { ...cost, options: cost.options.map(option => {
        if (selected || !option.some(hasEnergy)) return option;
        selected = true;
        return reduceFirst(option, amount, minimum) as typeof option;
      }) };
    }
    return cost;
  });
}

export const attuned: EngineTransfigurationDefinition = {
  id: "Attuned", uuid: parseGlossaryEntryId("980d283a-9558-4b66-84a0-fcb91fdf4ceb"),
  verifiedText: expectedVerifiedText("Reduce an activated ability's cost by 1●"),
  eligible: card => card.abilities.some(ability => ability.kind === "activated" && ability.costs.some(hasEnergy)),
  transform(card) {
    const operation = TRANSFIGURATION_RULES.attuned;
    let changed = false;
    return { ...card, abilities: card.abilities.map(ability => {
      if (changed || ability.kind !== "activated" || !ability.costs.some(hasEnergy)) return ability;
      changed = true;
      return { ...ability, costs: reduceFirst(ability.costs, operation.amount, operation.minimum) };
    }) };
  },
};
