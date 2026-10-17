// The D97 save migrations, in schema order (decision P5). Every change to the
// persisted snapshot shape appends one migration from the previous version
// and regenerates the golden save fixture of that version. Schema version 1
// is the first, so none exist yet.

import type { D97SaveMigration } from "../migrate";

export const D97_SAVE_MIGRATIONS: readonly D97SaveMigration[] = [];
