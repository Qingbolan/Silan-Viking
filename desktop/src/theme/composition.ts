import { invoke, isTauri } from '@tauri-apps/api/core';
import { LocalThemePreference } from './ThemePreference';
import paper from './paper.json';
import sand from './sand.json';
import { parseTheme } from './ThemeDefinition';
import { ThemeRegistry, type ThemeDescriptor } from './ThemeRegistry';
import { ThemeSession } from './ThemeSession';
import { DocumentThemeProjection } from './DocumentThemeProjection';
import { createBuiltinThemeSource, createWorkspaceThemeSource, type ThemeSourceDependencies } from './ThemeSources';

// Factory functions are registered once here. No side-effect registration,
// mutable singleton container, service lookup from components, or theme-name switches.
export function createThemeSession(document: Document, storage: () => Storage): ThemeSession {
  const registry = new ThemeRegistry<ThemeSourceDependencies>([
    ['builtin', createBuiltinThemeSource],
    ...(isTauri() ? [['workspace', createWorkspaceThemeSource] as const] : []),
  ]);
  const catalog = registry.create({
    builtins: [paper, sand],
    workspace: {
      list: () => invoke<ThemeDescriptor[]>('list_themes'),
      load: uri => invoke<unknown>('load_theme', { uri }),
    },
  });
  return new ThemeSession(catalog, new DocumentThemeProjection(document), new LocalThemePreference(storage), 'silan://themes/paper', parseTheme(paper));
}
