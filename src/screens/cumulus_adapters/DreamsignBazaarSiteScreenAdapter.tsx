/* eslint-disable max-lines -- this adapter keeps the full screen wiring together. */

// Adapter for Amunet's Cumulus Dreamsign Bazaar. Wiring only.

import { useCallback, useEffect, useMemo, useState } from "react";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import { requireDreamsignId } from "../../data/dreamsigns";
import { DreamsignBazaarSiteScreen } from "../../cumulus/screens/DreamsignBazaarSiteScreen";
import {
  buildDreamsignBazaarSiteView,
  resolveDreamsignBazaarGuide,
} from "./dreamsign-bazaar-view-model";
import { useGuideDialogue } from "./guide-dialogue-view-model";
import {
  buildShopPurchaseLogs,
  buildShopSiteEntryLog,
} from "./shop-purchase-logging-view-model";

export function DreamsignBazaarSiteScreenAdapter({
  siteId,
}: {
  siteId: string;
}) {
  const { state, mutations, journeyContent } = useJourney();
  const node =
    state.currentDreamscape === null
      ? null
      : (state.atlas.nodes[state.currentDreamscape] ?? null);
  const site = node?.sites.find((candidate) => candidate.id === siteId) ?? null;
  const runtime = state.siteRuntime[siteId];
  const shopRuntime = runtime?.kind === "shop" ? runtime : null;
  const guide = resolveDreamsignBazaarGuide(
    journeyContent.guides,
    site?.randomSite?.presentingGuideId,
  );
  const guideLine = useGuideDialogue(guide, "site");
  const [pendingSlotIndex, setPendingSlotIndex] = useState<number | null>(null);
  const pendingDreamsign =
    pendingSlotIndex === null || shopRuntime === null
      ? null
      : shopRuntime.slots[pendingSlotIndex]?.itemType === "dreamsign"
        ? shopRuntime.slots[pendingSlotIndex].dreamsign
        : null;
  const view = useMemo(
    () =>
      site === null || shopRuntime === null
        ? null
        : buildDreamsignBazaarSiteView({
            state,
            sceneNode: node,
            site,
            runtime: shopRuntime,
            guide,
            guideLine,
            pendingDreamsign,
            economyData: journeyContent.economyData,
            sitesData: journeyContent.sitesData,
          }),
    [
      state,
      node,
      site,
      shopRuntime,
      guide,
      pendingDreamsign,
      journeyContent.economyData,
      journeyContent.sitesData,
    ],
  );

  useEffect(() => {
    if (site !== null && runtime === undefined)
      mutations.ensureShopRuntime(site);
  }, [mutations, runtime, site]);
  useEffect(() => {
    if (site === null || shopRuntime === null || view === null) return;
    logEventOnce(`dreamsign-bazaar:${site.id}:site-entered`, "site_entered", {
      siteId: site.id,
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      essence: state.essence,
      offerIds: view.offers.map((offer) =>
        requireDreamsignId(offer.dreamsign, "Dreamsign Bazaar log"),
      ),
      offerPrices: view.offers.map((offer) => offer.price),
      restockPrice: view.restock.price,
      ...buildShopSiteEntryLog(
        shopRuntime,
        state.shopModifiers,
        journeyContent.cardDatabase,
      ),
    });
  }, [
    journeyContent.cardDatabase,
    shopRuntime,
    site,
    state.essence,
    state.shopModifiers,
    view,
  ]);
  useEffect(() => {
    if (site === null || shopRuntime === null) return;
    buildShopPurchaseLogs(
      shopRuntime.purchaseHistory ?? [],
      journeyContent.cardDatabase,
    ).forEach((purchase) => {
      logEventOnce(
        `shop:${site.id}:purchase:${String(purchase.eventSeq)}`,
        "shop_item_purchased",
        { siteType: site.type, ...purchase },
      );
    });
  }, [journeyContent.cardDatabase, shopRuntime, site]);
  useEffect(() => {
    if (guide === null || site === null) return;
    logEventOnce(
      `dreamsign-bazaar:${site.id}:guide:${guide.id}`,
      "dream_guide_presented",
      {
        guideId: guide.id,
        siteType: site.type,
        isEnhanced: site.isEnhanced,
      },
    );
  }, [guide, site]);

  const handleBuy = useCallback(
    (slotIndex: number) => {
      if (site === null || shopRuntime === null) return;
      const slot = shopRuntime.slots[slotIndex];
      if (slot?.itemType !== "dreamsign") return;
      if (state.dreamsigns.length >= state.maxDreamsigns) {
        setPendingSlotIndex(slotIndex);
        return;
      }
      mutations.buyShopSlot(site.id, slotIndex);
    },
    [
      mutations,
      shopRuntime,
      site,
      state.dreamsigns.length,
      state.maxDreamsigns,
    ],
  );
  const handlePurge = useCallback(
    (dreamsignId: string) => {
      if (site === null || pendingSlotIndex === null) return;
      const purgeIndex = state.dreamsigns.findIndex(
        (dreamsign) => dreamsign.id === dreamsignId,
      );
      if (purgeIndex < 0) return;
      mutations.buyShopSlot(site.id, pendingSlotIndex, purgeIndex);
      setPendingSlotIndex(null);
    },
    [mutations, pendingSlotIndex, site, state.dreamsigns],
  );
  const handleRestock = useCallback(() => {
    if (site !== null) mutations.rerollShop(site);
  }, [mutations, site]);
  const handleClose = useCallback(() => {
    if (site === null) return;
    logEvent("site_completed", {
      siteType: "DreamsignBazaar",
      outcome: "left",
    });
    mutations.completeSite(site.id, "shop_left");
  }, [mutations, site]);

  if (site === null || view === null) return null;
  return (
    <DreamsignBazaarSiteScreen
      view={view}
      onBuy={handleBuy}
      onPurge={handlePurge}
      onCancelPurge={() => setPendingSlotIndex(null)}
      onRestock={handleRestock}
      onClose={handleClose}
    />
  );
}
