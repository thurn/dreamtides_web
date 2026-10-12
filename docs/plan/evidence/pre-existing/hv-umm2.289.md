# Pre-existing observations: hv-umm2.289

At base `a1b2f2d67cfb70418f55fc640fa0acfa9b070dbc`, ordinary opponent reconstruction logs in `src/battle/integration/create-battle-init.ts` carry Avatar/card names and ability text alongside UUIDs. The newly constructed Apollyon route records UUIDs and categorical metadata exclusively; ordinary opponent logging is outside this bounded design/init change.

The shared `src/screens/cumulus_adapters/BattleStartScreenAdapter.tsx` also records `enemyName` in `battle_start_screen_opened`. The boss workflow uses that existing adapter; its persisted QA game logs preserve this observation. This shared UI logging body is outside the admitted identity-model change. The new `apollyon_opponent_constructed` record is checked separately for UUID identities and absence of display-copy fields.
