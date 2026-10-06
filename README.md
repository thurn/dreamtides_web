# Dreamtides

Dreamtides is a roguelike deckbuilder that runs in the browser. The player
picks an Avatar, travels a branching map of dreamscapes, drafts and refines a
deck at sites, and fights seven card battles, the last against Apollyon.

- [docs/design.md](docs/design.md): the game and journey design.
- [docs/rules.md](docs/rules.md): the battle rules.
- [AGENTS.md](AGENTS.md): invariants and the working agreement for agents.

## Prerequisites

- Node 24 and npm.
- Optional card art: the TV image cache at
  `~/Library/Caches/io.github.dreamtides.tv/image_cache/`, and Avatar and
  Dreamsign portraits under `~/Documents/synty/avatars/` and
  `~/Documents/dreamsigns/filtered/`. Missing art produces setup warnings and
  broken images, but the game still runs.

## Running

```bash
npm install
npm run dev                  # workspace prep + Vite on :5173
npm run dev -- --port 5174   # any other port
```

Open the `Local` URL Vite prints. Games are local: each one is an event log
stored in the browser's IndexedDB, and `?game=<id>` in the URL selects it. The
front door (`/` or `/main` with no `?game=`) resumes this browser's most
recently played game, or creates a new one and opens Avatar selection when
there is none. Any other entry URL, or one carrying a game-shaping parameter
such as `?seed=` or `?goto=`, starts a new game.

`npm run build` writes a static site to `dist/` and needs no env file. Card
art is served from `public/` unless the build sets `VITE_ASSET_BASE_URL` to
the origin that hosts it (see `.env.example`).

| Command | Purpose |
| --- | --- |
| `npm test -- <path>` | Focused Vitest file |
| `npm run review` | Diff-aware pre-commit check: data validation, lint, typecheck, related tests |
| `npm run review:full` | Everything the Tollgate gate runs |
| `npm run typecheck` | Incremental typecheck |
| `npm run build` | Production build into `dist/` |
| `npm run fuzz:engine -- --games 200` | Seeded rules-engine fuzzer: invariants after every step, replay check, every 10th game replayed interactively through the fold |
| `npm run prepare-workspace` | Refresh art links and generated adapters |

`npm run review` plans its checks from the diff against `master`. Lint covers
`src/` and `scripts/`. The typecheck runs two projects side by side:
`tsconfig.json` for `src/`, and `tsconfig.node.json` for the Vite and Vitest
configs and `scripts/`, whose JavaScript modules it checks through their JSDoc
types. The `src/` typecheck emits declarations only, so an edit that keeps a
module's API rechecks only that module, and a fresh worktree seeds its build
information from `.git/journey-review/`. `review:full` never uses that shared copy.

## Browser QA

QA runs through the globally configured Playwright MCP service
(`http://localhost:8931/mcp`; `playwright-mcp-service start` if it is down)
against your own Vite server on port **5174 or higher**. Port 5173 belongs to
the developer. Never launch browsers directly.

1. **Start and track your server:** `npm run dev -- --port 5174`. It starts a
   process tree (npm, the dev wrapper, and Vite). Stop exactly
   that tree when done, never `pkill -f vite`, and confirm the port is free:
   `lsof -iTCP:5174 -sTCP:LISTEN -n -P`.
2. **Assert before acting.** Before every measurement or screenshot, evaluate
   `() => ({ href: location.href, width: innerWidth, height: innerHeight })`
   and confirm the port and viewport. Set the viewport with `browser_resize`.
3. **Capture errors.** Right after each full navigation, install the buffer:

   ```js
   () => {
     window.__caps = { errors: [], rejections: [], consoleErrors: [] };
     addEventListener('error', e => window.__caps.errors.push(String(e.message)));
     addEventListener('unhandledrejection', e =>
       window.__caps.rejections.push(String(e.reason?.stack || e.reason)));
     const original = console.error;
     console.error = (...args) => {
       window.__caps.consoleErrors.push(args.map(String).join(' | '));
       original.apply(console, args);
     };
     return 'hooks installed';
   }
   ```

   After each meaningful action, `() => window.__caps` must have three empty
   arrays.
4. **Prefer structure over pixels.** Use accessibility snapshots, roles, test
   IDs, and `browser_evaluate` geometry for objective checks; use screenshots
   for appearance. Default budget per changed surface: one desktop capture
   (1440×900), one mobile capture (390×844), one changed interaction state.
   Screenshots go to the gitignored `artifacts/qa/<bead-id>/`; check each with
   `file <path>`.
5. **Close** your browser context with `browser_close` when done.

### URL parameters

Read once at page load (`src/runtime/runtime-config.ts`). Only development
builds honor `goto`, `card`, and `gambleGame`, and only they show the journey
menu's developer commands.

| Parameter | Effect |
| --- | --- |
| `goto=<scene>` | Boot a fresh game straight onto a screen (below) |
| `seed=<n>` | Fixed RNG seed (non-negative integer) |
| `ai=1` | Local AI proposes enemy battle actions for approval |
| `game=<id>` | Open that local game from IndexedDB |
| `gambleGame=<id>` | Force a Gamble game: `three-gate`, `ladder-climb`, `starway-stairs`, `four-suit-reprise`, `blackjack` |
| `card=<uuid>` | With an Exploration scene, use that source card's encounter |
| `tutorialSpeed=<x>` | Tutorial playback speed multiplier |
| `deviceFrame=<json>` | Inject device safe-area and cutout metrics |

### QA scenes (`?goto=`)

Scenes build a valid journey state from live content with the real
generators and park the run on a screen (`src/runtime/qa-scenes.ts`). They
only bootstrap a brand-new game; reloading a `?game=` URL resumes it.

- **Journey start:** `avatar-select`, `tutorial-avatar-select`.
- **Atlas:** `atlas` (same as `atlas2`), `atlas2` … `atlas7` (the frontier on
  layer N), `tutorial-atlas`, `random-site-atlas`.
- **Battle:** `battle` (same as `battle1`), `battle1` … `battle7` (Battle
  Start preview with layer-tuned opponents), `battle-playable`,
  `tutorial-battle1`, `tutorial-battle2`, `tutorial-battle`,
  `tutorial-victory`.
- **Dreamscape and overlays:** `dreamscape`, `dreamscape-with-essence`,
  `reward`, `reward-at-cap`, `deckviewer`, `poolviewer`, `startingdeck`.
- **Sites** (append `-enhanced` for the home version where listed):
  `draft`, `shop`/`-enhanced`, `dreamsignbazaar`/`-enhanced`,
  `dreamsign-revelation`/`-enhanced`, `transfiguration`/`-enhanced`,
  `duplication`/`-enhanced`, `purge`/`-enhanced`, `augury`/`-enhanced`,
  `gamble`/`-enhanced`, `exploration`/`-enhanced`, `exploration-duplicates`,
  `exploration-purchases`, `random-site`, `random-site-home`.
- **End screens:** `journeycomplete`, `journeyfailed`.

Each load logs `debug_qa_scene_loaded`. To add a scene, register it in
`QA_SCENES`; site scenes use the `siteScene` helper.

## Architecture

- **Event log and fold.** Game state is a fold of an event log. The client
  writes intent events only (`src/session/actions.ts`); a pure reducer
  (`src/rules/`) applies them, with time and randomness supplied by the event
  context, so a reload replays to the same state. Each game's log is a
  `LocalLog` (`src/eventlog/local-log.ts`) persisted in IndexedDB; the game
  session (`src/session/`) opens, resumes, and creates games and holds a
  per-game lock so one tab writes a game at a time.
- **Journey rules.** `src/rules/journey/` holds the site, deck, shop, gamble,
  and lifecycle reducers. Generators live beside their domains: `src/atlas/`,
  `src/draft/` (tides4), `src/exploration/`, `src/journey_v2/` (Augury),
  `src/reward-selection/`, `src/shop/`, `src/transfiguration/`.
- **Rules engine.** `src/engine/` is a headless, deterministic battle engine
  (`docs/plan/engine-design.md`). Its state is plain JSON; a step runs rules
  code from one committed state to the next, and `createEngine(catalog)`
  exposes `createBattle`, `decision`, `legalActions`, `apply`, and `view`.
  Step kinds (`steps/kinds/`) and engine events (`events/kinds/`) are each
  registered from their own module. Rules code asks for player input with a
  synchronous `ctx.choose(prompt)`. Inline runs (AI, fuzzer, tests) answer
  at once; interactive play suspends the step and replays it from its start
  with the recorded answers (`fold/slice.ts`), and a prompt fingerprint
  check turns any nondeterminism into a loud `ReplayDivergence`. Abilities
  are typed DSL data beside each entity's printed text in `src/content/`
  (`abilities` plus a `verifiedText` hash, or `pending`/`vanilla`); each DSL
  primitive lives in its own module under `effects/primitives/`, and the
  content gates (`src/engine/content-gates.test.ts`) keep data and engine in
  agreement. The `dreamtides/engine-purity` lint rule
  bans the clock, ambient randomness, and module-level mutable state there.
- **Battle.** `src/battle/` and `src/rules/battle/` hold the battle board,
  its structural automation, and the proposal-based AI.
- **UI.** Screens are built from the Cumulus design system (`src/cumulus/`):
  a view-model builder and adapter in `src/screens/cumulus_adapters/` turn
  journey state into a screen's props, and `src/components/` routes screens
  and hosts journey chrome.
- **Logging.** `src/logging.ts` writes structured events. Every build stores
  each game's journey log in IndexedDB beside its event log, and the game menu
  and the error fallback export it as JSONL; development builds also mirror
  events to `logs/journey-log.jsonl`.

## Data layout

- `src/content/`: the typed content catalogs, which `tsc` validates. Cards,
  Avatars, Dreamsigns, Dreamwell cards, and figments are one module per entity
  under `src/content/<kind>/`, named `<slug>-<uuid8>.ts`, with an explicit
  `index.ts`. Tunables and journey catalogs (battle, opponents, AI, atlas,
  dreamscapes, guides, sites, economy, shop, tides, exploration, gamble,
  augury, transfiguration, tutorial, glossary, resonance, and more) are one
  module each. `src/content/documents.ts` assembles them into the documents
  the runtime loaders validate.
- Art is symlinked into `public/` from the local caches by
  `scripts/setup-assets.ts` (`npm run setup-assets`).
- Test fixtures are synthetic and live in `src/testing/`.

## Conventions

- Identify content by UUID, never by name.
- Tunables live in the catalogs, not as literals in logic.
- Player-facing copy lives in UI modules.
- Tests pin observable contracts with synthetic fixtures; they never assert
  UI copy, timing, statistics, or production data.
- Never commit images or generated outputs.
- Documentation describes the current system.
