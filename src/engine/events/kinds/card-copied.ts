import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

/** `side` copied the card `original` on the stack; `copy` sits directly above it (D15). */
export interface CardCopiedEvent {
  readonly kind: "cardCopied";
  readonly side: Side;
  readonly original: InstanceId;
  readonly copy: InstanceId;
}

export const cardCopied = publicEvent<CardCopiedEvent>("cardCopied");
