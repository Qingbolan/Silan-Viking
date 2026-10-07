import React from 'react';
import MarkdownEditor from '../../MarkdownEditor';
import { MediaEnvironmentProvider } from './MediaEnvironment';
import { readMediaSettings } from './MediaLayoutSettings';
import type { MediaWorkspacePort } from './MediaWorkspace';
export const loadMediaGuide = () => import('./upstream/guide.json').then(module => module.default);
type Guide = Awaited<ReturnType<typeof loadMediaGuide>>;
/** Offline upstream guide. Source paths remain untouched; assets resolve in this scope. */
export function MediaGuide() {
  const [guide, setGuide] = React.useState<Guide | null>(null);
  React.useEffect(() => { let active = true; void loadMediaGuide().then(value => { if (active) setGuide(value); }); return () => { active = false; }; }, []);
  const workspace = React.useMemo<MediaWorkspacePort>(() => ({
    resolveMedia: async (_path, targets) => targets.map(target => {
      const asset = guide?.assets.find(item => target === `./assets/${item.name}`);
      return asset ? `data:${asset.type};base64,${asset.base64}` : null;
    }),
    previewCleanup: async () => [],
    applyCleanup: async () => ({ applied: [], skipped: [] }),
  }), [guide]);
  if (!guide) return <p role="status">Loading…</p>;
  const language = readMediaSettings().uiLanguage;
  const source = language === 'zh' || (language === 'auto' && navigator.language.startsWith('zh')) ? guide.zh : guide.en;
  return <MediaEnvironmentProvider workspace={workspace} sourcePath="offline-guide.md"><MarkdownEditor value={source} readOnly toolbarVisible={false} onChange={() => {}} ariaLabel="Adjustable Media guide" /><details><summary>Adjustable Media · MIT · Yi-luo-hua</summary><pre>{guide.license}</pre></details></MediaEnvironmentProvider>;
}
