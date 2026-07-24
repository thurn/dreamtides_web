import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseGlossarySource,
  updateGlossaryEntrySource,
  validateGlossaryEntries,
} from "./glossary-source.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const GLOSSARY_PATH = join("data", "tabula", "glossary.toml");
const BASE_PATH = "/api/editor/glossary";
const MAX_BODY_BYTES = 1024 * 1024;
let writeSerial = 0;

const defaultFileSystem = {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
};

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function errorResponse(res, statusCode, code, message) {
  jsonResponse(res, statusCode, { error: { code, message } });
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
        reject(Object.assign(new Error("Request body is too large."), { code: "BODY_TOO_LARGE" }));
      }
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        resolveBody(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON."), { code: "INVALID_JSON" }));
      }
    });
    req.on("error", reject);
  });
}

function atomicWrite(fileSystem, destination, content) {
  writeSerial += 1;
  const temporary = `${destination}.glossary-editor-${String(process.pid)}-${String(writeSerial)}.tmp`;
  fileSystem.mkdirSync(dirname(destination), { recursive: true });
  try {
    fileSystem.writeFileSync(temporary, content);
    fileSystem.renameSync(temporary, destination);
  } catch (error) {
    try {
      fileSystem.unlinkSync(temporary);
    } catch {
      // The temporary file may not have been created.
    }
    throw error;
  }
}

function readEntries(fileSystem, rootDir) {
  return parseGlossarySource(
    fileSystem.readFileSync(join(rootDir, GLOSSARY_PATH), "utf8"),
  );
}

function validatedEdit(body, id, current) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw Object.assign(new Error("Request body must be an object."), { code: "INVALID_GLOSSARY" });
  }
  if (body.id !== undefined && body.id !== id) {
    throw Object.assign(new Error("Request id must match the glossary URL."), { code: "INVALID_GLOSSARY" });
  }
  return {
    ...current,
    term: typeof body.term === "string" ? body.term : current.term,
    definition:
      typeof body.definition === "string" ? body.definition : current.definition,
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

/** Vite dev middleware for loading and atomically editing glossary.toml. */
export function createGlossaryEditorApiMiddleware({
  rootDir = ROOT,
  fileSystem = defaultFileSystem,
} = {}) {
  return async function glossaryEditorApi(req, res, next) {
    const pathname = requestPath(req.url);
    if (pathname !== BASE_PATH && !pathname.startsWith(`${BASE_PATH}/`)) {
      next();
      return;
    }

    if (pathname === BASE_PATH && req.method === "GET") {
      try {
        jsonResponse(res, 200, { entries: readEntries(fileSystem, rootDir) });
      } catch (error) {
        errorResponse(
          res,
          500,
          "GLOSSARY_LOAD_FAILED",
          error instanceof Error ? error.message : "Failed to load glossary entries.",
        );
      }
      return;
    }

    if (req.method !== "PATCH" || pathname === BASE_PATH) {
      res.setHeader("Allow", pathname === BASE_PATH ? "GET" : "PATCH");
      errorResponse(res, 405, "METHOD_NOT_ALLOWED", "Use GET to load or PATCH to edit glossary entries.");
      return;
    }

    try {
      const id = decodeURIComponent(pathname.slice(BASE_PATH.length + 1));
      const glossaryPath = join(rootDir, GLOSSARY_PATH);
      const source = fileSystem.readFileSync(glossaryPath, "utf8");
      const entries = parseGlossarySource(source);
      const index = entries.findIndex((entry) => entry.id === id);
      if (index < 0) {
        errorResponse(res, 404, "GLOSSARY_ENTRY_NOT_FOUND", `No glossary entry has id "${id}".`);
        return;
      }
      const body = await readJsonBody(req);
      const nextEntry = validatedEdit(body, id, entries[index]);
      const nextEntries = entries.map((entry, entryIndex) =>
        entryIndex === index ? nextEntry : entry,
      );
      const normalized = validateGlossaryEntries(nextEntries);
      const changes = Object.fromEntries(
        ["term", "definition", "priority", "variants", "termPresentation"]
          .filter((field) => Object.hasOwn(body, field))
          .map((field) => [field, normalized[index][field]]),
      );
      atomicWrite(
        fileSystem,
        glossaryPath,
        updateGlossaryEntrySource(source, id, changes),
      );
      jsonResponse(res, 200, { entry: normalized[index] });
    } catch (error) {
      const code = error?.code;
      if (code === "BODY_TOO_LARGE") {
        errorResponse(res, 413, code, error.message);
        return;
      }
      if (code === "INVALID_JSON" || code === "INVALID_GLOSSARY") {
        errorResponse(res, 400, code, error.message);
        return;
      }
      errorResponse(
        res,
        500,
        "GLOSSARY_SAVE_FAILED",
        error instanceof Error ? error.message : "Failed to save glossary entry.",
      );
    }
  };
}
