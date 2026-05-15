# `src/journeys/`

This directory contains the Dream Journey generator and screen, ported from the
standalone CLI tool at `~/journeys`. It is self-contained: the rest of the
quest prototype interacts with it through a deliberately narrow public surface.

## Public surface

The quest prototype imports exactly two symbols from this module:

```ts
import { JourneyScreen, journeySeedForSite } from "../journeys";
```

- `JourneyScreen` — the React component the dreamscape site router renders for
  a Dream Journey site.
- `journeySeedForSite(site, questState)` — a pure helper that derives the
  deterministic generation seed used to drive the journey RNG.

Both exports live in `./index.ts`. Anything not re-exported from `index.ts` is
considered private to the module.

## Isolation contract

The journeys module is structured so the only place coupled to the rest of the
quest prototype is `src/journeys/adapter/`:

- `src/journeys/adapter/` is the **only** directory permitted to import from
  `src/types/`, `src/state/`, or any other quest prototype code outside
  `src/journeys/`. It is responsible for projecting quest state and content
  into the journey-internal `JourneyContext`.
- `src/journeys/journey/`, `src/journeys/content/`, `src/journeys/ui/`,
  `src/journeys/util/`, and `src/journeys/data/` must only import from within
  `src/journeys/`. They consume the `JourneyContext` produced by the adapter
  and never reach back into prototype-wide types or state.
- `src/journeys/ui/` is the only directory that contains JSX.

Future readers: do not reintroduce coupling. If a journey-internal file needs
quest-state data, add a field to the projection in `adapter/buildContext.ts`
rather than importing from `src/types/` directly.

## Plugin modularity

Adding a shape, predicate, cost template, reward template, or transfiguration
touches exactly one place inside the module. Shape-specific code is forbidden
in `journey/shared/` — shape logic lives in `journey/shapes/<id>/` and
registers itself in `journey/shapes/registry.ts`.

## Reference

Full architecture, isolation rationale, and the porting plan live in the
design doc:

`docs/superpowers/specs/2026-05-15-dream-journey-port-design.md`
