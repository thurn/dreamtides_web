import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SITE_TYPES,
  makeValidateDreamscapeEdit,
  readAffiliationOptions,
  readDreamAvatarOptions,
  readDreamGuideOptions,
  readEditorDreamscapes,
} from "./dreamscape-editor-data.mjs";
import {
  sourceRevision,
  stageAndPublishGameDataEdit,
} from "./game-data-pipeline.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/dream-guides";
const SLUG_PATTERN = /^[a-z0-9_]+$/u;

export const DREAM_GUIDE_EDITOR_SOURCE_PATHS = [
  "data/dreamscapes.ron",
  "data/dream_guides.ron",
];

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

function errorResponse(res, statusCode, code, message, details) {
  jsonResponse(res, statusCode, {
    error: { code, message, ...(details === undefined ? {} : { details }) },
  });
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

function collectionPayload(rootDir, revision) {
  return {
    dreamscapes: readEditorDreamscapes({ rootDir }),
    guides: readDreamGuideOptions({ rootDir }),
    affiliations: readAffiliationOptions({ rootDir }),
    dreamAvatars: readDreamAvatarOptions({ rootDir }),
    siteTypes: SITE_TYPES,
    sourceRevision: revision(rootDir, DREAM_GUIDE_EDITOR_SOURCE_PATHS),
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

function assertBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return "PATCH body must be a JSON object.";
  }
  if (
    typeof body.id !== "string" ||
    typeof body.field !== "string" ||
    !Object.hasOwn(body, "value")
  ) {
    return "PATCH body requires string id and field values plus value.";
  }
  if (typeof body.expectedSourceRevision !== "string") {
    return "Every save requires expectedSourceRevision.";
  }
  return null;
}

export function createDreamGuideEditorApiMiddleware({
  rootDir = ROOT,
  publishEdit = stageAndPublishGameDataEdit,
  revision = sourceRevision,
} = {}) {
  return async function dreamGuideEditorApiMiddleware(req, res, next) {
    const pathname = (req.url ?? "/").split("?", 1)[0];
    if (!pathname.startsWith(`${BASE_PATH}/`)) {
      next();
      return;
    }
    if (req.method !== "PATCH") {
      errorResponse(
        res,
        405,
        "METHOD_NOT_ALLOWED",
        "Method is not allowed for this endpoint.",
      );
      return;
    }

    let dreamscapeId;
    try {
      dreamscapeId = decodeURIComponent(pathname.slice(BASE_PATH.length + 1));
    } catch {
      errorResponse(
        res,
        400,
        "INVALID_DREAMSCAPE_ID",
        "Route dreamscape id must be URL encoded.",
      );
      return;
    }
    if (!SLUG_PATTERN.test(dreamscapeId)) {
      errorResponse(
        res,
        400,
        "INVALID_DREAMSCAPE_ID",
        "Route dreamscape id must be a canonical slug.",
      );
      return;
    }

    try {
      let body;
      try {
        body = JSON.parse(await readRequestBody(req));
      } catch {
        errorResponse(
          res,
          400,
          "INVALID_JSON",
          "Request body must be valid JSON.",
        );
        return;
      }
      const bodyError = assertBody(body);
      if (bodyError !== null) {
        errorResponse(res, 400, "INVALID_REQUEST", bodyError);
        return;
      }
      if (body.id !== dreamscapeId) {
        errorResponse(
          res,
          400,
          "DREAMSCAPE_ID_MISMATCH",
          "Route dreamscape id must match request body id.",
        );
        return;
      }
      if (body.field !== "guide-id" && body.field !== "signature-site") {
        errorResponse(
          res,
          400,
          "INVALID_EDIT",
          "This field is not a Dream guide assignment.",
        );
        return;
      }

      const guides = readDreamGuideOptions({ rootDir });
      const validateEdit = makeValidateDreamscapeEdit({
        guideIds: guides.map((guide) => guide.id),
        affiliationIds: readAffiliationOptions({ rootDir }).map(
          (entry) => entry.id,
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

      const beforeDreamscape = readEditorDreamscapes({ rootDir }).find(
        (dreamscape) => dreamscape.id === dreamscapeId,
      );
      if (beforeDreamscape === undefined) {
        errorResponse(
          res,
          404,
          "DREAMSCAPE_NOT_FOUND",
          "Dreamscape was not found.",
        );
        return;
      }
      if (beforeDreamscape.isStarter) {
        errorResponse(
          res,
          400,
          "INVALID_EDIT",
          "The starter guide and Draft signature are fixed.",
        );
        return;
      }
      const currentGuide = guides.find(
        (guide) => guide.homeDreamscapeId === dreamscapeId,
      );
      const requestedGuide =
        body.field === "guide-id"
          ? guides.find((guide) => guide.id === validation.value)
          : guides.find((guide) => guide.siteType === validation.value);
      if (currentGuide === undefined || requestedGuide === undefined) {
        errorResponse(
          res,
          400,
          "INVALID_EDIT",
          "The selected guide specialty is not canonical.",
        );
        return;
      }

      const operation =
        body.field === "guide-id"
          ? "swap_dream_guide_homes"
          : "swap_dream_guide_specialties";
      const result = await publishEdit({
        rootDir,
        dataset: "dream-guides",
        operations:
          currentGuide.id === requestedGuide.id
            ? []
            : [
                {
                  operation,
                  first_guide_id: currentGuide.id,
                  second_guide_id: requestedGuide.id,
                },
              ],
        sourcePaths: DREAM_GUIDE_EDITOR_SOURCE_PATHS,
        expectedSourceRevision: body.expectedSourceRevision,
      });
      const confirmed = readEditorDreamscapes({ rootDir });
      jsonResponse(res, 200, {
        dreamscape: confirmed.find(
          (dreamscape) => dreamscape.id === dreamscapeId,
        ),
        dreamscapes: confirmed,
        guides: readDreamGuideOptions({ rootDir }),
        sourceRevision:
          result.sourceRevision ??
          revision(rootDir, DREAM_GUIDE_EDITOR_SOURCE_PATHS),
        ...(Object.hasOwn(body, "clientRevision")
          ? { clientRevision: body.clientRevision }
          : {}),
      });
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
          : "Dream guide editor transaction failed.",
        {
          datasetId: "dream-guides",
          source: "data/dream_guides.ron",
          ...(error.currentSourceRevision === undefined
            ? {}
            : { currentSourceRevision: error.currentSourceRevision }),
          ...(confirmed === undefined ? {} : { confirmed }),
        },
      );
    }
  };
}
