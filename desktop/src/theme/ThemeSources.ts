import type { ThemeDescriptor, ThemeSource } from './ThemeRegistry';
import { parseTheme, type ThemeDefinition } from './ThemeDefinition';

export interface WorkspaceThemePort {
  list(): Promise<readonly ThemeDescriptor[]>;
  load(uri: string): Promise<unknown>;
}

export interface ThemeSourceDependencies {
  readonly builtins: readonly unknown[];
  readonly workspace: WorkspaceThemePort;
}

class BuiltinThemeSource implements ThemeSource {
  private readonly definitions = new Map<string, ThemeDefinition>();

  constructor(definitions: readonly unknown[]) {
    for (const value of definitions) {
      const theme = parseTheme(value);
      const uri = `silan://themes/${theme.id}`;
      if (this.definitions.has(uri)) throw new Error(`Duplicate built-in theme: ${uri}`);
      this.definitions.set(uri, theme);
    }
  }

  async list(): Promise<readonly ThemeDescriptor[]> {
    return [...this.definitions].map(([uri, theme]) => ({ uri, name: theme.name }));
  }

  async load(uri: string): Promise<unknown> {
    const theme = this.definitions.get(uri);
    if (!theme) throw new Error(`Unknown built-in theme: ${uri}`);
    return theme;
  }
}

class WorkspaceThemeSource implements ThemeSource {
  constructor(private readonly port: WorkspaceThemePort) {}
  list(): Promise<readonly ThemeDescriptor[]> { return this.port.list(); }
  load(uri: string): Promise<unknown> { return this.port.load(uri); }
}

export const createBuiltinThemeSource = ({ builtins }: ThemeSourceDependencies): ThemeSource =>
  new BuiltinThemeSource(builtins);

export const createWorkspaceThemeSource = ({ workspace }: ThemeSourceDependencies): ThemeSource =>
  new WorkspaceThemeSource(workspace);
