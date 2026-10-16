# Retained-query reset verification

Base: `c6a2f3fbc25d6a7b89cf112d3c1bc9d079148068`. Owned implementation is App QA bootstrap/loading eligibility and its existing rendered behavior owner. Reducer, RESET intent, front door, URL sync, QA scene builders, shared runner/prelude, content, copy and layout remain source-identical to the base. No fallout area was needed.

## Rendered contracts

`src/App.test.tsx` remains the only test entry. The narrow confirmed-head hook fixture and existing router stand-in expose rendered loading versus journey screens. Synthetic fixtures cover fresh loading with one bootstrap, confirmed scene readiness, reset during the same mount, saved reset on a new mount, ordinary entry and the start-scene exemption. Assertions use DOM attributes and mutation calls, with no product-copy assertion. The file has four additional expanded cases, zero additional files or jsdom files; net test lines are recorded in the structured measurement.

The regression epoch retains unchanged App bytes: focused-red-v01 exits 1 with exactly the same-mount reset and saved-reset rendered assertions failing, seven cases passing. The repaired focused-green-v01 exits 0 with all nine cases passing. Pre/post immutable source snapshots, exact base bytes, hashes, complete command output, UTC/monotonic/process-group/load/CPU receipts are retained under the ignored QA root. Final checks are additive epochs.

## Browser observations

The supported scenario runner serves this owned checkout through its isolated Playwright MCP context. v01 passes desktop 1440×900 and mobile 390×844. Each uses actual rendered New Journey and records an applied native RESET_JOURNEY at event sequence 2; desktop game ix3zci and mobile game 34ai5c retain goto=journeyfailed and their game IDs through Avatar entry and same-game reload. Each records one applied LOAD_STATE before and after reload and empty Caps. v01's optional avatarOffers observation uses an absent data-avatar-id attribute and returns zero; that field proves no offer count. v02 adds explicit choice-surface assertions and fresh-document timing without changing invoked v01 bytes.

All three v01 captures were actually viewed. retained-reset-v01-desktop-before.png shows the terminal scene and visible New Journey action; retained-reset-v01-desktop-avatar.png shows three rendered choices; retained-reset-v01-mobile-avatar.png shows the active portrait and visible Choose action. Desktop files are 2880×1800 and mobile is 780×1688 (2× CSS viewport). The measured desktop journey wrapper is 1440×917.59375 with choice actions inside the 900px viewport; the mobile wrapper is 390×844. Document widths equal the CSS viewport widths. These are bounded reset-entry observations; no layout change, native dialog painting, broader gameplay, production build or performance claim is made.

## Custody and completion

QA evidence lives only in the primary checkout's ignored hv-umm2.763 capture area. Invoked recipes are versioned and immutable. Source manifests preserve the exact changed App/test bytes and unchanged protected inputs before dispatch, with post-dispatch comparisons. Browser server process groups, ports, client teardown, command receipts and final custody are recorded in the structured measurement and ignored receipt bundle. The native-claim-to-pre-Git interval includes all research, coordination, preparation, waits and verification; actual commit return is an additive ignored tail receipt.

## Final validation and stronger browser acceptance

Additive v02 (run-tg0EVP) passes both viewports: desktop game 25bfev and mobile game 8ah6un each apply native RESET_JOURNEY event2, keep game/goto, and render actual data-choose-avatar offers (3 desktop, 1 active mobile) with enabled choice buttons in the viewport after reset and reload. Their initial/reset/reload applied LOAD_STATE counts are exactly 1/1/1. Reload changes performance.timeOrigin and the navigation diagnostics record the new document. Caps remain empty. v02 adds no captures.

The first repository review exits2 after17.585s: the new test fixture used Array.at beyond the configured JavaScript target, with resulting unsafe type errors and a thenable act return. This is an owned fixture error, retained in review-final-v01 stdout and immutable source epoch. An indexed root lookup and block callback satisfy the configured contract. App bytes match the browser-tested bytes. Final focused-v02 passes9/9 in5.829s, final review-v02 passes in15.521s, and Knip passes in4.533s. No full-suite, fuzz or production check is required for this bounded App predicate and existing test-fixture change. Every source epoch's pre/post hashes match.

The test delta is zero files, zero jsdom files, four expanded cases and net106 lines. Browser-v01/v02 outer walls are18.423s/15.930s; browser slot waits are7ms/5ms, with no heavy slot. Final review's starting one-minute load is7.73. Validation totals in friction include negative attempts and earlier focused passes, without adding wrapper internals again.

Runtime settlement retains empty groups for owned servers77916 and23586 and no listener on5274. Each runner's stderr reports normal port-free cleanup; every outer command group is settled. The browser clients are owned and closed by the supported runner; the shared service and other owners were untouched. The real native-claim-to-pre-Git cutoff and all detailed receipt paths are in the structured measurement; final schema and actual Git return are additive ignored tail evidence.
