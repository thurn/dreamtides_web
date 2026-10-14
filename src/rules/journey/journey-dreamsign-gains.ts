import type { GameEvent } from "../../eventlog/types";
import { dreamsignIdFromUnknown, siteIdFromUnknown } from "../../types/identifiers";
import type { DreamsignId } from "../../types/identifiers";
import type { JourneyDreamsignGain, JourneyState } from "../../types/journey";

/** Applied acquisition roles, not UUID-set or object-identity differences. */
export function journeyDreamsignGains(before: JourneyState, after: JourneyState, event: GameEvent): readonly JourneyDreamsignGain[] {
  const payload = event.payload ?? {}, siteId = siteIdFromUnknown(payload.siteId);
  const old = siteId === null ? undefined : before.siteRuntime[siteId];
  const runtime = siteId === null ? undefined : after.siteRuntime[siteId];
  const single = (id: DreamsignId | null, slot: unknown = payload.purgeIndex): readonly JourneyDreamsignGain[] => {
    if (id === null) return [];
    const heldIndex = slot === undefined ? before.dreamsigns.length : slot;
    if (typeof heldIndex !== "number" || !Number.isSafeInteger(heldIndex) || heldIndex < 0 || after.dreamsigns[heldIndex]?.id !== id) throw new Error("Acquired Dreamsign slot is inconsistent.");
    return [{ dreamsignId: id, heldIndex }];
  };
  switch (event.type) {
    case "ADD_DREAMSIGN": return single(dreamsignIdFromUnknown(payload.dreamsignId));
    case "ACCEPT_REWARD": return old?.kind === "reward" && old.reward.rewardType === "dreamsign" ? single(old.reward.dreamsign.id) : [];
    case "ACCEPT_DREAMSIGN_OFFER": return single(dreamsignIdFromUnknown(payload.dreamsignId));
    case "RESOLVE_AFTER_BATTLE_DREAMSIGN": return single(dreamsignIdFromUnknown(payload.offeredDreamsignId));
    case "BUY_SHOP_SLOT": {
      const purchase = runtime?.kind === "shop" ? runtime.purchaseHistory[runtime.purchaseHistory.length - 1]?.item : undefined;
      return purchase?.kind === "dreamsign" ? single(purchase.dreamsignId) : [];
    }
    case "PLACE_GRAVOK_WAGER":
    case "SETTLE_GRAVOK_WAGER":
    case "SETTLE_TIDEMARK_LADDER_CLIMB": {
      if (runtime?.kind !== "gamble" || (runtime.gameId !== "gravok-three-gate-wager" && runtime.gameId !== "tidemark-ladder-climb") ||
        !runtime.result?.dreamsignAwarded || after.dreamsigns.length !== before.dreamsigns.length + 1) return [];
      return single(runtime.rewardDreamsign?.id ?? null);
    }
    case "REPLACE_GRAVOK_WAGER_DREAMSIGN":
    case "REPLACE_TIDEMARK_LADDER_CLIMB_DREAMSIGN": {
      if (runtime?.kind !== "gamble" || (runtime.gameId !== "gravok-three-gate-wager" && runtime.gameId !== "tidemark-ladder-climb")) return [];
      return single(runtime.rewardDreamsign?.id ?? null, before.dreamsigns.findIndex((sign) => sign.id === payload.replacedDreamsignId));
    }
    case "ACCEPT_AUGURY_OFFER": {
      // The validated reward-effect writer only appends Dreamsign records; other effects preserve this ordered prefix.
      if (after.dreamsigns.length < before.dreamsigns.length || before.dreamsigns.some((sign, i) => after.dreamsigns[i]?.id !== sign.id)) throw new Error("Augury acquisition prefix is inconsistent.");
      return after.dreamsigns.slice(before.dreamsigns.length).map((sign, offset) => ({ dreamsignId: sign.id, heldIndex: before.dreamsigns.length + offset }));
    }
    case "RESOLVE_EXPLORATION_CHOICE": {
      if (runtime?.kind !== "exploration" || runtime.resolution === null || runtime.resolution === (old?.kind === "exploration" ? old.resolution : undefined)) return [];
      const result = runtime.resolution, mutation = result.dreamsignMutation;
      if (mutation === undefined) {
        if (result.gainedDreamsignIds.length === 0) return [];
        if (result.gainedDreamsignIds.length !== 1) throw new Error("Unmapped Dreamsign acquisition bundle.");
        const replacement = before.dreamsigns.length >= before.maxDreamsigns ? result.selection?.replacedDreamsignId : undefined;
        return single(result.gainedDreamsignIds[0], replacement === undefined ? before.dreamsigns.length : before.dreamsigns.findIndex((sign) => sign.id === replacement));
      }
      const equal = (a: readonly DreamsignId[], b: readonly DreamsignId[]) => a.length === b.length && a.every((id, i) => id === b[i]);
      if (!equal(mutation.beforeIds, before.dreamsigns.map((sign) => sign.id)) || !equal(mutation.afterIds, after.dreamsigns.map((sign) => sign.id))) throw new Error("Dreamsign mutation basis is inconsistent.");
      const slots = before.dreamsigns.map(({ id }) => ({ id, acquired: false })), remaining = [...mutation.gainedIds];
      for (const id of mutation.purgedIds) {
        if (!slots.some((slot) => slot.id === id)) throw new Error("Dreamsign purge basis is missing.");
        // The signed purge-and-gain writer removes every held occurrence of its selected UUID.
        for (let i = slots.length - 1; i >= 0; i--) if (slots[i].id === id) slots.splice(i, 1);
      }
      for (const replacement of mutation.replacements) {
        const index = slots.findIndex((slot) => !slot.acquired && slot.id === replacement.removedDreamsignId);
        const gain = remaining.indexOf(replacement.gainedDreamsignId);
        if (index < 0 || gain < 0) throw new Error("Dreamsign replacement slot is missing.");
        slots[index] = { id: replacement.gainedDreamsignId, acquired: true }; remaining.splice(gain, 1);
      }
      slots.push(...remaining.map((id) => ({ id, acquired: true })));
      if (!equal(slots.map((slot) => slot.id), mutation.afterIds)) throw new Error("Dreamsign physical acquisition projection is incomplete.");
      return slots.flatMap((slot, heldIndex) => slot.acquired ? [{ dreamsignId: slot.id, heldIndex }] : []);
    }
    default: return [];
  }
}
