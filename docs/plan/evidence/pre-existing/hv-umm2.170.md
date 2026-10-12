# Pre-existing observations for hv-umm2.170

- The Playwright sweep intermittently aborts navigation with `net::ERR_ABORTED` before the lab report, with empty error buffers and a healthy server. The same observation is recorded in `hv-umm2.80.md`. This invocation affected Lookout empowered/player and Harvester amplified/player. Fresh filtered invocations passed; original failed rows and raw reports remain in the QA ledger. The provider/navigation cause is undetermined, and no engine failure is established.
- Two timeout-only initial cells passed their runner-authorized fresh retries. All attempts remain in invocation `sweep-MM7hpz`; the final distinct-cell outcome is 32 pass, 28 ineligible skip, zero unresolved failure.
