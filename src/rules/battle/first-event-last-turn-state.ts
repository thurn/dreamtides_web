/** Exact first-event provenance required by the preceding-global-turn copying instruction. */
import { createCatalog, type EngineCatalog } from "../../engine/catalog";
import { contentAvatarDefinitions, contentCardDefinitions, contentDreamsignDefinitions, contentDreamwellDefinitions, contentFigmentDefinitions } from "../../engine/content-catalog";
import { BASE_VARIANT, type Ability } from "../../engine/dsl/types";
import { instanceOrigin, originAbilities } from "../../engine/rules/activation";
import { variantOf } from "../../engine/state/create";
import { SIDES } from "../../engine/state/ids";
import type { AbilityOrigin } from "../../engine/state/types";
import type { EngineBattleFold } from "./fold";
import { getBattleInitProvider } from "./journey-battle";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Only this exact instruction requires this provenance, including a retained nested effect. */
function readsFirstEvent(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(readsFirstEvent);
  return record(value) && (value.op === "copyFirstEventLastTurnToHand" || Object.values(value).some(readsFirstEvent));
}

function currentCatalog(): EngineCatalog {
  return getBattleInitProvider()?.engine.catalog ?? createCatalog(contentCardDefinitions(), contentDreamwellDefinitions(), {
    avatars: contentAvatarDefinitions(), dreamsigns: contentDreamsignDefinitions(),
  }, contentFigmentDefinitions());
}

/** Required origins include a ceased source's queued, stacked, or delayed ability. */
export function hasUnknownFirstEventHistory(fold: EngineBattleFold, catalog = currentCatalog()): boolean {
  const states = [fold.slice.committed, ...(fold.slice.history === undefined ? [] : [fold.slice.history.base.committed])];
  if (!states.some(state => state.firstEventHistory?.current == null ||
      state.turn.turnNumber > 1 && state.firstEventHistory?.previous == null)) return false;
  const reads = (get: () => readonly Ability[]): boolean => {
    try { return readsFirstEvent(get()); } catch { return false; }
  };
  if (fold.init.dreamwell.some(id => reads(() => catalog.dreamwellCard(id).abilities(BASE_VARIANT))) ||
      states.some(state => [...state.dreamwell.catalog, ...state.dreamwell.deck].some(id => reads(() => catalog.dreamwellCard(id).abilities(BASE_VARIANT))))) return true;
  if (SIDES.some(side => {
    const avatar = fold.init.avatars?.[side];
    return avatar !== undefined && reads(() => catalog.avatar(avatar).abilities(BASE_VARIANT)) ||
      (fold.init.dreamsigns?.[side] ?? []).some(id => reads(() => catalog.dreamsign(id).abilities(BASE_VARIANT))) ||
      fold.init.decks[side].some(entry => reads(() => catalog.variantCard(entry.cardId, variantOf(entry)).abilities(variantOf(entry))));
  })) return true;
  const retained = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(retained);
    if (!record(value)) return false;
    if (readsFirstEvent(value)) return true;
    // Origin containers are the engine's typed stack/queue/delayed records, never printing guesses.
    if (record(value.origin) && reads(() => originAbilities(catalog, value.origin as AbilityOrigin))) return true;
    return Object.values(value).some(retained);
  };
  return states.some(state => SIDES.some(side => {
    const avatar = state.sides[side].avatar;
    return avatar !== null && reads(() => catalog.avatar(avatar.id).abilities(BASE_VARIANT)) ||
      state.sides[side].dreamsigns.some(sign => reads(() => catalog.dreamsign(sign.id).abilities(BASE_VARIANT)));
  }) || Object.values(state.instances).some(card => reads(() => originAbilities(catalog, instanceOrigin(card)))) ||
    retained(state.stack) || retained(state.triggerQueue) || retained(state.floating));
}

/** Verified checkpoints use their preserved genesis and intents when required legacy provenance is unknown. */
export function assertFirstEventHistoryCheckpoint(value: unknown): void {
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (!record(item)) return;
    if (record(item.init) && record(item.init.decks) && Array.isArray(item.init.decks.player) && Array.isArray(item.init.decks.enemy) &&
        record(item.slice) && record(item.slice.committed) && record(item.slice.committed.instances) && record(item.slice.committed.sides) &&
        hasUnknownFirstEventHistory(item as unknown as EngineBattleFold)) {
      throw new Error("Previous-turn first-event checkpoint requires known provenance from genesis replay");
    }
    Object.values(item).forEach(visit);
  };
  visit(value);
}
