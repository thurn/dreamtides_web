# Tournament hv-fy5h-2-smoke

Status: complete; 2/2 completed games; 0 failed attempts.

Seed: `hv-fy5h.2-smoke`. Pool SHA-256: `200c84dc9c988d0306575337349ac608cf045a6a6ab58d9538d12532a2d02ae1`. Source SHA-256: `93a860a3b27bebff308c2247dd0a35af3b5ab32cd5ed96a847147d0081154a55`. Outcomes SHA-256: `8fda4b26bbdb9807ae681d8636acb739f8e31011ec280213a7bd7b7b359702de`.

Iteration-only budgets: planning 256, response 64. Each pair exchanges policies on the same deck seats, battle seed and starting seat.

Win rate is (wins + ½ draws)/games; Wilson 95% intervals use fractional successes for draws and treat games as observations. Paired observations are correlated; the interval is descriptive. Failures and unfinished games contribute zero observations.

| Policy | Games | W/D/L | Win rate | Wilson 95% CI |
| --- | ---: | --- | ---: | --- |
| random | 2 | 1/0/1 | 50.00% | 9.45%–90.55% |
| greedy | 2 | 1/0/1 | 50.00% | 9.45%–90.55% |

Elo estimates across all policies played (random, greedy): random 1500.00, greedy 1500.00. Two-policy Bradley–Terry/logistic fit, 400-point scale, mean 1500, 1 symmetric prior game(s) per matchup. This prior makes perfect-score estimates finite; the ratings are relative to this dataset.

| Split / policy | Games | W/D/L | Win rate | Wilson 95% CI |
| --- | ---: | --- | ---: | --- |
| layer 0 / random | 2 | 1/0/1 | 50.00% | 9.45%–90.55% |
| archetype 1d341e34-6f81-4ddd-8582-cb2e06db4803 / random | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |
| archetype 568c305c-6884-4dff-b1ec-c08f387a6527 / random | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |
| archetype 5bf0efa1-1024-47ed-bd4a-a5dc13ca2ba0 / random | 1 | 1/0/0 | 100.00% | 20.65%–100.00% |
| archetype 69d696b6-c7aa-460a-8868-a5fa70930c45 / random | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |
| archetype 77765ea3-16fb-4ab7-9f4f-4610f2f04d9f / random | 1 | 1/0/0 | 100.00% | 20.65%–100.00% |
| archetype 93314ceb-4c33-45e0-8ee3-c53d6e6ea21e / random | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |
| archetype b2b1b0da-6d48-40cb-9d44-f0a94f0615f5 / random | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |
| archetype cf1f7e7c-f9e9-4f83-9ff5-6edc8a916277 / random | 1 | 1/0/0 | 100.00% | 20.65%–100.00% |
| archetype e1620ab4-7e68-4a57-a6eb-d7a3380c4dc5 / random | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |
| archetype eb397537-8a0b-4969-924b-baee5137094c / random | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |
| archetype f32bd479-615a-45f0-8c59-0dc793899f7b / random | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |
| layer 0 / greedy | 2 | 1/0/1 | 50.00% | 9.45%–90.55% |
| archetype 1d341e34-6f81-4ddd-8582-cb2e06db4803 / greedy | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |
| archetype 568c305c-6884-4dff-b1ec-c08f387a6527 / greedy | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |
| archetype 5bf0efa1-1024-47ed-bd4a-a5dc13ca2ba0 / greedy | 1 | 1/0/0 | 100.00% | 20.65%–100.00% |
| archetype 69d696b6-c7aa-460a-8868-a5fa70930c45 / greedy | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |
| archetype 77765ea3-16fb-4ab7-9f4f-4610f2f04d9f / greedy | 1 | 1/0/0 | 100.00% | 20.65%–100.00% |
| archetype 93314ceb-4c33-45e0-8ee3-c53d6e6ea21e / greedy | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |
| archetype b2b1b0da-6d48-40cb-9d44-f0a94f0615f5 / greedy | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |
| archetype cf1f7e7c-f9e9-4f83-9ff5-6edc8a916277 / greedy | 1 | 1/0/0 | 100.00% | 20.65%–100.00% |
| archetype e1620ab4-7e68-4a57-a6eb-d7a3380c4dc5 / greedy | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |
| archetype eb397537-8a0b-4969-924b-baee5137094c / greedy | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |
| archetype f32bd479-615a-45f0-8c59-0dc793899f7b / greedy | 1 | 0/0/1 | 0.00% | 0.00%–79.35% |

Archetype splits use the piloted deck's joined tide UUIDs. They overlap: one deck may appear in multiple splits. Layer splits use the piloted deck's Atlas layer.

Mean decision time: 20.603 ms across 150 policy decisions; forced actions are excluded.

Batch host load and lifecycle provenance:

```json
[
  {
    "event": "tournament.batch",
    "timestamp": "2026-10-12T20:07:32.475Z",
    "stage": "start",
    "detail": {
      "pid": 17509,
      "host": "JARVIS.local",
      "platform": "darwin",
      "node": "v24.16.0",
      "workers": 2,
      "batchMs": 1800000,
      "load": [
        4.00341796875,
        8.29248046875,
        11.08447265625
      ],
      "pending": 2
    },
    "recordHash": "3cb89749029a27d8b7c1150f92a444166da885bdb5d937369aa9cc4ecfc71a19"
  },
  {
    "event": "tournament.batch",
    "timestamp": "2026-10-12T20:07:36.413Z",
    "stage": "end",
    "detail": {
      "startedAt": "2026-10-12T20:07:32.481Z",
      "endedAt": "2026-10-12T20:07:36.413Z",
      "elapsedMs": 3931.061125,
      "reason": "complete",
      "failure": null,
      "workers": 2,
      "completed": 2,
      "unfinishedOrdinals": [],
      "host": {
        "start": [
          4.00341796875,
          8.29248046875,
          11.08447265625
        ],
        "totalMemory": 68719476736,
        "freeMemory": 10460758016,
        "end": [
          4.00341796875,
          8.29248046875,
          11.08447265625
        ],
        "freeMemoryEnd": 8921792512
      }
    },
    "recordHash": "b322da76166bcce131f81f8e1ebc5c9b5cf13ff3fcf1208df0cfa9837186b51d"
  }
]
```
