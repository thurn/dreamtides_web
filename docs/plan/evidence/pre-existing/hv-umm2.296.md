# hv-umm2.296 pre-existing issues

Seen at staging `9fa16b17d` while fixing the card sweep's command and recipe.

- **Card-sweep runs fail intermittently under host load.** In the
  hv-umm2.49 re-sweep at load ~10, one run failed with the execution context
  destroyed by a navigation (`inspired`) and one timed out waiting for the
  card-lab report (`hastened`); both passed on an immediate re-run. Neither
  failure comes from `scripts/qa/card-sweep.mjs`: it runs each variant as a
  fresh `card-lab-play` scenario through one runner session and only records
  the result. The failing waits live in
  `scripts/qa/scenarios/card-lab-play.mjs` (`wait`, polled with
  `page.evaluate` and bounded by the run's `--timeout`) and the runner's
  navigation handling in `scripts/qa/prelude.mjs`. A likely cause of the
  navigation is the Vite dev server reloading the page (for example after
  optimizing a newly discovered dependency) while the scenario evaluates;
  the pilot's server log was overwritten by the next run, so this is
  unconfirmed. This bead's 20-verdict sweep at load ~26 had no such failure.
