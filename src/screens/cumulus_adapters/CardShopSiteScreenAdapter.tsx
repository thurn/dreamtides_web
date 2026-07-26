// Adapter for Tobias Tanglefur's Cumulus Card Shop. Wiring only.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { logEvent, logEventOnce } from "../../logging";
import { useQuest } from "../../state/quest-context";
import { useCardSourceDebugPublication } from "../../state/use-card-source-debug-publication";
import { CardShopSiteScreen } from "../../cumulus/screens/CardShopSiteScreen";
import {
  buildCardShopDebugState,
  buildCardShopSiteView,
  resolveCardShopGuide,
} from "./card-shop-view-model";

export function CardShopSiteScreenAdapter({ siteId }: { siteId: string }) {
  const { state, mutations, questContent } = useQuest();
  const node =
    state.currentDreamscape !== null
      ? (state.atlas.nodes[state.currentDreamscape] ?? null)
      : null;
  const site = node?.sites.find((candidate) => candidate.id === siteId) ?? null;
  const runtime = state.siteRuntime[siteId];
  const shopRuntime = runtime?.kind === "shop" ? runtime : null;
  const guide = resolveCardShopGuide(questContent.guides);
  const guideLineRef = useRef<string | null | undefined>(undefined);
  if (guideLineRef.current === undefined) {
    guideLineRef.current =
      guide === null || guide.dialog.length === 0
        ? null
        : guide.dialog[Math.floor(Math.random() * guide.dialog.length)];
  }

  const view = useMemo(
    () =>
      site === null || shopRuntime === null
        ? null
        : buildCardShopSiteView({
            state,
            sceneNode: node,
            site,
            runtime: shopRuntime,
            cardDatabase: questContent.cardDatabase,
            guide,
            guideLine: guideLineRef.current ?? null,
          }),
    [
      state.essence,
      state.deck,
      state.dreamAvatar,
      state.dreamsigns,
      state.shopModifiers.essenceDiscountPercent,
      node,
      site,
      shopRuntime,
      questContent.cardDatabase,
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
    if (site === null || view === null) return;
    logEventOnce(`shop:${site.id}:site-entered`, "site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      wareCount: view.offers.length,
      essence: state.essence,
    });
  }, [site, state.essence, view]);

  useEffect(() => {
    if (guide === null || site === null) return;
    logEventOnce(`shop:${site.id}:guide:${guide.id}`, "dream_guide_presented", {
      guideId: guide.id,
      siteType: site.type,
      isEnhanced: site.isEnhanced,
    });
  }, [guide, site]);

  const handleBuy = useCallback(
    (slotIndex: number) => {
      if (site === null) return;
      mutations.buyShopSlot(site.id, slotIndex);
    },
    [mutations, site],
  );
  const handleRestock = useCallback(() => {
    if (site === null) return;
    mutations.rerollShop(site);
  }, [mutations, site]);
  const handleClose = useCallback(() => {
    if (site === null) return;
    logEvent("site_completed", {
      siteType: "Shop",
      outcome: "left",
    });
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
