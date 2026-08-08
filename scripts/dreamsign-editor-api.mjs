import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DREAMSIGN_TOML_PATH,
  readDreamsignTagRegistry,
  readEditorDreamsigns,
  validateDreamsignEdit,
  validateTagRegistry,
} from "./dreamsign-editor-data.mjs";
import {
  sourceRevision,
  stageAndPublishGameDataEdit,
} from "./game-data-pipeline.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/dreamsigns";
const TAGS_PATH = "/api/editor/dreamsign-tags";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export const DREAMSIGN_EDITOR_SOURCE_PATHS = [
  "data/dreamsigns.ron",
  "data/internal/internal_dreamsign_metadata.ron",
  "data/dreamsigns.tags.ron",
];

function jsonResponse(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
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

function sourceParamFromUrl(url) {
  const queryIndex = (url ?? "").indexOf("?");
  if (queryIndex === -1) return null;
  const params = new URLSearchParams((url ?? "").slice(queryIndex + 1));
  return params.get("source") ?? params.get("toml");
}

function resolveRequestedSource(requested) {
  if (requested === null || requested === undefined || requested.trim() === "") {
    return { ok: true };
  }
  const normalized = requested
    .trim()
    .replaceAll("\\", "/")
    .replace(/^data\//u, "")
    .replace(/\.toml$/iu, ".ron");
  return normalized === "dreamsigns.ron"
    ? { ok: true }
    : {
        ok: false,
        message: "The Dreamsign editor source must be data/dreamsigns.ron.",
      };
}

function routeForRawPath(pathname) {
  if (pathname === BASE_PATH) return { ok: true, resource: "collection" };
  if (!pathname.startsWith(`${BASE_PATH}/`)) return { ok: false, statusCode: 404 };
  const encoded = pathname.slice(BASE_PATH.length + 1);
  if (encoded === "" || encoded.includes("/")) return { ok: false, statusCode: 404 };
  let dreamsignId;
  try {
    dreamsignId = decodeURIComponent(encoded);
  } catch {
    return { ok: false, statusCode: 400 };
  }
  if (encoded !== dreamsignId || !UUID_V4_PATTERN.test(dreamsignId)) {
    return { ok: false, statusCode: 400 };
  }
  return { ok: true, resource: "dreamsign", dreamsignId };
}

function readRequestBody(req) {
  return new Promise((resolvePromise, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolvePromise(body));
    req.on("error", reject);
  });
}

async function readJsonRequest(req) {
  try {
    return JSON.parse(await readRequestBody(req));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.code = "INVALID_JSON";
    throw error;
  }
}

function assertExpectedRevision(body) {
  return typeof body?.expectedSourceRevision === "string"
    ? null
    : "Every save requires expectedSourceRevision.";
}

function loadData(rootDir) {
  return {
    dreamsigns: readEditorDreamsigns({ rootDir }),
    tags: readDreamsignTagRegistry({
      rootDir,
      dreamsignTomlPath: DEFAULT_DREAMSIGN_TOML_PATH,
    }),
  };
}

function collectionPayload(rootDir, revision, load) {
  return {
    ...load(rootDir),
    sourceRevision: revision(rootDir, DREAMSIGN_EDITOR_SOURCE_PATHS),
  };
}

function statusFor(error) {
  if (error.code === "STALE_SOURCE") return 409;
  if (error.code === "RECORD_NOT_FOUND") return 404;
  if (["INVALID_EDIT", "FIELD_NOT_APPLICABLE"].includes(error.code)) return 400;
  if (["MALFORMED_SOURCE", "COMPATIBILITY_VALIDATION_FAILED"].includes(error.code)) return 422;
  return error.statusCode ?? 500;
}

export function createDreamsignEditorApiMiddleware({
  rootDir = ROOT,
  publishEdit = stageAndPublishGameDataEdit,
  revision = sourceRevision,
  load = loadData,
} = {}) {
  return async function dreamsignEditorApiMiddleware(req, res, next) {
    const pathname = rawPathFromUrl(req.url);
    if (pathname !== TAGS_PATH && pathname !== BASE_PATH && !pathname.startsWith(`${BASE_PATH}/`)) {
      next();
      return;
    }
    const source = resolveRequestedSource(sourceParamFromUrl(req.url));
    if (!source.ok) {
      errorResponse(res, 400, "INVALID_SOURCE", source.message);
      return;
    }
    try {
      if (pathname === TAGS_PATH) {
        if (req.method === "GET") {
          const payload = collectionPayload(rootDir, revision, load);
          jsonResponse(res, 200, { tags: payload.tags, sourceRevision: payload.sourceRevision });
          return;
        }
        if (req.method !== "PUT") {
          errorResponse(res, 405, "METHOD_NOT_ALLOWED", "Method is not allowed for this endpoint.");
          return;
        }
        const body = await readJsonRequest(req);
        const revisionError = assertExpectedRevision(body);
        if (revisionError !== null || !Array.isArray(body?.tags)) {
          errorResponse(res, 400, "INVALID_REQUEST", revisionError ?? "PUT body must include a tags array.");
          return;
        }
        const validation = validateTagRegistry(body.tags);
        if (!validation.ok) {
          errorResponse(res, 400, "INVALID_TAG_REGISTRY", validation.message);
          return;
        }
        const result = await publishEdit({
          rootDir,
          dataset: "dreamsigns",
          operations: [{ operation: "replace_dreamsign_tags", tags: validation.tags }],
          sourcePaths: DREAMSIGN_EDITOR_SOURCE_PATHS,
          expectedSourceRevision: body.expectedSourceRevision,
        });
        const confirmed = load(rootDir);
        jsonResponse(res, 200, {
          ...confirmed,
          sourceRevision: result.sourceRevision ?? revision(rootDir, DREAMSIGN_EDITOR_SOURCE_PATHS),
        });
        return;
      }

      const route = routeForRawPath(pathname);
      if (!route.ok) {
        errorResponse(res, route.statusCode, route.statusCode === 400 ? "INVALID_DREAMSIGN_ID" : "NOT_FOUND", "Endpoint was not found.");
        return;
      }
      if (req.method === "GET" && route.resource === "collection") {
        const payload = collectionPayload(rootDir, revision, load);
        jsonResponse(res, 200, { dreamsigns: payload.dreamsigns, sourceRevision: payload.sourceRevision });
        return;
      }
      if (req.method !== "PATCH" || route.resource !== "dreamsign") {
        errorResponse(res, 405, "METHOD_NOT_ALLOWED", "Method is not allowed for this endpoint.");
        return;
      }
      const body = await readJsonRequest(req);
      const revisionError = assertExpectedRevision(body);
      if (revisionError !== null || typeof body?.id !== "string" || typeof body?.field !== "string" || !Object.hasOwn(body, "value")) {
        errorResponse(res, 400, "INVALID_REQUEST", revisionError ?? "PATCH body requires id, field, and value.");
        return;
      }
      if (body.id !== route.dreamsignId) {
        errorResponse(res, 400, "DREAMSIGN_ID_MISMATCH", "Route dreamsign id must match request body id.");
        return;
      }
      const validation = validateDreamsignEdit(body.field, body.value);
      if (!validation.ok) {
        errorResponse(res, 400, "INVALID_EDIT", validation.message, { field: validation.field, value: validation.value });
        return;
      }
      if (body.field === "tags") {
        const known = new Set(load(rootDir).tags.map((tag) => tag.name));
        const unknown = validation.value.filter((value) => !known.has(value));
        if (unknown.length > 0) {
          errorResponse(res, 400, "INVALID_EDIT", "Unknown tag. Create it in Manage tags first.", { field: body.field, value: unknown });
          return;
        }
      }
      const result = await publishEdit({
        rootDir,
        dataset: "dreamsigns",
        operations: [{
          operation: "set_dreamsign_field",
          dreamsign_id: route.dreamsignId,
          field: validation.field,
          value: validation.value,
        }],
        sourcePaths: DREAMSIGN_EDITOR_SOURCE_PATHS,
        expectedSourceRevision: body.expectedSourceRevision,
      });
      const confirmed = load(rootDir).dreamsigns.find((entry) => entry.id === route.dreamsignId);
      jsonResponse(res, 200, {
        dreamsign: confirmed,
        sourceRevision: result.sourceRevision ?? revision(rootDir, DREAMSIGN_EDITOR_SOURCE_PATHS),
        ...(Object.hasOwn(body, "clientRevision") ? { clientRevision: body.clientRevision } : {}),
        timing: { readMs: 0, patchMs: 0, refreshMs: 0, confirmMs: 0, totalMs: 0 },
      });
    } catch (error) {
      const confirmed = error.code === "STALE_SOURCE"
        ? collectionPayload(rootDir, revision, load)
        : undefined;
      errorResponse(
        res,
        statusFor(error),
        error.code ?? "PUBLICATION_FAILED",
        error instanceof Error ? error.message : "Dreamsign editor transaction failed.",
        {
          datasetId: "dreamsigns",
          source: "data/dreamsigns.ron",
          ...(error.currentSourceRevision === undefined ? {} : { currentSourceRevision: error.currentSourceRevision }),
          ...(confirmed === undefined ? {} : { confirmed }),
        },
      );
    }
  };
}
