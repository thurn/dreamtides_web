/* eslint-disable max-lines -- this adapter keeps the full screen wiring together. */

import { useCallback, useEffect, useMemo } from "react";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import { useCardSourceDebugPublication } from "../../state/use-card-source-debug-publication";
import { CardShopSiteScreen } from "../../cumulus/screens/CardShopSiteScreen";
import {
  buildCardShopDebugState,
  buildCardShopSiteView,
  buildCardShopTransfiguredOfferLog,
  resolveCardShopGuide,
} from "./card-shop-view-model";
import { useGuideDialogue } from "./guide-dialogue-view-model";
import {
  buildShopPurchaseLogs,
  buildShopSiteEntryLog,
} from "./shop-purchase-logging-view-model";

export function CardShopSiteScreenAdapter({ siteId }: { siteId: string }) {
  const { state, mutations, journeyContent } = useJourney();
  const node =
    state.currentDreamscape !== null
      ? (state.atlas.nodes[state.currentDreamscape] ?? null)
      : null;
  const site = node?.sites.find((candidate) => candidate.id === siteId) ?? null;
  const runtime = state.siteRuntime[siteId];
  const shopRuntime = runtime?.kind === "shop" ? runtime : null;
  const guide = resolveCardShopGuide(
    journeyContent.guides,
    site?.guideIdOverride,
  );
  const guideLine = useGuideDialogue(guide, "site");

  const view = useMemo(
    () =>
      site === null || shopRuntime === null
        ? null
        : buildCardShopSiteView({
            state,
            sceneNode: node,
            site,
            runtime: shopRuntime,
            cardDatabase: journeyContent.cardDatabase,
            guide,
            guideLine,
            economyData: journeyContent.economyData,
            transfigurationData: journeyContent.transfigurationData,
            sitesData: journeyContent.sitesData,
          }),
    [
      state.essence,
      state.deck,
      state.dreamAvatar,
      state.dreamsigns,
      state.shopModifiers.essenceDiscountPercent,
      state.shopModifiers.freePurchaseModifiers,
      node,
      site,
      shopRuntime,
      journeyContent.cardDatabase,
      journeyContent.economyData,
      journeyContent.transfigurationData,
      guide,
    ],
  );
  const debugState = useMemo(
    () =>
      view === null
        ? null
        : buildCardShopDebugState(view.offers, state.resolvedPackage),
    [view, state.resolvedPackage],
  );

  useEffect(() => {
    if (site !== null && runtime === undefined)
      mutations.ensureShopRuntime(site);
  }, [mutations, runtime, site]);

  useCardSourceDebugPublication(
    mutations.setCardSourceDebug,
    debugState,
    "shop_cards_shown",
    "shop_cards_hidden",
  );

  useEffect(() => {
    if (site === null || shopRuntime === null || view === null) return;
    logEventOnce(`shop:${site.id}:site-entered`, "site_entered", {
      siteId: site.id,
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      wareCount: view.offers.length,
      essence: state.essence,
      ...buildShopSiteEntryLog(
        shopRuntime,
        state.shopModifiers,
        journeyContent.cardDatabase,
      ),
      ...(shopRuntime?.transfiguredOfferSource === undefined
        ? {}
        : buildCardShopTransfiguredOfferLog(
            view,
            shopRuntime.transfiguredOfferSource,
          )),
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
    logEventOnce(`shop:${site.id}:guide:${guide.id}`, "dream_guide_presented", {
      guideId: guide.id,
      siteType: site.type,
      isEnhanced: site.isEnhanced,
    });
  }, [guide, site]);

  const handleBuy = useCallback(
    (slotIndex: number) =>
      site !== null && mutations.buyShopSlot(site.id, slotIndex),
    [mutations, site],
  );
  const handleRestock = useCallback(() => {
    if (site === null) return;
    mutations.rerollShop(site);
  }, [mutations, site]);
  const handleClose = useCallback(() => {
    if (site === null) return;
    logEvent("site_completed", { siteType: "Shop", outcome: "left" });
    mutations.completeSite(site.id, "shop_left");
  }, [mutations, site]);

  if (site === null || view === null) return null;
  return (
    <CardShopSiteScreen
      view={view}
      onBuy={handleBuy}
      onRestock={handleRestock}
      onClose={handleClose}
    />
  );
}
