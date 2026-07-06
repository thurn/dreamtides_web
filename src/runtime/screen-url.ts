import type { QuestState, SiteType } from "../types/quest";
import { layerOrdinal } from "../types/layer-name";

/**
 * Maps the quest's current screen to a human-readable address-bar path, so the
 * URL reflects where the player is (e.g. `/dreamscape/2-ember-wood/purge` for
 * the Purge site of the layer-2 Ember Wood dreamscape, `/atlas` for the Dream
 * Atlas).
 *
 * The path is a passive *reflection* of authoritative, Firebase-synced quest
 * state — it is derived from state, never the source of it. The room id in the
 * query string (`?game=<roomId>`) remains the resume key: a reload restores the
 * run from the room and the path is re-derived from the restored screen. Because
 * the path is one-way, it does not fight co-op state sync (two clients sharing a
 * room each reflect the same screen) and a stale bookmarked path is harmlessly
 * rewritten to match the actual screen once the room loads.
 *
 * Path grammar:
 * ```
 * /                                  Dreamcaller selection (questStart)
 * /atlas                             Dream Atlas
 * /dreamscape/<layer>-<biome>        a dreamscape's site-selection screen
 * /dreamscape/<layer>-<biome>/<site> a specific site within a dreamscape
 * /complete                          quest victory
 * /failed                            quest defeat
 * ```
 */
export function screenToQuestPath(state: QuestState): string {
  const { screen } = state;
  switch (screen.type) {
    case "questStart":
      return "/";
    case "atlas":
      return "/atlas";
    case "questComplete":
      return "/complete";
    case "questFailed":
      return "/failed";
    case "dreamscape":
      return dreamscapeBasePath(state);
    case "site": {
      const base = dreamscapeBasePath(state);
      const site = activeSite(state, screen.siteId);
      return site === undefined ? base : `${base}/${siteTypeSlug(site.type)}`;
    }
  }
}

/** Base path for the current dreamscape, keyed by its biome slug when known. */
function dreamscapeBasePath(state: QuestState): string {
  const slug = dreamscapeSlug(state);
  return slug === null ? "/dreamscape" : `/dreamscape/${slug}`;
}

/**
 * URL slug for the player's current dreamscape node, `<layer>-<biome>` (e.g.
 * layer-2 Ember Wood -> `2-ember-wood`). Biome names repeat across the atlas, so
 * the layer prefix disambiguates them; it is also an exact locator, since the
 * player occupies exactly one node per layer. The biome falls back to the node
 * id slug when the node is unnamed. `null` when the player is not inside a
 * dreamscape (e.g. on the Atlas).
 */
function dreamscapeSlug(state: QuestState): string | null {
  const nodeId = state.currentDreamscape;
  if (nodeId === null) return null;
  const node = state.atlas.nodes[nodeId];
  if (node === undefined) return null;
  const name = slugify(node.biomeName) || slugify(node.id);
  return `${String(layerOrdinal(node.layer))}-${name}`;
}

/** Resolves the site occupied on a `site` screen, or `undefined` if missing. */
function activeSite(state: QuestState, siteId: string) {
  const nodeId = state.currentDreamscape;
  if (nodeId === null) return undefined;
  return state.atlas.nodes[nodeId]?.sites.find((site) => site.id === siteId);
}

/**
 * Kebab-cases a `SiteType` for the URL. Derived from the type token itself
 * (`DreamAugury` -> `dream-augury`, `Purge` -> `purge`) so a new site type is
 * reflected automatically without a hand-maintained lookup that could drift.
 */
export function siteTypeSlug(type: SiteType): string {
  return type.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Lowercase, hyphen-joined slug of a display string, keeping only letters and
 * numbers. Unicode-aware so accented biome names slug sensibly. Returns `""`
 * for a value with no slug-able characters.
 */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
