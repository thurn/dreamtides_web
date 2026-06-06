import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import type { Database } from "firebase/database";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FirebaseConfigError,
  getFirebaseApp,
  getFirebaseDatabase,
  readFirebaseConfig,
} from "./app-config";

interface MockFirebaseApp extends FirebaseApp {
  options: FirebaseOptions;
}

const firebaseMocks = vi.hoisted(() => {
  const apps = new Map<string, MockFirebaseApp>();
  const databases = new Map<string, Database>();

  return {
    apps,
    databases,
    connectDatabaseEmulator: vi.fn(),
    getApp: vi.fn((name: string = "[DEFAULT]") => {
      const app = apps.get(name);
      if (app === undefined) {
        throw new Error(`Missing app ${name}`);
      }
      return app;
    }),
    getApps: vi.fn(() => Array.from(apps.values())),
    getDatabase: vi.fn((app: FirebaseApp) => {
      const existing = databases.get(app.name);
      if (existing !== undefined) {
        return existing;
      }

      const database = { app } as Database;
      databases.set(app.name, database);
      return database;
    }),
    initializeApp: vi.fn((options: FirebaseOptions, name: string = "[DEFAULT]") => {
      const app = { name, options } as MockFirebaseApp;
      apps.set(name, app);
      return app;
    }),
  };
});

vi.mock("firebase/app", () => ({
  getApp: firebaseMocks.getApp,
  getApps: firebaseMocks.getApps,
  initializeApp: firebaseMocks.initializeApp,
}));

vi.mock("firebase/database", () => ({
  connectDatabaseEmulator: firebaseMocks.connectDatabaseEmulator,
  getDatabase: firebaseMocks.getDatabase,
}));

const completeEnv = {
  VITE_FIREBASE_API_KEY: "api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "quest.example.firebaseapp.com",
  VITE_FIREBASE_DATABASE_URL: "https://quest.example.firebaseio.com",
  VITE_FIREBASE_PROJECT_ID: "quest-example",
  VITE_FIREBASE_APP_ID: "1:123:web:abc",
  VITE_FIREBASE_STORAGE_BUCKET: "quest.example.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123",
};

beforeEach(() => {
  firebaseMocks.apps.clear();
  firebaseMocks.databases.clear();
  vi.clearAllMocks();
});

describe("readFirebaseConfig", () => {
  it("maps Vite Firebase env values to Firebase config", () => {
    expect(readFirebaseConfig(completeEnv)).toEqual({
      apiKey: "api-key",
      authDomain: "quest.example.firebaseapp.com",
      databaseURL: "https://quest.example.firebaseio.com",
      projectId: "quest-example",
      appId: "1:123:web:abc",
      storageBucket: "quest.example.appspot.com",
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
      authDomain: "quest.example.firebaseapp.com",
      databaseURL: "https://quest.example.firebaseio.com",
      projectId: "quest-example",
      appId: "1:123:web:abc",
    });
  });

  it("throws a typed error listing missing required keys", () => {
    expect(() =>
      readFirebaseConfig({
        VITE_FIREBASE_API_KEY: "",
        VITE_FIREBASE_AUTH_DOMAIN: "quest.example.firebaseapp.com",
        VITE_FIREBASE_DATABASE_URL: "",
        VITE_FIREBASE_PROJECT_ID: "quest-example",
        VITE_FIREBASE_APP_ID: "1:123:web:abc",
      }),
    ).toThrow(FirebaseConfigError);

    try {
      readFirebaseConfig({
        VITE_FIREBASE_API_KEY: "",
        VITE_FIREBASE_AUTH_DOMAIN: "quest.example.firebaseapp.com",
        VITE_FIREBASE_DATABASE_URL: "",
        VITE_FIREBASE_PROJECT_ID: "quest-example",
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

describe("getFirebaseApp", () => {
  it("creates a named demo app for emulator mode without env config", () => {
    const app = getFirebaseApp("emulator", {});

    expect(app.name).toBe("quest-prototype-emulator");
    expect(firebaseMocks.initializeApp).toHaveBeenCalledWith(
      {
        apiKey: "demo-api-key",
        authDomain: "demo-quest-prototype.firebaseapp.com",
        databaseURL: "https://demo-quest-prototype.firebaseio.com",
        projectId: "demo-quest-prototype",
        appId: "demo-app-id",
      },
      "quest-prototype-emulator",
    );
  });

  it("creates a named realtime app from Vite env config", () => {
    const app = getFirebaseApp("realtime", completeEnv);

    expect(app.name).toBe("quest-prototype-realtime");
    expect(firebaseMocks.initializeApp).toHaveBeenCalledWith(
      {
        apiKey: "api-key",
        authDomain: "quest.example.firebaseapp.com",
        databaseURL: "https://quest.example.firebaseio.com",
        projectId: "quest-example",
        appId: "1:123:web:abc",
        storageBucket: "quest.example.appspot.com",
        messagingSenderId: "123",
      },
      "quest-prototype-realtime",
    );
  });

  it("requires env config only for realtime mode", () => {
    expect(() => getFirebaseApp("emulator", {})).not.toThrow();
    expect(() => getFirebaseApp("realtime", {})).toThrow(FirebaseConfigError);
  });
});

describe("getFirebaseDatabase", () => {
  it("connects the emulator database once per database instance", () => {
    const first = getFirebaseDatabase("emulator", {});
    const second = getFirebaseDatabase("emulator", {});

    expect(first).toBe(second);
    expect(firebaseMocks.connectDatabaseEmulator).toHaveBeenCalledTimes(1);
    expect(firebaseMocks.connectDatabaseEmulator).toHaveBeenCalledWith(
      first,
      "127.0.0.1",
      9000,
    );
  });

  it("uses Vite emulator host and port overrides", () => {
    const database = getFirebaseDatabase("emulator", {
      VITE_FIREBASE_DATABASE_EMULATOR_HOST: "localhost",
      VITE_FIREBASE_DATABASE_EMULATOR_PORT: "9100",
    });

    expect(firebaseMocks.connectDatabaseEmulator).toHaveBeenCalledWith(
      database,
      "localhost",
      9100,
    );
  });

  it("rejects invalid emulator port overrides", () => {
    expect(() =>
      getFirebaseDatabase("emulator", {
        VITE_FIREBASE_DATABASE_EMULATOR_PORT: "not-a-port",
      }),
    ).toThrow("Invalid Firebase database emulator port: not-a-port");
  });

  it("does not attach the emulator in realtime mode", () => {
    getFirebaseDatabase("realtime", completeEnv);

    expect(firebaseMocks.connectDatabaseEmulator).not.toHaveBeenCalled();
  });
});
