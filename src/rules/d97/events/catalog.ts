// The D97 event types as a runtime table, for the rules layer's per-type
// tables (../../events.ts). It loads none of the specs' folds: those import
// the battle and journey rules, which import ../../events.ts back. The
// `satisfies` check ties it to `D97_EVENTS` (./index.ts) both ways, so an
// event declared there cannot compile until it is listed here, and a listed
// type cannot outlive its spec.
//
// This module obeys the src/rules/ lint rails: no React, no live clock or rng.

import { identityKeys } from "../../../types/identifiers";
import type { D97EventType } from "./index";

const D97_EVENT_TYPE_TABLE = {
  D97_START_RUN: true,
  D97_EQUIP_COPY: true,
  D97_UNEQUIP_COPY: true,
  D97_PREVIEW_ENCOUNTER: true,
  D97_DECLINE_ENCOUNTER: true,
  D97_BEGIN_BATTLE: true,
  D97_END_BATTLE: true,
  D97_ACCEPT_QUEST: true,
  D97_ADVANCE_QUEST: true,
  D97_COMPLETE_QUEST: true,
  D97_CHOOSE_QUEST_REWARD: true,
  D97_ABANDON_QUEST: true,
  D97_PICK_UP_OBJECT: true,
  D97_GIVE_ITEM: true,
  D97_TAKE_ITEM: true,
  D97_SET_FLAG: true,
  D97_OPEN_SHOP: true,
  D97_OPEN_SERVICE: true,
  D97_ACTIVATE_WAYPOINT: true,
  D97_STEP_THROUGH_DOOR: true,
  D97_ENTER_ROOM: true,
  D97_LEAVE_ROOM: true,
  D97_BUY_SHOP_CARD: true,
  D97_SELL_COPY: true,
  D97_RESTOCK_SHOP: true,
} as const satisfies Record<D97EventType, true>;

const D97_EVENT_TYPES: ReadonlySet<string> = new Set(identityKeys(D97_EVENT_TYPE_TABLE));

/**
 * Whether an event type belongs to the D97 namespace. D97 games fold only
 * these; journey games bounce them.
 */
export function isD97EventType<Type extends string>(type: Type): type is Extract<Type, D97EventType> {
  return D97_EVENT_TYPES.has(type);
}

/** `value` for every D97 event type, for the rules layer's per-type tables. */
export function d97EventTable<Value>(value: Value): Record<D97EventType, Value> {
  return Object.fromEntries(identityKeys(D97_EVENT_TYPE_TABLE).map((type) => [type, value])) as Record<D97EventType, Value>;
}
