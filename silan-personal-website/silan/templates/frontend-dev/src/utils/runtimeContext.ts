export const isPrerenderRuntime = (): boolean =>
  typeof window !== 'undefined' &&
  Boolean((window as unknown as { __SILAN_PRERENDER__?: boolean }).__SILAN_PRERENDER__);
