import type { Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface FatigueEvent {
  readonly kind: "fatigue";
  readonly side: Side;
  readonly points: number;
}

export const fatigue = publicEvent<FatigueEvent>("fatigue");
