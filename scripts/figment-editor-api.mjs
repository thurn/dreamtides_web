import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_FIGMENT_TOML_PATH,
  patchFigmentsToml,
  readEditorFigments,
  refreshFigmentDataJson,
  validateFigmentEdit,
} from "./figment-editor-data.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/figments";
const FIGMENT_TOML_DIR = join("data");
const FIGMENT_JSON_PATH = join("public", "figments-data.json");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const defaultFileSystem = {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
};

let saveCounter = 0;

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

function tomlParamFromUrl(url) {
  const queryIndex = (url ?? "").indexOf("?");
  if (queryIndex === -1) {
    return null;
  }
  return new URLSearchParams((url ?? "").slice(queryIndex + 1)).get("toml");
}

function resolveRequestedTomlPath(rootDir, requested) {
  if (requested === null || requested === undefined || requested.trim() === "") {
    return { ok: true, relativePath: DEFAULT_FIGMENT_TOML_PATH };
  }

  const trimmed = requested.trim();
  if (trimmed.includes("\0")) {
    return { ok: false, message: "The toml parameter is invalid." };
  }

  const hasDirectory = trimmed.includes("/") || trimmed.includes("\\");
  const candidate = hasDirectory ? trimmed : join(FIGMENT_TOML_DIR, trimmed);

  if (!candidate.toLowerCase().endsWith(".toml")) {
    return { ok: false, message: "The toml file must have a .toml extension." };
  }

  const dataDir = resolve(rootDir, FIGMENT_TOML_DIR);
  const target = resolve(rootDir, candidate);
  const within = relative(dataDir, target);

  if (within === "" || within.startsWith("..") || isAbsolute(within) || within.includes(sep)) {
    return { ok: false, message: "The toml file must be located in data." };
  }

  return { ok: true, relativePath: join(FIGMENT_TOML_DIR, within) };
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
  return { ok: true };
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

function commitFiles(writes, fileSystem) {
  const preexisting = new Set(
    writes.filter((write) => fileSystem.existsSync(write.destination)),
  );

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

function generateFigmentDataJsonFromToml(patchedSource, fileSystem) {
  const tempRoot = fileSystem.mkdtempSync(join(tmpdir(), "journey-figment-editor-refresh-"));

  try {
    fileSystem.mkdirSync(join(tempRoot, "data"), { recursive: true });
    fileSystem.mkdirSync(join(tempRoot, "public"), { recursive: true });
    fileSystem.writeFileSync(join(tempRoot, DEFAULT_FIGMENT_TOML_PATH), patchedSource);

    refreshFigmentDataJson({ rootDir: tempRoot });

    const figmentJson = fileSystem.readFileSync(join(tempRoot, FIGMENT_JSON_PATH), "utf8");
    JSON.parse(figmentJson);

    return figmentJson;
  } finally {
    fileSystem.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function handlePatch(req, res, rootDir, figmentId, figmentTomlPath, fileSystem) {
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
  const readStart = performance.now();
  const beforeFigments = readEditorFigments({ rootDir, figmentTomlPath });
  const readMs = elapsedMs(readStart);

  if (!beforeFigments.some((figment) => figment.id === figmentId)) {
    figmentNotFound(res, figmentId);
    return;
  }

  const tomlPath = join(rootDir, figmentTomlPath);
  const patchStart = performance.now();
  const source = fileSystem.readFileSync(tomlPath, "utf8");
  const patched = patchFigmentsToml(source, {
    figmentId,
    field: body.field,
    value: validation.value,
  });
  const patchMs = elapsedMs(patchStart);

  const refreshesFigmentJson = figmentTomlPath === DEFAULT_FIGMENT_TOML_PATH;
  const refreshStart = performance.now();
  const writes = [preparedWrite(tomlPath, patched.source)];
  if (refreshesFigmentJson) {
    const figmentJson = generateFigmentDataJsonFromToml(patched.source, fileSystem);
    writes.push(preparedWrite(join(rootDir, FIGMENT_JSON_PATH), figmentJson));
  }
  commitFiles(writes, fileSystem);
  const refreshMs = elapsedMs(refreshStart);

  const confirmStart = performance.now();
  const confirmedFigment = readEditorFigments({ rootDir, figmentTomlPath }).find(
    (figment) => figment.id === figmentId,
  );
  const confirmMs = elapsedMs(confirmStart);

  if (confirmedFigment === undefined) {
    figmentNotFound(res, figmentId);
    return;
  }

  jsonResponse(res, 200, {
    figment: confirmedFigment,
    ...(Object.hasOwn(body, "clientRevision") ? { clientRevision: body.clientRevision } : {}),
    timing: {
      readMs,
      patchMs,
      refreshMs,
      confirmMs,
      totalMs: elapsedMs(totalStart),
    },
  });
}

export function createFigmentEditorApiMiddleware({
  rootDir = ROOT,
  fileSystem = defaultFileSystem,
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

      const tomlResolution = resolveRequestedTomlPath(rootDir, tomlParamFromUrl(req.url));
      if (!tomlResolution.ok) {
        errorResponse(res, 400, "INVALID_TOML", tomlResolution.message);
        return;
      }

      const figmentTomlPath = tomlResolution.relativePath;
      if (!fileSystem.existsSync(join(rootDir, figmentTomlPath))) {
        errorResponse(res, 404, "TOML_NOT_FOUND", "The requested toml file was not found.", {
          toml: figmentTomlPath,
        });
        return;
      }

      if (req.method === "GET" && route.resource === "collection") {
        jsonResponse(res, 200, {
          figments: readEditorFigments({ rootDir, figmentTomlPath }),
        });
        return;
      }

      if (req.method === "PATCH" && route.resource === "figment") {
        await handlePatch(req, res, rootDir, route.figmentId, figmentTomlPath, fileSystem);
        return;
      }

      methodNotAllowed(res, route.resource === "collection" ? ["GET"] : ["PATCH"]);
    } catch (error) {
      errorResponse(res, 500, "SAVE_FAILED", error instanceof Error ? error.message : "Save failed.");
    }
  };
}
