function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Add the persisted Wave 6 shop queues and receipt history to snapshots created
 * before those fields existed. Existing values remain authoritative so normal
 * validation can reject malformed current data instead of silently replacing it.
 */
export function normalizePersistedShopPurchaseJourney(value: unknown): unknown {
  if (!isRecord(value)) return value;

  let changed = false;
  let shopModifiers = value.shopModifiers;
  if (isRecord(shopModifiers)) {
    const freeNextShopModifiers =
      shopModifiers.freeNextShopModifiers === undefined
        ? []
        : shopModifiers.freeNextShopModifiers;
    const freePurchaseModifiers =
      shopModifiers.freePurchaseModifiers === undefined
        ? []
        : shopModifiers.freePurchaseModifiers;
    if (
      freeNextShopModifiers !== shopModifiers.freeNextShopModifiers ||
      freePurchaseModifiers !== shopModifiers.freePurchaseModifiers
    ) {
      changed = true;
      shopModifiers = {
        ...shopModifiers,
        freeNextShopModifiers,
        freePurchaseModifiers,
      };
    }
  }

  let siteRuntime = value.siteRuntime;
  if (isRecord(siteRuntime)) {
    let runtimeChanged = false;
    const entries = Object.entries(siteRuntime).map(([siteId, runtime]) => {
      if (
        !isRecord(runtime) ||
        runtime.kind !== "shop" ||
        runtime.purchaseHistory !== undefined
      ) {
        return [siteId, runtime] as const;
      }
      runtimeChanged = true;
      return [siteId, { ...runtime, purchaseHistory: [] }] as const;
    });
    if (runtimeChanged) {
      changed = true;
      siteRuntime = Object.fromEntries(entries);
    }
  }

  return changed ? { ...value, shopModifiers, siteRuntime } : value;
}

/** Normalize the journey slice of a decoded event-log compaction snapshot. */
export function normalizePersistedShopPurchaseState(value: unknown): unknown {
  if (!isRecord(value) || !("journey" in value)) return value;
  const journey = normalizePersistedShopPurchaseJourney(value.journey);
  return journey === value.journey ? value : { ...value, journey };
}
