# Tournament hv-fy5h-4-look2

Status: complete; 200/200 completed games; 0 failed attempts.

Seed: `hv-fy5h.4-screen5`. Pool SHA-256: `60e07b0de4c18390d6711ad5a0cdc773caf155828120874d6339235d33c49612`. Source SHA-256: `d726783b9e1b3d59766444a3b580819885e14c45180ae3a5828e63a56885e103`. Outcomes SHA-256: `56c63d6316b72bc7ec0bf45bf5a7698c0742589c7d5e3bec6ed68fb8dd3b2acf`.

Iteration-only budgets: planning 256, response 64. Each pair exchanges policies on the same deck seats, battle seed and starting seat.

Win rate is (wins + ½ draws)/games; Wilson 95% intervals use fractional successes for draws and treat games as observations. Paired observations are correlated; the interval is descriptive. Failures and unfinished games contribute zero observations.

| Policy | Games | W/D/L | Win rate | Wilson 95% CI |
| --- | ---: | --- | ---: | --- |
| expert | 200 | 113/1/86 | 56.75% | 49.82%–63.43% |
| greedy | 200 | 86/1/113 | 43.25% | 36.57%–50.18% |

Elo estimates across all policies played (expert, greedy): expert 1523.48, greedy 1476.52. Two-policy Bradley–Terry/logistic fit, 400-point scale, mean 1500, 1 symmetric prior game(s) per matchup. This prior makes perfect-score estimates finite; the ratings are relative to this dataset.

| Split / policy | Games | W/D/L | Win rate | Wilson 95% CI |
| --- | ---: | --- | ---: | --- |
| layer 0 / expert | 30 | 16/0/14 | 53.33% | 36.14%–69.77% |
| layer 1 / expert | 30 | 18/0/12 | 60.00% | 42.32%–75.41% |
| layer 2 / expert | 28 | 17/0/11 | 60.71% | 42.41%–76.43% |
| layer 3 / expert | 28 | 15/0/13 | 53.57% | 35.81%–70.47% |
| layer 4 / expert | 28 | 16/0/12 | 57.14% | 39.07%–73.49% |
| layer 5 / expert | 28 | 16/0/12 | 57.14% | 39.07%–73.49% |
| layer 6 / expert | 28 | 15/1/12 | 55.36% | 37.43%–71.99% |
| archetype 09b9b56c-6356-40aa-bcd8-77b0c80d3835 / expert | 13 | 8/0/5 | 61.54% | 35.52%–82.29% |
| archetype 0ab905a2-4c1c-410e-bbbb-4460c85f95e5 / expert | 8 | 4/0/4 | 50.00% | 21.52%–78.48% |
| archetype 0ac06270-f783-4c4f-bfd9-4109d22316e0 / expert | 5 | 1/0/4 | 20.00% | 3.62%–62.45% |
| archetype 0b873395-ad12-4a9f-ab50-5820fc92dd19 / expert | 2 | 2/0/0 | 100.00% | 34.24%–100.00% |
| archetype 14f8ed05-e684-407c-be32-1dc970d69f36 / expert | 11 | 7/0/4 | 63.64% | 35.38%–84.83% |
| archetype 157bf4fe-b3d9-4919-9bf2-948002bc3742 / expert | 13 | 5/0/8 | 38.46% | 17.71%–64.48% |
| archetype 1864823a-8d44-4bad-8bc0-bf2360eac68a / expert | 14 | 8/0/6 | 57.14% | 32.59%–78.62% |
| archetype 1a075e25-0344-4103-997c-dd8f8a57c84e / expert | 4 | 0/0/4 | 0.00% | 0.00%–48.99% |
| archetype 1ad97f42-6157-45b3-8290-e27219c7888a / expert | 10 | 8/1/1 | 85.00% | 54.12%–96.46% |
| archetype 1d341e34-6f81-4ddd-8582-cb2e06db4803 / expert | 15 | 7/0/8 | 46.67% | 24.81%–69.88% |
| archetype 3bdfa6f6-b4f5-4a35-b5c0-ea76727eeea3 / expert | 14 | 7/0/7 | 50.00% | 26.80%–73.20% |
| archetype 4b01b6c1-ccca-4e19-848a-d799d46088b2 / expert | 8 | 8/0/0 | 100.00% | 67.56%–100.00% |
| archetype 4fcd40ac-b03f-405f-9236-a00139cbdcc8 / expert | 16 | 6/0/10 | 37.50% | 18.48%–61.36% |
| archetype 5354646a-9811-4f7e-85ea-cf8fec8f8f15 / expert | 29 | 14/0/15 | 48.28% | 31.39%–65.57% |
| archetype 568c305c-6884-4dff-b1ec-c08f387a6527 / expert | 15 | 8/0/7 | 53.33% | 30.12%–75.19% |
| archetype 5b1199a2-d9c2-48f8-84b4-c111fba6aa64 / expert | 12 | 6/1/5 | 54.17% | 28.60%–77.71% |
| archetype 5bf0efa1-1024-47ed-bd4a-a5dc13ca2ba0 / expert | 36 | 17/0/19 | 47.22% | 31.99%–62.99% |
| archetype 69d696b6-c7aa-460a-8868-a5fa70930c45 / expert | 12 | 6/0/6 | 50.00% | 25.38%–74.62% |
| archetype 77765ea3-16fb-4ab7-9f4f-4610f2f04d9f / expert | 18 | 8/0/10 | 44.44% | 24.56%–66.28% |
| archetype 788c5f98-b45a-4651-bbf2-67a1da68b3ce / expert | 16 | 13/0/3 | 81.25% | 56.99%–93.41% |
| archetype 7dfa6a52-04ce-42fc-9ef6-4e6571435510 / expert | 1 | 1/0/0 | 100.00% | 20.65%–100.00% |
| archetype 80e3d33f-6b21-4739-9050-be8d28de28a6 / expert | 10 | 7/0/3 | 70.00% | 39.68%–89.22% |
| archetype 833ba3dd-498a-42ce-9a03-32f6636acea1 / expert | 12 | 8/0/4 | 66.67% | 39.06%–86.19% |
| archetype 87d5e3fa-192e-482b-a75c-a0921e5699e2 / expert | 6 | 2/0/4 | 33.33% | 9.68%–70.00% |
| archetype 93314ceb-4c33-45e0-8ee3-c53d6e6ea21e / expert | 14 | 6/0/8 | 42.86% | 21.38%–67.41% |
| archetype 9a48fa73-7c55-4158-9fb7-fbd6941b9f59 / expert | 12 | 9/1/2 | 79.17% | 50.88%–93.31% |
| archetype 9ca5a839-cdcb-497d-9b76-2de4c6874cf0 / expert | 11 | 9/0/2 | 81.82% | 52.30%–94.86% |
| archetype a182f025-8a15-44e1-be26-74766a3b0b85 / expert | 3 | 3/0/0 | 100.00% | 43.85%–100.00% |
| archetype ab89d262-45d4-438d-8670-79d91f6e944f / expert | 11 | 6/0/5 | 54.55% | 28.01%–78.73% |
| archetype b2b1b0da-6d48-40cb-9d44-f0a94f0615f5 / expert | 14 | 9/0/5 | 64.29% | 38.76%–83.66% |
| archetype b71ddbd3-59ed-463a-a7f8-9701d4b0861e / expert | 15 | 9/0/6 | 60.00% | 35.75%–80.18% |
| archetype b7aaeba4-7526-4301-93fc-326a3e5a1c7a / expert | 8 | 8/0/0 | 100.00% | 67.56%–100.00% |
| archetype bdf90a73-3615-440e-92aa-fe0e150d8186 / expert | 19 | 14/0/5 | 73.68% | 51.21%–88.19% |
| archetype c78a2ce1-80fe-48b9-9400-98f4965e17a4 / expert | 24 | 18/0/6 | 75.00% | 55.10%–88.00% |
| archetype cf1f7e7c-f9e9-4f83-9ff5-6edc8a916277 / expert | 22 | 12/0/10 | 54.55% | 34.66%–73.08% |
| archetype cf9ddb4c-02fe-4353-ba1c-a21aaf5b5c6f / expert | 13 | 8/0/5 | 61.54% | 35.52%–82.29% |
| archetype d5cf7078-48ae-402d-837e-dde02b1a7153 / expert | 21 | 16/0/5 | 76.19% | 54.91%–89.37% |
| archetype e03f4d87-bc6c-46f9-9c08-bef7b59a9f70 / expert | 3 | 2/0/1 | 66.67% | 20.77%–93.85% |
| archetype e1620ab4-7e68-4a57-a6eb-d7a3380c4dc5 / expert | 39 | 27/0/12 | 69.23% | 53.58%–81.43% |
| archetype e4d7c1fe-cae0-4cec-8254-2656eff4359b / expert | 19 | 5/0/14 | 26.32% | 11.81%–48.79% |
| archetype e5bac3ec-b64f-4303-8f9d-047e57ef6cf3 / expert | 10 | 3/0/7 | 30.00% | 10.78%–60.32% |
| archetype e6863f55-50e7-4c7b-b118-609b5fc5c005 / expert | 15 | 6/1/8 | 43.33% | 22.28%–67.11% |
| archetype e95b00e1-dbff-453d-bdd6-f92034988107 / expert | 18 | 8/0/10 | 44.44% | 24.56%–66.28% |
| archetype eb397537-8a0b-4969-924b-baee5137094c / expert | 15 | 9/0/6 | 60.00% | 35.75%–80.18% |
| archetype ebb877b5-7f18-413b-8509-3d1e452e0df2 / expert | 2 | 1/0/1 | 50.00% | 9.45%–90.55% |
| archetype ee5e7dd2-0c11-4349-94e1-ec1ae35b20af / expert | 9 | 6/0/3 | 66.67% | 35.42%–87.94% |
| archetype f32bd479-615a-45f0-8c59-0dc793899f7b / expert | 23 | 12/0/11 | 52.17% | 32.96%–70.76% |
| archetype f3f6da0b-f83f-4e66-a4e1-8e35a8d27488 / expert | 14 | 9/0/5 | 64.29% | 38.76%–83.66% |
| archetype f7072be7-f12b-482a-b9e1-4d3925622eb2 / expert | 9 | 4/0/5 | 44.44% | 18.88%–73.33% |
| archetype fc729d2b-bf04-4b69-8050-00b30b296330 / expert | 12 | 3/0/9 | 25.00% | 8.89%–53.23% |
| archetype fdc44130-0c51-4b42-ab09-e5150b11c96c / expert | 7 | 5/0/2 | 71.43% | 35.89%–91.78% |
| layer 0 / greedy | 30 | 14/0/16 | 46.67% | 30.23%–63.86% |
| layer 1 / greedy | 30 | 12/0/18 | 40.00% | 24.59%–57.68% |
| layer 2 / greedy | 28 | 11/0/17 | 39.29% | 23.57%–57.59% |
| layer 3 / greedy | 28 | 13/0/15 | 46.43% | 29.53%–64.19% |
| layer 4 / greedy | 28 | 12/0/16 | 42.86% | 26.51%–60.93% |
| layer 5 / greedy | 28 | 12/0/16 | 42.86% | 26.51%–60.93% |
| layer 6 / greedy | 28 | 12/1/15 | 44.64% | 28.01%–62.57% |
| archetype 09b9b56c-6356-40aa-bcd8-77b0c80d3835 / greedy | 13 | 6/0/7 | 46.15% | 23.21%–70.86% |
| archetype 0ab905a2-4c1c-410e-bbbb-4460c85f95e5 / greedy | 8 | 4/0/4 | 50.00% | 21.52%–78.48% |
| archetype 0ac06270-f783-4c4f-bfd9-4109d22316e0 / greedy | 5 | 2/0/3 | 40.00% | 11.76%–76.93% |
| archetype 0b873395-ad12-4a9f-ab50-5820fc92dd19 / greedy | 2 | 1/0/1 | 50.00% | 9.45%–90.55% |
| archetype 14f8ed05-e684-407c-be32-1dc970d69f36 / greedy | 11 | 5/0/6 | 45.45% | 21.27%–71.99% |
| archetype 157bf4fe-b3d9-4919-9bf2-948002bc3742 / greedy | 13 | 1/0/12 | 7.69% | 1.37%–33.31% |
| archetype 1864823a-8d44-4bad-8bc0-bf2360eac68a / greedy | 14 | 5/0/9 | 35.71% | 16.34%–61.24% |
| archetype 1a075e25-0344-4103-997c-dd8f8a57c84e / greedy | 4 | 1/0/3 | 25.00% | 4.56%–69.94% |
| archetype 1ad97f42-6157-45b3-8290-e27219c7888a / greedy | 10 | 4/1/5 | 45.00% | 20.14%–72.63% |
| archetype 1d341e34-6f81-4ddd-8582-cb2e06db4803 / greedy | 15 | 3/0/12 | 20.00% | 7.05%–45.19% |
| archetype 3bdfa6f6-b4f5-4a35-b5c0-ea76727eeea3 / greedy | 14 | 8/0/6 | 57.14% | 32.59%–78.62% |
| archetype 4b01b6c1-ccca-4e19-848a-d799d46088b2 / greedy | 8 | 6/0/2 | 75.00% | 40.93%–92.85% |
| archetype 4fcd40ac-b03f-405f-9236-a00139cbdcc8 / greedy | 16 | 4/0/12 | 25.00% | 10.18%–49.50% |
| archetype 5354646a-9811-4f7e-85ea-cf8fec8f8f15 / greedy | 29 | 16/0/13 | 55.17% | 37.55%–71.59% |
| archetype 568c305c-6884-4dff-b1ec-c08f387a6527 / greedy | 15 | 4/0/11 | 26.67% | 10.90%–51.95% |
| archetype 5b1199a2-d9c2-48f8-84b4-c111fba6aa64 / greedy | 12 | 5/0/7 | 41.67% | 19.33%–68.05% |
| archetype 5bf0efa1-1024-47ed-bd4a-a5dc13ca2ba0 / greedy | 36 | 10/0/26 | 27.78% | 15.85%–43.99% |
| archetype 69d696b6-c7aa-460a-8868-a5fa70930c45 / greedy | 12 | 4/0/8 | 33.33% | 13.81%–60.94% |
| archetype 77765ea3-16fb-4ab7-9f4f-4610f2f04d9f / greedy | 18 | 9/0/9 | 50.00% | 29.03%–70.97% |
| archetype 788c5f98-b45a-4651-bbf2-67a1da68b3ce / greedy | 16 | 8/0/8 | 50.00% | 28.00%–72.00% |
| archetype 7dfa6a52-04ce-42fc-9ef6-4e6571435510 / greedy | 1 | 1/0/0 | 100.00% | 20.65%–100.00% |
| archetype 80e3d33f-6b21-4739-9050-be8d28de28a6 / greedy | 10 | 4/0/6 | 40.00% | 16.82%–68.73% |
| archetype 833ba3dd-498a-42ce-9a03-32f6636acea1 / greedy | 12 | 10/0/2 | 83.33% | 55.20%–95.30% |
| archetype 87d5e3fa-192e-482b-a75c-a0921e5699e2 / greedy | 6 | 3/0/3 | 50.00% | 18.76%–81.24% |
| archetype 93314ceb-4c33-45e0-8ee3-c53d6e6ea21e / greedy | 14 | 4/0/10 | 28.57% | 11.72%–54.65% |
| archetype 9a48fa73-7c55-4158-9fb7-fbd6941b9f59 / greedy | 12 | 4/0/8 | 33.33% | 13.81%–60.94% |
| archetype 9ca5a839-cdcb-497d-9b76-2de4c6874cf0 / greedy | 11 | 7/0/4 | 63.64% | 35.38%–84.83% |
| archetype a182f025-8a15-44e1-be26-74766a3b0b85 / greedy | 3 | 1/0/2 | 33.33% | 6.15%–79.23% |
| archetype ab89d262-45d4-438d-8670-79d91f6e944f / greedy | 11 | 2/0/9 | 18.18% | 5.14%–47.70% |
| archetype b2b1b0da-6d48-40cb-9d44-f0a94f0615f5 / greedy | 14 | 4/0/10 | 28.57% | 11.72%–54.65% |
| archetype b71ddbd3-59ed-463a-a7f8-9701d4b0861e / greedy | 15 | 11/0/4 | 73.33% | 48.05%–89.10% |
| archetype b7aaeba4-7526-4301-93fc-326a3e5a1c7a / greedy | 8 | 6/1/1 | 81.25% | 46.68%–95.55% |
| archetype bdf90a73-3615-440e-92aa-fe0e150d8186 / greedy | 19 | 14/0/5 | 73.68% | 51.21%–88.19% |
| archetype c78a2ce1-80fe-48b9-9400-98f4965e17a4 / greedy | 24 | 13/0/11 | 54.17% | 35.07%–72.11% |
| archetype cf1f7e7c-f9e9-4f83-9ff5-6edc8a916277 / greedy | 22 | 11/0/11 | 50.00% | 30.72%–69.28% |
| archetype cf9ddb4c-02fe-4353-ba1c-a21aaf5b5c6f / greedy | 13 | 5/0/8 | 38.46% | 17.71%–64.48% |
| archetype d5cf7078-48ae-402d-837e-dde02b1a7153 / greedy | 21 | 15/0/6 | 71.43% | 50.04%–86.19% |
| archetype e03f4d87-bc6c-46f9-9c08-bef7b59a9f70 / greedy | 3 | 1/0/2 | 33.33% | 6.15%–79.23% |
| archetype e1620ab4-7e68-4a57-a6eb-d7a3380c4dc5 / greedy | 39 | 18/0/21 | 46.15% | 31.57%–61.43% |
| archetype e4d7c1fe-cae0-4cec-8254-2656eff4359b / greedy | 19 | 8/0/11 | 42.11% | 23.14%–63.72% |
| archetype e5bac3ec-b64f-4303-8f9d-047e57ef6cf3 / greedy | 10 | 4/0/6 | 40.00% | 16.82%–68.73% |
| archetype e6863f55-50e7-4c7b-b118-609b5fc5c005 / greedy | 15 | 6/0/9 | 40.00% | 19.82%–64.25% |
| archetype e95b00e1-dbff-453d-bdd6-f92034988107 / greedy | 18 | 9/0/9 | 50.00% | 29.03%–70.97% |
| archetype eb397537-8a0b-4969-924b-baee5137094c / greedy | 15 | 5/0/10 | 33.33% | 15.18%–58.29% |
| archetype ebb877b5-7f18-413b-8509-3d1e452e0df2 / greedy | 2 | 0/0/2 | 0.00% | 0.00%–65.76% |
| archetype ee5e7dd2-0c11-4349-94e1-ec1ae35b20af / greedy | 9 | 3/0/6 | 33.33% | 12.06%–64.58% |
| archetype f32bd479-615a-45f0-8c59-0dc793899f7b / greedy | 23 | 6/0/17 | 26.09% | 12.55%–46.47% |
| archetype f3f6da0b-f83f-4e66-a4e1-8e35a8d27488 / greedy | 14 | 9/0/5 | 64.29% | 38.76%–83.66% |
| archetype f7072be7-f12b-482a-b9e1-4d3925622eb2 / greedy | 9 | 2/0/7 | 22.22% | 6.32%–54.74% |
| archetype fc729d2b-bf04-4b69-8050-00b30b296330 / greedy | 12 | 4/0/8 | 33.33% | 13.81%–60.94% |
| archetype fdc44130-0c51-4b42-ab09-e5150b11c96c / greedy | 7 | 6/0/1 | 85.71% | 48.69%–97.43% |

Archetype splits use the piloted deck's joined tide UUIDs. They overlap: one deck may appear in multiple splits. Layer splits use the piloted deck's Atlas layer.

Mean decision time: 1353.576 ms across 17373 policy decisions; forced actions are excluded.

Batch host load and lifecycle provenance:

```json
[
  {
    "event": "tournament.batch",
    "timestamp": "2026-10-18T10:52:00.977Z",
    "stage": "start",
    "detail": {
      "pid": 43462,
      "host": "JARVIS.local",
      "platform": "darwin",
      "node": "v24.16.0",
      "workers": 4,
      "batchMs": 1800000,
      "load": [
        3.5009765625,
        5.61865234375,
        6.58740234375
      ],
      "pending": 200
    },
    "recordHash": "06c29c36f9ef162502a13d2d5dfd3ffb2b3afb90e1620197c43d2184874260ce"
  },
  {
    "event": "tournament.batch",
    "timestamp": "2026-10-18T11:22:01.035Z",
    "stage": "end",
    "detail": {
      "startedAt": "2026-10-18T10:52:00.981Z",
      "endedAt": "2026-10-18T11:22:01.035Z",
      "elapsedMs": 1800015.9774169999,
      "reason": "deadline",
      "failure": null,
      "workers": 4,
      "completed": 65,
      "unfinishedOrdinals": [
        62,
        63,
        67,
        68,
        69,
        70,
        71,
        72,
        73,
        74,
        75,
        76,
        77,
        78,
        79,
        80,
        81,
        82,
        83,
        84,
        85,
        86,
        87,
        88,
        89,
        90,
        91,
        92,
        93,
        94,
        95,
        96,
        97,
        98,
        99,
        100,
        101,
        102,
        103,
        104,
        105,
        106,
        107,
        108,
        109,
        110,
        111,
        112,
        113,
        114,
        115,
        116,
        117,
        118,
        119,
        120,
        121,
        122,
        123,
        124,
        125,
        126,
        127,
        128,
        129,
        130,
        131,
        132,
        133,
        134,
        135,
        136,
        137,
        138,
        139,
        140,
        141,
        142,
        143,
        144,
        145,
        146,
        147,
        148,
        149,
        150,
        151,
        152,
        153,
        154,
        155,
        156,
        157,
        158,
        159,
        160,
        161,
        162,
        163,
        164,
        165,
        166,
        167,
        168,
        169,
        170,
        171,
        172,
        173,
        174,
        175,
        176,
        177,
        178,
        179,
        180,
        181,
        182,
        183,
        184,
        185,
        186,
        187,
        188,
        189,
        190,
        191,
        192,
        193,
        194,
        195,
        196,
        197,
        198,
        199
      ],
      "host": {
        "start": [
          3.5009765625,
          5.61865234375,
          6.58740234375
        ],
        "totalMemory": 68719476736,
        "freeMemory": 4322656256,
        "end": [
          7.1455078125,
          7.83544921875,
          7.85546875
        ],
        "freeMemoryEnd": 381599744
      }
    },
    "recordHash": "150a6b5495182ca8d0f5d147e38275c99a5af4a753e9fe5ba6df23cfcfa46756"
  },
  {
    "event": "tournament.batch",
    "timestamp": "2026-10-18T11:22:03.359Z",
    "stage": "start",
    "detail": {
      "pid": 81577,
      "host": "JARVIS.local",
      "platform": "darwin",
      "node": "v24.16.0",
      "workers": 4,
      "batchMs": 1800000,
      "load": [
        7.1455078125,
        7.83544921875,
        7.85546875
      ],
      "pending": 135
    },
    "recordHash": "9236af86946c2153b1dfe559a0a02f32d72867d7eed09528dd9b28c9625d527e"
  },
  {
    "event": "tournament.batch",
    "timestamp": "2026-10-18T11:52:03.406Z",
    "stage": "end",
    "detail": {
      "startedAt": "2026-10-18T11:22:03.365Z",
      "endedAt": "2026-10-18T11:52:03.406Z",
      "elapsedMs": 1800009.6601250002,
      "reason": "deadline",
      "failure": null,
      "workers": 4,
      "completed": 48,
      "unfinishedOrdinals": [
        111,
        114,
        115,
        116,
        117,
        118,
        119,
        120,
        121,
        122,
        123,
        124,
        125,
        126,
        127,
        128,
        129,
        130,
        131,
        132,
        133,
        134,
        135,
        136,
        137,
        138,
        139,
        140,
        141,
        142,
        143,
        144,
        145,
        146,
        147,
        148,
        149,
        150,
        151,
        152,
        153,
        154,
        155,
        156,
        157,
        158,
        159,
        160,
        161,
        162,
        163,
        164,
        165,
        166,
        167,
        168,
        169,
        170,
        171,
        172,
        173,
        174,
        175,
        176,
        177,
        178,
        179,
        180,
        181,
        182,
        183,
        184,
        185,
        186,
        187,
        188,
        189,
        190,
        191,
        192,
        193,
        194,
        195,
        196,
        197,
        198,
        199
      ],
      "host": {
        "start": [
          7.1455078125,
          7.83544921875,
          7.85546875
        ],
        "totalMemory": 68719476736,
        "freeMemory": 3553787904,
        "end": [
          7.49169921875,
          7.6103515625,
          7.64013671875
        ],
        "freeMemoryEnd": 544899072
      }
    },
    "recordHash": "c8129c67d7765a78ae724a6c5324aa7136375d2b4f101642436a67636ec50574"
  },
  {
    "event": "tournament.batch",
    "timestamp": "2026-10-18T11:52:05.958Z",
    "stage": "start",
    "detail": {
      "pid": 20224,
      "host": "JARVIS.local",
      "platform": "darwin",
      "node": "v24.16.0",
      "workers": 4,
      "batchMs": 1800000,
      "load": [
        7.2119140625,
        7.55029296875,
        7.61865234375
      ],
      "pending": 87
    },
    "recordHash": "7f0c8d496e942eb5bd1bb6b91c1fee7660388ae325209abe0c09ba0293e2f32d"
  },
  {
    "event": "tournament.batch",
    "timestamp": "2026-10-18T12:22:06.005Z",
    "stage": "end",
    "detail": {
      "startedAt": "2026-10-18T11:52:05.963Z",
      "endedAt": "2026-10-18T12:22:06.005Z",
      "elapsedMs": 1800029.926625,
      "reason": "deadline",
      "failure": null,
      "workers": 4,
      "completed": 63,
      "unfinishedOrdinals": [
        170,
        173,
        178,
        179,
        180,
        181,
        182,
        183,
        184,
        185,
        186,
        187,
        188,
        189,
        190,
        191,
        192,
        193,
        194,
        195,
        196,
        197,
        198,
        199
      ],
      "host": {
        "start": [
          7.2119140625,
          7.55029296875,
          7.61865234375
        ],
        "totalMemory": 68719476736,
        "freeMemory": 3788636160,
        "end": [
          7.4931640625,
          7.470703125,
          7.3505859375
        ],
        "freeMemoryEnd": 422756352
      }
    },
    "recordHash": "1a1f3b38d9de0036053495f05bb46f5b8044595b0c94fe6382ea16e2db55eae5"
  },
  {
    "event": "tournament.batch",
    "timestamp": "2026-10-18T12:22:08.581Z",
    "stage": "start",
    "detail": {
      "pid": 58383,
      "host": "JARVIS.local",
      "platform": "darwin",
      "node": "v24.16.0",
      "workers": 4,
      "batchMs": 1800000,
      "load": [
        7.4931640625,
        7.470703125,
        7.3505859375
      ],
      "pending": 24
    },
    "recordHash": "0ebe0a6573b23040abfc47b3c98cf173045727fbeee4ce3fdee510300b092e2c"
  },
  {
    "event": "tournament.batch",
    "timestamp": "2026-10-18T12:43:57.029Z",
    "stage": "end",
    "detail": {
      "startedAt": "2026-10-18T12:22:08.587Z",
      "endedAt": "2026-10-18T12:43:57.029Z",
      "elapsedMs": 1308449.4272079999,
      "reason": "complete",
      "failure": null,
      "workers": 4,
      "completed": 24,
      "unfinishedOrdinals": [],
      "host": {
        "start": [
          7.4931640625,
          7.470703125,
          7.3505859375
        ],
        "totalMemory": 68719476736,
        "freeMemory": 3519873024,
        "end": [
          4.2431640625,
          4.75830078125,
          6.0810546875
        ],
        "freeMemoryEnd": 292012032
      }
    },
    "recordHash": "870202ea02c51dfbebf87681130e42b0aa777bc0c8d540ce3ea6a9d04e45dd22"
  }
]
```
