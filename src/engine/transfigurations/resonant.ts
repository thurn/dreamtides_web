import type { Ability, Trigger } from "../dsl/types";
import { expectedVerifiedText } from "../dsl/verified-text";
import { parseGlossaryEntryId } from "../../types/identifiers";
import type { EngineTransfigurationDefinition, TransfigurationCard } from "../transfigurations";

function contains(trigger: Trigger, named: "dawn" | "materialized" | "dissolved"): boolean {
  return trigger.on === named || trigger.on === "either" && trigger.triggers.some(branch => contains(branch, named));
}

function changed(ability: Ability, card: TransfigurationCard): Ability | null {
  if (card.resonantChange === "oncePerTurn") {
    if ((ability.kind === "activated" || ability.kind === "triggered") && ability.oncePerTurn === true) {
      const { oncePerTurn: _limit, ...rest } = ability;
      return rest;
    }
    if (ability.kind === "static" && ability.effect.op === "playFromZone" && ability.effect.oncePerTurn === true) {
      const { oncePerTurn: _limit, ...effect } = ability.effect;
      return { ...ability, effect };
    }
    return null;
  }
  const occasion = card.resonantChange;
  if (occasion === null || ability.kind !== "triggered" || !contains(ability.trigger, occasion)) return null;
  const extra = occasion === "dawn" ? "materialized" : "dissolved";
  return contains(ability.trigger, extra) ? ability : { ...ability, trigger: { on: "either", triggers: [ability.trigger, { on: extra }] } };
}

export const resonant: EngineTransfigurationDefinition = {
  id: "Resonant", uuid: parseGlossaryEntryId("c3fa83af-ee3b-47cd-8112-5e5cc38821de"),
  verifiedText: expectedVerifiedText("Widen a named trigger to fire more often"),
  eligible: card => card.resonantChange !== null,
  transform(card) {
    let applied = false;
    const abilities = card.abilities.map(ability => {
      if (applied) return ability;
      const replacement = changed(ability, card);
      if (replacement === null) return ability;
      applied = true;
      return replacement;
    });
    return { ...card, abilities };
  },
};
