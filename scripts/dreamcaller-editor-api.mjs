import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DREAMCALLER_TOML_PATH,
  TIDES4_SOURCE_PATH,
  patchDreamcallersToml,
  patchTides4Pool,
  readEditorDreamcallers,
  readTideCatalog,
  refreshDreamcallerDataJson,
  refreshTides4DataJson,
  validateDreamcallerEdit,
  validateTidePool,
} from "./dreamcaller-editor-data.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/dreamcallers";
const DREAMCALLER_TOML_DIR = join("data", "tabula");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const defaultFileSystem = {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
};

let saveCounter = 0;

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

function tomlParamFromUrl(url) {
  const queryIndex = (url ?? "").indexOf("?");
  if (queryIndex === -1) {
    return null;
  }
  return new URLSearchParams((url ?? "").slice(queryIndex + 1)).get("toml");
}

function resolveRequestedTomlPath(rootDir, requested) {
  if (requested === null || requested === undefined || requested.trim() === "") {
    return { ok: true, relativePath: DEFAULT_DREAMCALLER_TOML_PATH };
  }

  const trimmed = requested.trim();
  if (trimmed.includes("\0")) {
    return { ok: false, message: "The toml parameter is invalid." };
  }

  const hasDirectory = trimmed.includes("/") || trimmed.includes("\\");
  const candidate = hasDirectory ? trimmed : join(DREAMCALLER_TOML_DIR, trimmed);

  if (!candidate.toLowerCase().endsWith(".toml")) {
    return { ok: false, message: "The toml file must have a .toml extension." };
  }

  const tabulaDir = resolve(rootDir, DREAMCALLER_TOML_DIR);
  const target = resolve(rootDir, candidate);
  const within = relative(tabulaDir, target);

  if (within === "" || within.startsWith("..") || isAbsolute(within) || within.includes(sep)) {
    return { ok: false, message: "The toml file must be located in data/tabula." };
  }

  return { ok: true, relativePath: join(DREAMCALLER_TOML_DIR, within) };
}

function isDreamcallerApiPath(pathname) {
  return pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`);
}

function routeForRawPath(rawPath) {
  if (rawPath === BASE_PATH) {
    return { ok: true, resource: "collection" };
  }

  const encodedSegment = rawPath.slice(BASE_PATH.length + 1);
  if (encodedSegment.length === 0 || encodedSegment.includes("/")) {
    return { ok: false, statusCode: 404, code: "NOT_FOUND", message: "Endpoint was not found." };
  }

  let dreamcallerId;
  try {
    dreamcallerId = decodeURIComponent(encodedSegment);
  } catch {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_DREAMCALLER_ID",
      message: "Route dreamcaller id must be a canonical UUID.",
    };
  }

  if (!UUID_PATTERN.test(dreamcallerId)) {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_DREAMCALLER_ID",
      message: "Route dreamcaller id must be a canonical UUID.",
      details: { id: dreamcallerId },
    };
  }

  return { ok: true, resource: "dreamcaller", dreamcallerId };
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

function methodNotAllowed(res, allowedMethods) {
  jsonResponse(
    res,
    405,
    { error: { code: "METHOD_NOT_ALLOWED", message: "Method is not allowed for this endpoint." } },
    { Allow: allowedMethods.join(", ") },
  );
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

/**
 * Commit a set of file writes atomically via temp-file swap with rollback, so a
 * crash mid-save never leaves a TOML/JSONC source or its regenerated JSON
 * partially written.
 */
function commitFiles(writes, fileSystem) {
  const preexisting = new Set(writes.filter((write) => fileSystem.existsSync(write.destination)));

  try {
    for (const write of writes) {
      fileSystem.writeFileSync(write.temp, write.content);
    }
    for (const write of writes) {
      if (preexisting.has(write)) {
        fileSystem.renameSync(write.destination, write.backup);
      }
    }
    for (const write of writes) {
      fileSystem.renameSync(write.temp, write.destination);
    }
  } catch (error) {
    for (const write of writes) {
      fileSystem.rmSync(write.temp, { force: true, recursive: true });
    }
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
    if (!preexisting.has(write)) {
      continue;
    }
    try {
      fileSystem.rmSync(write.backup, { force: true, recursive: true });
    } catch {
      // Backups are removed after every destination file is committed.
    }
  }
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
  return { ok: true };
}

function confirmedRecord(rootDir, dreamcallerTomlPath, dreamcallerId) {
  return readEditorDreamcallers({ rootDir, dreamcallerTomlPath }).find(
    (dreamcaller) => dreamcaller.id === dreamcallerId,
  );
}

async function handlePatch(req, res, rootDir, dreamcallerId, dreamcallerTomlPath, fileSystem) {
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

  if (!UUID_PATTERN.test(body.id)) {
    errorResponse(res, 400, "INVALID_DREAMCALLER_ID", "Request body id must be a canonical UUID.", {
      id: body.id,
    });
    return;
  }

  if (body.id !== dreamcallerId) {
    errorResponse(res, 400, "DREAMCALLER_ID_MISMATCH", "Route dreamcaller id must match request body id.", {
      routeId: dreamcallerId,
      bodyId: body.id,
    });
    return;
  }

  const beforeRecord = confirmedRecord(rootDir, dreamcallerTomlPath, dreamcallerId);
  if (beforeRecord === undefined) {
    errorResponse(res, 404, "DREAMCALLER_NOT_FOUND", "Dreamcaller was not found.", { id: dreamcallerId });
    return;
  }

  if (body.field === "tide-pool") {
    const validation = validateTidePool(body.value, readTideCatalog({ rootDir }));
    if (!validation.ok) {
      errorResponse(res, 400, "INVALID_EDIT", validation.message, { field: body.field });
      return;
    }

    const tides4Abs = join(rootDir, TIDES4_SOURCE_PATH);
    const source = fileSystem.readFileSync(tides4Abs, "utf8");
    const patched = patchTides4Pool(source, { dreamcallerId, pool: validation.value });

    commitFiles([preparedWrite(tides4Abs, patched.source)], fileSystem);
    refreshTides4DataJson({ rootDir });
  } else {
    const validation = validateDreamcallerEdit(body.field, body.value);
    if (!validation.ok) {
      errorResponse(res, 400, "INVALID_EDIT", validation.message, {
        field: validation.field,
        value: validation.value,
      });
      return;
    }

    const tomlAbs = join(rootDir, dreamcallerTomlPath);
    const source = fileSystem.readFileSync(tomlAbs, "utf8");
    const patched = patchDreamcallersToml(source, {
      dreamcallerId,
      field: body.field,
      value: validation.value,
    });

    commitFiles([preparedWrite(tomlAbs, patched.source)], fileSystem);
    if (dreamcallerTomlPath === DEFAULT_DREAMCALLER_TOML_PATH) {
      refreshDreamcallerDataJson({ rootDir, dreamcallerTomlPath });
    }
  }

  const confirmed = confirmedRecord(rootDir, dreamcallerTomlPath, dreamcallerId);
  if (confirmed === undefined) {
    errorResponse(res, 404, "DREAMCALLER_NOT_FOUND", "Dreamcaller was not found.", { id: dreamcallerId });
    return;
  }

  jsonResponse(res, 200, {
    dreamcaller: confirmed,
    ...(Object.hasOwn(body, "clientRevision") ? { clientRevision: body.clientRevision } : {}),
  });
}

export function createDreamcallerEditorApiMiddleware({
  rootDir = ROOT,
  fileSystem = defaultFileSystem,
} = {}) {
  return async function dreamcallerEditorApiMiddleware(req, res, next) {
    const rawPath = rawPathFromUrl(req.url);

    if (!isDreamcallerApiPath(rawPath)) {
      next();
      return;
    }

    try {
      const route = routeForRawPath(rawPath);
      if (!route.ok) {
        errorResponse(res, route.statusCode, route.code, route.message, route.details);
        return;
      }

      const tomlResolution = resolveRequestedTomlPath(rootDir, tomlParamFromUrl(req.url));
      if (!tomlResolution.ok) {
        errorResponse(res, 400, "INVALID_TOML", tomlResolution.message);
        return;
      }

      const dreamcallerTomlPath = tomlResolution.relativePath;
      if (!fileSystem.existsSync(join(rootDir, dreamcallerTomlPath))) {
        errorResponse(res, 404, "TOML_NOT_FOUND", "The requested toml file was not found.", {
          toml: dreamcallerTomlPath,
        });
        return;
      }

      if (req.method === "GET" && route.resource === "collection") {
        jsonResponse(res, 200, {
          dreamcallers: readEditorDreamcallers({ rootDir, dreamcallerTomlPath }),
          tides: readTideCatalog({ rootDir }),
        });
        return;
      }

      if (req.method === "PATCH" && route.resource === "dreamcaller") {
        await handlePatch(req, res, rootDir, route.dreamcallerId, dreamcallerTomlPath, fileSystem);
        return;
      }

      methodNotAllowed(res, route.resource === "collection" ? ["GET"] : ["PATCH"]);
    } catch (error) {
      errorResponse(res, 500, "SAVE_FAILED", error instanceof Error ? error.message : "Save failed.");
    }
  };
}
