# Pre-existing issues found by hv-umm2.65

- `src/runtime/battle-prompt-messages.ts` (battle log of the human's view): a card the opponent draws has no log line, neither its turn draw nor a draw from an effect or trigger, so the human's log shows "Watcher in the Ruins's triggered ability resolved." with no "Your opponent drew a card." after it (seen judging 2e8571c0-4faf-4e7a-a702-26952d2035ee as=enemy; capture `watcher-enemy-log-desktop.png`).
- `src/runtime/battle-prompt-messages.ts` (`revealed` line): when the opponent's Glimmerwood Scout (49c6e5ad-8da8-47fa-a8f3-906cbef8a3ed) reveals the human's hand, the human's log reads "You revealed Lab Quickstep, Lab Recruit.", naming the human as the one revealing (capture `watcher-enemy-log-desktop.png`).
