import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SITE_TYPES,
  makeValidateDreamscapeEdit,
  planAvatarAssignment,
  readAffiliationOptions,
  readAvatarOptions,
  readDreamGuideOptions,
  readEditorDreamscapes,
} from "./dreamscape-editor-data.mjs";
import {
  sourceRevision,
  stageAndPublishGameDataEdit,
} from "./game-data-pipeline.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/dreamscapes";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const COMPATIBILITY_ID_PATTERN = /^[a-z0-9_]+$/u;

export const DREAMSCAPE_EDITOR_SOURCE_PATHS = [
  "data/dreamscapes.ron",
  "data/dream_guides.ron",
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
  return normalized === "dreamscapes.ron"
    ? { ok: true }
    : {
        ok: false,
        message: "The Dreamscape editor source must be data/dreamscapes.ron.",
      };
}

function isDreamscapeApiPath(pathname) {
  return pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`);
}

function routeForRawPath(rawPath) {
  if (rawPath === BASE_PATH) return { ok: true, resource: "collection" };
  const remainder = rawPath.slice(BASE_PATH.length + 1);
  const segments = remainder.split("/");
  const residentRoute =
    segments.length === 2 && segments[1] === "avatars";
  if (segments[0] === "" || (segments.length > 1 && !residentRoute)) {
    return {
      ok: false,
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Endpoint was not found.",
    };
  }
  let dreamscapeId;
  try {
    dreamscapeId = decodeURIComponent(segments[0]);
  } catch {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_DREAMSCAPE_ID",
      message:
        "Route Dreamscape id must be a canonical UUIDv4 or compatibility key.",
    };
  }
  if (
    !UUID_V4_PATTERN.test(dreamscapeId) &&
    !COMPATIBILITY_ID_PATTERN.test(dreamscapeId)
  ) {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_DREAMSCAPE_ID",
      message:
        "Route Dreamscape id must be a canonical UUIDv4 or compatibility key.",
      details: { id: dreamscapeId },
    };
  }
  return {
    ok: true,
    resource: residentRoute ? "avatars" : "dreamscape",
    dreamscapeId,
  };
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
  try {
    return JSON.parse(await readRequestBody(req));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.code = "INVALID_JSON";
    throw error;
  }
}

function collectionPayload(rootDir, revision) {
  return {
    dreamscapes: readEditorDreamscapes({ rootDir }),
    guides: readDreamGuideOptions({ rootDir }),
    affiliations: readAffiliationOptions({ rootDir }),
    avatars: readAvatarOptions({ rootDir }),
    siteTypes: SITE_TYPES,
    sourceRevision: revision(rootDir, DREAMSCAPE_EDITOR_SOURCE_PATHS),
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

function validExpectedRevision(body) {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof body.expectedSourceRevision === "string"
  );
}

function canonicalDreamscape(dreamscapes, id) {
  return dreamscapes.find((dreamscape) => dreamscape.id === id);
}

async function handlePatch(req, res, options, dreamscapeId) {
  const body = await readJsonRequest(req);
  if (
    !validExpectedRevision(body) ||
    typeof body.id !== "string" ||
    typeof body.field !== "string" ||
    !Object.hasOwn(body, "value")
  ) {
    errorResponse(
      res,
      400,
      "INVALID_REQUEST",
      "PATCH body requires string id and field values, value, and expectedSourceRevision.",
    );
    return;
  }
  if (body.id !== dreamscapeId) {
    errorResponse(
      res,
      400,
      "DREAMSCAPE_ID_MISMATCH",
      "Route Dreamscape id must match request body id.",
    );
    return;
  }
  if (body.field === "guide-id" || body.field === "signature-site") {
    errorResponse(
      res,
      400,
      "INVALID_EDIT",
      "Dream guide assignments must use the Dream guide editor endpoint.",
    );
    return;
  }

  const guides = readDreamGuideOptions({ rootDir: options.rootDir });
  const validateEdit = makeValidateDreamscapeEdit({
    guideIds: guides.map((guide) => guide.id),
    affiliationIds: readAffiliationOptions({ rootDir: options.rootDir }).map(
      (affiliation) => affiliation.id,
    ),
  });
  const validation = validateEdit(body.field, body.value);
  if (!validation.ok) {
    errorResponse(res, 400, "INVALID_EDIT", validation.message, {
      field: validation.field,
      value: validation.value,
    });
    return;
  }
  const before = readEditorDreamscapes({ rootDir: options.rootDir });
  const beforeDreamscape = canonicalDreamscape(before, dreamscapeId);
  if (beforeDreamscape === undefined) {
    errorResponse(
      res,
      404,
      "DREAMSCAPE_NOT_FOUND",
      "Dreamscape was not found.",
      {
        id: dreamscapeId,
      },
    );
    return;
  }
  let operations = [
    {
      operation: "set_dreamscape_field",
      dreamscape_id: dreamscapeId,
      field: validation.field,
      value: validation.value,
    },
  ];
  if (
    validation.field === "affiliation-id" &&
    beforeDreamscape["affiliation-id"] !== validation.value
  ) {
    const displaced = before.find(
      (dreamscape) => dreamscape["affiliation-id"] === validation.value,
    );
    if (
      displaced !== undefined &&
      beforeDreamscape["affiliation-id"] !== null
    ) {
      operations.push({
        operation: "set_dreamscape_field",
        dreamscape_id: displaced.id,
        field: validation.field,
        value: beforeDreamscape["affiliation-id"],
      });
    }
  }
  const result = await options.publishEdit({
    rootDir: options.rootDir,
    dataset: "dreamscapes",
    operations,
    sourcePaths: DREAMSCAPE_EDITOR_SOURCE_PATHS,
    expectedSourceRevision: body.expectedSourceRevision,
  });
  const confirmed = readEditorDreamscapes({ rootDir: options.rootDir });
  const dreamscape = canonicalDreamscape(confirmed, dreamscapeId);
  if (dreamscape === undefined) {
    const error = new Error("Published Dreamscape could not be reloaded.");
    error.code = "PUBLICATION_FAILED";
    throw error;
  }
  console.log(
    `[dreamscape-editor] saved ${dreamscapeId}.${validation.field} = ${JSON.stringify(validation.value)}` +
      ` -> changed [${operations.map((operation) => operation.dreamscape_id).join(", ")}]`,
  );
  jsonResponse(res, 200, {
    dreamscape,
    dreamscapes: confirmed,
    guides: readDreamGuideOptions({ rootDir: options.rootDir }),
    sourceRevision:
      result.sourceRevision ??
      options.revision(options.rootDir, DREAMSCAPE_EDITOR_SOURCE_PATHS),
    ...(Object.hasOwn(body, "clientRevision")
      ? { clientRevision: body.clientRevision }
      : {}),
  });
}

function assertAssignmentBody(body) {
  if (!validExpectedRevision(body)) {
    return "Every assignment requires expectedSourceRevision.";
  }
  if (!["replace", "add", "remove"].includes(body.action)) {
    return 'action must be "replace", "add", or "remove".';
  }
  if (body.inId !== undefined && typeof body.inId !== "string") {
    return "inId must be an Avatar id string.";
  }
  if (body.outId !== undefined && typeof body.outId !== "string") {
    return "outId must be an Avatar id string.";
  }
  return null;
}

async function handleAvatarAssignment(req, res, options, dreamscapeId) {
  const body = await readJsonRequest(req);
  const bodyError = assertAssignmentBody(body);
  if (bodyError !== null) {
    errorResponse(res, 400, "INVALID_REQUEST", bodyError);
    return;
  }
  const dreamscapes = readEditorDreamscapes({ rootDir: options.rootDir });
  if (canonicalDreamscape(dreamscapes, dreamscapeId) === undefined) {
    errorResponse(
      res,
      404,
      "DREAMSCAPE_NOT_FOUND",
      "Dreamscape was not found.",
      {
        id: dreamscapeId,
      },
    );
    return;
  }
  const avatars = readAvatarOptions({ rootDir: options.rootDir });
  const plan = planAvatarAssignment(
    dreamscapes,
    avatars.map((avatar) => avatar.id),
    {
      action: body.action,
      dreamscapeId,
      inId: body.inId,
      outId: body.outId,
    },
  );
  if (!plan.ok) {
    errorResponse(res, 400, "INVALID_ASSIGNMENT", plan.message);
    return;
  }
  const result = await options.publishEdit({
    rootDir: options.rootDir,
    dataset: "dreamscapes",
    operations: plan.changes.map((change) => ({
      operation: "set_dreamscape_opponents",
      dreamscape_id: change.id,
      opponent_ids: change.ids,
    })),
    sourcePaths: DREAMSCAPE_EDITOR_SOURCE_PATHS,
    expectedSourceRevision: body.expectedSourceRevision,
  });
  const confirmed = readEditorDreamscapes({ rootDir: options.rootDir });
  console.log(
    `[dreamscape-editor] ${body.action} on ${dreamscapeId}` +
      `${body.inId !== undefined ? ` in=${body.inId}` : ""}` +
      `${body.outId !== undefined ? ` out=${body.outId}` : ""}` +
      ` -> changed [${plan.changes.map((change) => change.id).join(", ")}]`,
  );
  jsonResponse(res, 200, {
    dreamscapes: confirmed,
    changed: plan.changes.map((change) => change.id),
    sourceRevision:
      result.sourceRevision ??
      options.revision(options.rootDir, DREAMSCAPE_EDITOR_SOURCE_PATHS),
  });
}

export function createDreamscapeEditorApiMiddleware({
  rootDir = ROOT,
  publishEdit = stageAndPublishGameDataEdit,
  revision = sourceRevision,
} = {}) {
  const options = { rootDir, publishEdit, revision };
  return async function dreamscapeEditorApiMiddleware(req, res, next) {
    const rawPath = rawPathFromUrl(req.url);
    if (!isDreamscapeApiPath(rawPath)) {
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
        jsonResponse(res, 200, collectionPayload(rootDir, revision));
        return;
      }
      if (req.method === "PATCH" && route.resource === "dreamscape") {
        await handlePatch(req, res, options, route.dreamscapeId);
        return;
      }
      if (req.method === "POST" && route.resource === "avatars") {
        await handleAvatarAssignment(
          req,
          res,
          options,
          route.dreamscapeId,
        );
        return;
      }
      errorResponse(
        res,
        405,
        "METHOD_NOT_ALLOWED",
        "Method is not allowed for this endpoint.",
      );
    } catch (error) {
      const confirmed =
        error.code === "STALE_SOURCE"
          ? collectionPayload(rootDir, revision)
          : undefined;
      errorResponse(
        res,
        statusFor(error),
        error.code ?? "PUBLICATION_FAILED",
        error instanceof Error
          ? error.message
          : "Dreamscape editor transaction failed.",
        {
          datasetId: "dreamscapes",
          source: "data/dreamscapes.ron",
          ...(error.currentSourceRevision === undefined
            ? {}
            : { currentSourceRevision: error.currentSourceRevision }),
          ...(confirmed === undefined ? {} : { confirmed }),
        },
      );
    }
  };
}
