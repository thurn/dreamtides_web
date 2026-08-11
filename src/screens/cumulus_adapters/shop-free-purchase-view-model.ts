import type { ShopFreePurchaseStatusView } from "../../cumulus/screens/ShopFreePurchaseStatus";
import type { JourneyState, ShopSiteRuntime } from "../../types/journey";

/** Project authoritative event-log state into the merchant status affordance. */
export function buildShopFreePurchaseStatus(
  runtime: ShopSiteRuntime,
  shopModifiers: JourneyState["shopModifiers"],
): ShopFreePurchaseStatusView {
  return {
    // The provider binds this source only while opening an eligible Card Shop;
    // Bazaar runtimes therefore project no visit-wide T56 benefit.
    freeNextShopSource: runtime.freePurchaseSource ?? null,
    freePurchasesRemaining: (shopModifiers.freePurchaseModifiers ?? []).reduce(
      (total, modifier) => total + Math.max(0, modifier.remainingCount),
      0,
    ),
  };
}

/** Whether the next successful item purchase has an authoritative zero price. */
export function hasFreePurchase(
  runtime: ShopSiteRuntime,
  shopModifiers: JourneyState["shopModifiers"],
): boolean {
  return (
    runtime.freePurchaseSource !== undefined ||
    (shopModifiers.freePurchaseModifiers ?? []).some(
      (modifier) => modifier.remainingCount > 0,
    )
  );
}
