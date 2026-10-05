import { token } from "../primitives/tokens";
import type { SiteId } from "../../types/identifiers";
import type { ExplorationActionId } from "../../types/identifiers";
import { formatNumber } from "../../runtime/format-number";

/** Provenance and remaining capacity for Exploration-granted free purchases. */
export interface ShopFreePurchaseStatusView {
  /** T56 source bound to this exact Card Shop visit, when present. */
  readonly freeNextShopSource: {
    readonly sourceSiteId: SiteId;
    readonly sourceActionId: ExplorationActionId;
  } | null;
  /** Total successful Shop or Bazaar purchases remaining across FIFO buckets. */
  readonly freePurchasesRemaining: number;
}

/** Persistent, accessible status for free purchase benefits at augury sites. */
export function ShopFreePurchaseStatus({
  status,
}: {
  readonly status: ShopFreePurchaseStatusView;
}) {
  const hasFreeNextShop = status.freeNextShopSource !== null;
  const hasFreePurchases = status.freePurchasesRemaining > 0;
  if (!hasFreeNextShop && !hasFreePurchases) return null;

  const kind = hasFreeNextShop
    ? hasFreePurchases
      ? "combined"
      : "next-shop"
    : "free-purchases";
  const message =
    kind === "next-shop"
      ? "Exploration boon: every item in this shop is free."
      : kind === "free-purchases"
        ? status.freePurchasesRemaining === 1
          ? `Exploration boon: ${formatNumber(status.freePurchasesRemaining)} free purchase remains.`
          : `Exploration boon: ${formatNumber(status.freePurchasesRemaining)} free purchases remain.`
        : status.freePurchasesRemaining === 1
          ? `Exploration boons: every item in this shop is free, with ${formatNumber(status.freePurchasesRemaining)} free purchase remaining.`
          : `Exploration boons: every item in this shop is free, with ${formatNumber(status.freePurchasesRemaining)} free purchases remaining.`;

  return (
    <div
      data-shop-free-purchase-status={kind}
      data-shop-free-source={hasFreeNextShop ? "next-shop" : undefined}
      data-shop-free-purchases-remaining={
        hasFreePurchases ? status.freePurchasesRemaining : undefined
      }
      data-shop-free-source-site-id={status.freeNextShopSource?.sourceSiteId}
      data-shop-free-source-action-id={
        status.freeNextShopSource?.sourceActionId
      }
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        justifySelf: "center",
        color: token("--text-primary"),
        font: token("--t-caption"),
        textAlign: "center",
        textShadow: token("--text-outline-media"),
      }}
    >
      {message}
    </div>
  );
}
