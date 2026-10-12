# Tournament hv-fy5h-2-random-greedy-repeat

Status: complete; 200/200 completed games; 0 failed attempts.

Seed: `hv-fy5h.2-acceptance`. Pool SHA-256: `5d484ac84fe58fd18e40fe32d55ddfad4f548fe1d29e88f8792108074cd2fa48`. Source SHA-256: `2487549ff3288e94cb2b4e0f1a1fb0c3f60076bc82c47ac8956c72ea2bac4b4f`. Outcomes SHA-256: `5316f8332953d03c7d0b77b7fef3f62c66561a7143e99293c474174a1f8051d2`.

Iteration-only budgets: planning 256, response 64. Each pair exchanges policies on the same deck seats, battle seed and starting seat.

Win rate is (wins + ½ draws)/games; Wilson 95% intervals use fractional successes for draws and treat games as observations. Paired observations are correlated; the interval is descriptive. Failures and unfinished games contribute zero observations.

| Policy | Games | W/D/L | Win rate | Wilson 95% CI |
| --- | ---: | --- | ---: | --- |
| random | 200 | 115/0/85 | 57.50% | 50.57%–64.15% |
| greedy | 200 | 85/0/115 | 42.50% | 35.85%–49.43% |

Elo estimates across all policies played (random, greedy): random 1526.12, greedy 1473.88. Two-policy Bradley–Terry/logistic fit, 400-point scale, mean 1500, 1 symmetric prior game(s) per matchup. This prior makes perfect-score estimates finite; the ratings are relative to this dataset.

| Split / policy | Games | W/D/L | Win rate | Wilson 95% CI |
| --- | ---: | --- | ---: | --- |
| layer 0 / random | 30 | 11/0/19 | 36.67% | 21.87%–54.49% |
| layer 1 / random | 30 | 18/0/12 | 60.00% | 42.32%–75.41% |
| layer 2 / random | 28 | 13/0/15 | 46.43% | 29.53%–64.19% |
| layer 3 / random | 28 | 16/0/12 | 57.14% | 39.07%–73.49% |
| layer 4 / random | 28 | 21/0/7 | 75.00% | 56.64%–87.32% |
| layer 5 / random | 28 | 20/0/8 | 71.43% | 52.94%–84.75% |
| layer 6 / random | 28 | 16/0/12 | 57.14% | 39.07%–73.49% |
| archetype 09b9b56c-6356-40aa-bcd8-77b0c80d3835 / random | 10 | 5/0/5 | 50.00% | 23.66%–76.34% |
| archetype 0ab905a2-4c1c-410e-bbbb-4460c85f95e5 / random | 5 | 4/0/1 | 80.00% | 37.55%–96.38% |
| archetype 0ac06270-f783-4c4f-bfd9-4109d22316e0 / random | 5 | 2/0/3 | 40.00% | 11.76%–76.93% |
| archetype 14f8ed05-e684-407c-be32-1dc970d69f36 / random | 9 | 7/0/2 | 77.78% | 45.26%–93.68% |
| archetype 157bf4fe-b3d9-4919-9bf2-948002bc3742 / random | 14 | 11/0/3 | 78.57% | 52.41%–92.43% |
| archetype 1864823a-8d44-4bad-8bc0-bf2360eac68a / random | 9 | 0/0/9 | 0.00% | 0.00%–29.91% |
| archetype 1a075e25-0344-4103-997c-dd8f8a57c84e / random | 7 | 4/0/3 | 57.14% | 25.05%–84.18% |
| archetype 1ad97f42-6157-45b3-8290-e27219c7888a / random | 6 | 3/0/3 | 50.00% | 18.76%–81.24% |
| archetype 1d341e34-6f81-4ddd-8582-cb2e06db4803 / random | 14 | 11/0/3 | 78.57% | 52.41%–92.43% |
| archetype 3bdfa6f6-b4f5-4a35-b5c0-ea76727eeea3 / random | 8 | 7/0/1 | 87.50% | 52.91%–97.76% |
| archetype 4b01b6c1-ccca-4e19-848a-d799d46088b2 / random | 19 | 15/0/4 | 78.95% | 56.67%–91.49% |
| archetype 4fcd40ac-b03f-405f-9236-a00139cbdcc8 / random | 17 | 9/0/8 | 52.94% | 30.96%–73.83% |
| archetype 5354646a-9811-4f7e-85ea-cf8fec8f8f15 / random | 24 | 15/0/9 | 62.50% | 42.71%–78.84% |
| archetype 568c305c-6884-4dff-b1ec-c08f387a6527 / random | 16 | 12/0/4 | 75.00% | 50.50%–89.82% |
| archetype 5b1199a2-d9c2-48f8-84b4-c111fba6aa64 / random | 10 | 2/0/8 | 20.00% | 5.67%–50.98% |
| archetype 5bf0efa1-1024-47ed-bd4a-a5dc13ca2ba0 / random | 38 | 16/0/22 | 42.11% | 27.85%–57.81% |
| archetype 69d696b6-c7aa-460a-8868-a5fa70930c45 / random | 15 | 9/0/6 | 60.00% | 35.75%–80.18% |
| archetype 77765ea3-16fb-4ab7-9f4f-4610f2f04d9f / random | 13 | 8/0/5 | 61.54% | 35.52%–82.29% |
| archetype 788c5f98-b45a-4651-bbf2-67a1da68b3ce / random | 10 | 7/0/3 | 70.00% | 39.68%–89.22% |
| archetype 80e3d33f-6b21-4739-9050-be8d28de28a6 / random | 9 | 7/0/2 | 77.78% | 45.26%–93.68% |
| archetype 833ba3dd-498a-42ce-9a03-32f6636acea1 / random | 8 | 8/0/0 | 100.00% | 67.56%–100.00% |
| archetype 87d5e3fa-192e-482b-a75c-a0921e5699e2 / random | 7 | 0/0/7 | 0.00% | 0.00%–35.43% |
| archetype 93314ceb-4c33-45e0-8ee3-c53d6e6ea21e / random | 16 | 10/0/6 | 62.50% | 38.64%–81.52% |
| archetype 9a48fa73-7c55-4158-9fb7-fbd6941b9f59 / random | 18 | 10/0/8 | 55.56% | 33.72%–75.44% |
| archetype 9ca5a839-cdcb-497d-9b76-2de4c6874cf0 / random | 10 | 7/0/3 | 70.00% | 39.68%–89.22% |
| archetype ab89d262-45d4-438d-8670-79d91f6e944f / random | 23 | 10/0/13 | 43.48% | 25.63%–63.19% |
| archetype b2b1b0da-6d48-40cb-9d44-f0a94f0615f5 / random | 15 | 11/0/4 | 73.33% | 48.05%–89.10% |
| archetype b71ddbd3-59ed-463a-a7f8-9701d4b0861e / random | 32 | 24/0/8 | 75.00% | 57.89%–86.75% |
| archetype b7aaeba4-7526-4301-93fc-326a3e5a1c7a / random | 20 | 17/0/3 | 85.00% | 63.96%–94.76% |
| archetype bdf90a73-3615-440e-92aa-fe0e150d8186 / random | 13 | 8/0/5 | 61.54% | 35.52%–82.29% |
| archetype c78a2ce1-80fe-48b9-9400-98f4965e17a4 / random | 15 | 9/0/6 | 60.00% | 35.75%–80.18% |
| archetype cf1f7e7c-f9e9-4f83-9ff5-6edc8a916277 / random | 30 | 18/0/12 | 60.00% | 42.32%–75.41% |
| archetype cf9ddb4c-02fe-4353-ba1c-a21aaf5b5c6f / random | 10 | 7/0/3 | 70.00% | 39.68%–89.22% |
| archetype d5cf7078-48ae-402d-837e-dde02b1a7153 / random | 15 | 9/0/6 | 60.00% | 35.75%–80.18% |
| archetype e03f4d87-bc6c-46f9-9c08-bef7b59a9f70 / random | 4 | 2/0/2 | 50.00% | 15.00%–85.00% |
| archetype e1620ab4-7e68-4a57-a6eb-d7a3380c4dc5 / random | 38 | 26/0/12 | 68.42% | 52.54%–80.92% |
| archetype e4d7c1fe-cae0-4cec-8254-2656eff4359b / random | 20 | 12/0/8 | 60.00% | 38.66%–78.12% |
| archetype e5bac3ec-b64f-4303-8f9d-047e57ef6cf3 / random | 9 | 1/0/8 | 11.11% | 1.99%–43.50% |
| archetype e6863f55-50e7-4c7b-b118-609b5fc5c005 / random | 13 | 2/0/11 | 15.38% | 4.33%–42.23% |
| archetype e95b00e1-dbff-453d-bdd6-f92034988107 / random | 15 | 7/0/8 | 46.67% | 24.81%–69.88% |
| archetype eb397537-8a0b-4969-924b-baee5137094c / random | 13 | 10/0/3 | 76.92% | 49.74%–91.82% |
| archetype ee5e7dd2-0c11-4349-94e1-ec1ae35b20af / random | 7 | 5/0/2 | 71.43% | 35.89%–91.78% |
| archetype f32bd479-615a-45f0-8c59-0dc793899f7b / random | 19 | 16/0/3 | 84.21% | 62.43%–94.48% |
| archetype f3f6da0b-f83f-4e66-a4e1-8e35a8d27488 / random | 4 | 0/0/4 | 0.00% | 0.00%–48.99% |
| archetype f7072be7-f12b-482a-b9e1-4d3925622eb2 / random | 5 | 0/0/5 | 0.00% | 0.00%–43.45% |
| archetype fc729d2b-bf04-4b69-8050-00b30b296330 / random | 16 | 9/0/7 | 56.25% | 33.18%–76.90% |
| archetype fdc44130-0c51-4b42-ab09-e5150b11c96c / random | 5 | 5/0/0 | 100.00% | 56.55%–100.00% |
| layer 0 / greedy | 30 | 19/0/11 | 63.33% | 45.51%–78.13% |
| layer 1 / greedy | 30 | 12/0/18 | 40.00% | 24.59%–57.68% |
| layer 2 / greedy | 28 | 15/0/13 | 53.57% | 35.81%–70.47% |
| layer 3 / greedy | 28 | 12/0/16 | 42.86% | 26.51%–60.93% |
| layer 4 / greedy | 28 | 7/0/21 | 25.00% | 12.68%–43.36% |
| layer 5 / greedy | 28 | 8/0/20 | 28.57% | 15.25%–47.06% |
| layer 6 / greedy | 28 | 12/0/16 | 42.86% | 26.51%–60.93% |
| archetype 09b9b56c-6356-40aa-bcd8-77b0c80d3835 / greedy | 10 | 3/0/7 | 30.00% | 10.78%–60.32% |
| archetype 0ab905a2-4c1c-410e-bbbb-4460c85f95e5 / greedy | 5 | 4/0/1 | 80.00% | 37.55%–96.38% |
| archetype 0ac06270-f783-4c4f-bfd9-4109d22316e0 / greedy | 5 | 3/0/2 | 60.00% | 23.07%–88.24% |
| archetype 14f8ed05-e684-407c-be32-1dc970d69f36 / greedy | 9 | 5/0/4 | 55.56% | 26.67%–81.12% |
| archetype 157bf4fe-b3d9-4919-9bf2-948002bc3742 / greedy | 14 | 7/0/7 | 50.00% | 26.80%–73.20% |
| archetype 1864823a-8d44-4bad-8bc0-bf2360eac68a / greedy | 9 | 0/0/9 | 0.00% | 0.00%–29.91% |
| archetype 1a075e25-0344-4103-997c-dd8f8a57c84e / greedy | 7 | 3/0/4 | 42.86% | 15.82%–74.95% |
| archetype 1ad97f42-6157-45b3-8290-e27219c7888a / greedy | 6 | 1/0/5 | 16.67% | 3.01%–56.35% |
| archetype 1d341e34-6f81-4ddd-8582-cb2e06db4803 / greedy | 14 | 7/0/7 | 50.00% | 26.80%–73.20% |
| archetype 3bdfa6f6-b4f5-4a35-b5c0-ea76727eeea3 / greedy | 8 | 4/0/4 | 50.00% | 21.52%–78.48% |
| archetype 4b01b6c1-ccca-4e19-848a-d799d46088b2 / greedy | 19 | 15/0/4 | 78.95% | 56.67%–91.49% |
| archetype 4fcd40ac-b03f-405f-9236-a00139cbdcc8 / greedy | 17 | 4/0/13 | 23.53% | 9.56%–47.26% |
| archetype 5354646a-9811-4f7e-85ea-cf8fec8f8f15 / greedy | 24 | 10/0/14 | 41.67% | 24.47%–61.17% |
| archetype 568c305c-6884-4dff-b1ec-c08f387a6527 / greedy | 16 | 9/0/7 | 56.25% | 33.18%–76.90% |
| archetype 5b1199a2-d9c2-48f8-84b4-c111fba6aa64 / greedy | 10 | 1/0/9 | 10.00% | 1.79%–40.42% |
| archetype 5bf0efa1-1024-47ed-bd4a-a5dc13ca2ba0 / greedy | 38 | 12/0/26 | 31.58% | 19.08%–47.46% |
| archetype 69d696b6-c7aa-460a-8868-a5fa70930c45 / greedy | 15 | 9/0/6 | 60.00% | 35.75%–80.18% |
| archetype 77765ea3-16fb-4ab7-9f4f-4610f2f04d9f / greedy | 13 | 9/0/4 | 69.23% | 42.37%–87.32% |
| archetype 788c5f98-b45a-4651-bbf2-67a1da68b3ce / greedy | 10 | 5/0/5 | 50.00% | 23.66%–76.34% |
| archetype 80e3d33f-6b21-4739-9050-be8d28de28a6 / greedy | 9 | 6/0/3 | 66.67% | 35.42%–87.94% |
| archetype 833ba3dd-498a-42ce-9a03-32f6636acea1 / greedy | 8 | 6/0/2 | 75.00% | 40.93%–92.85% |
| archetype 87d5e3fa-192e-482b-a75c-a0921e5699e2 / greedy | 7 | 2/0/5 | 28.57% | 8.22%–64.11% |
| archetype 93314ceb-4c33-45e0-8ee3-c53d6e6ea21e / greedy | 16 | 8/0/8 | 50.00% | 28.00%–72.00% |
| archetype 9a48fa73-7c55-4158-9fb7-fbd6941b9f59 / greedy | 18 | 7/0/11 | 38.89% | 20.31%–61.38% |
| archetype 9ca5a839-cdcb-497d-9b76-2de4c6874cf0 / greedy | 10 | 5/0/5 | 50.00% | 23.66%–76.34% |
| archetype ab89d262-45d4-438d-8670-79d91f6e944f / greedy | 23 | 6/0/17 | 26.09% | 12.55%–46.47% |
| archetype b2b1b0da-6d48-40cb-9d44-f0a94f0615f5 / greedy | 15 | 5/0/10 | 33.33% | 15.18%–58.29% |
| archetype b71ddbd3-59ed-463a-a7f8-9701d4b0861e / greedy | 32 | 24/0/8 | 75.00% | 57.89%–86.75% |
| archetype b7aaeba4-7526-4301-93fc-326a3e5a1c7a / greedy | 20 | 16/0/4 | 80.00% | 58.40%–91.93% |
| archetype bdf90a73-3615-440e-92aa-fe0e150d8186 / greedy | 13 | 6/0/7 | 46.15% | 23.21%–70.86% |
| archetype c78a2ce1-80fe-48b9-9400-98f4965e17a4 / greedy | 15 | 6/0/9 | 40.00% | 19.82%–64.25% |
| archetype cf1f7e7c-f9e9-4f83-9ff5-6edc8a916277 / greedy | 30 | 14/0/16 | 46.67% | 30.23%–63.86% |
| archetype cf9ddb4c-02fe-4353-ba1c-a21aaf5b5c6f / greedy | 10 | 6/0/4 | 60.00% | 31.27%–83.18% |
| archetype d5cf7078-48ae-402d-837e-dde02b1a7153 / greedy | 15 | 8/0/7 | 53.33% | 30.12%–75.19% |
| archetype e03f4d87-bc6c-46f9-9c08-bef7b59a9f70 / greedy | 4 | 2/0/2 | 50.00% | 15.00%–85.00% |
| archetype e1620ab4-7e68-4a57-a6eb-d7a3380c4dc5 / greedy | 38 | 19/0/19 | 50.00% | 34.85%–65.15% |
| archetype e4d7c1fe-cae0-4cec-8254-2656eff4359b / greedy | 20 | 6/0/14 | 30.00% | 14.55%–51.90% |
| archetype e5bac3ec-b64f-4303-8f9d-047e57ef6cf3 / greedy | 9 | 1/0/8 | 11.11% | 1.99%–43.50% |
| archetype e6863f55-50e7-4c7b-b118-609b5fc5c005 / greedy | 13 | 2/0/11 | 15.38% | 4.33%–42.23% |
| archetype e95b00e1-dbff-453d-bdd6-f92034988107 / greedy | 15 | 6/0/9 | 40.00% | 19.82%–64.25% |
| archetype eb397537-8a0b-4969-924b-baee5137094c / greedy | 13 | 6/0/7 | 46.15% | 23.21%–70.86% |
| archetype ee5e7dd2-0c11-4349-94e1-ec1ae35b20af / greedy | 7 | 1/0/6 | 14.29% | 2.57%–51.31% |
| archetype f32bd479-615a-45f0-8c59-0dc793899f7b / greedy | 19 | 10/0/9 | 52.63% | 31.71%–72.67% |
| archetype f3f6da0b-f83f-4e66-a4e1-8e35a8d27488 / greedy | 4 | 0/0/4 | 0.00% | 0.00%–48.99% |
| archetype f7072be7-f12b-482a-b9e1-4d3925622eb2 / greedy | 5 | 0/0/5 | 0.00% | 0.00%–43.45% |
| archetype fc729d2b-bf04-4b69-8050-00b30b296330 / greedy | 16 | 7/0/9 | 43.75% | 23.10%–66.82% |
| archetype fdc44130-0c51-4b42-ab09-e5150b11c96c / greedy | 5 | 4/0/1 | 80.00% | 37.55%–96.38% |

Archetype splits use the piloted deck's joined tide UUIDs. They overlap: one deck may appear in multiple splits. Layer splits use the piloted deck's Atlas layer.

Mean decision time: 50.856 ms across 21676 policy decisions; forced actions are excluded.

Batch host load and lifecycle provenance:

```json
[
  {
    "event": "tournament.batch",
    "timestamp": "2026-10-12T20:28:48.108Z",
    "stage": "start",
    "detail": {
      "pid": 99109,
      "host": "JARVIS.local",
      "platform": "darwin",
      "node": "v24.16.0",
      "workers": 2,
      "batchMs": 1800000,
      "load": [
        9.53125,
        9.19580078125,
        9.5830078125
      ],
      "pending": 200
    },
    "recordHash": "c4f97bb1dbe8696a962d73eaee27083ed472a47a3a39d96b8417ec4a256b5db1"
  },
  {
    "event": "tournament.batch",
    "timestamp": "2026-10-12T20:38:12.308Z",
    "stage": "end",
    "detail": {
      "startedAt": "2026-10-12T20:28:48.112Z",
      "endedAt": "2026-10-12T20:38:12.308Z",
      "elapsedMs": 564190.440666,
      "reason": "complete",
      "failure": null,
      "workers": 2,
      "completed": 200,
      "unfinishedOrdinals": [],
      "host": {
        "start": [
          9.53125,
          9.19580078125,
          9.5830078125
        ],
        "totalMemory": 68719476736,
        "freeMemory": 8837005312,
        "end": [
          21.001953125,
          14.32763671875,
          11.265625
        ],
        "freeMemoryEnd": 7089061888
      }
    },
    "recordHash": "0e956fbf0d01c2b95e2b1e9c45f099c9b8b6cd2347c35790b782a52dd55920dd"
  }
]
```
