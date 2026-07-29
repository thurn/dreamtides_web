/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FUZZ_TEST?: string;
  readonly VITE_BUILD_GIT_SHA: string;
}
