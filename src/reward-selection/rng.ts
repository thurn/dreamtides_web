import { sha256 } from "js-sha256";
import { SELECTION_RULES_VERSION, type RewardSelectionRequest } from "./types";

export interface RewardSelectionStream {
  readonly saltParts: readonly string[];
  draw(): number;
  drawsConsumed(): number;
}

export function createRewardSelectionStream(
  request: RewardSelectionRequest,
  purpose: string,
): RewardSelectionStream {
  const saltParts = [
    SELECTION_RULES_VERSION,
    request.scope.journeySeed,
    request.scope.siteUuid,
    request.scope.selectionKey,
    request.policyId,
    purpose,
  ] as const;
  const salt = saltParts.join("|");
  let counter = 0;
  return {
    saltParts,
    draw() {
      const digest = sha256(`${salt}|${String(counter)}`);
      counter += 1;
      return Number.parseInt(digest.slice(0, 13), 16) / 0x10000000000000;
    },
    drawsConsumed: () => counter,
  };
}
