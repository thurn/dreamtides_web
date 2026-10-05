import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface BanishedEvent {
  readonly kind: "banished";
  readonly instance: InstanceId;
  readonly side: Side;
}

export const banished = publicEvent<BanishedEvent>("banished");
