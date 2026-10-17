// The D97 save migrations, in schema order (decision P5). Every change to the
// persisted snapshot shape appends one migration from the previous version
// and commits a golden save fixture of the new version beside the frozen
// ones.

import type { D97SaveMigration } from "../migrate";
import { V1_TO_V2 } from "./v1-to-v2";

export const D97_SAVE_MIGRATIONS: readonly D97SaveMigration[] = [V1_TO_V2];
