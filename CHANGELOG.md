# Changelog

All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-03-28

### Added
- **Dual-page spread / Manga mode** — side-by-side two-page view for all formats (CBZ, CBR, PDF, EPUB). Cover page displayed solo, subsequent pages paired. Manga mode swaps page order and arrow key direction for RTL reading. Toggle in reader header and Settings > Page Layout.
- **Series grouping** — books with series metadata are automatically grouped in the sidebar and via a "Series" sort option in the library grid, sorted by volume.
- **Custom user fonts** — import TTF/OTF/WOFF2 font files via Settings. Custom fonts appear alongside built-in options in the font picker.
- **Literata font** — added as a built-in reading font (designed by Google for e-reading).
- **Bookmark naming & editing** — name bookmarks via an expanding toast after creation (`B` key), or edit names inline in the bookmarks panel.

### Changed
- **Settings panel reorganized** — grouped into fewer accordions: Appearance (theme + custom CSS), Text & Typography (font size + font + line height/margins/etc.), Page Layout (paginated/continuous + dual-page + manga).

### Fixed
- Clipboard copy and JSON export for collection sharing
- Page-based bookmark progress calculation for CBZ/CBR/PDF

## [1.1.0] - 2026-03-26

### Added
- **CBR format support** — RAR-based comic book archives
- **PDF support** — page-by-page rendering via bundled pdfium
- **CBZ cover extraction** — first page used as cover thumbnail
- **Page viewer** — unified component for PDF/CBZ/CBR with zoom (0.5×–4×), pan, and keyboard/mouse wheel navigation
- **Collections** — manual and automated collections with sidebar, drag-and-drop, custom icons and colors, export as Markdown/JSON
- **Sort & filter** — sort by date added, title, author, last read, progress, rating, format; filter by format, status, rating
- **Tags** — freeform labels with autocomplete
- **Highlights & annotations** — inline text highlighting (5 colors) with notes, export as Markdown
- **Book metadata editing** — edit title, author, cover, series, language, publisher, year, tags
- **Keyboard shortcuts** — library and reader shortcuts with `?` help overlay
- **Focus mode** — hide all UI chrome with `D`, edge-reveal controls, auto-hide cursor
- **Page zoom** — Ctrl+scroll or Cmd+/- to zoom, pan when zoomed, reset on page change
- **Mouse wheel navigation** — scroll to turn pages in PDF/CBZ/CBR (300ms debounce)
- **Copy-on-import** — books copied into managed library folder with configurable path
- **Multi-file import** — bulk file picker with progress indicator
- **Bulk folder import** — recursive scan for supported formats
- **Remote file import** — import from URL (direct download)
- **OPDS catalog browsing** — browse Project Gutenberg, Standard Ebooks, and custom OPDS catalogs with search, navigation, and one-click download
- **Library export/backup** — metadata-only or full backup as ZIP, import from backup
- **Remote backup** — incremental sync to S3 and FTP via OpenDAL
- **Reading stats dashboard** — time spent reading, pages/chapters per day, books finished, reading streaks, 30-day bar chart
- **OpenLibrary integration** — pull descriptions, genres, ratings; auto-match by title+author
- **Auto-enrichment** — ISBN lookup, title+author search, filename parsing, background scan queue with progress and cancel
- **Multi-provider enrichment** — EnrichmentProvider trait, Google Books API provider, provider settings in Settings
- **ComicInfo.xml parsing** — extract metadata from CBZ comic archives
- **Recently opened** — top 5 most recently read books shown at library top
- **Share collections** — export as Markdown or JSON
- **Book recommendations** — Discover section with popular books from configured OPDS catalogs
- **Multiple profiles** — separate libraries, each with own database, library folder, and settings
- **Sepia theme** — warm parchment preset alongside light and dark
- **Custom color themes** — pick background + text color, auto-derive remaining tokens
- **OpenDyslexic font** — bundled accessibility font with weighted letterforms
- **Star ratings** — 1-5 star rating per book, sort and filter by rating
- **Full-text search** — Cmd/Ctrl+F to search EPUB content with highlighted matches
- **Advanced typography** — line height, page margins, text alignment, paragraph spacing, hyphenation
- **Custom CSS override** — inject CSS into EPUB rendering
- **Continuous scroll mode** — all EPUB chapters in one scrollable document
- **Estimated time to finish** — WPM-based reading time estimate in EPUB reader footer
- **Activity log** — persistent log of all data-changing operations, filterable in Settings

### Fixed
- Path traversal prevention in cover image extraction
- Cover image extension allowlisting
- DOMPurify removed (redundant with ammonia backend sanitization)
- Bookmarks table index for query performance
- Chapter index and scroll position validation
- Scroll restoration tied to specific chapter to prevent race conditions
- Keyboard handler conflicts between reader and panels
- Focus outlines and disabled button contrast (accessibility)
- User-friendly error messages for backend failures
- Book file existence validation before reading
- Loading overlay during import to prevent race conditions
- Focus trap and ARIA attributes on TOC sidebar
- Font size slider accessibility (aria-valuetext)
- Base64 image encoding replaced with asset protocol to prevent memory issues
- EPUB zip archive caching to avoid reopening on every page turn
- DB connection pool size and timeout configuration
- Book import timeout/size guard

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
