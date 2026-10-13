import type { Side } from "../../state/ids";
import { publicEvent } from "../types";

/** One completed positive discard occasion, without hidden card identities. */
export interface DiscardBatchEvent {
  readonly kind: "discardBatch";
  readonly side: Side;
  readonly count: number;
}

export const discardBatch = publicEvent<DiscardBatchEvent>("discardBatch");
