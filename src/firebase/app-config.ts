import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";
import {
  connectDatabaseEmulator,
  getDatabase,
  type Database,
} from "firebase/database";
import type { DatabaseMode } from "../runtime/runtime-config";

export interface FirebaseRuntimeEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_DATABASE_URL?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_DATABASE_EMULATOR_HOST?: string;
  readonly VITE_FIREBASE_DATABASE_EMULATOR_PORT?: string;
}

const REQUIRED_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_DATABASE_URL",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const satisfies readonly (keyof FirebaseRuntimeEnv)[];

type RequiredFirebaseConfigKey = (typeof REQUIRED_KEYS)[number];

const EMULATOR_PROJECT_ID = "demo-journey-prototype";
const EMULATOR_APP_NAME = "journey-prototype-emulator";
const REALTIME_APP_NAME = "journey-prototype-realtime";
const EMULATOR_DATABASE_HOST = "127.0.0.1";
const EMULATOR_DATABASE_PORT = 9000;
const connectedEmulatorDatabases = new WeakSet<Database>();

function browserFirebaseRuntimeEnv(): FirebaseRuntimeEnv {
  const runtimeEnv: unknown = import.meta.env;
  if (typeof runtimeEnv !== "object" || runtimeEnv === null) return {};
  const stringValue = (key: keyof FirebaseRuntimeEnv): string | undefined => {
    const value: unknown = Reflect.get(runtimeEnv, key);
    return typeof value === "string" ? value : undefined;
  };
  return {
    VITE_FIREBASE_API_KEY: stringValue("VITE_FIREBASE_API_KEY"),
    VITE_FIREBASE_AUTH_DOMAIN: stringValue("VITE_FIREBASE_AUTH_DOMAIN"),
    VITE_FIREBASE_DATABASE_URL: stringValue("VITE_FIREBASE_DATABASE_URL"),
    VITE_FIREBASE_PROJECT_ID: stringValue("VITE_FIREBASE_PROJECT_ID"),
    VITE_FIREBASE_APP_ID: stringValue("VITE_FIREBASE_APP_ID"),
    VITE_FIREBASE_STORAGE_BUCKET: stringValue("VITE_FIREBASE_STORAGE_BUCKET"),
    VITE_FIREBASE_MESSAGING_SENDER_ID: stringValue(
      "VITE_FIREBASE_MESSAGING_SENDER_ID",
    ),
    VITE_FIREBASE_DATABASE_EMULATOR_HOST: stringValue(
      "VITE_FIREBASE_DATABASE_EMULATOR_HOST",
    ),
    VITE_FIREBASE_DATABASE_EMULATOR_PORT: stringValue(
      "VITE_FIREBASE_DATABASE_EMULATOR_PORT",
    ),
  };
}

const EMULATOR_FIREBASE_CONFIG: FirebaseOptions = {
  apiKey: "demo-api-key",
  authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
  databaseURL: `https://${EMULATOR_PROJECT_ID}.firebaseio.com`,
  projectId: EMULATOR_PROJECT_ID,
  appId: "demo-app-id",
};

export class FirebaseConfigError extends Error {
  readonly missingKeys: RequiredFirebaseConfigKey[];

  constructor(missingKeys: readonly RequiredFirebaseConfigKey[]) {
    super(`Missing Firebase config: ${missingKeys.join(", ")}`);
    this.name = "FirebaseConfigError";
    this.missingKeys = [...missingKeys];
  }
}

function present(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

function readEmulatorDatabaseHost(env: FirebaseRuntimeEnv): string {
  return present(env.VITE_FIREBASE_DATABASE_EMULATOR_HOST)
    ? env.VITE_FIREBASE_DATABASE_EMULATOR_HOST
    : EMULATOR_DATABASE_HOST;
}

function readEmulatorDatabasePort(env: FirebaseRuntimeEnv): number {
  if (!present(env.VITE_FIREBASE_DATABASE_EMULATOR_PORT)) {
    return EMULATOR_DATABASE_PORT;
  }

  const port = Number(env.VITE_FIREBASE_DATABASE_EMULATOR_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid Firebase database emulator port: ${env.VITE_FIREBASE_DATABASE_EMULATOR_PORT}`,
    );
  }

  return port;
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

function getNamedApp(name: string, options: FirebaseOptions): FirebaseApp {
  if (getApps().some((app) => app.name === name)) {
    return getApp(name);
  }

  return initializeApp(options, name);
}

export function getFirebaseApp(
  mode: DatabaseMode = "emulator",
  env: FirebaseRuntimeEnv = browserFirebaseRuntimeEnv(),
): FirebaseApp {
  if (mode === "emulator") {
    return getNamedApp(EMULATOR_APP_NAME, EMULATOR_FIREBASE_CONFIG);
  }

  return getNamedApp(REALTIME_APP_NAME, readFirebaseConfig(env));
}

export function getFirebaseDatabase(
  mode: DatabaseMode = "emulator",
  env: FirebaseRuntimeEnv = browserFirebaseRuntimeEnv(),
): Database {
  const database = getDatabase(getFirebaseApp(mode, env));

  if (mode === "emulator" && !connectedEmulatorDatabases.has(database)) {
    connectDatabaseEmulator(
      database,
      readEmulatorDatabaseHost(env),
      readEmulatorDatabasePort(env),
    );
    connectedEmulatorDatabases.add(database);
  }

  return database;
}
