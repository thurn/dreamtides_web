import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseCardImageRequest,
  sniffImageContentType,
  resolveCardImage,
} from "./card-image-api.mjs";
import { imageHash } from "./setup-assets.mjs";

const WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  0x00, 0x00, 0x00, 0x00,
]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe("parseCardImageRequest", () => {
  it("extracts the image number from a card art path", () => {
    expect(parseCardImageRequest("/cards/653554603.webp")).toBe("653554603");
  });

  it("ignores query strings", () => {
    expect(parseCardImageRequest("/cards/653554603.webp?v=2")).toBe("653554603");
  });

  it("returns null for non-card paths", () => {
    expect(parseCardImageRequest("/cards/653554603.png")).toBeNull();
    expect(parseCardImageRequest("/cards/not-a-number.webp")).toBeNull();
    expect(parseCardImageRequest("/avatars/123.png")).toBeNull();
    expect(parseCardImageRequest("/api/log")).toBeNull();
  });
});

describe("sniffImageContentType", () => {
  it("detects webp, jpeg, and png", () => {
    expect(sniffImageContentType(WEBP_BYTES)).toBe("image/webp");
    expect(sniffImageContentType(JPEG_BYTES)).toBe("image/jpeg");
    expect(
      sniffImageContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])),
    ).toBe("image/png");
  });

  it("falls back to octet-stream for unknown bytes", () => {
    expect(sniffImageContentType(Buffer.from([0, 1, 2, 3]))).toBe(
      "application/octet-stream",
    );
  });
});

describe("resolveCardImage", () => {
  let rootDir;
  let imageCacheDir;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "card-image-root-"));
    imageCacheDir = mkdtempSync(join(tmpdir(), "card-image-cache-"));
    mkdirSync(join(rootDir, "public", "cards"), { recursive: true });
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
    rmSync(imageCacheDir, { recursive: true, force: true });
  });

  it("defers to the static handler when a symlink already exists", async () => {
    const cachePath = join(imageCacheDir, imageHash("111"));
    writeFileSync(cachePath, WEBP_BYTES);
    symlinkSync(cachePath, join(rootDir, "public", "cards", "111.webp"));

    const fetchImpl = () => {
      throw new Error("must not fetch when the symlink exists");
    };
    const resolved = await resolveCardImage({
      imageNumber: "111",
      rootDir,
      imageCacheDir,
      fetchImpl,
    });
    expect(resolved).toEqual({ served: "static" });
  });

  it("serves a cached image and links it for next time", async () => {
    const cachePath = join(imageCacheDir, imageHash("222"));
    writeFileSync(cachePath, WEBP_BYTES);

    const fetchImpl = () => {
      throw new Error("must not fetch on a cache hit");
    };
    const resolved = await resolveCardImage({
      imageNumber: "222",
      rootDir,
      imageCacheDir,
      fetchImpl,
    });

    expect(resolved.source).toBe("cache");
    expect(resolved.contentType).toBe("image/webp");
    expect(Buffer.from(resolved.bytes).equals(WEBP_BYTES)).toBe(true);

    const symlinkPath = join(rootDir, "public", "cards", "222.webp");
    expect(existsSync(symlinkPath)).toBe(true);
    expect(readFileSync(realpathSync(symlinkPath)).equals(WEBP_BYTES)).toBe(true);
  });

  it("fetches from Shutterstock on a cache miss and caches the result", async () => {
    let requestedUrl = null;
    const fetchImpl = async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        arrayBuffer: async () =>
          JPEG_BYTES.buffer.slice(
            JPEG_BYTES.byteOffset,
            JPEG_BYTES.byteOffset + JPEG_BYTES.byteLength,
          ),
      };
    };

    const resolved = await resolveCardImage({
      imageNumber: "653554603",
      rootDir,
      imageCacheDir,
      fetchImpl,
    });

    expect(requestedUrl).toContain("653554603");
    expect(resolved.source).toBe("fetched");
    expect(resolved.contentType).toBe("image/jpeg");

    // The fetched bytes are written into the cache under the hash key so the
    // next request is a cache hit, and a symlink is created for static serving.
    const cachePath = join(imageCacheDir, imageHash("653554603"));
    expect(existsSync(cachePath)).toBe(true);
    expect(readFileSync(cachePath).equals(JPEG_BYTES)).toBe(true);
    expect(existsSync(join(rootDir, "public", "cards", "653554603.webp"))).toBe(
      true,
    );
  });

  it("returns null when the fetch fails", async () => {
    const fetchImpl = async () => ({ ok: false });
    const resolved = await resolveCardImage({
      imageNumber: "999",
      rootDir,
      imageCacheDir,
      fetchImpl,
    });
    expect(resolved).toBeNull();
  });

  it("returns null when the fetch throws", async () => {
    const fetchImpl = async () => {
      throw new Error("network down");
    };
    const resolved = await resolveCardImage({
      imageNumber: "888",
      rootDir,
      imageCacheDir,
      fetchImpl,
    });
    expect(resolved).toBeNull();
  });
});
