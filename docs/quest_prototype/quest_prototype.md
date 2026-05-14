# Quest Prototype

A standalone web prototype of Dreamtides Quest Mode living in this repository
(`~/quest_prototype/`). It reflects the hidden-tides package-based quest flow:
the player chooses from 3 Dreamcallers, the selected Dreamcaller resolves a
fixed package once at quest start, and the run proceeds through draft sites,
Dreamsign surfaces, playable battles, and atlas progression. All state is
in memory and resets on page load.

## Running The Prototype

```bash
cd ~/quest_prototype
npm install          # required; node_modules is not committed
npm run dev          # runs setup-assets.mjs then starts Vite
```

`npm run dev` invokes `scripts/setup-assets.mjs` automatically before starting
Vite. The setup script is idempotent and:

1. Parses `rendered-cards.toml` into `public/card-data.json`.
2. Parses `dreamcallers.toml` into `public/dreamcaller-data.json`.
3. Symlinks `public/cards/{cardNumber}.webp` into the local image cache at
   `~/Library/Caches/io.github.dreamtides.tv/image_cache/`.
4. Copies the tide PNGs into `public/tides/`.

The generated `public/cards/`, `public/tides/`, `public/card-data.json`, and
`public/dreamcaller-data.json` paths are gitignored.

Other commands:

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src/
npm test             # vitest run
npm run build        # production build
```

## Tech Stack

React 19, Vite 7, TypeScript 5.8 in strict mode. Tailwind CSS v4 via
`@tailwindcss/vite` and Framer Motion for animations. The prototype uses
browser-loaded JSON instead of a runtime TOML parser.

TypeScript is configured for bundler mode (`moduleResolution: "bundler"`), so
Node built-in modules are not available in type-checked code. Tests that need
file I/O should mock `fetch` or use Vitest's `node` environment.

## Architecture

All game state lives in one `QuestState` object provided by
`src/state/quest-context.tsx`. The current screen is stored in `state.screen`
and drives the router. The important runtime pieces are:

```text
src/
  data/            normalized quest content and synthetic data
  draft/           fixed-multiset draft engine
  screens/         one file per screen
  state/           quest context and mutations
  types/           quest, content, and draft types
```

Current quest state includes:

- `essence`
- `deck`
- `dreamcaller`
- `resolvedPackage`
- `remainingDreamsignPool`
- `dreamsigns`
- `completionLevel`
- `atlas`
- `currentDreamscape`
- `visitedSites`
- `draftState`
- `screen`
- `activeSiteId`

The hidden package stays out of normal player UI. Debug surfaces can show the
resolved package, selected optional subset, draft pool size, and the remaining
and spent Dreamsign pools.

## Hidden-Tides Behavior

- Dreamcaller selection is a quest-start choice, not a mid-run site.
- Draft sites reveal 4 unique cards when possible and consume the revealed cards
  from the fixed pool.
- Dreamsign-bearing surfaces spend from a shared pool as soon as a sign is
  shown.
- Shops, battle rewards, and similar generators prefer package-adjacent content
  but fall back to the broader pool if nothing overlaps.

## Card Data Normalization

The TOML source has a few field variants that `setup-assets.mjs` normalizes to
JSON:

| Field         | TOML source values           | JSON output    |
| ------------- | ---------------------------- | -------------- |
| `spark`       | absent, `""`, `"*"`, integer | `null` or int  |
| `energy-cost` | `"*"`, integer               | `null` or int  |
| `subtype`     | absent, string               | `""` or string |

The `"*"` value appears on 4 "Abomination" cards for spark and 2 cards for
energy cost. The absent `spark` key appears on some Event cards. Normalize all
three variants to `null`.

Keys are converted from TOML kebab-case to camelCase in JSON output.
