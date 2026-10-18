// The D97 shop events (cases in ../d97-shop.ts). Each names the dream's shop
// anchor. Unkeyed: a bought slot or a spent restock refuses a repeat.

import { d97OwnedCopyIdFromUnknown, dreamAnchorIdFromUnknown } from "../../../types/identifiers";
import { buyShopCard, openShop, restockShop, sellCopy } from "../d97-shop";
import { d97Event, integerFromUnknown, payloadOf } from "./spec";

const shopPayload = payloadOf({ anchorId: dreamAnchorIdFromUnknown });
const slotPayload = payloadOf({ anchorId: dreamAnchorIdFromUnknown, slotIndex: integerFromUnknown });
const salePayload = payloadOf({ anchorId: dreamAnchorIdFromUnknown, copyId: d97OwnedCopyIdFromUnknown });

export const SHOP_EVENTS = {
  D97_OPEN_SHOP: d97Event({ phase: "overworld", parse: shopPayload, fold: openShop }),
  D97_BUY_SHOP_CARD: d97Event({ phase: "overworld", parse: slotPayload, fold: buyShopCard }),
  D97_SELL_COPY: d97Event({ phase: "overworld", parse: salePayload, fold: sellCopy }),
  D97_RESTOCK_SHOP: d97Event({ phase: "overworld", parse: shopPayload, fold: restockShop }),
};
