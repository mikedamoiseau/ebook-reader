# Ebook Reader

A cross-platform desktop ebook reader built with Tauri v2 (Rust) and React.

## Features
- Import EPUB 2 & 3 files via file picker or drag-and-drop
- Library management with search and duplicate detection
- Chapter navigation with Table of Contents sidebar
- Reading progress auto-saved across sessions
- Light / dark theme and adjustable font size
- XSS-safe HTML rendering

## Tech Stack
- **Backend:** Rust, Tauri v2, SQLite (rusqlite), ammonia
- **Frontend:** React, TypeScript, Vite, Tailwind CSS

## Requirements
- [Tauri prerequisites](https://tauri.app/start/prerequisites/)
- Node.js 18+
- Rust (stable)

## Development
```bash
npm install
npm run tauri dev
```

## Build
```bash
npm run tauri build
```

## Installation

Pre-built binaries are on the [GitHub Releases page](https://github.com/mikedamoiseau/ebook-reader/releases).

### macOS — Gatekeeper "damaged" warning

Because this app is not code-signed or notarized with an Apple Developer certificate, macOS 14+ may refuse to open it with a _"damaged and can't be opened"_ error.

**One-time fix — run this in Terminal after installing:**

```bash
xattr -cr /Applications/ebook-reader.app
```

Then double-click the app as normal. You only need to do this once per install.

## CI Status
![CI](https://github.com/mikedamoiseau/ebook-reader/actions/workflows/ci.yml/badge.svg)

## License
MIT
