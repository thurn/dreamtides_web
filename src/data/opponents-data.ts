import type { OpponentsData } from "../types/opponents-data";
import { opponentsDocument } from "../content/documents";
import { parseContentHash, parseFoldHash } from "../types/content-hash";

export type { OpponentsData } from "../types/opponents-data";

const SHA256_HEX = /^[0-9a-f]{64}$/u;

/** Validates the opponent configuration used by every battle. */
export function loadOpponentsData(): OpponentsData {
  return parseOpponentsData(opponentsDocument());
}

/** Validates an opponent configuration document. */
export function parseOpponentsData(value: unknown): OpponentsData {
  const candidate = value as Partial<OpponentsData>;
  if (
    typeof value !== "object" ||
    value === null ||
    candidate.schemaVersion !== 1 ||
    !SHA256_HEX.test(candidate.contentHash ?? "") ||
    !SHA256_HEX.test(candidate.foldHash ?? "") ||
    !Number.isInteger(candidate.opponentDeckSize) ||
    (candidate.opponentDeckSize ?? 0) <= 0 ||
    candidate.battle === undefined ||
    candidate.dreamwell === undefined ||
    candidate.progression === undefined ||
    candidate.ai === undefined
  ) {
    throw new Error(
      "Failed to load opponent data: malformed opponents document",
    );
  }
  const decoded = value as OpponentsData;
  return {
    ...decoded,
    contentHash: parseContentHash(candidate.contentHash),
    foldHash: parseFoldHash(candidate.foldHash),
    ai: {
      ...decoded.ai,
      tutorialDefaultPreset: decoded.ai.tutorialDefaultPreset,
      presets: Object.fromEntries(
        Object.entries(decoded.ai.presets).map(([key, preset]) => [
          key,
          { ...preset, id: preset.id },
        ]),
      ),
    },
  };
}
