import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { patchTomlRecord } from "./card-editor-data.mjs";
import { transformDreamscape } from "./setup-assets.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_DREAMSCAPE_TOML_PATH = join("data", "tabula", "dreamscapes.toml");
const DREAMSCAPE_JSON_PATH = join("public", "dreamscapes-data.json");
const DREAM_GUIDES_TOML_PATH = join("data", "tabula", "dream_guides.toml");
const AFFILIATIONS_TOML_PATH = join("data", "tabula", "affiliations.toml");
const DREAM_AVATARS_TOML_PATH = join("data", "tabula", "dream_avatars.toml");

/**
 * Each non-starter dreamscape must list 3-4 resident DreamAvatars and every
 * DreamAvatar belongs to at most one region (see `validateDreamAvatarMapping` in
 * setup-assets, which is fatal on a duplicate assignment or an out-of-range
 * count). The editor enforces these same bounds on every reassignment so a save
 * can never write a build-breaking dreamscapes.toml.
 */
export const MIN_DREAM_AVATARS_PER_REGION = 3;
export const MAX_DREAM_AVATARS_PER_REGION = 4;

/**
 * The SiteType enum (see `src/types/journey.ts`). A dreamscape's `signature-site`
 * is the one site type its resident Dream Guide enhances at home, so the editor
 * constrains edits to this fixed set. Kept in sync with the TS enum by hand;
 * SiteType is source code, not authored game-design data.
 */
export const SITE_TYPES = [
  "Battle",
  "Draft",
  "Shop",
  "Purge",
  "Essence",
  "Transfiguration",
  "Duplication",
  "Reward",
  "Augury",
  "DreamsignMarket",
  "DreamsignRevelation",
  "TemptingOffer",
  "Gamble",
  "Exploration",
];

/**
 * Dreamscape fields the editor can save. `name` and `aesthetic` are free text;
 * `signature-site` is a SiteType; `guide-id` and `affiliation-id` reference the
 * Dream Guide and affiliation catalogs; `site-icon` is the Atlas marker icon
 * reference. Identity (`id`) and the starter-only `is-starter` / `fixed-sites`
 * are left untouched.
 */
export const EDITABLE_DREAMSCAPE_FIELDS = new Set([
  "name",
  "aesthetic",
  "signature-site",
  "guide-id",
  "affiliation-id",
  "site-icon",
]);

// `guide-id` and `affiliation-id` are absent on the starter dreamscape, so the
// patcher appends them to the record block on first save rather than replacing
// an existing line in place.
const OPTIONAL_DREAMSCAPE_FIELDS = new Set(["guide-id", "affiliation-id"]);

function validationFailure(field, message, value) {
  return { ok: false, field, value, message };
}

function validationSuccess(field, value) {
  return { ok: true, field, value };
}

function readSourceDreamscapes(rootDir, dreamscapeTomlPath = DEFAULT_DREAMSCAPE_TOML_PATH) {
  const absoluteTomlPath = join(rootDir, dreamscapeTomlPath);
  const parsed = parse(readFileSync(absoluteTomlPath, "utf8"));
  const dreamscapes = parsed.dreamscapes;

  if (!Array.isArray(dreamscapes)) {
    throw new Error(`Expected [[dreamscapes]] array in ${dreamscapeTomlPath}`);
  }

  return dreamscapes;
}

function editorRecordFromDreamscape(dreamscape, index) {
  return {
    id: dreamscape.id,
    name: typeof dreamscape.name === "string" ? dreamscape.name : "",
    aesthetic: typeof dreamscape.aesthetic === "string" ? dreamscape.aesthetic : "",
    "signature-site":
      typeof dreamscape["signature-site"] === "string"
        ? dreamscape["signature-site"]
        : "",
    "guide-id": typeof dreamscape["guide-id"] === "string" ? dreamscape["guide-id"] : null,
    "affiliation-id":
      typeof dreamscape["affiliation-id"] === "string"
        ? dreamscape["affiliation-id"]
        : null,
    "site-icon": typeof dreamscape["site-icon"] === "string" ? dreamscape["site-icon"] : "",
    isStarter: dreamscape["is-starter"] === true,
    fixedSites: Array.isArray(dreamscape["fixed-sites"])
      ? dreamscape["fixed-sites"].filter((entry) => typeof entry === "string")
      : [],
    dreamAvatarIds: Array.isArray(dreamscape["dream-avatar-ids"])
      ? dreamscape["dream-avatar-ids"].filter((entry) => typeof entry === "string")
      : [],
    sourceIndex: index,
    source: dreamscape,
  };
}

export function readEditorDreamscapes({
  rootDir = ROOT,
  dreamscapeTomlPath = DEFAULT_DREAMSCAPE_TOML_PATH,
} = {}) {
  return readSourceDreamscapes(rootDir, dreamscapeTomlPath).map(editorRecordFromDreamscape);
}

/**
 * Read the Dream Guide catalog as `{ id, name, homeDreamscapeId, siteType }`
 * options for the editor's guide picker. Names are display-only; ids are the
 * authoritative key written back into a dreamscape's `guide-id`.
 */
export function readDreamGuideOptions({ rootDir = ROOT } = {}) {
  const parsed = parse(readFileSync(join(rootDir, DREAM_GUIDES_TOML_PATH), "utf8"));
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
      siteType: typeof guide["site-type"] === "string" ? guide["site-type"] : null,
    }));
}

/**
 * Read the affiliation catalog as `{ id, name }` options for the editor's
 * affiliation picker.
 */
export function readAffiliationOptions({ rootDir = ROOT } = {}) {
  const parsed = parse(readFileSync(join(rootDir, AFFILIATIONS_TOML_PATH), "utf8"));
  const affiliations = Array.isArray(parsed.affiliations) ? parsed.affiliations : [];
  return affiliations
    .filter((affiliation) => typeof affiliation.id === "string")
    .map((affiliation) => ({
      id: affiliation.id,
      name: typeof affiliation.name === "string" ? affiliation.name : affiliation.id,
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

    if (field === "aesthetic") {
      if (typeof rawValue !== "string") {
        return validationFailure(field, "Aesthetic must be text.", rawValue);
      }
      const value = rawValue.trim();
      return value.length === 0
        ? validationFailure(field, "Aesthetic cannot be blank.", rawValue)
        : validationSuccess(field, value);
    }

    if (field === "site-icon") {
      if (typeof rawValue !== "string") {
        return validationFailure(field, "Site icon must be text.", rawValue);
      }
      const value = rawValue.trim();
      return value.length === 0
        ? validationFailure(field, "Site icon cannot be blank.", rawValue)
        : validationSuccess(field, value);
    }

    if (field === "signature-site") {
      if (typeof rawValue !== "string" || !SITE_TYPES.includes(rawValue)) {
        return validationFailure(field, "Signature site must be a known site type.", rawValue);
      }
      return validationSuccess(field, rawValue);
    }

    if (field === "guide-id") {
      if (typeof rawValue !== "string" || !validGuideIds.has(rawValue)) {
        return validationFailure(field, "Dream guide must be a known guide.", rawValue);
      }
      return validationSuccess(field, rawValue);
    }

    if (field === "affiliation-id") {
      if (typeof rawValue !== "string" || !validAffiliationIds.has(rawValue)) {
        return validationFailure(field, "Affiliation must be a known affiliation.", rawValue);
      }
      return validationSuccess(field, rawValue);
    }

    return validationFailure(field, "This field is not editable.", rawValue);
  };
}

export function patchDreamscapesToml(source, { dreamscapeId, field, value, validateEdit }) {
  return patchTomlRecord(source, {
    id: dreamscapeId,
    tableName: "dreamscapes",
    editableFields: EDITABLE_DREAMSCAPE_FIELDS,
    validateEdit,
    field,
    value,
    optionalFields: OPTIONAL_DREAMSCAPE_FIELDS,
    notFoundNoun: "Dreamscape",
  });
}

export function refreshDreamscapesDataJson({
  rootDir = ROOT,
  dreamscapeTomlPath = DEFAULT_DREAMSCAPE_TOML_PATH,
} = {}) {
  const dreamscapes = readSourceDreamscapes(rootDir, dreamscapeTomlPath).map((dreamscape) =>
    transformDreamscape(dreamscape),
  );
  const dreamscapesJsonPath = join(rootDir, DREAMSCAPE_JSON_PATH);

  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(dreamscapesJsonPath, JSON.stringify(dreamscapes, null, 2) + "\n");

  return {
    count: dreamscapes.length,
    path: dreamscapesJsonPath,
  };
}

/**
 * Read the DreamAvatar catalog as `{ id, name, title, imageNumber, renderedText }`
 * options for the editor's resident-DreamAvatar picker, portraits, and ability
 * hover popovers. Ids are the canonical UUID key written into a dreamscape's
 * `dream-avatar-ids`.
 */
export function readDreamAvatarOptions({ rootDir = ROOT } = {}) {
  const parsed = parse(readFileSync(join(rootDir, DREAM_AVATARS_TOML_PATH), "utf8"));
  const dreamAvatars = Array.isArray(parsed.dreamAvatar) ? parsed.dreamAvatar : [];
  return dreamAvatars
    .filter((dreamAvatar) => typeof dreamAvatar.id === "string")
    .map((dreamAvatar) => ({
      id: dreamAvatar.id,
      name: typeof dreamAvatar.name === "string" ? dreamAvatar.name : dreamAvatar.id,
      title: typeof dreamAvatar.title === "string" ? dreamAvatar.title : "",
      imageNumber:
        typeof dreamAvatar["image-number"] === "string" ? dreamAvatar["image-number"] : "",
      renderedText:
        typeof dreamAvatar["rendered-text"] === "string" ? dreamAvatar["rendered-text"] : "",
    }));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Locate the `[[dreamscapes]]` block whose `id` equals `dreamscapeId`, returning
 * its `[start, end)` offsets within `source` (end is the next block header or
 * EOF). Returns null when no such block exists.
 */
function dreamscapeBlockRange(source, dreamscapeId) {
  const header = "[[dreamscapes]]";
  const headers = [];
  for (let idx = source.indexOf(header); idx !== -1; idx = source.indexOf(header, idx + header.length)) {
    headers.push(idx);
  }

  const idPattern = new RegExp(
    `(^|\\n)[ \\t]*id[ \\t]*=[ \\t]*"${escapeRegExp(dreamscapeId)}"[ \\t]*(?:#.*)?(?=\\n|$)`,
    "u",
  );

  for (let i = 0; i < headers.length; i += 1) {
    const start = headers[i];
    const end = i + 1 < headers.length ? headers[i + 1] : source.length;
    if (idPattern.test(source.slice(start, end))) {
      return { start, end };
    }
  }

  return null;
}

/**
 * Serialize a `dream-avatar-ids` array in the authored multiline style — one
 * UUID per line with a trailing `# Display Name` comment for human readers — so
 * a save preserves the format of `dreamscapes.toml`. An empty list collapses to
 * the inline `dream-avatar-ids = []`.
 */
function serializeDreamAvatarIdsField(ids, nameById) {
  if (ids.length === 0) {
    return "dream-avatar-ids = []";
  }
  const lines = ids.map((id) => {
    const name = nameById.get(id.toLowerCase());
    return `  "${id}",${name !== undefined && name !== "" ? ` # ${name}` : ""}`;
  });
  return `dream-avatar-ids = [\n${lines.join("\n")}\n]`;
}

/**
 * Replace (or, when absent, append) the `dream-avatar-ids` array of a single
 * dreamscape block in `source`. The rest of the file — comments, field order,
 * and every other record — is left byte-for-byte unchanged.
 */
export function rewriteDreamAvatarIds(source, { dreamscapeId, ids, nameById }) {
  const block = dreamscapeBlockRange(source, dreamscapeId);
  if (block === null) {
    throw new Error(`Dreamscape ${dreamscapeId} was not found`);
  }

  const blockText = source.slice(block.start, block.end);
  const fieldMatch = /(^|\n)([ \t]*)dream-avatar-ids[ \t]*=[ \t]*\[/u.exec(blockText);
  const serialized = serializeDreamAvatarIdsField(ids, nameById);

  let patched;
  if (fieldMatch === null) {
    // The block has no array yet (e.g. a region that just gained its first
    // resident). Append it to the end of the block, trimming trailing blank
    // lines so the field sits flush against the record.
    const trimmed = blockText.replace(/\s*$/u, "");
    const rebuiltBlock = `${trimmed}\n${serialized}\n`;
    patched = source.slice(0, block.start) + rebuiltBlock + source.slice(block.end);
  } else {
    const fieldStartInBlock = fieldMatch.index + fieldMatch[1].length;
    const openBracketInBlock = fieldMatch.index + fieldMatch[0].length - 1;
    const closeBracketInBlock = blockText.indexOf("]", openBracketInBlock);
    if (closeBracketInBlock === -1) {
      throw new Error(`Dreamscape ${dreamscapeId} has an unterminated dream-avatar-ids array`);
    }
    const absStart = block.start + fieldStartInBlock;
    const absEnd = block.start + closeBracketInBlock + 1;
    patched = source.slice(0, absStart) + serialized + source.slice(absEnd);
  }

  parse(patched);
  return patched;
}

function regionForDreamAvatar(dreamscapes, dreamAvatarId) {
  const key = dreamAvatarId.toLowerCase();
  return (
    dreamscapes.find((scape) =>
      scape.dreamAvatarIds.some((id) => id.toLowerCase() === key),
    ) ?? null
  );
}

function withoutId(ids, dreamAvatarId) {
  const key = dreamAvatarId.toLowerCase();
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
 * Compute the set of `dream-avatar-ids` array changes for one reassignment,
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
export function planDreamAvatarAssignment(dreamscapes, catalogIds, request) {
  const knownById = new Map(catalogIds.map((id) => [id.toLowerCase(), id]));
  const { action, dreamscapeId } = request;

  const target = dreamscapes.find((scape) => scape.id === dreamscapeId) ?? null;
  if (target === null) {
    return planFailure(`Dreamscape ${String(dreamscapeId)} was not found.`);
  }
  if (target.isStarter) {
    return planFailure("The starter dreamscape cannot host DreamAvatars.");
  }

  const canonicalIn =
    request.inId === undefined ? null : knownById.get(String(request.inId).toLowerCase()) ?? null;
  const canonicalOut =
    request.outId === undefined
      ? null
      : target.dreamAvatarIds.find(
          (id) => id.toLowerCase() === String(request.outId).toLowerCase(),
        ) ?? null;

  const targetHas = (id) =>
    target.dreamAvatarIds.some((existing) => existing.toLowerCase() === id.toLowerCase());

  if (action === "replace") {
    if (canonicalOut === null) {
      return planFailure("The DreamAvatar to replace is not a resident of this region.");
    }
    if (request.inId !== undefined && canonicalIn === null) {
      return planFailure("The replacement is not a known DreamAvatar.");
    }
    if (canonicalIn === null) {
      return planFailure("Choose a replacement DreamAvatar.");
    }
    if (targetHas(canonicalIn)) {
      return planFailure("That DreamAvatar already lives in this region.");
    }

    const source = regionForDreamAvatar(dreamscapes, canonicalIn);
    const changes = [
      { id: target.id, ids: replaceId(target.dreamAvatarIds, canonicalOut, canonicalIn) },
    ];
    if (source !== null) {
      // Swap: the displaced resident takes the incoming caller's old slot, so
      // the source region keeps its count.
      changes.push({
        id: source.id,
        ids: replaceId(source.dreamAvatarIds, canonicalIn, canonicalOut),
      });
    }
    return { ok: true, changes };
  }

  if (action === "add") {
    if (canonicalIn === null) {
      return planFailure("Choose a DreamAvatar to add.");
    }
    if (targetHas(canonicalIn)) {
      return planFailure("That DreamAvatar already lives in this region.");
    }
    if (target.dreamAvatarIds.length >= MAX_DREAM_AVATARS_PER_REGION) {
      return planFailure(
        `A region can host at most ${String(MAX_DREAM_AVATARS_PER_REGION)} DreamAvatars.`,
      );
    }

    const source = regionForDreamAvatar(dreamscapes, canonicalIn);
    if (source !== null && source.dreamAvatarIds.length <= MIN_DREAM_AVATARS_PER_REGION) {
      return planFailure(
        `${source.name} would drop below ${String(MIN_DREAM_AVATARS_PER_REGION)} DreamAvatars. ` +
          "Swap with one of its residents instead.",
      );
    }

    const changes = [
      { id: target.id, ids: [...target.dreamAvatarIds, canonicalIn] },
    ];
    if (source !== null) {
      changes.push({ id: source.id, ids: withoutId(source.dreamAvatarIds, canonicalIn) });
    }
    return { ok: true, changes };
  }

  if (action === "remove") {
    if (canonicalOut === null) {
      return planFailure("The DreamAvatar to remove is not a resident of this region.");
    }
    if (target.dreamAvatarIds.length <= MIN_DREAM_AVATARS_PER_REGION) {
      return planFailure(
        `A region must keep at least ${String(MIN_DREAM_AVATARS_PER_REGION)} DreamAvatars. ` +
          "Replace this one instead of removing it.",
      );
    }
    return {
      ok: true,
      changes: [{ id: target.id, ids: withoutId(target.dreamAvatarIds, canonicalOut) }],
    };
  }

  return planFailure(`Unknown action ${String(action)}.`);
}

/**
 * Apply a list of `{ id, ids }` region changes to the raw dreamscapes.toml
 * source, rewriting each affected `dream-avatar-ids` array in place.
 */
export function applyDreamAvatarChanges(source, changes, nameById) {
  let next = source;
  for (const change of changes) {
    next = rewriteDreamAvatarIds(next, {
      dreamscapeId: change.id,
      ids: change.ids,
      nameById,
    });
  }
  return next;
}
