import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readEditorFigments,
  refreshFigmentDataJson,
  validateFigmentEdit,
} from "./figment-editor-data.mjs";
import {
  sourceRevision,
  stageAndPublishGameDataEdit,
} from "./game-data-pipeline.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/figments";
const FIGMENT_JSON_PATH = join("public", "figments-data.json");
export const FIGMENT_SOURCE_PATH = join("data", "figments.ron");
export const FIGMENT_EDITOR_SOURCE_PATHS = [FIGMENT_SOURCE_PATH];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

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
  if (requested === null || requested === undefined || requested.trim() === "") {
    return { ok: true };
  }

  const normalized = requested
    .trim()
    .replaceAll("\\", "/")
    .replace(/^data\//u, "")
    .replace(/\.toml$/iu, ".ron");
  return normalized === "figments.ron"
    ? { ok: true }
    : { ok: false, message: "The Figment editor source must be data/figments.ron." };
}

function decodePathSegment(segment) {
  try {
    return { ok: true, value: decodeURIComponent(segment) };
  } catch {
    return { ok: false };
  }
}

function isFigmentApiPath(pathname) {
  if (
    pathname === BASE_PATH ||
    pathname.startsWith(`${BASE_PATH}/`) ||
    pathname.startsWith(`${BASE_PATH}%`)
  ) {
    return true;
  }

  const rawSegments = pathname.split("/");
  if (rawSegments[1] !== "api" || rawSegments[2] !== "editor" || rawSegments.length < 4) {
    return false;
  }

  const resourceSegment = decodePathSegment(rawSegments[3]);
  return resourceSegment.ok && resourceSegment.value === "figments";
}

function routeForRawPath(rawPath) {
  const rawSegments = rawPath.split("/");
  if (rawSegments[1] === "api" && rawSegments[2] === "editor" && rawSegments.length >= 4) {
    const resourceSegment = decodePathSegment(rawSegments[3]);
    if (!resourceSegment.ok) {
      return {
        ok: false,
        statusCode: 400,
        code: "INVALID_API_PATH",
        message: "API path must use canonical static segments.",
      };
    }

    if (resourceSegment.value === "figments" && rawSegments[3] !== "figments") {
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
        code: "INVALID_FIGMENT_ID",
        message: "Route figment id must be a canonical UUID.",
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

  let figmentId;
  try {
    figmentId = decodeURIComponent(encodedSegment);
  } catch {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_FIGMENT_ID",
      message: "Route figment id must be a canonical UUID.",
    };
  }

  if (encodedSegment !== figmentId || figmentId.includes("/") || !UUID_PATTERN.test(figmentId)) {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_FIGMENT_ID",
      message: "Route figment id must be a canonical UUID.",
      details: { id: figmentId },
    };
  }

  return { ok: true, resource: "figment", figmentId };
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

function figmentNotFound(res, figmentId) {
  errorResponse(res, 404, "FIGMENT_NOT_FOUND", "Figment was not found.", {
    id: figmentId,
  });
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
    return { ok: false, code: "INVALID_REQUEST", message: "PATCH body must be a JSON object." };
  }
  if (typeof body.id !== "string") {
    return { ok: false, code: "INVALID_REQUEST", message: "PATCH body id must be a string." };
  }
  if (typeof body.field !== "string") {
    return { ok: false, code: "INVALID_REQUEST", message: "PATCH body field must be a string." };
  }
  if (!Object.hasOwn(body, "value")) {
    return { ok: false, code: "INVALID_REQUEST", message: "PATCH body value is required." };
  }
  if (typeof body.expectedSourceRevision !== "string") {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "Every save requires expectedSourceRevision.",
    };
  }
  return { ok: true };
}

function loadEditorData(rootDir) {
  return readEditorFigments({ rootDir });
}

function collectionResponse(rootDir, revision, loadData) {
  return {
    figments: loadData(rootDir),
    sourceRevision: revision(rootDir, FIGMENT_EDITOR_SOURCE_PATHS),
  };
}

function statusFor(error) {
  if (error.code === "STALE_SOURCE") return 409;
  if (error.code === "RECORD_NOT_FOUND") return 404;
  if (["INVALID_EDIT", "FIELD_NOT_APPLICABLE"].includes(error.code)) return 400;
  if (["MALFORMED_SOURCE", "COMPATIBILITY_VALIDATION_FAILED"].includes(error.code)) return 422;
  return error.statusCode ?? 500;
}

async function handlePatch(
  req,
  res,
  rootDir,
  figmentId,
  publishEdit,
  revision,
  loadData,
) {
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
    errorResponse(res, 400, "INVALID_FIGMENT_ID", "Request body id must be a canonical UUID.", {
      id: body.id,
    });
    return;
  }

  if (body.id !== figmentId) {
    errorResponse(res, 400, "FIGMENT_ID_MISMATCH", "Route figment id must match request body id.", {
      routeId: figmentId,
      bodyId: body.id,
    });
    return;
  }

  const validation = validateFigmentEdit(body.field, body.value);
  if (!validation.ok) {
    errorResponse(res, 400, "INVALID_EDIT", validation.message, {
      field: validation.field,
      value: validation.value,
    });
    return;
  }

  const totalStart = performance.now();
  const beforeFigments = loadData(rootDir);

  if (!beforeFigments.some((figment) => figment.id === figmentId)) {
    figmentNotFound(res, figmentId);
    return;
  }

  const result = await publishEdit({
    rootDir,
    dataset: "figments",
    operations: [{
      operation: "set_figment_field",
      figment_id: figmentId,
      field: validation.field,
      value: validation.value,
    }],
    sourcePaths: FIGMENT_EDITOR_SOURCE_PATHS,
    expectedSourceRevision: body.expectedSourceRevision,
    prepareDerivedArtifacts: ({ stageRoot }) => {
      refreshFigmentDataJson({ rootDir: stageRoot });
    },
    additionalPublishPaths: [FIGMENT_JSON_PATH],
  });
  const confirmedFigment = loadData(rootDir).find(
    (figment) => figment.id === figmentId,
  );

  if (confirmedFigment === undefined) {
    figmentNotFound(res, figmentId);
    return;
  }

  jsonResponse(res, 200, {
    figment: confirmedFigment,
    sourceRevision:
      result.sourceRevision ?? revision(rootDir, FIGMENT_EDITOR_SOURCE_PATHS),
    ...(Object.hasOwn(body, "clientRevision") ? { clientRevision: body.clientRevision } : {}),
    timing: {
      readMs: 0,
      patchMs: 0,
      refreshMs: 0,
      confirmMs: 0,
      totalMs: elapsedMs(totalStart),
    },
  });
}

export function createFigmentEditorApiMiddleware({
  rootDir = ROOT,
  publishEdit = stageAndPublishGameDataEdit,
  revision = sourceRevision,
  loadData = loadEditorData,
} = {}) {
  return async function figmentEditorApiMiddleware(req, res, next) {
    const rawPath = rawPathFromUrl(req.url);

    if (!isFigmentApiPath(rawPath)) {
      next();
      return;
    }

    try {
      const route = routeForRawPath(rawPath);
      if (!route.ok) {
        errorResponse(res, route.statusCode, route.code, route.message, route.details);
        return;
      }

      const sourceResolution = resolveRequestedSource(sourceParamFromUrl(req.url));
      if (!sourceResolution.ok) {
        errorResponse(res, 400, "INVALID_SOURCE", sourceResolution.message);
        return;
      }

      if (req.method === "GET" && route.resource === "collection") {
        jsonResponse(res, 200, collectionResponse(rootDir, revision, loadData));
        return;
      }

      if (req.method === "PATCH" && route.resource === "figment") {
        await handlePatch(
          req,
          res,
          rootDir,
          route.figmentId,
          publishEdit,
          revision,
          loadData,
        );
        return;
      }

      methodNotAllowed(res, route.resource === "collection" ? ["GET"] : ["PATCH"]);
    } catch (error) {
      const confirmed = error.code === "STALE_SOURCE"
        ? collectionResponse(rootDir, revision, loadData)
        : undefined;
      errorResponse(
        res,
        statusFor(error),
        error.code ?? "PUBLICATION_FAILED",
        error instanceof Error ? error.message : "Figment editor transaction failed.",
        {
          datasetId: "figments",
          source: FIGMENT_SOURCE_PATH,
          ...(error.currentSourceRevision === undefined
            ? {}
            : { currentSourceRevision: error.currentSourceRevision }),
          ...(confirmed === undefined ? {} : { confirmed }),
        },
      );
    }
  };
}
