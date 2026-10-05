// @vitest-environment node

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultArtPaths,
  imageCacheFileName,
  journeyImageIdFromFilename,
  linkArt,
  type ArtCatalog,
} from "./setup-assets";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "setup-assets-test-"));
  roots.push(root);
  return root;
}

function touch(path: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "art");
}

const CATALOG: ArtCatalog = {
  cardImageNumbers: [101, 101, 202, 0],
  avatars: [
    { imageNumber: "0007", name: "Fixture Avatar" },
    { imageNumber: "0007", name: "Fixture Avatar Again" },
  ],
  dreamsignImageNames: ["sign.png"],
  explorationImageNumbers: [101],
  dreamscapeArtNames: ["meadow"],
  guidePortraits: [{ artName: "guide", portraitSource: "guide-source.png" }],
  atlas: {
    bossSceneSource: "boss.png",
    bossIconSource: "boss_icon.png",
    bossFigureSource: "boss-figure.png",
    unrevealedFrameSource: "frame.png",
    unrevealedFrameFile: "frame.png",
    bossSceneArtName: "limbo",
    bossIconArtName: "limbo-icon",
    bossFigureArtName: "apollyon",
  },
};

describe("art linker", () => {
  it("links each referenced art file that exists in the local library", () => {
    const root = fixtureRoot();
    const paths = defaultArtPaths(join(root, "repo"), join(root, "home"));
    touch(join(paths.imageCacheDir, imageCacheFileName(101)));
    touch(join(paths.avatarArtDir, "0007.png"));
    touch(join(paths.dreamsignArtDir, "sign.png"));
    touch(join(paths.journeyArtDir, "dream-555.jpg"));
    touch(join(paths.dreamscapeSceneArtDir, "meadow.png"));
    touch(join(paths.dreamGuideArtDir, "guide-source.png"));

    linkArt(CATALOG, paths);

    const publicDir = paths.publicDir;
    expect(readlinkSync(join(publicDir, "cards", "101.webp"))).toBe(
      join(paths.imageCacheDir, imageCacheFileName(101)),
    );
    expect(existsSync(join(publicDir, "cards", "202.webp"))).toBe(false);
    expect(existsSync(join(publicDir, "avatars", "0007.png"))).toBe(true);
    expect(existsSync(join(publicDir, "dreamsigns", "sign.png"))).toBe(true);
    expect(existsSync(join(publicDir, "dreamscapes", "meadow.png"))).toBe(true);
    expect(existsSync(join(publicDir, "dream-guides", "guide.png"))).toBe(true);
    expect(existsSync(join(publicDir, "journeys", "555.jpg"))).toBe(true);
    expect(
      JSON.parse(
        readFileSync(
          join(publicDir, "journeys", "imageId-extension.json"),
          "utf8",
        ),
      ),
    ).toEqual({ "555": "jpg" });
  });

  it("parses the trailing image number from journey art filenames", () => {
    expect(journeyImageIdFromFilename("any-prefix-123.png")).toEqual({
      imageNumber: "123",
      extension: "png",
    });
    expect(journeyImageIdFromFilename("unnumbered.png")).toBeNull();
  });
});
