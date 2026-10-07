Upstream: https://github.com/Yi-luo-hua/obsidian-adjustable-media

Pinned commit: f344ce1f2da2d059d7b3570a7b01021833ba1d5c (0.7.1).
MIT license, Copyright (c) 2026 Yi-luo-hua. See LICENSE.

Pure format, model, geometry, Markdown and command planning modules are vendored unchanged with their upstream tests. Obsidian UI/runtime dependencies are not included. Desktop integration is owned by the parent media module.

`guide.json` contains the upstream English/Chinese guides and their four local
media assets, encoded without content edits so the guide works offline. The
Desktop adapter imports working-copy assets through its ordinary media owner.
