// The D97 stamp catalog (decision P12): every named LPC chunk a map recipe's
// `stamp` operation can place, one module per stamp in this directory
// (`<name>-<id prefix>.ts`, default-exporting a `defineD97Stamp` value).
// `npm run d97:map -- stamps extract` writes new modules here; list each one
// below to add it to the catalog, and `npm run d97:map -- stamps list` prints
// it.

import type { D97CatalogStamp } from "../../../d97/map/stamps";

export const D97_STAMPS: readonly D97CatalogStamp[] = [];
