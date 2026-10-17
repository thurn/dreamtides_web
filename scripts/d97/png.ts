// PNG reading and writing for the D97 map tools, via pngjs (pure JS).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";
import type { PreviewImageLoader, RgbaImage } from "../../src/d97/map/preview.ts";

export function readPng(path: string): RgbaImage {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

export function writePng(path: string, image: RgbaImage): void {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
}

/** Loads library-relative PNGs from `library`, null for missing or unreadable ones. */
export function libraryImageLoader(library: string): PreviewImageLoader | null {
  if (!existsSync(library)) return null;
  return (path) => {
    const file = join(library, path);
    if (!existsSync(file)) return null;
    try {
      return readPng(file);
    } catch {
      return null;
    }
  };
}
