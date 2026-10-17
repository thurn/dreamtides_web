// The D97 save migrations, in schema order (decision P5).
//
// Schema version 1 is FROZEN (bead 1.16, the M1 milestone), with its golden
// fixture `../fixtures/d97-save-v1.json`, whose bytes a test pins. Every
// later change to persisted D97 state (the `d97` slice, a D97 battle, or the
// snapshot envelope) bumps `D97_SAVE_SCHEMA_VERSION`, appends one migration
// here from the previous version, and commits a new golden fixture of the
// new version; no fixture is ever regenerated. Milestone saves
// (`../fixtures/milestones/`) must keep loading through these migrations.
// Version 1 is the first, so none exist yet.

import type { D97SaveMigration } from "../migrate";

export const D97_SAVE_MIGRATIONS: readonly D97SaveMigration[] = [];
