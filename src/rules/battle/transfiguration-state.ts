/** Catalog-semantic acceptance of chronological histories at the saved battle boundary. */
import { createCatalog, type EngineCatalog } from "../../engine/catalog";
import { contentAvatarDefinitions, contentCardDefinitions, contentDreamsignDefinitions, contentDreamwellDefinitions, contentFigmentDefinitions } from "../../engine/content-catalog";
import type { Variant } from "../../engine/dsl/types";
import type { CardId } from "../../engine/state/ids";
import { SIDES } from "../../engine/state/ids";
import { variantOf } from "../../engine/state/create";
import type { AbilityOrigin, GainedAbilities, Printing, QueuedTrigger } from "../../engine/state/types";
import type { EngineBattleFold } from "./fold";
import { getBattleInitProvider } from "./journey-battle";

function currentCatalog(): EngineCatalog {
  return getBattleInitProvider()?.engine.catalog ?? createCatalog(contentCardDefinitions(), contentDreamwellDefinitions(), {
    avatars: contentAvatarDefinitions(), dreamsigns: contentDreamsignDefinitions(),
  }, contentFigmentDefinitions());
}

/** Surrounding shapes have already been decoded; every variant stays associated with its actual source. */
export function hasInvalidTransfigurationApplications(fold: EngineBattleFold, supplied?: EngineCatalog): boolean {
  let catalog = supplied;
  const card = (id: CardId, variant: Variant): void => {
    if (variant.transfigurationApplications === undefined) return;
    catalog ??= currentCatalog();
    catalog.variantCard(id, variant);
  };
  const tuple = (value: { readonly printing: Printing; readonly variant: Variant }): void => {
    if (value.variant.transfigurationApplications === undefined) return;
    if (value.printing.kind === "figment") throw new Error("Native figment cannot carry card transfiguration applications");
    card(value.printing.cardId, value.variant);
  };
  const gained = (groups: readonly GainedAbilities[] = []): void => {
    for (const group of groups) if ("cardId" in group) card(group.cardId, group.variant);
  };
  const origin = (value: AbilityOrigin): void => {
    if (value.kind === "card") { card(value.cardId, value.variant); gained(value.gained); }
  };
  const queued = (value: QueuedTrigger): void => {
    for (let current: QueuedTrigger | undefined = value; current !== undefined; current = current.triggeringAbility?.occurrence) {
      if (current.kind === "dreamwellBonus") continue;
      origin(current.origin);
      if (current.handCopy !== undefined) tuple(current.handCopy);
      if (current.abandonedCopy !== undefined) tuple(current.abandonedCopy);
      if (current.abandonedNamed !== undefined) origin(current.abandonedNamed.origin);
    }
  };
  try {
    for (const side of SIDES) for (const entry of fold.init.decks[side]) {
      if (entry.transfigurationApplications !== undefined) card(entry.cardId, variantOf(entry));
    }
    for (const state of [fold.slice.committed, ...(fold.slice.history === undefined ? [] : [fold.slice.history.base.committed])]) {
      for (const value of Object.values(state.instances)) { tuple(value); gained(value.status.gainedAbilities); }
      for (const side of SIDES) {
        for (const value of state.rememberedCards?.[side] ?? []) { tuple(value); gained(value.status.gainedAbilities); }
        for (const played of state.turnLog.played[side]) if (played.copiable !== undefined) tuple(played.copiable);
      }
      for (const value of state.stack) if (value.kind === "ability") origin(value.origin);
      for (const value of state.triggerQueue) queued(value);
      for (const effect of state.floating) {
        if (effect.change.kind === "abilities") gained([effect.change]);
        if (effect.change.kind === "trigger") origin(effect.change.ref.origin);
      }
      for (const side of SIDES) {
        const current = state.firstEventHistory?.current?.[side], previous = state.firstEventHistory?.previous?.[side];
        if (current != null) tuple(current);
        if (previous != null) tuple(previous);
      }
    }
    return false;
  } catch { return true; }
}
