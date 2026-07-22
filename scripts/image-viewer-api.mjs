import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import {
  DEFAULT_CARDS_TOML,
  DEFAULT_IMAGE_VIEWER_STATE_PATH,
  DEFAULT_NAME_HISTORY_TOMLS,
  DEFAULT_TAGGED_ROOT,
  buildImageManifest,
  moveImageCategory,
  setFavorite,
  setManualUsed,
} from "./image-viewer-data.mjs";

const MANIFEST_PATH = "/api/images/manifest";
const FILE_PATH_PREFIX = "/api/images/file/";
const FAVORITE_PATH = "/api/images/favorite";
const MANUAL_USED_PATH = "/api/images/manual-used";
const CATEGORY_PATH = "/api/images/category";

/** Read and JSON-parse a request body, rejecting oversized or malformed input. */
function readJsonBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let length = 0;
    req.on("data", (chunk) => {
      length += chunk.length;
      if (length > 1_000_000) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (raw === "") {
        resolvePromise({});
        return;
      }
      try {
        resolvePromise(JSON.parse(raw));
      } catch {
        reject(new Error("Request body is not valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

function errorResponse(res, statusCode, code, message) {
  jsonResponse(res, statusCode, { error: { code, message } });
}

function rawPathFromUrl(url) {
  return (url ?? "/").split("?", 1)[0];
}

/**
 * Resolve a `/api/images/file/<category>/<filename>` request to an absolute
 * path that is guaranteed to live inside the tagged root. The decoded,
 * normalized path must stay within the root, blocking `..` traversal and
 * absolute escapes.
 */
function resolveImagePath(root, rawPath) {
  const relative = decodeURIComponent(rawPath.slice(FILE_PATH_PREFIX.length));
  if (relative === "") {
    return null;
  }

  const rootResolved = resolve(root);
  const candidate = resolve(rootResolved, normalize(relative));
  if (
    candidate !== rootResolved &&
    !candidate.startsWith(rootResolved + "/")
  ) {
    return null;
  }

  return candidate;
}

/**
 * Vite dev-server middleware backing `npm run images`. It exposes the
 * candidate-image manifest, streams the individual image files (which live
 * outside the repository in the local Shutterstock working set and therefore
 * cannot be served as static `public/` assets), and accepts the viewer's
 * editorial mutations: toggling favorite/manual-used marks and moving an image
 * between category subdirectories.
 */
export function createImageViewerApiMiddleware({
  root = DEFAULT_TAGGED_ROOT,
  cardsTomlPath = join(resolve("."), DEFAULT_CARDS_TOML),
  nameHistoryTomlPaths = DEFAULT_NAME_HISTORY_TOMLS.map((relativePath) =>
    join(resolve("."), relativePath),
  ),
  statePath = join(resolve("."), DEFAULT_IMAGE_VIEWER_STATE_PATH),
} = {}) {
  return function imageViewerApiMiddleware(req, res, next) {
    const rawPath = rawPathFromUrl(req.url);

    if (rawPath === MANIFEST_PATH) {
      if (req.method !== "GET") {
        errorResponse(res, 405, "METHOD_NOT_ALLOWED", "Use GET.");
        return;
      }
      if (!existsSync(root)) {
        errorResponse(
          res,
          404,
          "IMAGE_ROOT_NOT_FOUND",
          `Candidate image directory not found: ${root}`,
        );
        return;
      }
      try {
        jsonResponse(
          res,
          200,
          buildImageManifest({
            root,
            cardsTomlPath,
            nameHistoryTomlPaths,
            statePath,
          }),
        );
      } catch (error) {
        errorResponse(
          res,
          500,
          "MANIFEST_FAILED",
          error instanceof Error ? error.message : "Failed to build manifest.",
        );
      }
      return;
    }

    if (rawPath === FAVORITE_PATH) {
      if (req.method !== "POST") {
        errorResponse(res, 405, "METHOD_NOT_ALLOWED", "Use POST.");
        return;
      }
      readJsonBody(req)
        .then((body) => {
          const imageNumber = body?.imageNumber;
          const favorite = body?.favorite;
          if (typeof imageNumber !== "string" || imageNumber.trim() === "") {
            errorResponse(res, 400, "BAD_REQUEST", "imageNumber is required.");
            return;
          }
          if (typeof favorite !== "boolean") {
            errorResponse(
              res,
              400,
              "BAD_REQUEST",
              "favorite must be a boolean.",
            );
            return;
          }
          setFavorite(statePath, imageNumber, favorite);
          jsonResponse(res, 200, {
            imageNumber: imageNumber.trim(),
            favorite,
          });
        })
        .catch((error) => {
          errorResponse(
            res,
            400,
            "FAVORITE_FAILED",
            error instanceof Error ? error.message : "Failed to update.",
          );
        });
      return;
    }

    if (rawPath === MANUAL_USED_PATH) {
      if (req.method !== "POST") {
        errorResponse(res, 405, "METHOD_NOT_ALLOWED", "Use POST.");
        return;
      }
      readJsonBody(req)
        .then((body) => {
          const imageNumber = body?.imageNumber;
          const used = body?.used;
          if (typeof imageNumber !== "string" || imageNumber.trim() === "") {
            errorResponse(res, 400, "BAD_REQUEST", "imageNumber is required.");
            return;
          }
          if (typeof used !== "boolean") {
            errorResponse(res, 400, "BAD_REQUEST", "used must be a boolean.");
            return;
          }
          setManualUsed(statePath, imageNumber, used);
          jsonResponse(res, 200, { imageNumber: imageNumber.trim(), used });
        })
        .catch((error) => {
          errorResponse(
            res,
            400,
            "MANUAL_USED_FAILED",
            error instanceof Error ? error.message : "Failed to update.",
          );
        });
      return;
    }

    if (rawPath === CATEGORY_PATH) {
      if (req.method !== "POST") {
        errorResponse(res, 405, "METHOD_NOT_ALLOWED", "Use POST.");
        return;
      }
      readJsonBody(req)
        .then((body) => {
          const result = moveImageCategory(
            root,
            body?.category,
            body?.filename,
            body?.targetCategory,
          );
          jsonResponse(res, 200, result);
        })
        .catch((error) => {
          errorResponse(
            res,
            400,
            "CATEGORY_MOVE_FAILED",
            error instanceof Error ? error.message : "Failed to move image.",
          );
        });
      return;
    }

    if (rawPath.startsWith(FILE_PATH_PREFIX)) {
      if (req.method !== "GET") {
        errorResponse(res, 405, "METHOD_NOT_ALLOWED", "Use GET.");
        return;
      }
      const filePath = resolveImagePath(root, rawPath);
      if (filePath === null || !existsSync(filePath) || !statSync(filePath).isFile()) {
        errorResponse(res, 404, "IMAGE_NOT_FOUND", "Image not found.");
        return;
      }
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-cache",
      });
      createReadStream(filePath).pipe(res);
      return;
    }

    next();
  };
}
