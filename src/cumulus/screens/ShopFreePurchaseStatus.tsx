import { token } from "../primitives/tokens";
import { useMessages } from "../hooks/use-messages";

/** Provenance and remaining capacity for Exploration-granted free purchases. */
export interface ShopFreePurchaseStatusView {
  /** T56 source bound to this exact Card Shop visit, when present. */
  readonly freeNextShopSource: {
    readonly sourceSiteId: string;
    readonly sourceActionId: string;
  } | null;
  /** Total successful Shop or Bazaar purchases remaining across FIFO buckets. */
  readonly freePurchasesRemaining: number;
}

/** Persistent, accessible status for free purchase benefits at merchant sites. */
export function ShopFreePurchaseStatus({
  status,
}: {
  readonly status: ShopFreePurchaseStatusView;
}) {
  const t = useMessages();
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
      ? t("shop-free-next-shop-status")
      : kind === "free-purchases"
        ? t("shop-free-purchases-status", {
            remainingCount: status.freePurchasesRemaining,
          })
        : t("shop-overlapping-free-purchase-status", {
            remainingCount: status.freePurchasesRemaining,
          });

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
