import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  editEncounterCandidateText,
  readEncounterEditorGroups,
  selectEncounterCandidate,
  updateEncounterCandidates,
} from "./encounter-editor-data.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/encounters";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const PAIR_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function respond(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function fail(res, status, code, message) {
  respond(res, status, { error: { code, message } });
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
  if (!path.startsWith(`${BASE_PATH}/`)) return null;
  const parts = path.slice(BASE_PATH.length + 1).split("/");
  const decoded = parts.map(decodeSegment);
  if (decoded.some((part) => part === null)) return { kind: "invalid" };
  if (parts.length === 2 && decoded[1] === "selection") {
    return { kind: "selection", cardId: decoded[0] };
  }
  if (parts.length === 3 && decoded[1] === "candidates") {
    return { kind: "candidate", cardId: decoded[0], templatePairId: decoded[2] };
  }
  return { kind: "missing" };
}

function statusFor(error) {
  if (["ENCOUNTER_NOT_FOUND", "CANDIDATE_NOT_FOUND", "ACTION_NOT_FOUND"].includes(error.code)) {
    return 404;
  }
  return 400;
}

export function createEncounterEditorApiMiddleware(options = {}) {
  const rootDir = options.rootDir ?? ROOT;
  const fileSystem = options.fileSystem;
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
        confirmation = updateEncounterCandidates(
          (document) => selectEncounterCandidate(document, {
            cardId: route.cardId,
            templatePairId: body.templatePairId,
          }),
          dataOptions,
        );
      } else {
        if (!PAIR_PATTERN.test(route.templatePairId ?? "")) {
          throw new Error("Route template pair id must be a canonical slug.");
        }
        confirmation = updateEncounterCandidates(
          (document) => editEncounterCandidateText(document, {
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
