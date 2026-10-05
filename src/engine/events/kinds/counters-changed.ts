import type { InstanceId } from "../../state/ids";
import { publicEvent } from "../types";

/** The ⧗ stored on a card changed, as when counters are spent to pay a cost. `counters` is the new total. */
export interface CountersChangedEvent {
  readonly kind: "countersChanged";
  readonly instance: InstanceId;
  readonly counters: number;
}

export const countersChanged = publicEvent<CountersChangedEvent>("countersChanged");
