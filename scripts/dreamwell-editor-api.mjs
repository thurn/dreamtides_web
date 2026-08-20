import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DREAMWELL_TOML_PATH,
  readEditorDreamwell,
  readDreamwellTagRegistry,
  validateDreamwellEdit,
  validateTagRegistry,
} from "./dreamwell-editor-data.mjs";
import {
  sourceRevision,
  stageAndPublishGameDataEdit,
} from "./game-data-pipeline.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/dreamwell";
const TAGS_PATH = `${BASE_PATH}/tags`;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export const DREAMWELL_EDITOR_SOURCE_PATHS = [
  "data/dreamwell.ron",
  "data/dreamwell.tags.ron",
];

function elapsedMs(start) {
  return Number((performance.now() - start).toFixed(3));
}

function jsonResponse(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function errorResponse(res, statusCode, code, message, details) {
  jsonResponse(res, statusCode, {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  });
}

function rawPathFromUrl(url) {
  return (url ?? "/").split("?", 1)[0];
}

function sourceParamFromUrl(url) {
  const queryIndex = (url ?? "").indexOf("?");
  if (queryIndex === -1) {
    return null;
  }
  const params = new URLSearchParams((url ?? "").slice(queryIndex + 1));
  return params.get("source") ?? params.get("toml");
}

function resolveRequestedSource(requested) {
  if (
    requested === null ||
    requested === undefined ||
    requested.trim() === ""
  ) {
    return { ok: true, relativePath: DEFAULT_DREAMWELL_TOML_PATH };
  }

  const trimmed = requested.trim();
  if (trimmed.includes("\0")) {
    return { ok: false, message: "The source parameter is invalid." };
  }

  const normalized = trimmed
    .replaceAll("\\", "/")
    .replace(/^data\//u, "")
    .replace(/\.toml$/iu, ".ron");
  if (normalized !== "dreamwell.ron") {
    return {
      ok: false,
      message: "The Dreamwell editor source must be data/dreamwell.ron.",
    };
  }
  return { ok: true, relativePath: DEFAULT_DREAMWELL_TOML_PATH };
}

function decodePathSegment(segment) {
  try {
    return { ok: true, value: decodeURIComponent(segment) };
  } catch {
    return { ok: false };
  }
}

function isDreamwellApiPath(pathname) {
  if (
    pathname === BASE_PATH ||
    pathname.startsWith(`${BASE_PATH}/`) ||
    pathname.startsWith(`${BASE_PATH}%`)
  ) {
    return true;
  }

  const rawSegments = pathname.split("/");
  if (
    rawSegments[1] !== "api" ||
    rawSegments[2] !== "editor" ||
    rawSegments.length < 4
  ) {
    return false;
  }

  const resourceSegment = decodePathSegment(rawSegments[3]);
  return resourceSegment.ok && resourceSegment.value === "dreamwell";
}

function routeForRawPath(rawPath) {
  const rawSegments = rawPath.split("/");
  if (
    rawSegments[1] === "api" &&
    rawSegments[2] === "editor" &&
    rawSegments.length >= 4
  ) {
    const resourceSegment = decodePathSegment(rawSegments[3]);
    if (!resourceSegment.ok) {
      return {
        ok: false,
        statusCode: 400,
        code: "INVALID_API_PATH",
        message: "API path must use canonical static segments.",
      };
    }

    if (
      resourceSegment.value === "dreamwell" &&
      rawSegments[3] !== "dreamwell"
    ) {
      return {
        ok: false,
        statusCode: 400,
        code: "INVALID_API_PATH",
        message: "API path must use canonical static segments.",
      };
    }
  }

  if (rawPath === BASE_PATH) {
    return { ok: true, resource: "collection" };
  }

  if (!rawPath.startsWith(`${BASE_PATH}/`)) {
    if (rawPath.slice(BASE_PATH.length).startsWith("%")) {
      return {
        ok: false,
        statusCode: 400,
        code: "INVALID_DREAMWELL_ID",
        message: "Route dreamwell id must be a canonical UUID.",
      };
    }

    return {
      ok: false,
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Endpoint was not found.",
    };
  }

  const encodedSegment = rawPath.slice(BASE_PATH.length + 1);
  if (encodedSegment.length === 0 || encodedSegment.includes("/")) {
    return {
      ok: false,
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Endpoint was not found.",
    };
  }

  let dreamwellId;
  try {
    dreamwellId = decodeURIComponent(encodedSegment);
  } catch {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_DREAMWELL_ID",
      message: "Route dreamwell id must be a canonical UUID.",
    };
  }

  if (
    encodedSegment !== dreamwellId ||
    dreamwellId.includes("/") ||
    !UUID_PATTERN.test(dreamwellId)
  ) {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_DREAMWELL_ID",
      message: "Route dreamwell id must be a canonical UUID.",
      details: { id: dreamwellId },
    };
  }

  return { ok: true, resource: "dreamwell", dreamwellId };
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

function dreamwellNotFound(res, dreamwellId) {
  errorResponse(
    res,
    404,
    "DREAMWELL_NOT_FOUND",
    "Dreamwell card was not found.",
    {
      id: dreamwellId,
    },
  );
}

function methodNotAllowed(res, allowedMethods) {
  jsonResponse(
    res,
    405,
    {
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Method is not allowed for this endpoint.",
      },
    },
    { Allow: allowedMethods.join(", ") },
  );
}

function assertPatchBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "PATCH body must be a JSON object.",
    };
  }
  if (typeof body.id !== "string") {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "PATCH body id must be a string.",
    };
  }
  if (typeof body.field !== "string") {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "PATCH body field must be a string.",
    };
  }
  if (!Object.hasOwn(body, "value")) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "PATCH body value is required.",
    };
  }
  return { ok: true };
}

async function handlePatch(req, res, options, dreamwellId) {
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

  const bodyResult = assertPatchBody(body);
  if (!bodyResult.ok) {
    errorResponse(res, 400, bodyResult.code, bodyResult.message);
    return;
  }

  if (!UUID_PATTERN.test(body.id)) {
    errorResponse(
      res,
      400,
      "INVALID_DREAMWELL_ID",
      "Request body id must be a canonical UUID.",
      {
        id: body.id,
      },
    );
    return;
  }

  if (body.id !== dreamwellId) {
    errorResponse(
      res,
      400,
      "DREAMWELL_ID_MISMATCH",
      "Route dreamwell id must match request body id.",
      {
        routeId: dreamwellId,
        bodyId: body.id,
      },
    );
    return;
  }

  if (typeof body.expectedSourceRevision !== "string") {
    errorResponse(
      res,
      400,
      "INVALID_REQUEST",
      "Every save requires expectedSourceRevision.",
    );
    return;
  }

  const validation = validateDreamwellEdit(body.field, body.value);
  if (!validation.ok) {
    errorResponse(res, 400, "INVALID_EDIT", validation.message, {
      field: validation.field,
      value: validation.value,
    });
    return;
  }
  if (body.field === "tags") {
    const known = new Set(
      options.loadTags(options.rootDir).map((tag) => tag.name),
    );
    if (validation.value.some((tag) => !known.has(tag))) {
      errorResponse(
        res,
        400,
        "INVALID_EDIT",
        "Unknown tag. Create it in Manage tags first.",
      );
      return;
    }
  }

  const totalStart = performance.now();
  const readStart = performance.now();
  const beforeDreamwell = readEditorDreamwell({ rootDir: options.rootDir });
  const readMs = elapsedMs(readStart);

  if (!beforeDreamwell.some((card) => card.id === dreamwellId)) {
    dreamwellNotFound(res, dreamwellId);
    return;
  }

  const patchStart = performance.now();
  const result = await options.publishEdit({
    rootDir: options.rootDir,
    dataset: "dreamwell",
    operations: [
      {
        operation: "set_dreamwell_field",
        dreamwell_id: dreamwellId,
        field: validation.field,
        value: validation.value,
      },
    ],
    sourcePaths: DREAMWELL_EDITOR_SOURCE_PATHS,
    expectedSourceRevision: body.expectedSourceRevision,
  });
  const patchMs = elapsedMs(patchStart);
  const refreshMs = 0;

  const confirmStart = performance.now();
  const confirmedDreamwell = readEditorDreamwell({
    rootDir: options.rootDir,
  }).find((card) => card.id === dreamwellId);
  const confirmMs = elapsedMs(confirmStart);

  if (confirmedDreamwell === undefined) {
    dreamwellNotFound(res, dreamwellId);
    return;
  }

  console.log(
    `[dreamwell-editor] saved ${dreamwellId}.${validation.field} = ${JSON.stringify(validation.value)}`,
  );

  jsonResponse(res, 200, {
    dreamwell: confirmedDreamwell,
    sourceRevision:
      result.sourceRevision ??
      options.revision(options.rootDir, DREAMWELL_EDITOR_SOURCE_PATHS),
    ...(Object.hasOwn(body, "clientRevision")
      ? { clientRevision: body.clientRevision }
      : {}),
    timing: {
      readMs,
      patchMs,
      refreshMs,
      confirmMs,
      totalMs: elapsedMs(totalStart),
    },
  });
}

export function createDreamwellEditorApiMiddleware({
  rootDir = ROOT,
  publishEdit = stageAndPublishGameDataEdit,
  revision = sourceRevision,
  loadTags = (dir) => readDreamwellTagRegistry({ rootDir: dir }),
} = {}) {
  const options = { rootDir, publishEdit, revision, loadTags };
  return async function dreamwellEditorApiMiddleware(req, res, next) {
    const rawPath = rawPathFromUrl(req.url);

    if (!isDreamwellApiPath(rawPath)) {
      next();
      return;
    }

    try {
      if (rawPath === TAGS_PATH) {
        if (req.method !== "PUT") {
          methodNotAllowed(res, ["PUT"]);
          return;
        }
        const body = await readJsonRequest(req);
        if (
          typeof body?.expectedSourceRevision !== "string" ||
          !Array.isArray(body?.tags)
        ) {
          errorResponse(
            res,
            400,
            "INVALID_REQUEST",
            "PUT body requires tags and expectedSourceRevision.",
          );
          return;
        }
        const validation = validateTagRegistry(body.tags);
        if (!validation.ok) {
          errorResponse(res, 400, "INVALID_TAG_REGISTRY", validation.message);
          return;
        }
        const result = await publishEdit({
          rootDir,
          dataset: "dreamwell",
          operations: [
            { operation: "replace_dreamwell_tags", tags: validation.tags },
          ],
          sourcePaths: DREAMWELL_EDITOR_SOURCE_PATHS,
          expectedSourceRevision: body.expectedSourceRevision,
        });
        jsonResponse(res, 200, {
          dreamwell: readEditorDreamwell({ rootDir }),
          tags: loadTags(rootDir),
          sourceRevision:
            result.sourceRevision ??
            revision(rootDir, DREAMWELL_EDITOR_SOURCE_PATHS),
        });
        return;
      }
      const route = routeForRawPath(rawPath);
      if (!route.ok) {
        errorResponse(
          res,
          route.statusCode,
          route.code,
          route.message,
          route.details,
        );
        return;
      }

      const sourceResolution = resolveRequestedSource(
        sourceParamFromUrl(req.url),
      );
      if (!sourceResolution.ok) {
        errorResponse(res, 400, "INVALID_SOURCE", sourceResolution.message);
        return;
      }

      const dreamwellTomlPath = sourceResolution.relativePath;
      if (!existsSync(join(rootDir, dreamwellTomlPath))) {
        errorResponse(
          res,
          404,
          "TOML_NOT_FOUND",
          "The requested toml file was not found.",
          {
            toml: dreamwellTomlPath,
          },
        );
        return;
      }

      if (req.method === "GET" && route.resource === "collection") {
        jsonResponse(res, 200, {
          dreamwell: readEditorDreamwell({ rootDir, dreamwellTomlPath }),
          tags: loadTags(rootDir),
          sourceRevision: revision(rootDir, DREAMWELL_EDITOR_SOURCE_PATHS),
        });
        return;
      }

      if (req.method === "PATCH" && route.resource === "dreamwell") {
        await handlePatch(req, res, options, route.dreamwellId);
        return;
      }

      methodNotAllowed(
        res,
        route.resource === "collection" ? ["GET"] : ["PATCH"],
      );
    } catch (error) {
      const statusCode =
        error.code === "STALE_SOURCE"
          ? 409
          : error.code === "RECORD_NOT_FOUND"
            ? 404
            : ["INVALID_EDIT", "FIELD_NOT_APPLICABLE"].includes(error.code)
              ? 400
              : [
                    "MALFORMED_SOURCE",
                    "COMPATIBILITY_VALIDATION_FAILED",
                  ].includes(error.code)
                ? 422
                : 500;
      errorResponse(
        res,
        statusCode,
        error.code ?? "PUBLICATION_FAILED",
        error instanceof Error ? error.message : "Save failed.",
        {
          datasetId: "dreamwell",
          source: DREAMWELL_EDITOR_SOURCE_PATHS[0],
          ...(error.currentSourceRevision === undefined
            ? {}
            : {
                currentSourceRevision: error.currentSourceRevision,
              }),
          ...(error.code === "STALE_SOURCE"
            ? {
                confirmed: {
                  dreamwell: readEditorDreamwell({ rootDir }),
                  tags: loadTags(rootDir),
                  sourceRevision: revision(
                    rootDir,
                    DREAMWELL_EDITOR_SOURCE_PATHS,
                  ),
                },
              }
            : {}),
        },
      );
    }
  };
}
