# Developer QA query can mask a completed reset

The existing `App.tsx` developer-scene loading gate checks a configured `goto` scene and a null Avatar (`241–263`). Its bootstrap effect runs once per mount (`81–117`). After a real `RESET_JOURNEY` clears the Avatar, a retained `goto=journeyfailed` query satisfies that loading gate while the bootstrap is already spent.

Result-QA attempt 6 records public `RESET_JOURNEY` sequence 4 with outcome `applied`, followed by `journey_url_synced` for `/` and `journeyStart`; the Avatar selector remains hidden by the QA loading screen. The existing reset body (`lifecycle.ts:401–407`) preserves the front door. Both actual Avatar layouts expose `data-choose-avatar`. The witness is `run-21qEEg/qa-journey-draw-desktop.jsonl`; this is a developer QA route issue, not a failed journey reset.

The successful public QA workflow removes only `goto` before reloading the same game, retaining and checking `game`, seed and debug parameters. It then exercises the actual New Journey action and Avatar screen on desktop and mobile. This bead records the existing gate behavior and makes no change to its implementation.
