// Dev-server middleware backing the tides editor (`/tides`). It loads a committed
// tides artifact and writes player-facing annotation edits (displayName,
// displayDescription, color) back to it.
//
//   GET   /api/editor/tide-decks[?file=tides4]            -> the full artifact
//   PATCH /api/editor/tide-decks/<tideId>[?file=tides4]   -> edit one tide annotation
//
// `apply: "serve"` (in vite.config.ts) keeps it out of production builds. Writes
// go through an atomic temp-file swap with rollback so a crash mid-save never
// leaves the JSONC source or its regenerated JSON partially written. The bake's
// freshness gate stays green because the rewrite reuses the bake serializer and
// touches only the freshness-ignored annotation fields.

import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  patchTideAnnotation,
  readTidesArtifact,
  refreshTidesDataJson,
  resolveTidesFile,
  validateTideEdit,
} from "./tides-editor-data.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
// A dedicated base path distinct from the card editor's legacy `/api/editor/tides`
// tag-registry endpoint, which the tide-deck editor must not shadow.
const BASE_PATH = "/api/editor/tide-decks";

const defaultFileSystem = { existsSync, readFileSync, renameSync, rmSync, writeFileSync };

let saveCounter = 0;

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
    req.on("end", () => {
      resolvePromise(body);
    });
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

function tempPathFor(destination, extension) {
  saveCounter += 1;
  return `${destination}.${process.pid}.${Date.now()}.${saveCounter}.${extension}`;
}

function preparedWrite(destination, content) {
  return {
    destination,
    temp: tempPathFor(destination, "tmp"),
    backup: tempPathFor(destination, "bak"),
    content,
  };
}

/** Atomic multi-file commit via temp swap with rollback. */
function commitFiles(writes, fileSystem) {
  const preexisting = new Set(writes.filter((write) => fileSystem.existsSync(write.destination)));
  try {
    for (const write of writes) fileSystem.writeFileSync(write.temp, write.content);
    for (const write of writes) {
      if (preexisting.has(write)) fileSystem.renameSync(write.destination, write.backup);
    }
    for (const write of writes) fileSystem.renameSync(write.temp, write.destination);
  } catch (error) {
    for (const write of writes) fileSystem.rmSync(write.temp, { force: true, recursive: true });
    for (const write of writes) {
      if (preexisting.has(write)) {
        if (fileSystem.existsSync(write.backup)) {
          fileSystem.rmSync(write.destination, { force: true, recursive: true });
          fileSystem.renameSync(write.backup, write.destination);
        }
      } else {
        fileSystem.rmSync(write.destination, { force: true, recursive: true });
      }
    }
    throw error;
  }
  for (const write of writes) {
    if (!preexisting.has(write)) continue;
    try {
      fileSystem.rmSync(write.backup, { force: true, recursive: true });
    } catch {
      // Backups are removed after every destination file is committed.
    }
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

async function handlePatch(req, res, rootDir, tideId, resolved, fileSystem) {
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

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    errorResponse(res, 400, "INVALID_REQUEST", "PATCH body must be a JSON object.");
    return;
  }
  if (typeof body.field !== "string") {
    errorResponse(res, 400, "INVALID_REQUEST", "PATCH body field must be a string.");
    return;
  }
  if (typeof body.id === "string" && body.id !== tideId) {
    errorResponse(res, 400, "TIDE_ID_MISMATCH", "Route tide id must match request body id.", {
      routeId: tideId,
      bodyId: body.id,
    });
    return;
  }

  const validation = validateTideEdit(body.field, body.value);
  if (!validation.ok) {
    errorResponse(res, 400, "INVALID_EDIT", validation.message, { field: body.field });
    return;
  }

  const jsoncAbs = join(rootDir, resolved.jsoncPath);
  const source = fileSystem.readFileSync(jsoncAbs, "utf8");

  let patched;
  try {
    patched = patchTideAnnotation(source, {
      tideId,
      field: validation.field,
      value: validation.value,
    });
  } catch (error) {
    errorResponse(res, 404, "TIDE_NOT_FOUND", error instanceof Error ? error.message : "Tide not found.");
    return;
  }

  commitFiles([preparedWrite(jsoncAbs, patched.source)], fileSystem);
  refreshTidesDataJson({ rootDir, jsoncPath: resolved.jsoncPath, jsonPath: resolved.jsonPath });

  jsonResponse(res, 200, { file: resolved.file, tide: patched.tide });
}

export function createTidesEditorApiMiddleware({
  rootDir = ROOT,
  fileSystem = defaultFileSystem,
} = {}) {
  return async function tidesEditorApiMiddleware(req, res, next) {
    const rawPath = rawPathFromUrl(req.url);
    if (!isTidesApiPath(rawPath)) {
      next();
      return;
    }

    try {
      const resolved = resolveTidesFile(rootDir, fileParamFromUrl(req.url));
      if (!resolved.ok) {
        errorResponse(res, 400, "INVALID_FILE", resolved.message);
        return;
      }
      if (!fileSystem.existsSync(join(rootDir, resolved.jsoncPath))) {
        errorResponse(res, 404, "FILE_NOT_FOUND", "The requested tides file was not found.", {
          file: resolved.file,
        });
        return;
      }

      const tideId = tideIdFromRawPath(rawPath);

      if (req.method === "GET" && tideId === null) {
        const artifact = readTidesArtifact({ rootDir, jsoncPath: resolved.jsoncPath });
        jsonResponse(res, 200, { file: resolved.file, ...artifact });
        return;
      }

      if (req.method === "PATCH" && tideId !== null) {
        await handlePatch(req, res, rootDir, tideId, resolved, fileSystem);
        return;
      }

      jsonResponse(
        res,
        405,
        { error: { code: "METHOD_NOT_ALLOWED", message: "Method is not allowed for this endpoint." } },
      );
    } catch (error) {
      errorResponse(res, 500, "SAVE_FAILED", error instanceof Error ? error.message : "Save failed.");
    }
  };
}
