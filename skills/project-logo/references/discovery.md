# Where tools look for a project icon

`motion-kit icon` writes the files marked ✓.

| Tool | Path(s) | Format | Notes |
|------|---------|--------|-------|
| **Conductor** (conductor.build) | first match of: `public/apple-touch-icon.png`, `apple-touch-icon.png`, `public/favicon.svg`, `favicon.svg`, `public/favicon.png`, `public/icon.png`, `public/logo.png`, `favicon.png`, `app/icon.png`, `src/app/icon.png`, `public/favicon.ico`, `favicon.ico`, `app/favicon.ico`, `static/favicon.ico`, `src-tauri/icons/icon.png`, ✓ `assets/icon.png`, `src/assets/icon.png` | PNG / SVG / ICO | From Conductor's FAQ. An earlier match wins, so a web app's favicon beats `assets/icon.png`. Overridable per machine: right-click repo → *Change icon*. |
| **JetBrains IDEs** (IntelliJ, WebStorm, Rider…) | ✓ `.idea/icon.svg`, ✓ `.idea/icon_dark.svg` | SVG only | Shown on the Welcome screen / recent projects / project switcher. Set via Welcome screen → right-click → *Change Project Icon*, which writes `.idea/icon.svg`. The `_dark` variant follows JetBrains' icon convention; confirm in your IDE version. Commit by re-including it if `.idea/` is ignored. |
| **GitHub README** | ✓ `assets/icon-animated.svg`, ✓ `assets/icon.svg` | SVG | `<img src="assets/icon-animated.svg" width="112">`. The animation plays once in the README. |
| **GitHub avatar / social preview** | n/a | PNG | Not read from the repo: upload in Settings. Avatar from `assets/icon.png` (≥ 512); social preview 1280×640. |
| **Web app favicon** | `public/favicon.svg` | SVG | Not written by default: copy `assets/icon.svg` there if the project serves a site (Conductor will then prefer it). |
| **VS Code / Cursor** | n/a | | No per-project icon convention. |

Sources: https://www.conductor.build/docs/faq ·
https://www.jetbrains.com/help/idea/open-close-and-move-projects.html
