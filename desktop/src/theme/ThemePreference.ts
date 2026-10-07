import { themeAddress } from './ThemeAddress';
import { parseSidebarOverrides, type SidebarOverrides } from './SidebarAppearance';

export interface ThemeSelection { readonly uri: string; readonly sidebars: SidebarOverrides }
export interface ThemePreference { read(): ThemeSelection | null; write(selection: ThemeSelection): void }

/** One versioned, atomic device preference. The previous URI-only key is migrated once. */
export class LocalThemePreference implements ThemePreference {
  constructor(private readonly storage: () => Storage) {}
  read(): ThemeSelection | null {
    const storage = this.storage();
    const saved = storage.getItem('silan.desktop.appearance');
    if (saved !== null) {
      const data = JSON.parse(saved);
      if (!data || data.version !== 1 || Object.keys(data).some(key => !['version', 'uri', 'sidebars'].includes(key))) throw new Error('Unsupported appearance preferences');
      return Object.freeze({ uri: themeAddress(data.uri).uri, sidebars: parseSidebarOverrides(data.sidebars) });
    }
    const previous = storage.getItem('silan.desktop.theme');
    if (!previous) return null;
    const selection = { uri: themeAddress(previous).uri, sidebars: {} };
    this.write(selection);
    storage.removeItem('silan.desktop.theme');
    return selection;
  }
  write(selection: ThemeSelection): void {
    const uri = themeAddress(selection.uri).uri;
    const sidebars = parseSidebarOverrides(selection.sidebars);
    const storage = this.storage();
    storage.setItem('silan.desktop.appearance', JSON.stringify({ version: 1, uri, sidebars }));
    // The new durable record is authoritative before the obsolete key is removed.
  }
}
