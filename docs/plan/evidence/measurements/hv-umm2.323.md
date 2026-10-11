# hv-umm2.323: QA helper validation

- Base: ee565a839d3e93853622b622b7c37b27b3770ab2.
- Twelve Node contracts cover navigation recovery, installed-script error forwarding, ignored resource failures, error occurrence counting, allowed navigation resets, viewport-image readiness, and stale side/zone rejection before submission.
- Final `npm run review:full`: 219 files and 2729 tests pass, with full lint, both typechecks, import cycles, Knip, and the production-bundle check. Test phase 33.0 s; full lint 25.4 s. Host load sampled at completion: 13.52. `npm run review` and `npm run knip` pass.
- Smoke passed with an empty error buffer: 38.5 s browser time, 39.8 s total, host load 5.37. Captures: smoke-dev-front-door.png, smoke-dev-battle-start.png, smoke-dev-after-ai-turn.png (1440×900).
- Small sweep passed 4/4 cases in 29 s at load 5.37: one vanilla character and one Discover event, base variant, player and enemy. Verdicts are in this bead's QA ledger.
- Lab staging passed on desktop and mobile: three additions per viewport (player hand, enemy play, player void), each checked against the committed instance. Empty error buffers; 25.8 s browser time, 27.1 s total, load 15.67. Captures: card-lab-stage-desktop.png (1440×900), card-lab-stage-mobile.png (390×844).
- Captures were checked for dimensions and visual legibility; the source tree contains no image additions.
- Runtime ledger: server process groups 12838 (smoke), 14946 (sweep), and 17364 (staging), each on port 5174, stopped with the port free. Each runner closed its own MCP browser context.
