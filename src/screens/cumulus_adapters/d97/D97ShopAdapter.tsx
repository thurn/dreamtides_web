// Adapter for a Dreamtides 97 shop: its stock, quotes and restock from the
// run, the resident who keeps it (the occupant at its anchor, named by their
// dialogue), the player's Essence, and the sell panel in the shop's place,
// which is view state. Every purchase, sale and restock is recorded as an
// intent; the rules log each one. Wiring only.

import { useCallback, useMemo, useState } from "react";
import type { D97DialogueModule } from "../../../content/d97/dialogue/schema";
import { D97_SHOP } from "../../../content/d97/shop";
import { D97ShopPanel } from "../../../cumulus/screens/d97/D97ShopPanel";
import { D97ShopSellPanel } from "../../../cumulus/screens/d97/D97ShopSellPanel";
import type { OverworldOccupant } from "../../../d97/overworld/occupants";
import { logEvent } from "../../../logging";
import { d97ContentProvider } from "../../../rules/d97/d97-content";
import type { D97Run } from "../../../rules/d97/d97-state";
import { useActions } from "../../../session/hooks";
import type { CardId } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import type { D97DialogueId, D97OwnedCopyId, DreamAnchorId } from "../../../types/identifiers";
import { buildD97ShopSellView, buildD97ShopView, resolveD97ShopKeeper } from "./d97-shop-view-model";

function reportFailure(error: unknown): void {
  console.error("D97 shop intent failed", error);
}

export function D97ShopAdapter({
  run,
  anchorId,
  keeper: occupant,
  dialogues,
  cards,
  onClose,
}: {
  readonly run: D97Run;
  readonly anchorId: DreamAnchorId;
  /** Who stands at the shop's anchor, if anyone. */
  readonly keeper: OverworldOccupant | undefined;
  readonly dialogues: ReadonlyMap<D97DialogueId, D97DialogueModule>;
  readonly cards: ReadonlyMap<CardId, CardData>;
  readonly onClose: () => void;
}) {
  const actions = useActions();
  const content = d97ContentProvider();
  const [selling, setSelling] = useState(false);
  const shop = run.shops[anchorId];
  const keeper = useMemo(() => resolveD97ShopKeeper(occupant, dialogues), [dialogues, occupant]);
  const view = useMemo(
    () => (shop === undefined ? null : buildD97ShopView({ anchorId, shop, keeper, essence: run.essence, cards, tuning: D97_SHOP })),
    [anchorId, cards, keeper, run.essence, shop],
  );
  const sellView = useMemo(() => (content === null ? null : buildD97ShopSellView({ run, keeper, cards, content })), [cards, content, keeper, run]);

  const buy = useCallback((slotIndex: number) => void actions.d97({ type: "D97_BUY_SHOP_CARD", payload: { anchorId, slotIndex } }).catch(reportFailure), [actions, anchorId]);
  const restock = useCallback(() => void actions.d97({ type: "D97_RESTOCK_SHOP", payload: { anchorId } }).catch(reportFailure), [actions, anchorId]);
  const sell = useCallback((copyId: D97OwnedCopyId) => void actions.d97({ type: "D97_SELL_COPY", payload: { anchorId, copyId } }).catch(reportFailure), [actions, anchorId]);
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
  if (selling && sellView !== null) return <D97ShopSellPanel view={sellView} onSell={sell} onClose={closeSell} />;
  return <D97ShopPanel view={view} onBuy={buy} onRestock={restock} onSell={openSell} onClose={leave} />;
}
