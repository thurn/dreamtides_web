# hv-umm2.290 pre-existing observations

The parent installation completed successfully and reported 17 dependency audit observations. No dependency changes or audit fixes are part of this bead.

The ephemeral Node seed-selection caller encountered Vite-only `import.meta.env.DEV` access through `qa-scenes.ts` and `session/genesis.ts`. Both failed before seed selection or game execution; the preserved `select-seeds` and `select-seeds-v2` receipts carry zero game credit. The successful Node caller consumes the public QA foundation and parses the documented `url-seed:<n>` seed directly. Browser QA uses the unchanged public `battle7` scene in Vite. No source repair is claimed or needed for this browser-owned API.
