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

## CI Status
![CI](https://github.com/mikedamoiseau/ebook-reader/actions/workflows/ci.yml/badge.svg)

## License
MIT
