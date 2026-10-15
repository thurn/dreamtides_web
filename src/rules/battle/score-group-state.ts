/** Exact scoring provenance required by this Challenge's actual group-trigger capability. */
import { createCatalog, type EngineCatalog } from "../../engine/catalog";
import { contentAvatarDefinitions, contentCardDefinitions, contentDreamsignDefinitions } from "../../engine/content-catalog";
import { instanceOrigin, originAbilities } from "../../engine/rules/activation";
import { variantOf } from "../../engine/state/create";
import { SIDES } from "../../engine/state/ids";
import { BASE_VARIANT, type Ability, type Trigger } from "../../engine/dsl/types";
import type { EngineBattleFold } from "./fold";
import { getBattleInitProvider } from "./journey-battle";

function groupTrigger(trigger: Trigger): boolean {
  return trigger.on === "scoreGroup" || trigger.on === "either" && trigger.triggers.some(groupTrigger);
}
function hasGroup(abilities: readonly Ability[]): boolean {
  return abilities.some(ability => ability.kind === "triggered" && groupTrigger(ability.trigger));
}
function currentCatalog(): EngineCatalog {
  return getBattleInitProvider()?.engine.catalog ?? createCatalog(contentCardDefinitions(), [], {
    avatars: contentAvatarDefinitions(), dreamsigns: contentDreamsignDefinitions(),
  });
}

/** Missing legacy history is unknown only after a lane could have scored. */
export function hasUnknownScoreGroup(fold: EngineBattleFold, catalog = currentCatalog()): boolean {
  const states = [fold.slice.committed, ...(fold.slice.history === undefined ? [] : [fold.slice.history.base.committed])];
  if (!states.some(state => state.turn.phase === "challenge" && state.turn.challengeLane !== 0 && state.challenge?.scoring === undefined)) return false;
  const readsGroup = (read: () => readonly Ability[]): boolean => {
    try { return hasGroup(read()); } catch { return false; }
  };
  return SIDES.some(side => {
    const avatar = fold.init.avatars?.[side];
    return (avatar !== undefined && readsGroup(() => catalog.avatar(avatar).abilities(BASE_VARIANT))) ||
      (fold.init.dreamsigns?.[side] ?? []).some(id => readsGroup(() => catalog.dreamsign(id).abilities(BASE_VARIANT))) ||
      fold.init.decks[side].some(entry => readsGroup(() => catalog.card(entry.cardId).abilities(variantOf(entry))));
  }) || states.some(state => SIDES.some(side => {
    const avatar = state.sides[side].avatar;
    return (avatar !== null && readsGroup(() => catalog.avatar(avatar.id).abilities(BASE_VARIANT))) ||
      state.sides[side].dreamsigns.some(sign => readsGroup(() => catalog.dreamsign(sign.id).abilities(BASE_VARIANT)));
  }) || Object.values(state.instances).some(card => readsGroup(() => originAbilities(catalog, instanceOrigin(card)))));
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The normal verified-checkpoint path replays preserved genesis when this history is unknown. */
export function assertScoreGroupCheckpoint(value: unknown): void {
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (!record(item)) return;
    if (record(item.init) && record(item.init.decks) && Array.isArray(item.init.decks.player) && Array.isArray(item.init.decks.enemy) &&
        record(item.slice) && record(item.slice.committed) && record(item.slice.committed.instances) && record(item.slice.committed.sides) &&
        hasUnknownScoreGroup(item as unknown as EngineBattleFold)) {
      throw new Error("Scoring-group checkpoint requires known Challenge provenance from genesis replay");
    }
    Object.values(item).forEach(visit);
  };
  visit(value);
}
