import type { InstanceId, Side } from "../../state/ids";
import { publicEvent, type RemovalProvenance } from "../types";

export interface BanishedEvent {
  readonly kind: "banished";
  readonly instance: InstanceId;
  readonly side: Side;
  readonly removal?: RemovalProvenance;
}

export const banished = publicEvent<BanishedEvent>("banished");
