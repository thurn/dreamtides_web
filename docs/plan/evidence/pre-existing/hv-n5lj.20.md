# Pre-existing issues found by hv-n5lj.20

- **Opening the battle log is one ~55 ms task in a development build.** The
  `log-reload` scenario (`artifacts/qa/hv-n5lj.20/log-reload.result.json`)
  recorded long tasks of 54–60 ms each time the log opened, on the seed-1
  Layer 1 battle at host load 3.4. The log's rebuild took 0 ms in each of
  them (`battle_engine_log_built` in `logs/journey-log.jsonl`), so the task
  is the dialog's render. A production build was not measured: the scenario
  reaches the battle through the development-only `?goto=battle`.
- **knip reports `getCurrentOffer`** (`src/draft/draft-engine.ts`) as an
  unused export at base `1cded70fd`.
