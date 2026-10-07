import { planWrapSelection } from './upstream/src/commands/plans';
import { applyLineChanges } from './upstream/src/layout/edits';
export type MediaSettings = { autoConvert: boolean; uiLanguage: 'auto' | 'en' | 'zh'; refLanguage: 'auto' | 'en' | 'zh'; wrapShortcut: string };
const key = 'silan.adjustable-media.v2';
export const defaultMediaSettings: MediaSettings = { autoConvert: false, uiLanguage: 'auto', refLanguage: 'auto', wrapShortcut: '' };
export function readMediaSettings(): MediaSettings {
  if (typeof localStorage === 'undefined') return defaultMediaSettings;
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    const language = (input: unknown): MediaSettings['uiLanguage'] => input === 'zh' || input === 'en' ? input : 'auto';
    return { autoConvert: value?.autoConvert === true,
      uiLanguage: language(value?.uiLanguage), refLanguage: language(value?.refLanguage),
      wrapShortcut: typeof value?.wrapShortcut === 'string' && /^[a-z0-9]$/i.test(value.wrapShortcut) ? value.wrapShortcut : '' };
  } catch { return { ...defaultMediaSettings }; }
}
export function saveMediaSettings(settings: MediaSettings) {
  localStorage.setItem(key, JSON.stringify(settings));
  window.dispatchEvent(new Event('silan-media-settings'));
}

export function autoLayoutImportedMarkdown(markdown: string, count: number): string {
  if (count < 2 || !readMediaSettings().autoConvert) return markdown;
  const lines = markdown.split('\n');
  const plan = planWrapSelection(lines, 0, lines.length - 1);
  return plan ? applyLineChanges(lines, [plan]).join('\n') : markdown;
}
