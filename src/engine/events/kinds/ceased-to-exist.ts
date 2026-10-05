import type { InstanceId } from "../../state/ids";
import { publicEvent } from "../types";

/** A created card ceased to exist: it is gone from the battle and in no zone. */
export interface CeasedToExistEvent {
  readonly kind: "ceasedToExist";
  readonly instance: InstanceId;
}

export const ceasedToExist = publicEvent<CeasedToExistEvent>("ceasedToExist");
