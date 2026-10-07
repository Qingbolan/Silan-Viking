import contract from './token-contract.json';

export interface ThemeDefinition {
  readonly schema_version: 1;
  readonly id: string;
  readonly name: string;
  readonly appearance: 'light' | 'dark';
  readonly tokens: Readonly<Record<string, string>>;
}

export const themeTokenNames: readonly string[] = Object.freeze(Object.keys(contract));
export const themeTokenProperties: Readonly<Record<string, string>> = Object.freeze(contract);

/** Theme packages are data, not arbitrary stylesheets or executable extensions. */
export function parseTheme(value: unknown): ThemeDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid theme document');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !['schema_version', 'id', 'name', 'appearance', 'tokens'].includes(key))) {
    throw new Error('Unknown theme field');
  }
  if (data.schema_version !== 1) throw new Error('Unsupported theme schema version');
  if (typeof data.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(data.id)) throw new Error('Invalid theme id');
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 100) throw new Error('Invalid theme name');
  if (data.appearance !== 'light' && data.appearance !== 'dark') throw new Error('Invalid theme appearance');
  if (!data.tokens || typeof data.tokens !== 'object' || Array.isArray(data.tokens)) throw new Error('Missing theme tokens');
  const tokens = data.tokens as Record<string, unknown>;
  if (Object.keys(tokens).length !== themeTokenNames.length || Object.keys(tokens).some(key => !themeTokenNames.includes(key))) {
    throw new Error('Theme must define exactly the supported token contract');
  }
  const parsed: Record<string, string> = {};
  for (const name of themeTokenNames) {
    const token = tokens[name];
    if (typeof token !== 'string' || !token.trim() || token.length > 4096 || /[;{}<>\\@]|url\s*\(|\/\*/i.test(token)) {
      throw new Error(`Invalid theme token: ${name}`);
    }
    parsed[name] = token;
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (name: string) => {
    if (visiting.has(name)) throw new Error(`Cyclic theme token: ${name}`);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const match of parsed[name].matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (!(match[1] in parsed)) throw new Error(`Unknown token reference: ${match[1]}`);
      visit(match[1]);
    }
    visiting.delete(name);
    visited.add(name);
    parsed[name] = parsed[name].replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, reference: string) => parsed[reference]);
    if (parsed[name].length > 4096) throw new Error(`Expanded theme token is too large: ${name}`);
    if (/var\s*\(/i.test(parsed[name])) throw new Error(`Use a complete token reference without a fallback: ${name}`);
  };
  themeTokenNames.forEach(visit);
  return Object.freeze({ schema_version: 1, id: data.id, name: data.name,
    appearance: data.appearance, tokens: Object.freeze(parsed) });
}
