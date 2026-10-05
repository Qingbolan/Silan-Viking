# Page plugin template

This is an in-repository TypeScript/React template for a trusted, bundled desktop
page. It uses the host SDK at `desktop/src/plugins/PagePlugin.ts`. It is not a
standalone application or a runtime marketplace package.

## Try the template

From `desktop/`, run `npm ci`, then:

```sh
npm --prefix templates/page-plugin run check
```

Register it in `desktop/src/plugins/registry.ts`:

```ts
import { researchPagePlugin } from '../../templates/page-plugin';
export const pagePlugins = new PagePluginRegistry([researchPagePlugin]);
```

Run `npm run dev` in `desktop/` or rebuild the native application. The Research
entry opens the page; the top action returns to Dashboard. Back/forward navigation
also restores the page. Removing registration removes its navigation entry.

## Create a real plugin

Copy this directory to `desktop/plugins/your-plugin` (the relative SDK and tsconfig
paths still work), change the unique ID/title, and import that entry in the host
registry. Run its `check` script and the host build before installation.

`apiVersion: 1` is the plugin API compatibility version. `Page` and optional
`Actions` are React components. Context provides language and page/Dashboard
navigation. Use React effects with cleanup for subscriptions. Page-local state
is disposed when navigating away; persist drafts explicitly if required. The
example textarea is deliberately in-memory and does not save author content.

Content writes must use shared engine use cases through existing host adapters;
do not write derived databases or duplicate content rules. The current interface
does not grant a generic filesystem or command-execution service. Compiled plugins
are trusted application code, not sandboxed extensions.

Registration rejects duplicate IDs and unsupported API versions. Pages are sorted
by `order` (default 0); equal orders retain registration order. An error boundary
contains rendering errors. Returning to the page remounts it; asynchronous failures
must be handled by the plugin itself.
