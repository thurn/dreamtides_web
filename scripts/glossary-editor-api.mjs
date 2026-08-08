import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseGlossarySource, validateGlossaryEntries } from "./glossary-source.mjs";
import {
  sourceRevision,
  stageAndPublishGameDataEdit,
} from "./game-data-pipeline.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/glossary";
export const GLOSSARY_SOURCE_PATH = join("data", "glossary.ron");
export const GLOSSARY_OUTPUT_PATH = join("data", "glossary.toml");
export const GLOSSARY_EDITOR_SOURCE_PATHS = [GLOSSARY_SOURCE_PATH];
const MAX_BODY_BYTES = 1024 * 1024;
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

function requestPath(url) {
  return (url ?? "/").split("?", 1)[0].replace(/\/+$/u, "");
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

function readEntries(rootDir) {
  return parseGlossarySource(
    readFileSync(join(rootDir, GLOSSARY_OUTPUT_PATH), "utf8"),
  );
}

function collectionResponse(rootDir, revision, loadEntries) {
  return {
    entries: loadEntries(rootDir),
    sourceRevision: revision(rootDir, GLOSSARY_EDITOR_SOURCE_PATHS),
  };
}

function validatedEdit(body, id, current) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw Object.assign(new Error("Request body must be an object."), {
      code: "INVALID_EDIT",
    });
  }
  if (body.id !== undefined && body.id !== id) {
    throw Object.assign(
      new Error("Request id must match the glossary URL."),
      { code: "INVALID_EDIT" },
    );
  }
  if (typeof body.expectedSourceRevision !== "string") {
    throw Object.assign(
      new Error("Every save requires expectedSourceRevision."),
      { code: "INVALID_EDIT" },
    );
  }
  return {
    ...current,
    term: typeof body.term === "string" ? body.term : current.term,
    definition:
      typeof body.definition === "string"
        ? body.definition
        : current.definition,
    priority: body.priority === undefined ? current.priority : body.priority,
    variants: body.variants === undefined ? current.variants : body.variants,
    termPresentation:
      body.termPresentation === undefined
        ? current.termPresentation
        : body.termPresentation === null
          ? undefined
          : body.termPresentation,
  };
}

function semanticOperations(body, normalized) {
  const fields = [
    ["term", "term"],
    ["definition", "definition"],
    ["priority", "priority"],
    ["variants", "variants"],
    ["termPresentation", "term-presentation"],
  ];
  return fields
    .filter(([requestField]) => Object.hasOwn(body, requestField))
    .map(([requestField, field]) => ({
      operation: "set_glossary_field",
      glossary_id: normalized.id,
      field,
      value:
        requestField === "termPresentation"
          ? (normalized.termPresentation ?? null)
          : normalized[requestField],
    }));
}

function statusFor(error) {
  if (error.code === "STALE_SOURCE") return 409;
  if (error.code === "RECORD_NOT_FOUND") return 404;
  if (
    ["INVALID_EDIT", "INVALID_GLOSSARY", "FIELD_NOT_APPLICABLE"].includes(
      error.code,
    )
  )
    return 400;
  if (
    ["MALFORMED_SOURCE", "COMPATIBILITY_VALIDATION_FAILED"].includes(
      error.code,
    )
  )
    return 422;
  if (error.code === "BODY_TOO_LARGE") return 413;
  if (error.code === "INVALID_JSON") return 400;
  return error.statusCode ?? 500;
}

/** Vite dev middleware for revisioned semantic edits to canonical glossary.ron. */
export function createGlossaryEditorApiMiddleware({
  rootDir = ROOT,
  loadEntries = readEntries,
  revision = sourceRevision,
  publishEdit = stageAndPublishGameDataEdit,
  onChanged = () => {},
} = {}) {
  return async function glossaryEditorApi(req, res, next) {
    const pathname = requestPath(req.url);
    if (pathname !== BASE_PATH && !pathname.startsWith(`${BASE_PATH}/`)) {
      next();
      return;
    }

    try {
      if (pathname === BASE_PATH && req.method === "GET") {
        jsonResponse(
          res,
          200,
          collectionResponse(rootDir, revision, loadEntries),
        );
        return;
      }

      if (req.method !== "PATCH" || pathname === BASE_PATH) {
        jsonResponse(
          res,
          405,
          {
            error: {
              code: "METHOD_NOT_ALLOWED",
              message: "Use GET to load or PATCH to edit glossary entries.",
            },
          },
          { Allow: pathname === BASE_PATH ? "GET" : "PATCH" },
        );
        return;
      }

      const id = decodeURIComponent(pathname.slice(BASE_PATH.length + 1));
      if (!UUID_V4_PATTERN.test(id)) {
        errorResponse(
          res,
          400,
          "INVALID_GLOSSARY_ID",
          "Route Glossary id must be a canonical UUIDv4.",
          { id },
        );
        return;
      }
      const entries = loadEntries(rootDir);
      const index = entries.findIndex((entry) => entry.id === id);
      if (index < 0) {
        errorResponse(
          res,
          404,
          "GLOSSARY_ENTRY_NOT_FOUND",
          `No glossary entry has id "${id}".`,
        );
        return;
      }
      const body = await readJsonBody(req);
      const nextEntry = validatedEdit(body, id, entries[index]);
      const normalized = validateGlossaryEntries(
        entries.map((entry, entryIndex) =>
          entryIndex === index ? nextEntry : entry,
        ),
      );
      const operations = semanticOperations(body, normalized[index]);
      const result = await publishEdit({
        rootDir,
        dataset: "glossary",
        operations,
        sourcePaths: GLOSSARY_EDITOR_SOURCE_PATHS,
        expectedSourceRevision: body.expectedSourceRevision,
      });
      jsonResponse(res, 200, {
        entry: normalized[index],
        sourceRevision: result.sourceRevision,
      });
      if (result.changed.length > 0) onChanged();
    } catch (error) {
      let confirmed;
      if (error.code === "STALE_SOURCE") {
        confirmed = collectionResponse(rootDir, revision, loadEntries);
      }
      errorResponse(
        res,
        statusFor(error),
        error.code ?? "PUBLICATION_FAILED",
        error instanceof Error
          ? error.message
          : "Glossary editor transaction failed.",
        {
          datasetId: "glossary",
          source: GLOSSARY_SOURCE_PATH,
          ...(error.currentSourceRevision === undefined
            ? {}
            : { currentSourceRevision: error.currentSourceRevision }),
          ...(confirmed === undefined ? {} : { confirmed }),
        },
      );
    }
  };
}
