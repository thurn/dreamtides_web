// @vitest-environment node

import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
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

interface ActorResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
}
interface Actor {
  readonly child: ChildProcess;
  readonly closed: Promise<ActorResult>;
}
const activeActors = new Set<Actor>();

async function stopActors(actors: Iterable<Actor>): Promise<void> {
  const owned = [...actors];
  for (const actor of owned) {
    if (actor.child.exitCode === null && actor.child.signalCode === null) {
      actor.child.kill("SIGKILL");
    }
  }
  await Promise.all(owned.map((actor) => actor.closed));
}

afterEach(async () => {
  await stopActors(activeActors);
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
    console.log(JSON.stringify({ assetFixtureRemoved: root }));
  }
});

async function atBarrier(marker: string, actor: Actor): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!existsSync(marker)) {
    if (actor.child.exitCode !== null || actor.child.signalCode !== null) {
      const result = await actor.closed;
      throw new Error(`Actor closed before barrier: ${result.stderr}`);
    }
    if (Date.now() >= deadline) throw new Error("Actor barrier deadline exceeded");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function actorFixture(root: string, paths: ReturnType<typeof defaultArtPaths>) {
  const marker = join(root, "paused");
  const release = join(root, "release");
  const actorFile = join(root, "actor.mjs");
  writeFileSync(actorFile, `
    import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    const [input, marker, release, mode, budget] = process.argv.slice(2);
    const { catalog, paths, linker } = JSON.parse(fs.readFileSync(input, "utf8"));
    const owner = process.ppid;
    const original = fs.symlinkSync;
    const originalWrite = fs.writeFileSync;
    const originalUnlink = fs.unlinkSync;
    const originalRename = fs.renameSync;
    const pause = () => {
      originalWrite(marker, "ready");
      const deadline = Date.now() + Number(budget);
      while (!fs.existsSync(release)) {
        if (process.ppid !== owner) throw new Error("Actor parent exited");
        if (Date.now() >= deadline) throw new Error("Actor barrier deadline exceeded");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
    };
    let first = true;
    fs.symlinkSync = (...args) => {
      if (mode === "link" && first) { first = false; pause(); }
      return original(...args);
    };
    fs.writeFileSync = (...args) => {
      if ((mode === "metadata" || mode === "restart" || mode === "kill") && String(args[0]).endsWith("imageId-extension.json")) {
        originalWrite(args[0], "{");
        if (mode === "restart") {
          originalWrite(marker, "ready");
          throw new Error("Interrupted metadata publication");
        }
        pause();
      }
      return originalWrite(...args);
    };
    fs.renameSync = (...args) => {
      if (mode === "stale" && String(args[1]).endsWith("cards/101.webp")) pause();
      return originalRename(...args);
    };
    fs.unlinkSync = (...args) => {
      if (mode === "prune" && String(args[0]).endsWith("nested.webp")) pause();
      const result = originalUnlink(...args);
      if (mode === "stale" && String(args[0]).endsWith("cards/101.webp")) pause();
      return result;
    };
    syncBuiltinESMExports();
    const { linkArt } = await import(linker);
    linkArt(catalog, paths);
  `);
  const input = join(root, "input.json");
  writeFileSync(input, JSON.stringify({ catalog: CATALOG, paths, linker: pathToFileURL(join(import.meta.dirname, "setup-assets.ts")).href }));
  const actors: Actor[] = [];
  const run = (mode: string, budget = 8_000): Actor => {
    const child = spawn(process.execPath, ["--import", "tsx", actorFile, input, marker, release, mode, String(budget)], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });
    const watchdog = setTimeout(() => child.kill("SIGKILL"), 10_000);
    const closed = new Promise<ActorResult>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => {
        clearTimeout(watchdog);
        activeActors.delete(actor);
        console.log(JSON.stringify({ assetActor: mode, pid: child.pid, exit: code, signal }));
        resolve({ code, signal, stderr });
      });
    });
    const actor: Actor = { child, closed };
    actors.push(actor);
    activeActors.add(actor);
    return actor;
  };
  return { marker, release, actors, run };
}

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

  it("preserves a desired-path regular file on conflict and recovers on the next pass", () => {
    const filename = "0007.png";
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

  it("preserves harmless foreign files and foreign-containing directories during refresh", () => {
    const root = fixtureRoot();
    const paths = defaultArtPaths(join(root, "repo"), join(root, "home"));
    const source = join(paths.imageCacheDir, imageCacheFileName(101));
    touch(source);
    linkArt(CATALOG, paths);
    const foreign = join(paths.publicDir, "cards", ".DS_Store");
    const nested = join(paths.publicDir, "cards", "foreign", "notes.txt");
    touch(foreign);
    touch(nested);
    const obsolete = join(paths.publicDir, "cards", "foreign", "old.webp");
    symlinkSync(source, obsolete);
    linkArt(CATALOG, paths);
    expect(readFileSync(foreign, "utf8")).toBe("art");
    expect(readFileSync(nested, "utf8")).toBe("art");
    expect(() => readlinkSync(obsolete)).toThrow();
    expect(readlinkSync(join(paths.publicDir, "cards", "101.webp"))).toBe(source);
  });

  it.each(["link", "metadata", "restart", "prune", "stale", "kill"])("preserves published assets and recovers across %s interleaving", async (mode) => {
    const root = fixtureRoot();
    const paths = defaultArtPaths(join(root, "repo"), join(root, "home"));
    const cardSource = join(paths.imageCacheDir, imageCacheFileName(101));
    touch(cardSource);
    touch(join(paths.avatarArtDir, "cutout", "0007.png"));
    touch(join(paths.journeyArtDir, "dream-555.jpg"));
    touch(join(paths.explorationHighResArtDir, "101.jpg"));
    linkArt(CATALOG, paths);
    const cardLink = join(paths.publicDir, "cards", "101.webp");
    let staleSource: string | undefined;
    if (mode === "stale") {
      staleSource = join(root, "old-art");
      touch(staleSource);
      rmSync(cardLink);
      symlinkSync(staleSource, cardLink);
    }
    const obsoleteDir = join(paths.publicDir, "cards", "obsolete");
    mkdirSync(obsoleteDir);
    symlinkSync(cardSource, join(obsoleteDir, "nested.webp"));
    const fixture = actorFixture(root, paths);
    const first = fixture.run(mode);
    let interruptedStaging: string | undefined;
    try {
      await atBarrier(fixture.marker, first);
      if (mode === "restart") await first.closed;
      if (mode === "kill") {
        first.child.kill("SIGKILL");
        expect((await first.closed).signal).toBe("SIGKILL");
        expect(readdirSync(paths.publicDir).filter((name) => name.startsWith(".art-links-"))).toEqual([]);
        const stagingRoot = join(paths.publicDir, "..", ".generated", "art-links");
        const interruptedPasses = readdirSync(stagingRoot);
        expect(interruptedPasses).toHaveLength(1);
        interruptedStaging = join(stagingRoot, interruptedPasses[0], "imageId-extension.json");
        expect(readFileSync(interruptedStaging, "utf8")).toBe("{");
      }
      const publishedDuringPause = existsSync(cardLink);
      const targetDuringPause = mode === "stale" ? readlinkSync(cardLink) : undefined;
      const metadataFile = join(paths.publicDir, "journeys", "imageId-extension.json");
      const metadataDuringPause = readFileSync(metadataFile, "utf8");
      const second = fixture.run("no");
      const other = await second.closed;
      expect(other.code, other.stderr).toBe(0);
      writeFileSync(fixture.release, "continue");
      const completed = await first.closed;
      if (mode !== "kill") expect(completed.code, completed.stderr).toBe(mode === "restart" ? 1 : 0);
      expect(publishedDuringPause).toBe(true);
      if (mode === "stale") expect(targetDuringPause).toBe(staleSource);
      expect(existsSync(obsoleteDir)).toBe(false);
      expect(JSON.parse(metadataDuringPause)).toEqual({ "555": "jpg" });
      expect(readlinkSync(cardLink)).toBe(cardSource);
      expect(readlinkSync(join(paths.publicDir, "avatars", "cutout", "0007.png"))).toBe(join(paths.avatarArtDir, "cutout", "0007.png"));
      expect(readlinkSync(join(paths.publicDir, "exploration", "101.jpg"))).toBe(join(paths.explorationHighResArtDir, "101.jpg"));
      expect(readlinkSync(join(paths.publicDir, "journeys", "555.jpg"))).toBe(join(paths.journeyArtDir, "dream-555.jpg"));
      expect(JSON.parse(readFileSync(metadataFile, "utf8"))).toEqual({ "555": "jpg" });
      if (interruptedStaging !== undefined) {
        expect(readFileSync(interruptedStaging, "utf8")).toBe("{");
        expect(readdirSync(paths.publicDir).filter((name) => name.startsWith(".art-links-"))).toEqual([]);
      }
    } finally {
      await stopActors(fixture.actors);
    }
  });

  it("contains a paused actor when its owner fails before release", async () => {
    const root = fixtureRoot();
    const paths = defaultArtPaths(join(root, "repo"), join(root, "home"));
    touch(join(paths.imageCacheDir, imageCacheFileName(101)));
    const fixture = actorFixture(root, paths);
    const actor = fixture.run("link");
    await expect((async () => {
      try {
        await atBarrier(fixture.marker, actor);
        throw new Error("Artificial owner failure");
      } finally {
        await stopActors(fixture.actors);
      }
    })()).rejects.toThrow("Artificial owner failure");
    expect((await actor.closed).signal).toBe("SIGKILL");
    expect(() => process.kill(actor.child.pid!, 0)).toThrow();
    expect(existsSync(fixture.release)).toBe(false);
  });

  it("closes a paused actor when its own barrier deadline expires", async () => {
    const root = fixtureRoot();
    const paths = defaultArtPaths(join(root, "repo"), join(root, "home"));
    touch(join(paths.imageCacheDir, imageCacheFileName(101)));
    const fixture = actorFixture(root, paths);
    const actor = fixture.run("link", 0);
    try {
      const closed = await actor.closed;
      expect(closed.code).toBe(1);
      expect(closed.stderr).toContain("Actor barrier deadline exceeded");
      expect(existsSync(fixture.marker)).toBe(true);
      expect(() => process.kill(actor.child.pid!, 0)).toThrow();
      expect(existsSync(fixture.release)).toBe(false);
    } finally {
      await stopActors(fixture.actors);
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
