# hv-33id.16 observations

- The parent session's fresh-worktree `npm install` reported 17 audit findings: 9 moderate, 7 high, and 1 critical. Dependency updates are outside the declared-input boundary.
- The Phase 6 read-first list references `src/battle/tutorial-battle-controller.ts`, an unavailable path in this source base. The current tutorial controller hook and `src/rules/battle/tutorial-*.ts` provide the relevant engine setup and host context.
- Review workspace preparation reports missing optional art in its isolated local-assets directory, then restores the available local art successfully. Validation receipts retain the warnings; this internal refactor requires no browser artifacts.
