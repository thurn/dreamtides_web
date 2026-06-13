import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Dev-server middleware backing the quest debug overlay's "Save Quest" /
// "Load Saved Quest" controls. Each save is a JSON file on disk under
// `saved-quests/`, so a run survives a Realtime Database emulator restart (the
// emulator holds room data only in memory) and can be loaded back into the
// current room later. Saves are keyed by a human-chosen name, e.g.
// "warriors draft".

const BASE_PATH = "/api/saved-quests";
const SAVES_DIR_NAME = "saved-quests";
const MAX_NAME_LENGTH = 120;

const defaultFileSystem = {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
};

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

function errorResponse(res, statusCode, code, message) {
  jsonResponse(res, statusCode, { error: { code, message } });
}

function pathFromUrl(url) {
  return (url ?? "/").split("?", 1)[0];
}

/** Stable, filesystem-safe filename for a save name (same name -> same file). */
function fileNameFor(name) {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 40) || "quest";
  // djb2 hash keeps two distinct names that slugify the same in separate files.
  let hash = 5381;
  for (let index = 0; index < name.length; index += 1) {
    hash = ((hash << 5) + hash + name.charCodeAt(index)) >>> 0;
  }
  return `${slug}-${hash.toString(16)}.json`;
}

function summaryFromRecord(record) {
  return {
    name: record.name,
    savedAt: record.savedAt,
    screenType: record?.questState?.screen?.type ?? "unknown",
  };
}

function ensureDir(fs, dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readAllRecords(fs, dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const records = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    try {
      const raw = fs.readFileSync(join(dir, entry), "utf8");
      const record = JSON.parse(raw);
      if (
        record !== null &&
        typeof record === "object" &&
        typeof record.name === "string" &&
        typeof record.savedAt === "string" &&
        record.questState !== undefined
      ) {
        records.push({ file: entry, record });
      }
    } catch {
      // Skip a corrupt file rather than failing the whole listing.
    }
  }
  return records;
}

function findRecordByName(fs, dir, name) {
  return readAllRecords(fs, dir).find((entry) => entry.record.name === name) ?? null;
}

function writeRecordAtomic(fs, dir, fileName, record) {
  ensureDir(fs, dir);
  const tempDir = fs.mkdtempSync(join(tmpdir(), "quest-save-"));
  const tempPath = join(tempDir, fileName);
  try {
    fs.writeFileSync(tempPath, JSON.stringify(record, null, 2));
    fs.renameSync(tempPath, join(dir, fileName));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024 * 1024) {
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/**
 * Creates a connect-style middleware serving the saved-quest endpoints:
 *
 * - `GET    /api/saved-quests`            -> `{ saves: SavedQuestSummary[] }`
 * - `POST   /api/saved-quests`            -> body `{ name, questState }`, saves
 * - `GET    /api/saved-quests/<name>`     -> `{ name, savedAt, questState }`
 * - `DELETE /api/saved-quests/<name>`     -> `{ ok: true }`
 *
 * `rootDir` is the repository root; saves live in `rootDir/saved-quests`. A
 * `fileSystem` override is accepted for tests.
 */
export function createSavedQuestsApiMiddleware({
  rootDir,
  fileSystem = defaultFileSystem,
} = {}) {
  if (typeof rootDir !== "string" || rootDir === "") {
    throw new Error("createSavedQuestsApiMiddleware requires a rootDir.");
  }
  const savesDir = join(rootDir, SAVES_DIR_NAME);

  return function savedQuestsApiMiddleware(req, res, next) {
    const path = pathFromUrl(req.url);
    if (path !== BASE_PATH && !path.startsWith(`${BASE_PATH}/`)) {
      next();
      return;
    }

    const isCollection = path === BASE_PATH || path === `${BASE_PATH}/`;
    const rawName = isCollection ? "" : path.slice(`${BASE_PATH}/`.length);
    let decodedName = "";
    if (!isCollection) {
      try {
        decodedName = decodeURIComponent(rawName);
      } catch {
        errorResponse(res, 400, "INVALID_NAME", "The save name is malformed.");
        return;
      }
    }

    if (req.method === "GET" && isCollection) {
      const saves = readAllRecords(fileSystem, savesDir)
        .map((entry) => summaryFromRecord(entry.record))
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      jsonResponse(res, 200, { saves });
      return;
    }

    if (req.method === "GET" && !isCollection) {
      const found = findRecordByName(fileSystem, savesDir, decodedName);
      if (found === null) {
        errorResponse(res, 404, "NOT_FOUND", `No saved quest named "${decodedName}".`);
        return;
      }
      jsonResponse(res, 200, found.record);
      return;
    }

    if (req.method === "DELETE" && !isCollection) {
      const found = findRecordByName(fileSystem, savesDir, decodedName);
      if (found !== null) {
        fileSystem.rmSync(join(savesDir, found.file), { force: true });
      }
      jsonResponse(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && isCollection) {
      readRequestBody(req)
        .then((body) => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch {
            errorResponse(res, 400, "INVALID_JSON", "Request body is not valid JSON.");
            return;
          }
          const name = typeof parsed?.name === "string" ? parsed.name.trim() : "";
          if (name === "") {
            errorResponse(res, 400, "INVALID_NAME", "A saved quest needs a name.");
            return;
          }
          if (name.length > MAX_NAME_LENGTH) {
            errorResponse(
              res,
              400,
              "INVALID_NAME",
              `Save names are limited to ${MAX_NAME_LENGTH} characters.`,
            );
            return;
          }
          if (parsed?.questState === undefined || parsed.questState === null) {
            errorResponse(res, 400, "INVALID_STATE", "Request body is missing questState.");
            return;
          }
          // Overwrite any existing save that stored the same display name even
          // if its on-disk filename differs (e.g. an older hashing scheme).
          const existing = findRecordByName(fileSystem, savesDir, name);
          if (existing !== null && existing.file !== fileNameFor(name)) {
            fileSystem.rmSync(join(savesDir, existing.file), { force: true });
          }
          const record = {
            name,
            savedAt: new Date().toISOString(),
            questState: parsed.questState,
          };
          writeRecordAtomic(fileSystem, savesDir, fileNameFor(name), record);
          jsonResponse(res, 200, { saved: summaryFromRecord(record) });
        })
        .catch(() => {
          errorResponse(res, 500, "WRITE_FAILED", "Failed to save the quest.");
        });
      return;
    }

    errorResponse(res, 405, "METHOD_NOT_ALLOWED", `${req.method} is not supported here.`);
  };
}
