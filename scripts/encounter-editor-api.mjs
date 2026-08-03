import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  editEncounterTemplate,
  editEncounterCandidateText,
  editEncounterCandidateVariable,
  readEncounterEditorGroups,
  selectEncounterCandidate,
  updateEncounterCandidates,
  updateEncounterTemplate,
} from "./encounter-editor-data.mjs";
import { readEncounterTemplateHealth } from "./encounter-template-health.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/encounters";
const DEFAULT_CURATED_ART_DIR = join(
  homedir(),
  "Documents",
  "shutterstock",
  "quest_prototype_assets",
  "exploration",
);
const DEFAULT_SOURCE_ART_DIR = join(
  homedir(),
  "Documents",
  "shutterstock",
  "images",
);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const PAIR_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const IMAGE_NUMBER_PATTERN = /^\d+$/u;
const TEMPLATE_ID_PATTERN = /^\d+$/u;
const IMAGE_CONTENT_TYPES = new Map([
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

function respond(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function fail(res, status, code, message) {
  respond(res, status, { error: { code, message } });
}

function artError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function imageFiles(directory) {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() || entry.isSymbolicLink())
    .map((entry) => join(directory, entry.name))
    .filter((path) => IMAGE_CONTENT_TYPES.has(extname(path).toLowerCase()));
}

/** Resolve editor art using the curated full-resolution set before Shutterstock sources. */
export async function resolveEncounterEditorArt(
  imageNumber,
  {
    curatedArtDir = DEFAULT_CURATED_ART_DIR,
    sourceArtDir = DEFAULT_SOURCE_ART_DIR,
  } = {},
) {
  if (!IMAGE_NUMBER_PATTERN.test(imageNumber)) {
    throw artError("INVALID_ART_ID", "Artwork image number must contain digits only.");
  }
  const curatedMatches = (await imageFiles(curatedArtDir)).filter(
    (path) => basename(path, extname(path)) === imageNumber,
  );
  if (curatedMatches.length > 1) {
    throw artError(
      "AMBIGUOUS_ART",
      `Multiple curated artwork files match image number ${imageNumber}.`,
    );
  }
  if (curatedMatches.length === 1) return curatedMatches[0];

  const trailingNumber = new RegExp(`(?<!\\d)${imageNumber}$`, "u");
  const sourceMatches = (await imageFiles(sourceArtDir)).filter((path) =>
    trailingNumber.test(basename(path, extname(path))),
  );
  if (sourceMatches.length === 0) {
    throw artError(
      "ART_NOT_FOUND",
      `No artwork file matches image number ${imageNumber}.`,
    );
  }
  if (sourceMatches.length > 1) {
    throw artError(
      "AMBIGUOUS_ART",
      `Multiple Shutterstock artwork files match image number ${imageNumber}.`,
    );
  }
  return sourceMatches[0];
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) reject(new Error("Request body is too large."));
    });
    req.on("end", () => {
      try {
        resolveBody(JSON.parse(body));
      } catch {
        reject(new Error("Request body must contain valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function decodeSegment(segment) {
  try {
    const value = decodeURIComponent(segment);
    return encodeURIComponent(value) === segment ? value : null;
  } catch {
    return null;
  }
}

function routeFor(url) {
  const path = (url ?? "/").split("?", 1)[0];
  if (path === BASE_PATH) return { kind: "collection" };
  if (path === `${BASE_PATH}/template-health`) return { kind: "templateHealth" };
  if (!path.startsWith(`${BASE_PATH}/`)) return null;
  const parts = path.slice(BASE_PATH.length + 1).split("/");
  const decoded = parts.map(decodeSegment);
  if (decoded.some((part) => part === null)) return { kind: "invalid" };
  if (parts.length === 2 && decoded[0] === "art") {
    return { kind: "art", imageNumber: decoded[1] };
  }
  if (parts.length === 2 && decoded[0] === "templates") {
    return { kind: "template", templateId: decoded[1] };
  }
  if (parts.length === 2 && decoded[1] === "selection") {
    return { kind: "selection", cardId: decoded[0] };
  }
  if (parts.length === 3 && decoded[1] === "candidates") {
    return { kind: "candidate", cardId: decoded[0], templatePairId: decoded[2] };
  }
  return { kind: "missing" };
}

function statusFor(error) {
  if (["ENCOUNTER_NOT_FOUND", "CANDIDATE_NOT_FOUND", "ACTION_NOT_FOUND", "VARIABLE_NOT_FOUND", "TEMPLATE_NOT_FOUND", "ART_NOT_FOUND"].includes(error.code)) {
    return 404;
  }
  if (error.code === "AMBIGUOUS_ART") return 409;
  return 400;
}

export function createEncounterEditorApiMiddleware(options = {}) {
  const rootDir = options.rootDir ?? ROOT;
  const fileSystem = options.fileSystem;
  const artOptions = {
    curatedArtDir: options.curatedArtDir ?? DEFAULT_CURATED_ART_DIR,
    sourceArtDir: options.sourceArtDir ?? DEFAULT_SOURCE_ART_DIR,
  };
  const templateHealthReader = options.templateHealthReader ?? readEncounterTemplateHealth;
  const dataOptions = { rootDir, ...(fileSystem === undefined ? {} : { fileSystem }) };
  return async function encounterEditorApi(req, res, next) {
    const route = routeFor(req.url);
    if (route === null) {
      next();
      return;
    }
    if (route.kind === "invalid" || route.kind === "missing") {
      fail(res, route.kind === "invalid" ? 400 : 404, "INVALID_API_PATH", "Encounter editor endpoint was not found.");
      return;
    }
    try {
      if (route.kind === "collection") {
        if (req.method !== "GET") {
          fail(res, 405, "METHOD_NOT_ALLOWED", "This endpoint only supports GET.");
          return;
        }
        respond(res, 200, { groups: readEncounterEditorGroups(dataOptions) });
        return;
      }
      if (route.kind === "art") {
        if (req.method !== "GET") {
          fail(res, 405, "METHOD_NOT_ALLOWED", "This endpoint only supports GET.");
          return;
        }
        const artPath = await resolveEncounterEditorArt(route.imageNumber, artOptions);
        const contentType = IMAGE_CONTENT_TYPES.get(extname(artPath).toLowerCase());
        const body = await readFile(artPath);
        res.writeHead(200, {
          "Cache-Control": "no-cache",
          "Content-Length": String(body.byteLength),
          "Content-Type": contentType,
        });
        res.end(body);
        return;
      }
      if (route.kind === "templateHealth") {
        if (req.method !== "GET") {
          fail(res, 405, "METHOD_NOT_ALLOWED", "This endpoint only supports GET.");
          return;
        }
        respond(res, 200, { templateHealth: templateHealthReader({ rootDir }) });
        return;
      }
      if (route.kind === "template") {
        if (req.method !== "PATCH") {
          fail(res, 405, "METHOD_NOT_ALLOWED", "This endpoint only supports PATCH.");
          return;
        }
        if (!TEMPLATE_ID_PATTERN.test(route.templateId ?? "")) {
          fail(res, 400, "INVALID_TEMPLATE_ID", "Route template id must contain digits only.");
          return;
        }
        const body = await readBody(req);
        if (body === null || typeof body !== "object" || Array.isArray(body)) {
          throw new Error("Request body must be an object.");
        }
        const confirmation = updateEncounterTemplate(
          (templates, candidates) => editEncounterTemplate(templates, candidates, {
            templateId: Number(route.templateId),
            value: body.value,
          }),
          dataOptions,
        );
        respond(res, 200, {
          confirmation,
          groups: readEncounterEditorGroups(dataOptions),
          ...(body.clientRevision === undefined ? {} : { clientRevision: body.clientRevision }),
        });
        return;
      }
      if (req.method !== "PATCH") {
        fail(res, 405, "METHOD_NOT_ALLOWED", "This endpoint only supports PATCH.");
        return;
      }
      if (!UUID_PATTERN.test(route.cardId ?? "")) {
        fail(res, 400, "INVALID_CARD_ID", "Route card id must be a canonical UUID.");
        return;
      }
      const body = await readBody(req);
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("Request body must be an object.");
      }
      let confirmation;
      if (route.kind === "selection") {
        if (typeof body.templatePairId !== "string" || !PAIR_PATTERN.test(body.templatePairId)) {
          throw new Error("templatePairId must be a canonical slug.");
        }
        if (body.selectionKind !== "prose" && body.selectionKind !== "actions") {
          throw new Error("selectionKind must be prose or actions.");
        }
        confirmation = updateEncounterCandidates(
          (document) => selectEncounterCandidate(document, {
            cardId: route.cardId,
            templatePairId: body.templatePairId,
            selectionKind: body.selectionKind,
          }),
          dataOptions,
        );
      } else {
        if (!PAIR_PATTERN.test(route.templatePairId ?? "")) {
          throw new Error("Route template pair id must be a canonical slug.");
        }
        confirmation = updateEncounterCandidates(
          (document) => body.field === "variable"
            ? editEncounterCandidateVariable(document, {
                cardId: route.cardId,
                templatePairId: route.templatePairId,
                actionTemplateId: body.actionTemplateId,
                variableName: body.variableName,
                value: body.value,
              })
            : editEncounterCandidateText(document, {
                cardId: route.cardId,
                templatePairId: route.templatePairId,
                field: body.field,
                actionTemplateId: body.actionTemplateId,
                value: body.value,
              }),
          dataOptions,
        );
      }
      respond(res, 200, {
        confirmation,
        ...(body.clientRevision === undefined ? {} : { clientRevision: body.clientRevision }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Encounter editor request failed.";
      fail(res, statusFor(error), error.code ?? "INVALID_REQUEST", message);
    }
  };
}
