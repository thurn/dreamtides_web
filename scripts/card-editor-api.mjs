import { readFileSync, writeFileSync } from "node:fs";
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

function isEditorCardsPath(pathname) {
  return pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`);
}

function patchCardIdFromPath(pathname) {
  const match = /^\/api\/editor\/cards\/([^/]+)$/u.exec(pathname);
  return match?.[1] ?? null;
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

function methodNotAllowed(res) {
  jsonResponse(
    res,
    405,
    {
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Method is not allowed for this endpoint.",
      },
    },
    { Allow: "GET, PATCH" },
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

async function handlePatch(req, res, rootDir, cardId) {
  if (cardId === null) {
    methodNotAllowed(res);
    return;
  }

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
  const source = readFileSync(tomlPath, "utf8");
  const patched = patchRenderedCardsToml(source, {
    cardId,
    field: body.field,
    value: body.value,
  });
  writeFileSync(tomlPath, patched.source);
  const patchMs = elapsedMs(patchStart);

  const refreshStart = performance.now();
  refreshCardDataJson({ rootDir });
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

export function createCardEditorApiMiddleware({ rootDir = ROOT } = {}) {
  return async function cardEditorApiMiddleware(req, res, next) {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const pathname = requestUrl.pathname;

    if (!isEditorCardsPath(pathname)) {
      next();
      return;
    }

    try {
      if (req.method === "GET" && pathname === BASE_PATH) {
        jsonResponse(res, 200, {
          cards: readEditorCards({ rootDir }),
        });
        return;
      }

      if (req.method === "PATCH") {
        await handlePatch(req, res, rootDir, patchCardIdFromPath(pathname));
        return;
      }

      methodNotAllowed(res);
    } catch (error) {
      errorResponse(res, 500, "SAVE_FAILED", error instanceof Error ? error.message : "Save failed.");
    }
  };
}
