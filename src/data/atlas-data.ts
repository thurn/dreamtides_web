import type { AtlasData } from "../types/atlas-data";
import { hydrateSourceTransport } from "../runtime/localization/runtime";
import { parseContentHash, parseFoldHash } from "../types/content-hash";

export type { AtlasData } from "../types/atlas-data";

const ATLAS_DATA_JSON_PATH = "/atlas-data.json";
const SHA256_HEX = /^[0-9a-f]{64}$/u;

/** Fetches the validated Dream Atlas document emitted by the asset pipeline. */
export async function loadAtlasData(): Promise<AtlasData> {
  const response = await fetch(ATLAS_DATA_JSON_PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to load Atlas data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const value: unknown = await response.json();
  if (
    typeof value !== "object" ||
    value === null ||
    (value as Partial<AtlasData>).schemaVersion !== 1 ||
    !SHA256_HEX.test((value as Partial<AtlasData>).contentHash ?? "") ||
    !SHA256_HEX.test((value as Partial<AtlasData>).foldHash ?? "") ||
    !Array.isArray((value as Partial<AtlasData>).layers)
  ) {
    throw new Error("Failed to load Atlas data: malformed atlas-data.json");
  }
  const raw = value as AtlasData;
  return {
    ...raw,
    contentHash: parseContentHash(raw.contentHash),
    foldHash: parseFoldHash(raw.foldHash),
    presentation: {
      ...raw.presentation,
      unseenTitle: hydrateSourceTransport(
        raw.presentation.unseenTitle,
        "Atlas unseen title",
      ),
      unseenBody: hydrateSourceTransport(
        raw.presentation.unseenBody,
        "Atlas unseen body",
      ),
      starterBody: hydrateSourceTransport(
        raw.presentation.starterBody,
        "Atlas starter body",
      ),
      affiliationTitleTemplate: hydrateSourceTransport(
        raw.presentation.affiliationTitleTemplate,
        "Atlas affiliation title template",
      ),
      affiliationBodyTemplate: hydrateSourceTransport(
        raw.presentation.affiliationBodyTemplate,
        "Atlas affiliation body template",
      ),
    },
  };
}

/** Expands one validated Atlas presentation template. */
export function atlasTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  return template.replace(
    /\{([^{}]+)\}/gu,
    (_match, key: string) => values[key] ?? "",
  );
}
