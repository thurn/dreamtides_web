# Pre-existing findings for hv-umm2.212

- Fresh installation reports 17 dependency vulnerabilities (9 moderate, 7 high, 1 critical). Dependency configuration is outside this bead's scope.
- At base `23353bd06fa6aaef34bfe1ccdfd0d36f735f3954`, the shared `qa.capture` helper uses CSS-pixel capture at device pixel ratio 2. The bead-local native scenario additionally uses the owned page's supported device-scale screenshot option for full-viewport 2× evidence. The shared default is owned by hv-umm2.557; this bead does not edit QA infrastructure.
