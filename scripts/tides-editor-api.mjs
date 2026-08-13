// Dev-server middleware backing the source-preserving canonical RON tides editor.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readTidesArtifact,
  resolveTidesFile,
  validateTideEdit,
} from "./tides-editor-data.mjs";
import {
  sourceRevision,
  stageAndPublishGameDataEdit,
} from "./game-data-pipeline.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/tide-decks";
export const TIDES_EDITOR_SOURCE_PATHS = [
  join("data", "tides.ron"),
  join("data", "dream_avatars.ron"),
];

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function errorResponse(res, statusCode, code, message, details) {
  jsonResponse(res, statusCode, {
    error: { code, message, ...(details === undefined ? {} : { details }) },
  });
}

function rawPathFromUrl(url) {
  return (url ?? "/").split("?", 1)[0];
}

function fileParamFromUrl(url) {
  const queryIndex = (url ?? "").indexOf("?");
  if (queryIndex === -1) return null;
  return new URLSearchParams((url ?? "").slice(queryIndex + 1)).get("file");
}

function isTidesApiPath(pathname) {
  return pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`);
}

function readRequestBody(req) {
  return new Promise((resolvePromise, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolvePromise(body));
    req.on("error", reject);
  });
}

async function readJsonRequest(req) {
  const rawBody = await readRequestBody(req);
  try {
    return JSON.parse(rawBody);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.code = "INVALID_JSON";
    throw error;
  }
}

function tideIdFromRawPath(rawPath) {
  if (rawPath === BASE_PATH) return null;
  const segment = rawPath.slice(BASE_PATH.length + 1);
  if (segment.length === 0 || segment.includes("/")) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function statusFor(error) {
  if (error.code === "STALE_SOURCE") return 409;
  if (error.code === "RECORD_NOT_FOUND") return 404;
  if (["INVALID_EDIT", "FIELD_NOT_APPLICABLE"].includes(error.code)) return 400;
  if (["MALFORMED_SOURCE", "COMPATIBILITY_VALIDATION_FAILED"].includes(error.code)) {
    return 422;
  }
  return error.statusCode ?? 500;
}

function collectionResponse(rootDir, resolved, revision, loadArtifact) {
  return {
    file: resolved.file,
    ...loadArtifact({ rootDir, tomlPath: resolved.tomlPath }),
    sourceRevision: revision(rootDir, TIDES_EDITOR_SOURCE_PATHS),
  };
}

async function handlePatch({
  req,
  res,
  rootDir,
  tideId,
  resolved,
  publishEdit,
  revision,
  loadArtifact,
}) {
  let body;
  try {
    body = await readJsonRequest(req);
  } catch (error) {
    if (error.code === "INVALID_JSON") {
      errorResponse(res, 400, "INVALID_JSON", error.message);
      return;
    }
    throw error;
  }
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.field !== "string" ||
    typeof body.expectedSourceRevision !== "string"
  ) {
    errorResponse(
      res,
      400,
      "INVALID_REQUEST",
      "PATCH body requires field and expectedSourceRevision strings.",
    );
    return;
  }
  if (typeof body.id === "string" && body.id !== tideId) {
    errorResponse(
      res,
      400,
      "TIDE_ID_MISMATCH",
      "Route tide id must match request body id.",
    );
    return;
  }
  const validation = validateTideEdit(body.field, body.value);
  if (!validation.ok) {
    errorResponse(res, 400, "INVALID_EDIT", validation.message, {
      field: body.field,
    });
    return;
  }

  const result = await publishEdit({
    rootDir,
    dataset: "tides",
    operations: [
      {
        operation: "set_tide_field",
        tide_id: tideId,
        field: validation.field,
        value: validation.value,
      },
    ],
    sourcePaths: TIDES_EDITOR_SOURCE_PATHS,
    expectedSourceRevision: body.expectedSourceRevision,
  });
  const artifact = loadArtifact({ rootDir, tomlPath: resolved.tomlPath });
  const tide = artifact.tides.find((entry) => entry.id === tideId);
  if (tide === undefined) {
    const error = new Error("Published tide could not be reloaded.");
    error.code = "PUBLICATION_FAILED";
    throw error;
  }
  jsonResponse(res, 200, {
    file: resolved.file,
    tide,
    sourceRevision:
      result.sourceRevision ?? revision(rootDir, TIDES_EDITOR_SOURCE_PATHS),
  });
}

export function createTidesEditorApiMiddleware({
  rootDir = ROOT,
  publishEdit = stageAndPublishGameDataEdit,
  revision = sourceRevision,
  loadArtifact = readTidesArtifact,
} = {}) {
  return async function tidesEditorApiMiddleware(req, res, next) {
    const rawPath = rawPathFromUrl(req.url);
    if (!isTidesApiPath(rawPath)) {
      next();
      return;
    }
    let resolved;
    try {
      resolved = resolveTidesFile(rootDir, fileParamFromUrl(req.url));
      if (!resolved.ok) {
        errorResponse(res, 400, "INVALID_FILE", resolved.message);
        return;
      }
      if (!existsSync(join(rootDir, resolved.ronPath))) {
        errorResponse(res, 404, "FILE_NOT_FOUND", "The requested tides file was not found.");
        return;
      }
      const tideId = tideIdFromRawPath(rawPath);
      if (req.method === "GET" && tideId === null) {
        jsonResponse(
          res,
          200,
          collectionResponse(rootDir, resolved, revision, loadArtifact),
        );
        return;
      }
      if (req.method === "PATCH" && tideId !== null) {
        await handlePatch({
          req,
          res,
          rootDir,
          tideId,
          resolved,
          publishEdit,
          revision,
          loadArtifact,
        });
        return;
      }
      jsonResponse(res, 405, {
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "Method is not allowed for this endpoint.",
        },
      });
    } catch (error) {
      let confirmed;
      if (error.code === "STALE_SOURCE" && resolved?.ok === true) {
        confirmed = collectionResponse(rootDir, resolved, revision, loadArtifact);
      }
      errorResponse(
        res,
        statusFor(error),
        error.code ?? "PUBLICATION_FAILED",
        error instanceof Error ? error.message : "Tide editor transaction failed.",
        {
          datasetId: "tides",
          source: TIDES_EDITOR_SOURCE_PATHS[0],
          ...(error.currentSourceRevision === undefined
            ? {}
            : { currentSourceRevision: error.currentSourceRevision }),
          ...(confirmed === undefined ? {} : { confirmed }),
        },
      );
    }
  };
}
