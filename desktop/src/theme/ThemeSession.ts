import { parseTheme, type ThemeDefinition } from './ThemeDefinition';
import type { ThemeCatalog, ThemeDescriptor } from './ThemeRegistry';
import { themeAddress } from './ThemeAddress';

import type { ThemePreference } from './ThemePreference';
import { parseSidebarStyle, parseSidebarOverrides, sidebarDefaults, type SidebarOverrides, type SidebarStyle, type SidebarTarget } from './SidebarAppearance';
export interface ThemeProjection { apply(theme: ThemeDefinition, sidebars: SidebarOverrides): void }
export type ThemeState = Readonly<{
  phase: 'ready' | 'loading' | 'previewing' | 'failed';
  sidebars: SidebarOverrides;
  appliedUri: string;
  displayedUri: string;
  entries: readonly ThemeDescriptor[];
  error: string | null;
}>;

/** Owns the preview transaction. Only commit persists a choice; failed loads never project.
 * A generation invalidates stale async replies, including replies after cancel.
 */
export class ThemeSession {
  private generation = 0;
  private appliedSidebars: SidebarOverrides = Object.freeze({});
  private applied: ThemeDefinition;
  private displayed: ThemeDefinition;
  private state: ThemeState;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly catalog: ThemeCatalog, private readonly projection: ThemeProjection,
    private readonly preference: ThemePreference, initialUri: string, initial: ThemeDefinition) {
    this.applied = this.displayed = initial;
    this.state = Object.freeze({ phase: 'ready', sidebars: this.appliedSidebars, appliedUri: initialUri, displayedUri: initialUri, entries: [], error: null });
    projection.apply(initial, this.appliedSidebars);
  }

  getSnapshot = (): ThemeState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  async initialize(): Promise<void> {
    const initialGeneration = this.generation;
    await this.refresh();
    if (initialGeneration !== this.generation) return;
    try {
      const selection = this.preference.read();
      if (selection) {
        const restoreGeneration = this.generation + 1;
        await this.previewSelection(selection.uri, parseSidebarOverrides(selection.sidebars));
        if (this.generation === restoreGeneration && this.state.phase === 'previewing') {
          this.applied = this.displayed;
          this.appliedSidebars = this.state.sidebars;
          this.set({ phase: 'ready', appliedUri: this.state.displayedUri, error: null });
        }
      }
    } catch (error) { this.fail(error); }
  }

  async refresh(): Promise<void> {
    try {
      const entries = await this.catalog.list();
      this.set({ entries, ...(this.state.phase === 'failed'
        ? { phase: this.displayed === this.applied && this.state.sidebars === this.appliedSidebars ? 'ready' : 'previewing', error: null } as const
        : {}) });
    }
    catch (error) { this.fail(error); }
  }

  async preview(uri: string): Promise<void> {
    return this.previewSelection(uri, this.state.sidebars);
  }

  private async previewSelection(uri: string, sidebars: SidebarOverrides): Promise<void> {
    const generation = ++this.generation;
    this.set({ phase: 'loading', error: null });
    try {
      const address = themeAddress(uri);
      const theme = parseTheme(await this.catalog.load(address.uri));
      if (generation !== this.generation) return;
      if (theme.id !== address.id) throw new Error('Theme id must match its package address');
      this.projection.apply(theme, sidebars);
      this.displayed = theme;
      this.set({ phase: 'previewing', sidebars, displayedUri: address.uri });
    } catch (error) { if (generation === this.generation) this.fail(error); }
  }

  commit(): void {
    if (this.state.phase !== 'previewing') return;
    try {
      this.preference.write({ uri: this.state.displayedUri, sidebars: this.state.sidebars });
      this.appliedSidebars = this.state.sidebars;
      this.applied = this.displayed;
      this.set({ phase: 'ready', appliedUri: this.state.displayedUri, error: null });
    } catch (error) { this.fail(error); }
  }

  cancel(): void {
    ++this.generation;
    this.projection.apply(this.applied, this.appliedSidebars);
    this.displayed = this.applied;
    this.set({ phase: 'ready', sidebars: this.appliedSidebars, displayedUri: this.state.appliedUri, error: null });
  }

  sidebarStyle(target: SidebarTarget): SidebarStyle {
    return this.state.sidebars[target] ?? sidebarDefaults(this.displayed, target);
  }

  customizeSidebar(target: SidebarTarget, style: SidebarStyle | null): void {
    ++this.generation;
    try {
      const next = { ...this.state.sidebars };
      if (style === null) delete next[target];
      else next[target] = parseSidebarStyle(style);
      const sidebars = parseSidebarOverrides(next);
      this.projection.apply(this.displayed, sidebars);
      this.set({ sidebars, phase: 'previewing', error: null });
    } catch (error) { this.fail(error); }
  }

  private fail(error: unknown): void { this.set({ phase: 'failed', error: String(error) }); }
  private set(change: Partial<ThemeState>): void {
    this.state = Object.freeze({ ...this.state, ...change });
    for (const listener of this.listeners) listener();
  }
}
