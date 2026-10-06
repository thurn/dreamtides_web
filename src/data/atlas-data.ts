import type { AtlasData } from "../types/atlas-data";
import { atlasDocument } from "../content/documents";
import { parseContentHash, parseFoldHash } from "../types/content-hash";
import { parseDreamscapeArtKey, parseDreamscapeId } from "../types/identifiers";

export type { AtlasData } from "../types/atlas-data";

const SHA256_HEX = /^[0-9a-f]{64}$/u;

/** Validates the Dream Atlas document assembled from the content modules. */
export function loadAtlasData(): AtlasData {
  const value: unknown = atlasDocument();
  if (
    typeof value !== "object" ||
    value === null ||
    (value as Partial<AtlasData>).schemaVersion !== 1 ||
    !SHA256_HEX.test((value as Partial<AtlasData>).contentHash ?? "") ||
    !SHA256_HEX.test((value as Partial<AtlasData>).foldHash ?? "") ||
    !Array.isArray((value as Partial<AtlasData>).layers)
  ) {
    throw new Error("Failed to load Atlas data: malformed Atlas document");
  }
  const raw = value as AtlasData;
  return {
    ...raw,
    boss: {
      ...raw.boss,
      dreamscapeId: parseDreamscapeId(raw.boss.dreamscapeId),
      sceneArtKey: parseDreamscapeArtKey(raw.boss.sceneArtKey),
      iconArtKey: parseDreamscapeArtKey(raw.boss.iconArtKey),
    },
    contentHash: parseContentHash(raw.contentHash),
    foldHash: parseFoldHash(raw.foldHash),
  };
}
