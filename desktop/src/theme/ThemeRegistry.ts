import { themeAddress } from './ThemeAddress';

export interface ThemeDescriptor {
  readonly uri: string;
  readonly name: string;
}

export interface ThemeSource {
  list(): Promise<readonly ThemeDescriptor[]>;
  load(uri: string): Promise<unknown>;
}

export type ThemeSourceFactory<Context> = (context: Context) => ThemeSource;

/** Registration happens only in the composition root; a built registry is immutable.
 * Factories receive explicit dependencies and create session-scoped sources, never globals.
 */
export class ThemeRegistry<Context> {
  private readonly factories: ReadonlyMap<string, ThemeSourceFactory<Context>>;

  constructor(registrations: readonly (readonly [string, ThemeSourceFactory<Context>])[]) {
    const factories = new Map<string, ThemeSourceFactory<Context>>();
    for (const [id, factory] of registrations) {
      if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`Invalid theme source: ${id}`);
      if (factories.has(id)) throw new Error(`Duplicate theme source: ${id}`);
      factories.set(id, factory);
    }
    this.factories = factories;
  }

  create(context: Context): ThemeCatalog {
    return new ThemeCatalog([...this.factories.values()].map(factory => factory(context)));
  }
}

/** A catalog binds each discovered URI to exactly one source. Collisions are errors. */
export class ThemeCatalog {
  private owners = new Map<string, ThemeSource>();
  private readonly sources: readonly ThemeSource[];
  private discovery: Promise<readonly ThemeDescriptor[]> | null = null;

  constructor(sources: readonly ThemeSource[]) { this.sources = [...sources]; }

  list(): Promise<readonly ThemeDescriptor[]> {
    if (!this.discovery) {
      this.discovery = this.discover().finally(() => { this.discovery = null; });
    }
    return this.discovery;
  }

  private async discover(): Promise<readonly ThemeDescriptor[]> {
    const listings = await Promise.all(this.sources.map(source => source.list()));
    const owners = new Map<string, ThemeSource>();
    const entries: ThemeDescriptor[] = [];
    listings.forEach((listing, index) => {
      for (const entry of listing) {
        if (themeAddress(entry.uri).uri !== entry.uri) throw new Error(`Theme registration requires a package address: ${entry.uri}`);
        if (owners.has(entry.uri)) throw new Error(`Duplicate theme URI: ${entry.uri}`);
        owners.set(entry.uri, this.sources[index]);
        entries.push(Object.freeze({ ...entry }));
      }
    });
    this.owners = owners;
    return Object.freeze(entries);
  }

  load(uri: string): Promise<unknown> {
    uri = themeAddress(uri).uri;
    const source = this.owners.get(uri);
    if (!source) return Promise.reject(new Error(`Theme is not registered: ${uri}`));
    return source.load(uri);
  }
}
