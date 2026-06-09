import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import {
  DEFAULT_CARDS_TOML,
  DEFAULT_NAME_HISTORY_TOMLS,
  DEFAULT_TAGGED_ROOT,
  buildImageManifest,
} from "./image-viewer-data.mjs";

const MANIFEST_PATH = "/api/images/manifest";
const FILE_PATH_PREFIX = "/api/images/file/";

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
 * candidate-image manifest and streams the individual image files, which live
 * outside the repository in the local Shutterstock working set and therefore
 * cannot be served as static `public/` assets.
 */
export function createImageViewerApiMiddleware({
  root = DEFAULT_TAGGED_ROOT,
  cardsTomlPath = join(resolve("."), DEFAULT_CARDS_TOML),
  nameHistoryTomlPaths = DEFAULT_NAME_HISTORY_TOMLS.map((relativePath) =>
    join(resolve("."), relativePath),
  ),
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
          buildImageManifest({ root, cardsTomlPath, nameHistoryTomlPaths }),
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
