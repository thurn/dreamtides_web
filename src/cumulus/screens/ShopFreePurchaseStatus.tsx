import { token } from "../primitives/tokens";
import { useLocalizer } from "../../runtime/localization/use-localizer";
import { tx, plural, one, other, txa } from "@trox/runtime";

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
  const resolve = useLocalizer();
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
      ? tx(
          "Exploration boon: every item in this shop is free.",
          "[exploration] Persistent live status above a Card Shop shelf when its T56 visit-wide Exploration benefit is bound to this exact visit.",
        )
      : kind === "free-purchases"
        ? txa(
            plural(status.freePurchasesRemaining, [
              one("Exploration boon: {remaining_count} free purchase remains."),
              other(
                "Exploration boon: {remaining_count} free purchases remain.",
              ),
            ]),
            { remaining_count: status.freePurchasesRemaining },
            "[dreamsign] Persistent live status above a Shop or Dreamsign Bazaar shelf when T82 free purchases are queued. remaining_count is the positive total across all FIFO counters.",
          )
        : txa(
            plural(status.freePurchasesRemaining, [
              one(
                "Exploration boons: every item in this shop is free, with {remaining_count} free purchase remaining.",
              ),
              other(
                "Exploration boons: every item in this shop is free, with {remaining_count} free purchases remaining.",
              ),
            ]),
            { remaining_count: status.freePurchasesRemaining },
            "[ui] Persistent live status above a Card Shop shelf when T56 and T82 overlap. remaining_count is the positive total of successful T82 purchases remaining; those counters are consumed even while T56 also makes the visit free.",
          );

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
      {resolve(message)}
    </div>
  );
}
