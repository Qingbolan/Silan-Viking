import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

// Hand-curated browser globals used by this codebase.
// We avoid the `globals` package because some published versions ship keys
// containing trailing whitespace (e.g. "AudioWorkletGlobalScope "), which
// ESLint v9 strictly rejects.
const browserGlobals = {
  // Window & DOM
  window: 'readonly',
  document: 'readonly',
  console: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  history: 'readonly',
  HTMLElement: 'readonly',
  HTMLDivElement: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLTextAreaElement: 'readonly',
  HTMLButtonElement: 'readonly',
  HTMLAnchorElement: 'readonly',
  HTMLImageElement: 'readonly',
  HTMLCanvasElement: 'readonly',
  Element: 'readonly',
  Node: 'readonly',
  Event: 'readonly',
  KeyboardEvent: 'readonly',
  MouseEvent: 'readonly',
  TouchEvent: 'readonly',
  CustomEvent: 'readonly',
  // Storage & networking
  fetch: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  Headers: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  FormData: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  // Async & timers
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  queueMicrotask: 'readonly',
  // Observers
  IntersectionObserver: 'readonly',
  ResizeObserver: 'readonly',
  MutationObserver: 'readonly',
  PerformanceObserver: 'readonly',
  // Encoding & WebAPIs
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  crypto: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  // Graphics & media
  Image: 'readonly',
  HTMLVideoElement: 'readonly',
  HTMLAudioElement: 'readonly',
  WebGL2RenderingContext: 'readonly',
  WebGLRenderingContext: 'readonly',
  // Modern features
  matchMedia: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  scrollTo: 'readonly',
  getComputedStyle: 'readonly',
}

const nodeGlobals = {
  console: 'readonly',
  process: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  __dirname: 'readonly',
}

export default [
  {
    ignores: ['dist', 'node_modules'],
  },
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs', '*.config.{js,mjs,ts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: nodeGlobals,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: browserGlobals,
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // TypeScript resolves DOM/type globals and understands declarations;
      // the core JS rules report false positives for both.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
      // Context and design-system modules intentionally export colocated
      // hooks/constants; this does not affect runtime refresh correctness.
      'react-refresh/only-export-components': 'off',
    },
  },
]
