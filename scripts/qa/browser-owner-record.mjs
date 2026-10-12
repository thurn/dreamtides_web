import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, linkSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** A local removal outcome, independent of provider execution completion. */
export class BrowserOwnerClearError extends Error {
  /** @param {"verify" | "unlink" | "directory-sync"} phase @param {unknown} cause */
  constructor(phase, cause) {
    let description = "unprintable clear cause";
    try { description = String(cause); } catch { /* Preserve the phase and original cause. */ }
    super(`browser owner clear failed at ${phase}: ${description}`, { cause });
    this.name = "BrowserOwnerClearError";
    this.phase = phase;
    this.unlinked = phase === "directory-sync";
  }
}

/** A producer's exact record, published while its browser kernel lock is held. */
export class BrowserOwnerRecord {
  /** @type {Buffer | null} */
  #published = null;

  /** @param {string} path */
  constructor(path) { this.path = path; }

  #verify() {
    if (this.#published === null) {
      if (existsSync(this.path)) throw new Error(`browser owner record already exists: ${this.path}`);
    } else if (!readFileSync(this.path).equals(this.#published)) {
      throw new Error(`browser owner record changed: ${this.path}`);
    }
  }

  #flushDirectory() {
    const fd = openSync(dirname(this.path), "r");
    try { fsyncSync(fd); } finally { closeSync(fd); }
  }

  /**
   * A staged file is complete and flushed before atomic publication. Initial
   * publication refuses collisions; replacement requires the exact owned
   * bytes. After publication the new bytes remain owned even if directory
   * flush fails, so failure cleanup protects the visible current record.
   * @param {Record<string, string | number | boolean>} owner
   */
  publish(owner) {
    this.#verify();
    const raw = Buffer.from(`${JSON.stringify(owner)}\n`);
    const temporary = `${this.path}.pending-${randomUUID()}`;
    let fd = /** @type {number | null} */ (null);
    let staged = false;
    try {
      fd = openSync(temporary, "wx", 0o600);
      staged = true;
      writeFileSync(fd, raw);
      fsyncSync(fd);
      closeSync(fd); fd = null;
      this.#verify();
      if (this.#published === null) linkSync(temporary, this.path);
      else renameSync(temporary, this.path);
      this.#published = raw;
      if (existsSync(temporary)) unlinkSync(temporary);
      this.#flushDirectory();
      this.#verify();
    } finally {
      try { if (fd !== null) closeSync(fd); }
      finally { if (staged && existsSync(temporary)) unlinkSync(temporary); }
    }
  }

  /** Removes only the producer's exact published bytes, then flushes the directory. */
  clear() {
    if (this.#published === null) return;
    try { this.#verify(); } catch (error) { throw new BrowserOwnerClearError("verify", error); }
    try { unlinkSync(this.path); } catch (error) { throw new BrowserOwnerClearError("unlink", error); }
    this.#published = null;
    try { this.#flushDirectory(); } catch (error) { throw new BrowserOwnerClearError("directory-sync", error); }
  }
}
