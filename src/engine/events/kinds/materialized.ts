import type { InstanceId, Side, Slot } from "../../state/ids";
import { publicEvent } from "../types";

export interface MaterializedEvent {
  readonly kind: "materialized";
  readonly instance: InstanceId;
  readonly side: Side;
  readonly slot: Slot;
  /** Present when an existing in-play character fires materialization again. */
  readonly rematerialized?: true;
}

export const materialized = publicEvent<MaterializedEvent>("materialized");
