# Tournament hv-fy5h-3-greedy-upgrade

Status: complete; 400/400 completed games; 0 failed attempts.

Seed: `hv-fy5h.3-acceptance`. Pool SHA-256: `60e07b0de4c18390d6711ad5a0cdc773caf155828120874d6339235d33c49612`. Source SHA-256: `24f1cb2930265bc5ee70b71dd4bd325ab010ff99d50b88828e4bd4b219ad62f0`. Outcomes SHA-256: `a51e61f382bd56078b89b317ee33a6a973ea0a95badadc26677faa7f466d46d2`.

Iteration-only budgets: planning 256, response 64. Each pair exchanges policies on the same deck seats, battle seed and starting seat.

Win rate is (wins + ½ draws)/games; Wilson 95% intervals use fractional successes for draws and treat games as observations. Paired observations are correlated; the interval is descriptive. Failures and unfinished games contribute zero observations.

| Policy | Games | W/D/L | Win rate | Wilson 95% CI |
| --- | ---: | --- | ---: | --- |
| greedy | 400 | 357/0/43 | 89.25% | 85.83%–91.92% |
| greedy@5 | 400 | 43/0/357 | 10.75% | 8.08%–14.17% |

Elo estimates across all policies played (greedy, greedy@5): greedy 1682.96, greedy@5 1317.04. Two-policy Bradley–Terry/logistic fit, 400-point scale, mean 1500, 1 symmetric prior game(s) per matchup. This prior makes perfect-score estimates finite; the ratings are relative to this dataset.

| Split / policy | Games | W/D/L | Win rate | Wilson 95% CI |
| --- | ---: | --- | ---: | --- |
| layer 0 / greedy | 58 | 48/0/10 | 82.76% | 71.09%–90.36% |
| layer 1 / greedy | 58 | 54/0/4 | 93.10% | 83.57%–97.29% |
| layer 2 / greedy | 58 | 51/0/7 | 87.93% | 77.12%–94.03% |
| layer 3 / greedy | 58 | 51/0/7 | 87.93% | 77.12%–94.03% |
| layer 4 / greedy | 56 | 52/0/4 | 92.86% | 83.02%–97.19% |
| layer 5 / greedy | 56 | 51/0/5 | 91.07% | 80.74%–96.13% |
| layer 6 / greedy | 56 | 50/0/6 | 89.29% | 78.53%–95.00% |
| archetype 09b9b56c-6356-40aa-bcd8-77b0c80d3835 / greedy | 34 | 29/0/5 | 85.29% | 69.87%–93.55% |
| archetype 0ab905a2-4c1c-410e-bbbb-4460c85f95e5 / greedy | 22 | 21/0/1 | 95.45% | 78.20%–99.19% |
| archetype 0ac06270-f783-4c4f-bfd9-4109d22316e0 / greedy | 12 | 11/0/1 | 91.67% | 64.61%–98.51% |
| archetype 0b873395-ad12-4a9f-ab50-5820fc92dd19 / greedy | 4 | 3/0/1 | 75.00% | 30.06%–95.44% |
| archetype 14f8ed05-e684-407c-be32-1dc970d69f36 / greedy | 30 | 29/0/1 | 96.67% | 83.33%–99.41% |
| archetype 157bf4fe-b3d9-4919-9bf2-948002bc3742 / greedy | 32 | 31/0/1 | 96.88% | 84.26%–99.45% |
| archetype 1864823a-8d44-4bad-8bc0-bf2360eac68a / greedy | 26 | 20/0/6 | 76.92% | 57.95%–88.97% |
| archetype 1a075e25-0344-4103-997c-dd8f8a57c84e / greedy | 16 | 15/0/1 | 93.75% | 71.67%–98.89% |
| archetype 1ad97f42-6157-45b3-8290-e27219c7888a / greedy | 14 | 12/0/2 | 85.71% | 60.06%–95.99% |
| archetype 1d341e34-6f81-4ddd-8582-cb2e06db4803 / greedy | 36 | 33/0/3 | 91.67% | 78.17%–97.13% |
| archetype 3bdfa6f6-b4f5-4a35-b5c0-ea76727eeea3 / greedy | 17 | 17/0/0 | 100.00% | 81.57%–100.00% |
| archetype 4b01b6c1-ccca-4e19-848a-d799d46088b2 / greedy | 31 | 30/0/1 | 96.77% | 83.81%–99.43% |
| archetype 4fcd40ac-b03f-405f-9236-a00139cbdcc8 / greedy | 27 | 20/0/7 | 74.07% | 55.32%–86.83% |
| archetype 5354646a-9811-4f7e-85ea-cf8fec8f8f15 / greedy | 44 | 43/0/1 | 97.73% | 88.19%–99.60% |
| archetype 568c305c-6884-4dff-b1ec-c08f387a6527 / greedy | 34 | 32/0/2 | 94.12% | 80.91%–98.37% |
| archetype 5b1199a2-d9c2-48f8-84b4-c111fba6aa64 / greedy | 15 | 13/0/2 | 86.67% | 62.12%–96.26% |
| archetype 5bf0efa1-1024-47ed-bd4a-a5dc13ca2ba0 / greedy | 70 | 54/0/16 | 77.14% | 66.05%–85.41% |
| archetype 69d696b6-c7aa-460a-8868-a5fa70930c45 / greedy | 38 | 35/0/3 | 92.11% | 79.20%–97.28% |
| archetype 7343b376-88d2-45fe-8b5e-79763480ee7e / greedy | 2 | 2/0/0 | 100.00% | 34.24%–100.00% |
| archetype 77765ea3-16fb-4ab7-9f4f-4610f2f04d9f / greedy | 18 | 15/0/3 | 83.33% | 60.78%–94.16% |
| archetype 788c5f98-b45a-4651-bbf2-67a1da68b3ce / greedy | 32 | 31/0/1 | 96.88% | 84.26%–99.45% |
| archetype 7dfa6a52-04ce-42fc-9ef6-4e6571435510 / greedy | 3 | 3/0/0 | 100.00% | 43.85%–100.00% |
| archetype 80e3d33f-6b21-4739-9050-be8d28de28a6 / greedy | 22 | 21/0/1 | 95.45% | 78.20%–99.19% |
| archetype 833ba3dd-498a-42ce-9a03-32f6636acea1 / greedy | 18 | 18/0/0 | 100.00% | 82.41%–100.00% |
| archetype 87d5e3fa-192e-482b-a75c-a0921e5699e2 / greedy | 21 | 18/0/3 | 85.71% | 65.36%–95.02% |
| archetype 93314ceb-4c33-45e0-8ee3-c53d6e6ea21e / greedy | 33 | 30/0/3 | 90.91% | 76.43%–96.86% |
| archetype 9a48fa73-7c55-4158-9fb7-fbd6941b9f59 / greedy | 29 | 24/0/5 | 82.76% | 65.45%–92.40% |
| archetype 9ca5a839-cdcb-497d-9b76-2de4c6874cf0 / greedy | 19 | 19/0/0 | 100.00% | 83.18%–100.00% |
| archetype a182f025-8a15-44e1-be26-74766a3b0b85 / greedy | 4 | 4/0/0 | 100.00% | 51.01%–100.00% |
| archetype ab89d262-45d4-438d-8670-79d91f6e944f / greedy | 39 | 32/0/7 | 82.05% | 67.33%–91.02% |
| archetype b2b1b0da-6d48-40cb-9d44-f0a94f0615f5 / greedy | 36 | 33/0/3 | 91.67% | 78.17%–97.13% |
| archetype b71ddbd3-59ed-463a-a7f8-9701d4b0861e / greedy | 39 | 37/0/2 | 94.87% | 83.11%–98.58% |
| archetype b7aaeba4-7526-4301-93fc-326a3e5a1c7a / greedy | 22 | 22/0/0 | 100.00% | 85.13%–100.00% |
| archetype bdf90a73-3615-440e-92aa-fe0e150d8186 / greedy | 35 | 32/0/3 | 91.43% | 77.62%–97.04% |
| archetype c78a2ce1-80fe-48b9-9400-98f4965e17a4 / greedy | 31 | 27/0/4 | 87.10% | 71.15%–94.87% |
| archetype cf1f7e7c-f9e9-4f83-9ff5-6edc8a916277 / greedy | 52 | 49/0/3 | 94.23% | 84.36%–98.02% |
| archetype cf9ddb4c-02fe-4353-ba1c-a21aaf5b5c6f / greedy | 16 | 14/0/2 | 87.50% | 63.98%–96.50% |
| archetype d5cf7078-48ae-402d-837e-dde02b1a7153 / greedy | 34 | 29/0/5 | 85.29% | 69.87%–93.55% |
| archetype e03f4d87-bc6c-46f9-9c08-bef7b59a9f70 / greedy | 16 | 14/0/2 | 87.50% | 63.98%–96.50% |
| archetype e1620ab4-7e68-4a57-a6eb-d7a3380c4dc5 / greedy | 101 | 93/0/8 | 92.08% | 85.14%–95.93% |
| archetype e4d7c1fe-cae0-4cec-8254-2656eff4359b / greedy | 47 | 40/0/7 | 85.11% | 72.31%–92.59% |
| archetype e5bac3ec-b64f-4303-8f9d-047e57ef6cf3 / greedy | 20 | 17/0/3 | 85.00% | 63.96%–94.76% |
| archetype e6863f55-50e7-4c7b-b118-609b5fc5c005 / greedy | 26 | 22/0/4 | 84.62% | 66.47%–93.85% |
| archetype e95b00e1-dbff-453d-bdd6-f92034988107 / greedy | 32 | 26/0/6 | 81.25% | 64.69%–91.11% |
| archetype eb397537-8a0b-4969-924b-baee5137094c / greedy | 35 | 33/0/2 | 94.29% | 81.39%–98.42% |
| archetype ebb877b5-7f18-413b-8509-3d1e452e0df2 / greedy | 6 | 6/0/0 | 100.00% | 60.97%–100.00% |
| archetype ee5e7dd2-0c11-4349-94e1-ec1ae35b20af / greedy | 17 | 17/0/0 | 100.00% | 81.57%–100.00% |
| archetype f32bd479-615a-45f0-8c59-0dc793899f7b / greedy | 52 | 49/0/3 | 94.23% | 84.36%–98.02% |
| archetype f3f6da0b-f83f-4e66-a4e1-8e35a8d27488 / greedy | 31 | 25/0/6 | 80.65% | 63.72%–90.81% |
| archetype f7072be7-f12b-482a-b9e1-4d3925622eb2 / greedy | 17 | 13/0/4 | 76.47% | 52.74%–90.44% |
| archetype fc729d2b-bf04-4b69-8050-00b30b296330 / greedy | 16 | 15/0/1 | 93.75% | 71.67%–98.89% |
| archetype fdc44130-0c51-4b42-ab09-e5150b11c96c / greedy | 15 | 15/0/0 | 100.00% | 79.61%–100.00% |
| layer 0 / greedy@5 | 58 | 10/0/48 | 17.24% | 9.64%–28.91% |
| layer 1 / greedy@5 | 58 | 4/0/54 | 6.90% | 2.71%–16.43% |
| layer 2 / greedy@5 | 58 | 7/0/51 | 12.07% | 5.97%–22.88% |
| layer 3 / greedy@5 | 58 | 7/0/51 | 12.07% | 5.97%–22.88% |
| layer 4 / greedy@5 | 56 | 4/0/52 | 7.14% | 2.81%–16.98% |
| layer 5 / greedy@5 | 56 | 5/0/51 | 8.93% | 3.87%–19.26% |
| layer 6 / greedy@5 | 56 | 6/0/50 | 10.71% | 5.00%–21.47% |
| archetype 09b9b56c-6356-40aa-bcd8-77b0c80d3835 / greedy@5 | 34 | 0/0/34 | 0.00% | 0.00%–10.15% |
| archetype 0ab905a2-4c1c-410e-bbbb-4460c85f95e5 / greedy@5 | 22 | 1/0/21 | 4.55% | 0.81%–21.80% |
| archetype 0ac06270-f783-4c4f-bfd9-4109d22316e0 / greedy@5 | 12 | 0/0/12 | 0.00% | 0.00%–24.25% |
| archetype 0b873395-ad12-4a9f-ab50-5820fc92dd19 / greedy@5 | 4 | 0/0/4 | 0.00% | 0.00%–48.99% |
| archetype 14f8ed05-e684-407c-be32-1dc970d69f36 / greedy@5 | 30 | 2/0/28 | 6.67% | 1.85%–21.32% |
| archetype 157bf4fe-b3d9-4919-9bf2-948002bc3742 / greedy@5 | 32 | 4/0/28 | 12.50% | 4.97%–28.07% |
| archetype 1864823a-8d44-4bad-8bc0-bf2360eac68a / greedy@5 | 26 | 0/0/26 | 0.00% | 0.00%–12.87% |
| archetype 1a075e25-0344-4103-997c-dd8f8a57c84e / greedy@5 | 16 | 1/0/15 | 6.25% | 1.11%–28.33% |
| archetype 1ad97f42-6157-45b3-8290-e27219c7888a / greedy@5 | 14 | 1/0/13 | 7.14% | 1.27%–31.47% |
| archetype 1d341e34-6f81-4ddd-8582-cb2e06db4803 / greedy@5 | 36 | 7/0/29 | 19.44% | 9.75%–35.03% |
| archetype 3bdfa6f6-b4f5-4a35-b5c0-ea76727eeea3 / greedy@5 | 17 | 4/0/13 | 23.53% | 9.56%–47.26% |
| archetype 4b01b6c1-ccca-4e19-848a-d799d46088b2 / greedy@5 | 31 | 10/0/21 | 32.26% | 18.57%–49.86% |
| archetype 4fcd40ac-b03f-405f-9236-a00139cbdcc8 / greedy@5 | 27 | 0/0/27 | 0.00% | 0.00%–12.46% |
| archetype 5354646a-9811-4f7e-85ea-cf8fec8f8f15 / greedy@5 | 44 | 3/0/41 | 6.82% | 2.35%–18.23% |
| archetype 568c305c-6884-4dff-b1ec-c08f387a6527 / greedy@5 | 34 | 7/0/27 | 20.59% | 10.35%–36.80% |
| archetype 5b1199a2-d9c2-48f8-84b4-c111fba6aa64 / greedy@5 | 15 | 0/0/15 | 0.00% | 0.00%–20.39% |
| archetype 5bf0efa1-1024-47ed-bd4a-a5dc13ca2ba0 / greedy@5 | 70 | 7/0/63 | 10.00% | 4.93%–19.23% |
| archetype 69d696b6-c7aa-460a-8868-a5fa70930c45 / greedy@5 | 38 | 8/0/30 | 21.05% | 11.07%–36.35% |
| archetype 7343b376-88d2-45fe-8b5e-79763480ee7e / greedy@5 | 2 | 1/0/1 | 50.00% | 9.45%–90.55% |
| archetype 77765ea3-16fb-4ab7-9f4f-4610f2f04d9f / greedy@5 | 18 | 5/0/13 | 27.78% | 12.50%–50.87% |
| archetype 788c5f98-b45a-4651-bbf2-67a1da68b3ce / greedy@5 | 32 | 2/0/30 | 6.25% | 1.73%–20.15% |
| archetype 7dfa6a52-04ce-42fc-9ef6-4e6571435510 / greedy@5 | 3 | 1/0/2 | 33.33% | 6.15%–79.23% |
| archetype 80e3d33f-6b21-4739-9050-be8d28de28a6 / greedy@5 | 22 | 2/0/20 | 9.09% | 2.53%–27.81% |
| archetype 833ba3dd-498a-42ce-9a03-32f6636acea1 / greedy@5 | 18 | 9/0/9 | 50.00% | 29.03%–70.97% |
| archetype 87d5e3fa-192e-482b-a75c-a0921e5699e2 / greedy@5 | 21 | 1/0/20 | 4.76% | 0.85%–22.67% |
| archetype 93314ceb-4c33-45e0-8ee3-c53d6e6ea21e / greedy@5 | 33 | 6/0/27 | 18.18% | 8.61%–34.39% |
| archetype 9a48fa73-7c55-4158-9fb7-fbd6941b9f59 / greedy@5 | 29 | 1/0/28 | 3.45% | 0.61%–17.18% |
| archetype 9ca5a839-cdcb-497d-9b76-2de4c6874cf0 / greedy@5 | 19 | 2/0/17 | 10.53% | 2.94%–31.39% |
| archetype a182f025-8a15-44e1-be26-74766a3b0b85 / greedy@5 | 4 | 0/0/4 | 0.00% | 0.00%–48.99% |
| archetype ab89d262-45d4-438d-8670-79d91f6e944f / greedy@5 | 39 | 3/0/36 | 7.69% | 2.65%–20.32% |
| archetype b2b1b0da-6d48-40cb-9d44-f0a94f0615f5 / greedy@5 | 36 | 8/0/28 | 22.22% | 11.72%–38.08% |
| archetype b71ddbd3-59ed-463a-a7f8-9701d4b0861e / greedy@5 | 39 | 14/0/25 | 35.90% | 22.74%–51.58% |
| archetype b7aaeba4-7526-4301-93fc-326a3e5a1c7a / greedy@5 | 22 | 10/0/12 | 45.45% | 26.92%–65.34% |
| archetype bdf90a73-3615-440e-92aa-fe0e150d8186 / greedy@5 | 35 | 2/0/33 | 5.71% | 1.58%–18.61% |
| archetype c78a2ce1-80fe-48b9-9400-98f4965e17a4 / greedy@5 | 31 | 0/0/31 | 0.00% | 0.00%–11.03% |
| archetype cf1f7e7c-f9e9-4f83-9ff5-6edc8a916277 / greedy@5 | 52 | 14/0/38 | 26.92% | 16.77%–40.25% |
| archetype cf9ddb4c-02fe-4353-ba1c-a21aaf5b5c6f / greedy@5 | 16 | 0/0/16 | 0.00% | 0.00%–19.36% |
| archetype d5cf7078-48ae-402d-837e-dde02b1a7153 / greedy@5 | 34 | 2/0/32 | 5.88% | 1.63%–19.09% |
| archetype e03f4d87-bc6c-46f9-9c08-bef7b59a9f70 / greedy@5 | 16 | 1/0/15 | 6.25% | 1.11%–28.33% |
| archetype e1620ab4-7e68-4a57-a6eb-d7a3380c4dc5 / greedy@5 | 101 | 13/0/88 | 12.87% | 7.68%–20.78% |
| archetype e4d7c1fe-cae0-4cec-8254-2656eff4359b / greedy@5 | 47 | 3/0/44 | 6.38% | 2.19%–17.16% |
| archetype e5bac3ec-b64f-4303-8f9d-047e57ef6cf3 / greedy@5 | 20 | 0/0/20 | 0.00% | 0.00%–16.11% |
| archetype e6863f55-50e7-4c7b-b118-609b5fc5c005 / greedy@5 | 26 | 0/0/26 | 0.00% | 0.00%–12.87% |
| archetype e95b00e1-dbff-453d-bdd6-f92034988107 / greedy@5 | 32 | 0/0/32 | 0.00% | 0.00%–10.72% |
| archetype eb397537-8a0b-4969-924b-baee5137094c / greedy@5 | 35 | 8/0/27 | 22.86% | 12.07%–39.02% |
| archetype ebb877b5-7f18-413b-8509-3d1e452e0df2 / greedy@5 | 6 | 0/0/6 | 0.00% | 0.00%–39.03% |
| archetype ee5e7dd2-0c11-4349-94e1-ec1ae35b20af / greedy@5 | 17 | 1/0/16 | 5.88% | 1.05%–26.98% |
| archetype f32bd479-615a-45f0-8c59-0dc793899f7b / greedy@5 | 52 | 9/0/43 | 17.31% | 9.38%–29.73% |
| archetype f3f6da0b-f83f-4e66-a4e1-8e35a8d27488 / greedy@5 | 31 | 2/0/29 | 6.45% | 1.79%–20.72% |
| archetype f7072be7-f12b-482a-b9e1-4d3925622eb2 / greedy@5 | 17 | 0/0/17 | 0.00% | 0.00%–18.43% |
| archetype fc729d2b-bf04-4b69-8050-00b30b296330 / greedy@5 | 16 | 0/0/16 | 0.00% | 0.00%–19.36% |
| archetype fdc44130-0c51-4b42-ab09-e5150b11c96c / greedy@5 | 15 | 7/0/8 | 46.67% | 24.81%–69.88% |

Archetype splits use the piloted deck's joined tide UUIDs. They overlap: one deck may appear in multiple splits. Layer splits use the piloted deck's Atlas layer.

Mean decision time: 110.745 ms across 25409 policy decisions; forced actions are excluded.

Batch host load and lifecycle provenance:

```json
[
  {
    "event": "tournament.batch",
    "timestamp": "2026-10-18T05:47:19.830Z",
    "stage": "start",
    "detail": {
      "pid": 13617,
      "host": "JARVIS.local",
      "platform": "darwin",
      "node": "v24.16.0",
      "workers": 4,
      "batchMs": 1800000,
      "load": [
        8.21044921875,
        12.197265625,
        13.55615234375
      ],
      "pending": 400
    },
    "recordHash": "362ae84698a555da9f8c2801e6ddc535b5c95afe6c71c51faa5c41a25e636ee3"
  },
  {
    "event": "tournament.batch",
    "timestamp": "2026-10-18T05:59:20.425Z",
    "stage": "end",
    "detail": {
      "startedAt": "2026-10-18T05:47:19.835Z",
      "endedAt": "2026-10-18T05:59:20.425Z",
      "elapsedMs": 720585.56625,
      "reason": "complete",
      "failure": null,
      "workers": 4,
      "completed": 400,
      "unfinishedOrdinals": [],
      "host": {
        "start": [
          8.21044921875,
          12.197265625,
          13.55615234375
        ],
        "totalMemory": 68719476736,
        "freeMemory": 1515208704,
        "end": [
          14.38427734375,
          11.35498046875,
          12.01904296875
        ],
        "freeMemoryEnd": 491847680
      }
    },
    "recordHash": "51796b4f21f14c0dc9b09b5a9e8dc9de37e27666846adae1733728932cdea657"
  }
]
```
