# hv-umm2.321: Authored emblem fuzz smoke

- Source base: cd3073fde6a6e88dddb9729d44dd95bd16b92aac.
- Command: `lockf -k /Users/dthurn/dreamtides_web/artifacts/heavy.lock npm run fuzz:engine -- --games 200`.
- CPU: 52.8 s. Wall: 48.6 s. Host one-minute load: 29.57.
- 200 games, 102111 steps, 1705 prompts; 148 interactive re-runs.
- Zero failures and zero feasibility bounds; 96 player victories, 104 enemy victories.
- The fixed-seed synthetic regression rejects pending and vanilla random emblems, verifies both avatars are authored, and preserves explicitly targeted pending/vanilla avatars.
- Focused core contracts, `npm run review`, and `npm run knip` pass.
