import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readTutorialConfiguration,
  refreshTutorialDataJson,
  validateTutorialActions,
} from "./tutorial-data.mjs";
import {
  sourceRevision,
  stageAndPublishGameDataEdit,
} from "./game-data-pipeline.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/tutorial";
const MAX_BODY_BYTES = 1024 * 1024;

export const TUTORIAL_EDITOR_SOURCE_PATHS = ["data/tutorial.ron"];

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

function readJsonBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    let tooLarge = false;
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
        tooLarge = true;
        reject(
          Object.assign(new Error("Request body is too large."), {
            code: "BODY_TOO_LARGE",
          }),
        );
      }
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        resolveBody(JSON.parse(body));
      } catch {
        reject(
          Object.assign(new Error("Request body must be valid JSON."), {
            code: "INVALID_JSON",
          }),
        );
      }
    });
    req.on("error", reject);
  });
}

function statusFor(error) {
  if (error.code === "STALE_SOURCE") return 409;
  if (error.code === "BODY_TOO_LARGE") return 413;
  if (
    ["INVALID_JSON", "INVALID_EDIT", "INVALID_TUTORIAL_ACTIONS"].includes(
      error.code,
    )
  ) {
    return 400;
  }
  if (
    ["MALFORMED_SOURCE", "COMPATIBILITY_VALIDATION_FAILED"].includes(error.code)
  ) {
    return 422;
  }
  return error.statusCode ?? 500;
}

function collectionPayload(rootDir, revision) {
  return {
    ...readTutorialConfiguration({ rootDir }),
    sourceRevision: revision(rootDir, TUTORIAL_EDITOR_SOURCE_PATHS),
  };
}

/** Vite dev middleware for source-preserving edits to canonical Tutorial RON. */
export function createTutorialEditorApiMiddleware({
  rootDir = ROOT,
  publishEdit = stageAndPublishGameDataEdit,
  revision = sourceRevision,
} = {}) {
  return async function tutorialEditorApi(req, res, next) {
    const pathname = (req.url ?? "/").split("?", 1)[0];
    if (pathname !== BASE_PATH) {
      next();
      return;
    }

    if (req.method === "GET") {
      try {
        jsonResponse(res, 200, collectionPayload(rootDir, revision));
      } catch (error) {
        errorResponse(
          res,
          500,
          "TUTORIAL_LOAD_FAILED",
          error instanceof Error
            ? error.message
            : "Failed to load tutorial actions.",
        );
      }
      return;
    }

    if (req.method !== "PUT") {
      res.setHeader("Allow", "GET, PUT");
      errorResponse(
        res,
        405,
        "METHOD_NOT_ALLOWED",
        "Use GET or PUT for tutorial actions.",
      );
      return;
    }

    try {
      const body = await readJsonBody(req);
      if (
        body === null ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        typeof body.expectedSourceRevision !== "string"
      ) {
        throw Object.assign(
          new Error("Every Tutorial save requires expectedSourceRevision."),
          {
            code: "INVALID_EDIT",
          },
        );
      }
      const actions = validateTutorialActions(body.actions);
      const result = await publishEdit({
        rootDir,
        dataset: "tutorial",
        operations: [{ operation: "replace_tutorial_actions", actions }],
        sourcePaths: TUTORIAL_EDITOR_SOURCE_PATHS,
        expectedSourceRevision: body.expectedSourceRevision,
        additionalPublishPaths: ["public/tutorial-data.json"],
        prepareDerivedArtifacts: ({ stageRoot }) => {
          refreshTutorialDataJson({ rootDir: stageRoot });
        },
      });
      jsonResponse(res, 200, {
        actions: readTutorialConfiguration({ rootDir }).actions,
        sourceRevision:
          result.sourceRevision ??
          revision(rootDir, TUTORIAL_EDITOR_SOURCE_PATHS),
      });
    } catch (error) {
      let confirmed;
      if (error?.code === "STALE_SOURCE") {
        confirmed = collectionPayload(rootDir, revision);
      }
      errorResponse(
        res,
        statusFor(error),
        error?.code ?? "TUTORIAL_SAVE_FAILED",
        error instanceof Error
          ? error.message
          : "Failed to save tutorial actions.",
        {
          datasetId: "tutorial",
          source: TUTORIAL_EDITOR_SOURCE_PATHS[0],
          ...(error?.currentSourceRevision === undefined
            ? {}
            : { currentSourceRevision: error.currentSourceRevision }),
          ...(confirmed === undefined ? {} : { confirmed }),
        },
      );
    }
  };
}
