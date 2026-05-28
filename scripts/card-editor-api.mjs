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
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  patchRenderedCardsToml,
  readEditorCards,
  refreshCardDataJson,
  validateCardEdit,
} from "./card-editor-data.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE_PATH = "/api/editor/cards";
const CARD_TOML_PATH = join("data", "tabula", "rendered-cards.toml");
const CARD_JSON_PATH = join("public", "card-data.json");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

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
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(payload);
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

function decodePathSegment(segment) {
  try {
    return {
      ok: true,
      value: decodeURIComponent(segment),
    };
  } catch {
    return {
      ok: false,
    };
  }
}

function isEditorCardsApiPath(pathname) {
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
  return resourceSegment.ok && resourceSegment.value === "cards";
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

    if (resourceSegment.value === "cards" && rawSegments[3] !== "cards") {
      return {
        ok: false,
        statusCode: 400,
        code: "INVALID_API_PATH",
        message: "API path must use canonical static segments.",
      };
    }
  }

  if (rawPath === BASE_PATH) {
    return {
      ok: true,
      resource: "collection",
    };
  }

  if (!rawPath.startsWith(`${BASE_PATH}/`)) {
    if (rawPath.slice(BASE_PATH.length).startsWith("%")) {
      return {
        ok: false,
        statusCode: 400,
        code: "INVALID_CARD_ID",
        message: "Route card id must be a canonical UUID.",
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

  let cardId;
  try {
    cardId = decodeURIComponent(encodedSegment);
  } catch {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_CARD_ID",
      message: "Route card id must be a canonical UUID.",
    };
  }

  if (encodedSegment !== cardId || cardId.includes("/") || !UUID_PATTERN.test(cardId)) {
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_CARD_ID",
      message: "Route card id must be a canonical UUID.",
      details: { id: cardId },
    };
  }

  return {
    ok: true,
    resource: "card",
    cardId,
  };
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      resolve(body);
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

function cardNotFound(res, cardId) {
  errorResponse(res, 404, "CARD_NOT_FOUND", "Card was not found.", { id: cardId });
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

function isCanonicalUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function generateCardDataJsonFromToml(patchedSource, fileSystem) {
  const tempRoot = fileSystem.mkdtempSync(join(tmpdir(), "quest-card-editor-refresh-"));

  try {
    fileSystem.mkdirSync(join(tempRoot, "data", "tabula"), { recursive: true });
    fileSystem.mkdirSync(join(tempRoot, "public"), { recursive: true });
    fileSystem.writeFileSync(join(tempRoot, CARD_TOML_PATH), patchedSource);

    refreshCardDataJson({ rootDir: tempRoot });

    const cardJson = fileSystem.readFileSync(join(tempRoot, CARD_JSON_PATH), "utf8");
    JSON.parse(cardJson);

    return cardJson;
  } finally {
    fileSystem.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function tempPathFor(destination, extension) {
  saveCounter += 1;
  return `${destination}.${process.pid}.${Date.now()}.${saveCounter}.${extension}`;
}

function writePreparedCardFiles(rootDir, { tomlSource, cardJson }, fileSystem) {
  const writes = [
    {
      destination: join(rootDir, CARD_TOML_PATH),
      temp: tempPathFor(join(rootDir, CARD_TOML_PATH), "tmp"),
      backup: tempPathFor(join(rootDir, CARD_TOML_PATH), "bak"),
      content: tomlSource,
    },
    {
      destination: join(rootDir, CARD_JSON_PATH),
      temp: tempPathFor(join(rootDir, CARD_JSON_PATH), "tmp"),
      backup: tempPathFor(join(rootDir, CARD_JSON_PATH), "bak"),
      content: cardJson,
    },
  ];

  try {
    for (const write of writes) {
      fileSystem.writeFileSync(write.temp, write.content);
    }

    for (const write of writes) {
      fileSystem.renameSync(write.destination, write.backup);
    }

    for (const write of writes) {
      fileSystem.renameSync(write.temp, write.destination);
    }
  } catch (error) {
    for (const write of writes) {
      fileSystem.rmSync(write.temp, { force: true, recursive: true });
    }

    for (const write of writes) {
      if (fileSystem.existsSync(write.backup)) {
        fileSystem.rmSync(write.destination, { force: true, recursive: true });
        fileSystem.renameSync(write.backup, write.destination);
      }
    }

    throw error;
  }

  for (const write of writes) {
    try {
      fileSystem.rmSync(write.backup, { force: true, recursive: true });
    } catch {
      // Backups are removed after both destination files are committed.
    }
  }
}

async function handlePatch(req, res, rootDir, cardId, fileSystem) {
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

  if (!isCanonicalUuid(body.id)) {
    errorResponse(res, 400, "INVALID_CARD_ID", "Request body id must be a canonical UUID.", {
      id: body.id,
    });
    return;
  }

  if (body.id !== cardId) {
    errorResponse(res, 400, "CARD_ID_MISMATCH", "Route card id must match request body id.", {
      routeId: cardId,
      bodyId: body.id,
    });
    return;
  }

  const validation = validateCardEdit(body.field, body.value);
  if (!validation.ok) {
    errorResponse(res, 400, "INVALID_EDIT", validation.message, {
      field: validation.field,
      value: validation.value,
    });
    return;
  }

  const totalStart = performance.now();
  const readStart = performance.now();
  const beforeCards = readEditorCards({ rootDir });
  const readMs = elapsedMs(readStart);

  if (!beforeCards.some((card) => card.id === cardId)) {
    cardNotFound(res, cardId);
    return;
  }

  const tomlPath = join(rootDir, CARD_TOML_PATH);
  const patchStart = performance.now();
  const source = fileSystem.readFileSync(tomlPath, "utf8");
  const patched = patchRenderedCardsToml(source, {
    cardId,
    field: body.field,
    value: body.value,
  });
  const patchMs = elapsedMs(patchStart);

  const refreshStart = performance.now();
  const cardJson = generateCardDataJsonFromToml(patched.source, fileSystem);
  writePreparedCardFiles(rootDir, { tomlSource: patched.source, cardJson }, fileSystem);
  const refreshMs = elapsedMs(refreshStart);

  const confirmStart = performance.now();
  const confirmedCard = readEditorCards({ rootDir }).find((card) => card.id === cardId);
  const confirmMs = elapsedMs(confirmStart);

  if (confirmedCard === undefined) {
    cardNotFound(res, cardId);
    return;
  }

  jsonResponse(res, 200, {
    card: confirmedCard,
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

export function createCardEditorApiMiddleware({
  rootDir = ROOT,
  fileSystem = defaultFileSystem,
} = {}) {
  return async function cardEditorApiMiddleware(req, res, next) {
    const rawPath = rawPathFromUrl(req.url);

    if (!isEditorCardsApiPath(rawPath)) {
      next();
      return;
    }

    try {
      const route = routeForRawPath(rawPath);
      if (!route.ok) {
        errorResponse(res, route.statusCode, route.code, route.message, route.details);
        return;
      }

      if (req.method === "GET" && route.resource === "collection") {
        jsonResponse(res, 200, {
          cards: readEditorCards({ rootDir }),
        });
        return;
      }

      if (req.method === "PATCH" && route.resource === "card") {
        await handlePatch(req, res, rootDir, route.cardId, fileSystem);
        return;
      }

      methodNotAllowed(res, route.resource === "collection" ? ["GET"] : ["PATCH"]);
    } catch (error) {
      errorResponse(res, 500, "SAVE_FAILED", error instanceof Error ? error.message : "Save failed.");
    }
  };
}
