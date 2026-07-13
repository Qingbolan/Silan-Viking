/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_BASE?: string;
  readonly VITE_PUBLIC_ORIGIN?: string;
  readonly VITE_API_ORIGIN?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_BUILD_SOURCEMAP?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
