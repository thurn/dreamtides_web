import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { SITE_TYPES } from "../src/types/site-type.ts";

export { SITE_TYPES };

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_DREAMSCAPE_TOML_PATH = join("data", "dreamscapes.toml");
export const DREAM_GUIDES_TOML_PATH = join("data", "dream_guides.toml");
const AFFILIATIONS_TOML_PATH = join("data", "affiliations.toml");
const AVATARS_TOML_PATH = join("data", "avatars.toml");

/**
 * Each non-starter dreamscape must list 3-4 resident Avatars and every
 * Avatar belongs to at most one region (see `validateAvatarMapping` in
 * setup-assets, which is fatal on a duplicate assignment or an out-of-range
 * count). The editor enforces these same bounds on every reassignment so a save
 * is rejected before the canonical RON transaction can publish.
 */
export const MIN_AVATARS_PER_REGION = 3;
export const MAX_AVATARS_PER_REGION = 4;

/**
 * Dreamscape fields the editor can save. `name` is free text; `signature-site`
 * is a SiteType; `guide-id` and `affiliation-id` reference the Dream Guide and
 * affiliation catalogs. Identity (`id`) and the starter-only `is-starter` /
 * `fixed-sites` are left untouched.
 */
export const EDITABLE_DREAMSCAPE_FIELDS = new Set([
  "name",
  "signature-site",
  "guide-id",
  "affiliation-id",
]);

function validationFailure(field, message, value) {
  return { ok: false, field, value, message };
}

function validationSuccess(field, value) {
  return { ok: true, field, value };
}

function readSourceDreamscapes(
  rootDir,
  dreamscapeTomlPath = DEFAULT_DREAMSCAPE_TOML_PATH,
) {
  const absoluteTomlPath = join(rootDir, dreamscapeTomlPath);
  const parsed = parse(readFileSync(absoluteTomlPath, "utf8"));
  const dreamscapes = parsed.dreamscapes;

  if (!Array.isArray(dreamscapes)) {
    throw new Error(`Expected [[dreamscapes]] array in ${dreamscapeTomlPath}`);
  }

  return dreamscapes;
}

function editorRecordFromDreamscape(dreamscape, index, guideByHome) {
  const guide = guideByHome.get(dreamscape.id);
  const isStarter = dreamscape["is-starter"] === true;
  return {
    id: dreamscape.id,
    name: typeof dreamscape.name === "string" ? dreamscape.name : "",
    "signature-site": isStarter
      ? dreamscape["signature-site"]
      : (guide?.siteType ?? ""),
    "guide-id": isStarter ? null : (guide?.id ?? null),
    "affiliation-id":
      typeof dreamscape["affiliation-id"] === "string"
        ? dreamscape["affiliation-id"]
        : null,
    isStarter: dreamscape["is-starter"] === true,
    fixedSites: Array.isArray(dreamscape["fixed-sites"])
      ? dreamscape["fixed-sites"].filter((entry) => typeof entry === "string")
      : [],
    avatarIds: Array.isArray(dreamscape["avatar-ids"])
      ? dreamscape["avatar-ids"].filter(
          (entry) => typeof entry === "string",
        )
      : [],
    sourceIndex: index,
    source: dreamscape,
  };
}

export function readEditorDreamscapes({
  rootDir = ROOT,
  dreamscapeTomlPath = DEFAULT_DREAMSCAPE_TOML_PATH,
} = {}) {
  const guideByHome = new Map(
    readDreamGuideOptions({ rootDir }).map((guide) => [
      guide.homeDreamscapeId,
      guide,
    ]),
  );
  return readSourceDreamscapes(rootDir, dreamscapeTomlPath).map(
    (dreamscape, index) =>
      editorRecordFromDreamscape(dreamscape, index, guideByHome),
  );
}

/**
 * Read the Dream Guide catalog as `{ id, name, homeDreamscapeId, siteType }`
 * options for the editor's guide picker. Names are display-only; ids are the
 * authoritative key written back into a dreamscape's `guide-id`.
 */
export function readDreamGuideOptions({ rootDir = ROOT } = {}) {
  const parsed = parse(
    readFileSync(join(rootDir, DREAM_GUIDES_TOML_PATH), "utf8"),
  );
  const guides = Array.isArray(parsed.guides) ? parsed.guides : [];
  return guides
    .filter((guide) => typeof guide.id === "string")
    .map((guide) => ({
      id: guide.id,
      name: typeof guide.name === "string" ? guide.name : guide.id,
      homeDreamscapeId:
        typeof guide["home-dreamscape-id"] === "string"
          ? guide["home-dreamscape-id"]
          : null,
      siteType:
        typeof guide["site-type"] === "string" ? guide["site-type"] : null,
    }));
}

/**
 * Read the affiliation catalog as `{ id, name }` options for the editor's
 * affiliation picker.
 */
export function readAffiliationOptions({ rootDir = ROOT } = {}) {
  const parsed = parse(
    readFileSync(join(rootDir, AFFILIATIONS_TOML_PATH), "utf8"),
  );
  const affiliations = Array.isArray(parsed.affiliations)
    ? parsed.affiliations
    : [];
  return affiliations
    .filter((affiliation) => typeof affiliation.id === "string")
    .map((affiliation) => ({
      id: affiliation.id,
      name:
        typeof affiliation.name === "string"
          ? affiliation.name
          : affiliation.id,
    }));
}

/**
 * Build a `validateEdit(field, value)` validator bound to the live guide and
 * affiliation id sets so a saved `guide-id` / `affiliation-id` is always a real
 * catalog entry. The valid sets are read from the TOML catalogs at request time
 * by the middleware and passed in here.
 */
export function makeValidateDreamscapeEdit({ guideIds, affiliationIds }) {
  const validGuideIds = new Set(guideIds);
  const validAffiliationIds = new Set(affiliationIds);

  return function validateDreamscapeEdit(field, rawValue) {
    if (!EDITABLE_DREAMSCAPE_FIELDS.has(field)) {
      return validationFailure(field, "This field is not editable.", rawValue);
    }

    if (field === "name") {
      if (typeof rawValue !== "string") {
        return validationFailure(field, "Name must be text.", rawValue);
      }
      const value = rawValue.trim();
      return value.length === 0
        ? validationFailure(field, "Name cannot be blank.", rawValue)
        : validationSuccess(field, value);
    }

    if (field === "signature-site") {
      if (typeof rawValue !== "string" || !SITE_TYPES.includes(rawValue)) {
        return validationFailure(
          field,
          "Signature site must be a known site type.",
          rawValue,
        );
      }
      return validationSuccess(field, rawValue);
    }

    if (field === "guide-id") {
      if (typeof rawValue !== "string" || !validGuideIds.has(rawValue)) {
        return validationFailure(
          field,
          "Dream guide must be a known guide.",
          rawValue,
        );
      }
      return validationSuccess(field, rawValue);
    }

    if (field === "affiliation-id") {
      if (typeof rawValue !== "string" || !validAffiliationIds.has(rawValue)) {
        return validationFailure(
          field,
          "Affiliation must be a known affiliation.",
          rawValue,
        );
      }
      return validationSuccess(field, rawValue);
    }

    return validationFailure(field, "This field is not editable.", rawValue);
  };
}

/**
 * Read the Avatar catalog as `{ id, name, title, imageNumber, renderedText }`
 * options for the editor's resident-Avatar picker, portraits, and ability
 * hover popovers. Ids are the canonical UUID key written into a dreamscape's
 * `avatar-ids`.
 */
export function readAvatarOptions({ rootDir = ROOT } = {}) {
  const parsed = parse(
    readFileSync(join(rootDir, AVATARS_TOML_PATH), "utf8"),
  );
  const avatars = Array.isArray(parsed.avatar)
    ? parsed.avatar
    : [];
  return avatars
    .filter((avatar) => typeof avatar.id === "string")
    .map((avatar) => ({
      id: avatar.id,
      name:
        typeof avatar.name === "string"
          ? avatar.name
          : avatar.id,
      title: typeof avatar.title === "string" ? avatar.title : "",
      imageNumber:
        typeof avatar["image-number"] === "string"
          ? avatar["image-number"]
          : "",
      renderedText:
        typeof avatar["rendered-text"] === "string"
          ? avatar["rendered-text"]
          : "",
    }));
}

function regionForAvatar(dreamscapes, avatarId) {
  const key = avatarId.toLowerCase();
  return (
    dreamscapes.find((scape) =>
      scape.avatarIds.some((id) => id.toLowerCase() === key),
    ) ?? null
  );
}

function withoutId(ids, avatarId) {
  const key = avatarId.toLowerCase();
  return ids.filter((id) => id.toLowerCase() !== key);
}

function replaceId(ids, outId, inId) {
  const key = outId.toLowerCase();
  return ids.map((id) => (id.toLowerCase() === key ? inId : id));
}

function planFailure(message) {
  return { ok: false, message };
}

/**
 * Compute the set of `avatar-ids` array changes for one reassignment,
 * enforcing every build invariant so the result is always a valid mapping:
 *
 *   - `replace`: swap resident `outId` out of `dreamscapeId` and `inId` in. When
 *     `inId` already lives in another region, `outId` takes its slot there (a
 *     true swap), so both regions keep their counts.
 *   - `add`: add an unassigned (or surplus) `inId` to a region with room. When
 *     `inId` comes from another region, that region must keep at least the
 *     minimum.
 *   - `remove`: drop `outId` to the unassigned pool, allowed only while the
 *     region stays at or above the minimum.
 *
 * Returns `{ ok: true, changes: [{ id, ids }] }` listing only the regions whose
 * arrays change, or `{ ok: false, message }` describing why the move is illegal.
 */
export function planAvatarAssignment(dreamscapes, catalogIds, request) {
  const knownById = new Map(catalogIds.map((id) => [id.toLowerCase(), id]));
  const { action, dreamscapeId } = request;

  const target = dreamscapes.find((scape) => scape.id === dreamscapeId) ?? null;
  if (target === null) {
    return planFailure(`Dreamscape ${String(dreamscapeId)} was not found.`);
  }
  if (target.isStarter) {
    return planFailure("The starter dreamscape cannot host Avatars.");
  }

  const canonicalIn =
    request.inId === undefined
      ? null
      : (knownById.get(String(request.inId).toLowerCase()) ?? null);
  const canonicalOut =
    request.outId === undefined
      ? null
      : (target.avatarIds.find(
          (id) => id.toLowerCase() === String(request.outId).toLowerCase(),
        ) ?? null);

  const targetHas = (id) =>
    target.avatarIds.some(
      (existing) => existing.toLowerCase() === id.toLowerCase(),
    );

  if (action === "replace") {
    if (canonicalOut === null) {
      return planFailure(
        "The Avatar to replace is not a resident of this region.",
      );
    }
    if (request.inId !== undefined && canonicalIn === null) {
      return planFailure("The replacement is not a known Avatar.");
    }
    if (canonicalIn === null) {
      return planFailure("Choose a replacement Avatar.");
    }
    if (targetHas(canonicalIn)) {
      return planFailure("That Avatar already lives in this region.");
    }

    const source = regionForAvatar(dreamscapes, canonicalIn);
    const changes = [
      {
        id: target.id,
        ids: replaceId(target.avatarIds, canonicalOut, canonicalIn),
      },
    ];
    if (source !== null) {
      // Swap: the displaced resident takes the incoming caller's old slot, so
      // the source region keeps its count.
      changes.push({
        id: source.id,
        ids: replaceId(source.avatarIds, canonicalIn, canonicalOut),
      });
    }
    return { ok: true, changes };
  }

  if (action === "add") {
    if (canonicalIn === null) {
      return planFailure("Choose an Avatar to add.");
    }
    if (targetHas(canonicalIn)) {
      return planFailure("That Avatar already lives in this region.");
    }
    if (target.avatarIds.length >= MAX_AVATARS_PER_REGION) {
      return planFailure(
        `A region can host at most ${String(MAX_AVATARS_PER_REGION)} Avatars.`,
      );
    }

    const source = regionForAvatar(dreamscapes, canonicalIn);
    if (
      source !== null &&
      source.avatarIds.length <= MIN_AVATARS_PER_REGION
    ) {
      return planFailure(
        `${source.name} would drop below ${String(MIN_AVATARS_PER_REGION)} Avatars. ` +
          "Swap with one of its residents instead.",
      );
    }

    const changes = [
      { id: target.id, ids: [...target.avatarIds, canonicalIn] },
    ];
    if (source !== null) {
      changes.push({
        id: source.id,
        ids: withoutId(source.avatarIds, canonicalIn),
      });
    }
    return { ok: true, changes };
  }

  if (action === "remove") {
    if (canonicalOut === null) {
      return planFailure(
        "The Avatar to remove is not a resident of this region.",
      );
    }
    if (target.avatarIds.length <= MIN_AVATARS_PER_REGION) {
      return planFailure(
        `A region must keep at least ${String(MIN_AVATARS_PER_REGION)} Avatars. ` +
          "Replace this one instead of removing it.",
      );
    }
    return {
      ok: true,
      changes: [
        { id: target.id, ids: withoutId(target.avatarIds, canonicalOut) },
      ],
    };
  }

  return planFailure(`Unknown action ${String(action)}.`);
}
