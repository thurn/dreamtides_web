import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DREAM_AVATAR_TOML_PATH,
  TIDE_POOLS_SOURCE_PATH,
  TIDES_SOURCE_PATH,
  readEditorDreamAvatars,
  readTideCatalog,
  validateDreamAvatarEdit,
  validateTidePool,
} from "./dream-avatar-editor-data.mjs";
import {
  sourceRevision,
  stageAndPublishGameDataEdit,
} from "./game-data-pipeline.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/dream-avatars";
export const DREAM_AVATAR_SOURCE_PATH = join("data", "dream_avatars.ron");
export const DREAM_AVATAR_EDITOR_SOURCE_PATHS = [
  DREAM_AVATAR_SOURCE_PATH,
  TIDES_SOURCE_PATH,
  TIDE_POOLS_SOURCE_PATH,
];
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

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
  if (
    requested === null ||
    requested === undefined ||
    requested.trim() === ""
  ) {
    return { ok: true };
  }
  const normalized = requested
    .trim()
    .replaceAll("\\", "/")
    .replace(/^data\//u, "")
    .replace(/\.toml$/iu, ".ron");
  if (normalized !== "dream_avatars.ron") {
    return {
      ok: false,
      message: "The DreamAvatar editor source must be data/dream_avatars.ron.",
    };
  }
  return { ok: true };
}

function isDreamAvatarApiPath(pathname) {
  return pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`);
}

function routeForRawPath(rawPath) {
  if (rawPath === BASE_PATH) return { ok: true, resource: "collection" };
  const encodedSegment = rawPath.slice(BASE_PATH.length + 1);
  if (encodedSegment.length === 0 || encodedSegment.includes("/")) {
    return {
      ok: false,
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Endpoint was not found.",
    };
  }
  let dreamAvatarId;
  try {
    dreamAvatarId = decodeURIComponent(encodedSegment);
  } catch {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_DREAM_AVATAR_ID",
      message: "Route DreamAvatar id must be a canonical UUIDv4.",
    };
  }
  if (!UUID_V4_PATTERN.test(dreamAvatarId)) {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_DREAM_AVATAR_ID",
      message: "Route DreamAvatar id must be a canonical UUIDv4.",
      details: { id: dreamAvatarId },
    };
  }
  return { ok: true, resource: "dreamAvatar", dreamAvatarId };
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
    return { ok: false, message: "PATCH body must be a JSON object." };
  }
  if (typeof body.id !== "string") {
    return { ok: false, message: "PATCH body id must be a string." };
  }
  if (typeof body.field !== "string") {
    return { ok: false, message: "PATCH body field must be a string." };
  }
  if (!Object.hasOwn(body, "value")) {
    return { ok: false, message: "PATCH body value is required." };
  }
  if (typeof body.expectedSourceRevision !== "string") {
    return {
      ok: false,
      message: "Every save requires expectedSourceRevision.",
    };
  }
  return { ok: true };
}

function readEditorData(rootDir) {
  return {
    dreamAvatars: readEditorDreamAvatars({ rootDir }),
    tides: readTideCatalog({ rootDir }),
  };
}

function confirmedRecord(data, dreamAvatarId) {
  return data.dreamAvatars.find(
    (dreamAvatar) => dreamAvatar.id === dreamAvatarId,
  );
}

function collectionResponse(rootDir, revision, loadData) {
  return {
    ...loadData(rootDir),
    sourceRevision: revision(rootDir, DREAM_AVATAR_EDITOR_SOURCE_PATHS),
  };
}

function statusFor(error) {
  if (error.code === "STALE_SOURCE") return 409;
  if (error.code === "RECORD_NOT_FOUND") return 404;
  if (["INVALID_EDIT", "FIELD_NOT_APPLICABLE"].includes(error.code)) return 400;
  if (
    ["MALFORMED_SOURCE", "COMPATIBILITY_VALIDATION_FAILED"].includes(error.code)
  )
    return 422;
  return error.statusCode ?? 500;
}

async function handlePatch(
  req,
  res,
  rootDir,
  dreamAvatarId,
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
    errorResponse(res, 400, "INVALID_REQUEST", bodyResult.message);
    return;
  }
  if (!UUID_V4_PATTERN.test(body.id)) {
    errorResponse(
      res,
      400,
      "INVALID_DREAM_AVATAR_ID",
      "Request body id must be a canonical UUIDv4.",
      { id: body.id },
    );
    return;
  }
  if (body.id !== dreamAvatarId) {
    errorResponse(
      res,
      400,
      "DREAM_AVATAR_ID_MISMATCH",
      "Route DreamAvatar id must match request body id.",
      { routeId: dreamAvatarId, bodyId: body.id },
    );
    return;
  }
  const beforeData = loadData(rootDir);
  if (confirmedRecord(beforeData, dreamAvatarId) === undefined) {
    errorResponse(
      res,
      404,
      "DREAM_AVATAR_NOT_FOUND",
      "DreamAvatar was not found.",
      {
        id: dreamAvatarId,
      },
    );
    return;
  }

  let dataset;
  let operations;
  if (body.field === "tide-pool") {
    const validation = validateTidePool(body.value, beforeData.tides);
    if (!validation.ok) {
      errorResponse(res, 400, "INVALID_EDIT", validation.message, {
        field: body.field,
      });
      return;
    }
    dataset = "dream-avatar-tide-pools";
    operations = [
      {
        operation: "set_dream_avatar_tide_pool",
        dream_avatar_id: dreamAvatarId,
        starter: validation.value.starter,
        facets: validation.value.facets,
        neutral: validation.value.neutral,
      },
    ];
  } else {
    const validation = validateDreamAvatarEdit(body.field, body.value);
    if (!validation.ok) {
      errorResponse(res, 400, "INVALID_EDIT", validation.message, {
        field: validation.field,
        value: validation.value,
      });
      return;
    }
    dataset = "dream-avatars";
    operations = [
      {
        operation: "set_dream_avatar_field",
        avatar_id: dreamAvatarId,
        field: validation.field,
        value: validation.value,
      },
    ];
  }

  const result = await publishEdit({
    rootDir,
    dataset,
    operations,
    sourcePaths: DREAM_AVATAR_EDITOR_SOURCE_PATHS,
    expectedSourceRevision: body.expectedSourceRevision,
  });
  const confirmed = confirmedRecord(loadData(rootDir), dreamAvatarId);
  if (confirmed === undefined) {
    const error = new Error("Published DreamAvatar could not be reloaded.");
    error.code = "PUBLICATION_FAILED";
    throw error;
  }
  jsonResponse(res, 200, {
    dreamAvatar: confirmed,
    sourceRevision:
      result.sourceRevision ??
      revision(rootDir, DREAM_AVATAR_EDITOR_SOURCE_PATHS),
    ...(Object.hasOwn(body, "clientRevision")
      ? { clientRevision: body.clientRevision }
      : {}),
  });
}

export function createDreamAvatarEditorApiMiddleware({
  rootDir = ROOT,
  publishEdit = stageAndPublishGameDataEdit,
  revision = sourceRevision,
  loadData = readEditorData,
} = {}) {
  return async function dreamAvatarEditorApiMiddleware(req, res, next) {
    const rawPath = rawPathFromUrl(req.url);
    if (!isDreamAvatarApiPath(rawPath)) {
      next();
      return;
    }
    try {
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
      if (req.method === "GET" && route.resource === "collection") {
        jsonResponse(res, 200, collectionResponse(rootDir, revision, loadData));
        return;
      }
      if (req.method === "PATCH" && route.resource === "dreamAvatar") {
        await handlePatch(
          req,
          res,
          rootDir,
          route.dreamAvatarId,
          publishEdit,
          revision,
          loadData,
        );
        return;
      }
      methodNotAllowed(
        res,
        route.resource === "collection" ? ["GET"] : ["PATCH"],
      );
    } catch (error) {
      let confirmed;
      if (error.code === "STALE_SOURCE") {
        confirmed = collectionResponse(rootDir, revision, loadData);
      }
      errorResponse(
        res,
        statusFor(error),
        error.code ?? "PUBLICATION_FAILED",
        error instanceof Error
          ? error.message
          : "DreamAvatar editor transaction failed.",
        {
          datasetId: "dream-avatars",
          source: DREAM_AVATAR_SOURCE_PATH,
          ...(error.currentSourceRevision === undefined
            ? {}
            : { currentSourceRevision: error.currentSourceRevision }),
          ...(confirmed === undefined ? {} : { confirmed }),
        },
      );
    }
  };
}
