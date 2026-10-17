// Adapter for a Dreamtides 97 shop over the shared card shop: its stock,
// quotes and restock from the run, Tobias as the shop's guide, and the sell
// panel in the shop's place, which is view state. Every purchase, sale and restock is recorded as
// an intent; the rules log each one. Wiring only.

import { useCallback, useMemo, useState } from "react";
import { D97_COLLECTION } from "../../../content/d97/collection";
import { D97_SHOP } from "../../../content/d97/shop";
import { useIsDesktop } from "../../../cumulus/primitives/use-is-desktop";
import { CardShopSiteScreen } from "../../../cumulus/screens/CardShopSiteScreen";
import { D97ShopSellPanel } from "../../../cumulus/screens/d97/D97ShopSellPanel";
import { guideDialogueLines } from "../../../data/dreamscapes";
import type { JourneyContent } from "../../../data/journey-content";
import { logEvent } from "../../../logging";
import type { D97Run } from "../../../rules/d97/d97-state";
import { useActions } from "../../../session/hooks";
import type { CardId } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import type { D97OwnedCopyId, DreamAnchorId } from "../../../types/identifiers";
import type { JourneySeed } from "../../../types/journey-seed";
import { resolveCardShopGuide } from "../card-shop-view-model";
import { selectGuideDialogueIndex } from "../guide-dialogue-view-model";
import { projectGuideView } from "../guide-view-model";
import { buildD97ShopSellView, buildD97ShopView } from "./d97-shop-view-model";

function reportFailure(error: unknown): void {
  console.error("D97 shop intent failed", error);
}

export function D97ShopAdapter({
  run,
  anchorId,
  journeyContent,
  cards,
  gameSeed,
  onClose,
}: {
  readonly run: D97Run;
  readonly anchorId: DreamAnchorId;
  readonly journeyContent: JourneyContent;
  readonly cards: ReadonlyMap<CardId, CardData>;
  readonly gameSeed: JourneySeed;
  readonly onClose: () => void;
}) {
  const actions = useActions();
  const isDesktop = useIsDesktop();
  const [selling, setSelling] = useState(false);
  const shop = run.shops[anchorId];
  const guide = useMemo(() => {
    const resident = resolveCardShopGuide(journeyContent.guides);
    const lines = guideDialogueLines(resident, "site");
    const index = selectGuideDialogueIndex(
      { seed: gameSeed, siteId: null, guideId: resident.id, context: "site", values: { shop: anchorId } },
      lines.length,
    );
    return projectGuideView(resident, lines[index] ?? "");
  }, [anchorId, gameSeed, journeyContent.guides]);
  const presentation = journeyContent.sitesData.siteTypes.Shop.presentation;
  const title = presentation?.kind === "shop" ? presentation.title : "";
  const view = useMemo(
    () => (shop === undefined ? null : buildD97ShopView({ anchorId, shop, essence: run.essence, cards, title, guide, tuning: D97_SHOP })),
    [anchorId, cards, guide, run.essence, shop, title],
  );
  const sellView = useMemo(
    () => buildD97ShopSellView({
        run,
        cards,
        collectionFloor: D97_COLLECTION.collectionFloor,
        minimumDeckSize: D97_COLLECTION.minimumDeckSize,
        tuning: D97_SHOP,
      }),
    [cards, run],
  );

  const buy = useCallback((slotIndex: number) => void actions.d97BuyShopCard(anchorId, slotIndex).catch(reportFailure), [actions, anchorId]);
  const restock = useCallback(() => void actions.d97RestockShop(anchorId).catch(reportFailure), [actions, anchorId]);
  const sell = useCallback((copyId: D97OwnedCopyId) => void actions.d97SellCopy(anchorId, copyId).catch(reportFailure), [actions, anchorId]);
  const openSell = useCallback(() => {
    logEvent("d97_shop_sell_opened", { runId: run.runId, anchorId });
    setSelling(true);
  }, [anchorId, run.runId]);
  const closeSell = useCallback(() => setSelling(false), []);
  const leave = useCallback(() => {
    logEvent("d97_shop_closed", { runId: run.runId, anchorId });
    onClose();
  }, [anchorId, onClose, run.runId]);

  if (view === null) return null;
  // Selling takes the shop's place, so two galleries never stack.
  if (selling) return <D97ShopSellPanel view={sellView} onSell={sell} onClose={closeSell} />;
  return (
    <CardShopSiteScreen
      view={view}
      onBuy={buy}
      onRestock={restock}
      onClose={leave}
      sellAction={{ label: "Sell Cards", onPress: openSell, testId: "d97-shop-sell-open" }}
      {...(isDesktop ? {} : { hint: "Press and hold a card to read it." })}
    />
  );
}
