import type { InstanceId } from "../../state/ids";
import { publicEvent } from "../types";

/** An effect exhausted or awakened a character. */
export interface ExhaustionChangedEvent {
  readonly kind: "exhaustionChanged";
  readonly instance: InstanceId;
  readonly exhausted: boolean;
}

export const exhaustionChanged = publicEvent<ExhaustionChangedEvent>("exhaustionChanged");
