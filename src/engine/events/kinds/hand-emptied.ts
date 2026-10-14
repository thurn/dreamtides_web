import type { Side } from "../../state/ids";
import { publicEvent } from "../types";

/** A settled positive-to-zero hand transition, identifying only its holder. */
export interface HandEmptiedEvent {
  readonly kind: "handEmptied";
  readonly side: Side;
}

export const handEmptied = publicEvent<HandEmptiedEvent>("handEmptied");
