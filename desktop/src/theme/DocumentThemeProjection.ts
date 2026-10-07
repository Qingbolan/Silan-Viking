import { sidebarProjection } from './SidebarProjection';
import type { SidebarOverrides } from './SidebarAppearance';
import { themeTokenProperties, type ThemeDefinition } from './ThemeDefinition';
import type { ThemeProjection } from './ThemeSession';

export class DocumentThemeProjection implements ThemeProjection {
  constructor(private readonly document: Document) {}

  apply(theme: ThemeDefinition, sidebars: SidebarOverrides): void {
    for (const [name, value] of Object.entries(theme.tokens)) {
      if (!CSS.supports(themeTokenProperties[name], value)) throw new Error(`Unsupported value for theme token: ${name}`);
    }
    // Prepare the entire rule before replacing the active stylesheet. Invalid input
    // never clears the last valid projection or leaves a partly updated palette.
    const css = `:root { color-scheme: ${theme.appearance}; ${Object.entries(theme.tokens)
      .map(([name, value]) => `${name}: ${value};`).join('\n')} }`;
    const style = this.document.createElement('style');
    style.id = 'silan-active-theme';
    style.textContent = css + sidebarProjection(sidebars);
    const old = this.document.getElementById(style.id);
    if (old) old.replaceWith(style);
    else this.document.head.append(style);
    this.document.documentElement.classList.toggle('dark', theme.appearance === 'dark');
    this.document.documentElement.dataset.theme = theme.id;
  }
}
