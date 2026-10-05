import type { Duration } from "../../dsl/types";
import type { InstanceId } from "../../state/ids";
import { publicEvent } from "../types";

export interface SparkGainedEvent {
  readonly kind: "sparkGained";
  readonly instance: InstanceId;
  readonly amount: number;
  readonly duration: Duration;
}

export const sparkGained = publicEvent<SparkGainedEvent>("sparkGained");
