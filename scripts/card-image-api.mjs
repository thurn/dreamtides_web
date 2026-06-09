import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  IMAGE_CACHE_DIR,
  imageHash,
  shutterstockImageUrl,
} from "./setup-assets.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

// `cardImageUrl()` in src/data/card-database.ts renders every card's art as
// `/cards/<imageNumber>.webp`. Only purely numeric image numbers are valid.
const CARD_IMAGE_PATTERN = /^\/cards\/(\d+)\.webp$/u;

const defaultFileSystem = {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
};

/**
 * Parse the image number out of a `/cards/<n>.webp` request path. Returns the
 * numeric string (preserving the exact digits used in the cache key) or null
 * when the path does not name a card image.
 */
export function parseCardImageRequest(rawPath) {
  const match = CARD_IMAGE_PATTERN.exec((rawPath ?? "/").split("?", 1)[0]);
  return match ? match[1] : null;
}

/**
 * Detect the image MIME type from the leading bytes so a resolved file is
 * served with an honest `Content-Type` regardless of its `.webp` filename.
 * Card art is stored as WebP in the cache, but a freshly fetched Shutterstock
 * preview is JPEG; browsers sniff content, but a correct header avoids any
 * ambiguity.
 */
export function sniffImageContentType(bytes) {
  if (bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  return "application/octet-stream";
}

/**
 * Persist resolved art into the same image cache and `public/cards/` symlink
 * that `setup-assets` builds, so the next request for this number is served
 * statically and a later `npm run setup-assets` re-links it automatically.
 * Best-effort: a failure here never blocks serving the bytes we already have.
 */
function persistResolvedImage({ fileSystem, imageNumber, cachePath, symlinkPath, bytes }) {
  try {
    const cacheDir = join(cachePath, "..");
    if (!fileSystem.existsSync(cacheDir)) {
      fileSystem.mkdirSync(cacheDir, { recursive: true });
    }
    if (!fileSystem.existsSync(cachePath)) {
      // Write through a temp file so a partial write can never leave a
      // truncated cache entry behind for the hash.
      const tempPath = `${cachePath}.tmp-${imageNumber}`;
      fileSystem.writeFileSync(tempPath, bytes);
      fileSystem.renameSync(tempPath, cachePath);
    }
    const cardsDir = join(symlinkPath, "..");
    if (!fileSystem.existsSync(cardsDir)) {
      fileSystem.mkdirSync(cardsDir, { recursive: true });
    }
    if (!fileSystem.existsSync(symlinkPath)) {
      fileSystem.symlinkSync(cachePath, symlinkPath);
    }
  } catch {
    // Caching is an optimization; ignore filesystem races and permission
    // errors and fall back to serving the in-memory bytes.
  }
}

/**
 * Resolve a card image number to bytes, fetching from Shutterstock on a cache
 * miss. Resolution order:
 *   1. existing `public/cards/<n>.webp` symlink -> caller serves it statically
 *   2. the local image cache keyed by the Shutterstock URL hash
 *   3. a live fetch of the Shutterstock preview, cached for reuse
 * Returns `{ served: "static" }` when a static file already exists, an object
 * with `{ bytes, contentType }` when art was resolved, or null when the image
 * could not be obtained.
 */
export async function resolveCardImage({
  imageNumber,
  rootDir = ROOT,
  imageCacheDir = IMAGE_CACHE_DIR,
  fileSystem = defaultFileSystem,
  fetchImpl = fetch,
}) {
  const symlinkPath = join(rootDir, "public", "cards", `${imageNumber}.webp`);
  if (fileSystem.existsSync(symlinkPath)) {
    return { served: "static" };
  }

  const cachePath = join(imageCacheDir, imageHash(imageNumber));
  if (fileSystem.existsSync(cachePath)) {
    const bytes = fileSystem.readFileSync(cachePath);
    persistResolvedImage({ fileSystem, imageNumber, cachePath, symlinkPath, bytes });
    return { bytes, contentType: sniffImageContentType(bytes), source: "cache" };
  }

  let response;
  try {
    response = await fetchImpl(shutterstockImageUrl(imageNumber), { redirect: "follow" });
  } catch {
    return null;
  }
  if (!response.ok) {
    return null;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    return null;
  }
  persistResolvedImage({ fileSystem, imageNumber, cachePath, symlinkPath, bytes });
  return { bytes, contentType: sniffImageContentType(bytes), source: "fetched" };
}

/**
 * Vite dev-server middleware that backs `/cards/<n>.webp`. Card art added
 * after the last `setup-assets` run has no `public/cards/` symlink yet, so the
 * static handler 404s. This middleware resolves any such number on demand from
 * the local image cache or directly from Shutterstock, matching how every
 * other card's art is sourced, and persists it so the symlink exists from then
 * on. Requests with an existing symlink fall through to Vite's static handler.
 */
export function createCardImageApiMiddleware({
  rootDir = ROOT,
  imageCacheDir = IMAGE_CACHE_DIR,
  fileSystem = defaultFileSystem,
  fetchImpl = fetch,
} = {}) {
  return function cardImageApiMiddleware(req, res, next) {
    const imageNumber = parseCardImageRequest(req.url);
    if (imageNumber === null || (req.method !== "GET" && req.method !== "HEAD")) {
      next();
      return;
    }

    resolveCardImage({ imageNumber, rootDir, imageCacheDir, fileSystem, fetchImpl })
      .then((resolved) => {
        if (resolved === null) {
          next();
          return;
        }
        if (resolved.served === "static") {
          // A symlink already exists; let Vite's static handler serve it.
          next();
          return;
        }
        res.writeHead(200, {
          "Content-Type": resolved.contentType,
          "Cache-Control": "no-cache",
        });
        res.end(req.method === "HEAD" ? undefined : resolved.bytes);
      })
      .catch(() => {
        next();
      });
  };
}
