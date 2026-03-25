# Changelog

All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-03-25

### Added
- EPUB 2 & 3 import via file picker and drag-and-drop (Tauri v2 native events)
- Library screen with book grid, cover art, reading progress indicator
- Search/filter books by title or author
- Remove books from library with confirmation
- Reader screen with chapter navigation (buttons + keyboard shortcuts)
- Table of Contents sidebar
- Reading progress auto-saved to SQLite and restored on reopen
- Light / dark theme toggle with system preference detection
- Adjustable font size (14–24px) and font family (serif/sans-serif)
- XSS sanitization of EPUB HTML via `ammonia`
- Duplicate EPUB detection (UNIQUE constraint on file path)
- GitHub Actions CI/CD: lint, test, cross-platform release builds
