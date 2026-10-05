import type { InstanceId, Side, Slot } from "../../state/ids";
import { publicEvent } from "../types";

export interface MaterializedEvent {
  readonly kind: "materialized";
  readonly instance: InstanceId;
  readonly side: Side;
  readonly slot: Slot;
}

export const materialized = publicEvent<MaterializedEvent>("materialized");
