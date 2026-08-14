import type { LocalizedString } from "@trox/runtime";
import type {
  AffiliationContent,
  ApollyonIncarnationContent,
  DreamGuideContent,
  DreamscapeContent,
} from "../types/content";
import type { SiteState, SiteType } from "../types/journey";
import { SITE_TYPES } from "../types/site-type";
import {
  bindSourceTransport,
  hydrateSourceTransport,
  localizedSourceText,
} from "../runtime/localization/runtime";
import { localizedGuideDialogue } from "../runtime/localization/runtime-templates.generated";

// Re-export the content types so callers can import dreamscape/guide/affiliation
// shapes alongside their loaders from one module.
export type {
  AffiliationContent,
  ApollyonIncarnationContent,
  DreamGuideContent,
  DreamscapeContent,
} from "../types/content";

const DREAMSCAPES_JSON_PATH = "/dreamscapes-data.json";
const DREAM_GUIDES_JSON_PATH = "/dream-guides-data.json";
const AFFILIATIONS_JSON_PATH = "/affiliations-data.json";
const APOLLYON_INCARNATIONS_JSON_PATH = "/apollyon-incarnations-data.json";
const GUIDE_DIALOGUE_CONTEXTS = new Set([
  "site",
  "random-site",
  "gamble-three-gate",
  "gamble-ladder-climb",
  "gamble-starway-stairs",
  "gamble-four-suit-reprise",
  "gamble-blackjack",
]);
const GAMBLE_DIALOGUE_CONTEXTS = [
  "gamble-three-gate",
  "gamble-ladder-climb",
  "gamble-starway-stairs",
  "gamble-four-suit-reprise",
  "gamble-blackjack",
] as const;
const TEMPLATE_SLOT = /\{([^{}]+)\}/gu;

async function fetchJson<T>(path: string, label: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(
      `Failed to load ${label}: ${String(response.status)} ${response.statusText}`,
    );
  }
  return (await response.json()) as T;
}

/** Fetches the dreamscape definitions from the asset pipeline output. */
export async function loadDreamscapes(): Promise<DreamscapeContent[]> {
  return fetchJson<DreamscapeContent[]>(
    DREAMSCAPES_JSON_PATH,
    "dreamscape data",
  );
}

/** Fetches the Dream Guide definitions from the asset pipeline output. */
export async function loadDreamGuides(): Promise<DreamGuideContent[]> {
  const catalog = await fetchJson<unknown>(
    DREAM_GUIDES_JSON_PATH,
    "dream guide data",
  );
  if (
    typeof catalog !== "object" ||
    catalog === null ||
    !("schemaVersion" in catalog) ||
    !("contentHash" in catalog) ||
    !("guides" in catalog) ||
    catalog.schemaVersion !== 1 ||
    typeof catalog.contentHash !== "string" ||
    !/^[0-9a-f]{64}$/u.test(catalog.contentHash) ||
    !Array.isArray(catalog.guides) ||
    !catalog.guides.every(isDreamGuideContent) ||
    new Set(catalog.guides.map((guide) => guide.id)).size !==
      catalog.guides.length ||
    new Set(catalog.guides.map((guide) => guide.homeDreamscapeId)).size !==
      catalog.guides.length ||
    new Set(catalog.guides.map((guide) => guide.siteType)).size !==
      catalog.guides.length
  ) {
    throw new Error(
      "Failed to load dream guide data: malformed dream-guides-data.json",
    );
  }
  return catalog.guides.map((guide) => ({
    ...guide,
    dialogue: Object.fromEntries(
      Object.entries(guide.dialogue).map(([context, lines]) => [
        context,
        lines.map((line, index) =>
          hydrateSourceTransport(
            line,
            `Dream Guide ${guide.id} ${context}[${String(index)}]`,
          ),
        ),
      ]),
    ),
  }));
}

function isDreamGuideContent(value: unknown): value is DreamGuideContent {
  if (typeof value !== "object" || value === null) return false;
  if (
    !("id" in value) ||
    !("name" in value) ||
    !("portraitSource" in value) ||
    !("homeDreamscapeId" in value) ||
    !("siteType" in value) ||
    !("homeSpecialty" in value) ||
    !("dialogue" in value) ||
    typeof value.id !== "string" ||
    value.id.trim() === "" ||
    typeof value.name !== "string" ||
    value.name.trim() === "" ||
    typeof value.portraitSource !== "string" ||
    value.portraitSource.trim() === "" ||
    typeof value.homeDreamscapeId !== "string" ||
    value.homeDreamscapeId.trim() === "" ||
    typeof value.siteType !== "string" ||
    !SITE_TYPES.includes(value.siteType as SiteType) ||
    typeof value.homeSpecialty !== "string" ||
    value.homeSpecialty.trim() === "" ||
    typeof value.dialogue !== "object" ||
    value.dialogue === null ||
    !("site" in value.dialogue) ||
    !Array.isArray(value.dialogue.site) ||
    value.dialogue.site.length === 0
  ) {
    return false;
  }
  const dialogue = value.dialogue as Record<string, unknown>;
  if (
    Object.keys(dialogue).some(
      (context) => !GUIDE_DIALOGUE_CONTEXTS.has(context),
    ) ||
    (value.siteType === "RandomSite" &&
      !Array.isArray(dialogue["random-site"])) ||
    (value.siteType === "Gamble" &&
      GAMBLE_DIALOGUE_CONTEXTS.some(
        (context) => !Array.isArray(dialogue[context]),
      ))
  ) {
    return false;
  }
  let hasWinEssenceSlot = false;
  for (const [context, lines] of Object.entries(dialogue)) {
    if (
      !Array.isArray(lines) ||
      lines.length === 0 ||
      lines.some(
        (line: unknown) =>
          (typeof line !== "string" || line.trim() === "") &&
          !(
            typeof line === "object" &&
            line !== null &&
            "format" in line &&
            line.format === "trox-source-message-ref"
          ),
      )
    ) {
      return false;
    }
    for (const line of lines) {
      if (typeof line !== "string") {
        if (context === "gamble-ladder-climb") hasWinEssenceSlot = true;
        continue;
      }
      const slots = [...line.matchAll(TEMPLATE_SLOT)].map((match) => match[1]);
      if (
        slots.some(
          (slot) => context !== "gamble-ladder-climb" || slot !== "win_essence",
        )
      ) {
        return false;
      }
      if (context === "gamble-ladder-climb" && slots.includes("win_essence")) {
        hasWinEssenceSlot = true;
      }
    }
  }
  return value.siteType !== "Gamble" || hasWinEssenceSlot;
}

/** Fetches the affiliation definitions from the asset pipeline output. */
export async function loadAffiliations(): Promise<AffiliationContent[]> {
  return fetchJson<AffiliationContent[]>(
    AFFILIATIONS_JSON_PATH,
    "affiliation data",
  );
}

/** Fetches Apollyon's incarnation definitions from the asset pipeline output. */
export async function loadApollyonIncarnations(): Promise<
  ApollyonIncarnationContent[]
> {
  return fetchJson<ApollyonIncarnationContent[]>(
    APOLLYON_INCARNATIONS_JSON_PATH,
    "Apollyon incarnation data",
  );
}

// ---------------------------------------------------------------------------
// Dreamscape -> guide -> signature site helpers
// ---------------------------------------------------------------------------
//
// Every non-starter dreamscape has a resident Dream Guide whose home specialty
// is a single signature site type. Site composition treats that signature site
// as the dreamscape's enhanced site and draws fill from the *other* dreamscapes'
// signature sites, so these helpers centralise the dreamscape -> signature-site
// mapping the generator relies on.

/**
 * The signature site types of every non-starter dreamscape. Each is a distinct
 * site type (the 10 guide site types), so the result has no duplicates. This is
 * the universe the composition fill pool draws the "other guides' signature
 * sites" from.
 */
function guideSignatureSites(
  dreamscapes: readonly DreamscapeContent[],
): SiteType[] {
  const sites: SiteType[] = [];
  for (const dreamscape of dreamscapes) {
    if (dreamscape.isStarter) {
      continue;
    }
    if (!sites.includes(dreamscape.signatureSite)) {
      sites.push(dreamscape.signatureSite);
    }
  }
  return sites;
}

/**
 * The signature sites of every non-starter dreamscape *except* `homeSite`,
 * i.e. the fill candidates for a dreamscape whose own enhanced site is
 * `homeSite`. The home site is excluded so the dreamscape's signature site is
 * never duplicated by the fill.
 */
export function otherGuideSignatureSites(
  dreamscapes: readonly DreamscapeContent[],
  homeSite: SiteType,
): SiteType[] {
  return guideSignatureSites(dreamscapes).filter((site) => site !== homeSite);
}

/**
 * The Dream Guide resident at a given site type, or `null` when no guide tends
 * that site type. Each guide tends exactly one site type (its home dreamscape's
 * signature site), so a guide appears wherever that site type appears — in its
 * home dreamscape (where the site is enhanced) and as fill in other dreamscapes
 * (where the same site type is unenhanced). The frame presentation uses this to
 * resolve which guide greets the player at a guide-bearing site screen.
 */
export function guideForSiteType(
  guides: readonly DreamGuideContent[],
  siteType: SiteType,
  presentingGuideId?: string,
): DreamGuideContent | null {
  if (presentingGuideId !== undefined) {
    return guides.find((guide) => guide.id === presentingGuideId) ?? null;
  }
  return guides.find((guide) => guide.siteType === siteType) ?? null;
}

/** Resolve exactly one authored guide, failing when content is incomplete. */
export function requireGuideForSiteType(
  guides: readonly DreamGuideContent[],
  siteType: SiteType,
  presentingGuideId?: string,
): DreamGuideContent {
  const matches =
    presentingGuideId === undefined
      ? guides.filter((guide) => guide.siteType === siteType)
      : guides.filter((guide) => guide.id === presentingGuideId);
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one Dream Guide for ${presentingGuideId ?? siteType}; found ${String(matches.length)}.`,
    );
  }
  return matches[0];
}

/** Resolve a named dialogue context and expand its validated template slots. */
export function guideDialogueLines(
  guide: DreamGuideContent,
  context: string,
  values: Readonly<Record<string, LocalizedString | number>> = {},
): readonly LocalizedString[] {
  const lines = guide.dialogue[context];
  if (lines === undefined || lines.length === 0) {
    throw new Error(`Dream Guide ${guide.id} has no ${context} dialogue.`);
  }
  return lines.map((line) => {
    if (typeof line !== "string") return bindSourceTransport(line, values);
    const staticDialogue = localizedGuideDialogue(line);
    return staticDialogue ?? localizedSourceText(line, values);
  });
}

/** Resolve the guide for a concrete site, honoring Random Site hosting. */
export function guideForSite(
  guides: readonly DreamGuideContent[],
  site: Pick<SiteState, "type" | "randomSite">,
): DreamGuideContent | null {
  const presentingGuideId = site.randomSite?.presentingGuideId;
  if (presentingGuideId !== undefined) {
    return guides.find((guide) => guide.id === presentingGuideId) ?? null;
  }
  return guideForSiteType(guides, site.type);
}
