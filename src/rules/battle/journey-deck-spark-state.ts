/** C4-only declaration boundary: required physical origins agree with immutable battle init. */
import { createCatalog, type EngineCatalog } from "../../engine/catalog";
import { contentAvatarDefinitions, contentCardDefinitions, contentDreamsignDefinitions } from "../../engine/content-catalog";
import { instanceOrigin, originAbilities } from "../../engine/rules/activation";
import { variantOf } from "../../engine/state/create";
import { SIDES } from "../../engine/state/ids";
import { BASE_VARIANT, type Ability } from "../../engine/dsl/types";
import type { EngineBattleFold } from "./fold";
import { getBattleInitProvider } from "./journey-battle";

function sourceHasC4(abilities: readonly Ability[]): boolean {
  return abilities.some(ability => ability.kind === "static" && ability.effect.op === "journeyDeckSparkModifier");
}

function currentCatalog(): EngineCatalog {
  return getBattleInitProvider()?.engine.catalog ?? createCatalog(contentCardDefinitions(), [], {
    avatars: contentAvatarDefinitions(), dreamsigns: contentDreamsignDefinitions(),
  });
}

/** A declaration or retained source using this exact static capability, not a card name or UUID heuristic. */
function requiresJourneyDeckSparkOrigins(fold: EngineBattleFold, catalog: EngineCatalog): boolean {
  const states = [fold.slice.committed, ...(fold.slice.history === undefined ? [] : [fold.slice.history.base.committed])];
  const abilities = (read: () => readonly Ability[]): boolean => {
    try { return sourceHasC4(read()); } catch { return false; }
  };
  const declared = SIDES.some(side => {
    const avatar = fold.init.avatars?.[side];
    return (avatar !== undefined && abilities(() => catalog.avatar(avatar).abilities(BASE_VARIANT))) ||
      (fold.init.dreamsigns?.[side] ?? []).some(id => abilities(() => catalog.dreamsign(id).abilities(BASE_VARIANT))) ||
      fold.init.decks[side].some(entry => abilities(() => catalog.card(entry.cardId).abilities(variantOf(entry))));
  });
  const retained = states.some(state => SIDES.some(side => {
    const avatar = state.sides[side].avatar;
    return (avatar !== null && abilities(() => catalog.avatar(avatar.id).abilities(BASE_VARIANT))) ||
      state.sides[side].dreamsigns.some(sign => abilities(() => catalog.dreamsign(sign.id).abilities(BASE_VARIANT)));
  }) || Object.values(state.instances).some(card => abilities(() => originAbilities(catalog, instanceOrigin(card)))));
  return declared || retained;
}

export function hasUnknownJourneyDeckSparkOrigins(fold: EngineBattleFold, catalog = currentCatalog()): boolean {
  const states = [fold.slice.committed, ...(fold.slice.history === undefined ? [] : [fold.slice.history.base.committed])];
  return requiresJourneyDeckSparkOrigins(fold, catalog) && states.some(state => Object.values(state.instances)
    .some(card => !card.status.created && card.journeyDeck === undefined));
}

/** Check the declared cohort, never infer individual membership from printing, zone, holder, or instance id. */
export function hasInvalidJourneyDeckSparkOrigins(fold: EngineBattleFold, catalog = currentCatalog()): boolean {
  if (!requiresJourneyDeckSparkOrigins(fold, catalog)) return false;
  const states = [fold.slice.committed, ...(fold.slice.history === undefined ? [] : [fold.slice.history.base.committed])];
  return states.some(state => {
    const cards = Object.values(state.instances);
    const known = [...cards, ...Object.values(state.rememberedCards ?? {}).flat()];
    return cards.some(card => !card.status.created && card.journeyDeck === undefined) ||
      known.some(card => card.journeyDeck === true && (card.status.created || card.printing.kind !== "card")) ||
      SIDES.some(side => cards.filter(card => card.owner === side && card.journeyDeck === true).length !== fold.init.decks[side].length);
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Required C4 declarations use verifiedCheckpoint recovery to replay preserved genesis and events. */
export function assertJourneyDeckSparkCheckpoint(value: unknown): void {
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (!record(item)) return;
    if (record(item.init) && record(item.init.decks) && Array.isArray(item.init.decks.player) && Array.isArray(item.init.decks.enemy) &&
        record(item.slice) && record(item.slice.committed) && record(item.slice.committed.instances) && record(item.slice.committed.sides)) {
      if (hasInvalidJourneyDeckSparkOrigins(item as unknown as EngineBattleFold)) {
        throw new Error("C4 checkpoint requires consistent original journey-deck provenance from genesis replay");
      }
    }
    Object.values(item).forEach(visit);
  };
  visit(value);
}
