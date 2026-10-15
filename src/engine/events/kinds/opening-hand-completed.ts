import type { Side } from "../../state/ids";
import { publicEvent } from "../types";

/** One side's settled ordinary and extra opening hand, without card identities. */
export interface OpeningHandCompletedEvent {
  readonly kind: "openingHandCompleted";
  readonly side: Side;
}

export const openingHandCompleted = publicEvent<OpeningHandCompletedEvent>("openingHandCompleted");
