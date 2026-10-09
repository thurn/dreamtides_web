import type { InstanceId } from "../../state/ids";
import type { Expiry } from "../../state/types";
import { publicEvent } from "../types";

/**
 * A character gained N✦ (rules § Spark): permanently (`expiry` never) or
 * until `expiry`. `additional` marks the gain an additional-spark ability
 * made ("it gains 1 additional ✦"), which triggers no "when … gains ✦"
 * ability (rules § Spark → Additional spark).
 */
export interface SparkGainedEvent {
  readonly kind: "sparkGained";
  readonly instance: InstanceId;
  readonly amount: number;
  readonly expiry: Expiry;
  readonly additional: boolean;
}

export const sparkGained = publicEvent<SparkGainedEvent>("sparkGained");
