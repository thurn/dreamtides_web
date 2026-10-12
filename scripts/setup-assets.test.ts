// @vitest-environment node

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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

  it("refreshes stale links, prunes missing art, and preserves Exploration priority", () => {
    const root = fixtureRoot();
    const paths = defaultArtPaths(join(root, "repo"), join(root, "home"));
    const cardSource = join(paths.imageCacheDir, imageCacheFileName(101));
    touch(cardSource);
    touch(join(paths.explorationSourceArtDir, "source-101.jpg"));
    touch(join(paths.explorationTaggedArtDir, "tag", "tagged-101.jpg"));
    touch(join(paths.journeyArtDir, "dream-555.jpg"));
    linkArt(CATALOG, paths);
    expect(readlinkSync(join(paths.publicDir, "exploration", "101.jpg"))).toBe(join(paths.explorationSourceArtDir, "source-101.jpg"));
    const cardLink = join(paths.publicDir, "cards", "101.webp");
    rmSync(cardLink);
    symlinkSync(join(root, "missing-old-art"), cardLink);
    symlinkSync(cardSource, join(paths.publicDir, "cards", "obsolete.webp"));
    touch(join(paths.explorationHighResArtDir, "101.jpg"));
    rmSync(join(paths.journeyArtDir, "dream-555.jpg"));
    touch(join(paths.journeyArtDir, "dream-777.png"));

    linkArt(CATALOG, paths);

    expect(readlinkSync(cardLink)).toBe(cardSource);
    expect(existsSync(join(paths.publicDir, "cards", "obsolete.webp"))).toBe(false);
    expect(readlinkSync(join(paths.publicDir, "exploration", "101.jpg"))).toBe(
      join(paths.explorationHighResArtDir, "101.jpg"),
    );
    expect(() => readlinkSync(join(paths.publicDir, "journeys", "555.jpg"))).toThrow();
    expect(JSON.parse(readFileSync(join(paths.publicDir, "journeys", "imageId-extension.json"), "utf8"))).toEqual({ "777": "png" });
    rmSync(cardSource);
    linkArt(CATALOG, paths);
    expect(() => readlinkSync(cardLink)).toThrow();
    rmSync(join(paths.explorationHighResArtDir, "101.jpg"));
    rmSync(join(paths.explorationSourceArtDir, "source-101.jpg"));
    linkArt(CATALOG, paths);
    expect(readlinkSync(join(paths.publicDir, "exploration", "101.jpg"))).toBe(join(paths.explorationTaggedArtDir, "tag", "tagged-101.jpg"));
    touch(join(paths.explorationTaggedArtDir, "other", "duplicate-101.jpg"));
    linkArt(CATALOG, paths);
    expect(() => readlinkSync(join(paths.publicDir, "exploration", "101.jpg"))).toThrow();
  });

  it.each(["0007.png", "foreign.txt"])("preserves an unrelated %s file on conflict and recovers on the next pass", (filename) => {
    const root = fixtureRoot();
    const paths = defaultArtPaths(join(root, "repo"), join(root, "home"));
    touch(join(paths.imageCacheDir, imageCacheFileName(101)));
    touch(join(paths.avatarArtDir, "0007.png"));
    const conflict = join(paths.publicDir, "avatars", filename);
    touch(conflict);
    expect(() => linkArt(CATALOG, paths)).toThrow();
    expect(readFileSync(conflict, "utf8")).toBe("art");
    rmSync(conflict);
    linkArt(CATALOG, paths);
    expect(readlinkSync(join(paths.publicDir, "avatars", "0007.png"))).toBe(join(paths.avatarArtDir, "0007.png"));
    expect(readlinkSync(join(paths.publicDir, "cards", "101.webp"))).toBe(join(paths.imageCacheDir, imageCacheFileName(101)));
  });

  it.each(["link", "metadata", "restart", "prune"])("preserves published assets and recovers across %s interleaving", async (mode) => {
    const root = fixtureRoot();
    const paths = defaultArtPaths(join(root, "repo"), join(root, "home"));
    touch(join(paths.imageCacheDir, imageCacheFileName(101)));
    touch(join(paths.avatarArtDir, "cutout", "0007.png"));
    touch(join(paths.journeyArtDir, "dream-555.jpg"));
    touch(join(paths.explorationHighResArtDir, "101.jpg"));
    linkArt(CATALOG, paths);
    const obsoleteDir = join(paths.publicDir, "cards", "obsolete");
    mkdirSync(obsoleteDir);
    symlinkSync(join(paths.imageCacheDir, imageCacheFileName(101)), join(obsoleteDir, "nested.webp"));
    const marker = join(root, "paused");
    const release = join(root, "release");
    const actorFile = join(root, "actor.mjs");
    writeFileSync(actorFile, `
      import fs from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      const [input, marker, release, paused] = process.argv.slice(2);
      const { catalog, paths, linker } = JSON.parse(fs.readFileSync(input, "utf8"));
      const original = fs.symlinkSync;
      const originalWrite = fs.writeFileSync;
      const originalUnlink = fs.unlinkSync;
      const pause = () => {
        originalWrite(marker, "ready");
        while (!fs.existsSync(release)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      };
      let first = true;
      fs.symlinkSync = (...args) => {
        if (paused === "link" && first) {
          first = false;
          pause();
        }
        return original(...args);
      };
      fs.writeFileSync = (...args) => {
        if ((paused === "metadata" || paused === "restart") && String(args[0]).endsWith("imageId-extension.json")) {
          originalWrite(args[0], "{");
          if (paused === "restart") {
            originalWrite(marker, "ready");
            throw new Error("Interrupted metadata publication");
          }
          pause();
        }
        return originalWrite(...args);
      };
      fs.unlinkSync = (...args) => {
        if (paused === "prune" && String(args[0]).endsWith("nested.webp")) pause();
        return originalUnlink(...args);
      };
      syncBuiltinESMExports();
      const { linkArt } = await import(linker);
      linkArt(catalog, paths);
    `);
    const input = join(root, "input.json");
    writeFileSync(input, JSON.stringify({ catalog: CATALOG, paths, linker: pathToFileURL(join(import.meta.dirname, "setup-assets.ts")).href }));
    const actors: ReturnType<typeof spawn>[] = [];
    const runActor = (paused: boolean) => {
      const child = spawn(process.execPath, ["--import", "tsx", actorFile, input, marker, release, paused ? mode : "no"], { stdio: ["ignore", "ignore", "pipe"] });
      actors.push(child);
      let stderr = "";
      child.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });
      return new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) => {
          console.log(JSON.stringify({ assetActor: mode, pid: child.pid, exit: code }));
          resolve({ code, stderr });
        });
      });
    };
    const first = runActor(true);
    const deadline = Date.now() + 10_000;
    let second: ReturnType<typeof runActor> | undefined;
    try {
      while (!existsSync(marker)) {
        if (actors[0].exitCode !== null || Date.now() > deadline) throw new Error("Paused actor exited before the barrier");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      if (mode === "restart") await first;
      const publishedDuringPause = existsSync(join(paths.publicDir, "cards", "101.webp"));
      const metadataFile = join(paths.publicDir, "journeys", "imageId-extension.json");
      const metadataDuringPause = existsSync(metadataFile) ? readFileSync(metadataFile, "utf8") : undefined;
      second = runActor(false);
      const other = await second;
      expect(other.code, other.stderr).toBe(0);
      writeFileSync(release, "continue");
      const completed = await first;
      expect(completed.code, completed.stderr).toBe(mode === "restart" ? 1 : 0);
      expect(publishedDuringPause).toBe(true);
      expect(existsSync(obsoleteDir)).toBe(false);
      expect(JSON.parse(metadataDuringPause ?? "null")).toEqual({ "555": "jpg" });
      expect(readlinkSync(join(paths.publicDir, "cards", "101.webp"))).toBe(join(paths.imageCacheDir, imageCacheFileName(101)));
      expect(readlinkSync(join(paths.publicDir, "avatars", "cutout", "0007.png"))).toBe(join(paths.avatarArtDir, "cutout", "0007.png"));
      expect(readlinkSync(join(paths.publicDir, "exploration", "101.jpg"))).toBe(join(paths.explorationHighResArtDir, "101.jpg"));
      expect(readlinkSync(join(paths.publicDir, "journeys", "555.jpg"))).toBe(join(paths.journeyArtDir, "dream-555.jpg"));
      expect(JSON.parse(readFileSync(join(paths.publicDir, "journeys", "imageId-extension.json"), "utf8"))).toEqual({ "555": "jpg" });
    } finally {
      writeFileSync(release, "continue");
      await Promise.allSettled([first, ...(second === undefined ? [] : [second])]);
    }
  });

  it("parses the trailing image number from journey art filenames", () => {
    expect(journeyImageIdFromFilename("any-prefix-123.png")).toEqual({
      imageNumber: "123",
      extension: "png",
    });
    expect(journeyImageIdFromFilename("unnumbered.png")).toBeNull();
  });
});
