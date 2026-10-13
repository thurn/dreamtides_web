# hv-33id.2 inherited test triage

At base `7230493fc2c37ad8289284cdd3e3cbb1aaede897`, `src/rules/battle/tutorial-guidance.test.ts` includes a production yellow-term coverage assertion against card, Dreamwell, Avatar, figment and tutorial catalogs. The final source audit observed that inherited assertion. It conflicts with the current requirement for synthetic observable CI contracts and the parent's D19 disposition of the historical coverage inventory.

The authorized Phase 6.1 test pruning owns this repair: keep the four synthetic matcher cases and prune the production copy/catalog coverage case plus its orphan imports. The affected matcher receipt passes four tests; final `local-review-quick-12` passes 5,173 tests in 298 files plus types/lint/cycles, followed by clean Knip06. Product runtime bytes match the Full02/browser-acceptance03 freeze. This is a repaired inherited test issue, not an unverified runtime defect.

The raised mobile hand in diagnostic04 has an independently measured harness cause: its tap helper scrolls the near-hand ancestor by47 pixels; normal pointer input leaves that ancestor at0. The diagnostic is retained as harness evidence and is not classified as a pre-existing product defect.
