# frontend/ — React SPA

React 18 + TypeScript + Vite + Tailwind. Components are organized by feature
under `src/components/` (`Resume/`, `BlogStack/`, `ProjectGallery/`,
`IdeaPage/`, …). Dev server runs on **http://localhost:3000** (`vite.config.ts`),
proxying `/api` to the Go backend on `:5200`.

When changing UI: match the existing component patterns, run `npm run build`
to verify, and keep i18n (`src/i18n/`, English + Chinese) in sync.

## Visual debugging — see the rendered page

The frontend is a React SPA: `curl` and a plain fetch only ever see an empty
HTML shell, because the page is built by JavaScript in the browser. To check
what a page *actually looks like* after a UI change — and to let an agent
inspect its own work — render it in a real headless browser and read the PNG:

```bash
cd frontend
npm install                     # once — pulls puppeteer
npm run dev                     # dev server on http://localhost:3000
node scripts/screenshot.mjs http://localhost:3000/contact out.png
```

Then `Read` `out.png` to see the real rendered result.

Options (see the header of `scripts/screenshot.mjs` for the full list):

- `--full-page` — capture the whole scrollable page, not just the viewport
- `--selector=<css>` — wait for an element before shooting (e.g. `--selector=main`)
- `--width=<n>` / `--height=<n>` — viewport size (default 1440×900)
- `--wait=<ms>` — extra settle time after network idle (default 400)

The script waits for network idle plus a React-paint beat, so data-driven
pages (resume, blog, project galleries) are fully populated in the shot.
Exit code 0 on success, 1 with a reason on stderr. Reach for this whenever a
UI change needs visual confirmation rather than just a passing build.
