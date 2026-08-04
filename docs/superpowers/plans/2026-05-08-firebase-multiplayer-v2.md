# Firebase Multiplayer V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Firebase Realtime Database and Firebase Hosting multiplayer V2 where two browsers co-pilot one shared journey run through share-link rooms.

**Architecture:** Firebase room state becomes the canonical journey-mode store while React screens continue consuming `useJourney()`. A room gate handles create/join/loading/error states, a Firebase-backed journey provider exposes centralized shared mutations, and browser-local overlays/animations remain in component state. Shared random reveals are stored in `journeyState.siteRuntime` with first-successful-reveal-wins transactions.

**Tech Stack:** React 19, TypeScript 5.8 strict mode, Vite 7, Vitest, Firebase Realtime Database, Firebase Hosting.

---

## File Structure

- Create `firebase.json`: Firebase Hosting config for Vite `dist/` and SPA fallback.
- Create `database.rules.json`: permissive throwaway Realtime Database rules.
- Create `.env.example`: exact Vite Firebase environment variable names.
- Modify `.gitignore`: ignore local env files.
- Modify `package.json` and `package-lock.json`: add `firebase`.
- Create `src/firebase/app-config.ts`: reads Vite env, validates config, initializes Firebase app/database.
- Create `src/firebase/app-config.test.ts`: config parsing and missing-key tests.
- Create `src/multiplayer/room-types.ts`: room metadata, presence, action log, and snapshot types.
- Create `src/multiplayer/room-id.ts`: short room id generation.
- Create `src/multiplayer/room-id.test.ts`: deterministic room id tests.
- Create `src/multiplayer/room-paths.ts`: room path builders and focused update-map builders.
- Create `src/multiplayer/room-paths.test.ts`: proves update builders do not overwrite unrelated journey state.
- Create `src/multiplayer/room-service.ts`: Firebase create, subscribe, presence, transaction, update helpers.
- Create `src/multiplayer/room-service.test.ts`: mocked Firebase service tests.
- Create `src/multiplayer/MultiplayerRoomGate.tsx`: create/join/loading/missing/error shell.
- Create `src/multiplayer/MultiplayerRoomGate.test.tsx`: room-gate component states.
- Modify `src/runtime/runtime-config.ts`: parse `game` room id.
- Modify `src/runtime/runtime-config.test.ts`: cover `game`.
- Modify `docs/journey_prototype/url_parameters.md`: document `game`.
- Modify `src/types/journey.ts`: add typed `siteRuntime`.
- Modify `src/state/journey-context.tsx`: export a reusable journey context provider boundary and add composed mutations to the interface.
- Create `src/state/journey-state-actions.ts`: pure state transition helpers shared by local and Firebase providers.
- Create `src/state/journey-state-actions.test.ts`: pure transition tests.
- Create `src/state/multiplayer-journey-context.tsx`: Firebase-backed provider implementing the journey context API.
- Create `src/state/multiplayer-journey-context.test.tsx`: mocked provider write/subscription tests.
- Modify `src/App.tsx`: wrap journey app with room gate and multiplayer provider.
- Modify `src/App.test.tsx`: update runtime config shape and add shell coverage as needed.
- Modify journey screens that generate shared random data:
  - `src/screens/DraftSiteScreen.tsx`
  - `src/screens/ShopScreen.tsx`
  - `src/screens/SpecialtyShopScreen.tsx`
  - `src/screens/RewardSiteScreen.tsx`
  - `src/screens/DreamsignOfferingScreen.tsx`
  - `src/screens/DreamsignDraftScreen.tsx`
  - `src/screens/EssenceSiteScreen.tsx`
  - `src/screens/TransfigurationSiteScreen.tsx`
  - `src/screens/DuplicationSiteScreen.tsx`
  - `src/screens/DreamJourneyScreen.tsx`
  - `src/screens/TemptingOfferScreen.tsx`
- Add or adjust tests beside each converted screen.
- Create `docs/journey_prototype/firebase_multiplayer.md`: setup, rules, Hosting, and manual two-window QA.

---

### Task 1: Firebase Dependency And Project Files

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Create: `firebase.json`
- Create: `database.rules.json`
- Create: `.env.example`
- Test: `npm run build`

- [ ] **Step 1: Add Firebase package**

Run:

```bash
npm install firebase
```

Expected: `package.json` contains `firebase` under `dependencies`, and `package-lock.json` changes.

- [ ] **Step 2: Add Firebase Hosting config**

Create `firebase.json`:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "database": {
    "rules": "database.rules.json"
  }
}
```

- [ ] **Step 3: Add permissive database rules**

Create `database.rules.json`:

```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": true
    }
  }
}
```

- [ ] **Step 4: Add environment example**

Create `.env.example`:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
```

- [ ] **Step 5: Ignore local environment files**

Append to `.gitignore`:

```gitignore
.env
.env.local
.env.*.local
```

- [ ] **Step 6: Verify the project still builds**

Run:

```bash
npm run build
```

Expected: PASS with Vite production output in `dist/`.

- [ ] **Step 7: Commit and push**

Run:

```bash
git add package.json package-lock.json firebase.json database.rules.json .env.example .gitignore
git commit -m "Add Firebase project scaffolding" -m "Install the Firebase web SDK and add Firebase Hosting, Realtime Database rules, and Vite environment variable examples for the multiplayer V2 room runtime."
git push
```

Expected: commit succeeds and the current branch pushes to `origin`.

---

### Task 2: Firebase App Config Module

**Files:**
- Create: `src/firebase/app-config.test.ts`
- Create: `src/firebase/app-config.ts`
- Test: `npm test -- src/firebase/app-config.test.ts`

- [ ] **Step 1: Write failing config tests**

Create `src/firebase/app-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FirebaseConfigError, readFirebaseConfig } from "./app-config";

const completeEnv = {
  VITE_FIREBASE_API_KEY: "api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "journey.example.firebaseapp.com",
  VITE_FIREBASE_DATABASE_URL: "https://journey.example.firebaseio.com",
  VITE_FIREBASE_PROJECT_ID: "journey-example",
  VITE_FIREBASE_APP_ID: "1:123:web:abc",
  VITE_FIREBASE_STORAGE_BUCKET: "journey.example.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123",
};

describe("readFirebaseConfig", () => {
  it("maps Vite Firebase env values to Firebase config", () => {
    expect(readFirebaseConfig(completeEnv)).toEqual({
      apiKey: "api-key",
      authDomain: "journey.example.firebaseapp.com",
      databaseURL: "https://journey.example.firebaseio.com",
      projectId: "journey-example",
      appId: "1:123:web:abc",
      storageBucket: "journey.example.appspot.com",
      messagingSenderId: "123",
    });
  });

  it("omits blank optional values", () => {
    expect(
      readFirebaseConfig({
        ...completeEnv,
        VITE_FIREBASE_STORAGE_BUCKET: "",
        VITE_FIREBASE_MESSAGING_SENDER_ID: "",
      }),
    ).toEqual({
      apiKey: "api-key",
      authDomain: "journey.example.firebaseapp.com",
      databaseURL: "https://journey.example.firebaseio.com",
      projectId: "journey-example",
      appId: "1:123:web:abc",
    });
  });

  it("throws a typed error listing missing required keys", () => {
    expect(() =>
      readFirebaseConfig({
        VITE_FIREBASE_API_KEY: "",
        VITE_FIREBASE_AUTH_DOMAIN: "journey.example.firebaseapp.com",
        VITE_FIREBASE_DATABASE_URL: "",
        VITE_FIREBASE_PROJECT_ID: "journey-example",
        VITE_FIREBASE_APP_ID: "1:123:web:abc",
      }),
    ).toThrow(FirebaseConfigError);

    try {
      readFirebaseConfig({
        VITE_FIREBASE_API_KEY: "",
        VITE_FIREBASE_AUTH_DOMAIN: "journey.example.firebaseapp.com",
        VITE_FIREBASE_DATABASE_URL: "",
        VITE_FIREBASE_PROJECT_ID: "journey-example",
        VITE_FIREBASE_APP_ID: "1:123:web:abc",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(FirebaseConfigError);
      expect((error as FirebaseConfigError).missingKeys).toEqual([
        "VITE_FIREBASE_API_KEY",
        "VITE_FIREBASE_DATABASE_URL",
      ]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/firebase/app-config.test.ts
```

Expected: FAIL because `src/firebase/app-config.ts` does not exist.

- [ ] **Step 3: Implement Firebase config module**

Create `src/firebase/app-config.ts`:

```ts
import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";

export interface FirebaseRuntimeEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_DATABASE_URL?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
}

const REQUIRED_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_DATABASE_URL",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const satisfies readonly (keyof FirebaseRuntimeEnv)[];

export class FirebaseConfigError extends Error {
  readonly missingKeys: string[];

  constructor(missingKeys: readonly string[]) {
    super(`Missing Firebase config: ${missingKeys.join(", ")}`);
    this.name = "FirebaseConfigError";
    this.missingKeys = [...missingKeys];
  }
}

function present(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

export function readFirebaseConfig(env: FirebaseRuntimeEnv): FirebaseOptions {
  const missingKeys = REQUIRED_KEYS.filter((key) => !present(env[key]));
  if (missingKeys.length > 0) {
    throw new FirebaseConfigError(missingKeys);
  }

  const config: FirebaseOptions = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };

  if (present(env.VITE_FIREBASE_STORAGE_BUCKET)) {
    config.storageBucket = env.VITE_FIREBASE_STORAGE_BUCKET;
  }

  if (present(env.VITE_FIREBASE_MESSAGING_SENDER_ID)) {
    config.messagingSenderId = env.VITE_FIREBASE_MESSAGING_SENDER_ID;
  }

  return config;
}

export function getFirebaseApp(env: FirebaseRuntimeEnv = import.meta.env): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp(readFirebaseConfig(env));
}

export function getFirebaseDatabase(env: FirebaseRuntimeEnv = import.meta.env): Database {
  return getDatabase(getFirebaseApp(env));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/firebase/app-config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit and push**

Run:

```bash
git add src/firebase/app-config.ts src/firebase/app-config.test.ts
git commit -m "Add Firebase app config loader" -m "Introduce typed Vite environment parsing and Firebase app/database initialization for the multiplayer room runtime."
git push
```

Expected: commit succeeds and pushes.

---

### Task 3: Room Types, Ids, And Focused Update Paths

**Files:**
- Create: `src/multiplayer/room-types.ts`
- Create: `src/multiplayer/room-id.ts`
- Create: `src/multiplayer/room-id.test.ts`
- Create: `src/multiplayer/room-paths.ts`
- Create: `src/multiplayer/room-paths.test.ts`
- Test: `npm test -- src/multiplayer/room-id.test.ts src/multiplayer/room-paths.test.ts`

- [ ] **Step 1: Write room id tests**

Create `src/multiplayer/room-id.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateRoomId, isValidRoomId, normalizeRoomId } from "./room-id";

describe("room ids", () => {
  it("generates lowercase share-safe ids", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5]);
    expect(generateRoomId(() => bytes)).toBe("abcdef");
  });

  it("accepts only 4 to 24 lowercase letters and digits", () => {
    expect(isValidRoomId("ab12")).toBe(true);
    expect(isValidRoomId("journeyroom123")).toBe(true);
    expect(isValidRoomId("ABC")).toBe(false);
    expect(isValidRoomId("abc")).toBe(false);
    expect(isValidRoomId("abc_def")).toBe(false);
  });

  it("normalizes user supplied ids", () => {
    expect(normalizeRoomId(" JourneyRoom123 ")).toBe("journeyroom123");
    expect(normalizeRoomId("bad id")).toBeNull();
  });
});
```

- [ ] **Step 2: Write room path tests**

Create `src/multiplayer/room-paths.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { JourneyState } from "../types/journey";
import {
  actionLogPath,
  buildMetadataUpdate,
  buildJourneyFieldUpdate,
  presencePath,
  journeyStatePath,
  roomPath,
} from "./room-paths";

describe("room path helpers", () => {
  it("builds stable Firebase paths", () => {
    expect(roomPath("ab12")).toBe("rooms/ab12");
    expect(journeyStatePath("ab12")).toBe("rooms/ab12/journeyState");
    expect(presencePath("ab12", "client-1")).toBe("rooms/ab12/presence/client-1");
    expect(actionLogPath("ab12", "action-1")).toBe("rooms/ab12/actionLog/action-1");
  });

  it("builds focused journey field updates", () => {
    const update = buildJourneyFieldUpdate("ab12", "essence", 375, "2026-05-08T12:00:00.000Z");

    expect(update).toEqual({
      "rooms/ab12/journeyState/essence": 375,
      "rooms/ab12/metadata/updatedAt": "2026-05-08T12:00:00.000Z",
    });
    expect(Object.keys(update)).not.toContain("rooms/ab12/journeyState");
  });

  it("accepts any top-level journey state field", () => {
    const screen: JourneyState["screen"] = { type: "atlas" };

    expect(buildJourneyFieldUpdate("ab12", "screen", screen, "2026-05-08T12:00:00.000Z")).toEqual({
      "rooms/ab12/journeyState/screen": { type: "atlas" },
      "rooms/ab12/metadata/updatedAt": "2026-05-08T12:00:00.000Z",
    });
  });

  it("builds metadata-only updates", () => {
    expect(buildMetadataUpdate("ab12", "2026-05-08T12:00:00.000Z")).toEqual({
      "rooms/ab12/metadata/updatedAt": "2026-05-08T12:00:00.000Z",
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm test -- src/multiplayer/room-id.test.ts src/multiplayer/room-paths.test.ts
```

Expected: FAIL because the implementation files do not exist.

- [ ] **Step 4: Implement room types**

Create `src/multiplayer/room-types.ts`:

```ts
import type { JourneyState } from "../types/journey";

export const ROOM_SCHEMA_VERSION = 1;
export const ACTION_LOG_LIMIT = 50;

export interface RoomMetadata {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface PresenceEntry {
  connected: boolean;
  lastSeenAt: string;
}

export interface ActionLogEntry {
  timestamp: string;
  actorId: string;
  action: string;
  source: string;
  summary: Record<string, unknown>;
}

export interface MultiplayerRoom {
  metadata: RoomMetadata;
  journeyState: JourneyState | null;
  presence?: Record<string, PresenceEntry>;
  actionLog?: Record<string, ActionLogEntry>;
}

export interface RoomSession {
  roomId: string;
  clientId: string;
  room: MultiplayerRoom;
}

export type RoomLoadState =
  | { status: "idle" }
  | { status: "loading"; roomId: string }
  | { status: "missing"; roomId: string }
  | { status: "ready"; session: RoomSession }
  | { status: "error"; message: string };
```

- [ ] **Step 5: Implement room id helpers**

Create `src/multiplayer/room-id.ts`:

```ts
const ROOM_ID_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";
const DEFAULT_ROOM_ID_LENGTH = 6;
const ROOM_ID_PATTERN = /^[a-z0-9]{4,24}$/;

export type RandomBytes = (length: number) => Uint8Array;

function defaultRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function generateRoomId(
  randomBytes: RandomBytes = defaultRandomBytes,
  length = DEFAULT_ROOM_ID_LENGTH,
): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => ROOM_ID_ALPHABET[byte % ROOM_ID_ALPHABET.length]).join("");
}

export function isValidRoomId(roomId: string): boolean {
  return ROOM_ID_PATTERN.test(roomId);
}

export function normalizeRoomId(roomId: string | null): string | null {
  if (roomId === null) {
    return null;
  }

  const normalized = roomId.trim().toLowerCase();
  return isValidRoomId(normalized) ? normalized : null;
}
```

- [ ] **Step 6: Implement room path helpers**

Create `src/multiplayer/room-paths.ts`:

```ts
import type { JourneyState } from "../types/journey";

export type FirebaseUpdateMap = Record<string, unknown>;

export function roomPath(roomId: string): string {
  return `rooms/${roomId}`;
}

export function journeyStatePath(roomId: string): string {
  return `${roomPath(roomId)}/journeyState`;
}

export function journeyStateFieldPath<K extends keyof JourneyState>(
  roomId: string,
  field: K,
): string {
  return `${journeyStatePath(roomId)}/${String(field)}`;
}

export function metadataUpdatedAtPath(roomId: string): string {
  return `${roomPath(roomId)}/metadata/updatedAt`;
}

export function presencePath(roomId: string, clientId: string): string {
  return `${roomPath(roomId)}/presence/${clientId}`;
}

export function actionLogPath(roomId: string, actionId: string): string {
  return `${roomPath(roomId)}/actionLog/${actionId}`;
}

export function buildJourneyFieldUpdate<K extends keyof JourneyState>(
  roomId: string,
  field: K,
  value: JourneyState[K],
  updatedAt: string,
): FirebaseUpdateMap {
  return {
    [journeyStateFieldPath(roomId, field)]: value,
    [metadataUpdatedAtPath(roomId)]: updatedAt,
  };
}

export function buildMetadataUpdate(
  roomId: string,
  updatedAt: string,
): FirebaseUpdateMap {
  return {
    [metadataUpdatedAtPath(roomId)]: updatedAt,
  };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run:

```bash
npm test -- src/multiplayer/room-id.test.ts src/multiplayer/room-paths.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit and push**

Run:

```bash
git add src/multiplayer/room-types.ts src/multiplayer/room-id.ts src/multiplayer/room-id.test.ts src/multiplayer/room-paths.ts src/multiplayer/room-paths.test.ts
git commit -m "Add multiplayer room primitives" -m "Define Firebase room metadata, presence, action log types, share-safe room id generation, and focused update path helpers for field-scoped journey writes."
git push
```

Expected: commit succeeds and pushes.

---

### Task 4: Runtime `game` Parameter

**Files:**
- Modify: `src/runtime/runtime-config.ts`
- Modify: `src/runtime/runtime-config.test.ts`
- Modify: `docs/journey_prototype/url_parameters.md`
- Test: `npm test -- src/runtime/runtime-config.test.ts`

- [ ] **Step 1: Add failing runtime config tests**

Update the default expectation in `src/runtime/runtime-config.test.ts`:

```ts
expect(parseRuntimeConfig("")).toEqual({
  seedOverride: null,
  startInBattle: false,
  enableAi: false,
  gameId: null,
});
```

Add this describe block:

```ts
describe("gameId", () => {
  it("returns a normalized game id from game", () => {
    expect(parseRuntimeConfig("?game=JourneyRoom123").gameId).toBe("journeyroom123");
  });

  it("returns null for invalid game ids", () => {
    expect(parseRuntimeConfig("?game=abc").gameId).toBeNull();
    expect(parseRuntimeConfig("?game=bad_id").gameId).toBeNull();
    expect(parseRuntimeConfig("?game=").gameId).toBeNull();
  });
});
```

Update every inline `RuntimeConfig` test value in the repo to include `gameId: null`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/runtime/runtime-config.test.ts
```

Expected: FAIL because `gameId` is missing from `RuntimeConfig`.

- [ ] **Step 3: Implement `gameId` parsing**

Modify `src/runtime/runtime-config.ts`:

```ts
import { normalizeRoomId } from "../multiplayer/room-id";

export interface RuntimeConfig {
  seedOverride: number | null;
  startInBattle: boolean;
  enableAi: boolean;
  gameId: string | null;
}

export function parseRuntimeConfig(search: string): RuntimeConfig {
  const params = new URLSearchParams(search);
  return {
    seedOverride: parseSeedOverride(params.get("seed")),
    startInBattle: params.get("startInBattle") === "1",
    enableAi: params.get("enableAi") === "1",
    gameId: normalizeRoomId(params.get("game")),
  };
}
```

Keep the existing `parseSeedOverride` function unchanged.

- [ ] **Step 4: Document `game`**

Add this section to `docs/journey_prototype/url_parameters.md`:

```markdown
## `game`

Identifies the Firebase multiplayer room to join. The value is normalized to
lowercase and must be 4 to 24 lowercase letters or digits after normalization.
Invalid values are treated as an absent room id.

When `game` is absent, the multiplayer shell shows the create-game screen.

Example:

```
http://localhost:5173/?game=journey42
```
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/runtime/runtime-config.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 6: Commit and push**

Run:

```bash
git add src/runtime/runtime-config.ts src/runtime/runtime-config.test.ts src/App.test.tsx docs/journey_prototype/url_parameters.md
git commit -m "Parse multiplayer game room parameter" -m "Add normalized game room ids to runtime configuration and document the share-link query parameter used by the Firebase multiplayer shell."
git push
```

Expected: commit succeeds and pushes.

---

### Task 5: Firebase Room Service

**Files:**
- Create: `src/multiplayer/room-service.test.ts`
- Create: `src/multiplayer/room-service.ts`
- Test: `npm test -- src/multiplayer/room-service.test.ts`

- [ ] **Step 1: Write room service tests with mocked Firebase**

Create `src/multiplayer/room-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MultiplayerRoom } from "./room-types";
import {
  createRoom,
  createRoomRecord,
  runRoomTransaction,
  subscribeToRoom,
  writePresence,
} from "./room-service";

const setMock = vi.fn();
const refMock = vi.fn((_database: unknown, path: string) => ({ path }));
const onValueMock = vi.fn();
const onDisconnectMock = vi.fn(() => ({ remove: vi.fn() }));
const runTransactionMock = vi.fn();
const updateMock = vi.fn();

vi.mock("firebase/database", () => ({
  onDisconnect: (...args: unknown[]) => onDisconnectMock(...args),
  onValue: (...args: unknown[]) => onValueMock(...args),
  ref: (...args: unknown[]) => refMock(...args),
  runTransaction: (...args: unknown[]) => runTransactionMock(...args),
  set: (...args: unknown[]) => setMock(...args),
  update: (...args: unknown[]) => updateMock(...args),
}));

describe("room-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an empty room record", () => {
    expect(createRoomRecord("2026-05-08T12:00:00.000Z")).toEqual({
      metadata: {
        schemaVersion: 1,
        createdAt: "2026-05-08T12:00:00.000Z",
        updatedAt: "2026-05-08T12:00:00.000Z",
      },
      journeyState: null,
      presence: {},
      actionLog: {},
    });
  });

  it("writes a room to the room path", async () => {
    await createRoom({}, "ab12", "2026-05-08T12:00:00.000Z");

    expect(refMock).toHaveBeenCalledWith({}, "rooms/ab12");
    expect(setMock).toHaveBeenCalledWith(
      { path: "rooms/ab12" },
      createRoomRecord("2026-05-08T12:00:00.000Z"),
    );
  });

  it("subscribes to ready and missing room snapshots", () => {
    const unsubscribe = vi.fn();
    onValueMock.mockImplementation((_roomRef, onNext) => {
      onNext({
        exists: () => true,
        val: () =>
          ({
            metadata: {
              schemaVersion: 1,
              createdAt: "2026-05-08T12:00:00.000Z",
              updatedAt: "2026-05-08T12:00:00.000Z",
            },
            journeyState: null,
          }) satisfies MultiplayerRoom,
      });
      return unsubscribe;
    });
    const listener = vi.fn();

    const returned = subscribeToRoom({}, "ab12", listener);

    expect(refMock).toHaveBeenCalledWith({}, "rooms/ab12");
    expect(listener).toHaveBeenCalledWith({
      status: "ready",
      room: {
        metadata: {
          schemaVersion: 1,
          createdAt: "2026-05-08T12:00:00.000Z",
          updatedAt: "2026-05-08T12:00:00.000Z",
        },
        journeyState: null,
      },
    });
    expect(returned).toBe(unsubscribe);
  });

  it("writes presence and schedules disconnect cleanup", async () => {
    await writePresence({}, "ab12", "client-1", "2026-05-08T12:00:00.000Z");

    expect(refMock).toHaveBeenCalledWith({}, "rooms/ab12/presence/client-1");
    expect(setMock).toHaveBeenCalledWith(
      { path: "rooms/ab12/presence/client-1" },
      {
        connected: true,
        lastSeenAt: "2026-05-08T12:00:00.000Z",
      },
    );
    expect(onDisconnectMock).toHaveBeenCalledWith({
      path: "rooms/ab12/presence/client-1",
    });
  });

  it("runs a transaction against the room root", async () => {
    runTransactionMock.mockImplementation(async (_roomRef, updater) => {
      const next = updater(createRoomRecord("2026-05-08T12:00:00.000Z"));
      return {
        committed: true,
        snapshot: { val: () => next },
      };
    });

    await runRoomTransaction({}, "ab12", (room) =>
      room === null
        ? undefined
        : {
            ...room,
            metadata: {
              ...room.metadata,
              updatedAt: "2026-05-08T12:01:00.000Z",
            },
          },
    );

    expect(refMock).toHaveBeenCalledWith({}, "rooms/ab12");
    expect(runTransactionMock).toHaveBeenCalledWith(
      { path: "rooms/ab12" },
      expect.any(Function),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/multiplayer/room-service.test.ts
```

Expected: FAIL because `room-service.ts` does not exist.

- [ ] **Step 3: Implement room service**

Create `src/multiplayer/room-service.ts`:

```ts
import {
  onDisconnect,
  onValue,
  ref,
  runTransaction,
  set,
  update,
  type Database,
  type Unsubscribe,
} from "firebase/database";
import { roomPath, presencePath, type FirebaseUpdateMap } from "./room-paths";
import {
  ROOM_SCHEMA_VERSION,
  type MultiplayerRoom,
  type PresenceEntry,
  type RoomMetadata,
} from "./room-types";

export type RoomSubscriptionSnapshot =
  | { status: "ready"; room: MultiplayerRoom }
  | { status: "missing" }
  | { status: "error"; message: string };

export function createRoomRecord(nowIso: string): MultiplayerRoom {
  const metadata: RoomMetadata = {
    schemaVersion: ROOM_SCHEMA_VERSION,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return {
    metadata,
    journeyState: null,
    presence: {},
    actionLog: {},
  };
}

export async function createRoom(
  database: Database,
  roomId: string,
  nowIso = new Date().toISOString(),
): Promise<void> {
  await set(ref(database, roomPath(roomId)), createRoomRecord(nowIso));
}

export function subscribeToRoom(
  database: Database,
  roomId: string,
  listener: (snapshot: RoomSubscriptionSnapshot) => void,
): Unsubscribe {
  return onValue(
    ref(database, roomPath(roomId)),
    (snapshot) => {
      if (!snapshot.exists()) {
        listener({ status: "missing" });
        return;
      }

      listener({ status: "ready", room: snapshot.val() as MultiplayerRoom });
    },
    (error) => {
      listener({ status: "error", message: error.message });
    },
  );
}

export async function writeRoomUpdate(
  database: Database,
  updateMap: FirebaseUpdateMap,
): Promise<void> {
  await update(ref(database), updateMap);
}

export async function runRoomTransaction(
  database: Database,
  roomId: string,
  updater: (room: MultiplayerRoom | null) => MultiplayerRoom | undefined,
): Promise<void> {
  await runTransaction(ref(database, roomPath(roomId)), (current) => {
    const next = updater(current as MultiplayerRoom | null);
    return next === undefined ? current : next;
  });
}

export async function writePresence(
  database: Database,
  roomId: string,
  clientId: string,
  nowIso = new Date().toISOString(),
): Promise<void> {
  const entry: PresenceEntry = {
    connected: true,
    lastSeenAt: nowIso,
  };
  const entryRef = ref(database, presencePath(roomId, clientId));
  await set(entryRef, entry);
  onDisconnect(entryRef).remove();
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- src/multiplayer/room-service.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/multiplayer/room-service.ts src/multiplayer/room-service.test.ts
git commit -m "Add Firebase room service" -m "Provide typed helpers for creating rooms, subscribing to room snapshots, writing focused updates, and recording lightweight player presence."
git push
```

Expected: commit succeeds and pushes.

---

### Task 6: Multiplayer Room Gate UI

**Files:**
- Create: `src/multiplayer/MultiplayerRoomGate.test.tsx`
- Create: `src/multiplayer/MultiplayerRoomGate.tsx`
- Test: `npm test -- src/multiplayer/MultiplayerRoomGate.test.tsx`

- [ ] **Step 1: Write room gate tests**

Create `src/multiplayer/MultiplayerRoomGate.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MultiplayerRoom } from "./room-types";
import { MultiplayerRoomGate } from "./MultiplayerRoomGate";

const createRoomMock = vi.fn();
const subscribeToRoomMock = vi.fn();
const writePresenceMock = vi.fn();
const generateRoomIdMock = vi.fn(() => "ab12cd");

vi.mock("./room-service", () => ({
  createRoom: (...args: unknown[]) => createRoomMock(...args),
  subscribeToRoom: (...args: unknown[]) => subscribeToRoomMock(...args),
  writePresence: (...args: unknown[]) => writePresenceMock(...args),
}));

vi.mock("./room-id", () => ({
  generateRoomId: () => generateRoomIdMock(),
}));

function mount(element: React.ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function room(): MultiplayerRoom {
  return {
    metadata: {
      schemaVersion: 1,
      createdAt: "2026-05-08T12:00:00.000Z",
      updatedAt: "2026-05-08T12:00:00.000Z",
    },
    journeyState: null,
    presence: {},
    actionLog: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("MultiplayerRoomGate", () => {
  it("shows create game when no game id is present", () => {
    const { container } = mount(
      <MultiplayerRoomGate database={{}} gameId={null}>
        {() => <div>Journey App</div>}
      </MultiplayerRoomGate>,
    );

    expect(container.textContent).toContain("Create Game");
  });

  it("creates a room and navigates to a share link", async () => {
    createRoomMock.mockResolvedValue(undefined);
    const { container } = mount(
      <MultiplayerRoomGate database={{}} gameId={null}>
        {() => <div>Journey App</div>}
      </MultiplayerRoomGate>,
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-create-game]")?.click();
    });

    expect(createRoomMock).toHaveBeenCalledWith({}, "ab12cd", expect.any(String));
    expect(window.location.search).toBe("?game=ab12cd");
  });

  it("renders children when the subscribed room is ready", () => {
    subscribeToRoomMock.mockImplementation((_database, _roomId, listener) => {
      listener({ status: "ready", room: room() });
      return vi.fn();
    });

    const { container } = mount(
      <MultiplayerRoomGate database={{}} gameId="ab12cd">
        {(session) => <div>Room {session.roomId}</div>}
      </MultiplayerRoomGate>,
    );

    expect(container.textContent).toContain("Room ab12cd");
    expect(writePresenceMock).toHaveBeenCalledWith({}, "ab12cd", expect.any(String), expect.any(String));
  });

  it("shows missing room state", () => {
    subscribeToRoomMock.mockImplementation((_database, _roomId, listener) => {
      listener({ status: "missing" });
      return vi.fn();
    });

    const { container } = mount(
      <MultiplayerRoomGate database={{}} gameId="ab12cd">
        {() => <div>Journey App</div>}
      </MultiplayerRoomGate>,
    );

    expect(container.textContent).toContain("Game not found");
  });

  it("shows Firebase errors", () => {
    subscribeToRoomMock.mockImplementation((_database, _roomId, listener) => {
      listener({ status: "error", message: "Permission denied" });
      return vi.fn();
    });

    const { container } = mount(
      <MultiplayerRoomGate database={{}} gameId="ab12cd">
        {() => <div>Journey App</div>}
      </MultiplayerRoomGate>,
    );

    expect(container.textContent).toContain("Permission denied");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/multiplayer/MultiplayerRoomGate.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement room gate**

Create `src/multiplayer/MultiplayerRoomGate.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Database } from "firebase/database";
import { generateRoomId } from "./room-id";
import { createRoom, subscribeToRoom, writePresence } from "./room-service";
import type { MultiplayerRoom, RoomSession } from "./room-types";

interface MultiplayerRoomGateProps {
  database: Database;
  gameId: string | null;
  children: (session: RoomSession) => ReactNode;
}

type GateState =
  | { status: "create" }
  | { status: "creating" }
  | { status: "loading"; roomId: string }
  | { status: "missing"; roomId: string }
  | { status: "ready"; room: MultiplayerRoom; roomId: string }
  | { status: "error"; message: string };

function createClientId(): string {
  return `client-${crypto.randomUUID()}`;
}

function navigateToRoom(roomId: string): void {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("game", roomId);
  window.history.pushState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
}

export function MultiplayerRoomGate({
  database,
  gameId,
  children,
}: MultiplayerRoomGateProps) {
  const [gateState, setGateState] = useState<GateState>(
    gameId === null ? { status: "create" } : { status: "loading", roomId: gameId },
  );
  const clientId = useMemo(createClientId, []);

  useEffect(() => {
    if (gameId === null) {
      setGateState({ status: "create" });
      return undefined;
    }

    setGateState({ status: "loading", roomId: gameId });
    const unsubscribe = subscribeToRoom(database, gameId, (snapshot) => {
      if (snapshot.status === "ready") {
        setGateState({ status: "ready", roomId: gameId, room: snapshot.room });
        void writePresence(database, gameId, clientId);
        return;
      }

      if (snapshot.status === "missing") {
        setGateState({ status: "missing", roomId: gameId });
        return;
      }

      setGateState({ status: "error", message: snapshot.message });
    });

    return unsubscribe;
  }, [clientId, database, gameId]);

  const handleCreateGame = useCallback(async () => {
    const roomId = generateRoomId();
    setGateState({ status: "creating" });
    try {
      await createRoom(database, roomId);
      navigateToRoom(roomId);
      setGateState({ status: "loading", roomId });
    } catch (error) {
      setGateState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to create game.",
      });
    }
  }, [database]);

  if (gateState.status === "ready") {
    return (
      <>
        <ConnectionIndicator room={gateState.room} />
        {children({ roomId: gateState.roomId, clientId, room: gateState.room })}
      </>
    );
  }

  if (gateState.status === "create") {
    return (
      <RoomShell title="Journey Multiplayer">
        <button data-create-game type="button" onClick={() => void handleCreateGame()}>
          Create Game
        </button>
      </RoomShell>
    );
  }

  if (gateState.status === "creating") {
    return <RoomShell title="Creating game">Preparing shared room...</RoomShell>;
  }

  if (gateState.status === "loading") {
    return <RoomShell title="Joining game">Loading {gateState.roomId}...</RoomShell>;
  }

  if (gateState.status === "missing") {
    return (
      <RoomShell title="Game not found">
        <button data-create-game type="button" onClick={() => void handleCreateGame()}>
          Create New Game
        </button>
      </RoomShell>
    );
  }

  return (
    <RoomShell title="Firebase setup issue">
      <pre>{gateState.message}</pre>
      <p>Required env: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_DATABASE_URL, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID.</p>
    </RoomShell>
  );
}

function RoomShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-bold">{title}</h1>
      <div className="text-sm opacity-80">{children}</div>
    </main>
  );
}

function ConnectionIndicator({ room }: { room: MultiplayerRoom }) {
  const connectedCount = Object.values(room.presence ?? {}).filter((entry) => entry.connected).length;
  return (
    <div className="fixed top-2 right-2 z-50 rounded bg-black/70 px-2 py-1 text-xs text-white">
      {String(connectedCount)} connected
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- src/multiplayer/MultiplayerRoomGate.test.tsx
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/multiplayer/MultiplayerRoomGate.tsx src/multiplayer/MultiplayerRoomGate.test.tsx
git commit -m "Add multiplayer room gate" -m "Render create, loading, missing-room, ready, presence, and Firebase error states for share-link multiplayer rooms."
git push
```

Expected: commit succeeds and pushes.

---

### Task 7: Shared Site Runtime Types

**Files:**
- Modify: `src/types/journey.ts`
- Modify: `src/state/journey-context.tsx`
- Modify: `src/state/journey-state-machine.test.ts`
- Modify: tests with `JourneyState` literals as needed
- Test: `npm test -- src/state/journey-state-machine.test.ts`

- [ ] **Step 1: Add failing default-state expectation**

In `src/state/journey-state-machine.test.ts`, update the default state contract test:

```ts
expect(state.siteRuntime).toEqual({});
```

Update every local `JourneyState` test factory in `src/App.test.tsx`, `src/components/BattleSiteRoute.test.tsx`, and screen tests that construct a full `JourneyState` to include:

```ts
siteRuntime: {},
```

- [ ] **Step 2: Run targeted test to verify it fails**

Run:

```bash
npm test -- src/state/journey-state-machine.test.ts
```

Expected: FAIL because `siteRuntime` is not in `JourneyState`.

- [ ] **Step 3: Add serializable site-runtime types**

In `src/types/journey.ts`, add these types before `JourneyState`:

```ts
export type RuntimeShopSlot =
  | {
      itemType: "card";
      cardNumber: number;
      basePrice: number;
      discountPercent: number;
      purchased: boolean;
    }
  | {
      itemType: "dreamsign";
      dreamsign: Dreamsign;
      basePrice: number;
      discountPercent: number;
      purchased: boolean;
    }
  | {
      itemType: "reroll";
      basePrice: number;
      discountPercent: number;
      purchased: boolean;
    };

export interface ShopSiteRuntime {
  kind: "shop";
  slots: RuntimeShopSlot[];
  rerollCount: number;
  remainingDreamsignPoolIds: string[];
}

export interface RewardSiteRuntime {
  kind: "reward";
  reward:
    | { rewardType: "card"; cardNumber: number; cardName: string }
    | { rewardType: "dreamsign"; dreamsignId: string; dreamsignName: string; dreamsignEffect: string }
    | { rewardType: "essence"; essenceAmount: number };
  remainingDreamsignPoolIds: string[];
  accepted: boolean;
}

export interface DreamsignOfferSiteRuntime {
  kind: "dreamsignOffer";
  offeredDreamsigns: Dreamsign[];
  remainingDreamsignPool: string[];
  accepted: boolean;
}

export interface EssenceSiteRuntime {
  kind: "essence";
  amount: number;
  accepted: boolean;
}

export interface CardChoiceSiteRuntime {
  kind: "cardChoice";
  entryIds: string[];
  acceptedEntryIds: string[];
}

export interface DreamJourneySiteRuntime {
  kind: "dreamJourney";
  optionIds: string[];
  completed: boolean;
}

export interface TemptingOfferSiteRuntime {
  kind: "temptingOffer";
  optionIds: string[];
  completed: boolean;
}

export type SiteRuntimeState =
  | ShopSiteRuntime
  | RewardSiteRuntime
  | DreamsignOfferSiteRuntime
  | EssenceSiteRuntime
  | CardChoiceSiteRuntime
  | DreamJourneySiteRuntime
  | TemptingOfferSiteRuntime;
```

Add to `JourneyState`:

```ts
siteRuntime: Record<string, SiteRuntimeState>;
```

- [ ] **Step 4: Initialize site runtime**

In `createDefaultState()` in `src/state/journey-context.tsx`, add:

```ts
siteRuntime: {},
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/state/journey-state-machine.test.ts
npm run typecheck
```

Expected: both commands PASS after updating all `JourneyState` literals.

- [ ] **Step 6: Commit and push**

Run:

```bash
git add src/types/journey.ts src/state/journey-context.tsx src/state/journey-state-machine.test.ts src/App.test.tsx src/components/BattleSiteRoute.test.tsx src/screens/*.test.tsx src/runtime/*.test.ts
git commit -m "Add shared site runtime state" -m "Extend JourneyState with typed site runtime data for multiplayer-safe random reveals and initialize the field in default journey state and tests."
git push
```

Expected: commit succeeds and pushes.

---

### Task 8: Pure Journey State Actions

**Files:**
- Create: `src/state/journey-state-actions.test.ts`
- Create: `src/state/journey-state-actions.ts`
- Modify: `src/state/journey-context.tsx`
- Test: `npm test -- src/state/journey-state-actions.test.ts`

- [ ] **Step 1: Write pure action tests**

Create `src/state/journey-state-actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import type { CardData } from "../types/cards";
import type { JourneyContent } from "../data/journey-content";
import type { ResolvedDreamAvatarPackage } from "../types/content";
import { createDefaultState } from "./journey-context";
import {
  addCardToJourneyState,
  changeJourneyEssence,
  completeJourneySite,
  startJourneyFromDreamAvatar,
} from "./journey-state-actions";

function card(cardNumber: number): CardData {
  return {
    cardNumber,
    name: `Card ${String(cardNumber)}`,
    cardType: "Character",
    rarity: "Common",
    energyCost: 1,
    spark: 1,
    rulesText: "",
    flavorText: "",
    subtype: "",
    tides: [],
  };
}

function resolvedPackage(): ResolvedDreamAvatarPackage {
  return {
    dreamAvatar: {
      id: "dream-avatar-1",
      name: "DreamAvatar",
      title: "Title",
      awakening: 3,
      renderedText: "Text",
      imageNumber: "0001",
      mandatoryTides: ["core"],
      optionalTides: ["support-a", "support-b", "support-c"],
    },
    mandatoryTides: ["core"],
    optionalSubset: ["support-a", "support-b", "support-c"],
    selectedTides: ["core", "support-a", "support-b", "support-c"],
    draftPoolCopiesByCard: { "101": 2, "102": 2, "103": 2, "104": 2 },
    dreamsignPoolIds: ["sign-1"],
    mandatoryOnlyPoolSize: 4,
    draftPoolSize: 8,
    doubledCardCount: 0,
    legalSubsetCount: 1,
    preferredSubsetCount: 1,
  };
}

function content(pkg = resolvedPackage()): JourneyContent {
  const cardDatabase = new Map<number, CardData>(
    [...STARTER_CARD_NUMBERS, 101, 102, 103, 104].map((cardNumber) => [cardNumber, card(cardNumber)]),
  );
  return {
    cardDatabase,
    cardsByPackageTide: new Map(),
    dreamAvatars: [pkg.dreamAvatar],
    dreamsignTemplates: [],
    resolvedPackagesByDreamAvatarId: new Map([[pkg.dreamAvatar.id, pkg]]),
  };
}

describe("journey-state-actions", () => {
  it("changes essence without touching deck", () => {
    const state = createDefaultState();
    const next = changeJourneyEssence(state, 25);

    expect(next.essence).toBe(275);
    expect(next.deck).toBe(state.deck);
  });

  it("adds a card with a stable next deck id", () => {
    const state = {
      ...createDefaultState(),
      deck: [{ entryId: "deck-7", cardNumber: 1, transfiguration: null, isBane: false }],
    };

    const next = addCardToJourneyState(state, 99, false);

    expect(next.deck.at(-1)).toEqual({
      entryId: "deck-8",
      cardNumber: 99,
      transfiguration: null,
      isBane: false,
    });
  });

  it("starts a journey from a dreamAvatar in one complete state transition", () => {
    const pkg = resolvedPackage();
    const next = startJourneyFromDreamAvatar({
      prev: createDefaultState(),
      dreamAvatar: pkg.dreamAvatar,
      journeyContent: content(pkg),
    });

    expect(next.dreamAvatar?.id).toBe("dream-avatar-1");
    expect(next.resolvedPackage).toEqual(pkg);
    expect(next.remainingDreamsignPool).toEqual(["sign-1"]);
    expect(next.draftState?.remainingCopiesByCard).toEqual(pkg.draftPoolCopiesByCard);
    expect(next.deck.map((entry) => entry.cardNumber)).toEqual(STARTER_CARD_NUMBERS);
    expect(next.screen.type).toBe("dreamscape");
  });

  it("marks a site visited without replacing unrelated runtime data", () => {
    const state = {
      ...createDefaultState(),
      currentDreamscape: "dreamscape-1",
      siteRuntime: {
        "site-1": { kind: "essence", amount: 250, accepted: false },
      },
      atlas: {
        nexusId: "nexus",
        edges: [],
        nodes: {
          "dreamscape-1": {
            id: "dreamscape-1",
            biomeName: "Biome",
            biomeColor: "#fff",
            position: { x: 0, y: 0 },
            status: "available",
            enhancedSiteType: null,
            sites: [{ id: "site-1", type: "Essence", isEnhanced: false, isVisited: false }],
          },
        },
      },
    };

    const next = completeJourneySite(state, "site-1");

    expect(next.visitedSites).toEqual(["site-1"]);
    expect(next.siteRuntime["site-1"]).toEqual({ kind: "essence", amount: 250, accepted: false });
    expect(next.atlas.nodes["dreamscape-1"]?.sites[0].isVisited).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/state/journey-state-actions.test.ts
```

Expected: FAIL because `journey-state-actions.ts` does not exist.

- [ ] **Step 3: Implement pure state actions**

Create `src/state/journey-state-actions.ts`:

```ts
import { generateInitialAtlas } from "../atlas/atlas-generator";
import { initializeDraftState } from "../draft/draft-engine";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import type { JourneyContent } from "../data/journey-content";
import { toJourneyDreamAvatar } from "../data/dream-avatar-selection";
import type { DreamAvatarContent } from "../types/content";
import type { DeckEntry, DreamAtlas, JourneyState, Screen } from "../types/journey";
import { deriveEntryIdCounter } from "./journey-context";

export function nextDeckEntryId(deck: readonly DeckEntry[]): string {
  return `deck-${String(deriveEntryIdCounter(deck) + 1)}`;
}

export function changeJourneyEssence(prev: JourneyState, delta: number): JourneyState {
  return {
    ...prev,
    essence: prev.essence + delta,
  };
}

export function addCardToJourneyState(
  prev: JourneyState,
  cardNumber: number,
  isNightmare: boolean,
): JourneyState {
  return {
    ...prev,
    deck: [
      ...prev.deck,
      {
        entryId: nextDeckEntryId(prev.deck),
        cardNumber,
        transfiguration: null,
        isBane: isNightmare,
      },
    ],
  };
}

export function setJourneyScreen(prev: JourneyState, screen: Screen): JourneyState {
  return {
    ...prev,
    screen,
    activeSiteId: screen.type === "site" ? screen.siteId : null,
  };
}

export function updateJourneyAtlas(prev: JourneyState, atlas: DreamAtlas): JourneyState {
  return {
    ...prev,
    atlas,
  };
}

export function completeJourneySite(prev: JourneyState, siteId: string): JourneyState {
  if (prev.visitedSites.includes(siteId)) {
    return prev;
  }

  const updatedNodes = { ...prev.atlas.nodes };
  for (const [nodeId, node] of Object.entries(updatedNodes)) {
    const siteIndex = node.sites.findIndex((site) => site.id === siteId);
    if (siteIndex !== -1) {
      updatedNodes[nodeId] = {
        ...node,
        sites: node.sites.map((site, index) =>
          index === siteIndex ? { ...site, isVisited: true } : site,
        ),
      };
      break;
    }
  }

  return {
    ...prev,
    visitedSites: [...prev.visitedSites, siteId],
    atlas: { ...prev.atlas, nodes: updatedNodes },
  };
}

export function startJourneyFromDreamAvatar({
  prev,
  dreamAvatar,
  journeyContent,
}: {
  prev: JourneyState;
  dreamAvatar: DreamAvatarContent;
  journeyContent: JourneyContent;
}): JourneyState {
  const resolvedPackage = journeyContent.resolvedPackagesByDreamAvatarId.get(dreamAvatar.id);
  if (resolvedPackage === undefined) {
    throw new Error(`Missing resolved package for ${dreamAvatar.id}`);
  }

  const starterCardNumbers = STARTER_CARD_NUMBERS.filter(
    (cardNumber) => !prev.deck.some((entry) => entry.cardNumber === cardNumber),
  );
  const deck = starterCardNumbers.reduce(
    (currentDeck, cardNumber) => [
      ...currentDeck,
      {
        entryId: nextDeckEntryId(currentDeck),
        cardNumber,
        transfiguration: null,
        isBane: false,
      },
    ],
    prev.deck,
  );
  const playerHasNightmare = deck.some((entry) => entry.isBane);
  const atlas = generateInitialAtlas(prev.completionLevel, { playerHasNightmare });
  const firstNode = Object.values(atlas.nodes).find((node) => node.status === "available");

  return {
    ...prev,
    deck,
    dreamAvatar: toJourneyDreamAvatar(resolvedPackage.dreamAvatar),
    resolvedPackage,
    remainingDreamsignPool: [...resolvedPackage.dreamsignPoolIds],
    draftState: initializeDraftState(journeyContent.cardDatabase, resolvedPackage),
    atlas,
    currentDreamscape: firstNode?.id ?? null,
    visitedSites: firstNode === undefined ? prev.visitedSites : [],
    screen: firstNode === undefined ? { type: "atlas" } : { type: "dreamscape" },
    activeSiteId: null,
  };
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- src/state/journey-state-actions.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/state/journey-state-actions.ts src/state/journey-state-actions.test.ts
git commit -m "Add pure journey state actions" -m "Introduce reusable state transition helpers for Firebase composed writes while keeping existing journey screens behind the journey context API."
git push
```

Expected: commit succeeds and pushes.

---

### Task 9: Firebase-Backed Journey Provider Skeleton

**Files:**
- Modify: `src/state/journey-context.tsx`
- Create: `src/state/multiplayer-journey-context.test.tsx`
- Create: `src/state/multiplayer-journey-context.tsx`
- Test: `npm test -- src/state/multiplayer-journey-context.test.tsx`

- [ ] **Step 1: Export a reusable context provider**

Modify `src/state/journey-context.tsx` so the context can be provided by the Firebase provider:

```tsx
export const JourneyContext = createContext<JourneyContextValue | null>(null);

export function JourneyContextProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: JourneyContextValue;
}) {
  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}
```

Replace the existing `<JourneyContext.Provider value={value}>` in `JourneyProvider` with:

```tsx
<JourneyContextProvider value={value}>
  <PlayableBattleCacheProvider cache={playableBattleCache}>
    {children}
  </PlayableBattleCacheProvider>
</JourneyContextProvider>
```

- [ ] **Step 2: Add composed mutation names to the interface**

Extend `JourneyMutations` in `src/state/journey-context.tsx`:

```ts
startJourney: (dreamAvatar: DreamAvatarContent) => void;
completeSite: (siteId: string, source: string) => void;
pickDraftCard: (siteId: string, cardNumber: number) => void;
```

Import `DreamAvatarContent` from `../types/content`. In the local `JourneyProvider`, implement these as wrappers around existing logic:

```ts
const startJourney = useCallback(
  (dreamAvatar: DreamAvatarContent) => {
    setState((prev) =>
      startJourneyFromDreamAvatar({
        prev,
        dreamAvatar,
        journeyContent,
      }),
    );
  },
  [journeyContent],
);

const completeSite = useCallback((siteId: string, _source: string) => {
  setState((prev) => setJourneyScreen(completeJourneySite(prev, siteId), { type: "dreamscape" }));
}, []);

const pickDraftCard = useCallback((_siteId: string, _cardNumber: number) => {
  throw new Error("pickDraftCard is provided by the multiplayer provider after draft conversion");
}, []);
```

Add the new functions to the `mutations` object. Keep existing mutation methods in place so current screens keep working during the transition.

- [ ] **Step 3: Write provider skeleton test**

Create `src/state/multiplayer-journey-context.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JourneyContent } from "../data/journey-content";
import type { RoomSession } from "../multiplayer/room-types";
import { createDefaultState, useJourney } from "./journey-context";
import { MultiplayerJourneyProvider } from "./multiplayer-journey-context";

const writeRoomUpdateMock = vi.fn();

vi.mock("../multiplayer/room-service", () => ({
  writeRoomUpdate: (...args: unknown[]) => writeRoomUpdateMock(...args),
}));

function content(): JourneyContent {
  return {
    cardDatabase: new Map(),
    cardsByPackageTide: new Map(),
    dreamAvatars: [],
    dreamsignTemplates: [],
    resolvedPackagesByDreamAvatarId: new Map(),
  };
}

function session(): RoomSession {
  return {
    roomId: "ab12cd",
    clientId: "client-1",
    room: {
      metadata: {
        schemaVersion: 1,
        createdAt: "2026-05-08T12:00:00.000Z",
        updatedAt: "2026-05-08T12:00:00.000Z",
      },
      journeyState: {
        ...createDefaultState(),
        essence: 300,
      },
      presence: {},
      actionLog: {},
    },
  };
}

function Capture() {
  const { state, mutations } = useJourney();
  return (
    <button
      type="button"
      data-essence={String(state.essence)}
      onClick={() => {
        mutations.changeEssence(25, "test");
      }}
    >
      Essence
    </button>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("MultiplayerJourneyProvider", () => {
  it("provides subscribed journey state", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <MultiplayerJourneyProvider database={{}} session={session()} journeyContent={content()}>
          <Capture />
        </MultiplayerJourneyProvider>,
      );
    });

    expect(container.querySelector("button")?.getAttribute("data-essence")).toBe("300");
  });

  it("writes focused essence updates", async () => {
    writeRoomUpdateMock.mockResolvedValue(undefined);
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <MultiplayerJourneyProvider database={{}} session={session()} journeyContent={content()}>
          <Capture />
        </MultiplayerJourneyProvider>,
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });

    expect(writeRoomUpdateMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        "rooms/ab12cd/journeyState/essence": 325,
      }),
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run:

```bash
npm test -- src/state/multiplayer-journey-context.test.tsx
```

Expected: FAIL because the provider does not exist.

- [ ] **Step 5: Implement provider skeleton**

Create `src/state/multiplayer-journey-context.tsx`:

```tsx
import { useCallback, useMemo, type ReactNode } from "react";
import type { Database } from "firebase/database";
import {
  createPlayableBattleCache,
  PlayableBattleCacheProvider,
} from "../components/playable-battle-cache";
import type { JourneyContent } from "../data/journey-content";
import { buildJourneyFieldUpdate } from "../multiplayer/room-paths";
import { writeRoomUpdate } from "../multiplayer/room-service";
import type { RoomSession } from "../multiplayer/room-types";
import type { DreamAvatarContent } from "../types/content";
import type { CardData } from "../types/cards";
import type { DraftState } from "../types/draft";
import type {
  CardSourceDebugState,
  DreamAtlas,
  Dreamsign,
  JourneyFailureSummary,
  JourneyState,
  Screen,
  TransfigurationType,
} from "../types/journey";
import { changeJourneyEssence, startJourneyFromDreamAvatar } from "./journey-state-actions";
import {
  JourneyContextProvider,
  createDefaultState,
  type JourneyContextValue,
  type JourneyMutations,
} from "./journey-context";

export function MultiplayerJourneyProvider({
  children,
  database,
  session,
  journeyContent,
}: {
  children: ReactNode;
  database: Database;
  session: RoomSession;
  journeyContent: JourneyContent;
}) {
  const state = session.room.journeyState ?? createDefaultState();
  const cardDatabase = journeyContent.cardDatabase;
  const playableBattleCache = useMemo(createPlayableBattleCache, []);

  const writeField = useCallback(
    async <K extends keyof JourneyState>(field: K, value: JourneyState[K]) => {
      await writeRoomUpdate(
        database,
        buildJourneyFieldUpdate(session.roomId, field, value, new Date().toISOString()),
      );
    },
    [database, session.roomId],
  );

  const mutations = useMemo<JourneyMutations>(() => {
    const changeEssence = (delta: number, _source: string) => {
      const next = changeJourneyEssence(state, delta);
      void writeField("essence", next.essence);
    };

    const startJourney = (dreamAvatar: DreamAvatarContent) => {
      const next = startJourneyFromDreamAvatar({ prev: state, dreamAvatar, journeyContent });
      void writeRoomUpdate(database, {
        [`rooms/${session.roomId}/journeyState`]: next,
        [`rooms/${session.roomId}/metadata/updatedAt`]: new Date().toISOString(),
      });
    };

    return {
      changeEssence,
      startJourney,
      completeSite: (_siteId: string, _source: string) => {},
      pickDraftCard: (_siteId: string, _cardNumber: number) => {},
      addCard: (cardNumber: number, _source: string) => {
        void cardNumber;
      },
      removeCard: (entryId: string, _source: string) => {
        void entryId;
      },
      transfigureCard: (
        entryId: string,
        type: TransfigurationType,
        effectDescription: string,
        effectDetails: Record<string, unknown>,
      ) => {
        void entryId;
        void type;
        void effectDescription;
        void effectDetails;
      },
      setDreamAvatarSelection: () => {},
      setCardSourceDebug: (cardSourceDebug: CardSourceDebugState | null, _source: string) => {
        void writeField("cardSourceDebug", cardSourceDebug);
      },
      addDreamsign: (dreamsign: Dreamsign, _sourceSiteType: string) => {
        void writeField("dreamsigns", [...state.dreamsigns, dreamsign]);
      },
      removeDreamsign: (index: number, _reason: string) => {
        void writeField("dreamsigns", state.dreamsigns.filter((_, currentIndex) => currentIndex !== index));
      },
      setRemainingDreamsignPool: (remainingDreamsignPool: string[], _source: string) => {
        void writeField("remainingDreamsignPool", [...remainingDreamsignPool]);
      },
      incrementCompletionLevel: () => {},
      setScreen: (screen: Screen) => {
        void writeRoomUpdate(database, {
          [`rooms/${session.roomId}/journeyState/screen`]: screen,
          [`rooms/${session.roomId}/journeyState/activeSiteId`]: screen.type === "site" ? screen.siteId : null,
          [`rooms/${session.roomId}/metadata/updatedAt`]: new Date().toISOString(),
        });
      },
      markSiteVisited: () => {},
      setCurrentDreamscape: (nodeId: string | null) => {
        void writeField("currentDreamscape", nodeId);
      },
      updateAtlas: (atlas: DreamAtlas) => {
        void writeField("atlas", atlas);
      },
      setDraftState: (draftState: DraftState, _source: string) => {
        void writeField("draftState", draftState);
      },
      setFailureSummary: (failureSummary: JourneyFailureSummary | null, _source: string) => {
        void writeField("failureSummary", failureSummary);
      },
      resetJourney: () => {
        void writeRoomUpdate(database, {
          [`rooms/${session.roomId}/journeyState`]: createDefaultState(),
          [`rooms/${session.roomId}/metadata/updatedAt`]: new Date().toISOString(),
        });
      },
    };
  }, [database, journeyContent, session.roomId, state, writeField]);

  const value = useMemo<JourneyContextValue>(
    () => ({
      state,
      mutations,
      cardDatabase: cardDatabase as Map<number, CardData>,
      journeyContent,
    }),
    [cardDatabase, mutations, journeyContent, state],
  );

  return (
    <JourneyContextProvider value={value}>
      <PlayableBattleCacheProvider cache={playableBattleCache}>
        {children}
      </PlayableBattleCacheProvider>
    </JourneyContextProvider>
  );
}
```

This skeleton intentionally leaves several old single-field mutations as compatibility shims. Later tasks replace screen flows with composed mutations.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- src/state/multiplayer-journey-context.test.tsx
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 7: Commit and push**

Run:

```bash
git add src/state/journey-context.tsx src/state/multiplayer-journey-context.tsx src/state/multiplayer-journey-context.test.tsx
git commit -m "Add Firebase-backed journey provider skeleton" -m "Expose the existing journey context from a multiplayer provider and route initial shared mutations through focused Firebase room updates."
git push
```

Expected: commit succeeds and pushes.

---

### Task 10: Wire App Through The Room Gate

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Test: `npm test -- src/App.test.tsx`

- [ ] **Step 1: Add App shell tests**

In `src/App.test.tsx`, add mocks:

```tsx
vi.mock("./firebase/app-config", () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock("./multiplayer/MultiplayerRoomGate", () => ({
  MultiplayerRoomGate: ({
    children,
    gameId,
  }: {
    children: (session: {
      roomId: string;
      clientId: string;
      room: {
        metadata: { schemaVersion: number; createdAt: string; updatedAt: string };
        journeyState: null;
      };
    }) => ReactNode;
    gameId: string | null;
  }) => (
    <div data-room-gate={gameId ?? "create"}>
      {children({
        roomId: gameId ?? "created-room",
        clientId: "client-1",
        room: {
          metadata: {
            schemaVersion: 1,
            createdAt: "2026-05-08T12:00:00.000Z",
            updatedAt: "2026-05-08T12:00:00.000Z",
          },
          journeyState: null,
        },
      })}
    </div>
  ),
}));

vi.mock("./state/multiplayer-journey-context", () => ({
  MultiplayerJourneyProvider: ({ children }: { children: ReactNode }) => (
    <div data-multiplayer-provider>{children}</div>
  ),
}));
```

Add a test that mounts `App` after mocking `loadJourneyContent` if the test file already has content-loading helpers. The assertion should verify:

```ts
expect(container.querySelector("[data-room-gate='ab12cd']")).not.toBeNull();
expect(container.querySelector("[data-multiplayer-provider]")).not.toBeNull();
```

Use this runtime config in the test:

```ts
{
  seedOverride: null,
  startInBattle: false,
  enableAi: false,
  gameId: "ab12cd",
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: FAIL because `App` still renders the local `JourneyProvider`.

- [ ] **Step 3: Wire App to Firebase room gate**

Modify imports in `src/App.tsx`:

```ts
import { getFirebaseDatabase } from "./firebase/app-config";
import { MultiplayerRoomGate } from "./multiplayer/MultiplayerRoomGate";
import { MultiplayerJourneyProvider } from "./state/multiplayer-journey-context";
```

Replace the final `return` in `App` with:

```tsx
const database = getFirebaseDatabase();

return (
  <MultiplayerRoomGate database={database} gameId={runtimeConfig.gameId}>
    {(session) => (
      <MultiplayerJourneyProvider
        database={database}
        session={session}
        journeyContent={journeyContent}
      >
        <JourneyApp
          cardDatabase={journeyContent.cardDatabase}
          runtimeConfig={runtimeConfig}
        />
      </MultiplayerJourneyProvider>
    )}
  </MultiplayerRoomGate>
);
```

Keep the exported `JourneyApp` component unchanged.

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- src/App.test.tsx
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "Route app through multiplayer room gate" -m "Connect the loaded journey app to Firebase room sessions with the multiplayer journey provider while preserving the existing JourneyApp surface."
git push
```

Expected: commit succeeds and pushes.

---

### Task 11: Composed Journey Start And Simple Shared Mutations

**Files:**
- Modify: `src/screens/JourneyStartScreen.tsx`
- Modify: `src/state/multiplayer-journey-context.tsx`
- Modify: `src/state/multiplayer-journey-context.test.tsx`
- Modify: `src/state/journey-context.tsx`
- Test: `npm test -- src/state/multiplayer-journey-context.test.tsx src/screens/JourneyStartScreen.test.tsx`

- [ ] **Step 1: Add provider tests for start and complete site**

Extend `src/state/multiplayer-journey-context.test.tsx` with tests that call `mutations.startJourney` and `mutations.completeSite`. Mock `runRoomTransaction` from `../multiplayer/room-service` beside `writeRoomUpdate`. The start test should assert the transaction updater commits a room whose journey state contains:

```ts
const updater = runRoomTransactionMock.mock.calls[0][2] as (room: MultiplayerRoom | null) => MultiplayerRoom | undefined;
const nextRoom = updater(session().room);

expect(nextRoom).toEqual(
  expect.objectContaining({
    journeyState: expect.objectContaining({
      dreamAvatar: expect.objectContaining({ id: "dream-avatar-1" }),
      draftState: expect.any(Object),
      atlas: expect.any(Object),
    }),
  }),
);
```

The complete-site test should call the second transaction updater and assert it commits visited site, atlas, and screen changes:

```ts
const roomWithSite: MultiplayerRoom = {
  ...session().room,
  journeyState: {
    ...createDefaultState(),
    currentDreamscape: "dreamscape-1",
    atlas: {
      nexusId: "nexus",
      edges: [],
      nodes: {
        "dreamscape-1": {
          id: "dreamscape-1",
          biomeName: "Biome",
          biomeColor: "#fff",
          position: { x: 0, y: 0 },
          status: "available",
          enhancedSiteType: null,
          sites: [{ id: "site-1", type: "Essence", isEnhanced: false, isVisited: false }],
        },
      },
    },
  },
};
const completeUpdater = runRoomTransactionMock.mock.calls[1][2] as (room: MultiplayerRoom | null) => MultiplayerRoom | undefined;
const completedRoom = completeUpdater(roomWithSite);

expect(completedRoom?.journeyState).toEqual(
  expect.objectContaining({
    visitedSites: ["site-1"],
    atlas: expect.any(Object),
    screen: { type: "dreamscape" },
  }),
);
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/state/multiplayer-journey-context.test.tsx
```

Expected: FAIL because `completeSite` and `startJourney` are incomplete for room-safe writes.

- [ ] **Step 3: Update JourneyStartScreen to use composed mutation**

In `src/screens/JourneyStartScreen.tsx`, replace the `bootstrapJourneyStart(...)` call with:

```ts
mutations.startJourney(dreamAvatar);
```

Remove imports that become unused: `bootstrapJourneyStart`, `STARTER_CARD_NUMBERS` only if unused in this file, and state fields used only for the bootstrap argument.

- [ ] **Step 4: Implement composed writes**

In `src/state/multiplayer-journey-context.tsx`, import `runRoomTransaction` and update `startJourney`:

```ts
const startJourney = (dreamAvatar: DreamAvatarContent) => {
  void runRoomTransaction(database, session.roomId, (room) => {
    if (room === null || room.journeyState?.dreamAvatar !== null) {
      return room ?? undefined;
    }

    const current = room.journeyState ?? createDefaultState();
    const next = startJourneyFromDreamAvatar({ prev: current, dreamAvatar, journeyContent });
    const now = new Date().toISOString();
    return {
      ...room,
      journeyState: next,
      metadata: {
        ...room.metadata,
        updatedAt: now,
      },
      actionLog: {
        ...(room.actionLog ?? {}),
        [crypto.randomUUID()]: {
          timestamp: now,
          actorId: session.clientId,
          action: "startJourney",
          source: "journey_start",
          summary: {
            dreamAvatarId: dreamAvatar.id,
            dreamAvatarName: dreamAvatar.name,
          },
        },
      },
    };
  });
};
```

Update `completeSite`:

```ts
const completeSite = (siteId: string, source: string) => {
  void runRoomTransaction(database, session.roomId, (room) => {
    if (room === null || room.journeyState === null) {
      return room ?? undefined;
    }

    const next = setJourneyScreen(completeJourneySite(room.journeyState, siteId), { type: "dreamscape" });
    const now = new Date().toISOString();
    return {
      ...room,
      journeyState: {
        ...room.journeyState,
        visitedSites: next.visitedSites,
        atlas: next.atlas,
        screen: next.screen,
        activeSiteId: next.activeSiteId,
      },
      metadata: {
        ...room.metadata,
        updatedAt: now,
      },
      actionLog: {
        ...(room.actionLog ?? {}),
        [crypto.randomUUID()]: {
          timestamp: now,
          actorId: session.clientId,
          action: "completeSite",
          source,
          summary: { siteId },
        },
      },
    };
  });
};
```

Import `completeJourneySite` and `setJourneyScreen` from `journey-state-actions`.

- [ ] **Step 5: Route old local complete calls through composed mutation**

In local `JourneyProvider`, implement `completeSite` with the same pure helper:

```ts
const completeSite = useCallback((siteId: string, source: string) => {
  logEvent("site_completed", {
    siteId,
    source,
  });
  setState((prev) => setJourneyScreen(completeJourneySite(prev, siteId), { type: "dreamscape" }));
}, []);
```

Keep `markSiteVisited` and `setScreen` for compatibility until screens are converted.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- src/state/multiplayer-journey-context.test.tsx src/screens/JourneyStartScreen.test.tsx
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 7: Commit and push**

Run:

```bash
git add src/screens/JourneyStartScreen.tsx src/state/multiplayer-journey-context.tsx src/state/multiplayer-journey-context.test.tsx src/state/journey-context.tsx
git commit -m "Compose shared journey start writes" -m "Route DreamAvatar selection and site completion through domain-level journey mutations that write coherent Firebase room updates with action log entries."
git push
```

Expected: commit succeeds and pushes.

---

### Task 12: Draft Pick Composed Writes

**Files:**
- Modify: `src/state/journey-state-actions.ts`
- Modify: `src/state/journey-state-actions.test.ts`
- Modify: `src/state/multiplayer-journey-context.tsx`
- Modify: `src/screens/DraftSiteScreen.tsx`
- Modify: `src/screens/DraftSiteScreen.test.tsx`
- Test: `npm test -- src/state/journey-state-actions.test.ts src/screens/DraftSiteScreen.test.tsx`

- [ ] **Step 1: Add pure draft-pick tests**

Add to `src/state/journey-state-actions.test.ts`:

```ts
it("picks a draft card in one state transition", () => {
  const state = {
    ...createDefaultState(),
    draftState: {
      remainingCopiesByCard: {
        "101": 2,
        "102": 2,
        "103": 2,
        "104": 2,
        "105": 2,
        "106": 2,
      },
      currentOffer: [101, 102, 103, 104],
      activeSiteId: "site-1",
      pickNumber: 1,
      sitePicksCompleted: 0,
    },
  };

  const next = pickDraftCardInJourneyState({
    prev: state,
    siteId: "site-1",
    cardNumber: 101,
    cardDatabase: content().cardDatabase,
  });

  expect(next.deck.at(-1)).toEqual({
    entryId: "deck-1",
    cardNumber: 101,
    transfiguration: null,
    isBane: false,
  });
  expect(next.draftState?.pickNumber).toBe(2);
  expect(next.draftState?.sitePicksCompleted).toBe(1);
  expect(next.draftState?.currentOffer).not.toEqual([101, 102, 103, 104]);
});
```

Import `pickDraftCardInJourneyState`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/state/journey-state-actions.test.ts
```

Expected: FAIL because `pickDraftCardInJourneyState` does not exist.

- [ ] **Step 3: Implement pure draft pick action**

In `src/state/journey-state-actions.ts`, import:

```ts
import { processPlayerPick } from "../draft/draft-engine";
import type { CardData } from "../types/cards";
```

Add:

```ts
export function pickDraftCardInJourneyState({
  prev,
  siteId,
  cardNumber,
  cardDatabase,
}: {
  prev: JourneyState;
  siteId: string;
  cardNumber: number;
  cardDatabase: Map<number, CardData>;
}): JourneyState {
  if (prev.draftState === null) {
    throw new Error("Draft state is unavailable.");
  }
  if (prev.draftState.activeSiteId !== siteId) {
    throw new Error(`Draft site ${siteId} is not active.`);
  }

  const draftState = structuredClone(prev.draftState);
  processPlayerPick(cardNumber, draftState, cardDatabase);

  return addCardToJourneyState(
    {
      ...prev,
      draftState,
    },
    cardNumber,
    false,
  );
}
```

- [ ] **Step 4: Update multiplayer provider pick mutation**

In `src/state/multiplayer-journey-context.tsx`, implement `pickDraftCard` through `runRoomTransaction` so the picked card is validated against the latest shared offer:

```ts
const pickDraftCard = (siteId: string, cardNumber: number) => {
  void runRoomTransaction(database, session.roomId, (room) => {
    if (room === null || room.journeyState === null) {
      return room ?? undefined;
    }

    let next: JourneyState;
    try {
      next = pickDraftCardInJourneyState({
        prev: room.journeyState,
        siteId,
        cardNumber,
        cardDatabase,
      });
    } catch {
      return room;
    }

    const now = new Date().toISOString();
    return {
      ...room,
      journeyState: {
        ...room.journeyState,
        deck: next.deck,
        draftState: next.draftState,
      },
      metadata: {
        ...room.metadata,
        updatedAt: now,
      },
      actionLog: {
        ...(room.actionLog ?? {}),
        [crypto.randomUUID()]: {
          timestamp: now,
          actorId: session.clientId,
          action: "pickDraftCard",
          source: "draft_pick",
          summary: { siteId, cardNumber },
        },
      },
    };
  });
};
```

Replace the placeholder in the returned mutations object. Import `pickDraftCardInJourneyState`.

- [ ] **Step 5: Update DraftSiteScreen**

In `src/screens/DraftSiteScreen.tsx`, inside the delayed pick processing block, replace:

```ts
draftStateRef.current = cloned;
mutations.setDraftState(cloned, "draft_pick");
mutations.addCard(cardNumber, "draft_pick");
```

with:

```ts
draftStateRef.current = cloned;
mutations.pickDraftCard(siteId, cardNumber);
```

Keep local animation state and `refreshOffer()` logic. The subscribed Firebase state will provide the canonical next offer.

- [ ] **Step 6: Update DraftSiteScreen test**

In `src/screens/DraftSiteScreen.test.tsx`, update the mutation mock to include:

```ts
mutations.pickDraftCard = vi.fn((siteId: string, cardNumber: number) => {
  mutations.setDraftState(draftState, "draft_pick");
  mutations.addCard(cardNumber, "draft_pick");
  void siteId;
});
```

Change assertions from separate `setDraftState` + `addCard` ownership to:

```ts
expect(mutations.pickDraftCard).toHaveBeenCalledWith("site-1", 101);
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm test -- src/state/journey-state-actions.test.ts src/screens/DraftSiteScreen.test.tsx src/state/multiplayer-journey-context.test.tsx
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 8: Commit and push**

Run:

```bash
git add src/state/journey-state-actions.ts src/state/journey-state-actions.test.ts src/state/multiplayer-journey-context.tsx src/screens/DraftSiteScreen.tsx src/screens/DraftSiteScreen.test.tsx
git commit -m "Compose shared draft pick writes" -m "Move draft card selection into a single journey mutation that updates deck and draft state together for Firebase multiplayer rooms."
git push
```

Expected: commit succeeds and pushes.

---

### Task 13: Shared Reward, Dreamsign, And Essence Reveals

**Files:**
- Modify: `src/state/journey-context.tsx`
- Modify: `src/state/multiplayer-journey-context.tsx`
- Modify: `src/screens/RewardSiteScreen.tsx`
- Modify: `src/screens/DreamsignOfferingScreen.tsx`
- Modify: `src/screens/DreamsignDraftScreen.tsx`
- Modify: `src/screens/EssenceSiteScreen.tsx`
- Modify: related tests in `src/screens/reward-screen.test.tsx`, `src/screens/dreamsign-screen.test.tsx`, and essence tests if present
- Test: `npm test -- src/screens/reward-screen.test.tsx src/screens/dreamsign-screen.test.tsx`

- [ ] **Step 1: Extend mutation interface**

Add these methods to `JourneyMutations`:

```ts
ensureRewardSiteRuntime: (siteId: string) => void;
acceptRewardSite: (siteId: string) => void;
ensureDreamsignOfferRuntime: (siteId: string, optionCount: number) => void;
acceptDreamsignOffer: (siteId: string, dreamsign: Dreamsign) => void;
ensureEssenceSiteRuntime: (siteId: string, isEnhanced: boolean) => void;
acceptEssenceSite: (siteId: string) => void;
```

In local `JourneyProvider`, implement each method with the same generator logic currently living in the screens, updating local state through `setState`.

- [ ] **Step 2: Convert RewardSiteScreen reveal**

In `src/screens/RewardSiteScreen.tsx`, replace the `rewardRef` generation with runtime lookup:

```ts
const runtime = state.siteRuntime[site.id];

useEffect(() => {
  if (runtime === undefined) {
    mutations.ensureRewardSiteRuntime(site.id);
  }
}, [mutations, runtime, site.id]);

if (runtime === undefined || runtime.kind !== "reward") {
  return <div className="flex min-h-full items-center justify-center">Revealing reward...</div>;
}
```

Render from `runtime.reward`. Replace accept logic with:

```ts
mutations.acceptRewardSite(site.id);
```

- [ ] **Step 3: Convert Dreamsign offering screens**

In `DreamsignOfferingScreen` and `DreamsignDraftScreen`, replace `revealedRef` with:

```ts
const runtime = state.siteRuntime[site.id];

useEffect(() => {
  if (runtime === undefined) {
    mutations.ensureDreamsignOfferRuntime(site.id, optionCount);
  }
}, [mutations, optionCount, runtime, site.id]);

if (runtime === undefined || runtime.kind !== "dreamsignOffer") {
  return <div className="flex min-h-full items-center justify-center">Revealing Dreamsigns...</div>;
}

const options = runtime.offeredDreamsigns;
```

Accept through:

```ts
mutations.acceptDreamsignOffer(site.id, dreamsign);
```

- [ ] **Step 4: Convert EssenceSiteScreen**

In `src/screens/EssenceSiteScreen.tsx`, initialize from shared runtime:

```ts
const runtime = state.siteRuntime[site.id];

useEffect(() => {
  if (runtime === undefined) {
    mutations.ensureEssenceSiteRuntime(site.id, site.isEnhanced);
  }
}, [mutations, runtime, site.id, site.isEnhanced]);

if (runtime === undefined || runtime.kind !== "essence") {
  return <div className="flex min-h-full items-center justify-center">Gathering essence...</div>;
}

const essenceAmount = runtime.amount;
```

Complete through:

```ts
mutations.acceptEssenceSite(site.id);
```

- [ ] **Step 5: Implement multiplayer runtime writes**

In `src/state/multiplayer-journey-context.tsx`, each ensure method should use `runRoomTransaction`:

1. Read the current `room.journeyState` inside the transaction updater.
2. Return the existing room when `room.journeyState.siteRuntime[siteId]` exists.
3. Generate the runtime data with existing generator functions.
4. Return a room with only the relevant runtime and pool fields changed:

```ts
return {
  ...room,
  journeyState: {
    ...room.journeyState,
    siteRuntime: {
      ...room.journeyState.siteRuntime,
      [siteId]: runtime,
    },
    remainingDreamsignPool: nextRemainingPool,
  },
  metadata: { ...room.metadata, updatedAt: now },
  actionLog: {
    ...(room.actionLog ?? {}),
    [crypto.randomUUID()]: buildActionLogEntry({
      timestamp: now,
      actorId: session.clientId,
      action: "ensureRewardSiteRuntime",
      source: "site_reveal",
      summary: { siteId },
    }),
  },
};
```

Use action names matching the method name. Accept methods should use `runRoomTransaction` when they depend on current essence, current runtime, or unaccepted reward state. The transaction return value should include deck/dreamsigns/essence, runtime accepted state, visited site updates, screen, metadata, and action log in one updated room object.

- [ ] **Step 6: Update screen tests**

Update affected screen tests to create `JourneyState` with `siteRuntime` entries. For reward card acceptance, the runtime fixture should look like:

```ts
siteRuntime: {
  "site-1": {
    kind: "reward",
    reward: { rewardType: "card", cardNumber: 1, cardName: "Test Card" },
    remainingDreamsignPoolIds: [],
    accepted: false,
  },
},
```

Assert that accept buttons call the composed mutation:

```ts
expect(mutations.acceptRewardSite).toHaveBeenCalledWith("site-1");
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm test -- src/screens/reward-screen.test.tsx src/screens/dreamsign-screen.test.tsx
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 8: Commit and push**

Run:

```bash
git add src/state/journey-context.tsx src/state/multiplayer-journey-context.tsx src/screens/RewardSiteScreen.tsx src/screens/DreamsignOfferingScreen.tsx src/screens/DreamsignDraftScreen.tsx src/screens/EssenceSiteScreen.tsx src/screens/reward-screen.test.tsx src/screens/dreamsign-screen.test.tsx
git commit -m "Share reward dreamsign and essence reveals" -m "Move one-time reward, Dreamsign, and essence site generation into shared site runtime state with composed accept mutations for multiplayer rooms."
git push
```

Expected: commit succeeds and pushes.

---

### Task 14: Shared Shop Runtime

**Files:**
- Modify: `src/shop/shop-generator.ts`
- Modify: `src/shop/shop-generator.test.ts`
- Modify: `src/screens/ShopScreen.tsx`
- Modify: `src/screens/SpecialtyShopScreen.tsx`
- Modify: `src/state/journey-context.tsx`
- Modify: `src/state/multiplayer-journey-context.tsx`
- Test: `npm test -- src/shop/shop-generator.test.ts`

- [ ] **Step 1: Add runtime conversion tests**

In `src/shop/shop-generator.test.ts`, add tests for serializable slot conversion:

```ts
import { shopSlotsToRuntime, runtimeSlotsToShopSlots } from "./shop-generator";

it("converts generated shop slots to serializable runtime slots and back", () => {
  const card = makeCard(101);
  const slots = [
    {
      itemType: "card" as const,
      card,
      dreamsign: null,
      basePrice: 100,
      discountPercent: 0,
      purchased: false,
    },
  ];

  const runtime = shopSlotsToRuntime(slots);

  expect(runtime).toEqual([
    {
      itemType: "card",
      cardNumber: 101,
      basePrice: 100,
      discountPercent: 0,
      purchased: false,
    },
  ]);
  expect(runtimeSlotsToShopSlots(runtime, new Map([[101, card]]))).toEqual(slots);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/shop/shop-generator.test.ts
```

Expected: FAIL because conversion helpers do not exist.

- [ ] **Step 3: Implement shop runtime conversion helpers**

In `src/shop/shop-generator.ts`, import `RuntimeShopSlot` and add:

```ts
import type { RuntimeShopSlot } from "../types/journey";

export function shopSlotsToRuntime(slots: readonly ShopSlot[]): RuntimeShopSlot[] {
  return slots.map((slot) => {
    if (slot.itemType === "card" && slot.card !== null) {
      return {
        itemType: "card",
        cardNumber: slot.card.cardNumber,
        basePrice: slot.basePrice,
        discountPercent: slot.discountPercent,
        purchased: slot.purchased,
      };
    }

    if (slot.itemType === "dreamsign" && slot.dreamsign !== null) {
      return {
        itemType: "dreamsign",
        dreamsign: slot.dreamsign,
        basePrice: slot.basePrice,
        discountPercent: slot.discountPercent,
        purchased: slot.purchased,
      };
    }

    return {
      itemType: "reroll",
      basePrice: slot.basePrice,
      discountPercent: slot.discountPercent,
      purchased: slot.purchased,
    };
  });
}

export function runtimeSlotsToShopSlots(
  slots: readonly RuntimeShopSlot[],
  cardDatabase: ReadonlyMap<number, CardData>,
): ShopSlot[] {
  return slots.map((slot) => {
    if (slot.itemType === "card") {
      return {
        itemType: "card",
        card: cardDatabase.get(slot.cardNumber) ?? null,
        dreamsign: null,
        basePrice: slot.basePrice,
        discountPercent: slot.discountPercent,
        purchased: slot.purchased,
      };
    }

    if (slot.itemType === "dreamsign") {
      return {
        itemType: "dreamsign",
        card: null,
        dreamsign: slot.dreamsign,
        basePrice: slot.basePrice,
        discountPercent: slot.discountPercent,
        purchased: slot.purchased,
      };
    }

    return {
      itemType: "reroll",
      card: null,
      dreamsign: null,
      basePrice: slot.basePrice,
      discountPercent: slot.discountPercent,
      purchased: slot.purchased,
    };
  });
}
```

- [ ] **Step 4: Add shop mutations**

Extend `JourneyMutations`:

```ts
ensureShopRuntime: (site: SiteState, specialtyOnly: boolean) => void;
buyShopSlot: (siteId: string, slotIndex: number) => void;
rerollShop: (site: SiteState, slotIndex: number) => void;
```

Import `SiteState` from `../types/journey` where needed.

- [ ] **Step 5: Convert ShopScreen and SpecialtyShopScreen**

In each screen, replace local initial inventory state with:

```ts
const runtime = state.siteRuntime[site.id];

useEffect(() => {
  if (runtime === undefined) {
    mutations.ensureShopRuntime(site, false);
  }
}, [mutations, runtime, site]);

if (runtime === undefined || runtime.kind !== "shop") {
  return <div className="flex min-h-full items-center justify-center">Opening shop...</div>;
}

const slots = runtimeSlotsToShopSlots(runtime.slots, cardDatabase);
const rerollCount = runtime.rerollCount;
```

For SpecialtyShopScreen, pass `true` as the second argument:

```ts
mutations.ensureShopRuntime(site, true);
```

Replace buy and reroll handlers:

```ts
mutations.buyShopSlot(site.id, index);
mutations.rerollShop(site, index);
```

- [ ] **Step 6: Implement provider shop mutations**

`ensureShopRuntime`, `buyShopSlot`, and `rerollShop` should use `runRoomTransaction`. `ensureShopRuntime` returns the existing room when runtime already exists. When runtime is absent, it generates inventory, converts slots with `shopSlotsToRuntime`, and returns:

```ts
if (room === null || room.journeyState === null) {
  return room ?? undefined;
}

return {
  ...room,
  journeyState: {
    ...room.journeyState,
    siteRuntime: {
      ...room.journeyState.siteRuntime,
      [site.id]: {
        kind: "shop",
        slots: shopSlotsToRuntime(inventory.slots),
        rerollCount: 0,
        remainingDreamsignPoolIds: inventory.remainingDreamsignPoolIds,
      },
    },
    remainingDreamsignPool: inventory.remainingDreamsignPoolIds,
  },
  metadata: { ...room.metadata, updatedAt: now },
  actionLog: {
    ...(room.actionLog ?? {}),
    [crypto.randomUUID()]: buildActionLogEntry({
      timestamp: now,
      actorId: session.clientId,
      action: "ensureShopRuntime",
      source: "shop_reveal",
      summary: { siteId: site.id, specialtyOnly },
    }),
  },
};
```

`buyShopSlot` derives the selected runtime slot from the latest room, updates `essence`, `deck` or `dreamsigns`, marks that slot purchased, and returns the updated room. `rerollShop` charges essence from the latest room, generates replacement slots from the stored `remainingDreamsignPoolIds`, preserves purchased slots, increments `rerollCount`, and returns the updated room with changed runtime, essence, metadata, and action log.

- [ ] **Step 7: Run tests**

Run:

```bash
npm test -- src/shop/shop-generator.test.ts
npm run typecheck
```

Expected: both commands PASS after updating affected component tests.

- [ ] **Step 8: Commit and push**

Run:

```bash
git add src/shop/shop-generator.ts src/shop/shop-generator.test.ts src/screens/ShopScreen.tsx src/screens/SpecialtyShopScreen.tsx src/state/journey-context.tsx src/state/multiplayer-journey-context.tsx
git commit -m "Share shop runtime state" -m "Store shop inventory, purchases, rerolls, and Dreamsign pool changes in shared site runtime for Firebase multiplayer rooms."
git push
```

Expected: commit succeeds and pushes.

---

### Task 15: Shared Card-Choice And Offer Site Runtime

**Files:**
- Modify: `src/screens/TransfigurationSiteScreen.tsx`
- Modify: `src/screens/DuplicationSiteScreen.tsx`
- Modify: `src/screens/DreamJourneyScreen.tsx`
- Modify: `src/screens/TemptingOfferScreen.tsx`
- Modify: `src/state/journey-context.tsx`
- Modify: `src/state/multiplayer-journey-context.tsx`
- Modify: related tests
- Test: targeted tests for the four converted screens

- [ ] **Step 1: Add mutations**

Extend `JourneyMutations`:

```ts
ensureCardChoiceRuntime: (siteId: string, kind: "transfiguration" | "duplication") => void;
acceptTransfigurationChoice: (siteId: string, entryId: string, type: TransfigurationType, effectDescription: string, effectDetails: Record<string, unknown>) => void;
acceptDuplicationChoice: (siteId: string, entryId: string, copyCount: number) => void;
ensureDreamJourneyRuntime: (siteId: string) => void;
completeDreamJourneyOption: (siteId: string, optionId: string) => void;
ensureTemptingOfferRuntime: (siteId: string) => void;
completeTemptingOfferOption: (siteId: string, optionId: string) => void;
```

- [ ] **Step 2: Convert transfiguration and duplication**

In both screens, replace random candidate `useState` initialization with shared runtime:

```ts
const runtime = state.siteRuntime[site.id];

useEffect(() => {
  if (runtime === undefined) {
    mutations.ensureCardChoiceRuntime(site.id, "transfiguration");
  }
}, [mutations, runtime, site.id]);

if (runtime === undefined || runtime.kind !== "cardChoice") {
  return <div className="flex min-h-full items-center justify-center">Preparing choices...</div>;
}

const candidates = runtime.entryIds
  .map((entryId) => state.deck.find((entry) => entry.entryId === entryId))
  .filter((entry): entry is DeckEntry => entry !== undefined);
```

Use `"duplication"` for `DuplicationSiteScreen`. Replace accept handlers with the composed mutations from Step 1.

- [ ] **Step 3: Convert Dream Journey and Tempting Offer**

Replace local shuffled option state with shared runtime:

```ts
const runtime = state.siteRuntime[site.id];

useEffect(() => {
  if (runtime === undefined) {
    mutations.ensureDreamJourneyRuntime(site.id);
  }
}, [mutations, runtime, site.id]);

if (runtime === undefined || runtime.kind !== "dreamJourney") {
  return <div className="flex min-h-full items-center justify-center">Revealing journey...</div>;
}
```

Use the equivalent `ensureTemptingOfferRuntime` and `kind !== "temptingOffer"` in `TemptingOfferScreen`.

- [ ] **Step 4: Implement provider methods**

Provider ensure methods should use `runRoomTransaction`:

1. Read `room.journeyState` inside the transaction updater.
2. Return the existing room when `room.journeyState.siteRuntime[siteId]` exists.
3. Generate option ids or entry ids with existing selection logic.
4. Return an updated room containing `journeyState.siteRuntime[siteId]` plus metadata/action log.

Accept/complete methods should read the latest room inside `runRoomTransaction` and return a room with only the changed shared fields updated:

```ts
return {
  ...room,
  journeyState: {
    ...room.journeyState,
    deck: next.deck,
    dreamsigns: next.dreamsigns,
    essence: next.essence,
    siteRuntime: {
      ...room.journeyState.siteRuntime,
      [siteId]: nextRuntime,
    },
    visitedSites: completed.visitedSites,
    atlas: completed.atlas,
    screen: completed.screen,
    activeSiteId: completed.activeSiteId,
  },
  metadata: { ...room.metadata, updatedAt: now },
};
```

Include only paths changed by the action. This preserves independent concurrent updates.

- [ ] **Step 5: Update screen tests**

Each converted screen test should construct runtime state directly. Example:

```ts
siteRuntime: {
  "site-1": {
    kind: "cardChoice",
    entryIds: ["deck-1", "deck-2"],
    acceptedEntryIds: [],
  },
},
```

Assert composed mutations are called instead of individual `addCard`, `removeCard`, `transfigureCard`, `changeEssence`, and `markSiteVisited` chains.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- src/screens/TransfigurationSiteScreen.test.tsx src/screens/DuplicationSiteScreen.test.tsx src/screens/DreamJourneyScreen.test.tsx src/screens/TemptingOfferScreen.test.tsx
npm run typecheck
```

If a listed test file does not exist, run the closest existing test file for that screen plus `npm run typecheck`.

Expected: all available targeted tests PASS, and typecheck PASS.

- [ ] **Step 7: Commit and push**

Run:

```bash
git add src/screens/TransfigurationSiteScreen.tsx src/screens/DuplicationSiteScreen.tsx src/screens/DreamJourneyScreen.tsx src/screens/TemptingOfferScreen.tsx src/state/journey-context.tsx src/state/multiplayer-journey-context.tsx src/screens/*.test.tsx
git commit -m "Share generated site choice runtime" -m "Move transfiguration, duplication, Dream Journey, and Tempting Offer generated choices into shared site runtime with composed completion writes."
git push
```

Expected: commit succeeds and pushes.

---

### Task 16: Action Log Helpers And Bounded Log Maintenance

**Files:**
- Modify: `src/multiplayer/room-types.ts`
- Create: `src/multiplayer/action-log.test.ts`
- Create: `src/multiplayer/action-log.ts`
- Modify: `src/state/multiplayer-journey-context.tsx`
- Test: `npm test -- src/multiplayer/action-log.test.ts`

- [ ] **Step 1: Write action log tests**

Create `src/multiplayer/action-log.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ActionLogEntry } from "./room-types";
import { buildActionLogEntry, pruneActionLog } from "./action-log";

describe("action log helpers", () => {
  it("creates an action log entry", () => {
    expect(
      buildActionLogEntry({
        actorId: "client-1",
        action: "pickDraftCard",
        source: "draft_pick",
        summary: { cardNumber: 101 },
        timestamp: "2026-05-08T12:00:00.000Z",
      }),
    ).toEqual({
      actorId: "client-1",
      action: "pickDraftCard",
      source: "draft_pick",
      summary: { cardNumber: 101 },
      timestamp: "2026-05-08T12:00:00.000Z",
    });
  });

  it("keeps the newest entries when pruning", () => {
    const entries: Record<string, ActionLogEntry> = {};
    for (let index = 0; index < 55; index += 1) {
      entries[`action-${String(index)}`] = {
        actorId: "client-1",
        action: "test",
        source: "test",
        summary: { index },
        timestamp: `2026-05-08T12:00:${String(index).padStart(2, "0")}.000Z`,
      };
    }

    const pruned = pruneActionLog(entries, 50);

    expect(Object.keys(pruned)).toHaveLength(50);
    expect(pruned["action-0"]).toBeUndefined();
    expect(pruned["action-54"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/multiplayer/action-log.test.ts
```

Expected: FAIL because `action-log.ts` does not exist.

- [ ] **Step 3: Implement action log helpers**

Create `src/multiplayer/action-log.ts`:

```ts
import { ACTION_LOG_LIMIT, type ActionLogEntry } from "./room-types";

export function buildActionLogEntry({
  actorId,
  action,
  source,
  summary,
  timestamp = new Date().toISOString(),
}: {
  actorId: string;
  action: string;
  source: string;
  summary: Record<string, unknown>;
  timestamp?: string;
}): ActionLogEntry {
  return {
    actorId,
    action,
    source,
    summary,
    timestamp,
  };
}

export function pruneActionLog(
  entries: Record<string, ActionLogEntry>,
  limit = ACTION_LOG_LIMIT,
): Record<string, ActionLogEntry> {
  return Object.fromEntries(
    Object.entries(entries)
      .sort(([, left], [, right]) => left.timestamp.localeCompare(right.timestamp))
      .slice(-limit),
  );
}
```

- [ ] **Step 4: Use helper in provider**

In `src/state/multiplayer-journey-context.tsx`, replace inline action log entries with:

```ts
import { buildActionLogEntry } from "../multiplayer/action-log";
```

Use:

```ts
[`rooms/${session.roomId}/actionLog/${crypto.randomUUID()}`]: buildActionLogEntry({
  timestamp: now,
  actorId: session.clientId,
  action: "pickDraftCard",
  source: "draft_pick",
  summary: { siteId, cardNumber },
}),
```

For bounded maintenance, after each room snapshot arrives in `MultiplayerRoomGate` or a room-level hook, prune only when `Object.keys(room.actionLog ?? {}).length > ACTION_LOG_LIMIT + 10` by writing the pruned object to `rooms/<roomId>/actionLog`. Add a test if the pruning hook is implemented outside the provider.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/multiplayer/action-log.test.ts src/state/multiplayer-journey-context.test.tsx
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 6: Commit and push**

Run:

```bash
git add src/multiplayer/action-log.ts src/multiplayer/action-log.test.ts src/multiplayer/room-types.ts src/state/multiplayer-journey-context.tsx src/multiplayer/MultiplayerRoomGate.tsx
git commit -m "Add bounded action log helpers" -m "Centralize multiplayer action log entry creation and keep room diagnostics bounded while journeyState remains the rendering source of truth."
git push
```

Expected: commit succeeds and pushes.

---

### Task 17: Firebase Setup Docs And Manual QA Checklist

**Files:**
- Create: `docs/journey_prototype/firebase_multiplayer.md`
- Modify: `README.md`
- Test: `npm run build`

- [ ] **Step 1: Add Firebase multiplayer docs**

Create `docs/journey_prototype/firebase_multiplayer.md`:

```markdown
# Firebase Multiplayer

The V2 journey prototype uses Firebase Realtime Database for shared journey rooms
and Firebase Hosting for deployed share links.

## Environment

Copy `.env.example` to `.env.local` and fill in the Firebase web app values:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`

## Database Rules

The prototype uses open room data for low-friction remote testing:

```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": true
    }
  }
}
```

## Local Testing

Run:

```bash
npm start
```

Open `http://localhost:5173/`, create a game, then open the generated
`?game=<roomId>` URL in a second browser window.

## Manual Two-Window QA

1. Create a room in the first window.
2. Open the share URL in a second window.
3. Pick a DreamAvatar in either window and verify both windows enter the same
   dreamscape.
4. Open a draft site, pick a card in one window, and verify the other window
   shows the updated deck and next offer.
5. Trigger an essence-changing action in one window while taking a different
   shared action in the other window, then verify both changes are present.
6. Open a reward, shop, Dreamsign, or essence site and verify both windows show
   the same revealed result.
7. Refresh both windows and verify they reload the room state.
8. Reset the journey and verify both windows return to the shared start state.

## Deploy

Run:

```bash
npm run build
firebase deploy
```

Firebase Hosting serves `dist/` and rewrites all routes to `index.html`, so
share links with `?game=<roomId>` load the app shell.
```

- [ ] **Step 2: Link docs from README**

Add to `README.md` under Other Commands or Layout:

```markdown
Firebase multiplayer setup and two-window QA live in
`docs/journey_prototype/firebase_multiplayer.md`.
```

- [ ] **Step 3: Run final checks**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all commands PASS.

- [ ] **Step 4: Commit and push**

Run:

```bash
git add docs/journey_prototype/firebase_multiplayer.md README.md
git commit -m "Document Firebase multiplayer setup" -m "Add Firebase environment, database rules, Hosting deploy, and two-window QA guidance for the multiplayer journey prototype."
git push
```

Expected: commit succeeds and pushes.

---

### Task 18: End-To-End Manual Verification

**Files:**
- No source files expected unless verification finds defects
- Test: browser QA with two windows

- [ ] **Step 1: Start the app**

Run:

```bash
npm start
```

Expected: Vite serves `http://localhost:5173/`.

- [ ] **Step 2: Create and join a game**

Open `http://localhost:5173/`, click Create Game, copy the resulting URL, and open it in a second browser window.

Expected: both windows show the same room and compact presence count.

- [ ] **Step 3: Verify shared journey start**

Pick a Dream Avatar in one window.

Expected: both windows enter the same dreamscape with the same deck, Dream Avatar, atlas, and draft state.

- [ ] **Step 4: Verify shared draft**

Open a Draft site and pick a card in one window.

Expected: the other window shows the picked card in the deck and the next shared offer.

- [ ] **Step 5: Verify independent concurrent writes**

In one window, perform an essence-changing action. In the other window, perform a different shared action such as draft pick or site completion.

Expected: both resulting changes are present after Firebase sync settles.

- [ ] **Step 6: Verify shared random reveals**

Open one shop, one reward, one Dreamsign, and one essence site across the two windows.

Expected: both windows show identical revealed choices/results for each site.

- [ ] **Step 7: Verify refresh recovery**

Refresh both windows.

Expected: both windows reload the latest room state.

- [ ] **Step 8: Verify reset**

Reset the journey in one window.

Expected: both windows return to the shared start state for the same room.

- [ ] **Step 9: Commit and push any verification fixes**

If verification required fixes, run:

```bash
git add <fixed-files>
git commit -m "Fix multiplayer manual QA findings" -m "Address issues found during two-window Firebase multiplayer verification."
git push
```

If verification required no fixes, do not create an empty commit.
